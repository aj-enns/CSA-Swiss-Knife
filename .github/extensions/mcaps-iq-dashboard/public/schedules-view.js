/* ============================================================
 *  Schedules View — Cron job management for scheduled prompts
 *  CRUD UI for device-local cron schedules with live status.
 * ============================================================ */
(function () {
  'use strict';

  var container = null;
  var schedules = [];
  var pendingOnce = [];
  var loading = false;
  var error = null;
  var editingId = null;    // null = not editing, 'new' = creating, uuid = editing existing
  var formData = {};       // { name, cron, prompt, enabled }
  var cronValidation = null; // { valid, error, description }
  var cronValidateTimer = null;
  var showRunOnce = false; // quick-trigger panel visible
  var unsubscribe = null;

  // ── Cron presets for the quick-pick UI ─────────────────────

  var PRESETS = [
    { label: 'Weekday mornings 7am',  cron: '0 7 * * 1-5',  desc: 'Mon–Fri at 7:00 AM' },
    { label: 'Weekday mornings 8am',  cron: '0 8 * * 1-5',  desc: 'Mon–Fri at 8:00 AM' },
    { label: 'Every Monday 8am',      cron: '0 8 * * 1',    desc: 'Mondays at 8:00 AM' },
    { label: 'Every Friday 4pm',      cron: '0 16 * * 5',   desc: 'Fridays at 4:00 PM' },
    { label: 'Every 2 hours',         cron: '0 */2 * * *',  desc: 'On the hour, every 2h' },
    { label: 'Daily at midnight',     cron: '@daily',        desc: 'Every day at 12:00 AM' },
    { label: 'Hourly',                cron: '@hourly',       desc: 'Every hour at :00' }
  ];

  // ── Prompt suggestions (from common workflows) ─────────────

  var PROMPT_SUGGESTIONS = [
    { label: 'Morning Brief',         prompt: 'morning brief' },
    { label: 'Pipeline Review',       prompt: '/weekly' },
    { label: 'Milestone Review',      prompt: 'Review my milestones' },
    { label: 'Task Hygiene Check',    prompt: 'Check my task hygiene' },
    { label: 'Vault Sync',            prompt: 'vault sync' },
    { label: 'What Next',             prompt: '/what-next' }
  ];

  // ── Data loading ───────────────────────────────────────────

  function loadSchedules() {
    loading = true;
    error = null;
    render();

    Promise.all([
      fetch('/api/schedules').then(function (r) { return r.ok ? r.json() : Promise.reject('Failed to load schedules'); }),
      loadPendingOnce()
    ])
      .then(function (results) {
        schedules = results[0].schedules || [];
        loading = false;
        render();
      })
      .catch(function (err) {
        error = typeof err === 'string' ? err : err.message || 'Failed to load schedules';
        loading = false;
        render();
      });
  }

  // ── API calls ──────────────────────────────────────────────

  function createSchedule(payload) {
    return fetch('/api/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(handleJsonResponse);
  }

  function updateSchedule(id, payload) {
    return fetch('/api/schedules/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(handleJsonResponse);
  }

  function deleteSchedule(id) {
    return fetch('/api/schedules/' + id, { method: 'DELETE' })
      .then(handleJsonResponse);
  }

  function toggleSchedule(id, enabled) {
    return updateSchedule(id, { enabled: enabled });
  }

  function validateCronExpr(cron) {
    return fetch('/api/schedules/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cron: cron })
    }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }

  function triggerNow(id) {
    return fetch('/api/schedules/' + id + '/trigger', { method: 'POST' })
      .then(handleJsonResponse);
  }

  function createOnce(payload) {
    return fetch('/api/schedules/once', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(handleJsonResponse);
  }

  function loadPendingOnce() {
    return fetch('/api/schedules/once')
      .then(function (r) { return r.ok ? r.json().catch(function () { return { pending: [] }; }) : { pending: [] }; })
      .then(function (d) { pendingOnce = d.pending || []; });
  }

  function cancelOnce(id) {
    return fetch('/api/schedules/once/' + id, { method: 'DELETE' })
      .then(handleJsonResponse);
  }

  /**
   * Safely parse JSON from a fetch Response.
   * Returns the parsed body on success; rejects with an error string on failure.
   */
  function handleJsonResponse(r) {
    var contentType = r.headers.get('content-type') || '';
    if (r.ok) {
      if (contentType.indexOf('application/json') !== -1) return r.json();
      return r.text().then(function (t) { try { return JSON.parse(t); } catch (_) { return { ok: true }; } });
    }
    // Error path — try to extract JSON error message; fall back to status text
    if (contentType.indexOf('application/json') !== -1) {
      return r.json().then(function (e) { return Promise.reject(e.error || e.message || 'Request failed'); });
    }
    return Promise.reject('Server error ' + r.status + ' — is the dashboard server running the latest version?');
  }

  // ── Helpers ────────────────────────────────────────────────

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function relativeTime(iso) {
    if (!iso) return 'Never';
    var d = new Date(iso);
    var now = Date.now();
    var diff = d.getTime() - now;
    var absDiff = Math.abs(diff);
    var past = diff < 0;

    if (absDiff < 60000) return past ? 'Just now' : 'In < 1 min';
    if (absDiff < 3600000) {
      var mins = Math.round(absDiff / 60000);
      return past ? mins + 'm ago' : 'In ' + mins + 'm';
    }
    if (absDiff < 86400000) {
      var hrs = Math.round(absDiff / 3600000);
      return past ? hrs + 'h ago' : 'In ' + hrs + 'h';
    }
    var days = Math.round(absDiff / 86400000);
    return past ? days + 'd ago' : 'In ' + days + 'd';
  }

  function formatDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  // ── Render: Schedule list ──────────────────────────────────

  function renderScheduleCard(s) {
    var statusClass = s.enabled ? 'sched-status--active' : 'sched-status--paused';
    var statusLabel = s.enabled ? 'Active' : 'Paused';
    var nextRunText = s.enabled && s.nextRun ? relativeTime(s.nextRun) : '—';
    var nextRunFull = s.nextRun ? formatDate(s.nextRun) : '';
    var lastRunText = s.lastRun ? relativeTime(s.lastRun) : 'Never';
    var lastRunFull = s.lastRun ? formatDate(s.lastRun) : '';

    return `
      <div class="sched-card ${s.enabled ? '' : 'sched-card--disabled'}" data-id="${esc(s.id)}">
        <div class="sched-card__header">
          <div class="sched-card__left">
            <label class="sched-toggle" title="${s.enabled ? 'Pause' : 'Enable'}">
              <input type="checkbox" class="sched-toggle__input" data-action="toggle" data-id="${esc(s.id)}"
                     ${s.enabled ? 'checked' : ''} />
              <span class="sched-toggle__track"></span>
            </label>
            <div class="sched-card__info">
              <span class="sched-card__name">${esc(s.name)}</span>
              <span class="sched-card__cron" title="${esc(s.cron)}">${esc(s.cron)}</span>
            </div>
          </div>
          <div class="sched-card__right">
            <div class="sched-card__timing">
              <div class="sched-card__next" title="${esc(nextRunFull)}">
                <span class="sched-card__timing-label">Next</span>
                <span class="sched-card__timing-value">${esc(nextRunText)}</span>
              </div>
              <div class="sched-card__last" title="${esc(lastRunFull)}">
                <span class="sched-card__timing-label">Last</span>
                <span class="sched-card__timing-value">${esc(lastRunText)}</span>
              </div>
            </div>
            <span class="sched-status ${statusClass}">${statusLabel}</span>
            <div class="sched-card__actions">
              <button class="sched-btn sched-btn--icon sched-btn--run" data-action="trigger" data-id="${esc(s.id)}" title="Run Now">▶</button>
              <button class="sched-btn sched-btn--icon" data-action="edit" data-id="${esc(s.id)}" title="Edit">✏️</button>
              <button class="sched-btn sched-btn--icon sched-btn--danger" data-action="delete" data-id="${esc(s.id)}" title="Delete">🗑️</button>
            </div>
          </div>
        </div>
        <div class="sched-card__detail">
          <span class="sched-card__prompt" title="${esc(s.prompt)}">→ ${esc(s.prompt)}</span>
          <span class="sched-card__runs">${s.runCount || 0} runs</span>
        </div>
      </div>`;
  }

  // ── Render: Editor form ────────────────────────────────────

  function renderEditor() {
    var isNew = editingId === 'new';
    var title = isNew ? 'New Scheduled Job' : 'Edit Schedule';
    var f = formData;

    var presetOptions = PRESETS.map(function (p) {
      var sel = f.cron === p.cron ? 'selected' : '';
      return '<option value="' + esc(p.cron) + '" ' + sel + '>' + esc(p.label) + ' (' + esc(p.cron) + ')</option>';
    }).join('');

    var promptOptions = PROMPT_SUGGESTIONS.map(function (p) {
      return '<option value="' + esc(p.prompt) + '">' + esc(p.label) + '</option>';
    }).join('');

    var validationHtml = '';
    if (cronValidation) {
      if (cronValidation.valid) {
        validationHtml = '<div class="sched-cron-valid">✓ ' + esc(cronValidation.description) + '</div>';
      } else {
        validationHtml = '<div class="sched-cron-invalid">✕ ' + esc(cronValidation.error) + '</div>';
      }
    }

    return `
      <div class="sched-editor">
        <div class="sched-editor__header">
          <h3 class="sched-editor__title">${title}</h3>
          <button class="sched-btn sched-btn--icon" data-action="cancel-edit" title="Cancel">✕</button>
        </div>

        <div class="sched-editor__body">
          <div class="sched-field">
            <label class="sched-field__label" for="sched-name">Name</label>
            <input type="text" id="sched-name" class="sched-input" value="${esc(f.name || '')}"
                   placeholder="e.g., Morning Brief" />
          </div>

          <div class="sched-field">
            <label class="sched-field__label" for="sched-cron">Cron Expression</label>
            <div class="sched-cron-row">
              <input type="text" id="sched-cron" class="sched-input sched-input--mono" value="${esc(f.cron || '')}"
                     placeholder="0 7 * * 1-5" />
              <select id="sched-preset" class="sched-select">
                <option value="">Presets…</option>
                ${presetOptions}
              </select>
            </div>
            ${validationHtml}
            <div class="sched-cron-help">
              <code>minute hour day-of-month month day-of-week</code>
              <span class="sched-cron-help__example">e.g., <code>0 7 * * 1-5</code> = weekdays at 7 AM</span>
            </div>
          </div>

          <div class="sched-field">
            <label class="sched-field__label" for="sched-prompt">Prompt</label>
            <div class="sched-prompt-row">
              <input type="text" id="sched-prompt" class="sched-input" value="${esc(f.prompt || '')}"
                     placeholder="morning brief" />
              <select id="sched-prompt-preset" class="sched-select">
                <option value="">Suggestions…</option>
                ${promptOptions}
              </select>
            </div>
            <div class="sched-field__hint">The prompt text sent to the active Copilot CLI session</div>
          </div>

          <div class="sched-field sched-field--inline">
            <label class="sched-toggle" title="Enable/disable">
              <input type="checkbox" id="sched-enabled" class="sched-toggle__input"
                     ${f.enabled !== false ? 'checked' : ''} />
              <span class="sched-toggle__track"></span>
            </label>
            <span class="sched-field__label">Enabled</span>
          </div>
        </div>

        <div class="sched-editor__footer">
          <button class="sched-btn sched-btn--secondary" data-action="cancel-edit">Cancel</button>
          <button class="sched-btn sched-btn--primary" data-action="save">${isNew ? 'Create' : 'Save'}</button>
        </div>
      </div>`;
  }

  // ── Render: Run Once panel ──────────────────────────────────

  var DELAY_PRESETS = [
    { label: '5 min',  minutes: 5 },
    { label: '15 min', minutes: 15 },
    { label: '30 min', minutes: 30 },
    { label: '1 hour', minutes: 60 },
    { label: '2 hours', minutes: 120 },
    { label: '4 hours', minutes: 240 }
  ];

  function renderRunOncePanel() {
    var promptOptions = PROMPT_SUGGESTIONS.map(function (p) {
      return '<option value="' + esc(p.prompt) + '">' + esc(p.label) + '</option>';
    }).join('');

    var delayChips = DELAY_PRESETS.map(function (d) {
      return '<button class="sched-delay-chip" data-action="set-delay" data-minutes="' + d.minutes + '">' + esc(d.label) + '</button>';
    }).join('');

    return `
      <div class="sched-run-once">
        <div class="sched-run-once__header">
          <h3 class="sched-run-once__title">⚡ Quick Run — Fire a prompt on a delay</h3>
          <button class="sched-btn sched-btn--icon" data-action="hide-run-once" title="Close">✕</button>
        </div>
        <div class="sched-run-once__body">
          <div class="sched-field">
            <label class="sched-field__label" for="once-prompt">Prompt</label>
            <div class="sched-prompt-row">
              <input type="text" id="once-prompt" class="sched-input" placeholder="morning brief" />
              <select id="once-prompt-preset" class="sched-select">
                <option value="">Suggestions…</option>
                ${promptOptions}
              </select>
            </div>
          </div>
          <div class="sched-field">
            <label class="sched-field__label">Run in…</label>
            <div class="sched-delay-chips">${delayChips}</div>
            <div class="sched-delay-custom">
              <span class="sched-field__hint">Or set exact time:</span>
              <input type="number" id="once-delay-min" class="sched-input sched-input--tiny" placeholder="min" min="1" max="1440" />
              <span class="sched-field__hint">minutes from now</span>
            </div>
          </div>
        </div>
        <div class="sched-run-once__footer">
          <button class="sched-btn sched-btn--secondary" data-action="hide-run-once">Cancel</button>
          <button class="sched-btn sched-btn--accent" data-action="fire-once">⚡ Schedule</button>
        </div>
      </div>`;
  }

  function renderPendingOnce() {
    var rows = pendingOnce.map(function (p) {
      return `
        <div class="sched-pending-row">
          <span class="sched-pending-icon">⏳</span>
          <span class="sched-pending-name">${esc(p.name)}</span>
          <span class="sched-pending-prompt">→ ${esc(p.prompt)}</span>
          <span class="sched-pending-time" title="${esc(formatDate(p.runAt))}">${relativeTime(p.runAt)}</span>
          <button class="sched-btn sched-btn--icon sched-btn--danger" data-action="cancel-once" data-id="${esc(p.id)}" title="Cancel">✕</button>
        </div>`;
    }).join('');

    return `
      <div class="sched-pending-section">
        <h3 class="sched-pending-title">⏳ Pending One-Time Triggers</h3>
        ${rows}
      </div>`;
  }

  // ── Main render ────────────────────────────────────────────

  function render() {
    if (!container) return;

    var activeCount = schedules.filter(function (s) { return s.enabled; }).length;
    var headerHtml = `
      <div class="sched-page__header">
        <div class="sched-page__title-row">
          <h1 class="sched-page__title">⏰ Scheduled Jobs</h1>
          <div class="sched-page__summary">
            <span class="sched-summary-chip">${schedules.length} total</span>
            <span class="sched-summary-chip sched-summary-chip--active">${activeCount} active</span>
          </div>
        </div>
        <div class="sched-page__header-actions">
          <button class="sched-btn sched-btn--accent" data-action="show-run-once">
            ⚡ Run Once
          </button>
          <button class="sched-btn sched-btn--primary sched-add-btn" data-action="new">
            ＋ New Schedule
          </button>
        </div>
      </div>`;

    var bodyHtml = '';

    if (loading) {
      bodyHtml = '<div class="sched-loading"><div class="spinner"></div><p>Loading schedules…</p></div>';
    } else if (error) {
      bodyHtml = '<div class="sched-error"><p>⚠️ ' + esc(error) + '</p><button class="sched-btn sched-btn--secondary" data-action="retry">Retry</button></div>';
    } else if (editingId) {
      bodyHtml = renderEditor();
    } else if (schedules.length === 0) {
      bodyHtml = `
        <div class="sched-empty">
          <div class="sched-empty__icon">⏰</div>
          <h3 class="sched-empty__title">No scheduled jobs yet</h3>
          <p class="sched-empty__desc">
            Schedule prompts to run automatically — morning briefs, pipeline reviews,
            vault syncs, or any workflow on a cron timer.
          </p>
          <button class="sched-btn sched-btn--primary" data-action="new">Create First Schedule</button>
        </div>`;
    } else {
      bodyHtml = '<div class="sched-list">' + schedules.map(renderScheduleCard).join('') + '</div>';
    }

    // Run Once panel (shown between header and list when toggled)
    var runOnceHtml = '';
    if (showRunOnce && !editingId) {
      runOnceHtml = renderRunOncePanel();
    }

    // Pending one-time triggers
    var pendingHtml = '';
    if (pendingOnce.length > 0 && !editingId) {
      pendingHtml = renderPendingOnce();
    }

    container.innerHTML = '<div class="sched-page">' + headerHtml + runOnceHtml + pendingHtml + bodyHtml + '</div>';
    attachHandlers();
  }

  // ── Event handlers ─────────────────────────────────────────

  function attachHandlers() {
    if (!container) return;

    container.addEventListener('click', handleClick);
    container.addEventListener('change', handleChange);

    // Editor live-validation
    var cronInput = container.querySelector('#sched-cron');
    if (cronInput) {
      cronInput.addEventListener('input', function () {
        formData.cron = cronInput.value;
        debounceCronValidation(cronInput.value);
      });
    }

    var nameInput = container.querySelector('#sched-name');
    if (nameInput) {
      nameInput.addEventListener('input', function () { formData.name = nameInput.value; });
    }

    var promptInput = container.querySelector('#sched-prompt');
    if (promptInput) {
      promptInput.addEventListener('input', function () { formData.prompt = promptInput.value; });
    }

    var presetSelect = container.querySelector('#sched-preset');
    if (presetSelect) {
      presetSelect.addEventListener('change', function () {
        if (presetSelect.value) {
          formData.cron = presetSelect.value;
          var ci = container.querySelector('#sched-cron');
          if (ci) ci.value = formData.cron;
          debounceCronValidation(formData.cron);
        }
      });
    }

    var promptPreset = container.querySelector('#sched-prompt-preset');
    if (promptPreset) {
      promptPreset.addEventListener('change', function () {
        if (promptPreset.value) {
          formData.prompt = promptPreset.value;
          var pi = container.querySelector('#sched-prompt');
          if (pi) pi.value = formData.prompt;
          // Auto-fill name if empty
          var ni = container.querySelector('#sched-name');
          if (ni && !ni.value.trim()) {
            var match = PROMPT_SUGGESTIONS.find(function (s) { return s.prompt === promptPreset.value; });
            if (match) { ni.value = match.label; formData.name = match.label; }
          }
        }
      });
    }

    // Run Once prompt preset
    var oncePreset = container.querySelector('#once-prompt-preset');
    if (oncePreset) {
      oncePreset.addEventListener('change', function () {
        if (oncePreset.value) {
          var pi = container.querySelector('#once-prompt');
          if (pi) pi.value = oncePreset.value;
        }
      });
    }
  }

  function handleClick(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var id = btn.dataset.id;

    switch (action) {
      case 'new':
        editingId = 'new';
        formData = { name: '', cron: '', prompt: '', enabled: true };
        cronValidation = null;
        showRunOnce = false;
        render();
        break;

      case 'edit':
        var s = schedules.find(function (s) { return s.id === id; });
        if (s) {
          editingId = id;
          formData = { name: s.name, cron: s.cron, prompt: s.prompt, enabled: s.enabled };
          cronValidation = null;
          showRunOnce = false;
          debounceCronValidation(s.cron);
          render();
        }
        break;

      case 'cancel-edit':
        editingId = null;
        formData = {};
        cronValidation = null;
        render();
        break;

      case 'save':
        saveForm();
        break;

      case 'delete':
        if (confirm('Delete this scheduled job?')) {
          deleteSchedule(id).then(function () { loadSchedules(); });
        }
        break;

      case 'retry':
        loadSchedules();
        break;

      case 'trigger':
        btn.disabled = true;
        btn.textContent = '…';
        triggerNow(id)
          .then(function () {
            btn.textContent = '✓';
            setTimeout(function () { loadSchedules(); }, 800);
          })
          .catch(function (err) {
            btn.textContent = '▶';
            btn.disabled = false;
            alert('Trigger failed: ' + (typeof err === 'string' ? err : err.message || 'Unknown'));
          });
        break;

      case 'show-run-once':
        showRunOnce = true;
        render();
        break;

      case 'hide-run-once':
        showRunOnce = false;
        render();
        break;

      case 'set-delay':
        var mins = btn.dataset.minutes;
        var delayInput = container.querySelector('#once-delay-min');
        if (delayInput) delayInput.value = mins;
        // Highlight the selected chip
        container.querySelectorAll('.sched-delay-chip').forEach(function (c) {
          c.classList.toggle('sched-delay-chip--active', c === btn);
        });
        break;

      case 'fire-once':
        fireOnce();
        break;

      case 'cancel-once':
        cancelOnce(id)
          .then(function () { loadSchedules(); })
          .catch(function () { /* noop */ });
        break;
    }
  }

  function handleChange(e) {
    var el = e.target;
    if (el.dataset.action === 'toggle' && el.dataset.id) {
      toggleSchedule(el.dataset.id, el.checked)
        .then(function () { loadSchedules(); })
        .catch(function () { el.checked = !el.checked; });
    }

    // Editor enable toggle
    if (el.id === 'sched-enabled') {
      formData.enabled = el.checked;
    }
  }

  function saveForm() {
    // Read current form values (in case input events were missed)
    var nameEl = container.querySelector('#sched-name');
    var cronEl = container.querySelector('#sched-cron');
    var promptEl = container.querySelector('#sched-prompt');
    var enabledEl = container.querySelector('#sched-enabled');

    var payload = {
      name: (nameEl ? nameEl.value : formData.name || '').trim(),
      cron: (cronEl ? cronEl.value : formData.cron || '').trim(),
      prompt: (promptEl ? promptEl.value : formData.prompt || '').trim(),
      enabled: enabledEl ? enabledEl.checked : formData.enabled !== false
    };

    if (!payload.cron || !payload.prompt) {
      alert('Cron expression and prompt are required.');
      return;
    }

    if (!payload.name) payload.name = payload.prompt;

    var promise = editingId === 'new'
      ? createSchedule(payload)
      : updateSchedule(editingId, payload);

    promise
      .then(function () {
        editingId = null;
        formData = {};
        cronValidation = null;
        loadSchedules();
      })
      .catch(function (err) {
        alert('Failed: ' + (typeof err === 'string' ? err : err.message || 'Unknown error'));
      });
  }

  function fireOnce() {
    var promptEl = container.querySelector('#once-prompt');
    var delayEl = container.querySelector('#once-delay-min');
    var prompt = promptEl ? promptEl.value.trim() : '';
    var minutes = delayEl ? parseInt(delayEl.value, 10) : NaN;

    if (!prompt) { alert('Enter a prompt to run.'); return; }
    if (isNaN(minutes) || minutes < 1) { alert('Pick a delay (or type minutes).'); return; }

    createOnce({ prompt: prompt, name: prompt, delayMinutes: minutes })
      .then(function () {
        showRunOnce = false;
        loadSchedules();
      })
      .catch(function (err) {
        alert('Failed: ' + (typeof err === 'string' ? err : err.message || 'Unknown'));
      });
  }

  function debounceCronValidation(cron) {
    if (cronValidateTimer) clearTimeout(cronValidateTimer);
    if (!cron || !cron.trim()) {
      cronValidation = null;
      renderCronValidation();
      return;
    }
    cronValidateTimer = setTimeout(function () {
      validateCronExpr(cron.trim()).then(function (result) {
        cronValidation = result;
        renderCronValidation();
      });
    }, 400);
  }

  function renderCronValidation() {
    var el = container && container.querySelector('.sched-cron-valid, .sched-cron-invalid');
    var parent = container && container.querySelector('.sched-cron-row');
    if (!parent) return;

    // Remove existing
    if (el) el.remove();

    if (!cronValidation) return;

    var div = document.createElement('div');
    if (cronValidation.valid) {
      div.className = 'sched-cron-valid';
      div.textContent = '✓ ' + (cronValidation.description || 'Valid');
    } else {
      div.className = 'sched-cron-invalid';
      div.textContent = '✕ ' + (cronValidation.error || 'Invalid');
    }
    parent.insertAdjacentElement('afterend', div);
  }

  // ── WebSocket listeners for live updates ───────────────────

  function onWsEvent(type) {
    if (type === 'schedule:fired' || type === 'schedule:created' ||
        type === 'schedule:updated' || type === 'schedule:deleted' ||
        type === 'schedule:once:created' || type === 'schedule:once:cancelled') {
      if (!editingId) loadSchedules();
    }
  }

  // ── View lifecycle ─────────────────────────────────────────

  function mount(el) {
    container = el;
    unsubscribe = window.AppState.subscribe(onWsEvent);
    loadSchedules();
  }

  function unmount() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (container) { container.removeEventListener('click', handleClick); container.removeEventListener('change', handleChange); }
    container = null;
  }

  function onActivate() {
    if (schedules.length === 0 && !loading) loadSchedules();
  }

  window.schedulesView = { mount: mount, unmount: unmount, onActivate: onActivate };
})();
