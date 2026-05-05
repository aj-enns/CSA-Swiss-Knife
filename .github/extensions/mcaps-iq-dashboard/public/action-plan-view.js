/* ============================================================
 *  Action Plan View — Per-account next steps, talking points,
 *  and workshop/VBD/article suggestions from Teams + email
 *  Delegates to @mcaps which searches M365 for account context
 * ============================================================ */
(function () {
  'use strict';

  var container  = null;
  var accounts   = [];
  var loading    = false;
  var loadError  = null;
  var planStates = {}; // accountName → { status, timeframe, topic }

  var TIMEFRAME_OPTIONS = [
    { label: '7 days',  value: '7d',  days: 7  },
    { label: '30 days', value: '30d', days: 30 },
    { label: '90 days', value: '90d', days: 90 }
  ];

  // ── Helpers ──────────────────────────────────────────────

  function safeEsc(v) {
    if (!v && v !== 0) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getState(name) {
    if (!planStates[name]) {
      planStates[name] = { status: 'idle', timeframe: '30d', topic: '' };
    }
    return planStates[name];
  }

  function buildPrompt(accountName, topic, timeframe) {
    var tf = TIMEFRAME_OPTIONS.find(function (t) { return t.value === timeframe; });
    var days = tf ? tf.days : 30;
    var topicClause = topic && topic.trim()
      ? '\nFocus specifically on this topic: **' + topic.trim() + '**'
      : '';

    return '@mcaps For ' + accountName + ', search Teams chats and emails from the last ' + days + ' days.' +
      ' Identify the key technical topics and asks they\'ve raised.' + topicClause +
      '\n\nFor each topic generate a structured action plan with:' +
      '\n1. **Next steps** — 3–5 concrete actions I should take' +
      '\n2. **Talking points** — what to say on the next call' +
      '\n3. **Recommended workshops or VBDs** — ADS, Immersion Days, etc.' +
      '\n4. **Relevant resources** — Microsoft Learn articles, docs, or internal playbooks' +
      '\n\nFormat as a scannable prep sheet for my next meeting with this customer. --allow-all-tools';
  }

  // ── Data loading ─────────────────────────────────────────

  function loadAccounts() {
    loading   = true;
    loadError = null;
    accounts  = [];
    render();

    // Reuse job2-summary for account list — lightweight CRM call
    fetch('/api/crm/job2-summary')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) {
        var raw = json.accounts || json || [];
        accounts = Array.isArray(raw) ? raw : [];
        loading  = false;
        render();
      })
      .catch(function (err) {
        loadError = err.message || 'Failed to load accounts';
        loading   = false;
        render();
      });
  }

  // ── Render ────────────────────────────────────────────────

  function render() {
    if (!container) return;
    container.innerHTML = buildHTML();
    bindEvents();
  }

  function buildHTML() {
    var html = '<div class="ap-view">';

    // Header
    html += '<div class="ap-header">';
    html += '<div class="ap-header-left">';
    html += '<h2 class="ap-title">💡 Action Plan Generator</h2>';
    html += '<p class="ap-subtitle">Surface customer asks from Teams &amp; email — get next steps, talking points, and workshop suggestions per account.</p>';
    html += '</div>';
    html += '<button id="ap-refresh-btn" class="ap-btn ap-btn--ghost" title="Reload account list">⟳ Refresh</button>';
    html += '</div>';

    if (loading) {
      html += '<div class="ap-state"><span class="ap-spinner"></span> Loading accounts…</div>';
      html += '</div>';
      return html;
    }

    if (loadError) {
      html += '<div class="ap-state ap-state--error">⚠️ ' + safeEsc(loadError) +
              ' <button class="ap-btn ap-btn--ghost ap-retry-btn">Retry</button></div>';
      html += '</div>';
      return html;
    }

    if (!accounts.length) {
      html += '<div class="ap-state">No accounts found. <button class="ap-btn ap-btn--ghost ap-retry-btn">Retry</button></div>';
      html += '</div>';
      return html;
    }

    // Info banner
    html += '<div class="ap-info-banner">';
    html += '📌 Each plan is generated live by <strong>@mcaps</strong> which searches your Teams chats and emails for recent customer activity. ';
    html += 'Results appear in the Copilot session.';
    html += '</div>';

    // Account cards grid
    html += '<div class="ap-cards">';
    accounts.forEach(function (a) {
      var name  = a.accountName || a.name || a.customer || 'Unknown';
      var state = getState(name);
      html += buildAccountCard(name, state);
    });
    html += '</div>';

    html += '</div>'; // ap-view
    return html;
  }

  function buildAccountCard(name, state) {
    var html = '<div class="ap-card" data-account="' + safeEsc(name) + '">';

    html += '<div class="ap-card-header">';
    html += '<span class="ap-card-name">🏢 ' + safeEsc(name) + '</span>';
    html += '</div>';

    html += '<div class="ap-card-body">';

    // Topic input
    html += '<label class="ap-label" for="ap-topic-' + safeEsc(name) + '">Topic <span class="ap-hint">(optional — e.g. "function apps optimization")</span></label>';
    html += '<input class="ap-input ap-topic-input" id="ap-topic-' + safeEsc(name) + '"' +
            ' data-account="' + safeEsc(name) + '"' +
            ' placeholder="Leave blank to auto-detect from recent communications"' +
            ' value="' + safeEsc(state.topic) + '">';

    // Timeframe selector
    html += '<div class="ap-row">';
    html += '<label class="ap-label ap-label--inline">Timeframe:</label>';
    html += '<div class="ap-tabs">';
    TIMEFRAME_OPTIONS.forEach(function (opt) {
      var active = state.timeframe === opt.value ? ' ap-tab--active' : '';
      html += '<button class="ap-tab' + active + '"' +
              ' data-account="' + safeEsc(name) + '"' +
              ' data-tf="' + safeEsc(opt.value) + '">' + safeEsc(opt.label) + '</button>';
    });
    html += '</div>';
    html += '</div>'; // ap-row

    // Status + Generate button
    html += '<div class="ap-row ap-row--action">';
    var statusChip = '';
    if (state.status === 'running') {
      statusChip = '<span class="ap-chip ap-chip--running">⟳ Generating…</span>';
    } else if (state.status === 'done') {
      statusChip = '<span class="ap-chip ap-chip--done">✅ Plan sent to Copilot</span>';
    } else if (state.status === 'error') {
      statusChip = '<span class="ap-chip ap-chip--error">⚠️ Dispatch unavailable</span>';
    }
    html += statusChip;

    var btnDisabled = state.status === 'running' ? ' disabled' : '';
    var btnLabel    = state.status === 'running' ? '⟳ Generating…' : '💡 Generate Plan';
    html += '<button class="ap-btn ap-btn--generate ap-generate-btn"' +
            ' data-account="' + safeEsc(name) + '"' + btnDisabled + '>' +
            btnLabel + '</button>';
    html += '</div>'; // ap-row--action

    // Show prompt preview on hover via title attribute
    var promptPreview = buildPrompt(name, state.topic, state.timeframe);
    html += '<details class="ap-details">';
    html += '<summary class="ap-details-summary">Preview prompt</summary>';
    html += '<pre class="ap-prompt-preview">' + safeEsc(promptPreview) + '</pre>';
    html += '</details>';

    html += '</div>'; // ap-card-body
    html += '</div>'; // ap-card

    return html;
  }

  // ── Events ────────────────────────────────────────────────

  function bindEvents() {
    if (!container) return;

    var refreshBtn = container.querySelector('#ap-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { loadAccounts(); });

    var retryBtns = container.querySelectorAll('.ap-retry-btn');
    retryBtns.forEach(function (btn) {
      btn.addEventListener('click', function () { loadAccounts(); });
    });

    // Topic input — live update state + details preview
    var topicInputs = container.querySelectorAll('.ap-topic-input');
    topicInputs.forEach(function (input) {
      input.addEventListener('input', function () {
        var name = input.getAttribute('data-account');
        getState(name).topic = input.value;
        refreshDetailsPreview(name);
      });
    });

    // Timeframe tabs
    var tabs = container.querySelectorAll('.ap-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var name = tab.getAttribute('data-account');
        var tf   = tab.getAttribute('data-tf');
        getState(name).timeframe = tf;
        // Update active class without full re-render
        var siblings = container.querySelectorAll('.ap-tab[data-account="' + name + '"]');
        siblings.forEach(function (s) {
          s.classList.toggle('ap-tab--active', s.getAttribute('data-tf') === tf);
        });
        refreshDetailsPreview(name);
      });
    });

    // Generate buttons
    var generateBtns = container.querySelectorAll('.ap-generate-btn');
    generateBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name  = btn.getAttribute('data-account');
        var state = getState(name);
        var prompt = buildPrompt(name, state.topic, state.timeframe);

        state.status = 'running';
        btn.disabled = true;
        btn.textContent = '⟳ Generating…';

        if (window.dispatchCopilotAction) {
          window.dispatchCopilotAction(prompt, { suppressNav: true })
            .then(function () {
              state.status = 'done';
              render();
            })
            .catch(function () {
              state.status = 'error';
              render();
            });
        } else {
          // Fallback: show copyable prompt
          state.status = 'error';
          render();
          // Open a dialog with the prompt for manual use
          showFallbackDialog(name, prompt);
        }
      });
    });
  }

  function refreshDetailsPreview(accountName) {
    if (!container) return;
    var state   = getState(accountName);
    var card    = container.querySelector('.ap-card[data-account="' + accountName + '"]');
    if (!card) return;
    var pre = card.querySelector('.ap-prompt-preview');
    if (pre) pre.textContent = buildPrompt(accountName, state.topic, state.timeframe);
  }

  function showFallbackDialog(name, prompt) {
    var existing = document.getElementById('ap-fallback-dialog');
    if (existing) existing.remove();

    var dialog = document.createElement('div');
    dialog.id = 'ap-fallback-dialog';
    dialog.className = 'ap-dialog-overlay';
    dialog.innerHTML =
      '<div class="ap-dialog">' +
      '<div class="ap-dialog-header">' +
      '<span>💡 Run this prompt in Copilot</span>' +
      '<button class="ap-dialog-close ap-btn ap-btn--ghost">✕</button>' +
      '</div>' +
      '<p class="ap-dialog-hint">Paste this into the Copilot CLI to generate the action plan for <strong>' + safeEsc(name) + '</strong>:</p>' +
      '<textarea class="ap-dialog-prompt" readonly>' + safeEsc(prompt) + '</textarea>' +
      '<div class="ap-dialog-actions">' +
      '<button class="ap-btn ap-btn--primary ap-copy-btn">📋 Copy prompt</button>' +
      '<button class="ap-btn ap-btn--ghost ap-dialog-close">Close</button>' +
      '</div>' +
      '</div>';

    document.body.appendChild(dialog);

    dialog.querySelectorAll('.ap-dialog-close').forEach(function (btn) {
      btn.addEventListener('click', function () { dialog.remove(); });
    });
    var copyBtn = dialog.querySelector('.ap-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var ta = dialog.querySelector('.ap-dialog-prompt');
        if (ta) { ta.select(); document.execCommand('copy'); }
        copyBtn.textContent = '✅ Copied!';
        setTimeout(function () { copyBtn.textContent = '📋 Copy prompt'; }, 2000);
      });
    }
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) dialog.remove();
    });
  }

  // ── View lifecycle ────────────────────────────────────────

  window.actionPlanView = {
    mount: function (el) {
      container = el;
      if (!accounts.length && !loading) {
        loadAccounts();
      } else {
        render();
      }
    },
    unmount: function () {
      container = null;
    }
  };
})();
