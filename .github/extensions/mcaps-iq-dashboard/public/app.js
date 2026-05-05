/* ============================================================
 *  MCAPS IQ Dashboard — App Shell
 *  Global state, WebSocket connection, router init, nav controls.
 * ============================================================ */
(function () {
  'use strict';

  // ── Global App State ───────────────────────────────────────

  var listeners = new Set();

  var state = {
    sessions: {},
    activeSessionId: null,
    ui: {
      showCode: false,
      verbosity: 'normal'
    }
  };

  function emit(type, data) {
    listeners.forEach(function (cb) {
      try { cb(type, data, state); } catch (e) { /* swallow */ }
    });
  }

  function getState() { return state; }

  function subscribe(eventNameOrCb, maybeCb) {
    if (typeof eventNameOrCb === 'string' && typeof maybeCb === 'function') {
      var wrapped = function (type, data, s) { if (type === eventNameOrCb) maybeCb(data, s); };
      listeners.add(wrapped);
      return function () { listeners.delete(wrapped); };
    }
    if (typeof eventNameOrCb !== 'function') return function () {};
    listeners.add(eventNameOrCb);
    return function () { listeners.delete(eventNameOrCb); };
  }

  function ensureSession(sessionId) {
    if (!state.sessions[sessionId]) {
      state.sessions[sessionId] = {
        metadata: { startTime: Date.now(), status: 'active', lastSeen: Date.now() },
        responses: [],
        toolCalls: [],
        backgroundTasks: [],
        thinking: [],
        pendingApprovals: [],
        pendingUserInputs: [],
        session: {
          startTime: Date.now(),
          isIdle: true,
          errorCount: 0,
          turnCount: 0,
          responseCount: 0,
          taskCount: 0,
          currentIntent: null,
          title: null,
          derivedTitle: null,
          model: null,
          firstUserMessage: null,
          autoApprove: true
        }
      };
    }
    return state.sessions[sessionId];
  }

  function applyMessage(msg) {
    if (!msg || !msg.type) return;
    var sessionId = msg.sessionId;

    switch (msg.type) {
      case 'state:snapshot':
        if (msg.sessions) {
          state.sessions = msg.sessions;
          var ids = Object.keys(state.sessions);
          if (ids.length > 0 && !state.activeSessionId) {
            state.activeSessionId = ids[0];
          }
        }
        emit('state:snapshot', state);
        break;

      case 'session:new':
        ensureSession(sessionId);
        state.activeSessionId = sessionId;
        emit('session:new', { sessionId: sessionId });
        break;

      case 'session:end':
        if (state.sessions[sessionId]) {
          state.sessions[sessionId].metadata.status = 'ended';
          state.sessions[sessionId].metadata.endedAt = Date.now();
          state.sessions[sessionId].session.isIdle = true;
        }
        emit('session:end', { sessionId: sessionId });
        updateAttentionBar();
        break;

      case 'response': {
        var s1 = ensureSession(sessionId);
        s1.responses.push({ id: msg.id, timestamp: msg.timestamp || Date.now(), content: msg.content, agentName: msg.agentName, raw: msg.raw });
        s1.session.responseCount++;
        if (s1.responses.length > 200) s1.responses.shift();
        emit('response', { sessionId: sessionId });
        updateFooterCounts();
        break;
      }

      case 'tool:start': {
        var s2 = ensureSession(sessionId);
        s2.toolCalls.push({ id: msg.id, toolName: msg.toolName, detail: msg.detail, arguments: msg.arguments || null, startTime: msg.startTime || Date.now(), endTime: null, success: null, result: null });
        if (s2.toolCalls.length > 100) s2.toolCalls.shift();
        emit('tool:start', { sessionId: sessionId, toolName: msg.toolName });
        updateFooterCounts();
        break;
      }

      case 'tool:complete': {
        var s3 = ensureSession(sessionId);
        var tc = s3.toolCalls.find(function (t) { return t.id === msg.id; });
        if (tc) { tc.endTime = Date.now(); tc.success = msg.success !== false; tc.result = msg.result || null; }
        emit('tool:complete', { sessionId: sessionId, toolName: msg.toolName });
        updateFooterCounts();
        break;
      }

      case 'task:start': {
        var s4 = ensureSession(sessionId);
        s4.backgroundTasks.push({ id: msg.id, agentName: msg.agentName, description: msg.description, emoji: msg.emoji, startTime: msg.startTime, status: 'running' });
        s4.session.taskCount++;
        emit('task:start', { sessionId: sessionId });
        break;
      }

      case 'task:complete': {
        var s5 = ensureSession(sessionId);
        var task = s5.backgroundTasks.find(function (t) { return t.id === msg.id; });
        if (task) { task.status = msg.status || 'complete'; task.output = msg.output; task.endTime = Date.now(); }
        emit('task:complete', { sessionId: sessionId });
        break;
      }

      case 'thinking': {
        var s6 = ensureSession(sessionId);
        s6.thinking.push({ id: msg.id, content: msg.content, timestamp: msg.timestamp });
        if (s6.thinking.length > 50) s6.thinking.shift();
        emit('thinking', { sessionId: sessionId });
        break;
      }

      case 'thinking:delta': {
        var s7 = ensureSession(sessionId);
        var th = s7.thinking.find(function (t) { return t.id === msg.id; });
        if (th) th.content = (th.content || '') + (msg.deltaContent || '');
        emit('thinking:delta', { sessionId: sessionId });
        break;
      }

      case 'intent': {
        var s8 = ensureSession(sessionId);
        s8.session.currentIntent = msg.intent;
        emit('intent', { sessionId: sessionId, intent: msg.intent });
        break;
      }

      case 'session:idle': {
        var s9 = ensureSession(sessionId);
        s9.session.isIdle = true;
        emit('session:idle', { sessionId: sessionId });
        break;
      }

      case 'session:error': {
        var s10 = ensureSession(sessionId);
        s10.session.errorCount++;
        emit('session:error', { sessionId: sessionId, message: msg.message });
        updateFooterCounts();
        break;
      }

      case 'session:turn': {
        var s11 = ensureSession(sessionId);
        s11.session.turnCount++;
        s11.session.isIdle = false;
        emit('session:turn', { sessionId: sessionId });
        break;
      }

      // Schedule events (from cron scheduler)
      case 'schedule:fired':
      case 'schedule:created':
      case 'schedule:updated':
      case 'schedule:deleted':
      case 'schedule:once:created':
      case 'schedule:once:cancelled':
      case 'delegation:dispatched':
      case 'delegation:complete':
      case 'delegation:error':
        emit(msg.type, msg);
        break;

      case 'tool:approval-request': {
        var sa = ensureSession(sessionId);
        sa.pendingApprovals.push({
          toolCallId: msg.toolCallId,
          toolName: msg.toolName || null,
          kind: msg.kind || 'unknown',
          fileName: msg.fileName || null,
          commandText: msg.commandText || null,
          timestamp: msg.timestamp || Date.now(),
          status: 'pending'
        });
        if (sa.pendingApprovals.length > 50) sa.pendingApprovals.shift();
        emit('tool:approval-request', { sessionId: sessionId, toolCallId: msg.toolCallId });
        updateAttentionBar();
        break;
      }

      case 'tool:approval-resolved': {
        var sb = ensureSession(sessionId);
        var pa = sb.pendingApprovals.find(function (a) { return a.toolCallId === msg.toolCallId; });
        if (pa) pa.status = msg.decision || 'resolved';
        emit('tool:approval-resolved', { sessionId: sessionId, toolCallId: msg.toolCallId });
        updateAttentionBar();
        break;
      }

      case 'auto-approve:update': {
        var sc = ensureSession(sessionId);
        sc.session.autoApprove = !!msg.autoApprove;
        emit('auto-approve:update', { sessionId: sessionId, autoApprove: msg.autoApprove });
        break;
      }

      case 'session:stopped': {
        var sd = ensureSession(sessionId);
        sd.session.isIdle = true;
        emit('session:stopped', { sessionId: sessionId });
        break;
      }

      case 'user-input:request': {
        var se = ensureSession(sessionId);
        se.pendingUserInputs.push({
          requestId: msg.requestId,
          question: msg.question || '',
          choices: msg.choices || null,
          allowFreeform: msg.allowFreeform !== false,
          timestamp: msg.timestamp || Date.now(),
          status: 'pending'
        });
        if (se.pendingUserInputs.length > 20) se.pendingUserInputs.shift();
        emit('user-input:request', { sessionId: sessionId, requestId: msg.requestId });
        updateAttentionBar();
        break;
      }

      case 'user-input:resolved': {
        var sf = ensureSession(sessionId);
        var ui = sf.pendingUserInputs.find(function (u) { return u.requestId === msg.requestId; });
        if (ui) ui.status = 'answered';
        emit('user-input:resolved', { sessionId: sessionId, requestId: msg.requestId });
        updateAttentionBar();
        break;
      }
    }
  }

  window.AppState = {
    getState: getState,
    subscribe: subscribe,
    applyMessage: applyMessage,
    ensureSession: ensureSession,
    emit: emit
  };

  // ── Vault Customer Tracking ────────────────────────────────
  // Fetches vault-tracked customers once on startup. Views use
  // VaultCustomers.isTracked(name) to prioritize / badge.
  // The set includes both vault short names AND CRM legal names
  // (from frontmatter aliases) so matching works regardless of
  // which name the CRM API returns.

  var _vaultCustomers = null; // null = not fetched, [] = fetched but empty
  var _vaultCustomerSet = new Set(); // lowercased names + aliases for fast lookup
  var _vaultFetchPromise = null;

  function fetchVaultCustomers() {
    if (_vaultFetchPromise) return _vaultFetchPromise;
    _vaultFetchPromise = fetch('/api/vault/customers')
      .then(function (r) { return r.ok ? r.json() : { customers: [] }; })
      .then(function (data) {
        _vaultCustomers = data.customers || [];
        _vaultCustomerSet = new Set();
        _vaultCustomers.forEach(function (c) {
          _vaultCustomerSet.add(c.name.toLowerCase());
          // Index all aliases (including CRM legal names)
          if (Array.isArray(c.aliases)) {
            c.aliases.forEach(function (a) {
              _vaultCustomerSet.add(a.toLowerCase());
            });
          }
        });
        emit('vault:customers', _vaultCustomers);
        return _vaultCustomers;
      })
      .catch(function () {
        _vaultCustomers = [];
        _vaultCustomerSet = new Set();
        return [];
      });
    return _vaultFetchPromise;
  }

  // Auto-fetch on startup
  fetchVaultCustomers();

  window.VaultCustomers = {
    /** @returns {boolean} true if this customer name (or CRM alias) is tracked in the vault */
    isTracked: function (name) {
      if (!name || _vaultCustomerSet.size === 0) return false;
      return _vaultCustomerSet.has(name.toLowerCase());
    },
    /** @returns {string[]} list of tracked customer names */
    getNames: function () {
      return (_vaultCustomers || []).map(function (c) { return c.name; });
    },
    /** @returns {{ name, path, lastModified, opportunityCount, milestoneCount, hasTeam, aliases }[]} */
    getAll: function () { return _vaultCustomers || []; },
    /** @returns {boolean} true once fetch has completed */
    isLoaded: function () { return _vaultCustomers !== null; },
    /** @returns {Promise} resolves when data is loaded */
    ready: function () { return _vaultFetchPromise || Promise.resolve([]); },
    /** Force re-fetch */
    refresh: function () { _vaultFetchPromise = null; return fetchVaultCustomers(); }
  };

  // ── WebSocket Connection ───────────────────────────────────

  var ws = null;
  var reconnectDelay = 1000;
  var MAX_DELAY = 30000;
  var pingTimer = null;

  function connectWS() {
    var port = new URLSearchParams(window.location.search).get('port') || 3850;
    try {
      ws = new WebSocket('ws://127.0.0.1:' + port);
    } catch (e) {
      scheduleReconnect();
      return;
    }

    ws.onopen = function () {
      reconnectDelay = 1000;
      updateConnectionBadge(true);
      ws.send(JSON.stringify({ type: 'request:state' }));
      pingTimer = setInterval(function () {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    };

    ws.onmessage = function (event) {
      try {
        var msg = JSON.parse(event.data);
        if (msg.type === 'pong') return;
        applyMessage(msg);
      } catch (e) { /* ignore */ }
    };

    ws.onclose = function () {
      updateConnectionBadge(false);
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      scheduleReconnect();
    };

    ws.onerror = function () {
      updateConnectionBadge(false);
    };
  }

  function scheduleReconnect() {
    setTimeout(function () {
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
      connectWS();
    }, reconnectDelay);
  }

  function updateConnectionBadge(connected) {
    var badge = document.getElementById('connection-badge');
    if (!badge) return;
    badge.className = 'connection-badge ' + (connected ? 'badge-connected' : 'badge-disconnected');
    badge.querySelector('.conn-dot');
    badge.childNodes[badge.childNodes.length - 1].textContent = connected ? ' Connected' : ' Disconnected';
  }

  window.AppConnection = {
    _ws: null,
    send: function (msg) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    }
  };

  // ── Tool Approval Actions ──────────────────────────────────

  window.ToolApproval = {
    /** Send approve/deny decision for a pending tool call */
    respond: function (sessionId, toolCallId, decision) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: 'tool:approval-response',
        sessionId: sessionId,
        data: { toolCallId: toolCallId, decision: decision }
      }));
      // Optimistically update local state
      var s = state.sessions[sessionId];
      if (s) {
        var pa = s.pendingApprovals.find(function (a) { return a.toolCallId === toolCallId; });
        if (pa) pa.status = decision === 'approve' ? 'approved' : 'denied';
      }
      emit('tool:approval-resolved', { sessionId: sessionId, toolCallId: toolCallId, decision: decision });
      updateAttentionBar();
    },

    /** Toggle auto-approve for a session */
    setAutoApprove: function (sessionId, value) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: 'auto-approve:update',
        sessionId: sessionId,
        data: { autoApprove: !!value }
      }));
      // Optimistic update
      var s = state.sessions[sessionId];
      if (s) s.session.autoApprove = !!value;
      emit('auto-approve:update', { sessionId: sessionId, autoApprove: !!value });
    },

    /** Approve all pending approvals for a session */
    approveAll: function (sessionId) {
      var s = state.sessions[sessionId];
      if (!s) return;
      s.pendingApprovals.filter(function (a) { return a.status === 'pending'; }).forEach(function (a) {
        window.ToolApproval.respond(sessionId, a.toolCallId, 'approve');
      });
    },

    /** Deny all pending approvals for a session */
    denyAll: function (sessionId) {
      var s = state.sessions[sessionId];
      if (!s) return;
      s.pendingApprovals.filter(function (a) { return a.status === 'pending'; }).forEach(function (a) {
        window.ToolApproval.respond(sessionId, a.toolCallId, 'deny');
      });
    }
  };

  // ── Session Control Actions ────────────────────────────────

  window.SessionControl = {
    /** Abort the currently processing message in a session */
    stop: function (sessionId) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: 'session:stop',
        sessionId: sessionId,
        data: { timestamp: Date.now() }
      }));
    }
  };

  // ── User Input Actions ─────────────────────────────────────

  window.UserInput = {
    /** Send user's answer to a pending input request */
    respond: function (sessionId, requestId, answer, wasFreeform) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: 'user-input:response',
        sessionId: sessionId,
        data: { requestId: requestId, answer: answer, wasFreeform: wasFreeform !== false }
      }));
      // Optimistic update
      var s = state.sessions[sessionId];
      if (s) {
        var req = s.pendingUserInputs.find(function (u) { return u.requestId === requestId; });
        if (req) req.status = 'answered';
      }
      emit('user-input:resolved', { sessionId: sessionId, requestId: requestId });
      updateAttentionBar();
    },

    /** Get all pending user input requests across sessions */
    getPending: function () {
      var results = [];
      Object.keys(state.sessions).forEach(function (sid) {
        var s = state.sessions[sid];
        if (!s || !s.pendingUserInputs) return;
        s.pendingUserInputs.forEach(function (u) {
          if (u.status === 'pending') results.push({ sid: sid, input: u });
        });
      });
      return results;
    }
  };

  // ── Global Attention Bar ───────────────────────────────────
  // Counts all pending items (approvals + user inputs) and updates
  // the persistent attention bar in the header area.

  function countAttentionItems() {
    var approvals = 0;
    var inputs = 0;
    Object.keys(state.sessions).forEach(function (sid) {
      var s = state.sessions[sid];
      if (!s) return;
      if (s.pendingApprovals) {
        s.pendingApprovals.forEach(function (a) { if (a.status === 'pending') approvals++; });
      }
      if (s.pendingUserInputs) {
        s.pendingUserInputs.forEach(function (u) { if (u.status === 'pending') inputs++; });
      }
    });
    return { approvals: approvals, inputs: inputs, total: approvals + inputs };
  }

  function updateAttentionBar() {
    var bar = document.getElementById('attention-bar');
    if (!bar) return;
    var counts = countAttentionItems();
    if (counts.total === 0) {
      bar.classList.remove('attention-bar--visible');
      bar.innerHTML = '';
      return;
    }

    var parts = [];
    if (counts.inputs > 0) {
      parts.push('<span class="attention-item attention-item--input">'
        + '<span class="attention-icon">💬</span>'
        + counts.inputs + ' input' + (counts.inputs !== 1 ? 's' : '') + ' needed'
        + '</span>');
    }
    if (counts.approvals > 0) {
      parts.push('<span class="attention-item attention-item--approval">'
        + '<span class="attention-icon">🔒</span>'
        + counts.approvals + ' approval' + (counts.approvals !== 1 ? 's' : '') + ' pending'
        + '</span>');
    }

    bar.innerHTML = '<div class="attention-bar__content">'
      + '<span class="attention-bar__pulse"></span>'
      + parts.join('')
      + '<a class="attention-bar__action" href="#/mission-control">Go to Mission Control →</a>'
      + '</div>';
    bar.classList.add('attention-bar--visible');
  }

  window.AttentionBar = { update: updateAttentionBar, count: countAttentionItems };

  // ── No-Session Modal ──────────────────────────────────────

  function showNoSessionModal(prompt) {
    var existing = document.getElementById('no-session-modal');
    if (existing) existing.remove();

    function esc(s) {
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    var overlay = document.createElement('div');
    overlay.id = 'no-session-modal';
    overlay.className = 'nsm-overlay';
    overlay.innerHTML =
      '<div class="nsm-dialog">' +
        '<div class="nsm-header">' +
          '<span class="nsm-icon">📋</span>' +
          '<span class="nsm-title">No Active Copilot Session</span>' +
          '<button class="nsm-close" id="nsm-close-btn" title="Close">✕</button>' +
        '</div>' +
        '<div class="nsm-body">' +
          '<p class="nsm-desc">Prompt copied to clipboard. Paste it into your active Copilot CLI terminal.</p>' +
          '<div class="nsm-prompt-box">' +
            '<div class="nsm-prompt-text" id="nsm-prompt-text">' + esc(prompt) + '</div>' +
            '<button class="nsm-copy-btn" id="nsm-copy-btn" title="Copy to clipboard">📋 Copy</button>' +
          '</div>' +
          '<div class="nsm-hint">' +
            '<span class="nsm-hint-label">No session running?</span>' +
            ' Start one: <code class="nsm-code">mcaps</code> in your terminal.' +
          '</div>' +
          '<div class="nsm-copy-status" id="nsm-copy-status"></div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    function copyPrompt() {
      navigator.clipboard.writeText(prompt).then(function () {
        var s = document.getElementById('nsm-copy-status');
        if (s) { s.textContent = '✓ Copied!'; s.className = 'nsm-copy-status nsm-copy-status--ok'; }
        var btn = document.getElementById('nsm-copy-btn');
        if (btn) btn.textContent = '✓ Copied';
      }).catch(function () {
        var s = document.getElementById('nsm-copy-status');
        if (s) { s.textContent = 'Copy failed — select the text above manually.'; s.className = 'nsm-copy-status nsm-copy-status--err'; }
      });
    }

    // Auto-copy on open
    copyPrompt();

    document.getElementById('nsm-copy-btn').addEventListener('click', copyPrompt);
    document.getElementById('nsm-close-btn').addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); }
    });
  }

  // ── Dispatch Copilot Action ────────────────────────────────

  // options: { suppressNav: bool } — when suppressNav is true, stays on current view
  // Returns the sessionId the prompt was dispatched to (or null if none).
  window.dispatchCopilotAction = function (prompt, options) {
    if (!prompt) return null;
    if (window.SessionPicker && window.SessionPicker.isVisible && window.SessionPicker.isVisible()) return null;

    var sessions = Object.keys(state.sessions).filter(function (id) {
      return state.sessions[id].metadata.status !== 'ended';
    });

    if (sessions.length === 0) {
      showNoSessionModal(prompt);
      return null;
    }

    if (sessions.length === 1 || !window.SessionPicker) {
      // Single session — send directly
      var targetId = state.activeSessionId || sessions[0];
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'chat:send',
          sessionId: targetId,
          data: { message: prompt }
        }));
      }
      if (!options || !options.suppressNav) {
        window.location.hash = '#/mission-control';
      }
      return targetId;
    }

    // Multiple sessions — show picker
    window.SessionPicker.show(prompt);
    return state.activeSessionId || sessions[0] || null;
  };

  // ── Footer Counts ──────────────────────────────────────────

  function updateFooterCounts() {
    var toolCount = 0, errorCount = 0;
    Object.values(state.sessions).forEach(function (s) {
      toolCount += s.toolCalls ? s.toolCalls.length : 0;
      errorCount += s.session ? s.session.errorCount : 0;
    });
    var toolEl = document.getElementById('tool-count');
    var errorEl = document.getElementById('error-count');
    if (toolEl) toolEl.textContent = toolCount;
    if (errorEl) errorEl.textContent = errorCount;
  }

  // ── Session Timer ──────────────────────────────────────────

  var startTime = Date.now();
  setInterval(function () {
    var elapsed = Math.floor((Date.now() - startTime) / 1000);
    var h = Math.floor(elapsed / 3600);
    var m = Math.floor((elapsed % 3600) / 60);
    var s = elapsed % 60;
    var el = document.getElementById('session-timer');
    if (el) {
      el.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
  }, 1000);

  // ── Filter Controls ────────────────────────────────────────

  document.getElementById('filter-code')?.addEventListener('change', function (e) {
    state.ui.showCode = e.target.checked;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'filter:update', data: { showCode: state.ui.showCode } }));
    }
  });

  document.getElementById('filter-verbosity')?.addEventListener('change', function (e) {
    state.ui.verbosity = e.target.value;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'filter:update', data: { verbosity: state.ui.verbosity } }));
    }
  });

  // ── Nav Toggle ─────────────────────────────────────────────

  document.getElementById('nav-toggle')?.addEventListener('click', function () {
    var nav = document.getElementById('left-nav');
    if (nav) {
      nav.classList.toggle('nav-collapsed');
      nav.classList.toggle('nav-expanded');
    }
  });

  // ── Router Init ────────────────────────────────────────────

  var router = window.Router.createRouter({
    containerId: 'view-container',
    defaultRoute: 'home',
    views: {
      home: window.homeView || { mount: function (c) { c.innerHTML = '<div class="placeholder">Home loading…</div>'; } },
      opportunities: window.opportunitiesView || { mount: function (c) { c.innerHTML = '<div class="placeholder"><h2>📋 Opportunities</h2><p>Loading…</p></div>'; } },
      accounts: window.accountsView || { mount: function (c) { c.innerHTML = '<div class="placeholder"><h2>🏢 Accounts</h2><p>Loading…</p></div>'; } },
      skills: window.skillsView || { mount: function (c) { c.innerHTML = '<div class="placeholder">Skills loading…</div>'; } },
      gantt: window.ganttView || { mount: function (c) { c.innerHTML = '<div class="placeholder">Timeline loading…</div>'; } },
      job2: window.job2View || { mount: function (c) { c.innerHTML = '<div class="placeholder">Job2 Tracker loading…</div>'; } },
      'acr-quarter': window.acrQuarterView || { mount: function (c) { c.innerHTML = '<div class="placeholder">ACR by Quarter loading…</div>'; } },
      'action-plan': window.actionPlanView || { mount: function (c) { c.innerHTML = '<div class="placeholder">Action Plan loading…</div>'; } },
      'mcp-servers': window.mcpServersView || { mount: function (c) { c.innerHTML = '<div class="placeholder">MCP Servers loading…</div>'; } },
      'mission-control': window.missionControlView || { mount: function (c) { c.innerHTML = '<div class="placeholder">Mission Control loading…</div>'; } },
      schedules: window.schedulesView || { mount: function (c) { c.innerHTML = '<div class="placeholder">Schedules loading…</div>'; } },
      settings: window.settingsView || { mount: function (c) { c.innerHTML = '<div class="placeholder">Settings loading…</div>'; } }
    }
  });

  router.start();
  connectWS();
})();
