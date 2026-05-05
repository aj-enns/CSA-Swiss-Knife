/* ============================================================
 *  Sessions View — Frontier-style split panel activity stream
 * ============================================================ */
(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────

  var SESSION_COLORS = [
    '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6',
    '#ef4444', '#06b6d4', '#f97316', '#14b8a6', '#a855f7'
  ];

  var TOOL_NAMES = {
    bash:             'Running command',
    powershell:       'Running command',
    execute_command:  'Running command',
    run_command:      'Running command',
    shell:            'Running command',
    edit:             'Editing file',
    create:           'Creating file',
    view:             'Reading file',
    read_file:        'Reading file',
    write_file:       'Writing file',
    delete_file:      'Deleting file',
    glob:             'Finding files',
    grep:             'Searching code',
    find:             'Searching files',
    sql:              'Running SQL',
    task:             'Spawning agent',
    store_memory:     'Storing memory',
    web_fetch:        'Fetching URL',
    web_search:       'Searching web',
    report_intent:    'Reporting intent',
  };

  var PANEL_STORAGE_KEY = 'mcaps-iq-session-panel-collapsed';
  var ALL_SESSIONS_ID   = '__all__';

  // ── Filter defaults ──────────────────────────────────────────

  var FILTER_STORAGE_KEY = 'mcaps-iq-stream-filters';
  var DEFAULT_FILTERS = { response: true, tool: true, thinking: false, task: true };

  // ── Module state ─────────────────────────────────────────────

  var container      = null;
  var unsubscribe    = null;
  var selectedId     = ALL_SESSIONS_ID;
  var panelCollapsed = false;
  var isPinned       = true;
  var tickTimer      = null;
  var filters        = Object.assign({}, DEFAULT_FILTERS);

  // ── localStorage helpers ──────────────────────────────────────

  function loadPanelState() {
    try { panelCollapsed = localStorage.getItem(PANEL_STORAGE_KEY) === 'true'; } catch (_) {}
  }

  function savePanelState() {
    try { localStorage.setItem(PANEL_STORAGE_KEY, String(panelCollapsed)); } catch (_) {}
  }

  function loadFilters() {
    try {
      var raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        for (var k in DEFAULT_FILTERS) {
          if (typeof parsed[k] === 'boolean') filters[k] = parsed[k];
        }
      }
    } catch (_) {}
  }

  function saveFilters() {
    try { localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters)); } catch (_) {}
  }

  // ── Color helpers ─────────────────────────────────────────────

  function hashColor(id) {
    if (!id || id === ALL_SESSIONS_ID) return '#2563eb';
    var h = 0;
    for (var i = 0; i < id.length; i++) h = Math.imul(h, 31) + id.charCodeAt(i) | 0;
    return SESSION_COLORS[Math.abs(h) % SESSION_COLORS.length];
  }

  function hexAlpha(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  // ── HTML escape ───────────────────────────────────────────────

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Time helpers ─────────────────────────────────────────────

  function timeAgo(ts) {
    if (!ts) return '';
    var d = Math.floor((Date.now() - ts) / 1000);
    if (d < 60)    return d + 's ago';
    if (d < 3600)  return Math.floor(d / 60) + 'm ago';
    if (d < 86400) return Math.floor(d / 3600) + 'h ago';
    return Math.floor(d / 86400) + 'd ago';
  }

  function formatDur(startTs) {
    if (!startTs) return '0s';
    var s = Math.floor((Date.now() - startTs) / 1000);
    var m = Math.floor(s / 60);
    var h = Math.floor(m / 60);
    if (h > 0) return h + 'h ' + (m % 60) + 'm';
    if (m > 0) return m + 'm ' + (s % 60) + 's';
    return s + 's';
  }

  function shortId(id) {
    if (!id) return '--------';
    var m = id.match(/\d{4,}/);
    return m ? m[0] : id.slice(0, 8).toUpperCase();
  }

  // ── AppState accessors ────────────────────────────────────────

  function getSessions() {
    if (typeof window.AppState === 'undefined') return {};
    return window.AppState.getState().sessions || {};
  }

  function getSmartName(id, data) {
    if (!data) return shortId(id);
    var s = data.session || {};
    return s.derivedTitle || s.title || s.currentIntent || ('Session ' + shortId(id));
  }

  function validateSelection(sessions) {
    if (selectedId === ALL_SESSIONS_ID) return;
    if (!sessions[selectedId]) selectedId = ALL_SESSIONS_ID;
  }

  // ── Timeline builders ─────────────────────────────────────────

  function buildTimeline(data, sid) {
    var items = [];
    (data.responses     || []).forEach(function (r,  i) { items.push({ type: 'response', ts: r.timestamp   || 0, data: r,    sid: sid, ord: i }); });
    (data.toolCalls     || []).forEach(function (t,  i) { items.push({ type: 'tool',     ts: t.startTime   || 0, data: t,    sid: sid, ord: i }); });
    (data.thinking      || []).forEach(function (th, i) { items.push({ type: 'thinking', ts: th.timestamp  || 0, data: th,   sid: sid, ord: i }); });
    (data.backgroundTasks || []).forEach(function (tk, i) { items.push({ type: 'task',  ts: tk.startTime  || 0, data: tk,   sid: sid, ord: i }); });
    items.sort(function (a, b) {
      if (a.ts !== b.ts) return a.ts - b.ts;
      if (a.sid !== b.sid) return a.sid < b.sid ? -1 : 1;
      return a.ord - b.ord;
    });
    return items;
  }

  function buildMergedTimeline(sessions) {
    var items = [];
    Object.keys(sessions).forEach(function (sid) {
      buildTimeline(sessions[sid], sid).forEach(function (item) { items.push(item); });
    });
    items.sort(function (a, b) {
      if (a.ts !== b.ts) return a.ts - b.ts;
      if (a.sid !== b.sid) return a.sid < b.sid ? -1 : 1;
      return a.ord - b.ord;
    });
    return items;
  }

  // ── Tool name resolver ────────────────────────────────────────

  function resolveToolName(raw) {
    if (!raw) return 'Tool call';
    var lower = raw.toLowerCase().replace(/[-:]/g, '_');
    for (var key in TOOL_NAMES) {
      if (lower.indexOf(key) !== -1) return TOOL_NAMES[key];
    }
    return raw.replace(/[-_]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  // ── Origin badge (multi-session only) ──────────────────────────

  function originBadge(sid, sessions) {
    if (!sessions) return '';
    var c = hashColor(sid);
    var data = sessions[sid];
    var name = getSmartName(sid, data);
    return '<span class="sv-origin-badge" style="color:' + c + '" title="Session: ' + esc(name) + '">' 
      + '<span class="sv-origin-dot" style="background:' + c + '"></span>' 
      + esc(name) + '</span>';
  }

  // ── JSON formatter ──────────────────────────────────────────

  function formatJsonPreview(raw, maxLines) {
    if (!raw) return '';
    maxLines = maxLines || 12;
    try {
      var obj = (typeof raw === 'string') ? JSON.parse(raw) : raw;
      var pretty = JSON.stringify(obj, null, 2);
      var lines = pretty.split('\n');
      if (lines.length > maxLines) {
        return esc(lines.slice(0, maxLines).join('\n')) + '\n<span class="sv-json-truncated">… ' + (lines.length - maxLines) + ' more lines</span>';
      }
      return esc(pretty);
    } catch (_) {
      var str = String(raw);
      if (str.length > 500) return esc(str.slice(0, 500)) + '\n<span class="sv-json-truncated">… truncated</span>';
      return esc(str);
    }
  }

  // ── Processing indicator ─────────────────────────────────────

  function isSessionProcessing(sessions) {
    // Scope to selected session (or all if All is selected)
    var ids = (selectedId && selectedId !== ALL_SESSIONS_ID) ? [selectedId] : Object.keys(sessions);
    for (var i = 0; i < ids.length; i++) {
      var s = sessions[ids[i]];
      if (!s) continue;
      // Ended sessions are never processing
      if (s.metadata && s.metadata.status === 'ended') continue;
      // Active session that is not idle = agent is working
      if (s.session && !s.session.isIdle) return true;
      // Any running background tasks
      var tasks = s.backgroundTasks || [];
      for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].status === 'running' || tasks[j].status === 'pending') return true;
      }
    }
    return false;
  }

  function renderProcessingIndicator() {
    return '<div class="sv-processing">'
      + '<div class="sv-processing__dots">'
      + '<span class="sv-processing__dot"></span>'
      + '<span class="sv-processing__dot"></span>'
      + '<span class="sv-processing__dot"></span>'
      + '</div>'
      + '<span class="sv-processing__label">Agent is working…</span>'
      + '<button class="sv-stop-btn" data-sv-stop title="Stop the current operation">⏹ Stop</button>'
      + '</div>';
  }

  // ── Auto-approve state ───────────────────────────────────────

  var AUTO_APPROVE_STORAGE_KEY = 'mcaps-iq-auto-approve';

  function loadAutoApprove() {
    try {
      var raw = localStorage.getItem(AUTO_APPROVE_STORAGE_KEY);
      if (raw !== null) return raw === 'true';
    } catch (_) {}
    return true; // default: auto-approve on
  }

  function saveAutoApprove(val) {
    try { localStorage.setItem(AUTO_APPROVE_STORAGE_KEY, String(val)); } catch (_) {}
  }

  function getAutoApproveState(sessions) {
    // Check if any active session has autoApprove set
    if (sessions) {
      var ids = Object.keys(sessions);
      for (var i = 0; i < ids.length; i++) {
        var s = sessions[ids[i]];
        if (s && s.session && s.session.autoApprove !== undefined) {
          return s.session.autoApprove;
        }
      }
    }
    return loadAutoApprove();
  }

  function getPendingApprovals(sessions, selectedSid) {
    var approvals = [];
    if (!sessions) return approvals;
    var ids = (selectedSid && selectedSid !== ALL_SESSIONS_ID) ? [selectedSid] : Object.keys(sessions);
    ids.forEach(function (sid) {
      var s = sessions[sid];
      if (!s || !s.pendingApprovals) return;
      s.pendingApprovals.forEach(function (a) {
        if (a.status === 'pending') {
          approvals.push({ sid: sid, approval: a });
        }
      });
    });
    return approvals;
  }

  // ── Approval banner ─────────────────────────────────────────

  function renderApprovalBanner(sessions) {
    var pending = getPendingApprovals(sessions, selectedId);
    if (pending.length === 0) return '';

    var cards = pending.map(function (item) {
      var a = item.approval;
      var kindLabel = a.kind || 'tool';
      var nameLabel = a.toolName || a.fileName || a.commandText || 'Unknown';
      var extraDetail = '';
      if (a.kind === 'shell' && a.commandText) {
        extraDetail = '<div class=\"sv-approval-cmd\"><code>' + esc(a.commandText.slice(0, 200)) + '</code></div>';
      } else if (a.kind === 'write' && a.fileName) {
        extraDetail = '<div class=\"sv-approval-file\">File: <code>' + esc(a.fileName) + '</code></div>';
      }
      return '<div class=\"sv-approval-card\" data-approval-id=\"' + esc(a.toolCallId) + '\" data-approval-sid=\"' + esc(item.sid) + '\">'
        + '<div class=\"sv-approval-card__header\">'
        + '<span class=\"sv-approval-kind\">' + esc(kindLabel.toUpperCase()) + '</span>'
        + '<span class=\"sv-approval-name\">' + esc(nameLabel) + '</span>'
        + '<span class=\"sv-entry__time\">' + timeAgo(a.timestamp) + '</span>'
        + '</div>'
        + extraDetail
        + '<div class=\"sv-approval-card__actions\">'
        + '<button class=\"sv-approval-btn sv-approval-btn--approve\" data-decision=\"approve\" title=\"Approve this tool call\">✓ Approve</button>'
        + '<button class=\"sv-approval-btn sv-approval-btn--deny\" data-decision=\"deny\" title=\"Deny this tool call\">✗ Deny</button>'
        + '</div>'
        + '</div>';
    }).join('');

    var bulkActions = pending.length > 1
      ? '<div class=\"sv-approval-bulk\">'
        + '<button class=\"sv-approval-btn sv-approval-btn--approve-all\" title=\"Approve all pending\">✓ Approve All (' + pending.length + ')</button>'
        + '<button class=\"sv-approval-btn sv-approval-btn--deny-all\" title=\"Deny all pending\">✗ Deny All</button>'
        + '</div>'
      : '';

    return '<div class=\"sv-approval-banner\">'
      + '<div class=\"sv-approval-banner__header\">'
      + '<span class=\"sv-approval-banner__icon\">🔒</span>'
      + '<span class=\"sv-approval-banner__title\">' + pending.length + ' tool' + (pending.length !== 1 ? 's' : '') + ' awaiting approval</span>'
      + bulkActions
      + '</div>'
      + '<div class=\"sv-approval-cards\">' + cards + '</div>'
      + '</div>';
  }

  // ── User Input Banner ──────────────────────────────────────

  function getPendingUserInputs(sessions, selectedSid) {
    var inputs = [];
    if (!sessions) return inputs;
    var ids = (selectedSid && selectedSid !== ALL_SESSIONS_ID) ? [selectedSid] : Object.keys(sessions);
    ids.forEach(function (sid) {
      var s = sessions[sid];
      if (!s || !s.pendingUserInputs) return;
      s.pendingUserInputs.forEach(function (u) {
        if (u.status === 'pending') {
          inputs.push({ sid: sid, input: u });
        }
      });
    });
    return inputs;
  }

  function renderUserInputBanner(sessions) {
    var pending = getPendingUserInputs(sessions, selectedId);
    if (pending.length === 0) return '';

    var cards = pending.map(function (item) {
      var u = item.input;
      var choicesHtml = '';
      if (u.choices && u.choices.length > 0) {
        choicesHtml = '<div class="sv-input-choices">'
          + u.choices.map(function (choice) {
            return '<button class="sv-input-choice-btn" data-input-choice="' + esc(choice) + '">' + esc(choice) + '</button>';
          }).join('')
          + '</div>';
      }

      var freeformHtml = '';
      if (u.allowFreeform) {
        freeformHtml = '<div class="sv-input-freeform">'
          + '<input class="sv-input-text" type="text" placeholder="Type your answer…" data-input-request="' + esc(u.requestId) + '" />'
          + '<button class="sv-input-submit" data-input-submit="' + esc(u.requestId) + '">Send</button>'
          + '</div>';
      }

      return '<div class="sv-input-card" data-input-id="' + esc(u.requestId) + '" data-input-sid="' + esc(item.sid) + '">'
        + '<div class="sv-input-card__question">'
        + '<span class="sv-input-card__icon">💬</span>'
        + '<span class="sv-input-card__text">' + esc(u.question) + '</span>'
        + '<span class="sv-entry__time">' + timeAgo(u.timestamp) + '</span>'
        + '</div>'
        + choicesHtml
        + freeformHtml
        + '</div>';
    }).join('');

    return '<div class="sv-input-banner">'
      + '<div class="sv-input-banner__header">'
      + '<span class="sv-input-banner__icon">💬</span>'
      + '<span class="sv-input-banner__title">Agent needs your input</span>'
      + '</div>'
      + '<div class="sv-input-cards">' + cards + '</div>'
      + '</div>';
  }

  // ── Filter toolbar ──────────────────────────────────────────

  function renderFilterBar(timeline, sessions) {
    var counts = { response: 0, tool: 0, thinking: 0, task: 0 };
    timeline.forEach(function (item) { if (counts[item.type] !== undefined) counts[item.type]++; });

    var items = [
      { key: 'response', label: 'Responses', icon: '🤖' },
      { key: 'tool',     label: 'Tools',     icon: '⚡' },
      { key: 'thinking', label: 'Reasoning', icon: '💭' },
      { key: 'task',     label: 'Agents',    icon: '⚙️' }
    ];

    var pills = items.map(function (f) {
      var active = filters[f.key];
      var cnt    = counts[f.key];
      return '<button class="sv-filter-pill' + (active ? ' sv-filter-pill--active' : '') + '"'
        + ' data-sv-filter="' + f.key + '"'
        + ' title="' + (active ? 'Hide' : 'Show') + ' ' + f.label.toLowerCase() + '"'
        + ' aria-pressed="' + active + '">'
        + f.icon + ' ' + f.label
        + (cnt > 0 ? ' <span class="sv-filter-count">' + cnt + '</span>' : '')
        + '</button>';
    }).join('');

    // Auto-approve toggle
    var autoApprove = getAutoApproveState(sessions);
    var toggleCls = autoApprove ? ' sv-auto-approve--on' : '';
    var autoApproveToggle = '<button class="sv-auto-approve-toggle' + toggleCls + '"'
      + ' data-sv-auto-approve'
      + ' title="' + (autoApprove ? 'Auto-approve is ON — all tools run without confirmation' : 'Auto-approve is OFF — tools require manual approval') + '"'
      + ' aria-pressed="' + autoApprove + '">'
      + (autoApprove ? '🔓' : '🔒') + ' Auto-approve'
      + '</button>';

    return '<div class="sv-filter-bar">'
      + '<div class="sv-filter-bar__pills">' + pills + '</div>'
      + '<div class="sv-filter-bar__controls">' + autoApproveToggle + '</div>'
      + '</div>';
  }

  // ── Entry renderers ───────────────────────────────────────────

function renderResponseEntry(item, sessions) {
    var r   = item.data;
    var c   = hashColor(item.sid);
    var fmt = (window.ContentFormatters && typeof window.ContentFormatters.formatMarkdownContent === 'function')
      ? window.ContentFormatters.formatMarkdownContent(r.content || '')
      : esc(r.content || '');
    var agentName = (r.agentName && r.agentName !== 'assistant') ? esc(r.agentName) : 'MCAPS IQ';
    var isSubAgent = r.agentName && r.agentName !== 'assistant';
    var agentCls = isSubAgent ? ' sv-entry--subagent' : '';
    return '<div class="sv-entry sv-entry--response' + agentCls + '" style="border-left-color:' + c + '">' 
      + '<div class="sv-entry__header">' 
      + (sessions ? originBadge(item.sid, sessions) : '') 
      + '<span class="sv-agent-badge">' + (isSubAgent ? '🔧' : '🤖') + ' ' + agentName + '</span>'
      + '<span class="sv-entry__time">' + timeAgo(r.timestamp) + '</span>'
      + '</div>'
      + '<div class="sv-entry__body sv-entry__body--response">'
      + '<div class="sv-response-content">' + fmt + '</div>'
      + '</div>'
      + '</div>';
  }

function renderToolEntry(item, sessions) {
    var t    = item.data;
    var c    = hashColor(item.sid);
    var dur  = (t.endTime && t.startTime) ? ((t.endTime - t.startTime) + 'ms') : '';
    var icon = (t.success === null || t.success === undefined) ? '⏳' : (t.success ? '✅' : '❌');
    var name = resolveToolName(t.toolName);
    var detail = t.detail ? '<span class="sv-tool-detail">' + esc(t.detail) + '</span>' : '';
    var toolId = t.toolName || '';

    // Build expandable body with input and output sections
    var bodyParts = [];
    bodyParts.push('<div class="sv-tool-id"><span class="sv-tool-id__label">Tool</span> <code>' + esc(toolId) + '</code>' + (t.id ? '<span class="sv-tool-callid">id: ' + esc(t.id) + '</span>' : '') + '</div>');

    if (t.arguments) {
      bodyParts.push(
        '<div class="sv-tool-section">'
        + '<div class="sv-tool-section__label">Input</div>'
        + '<pre class="sv-tool-json">' + formatJsonPreview(t.arguments, 15) + '</pre>'
        + '</div>'
      );
    }

    if (t.result) {
      var resultLabel = (t.success === false) ? 'Error' : 'Output';
      var resultCls = (t.success === false) ? ' sv-tool-json--error' : '';
      bodyParts.push(
        '<div class="sv-tool-section">'
        + '<div class="sv-tool-section__label">' + resultLabel + '</div>'
        + '<pre class="sv-tool-json' + resultCls + '">' + formatJsonPreview(t.result, 12) + '</pre>'
        + '</div>'
      );
    }

    var noData = !t.arguments && !t.result;
    if (noData) {
      bodyParts.push('<div class="sv-tool-section sv-tool-section--empty">No input/output captured</div>');
    }

    return '<div class="sv-entry sv-entry--tool" style="border-left-color:' + c + '">' 
      + '<details class="sv-tool-details" data-tool-key="' + esc(toolId + '|' + (t.id || '')) + '">' 
      + '<summary class="sv-entry__header sv-entry__header--tool">' 
      + (sessions ? originBadge(item.sid, sessions) : '') 
      + '<span class="sv-entry-type-badge sv-entry-type-badge--tool">TOOL</span>' 
      + '<span class="sv-tool-name">' + esc(name) + '</span>'
      + detail
      + '<span class="sv-tool-status">' + icon + '</span>'
      + (dur ? '<span class="sv-tool-dur">' + esc(dur) + '</span>' : '')
      + '<span class="sv-entry__time">' + timeAgo(t.startTime) + '</span>'
      + '</summary>'
      + '<div class="sv-entry__body sv-entry__body--tool">'
      + bodyParts.join('')
      + '</div>'
      + '</details>'
      + '</div>';
  }

function renderThinkingEntry(item, sessions) {
    var th      = item.data;
    var c       = hashColor(item.sid);
    var preview = (th.content || '').slice(0, 120).replace(/\n/g, ' ');
    return '<div class="sv-entry sv-entry--thinking" style="border-left-color:' + c + '">' 
      + '<details class="sv-thinking-details">' 
      + '<summary class="sv-entry__header">' 
      + (sessions ? originBadge(item.sid, sessions) : '') 
      + '<span class="sv-entry-type-badge sv-entry-type-badge--thinking">REASONING</span>' 
      + '<span class="sv-thinking-preview">' + esc(preview) + (preview.length >= 120 ? '…' : '') + '</span>' 
      + '<span class="sv-entry__time">' + timeAgo(th.timestamp) + '</span>' 
      + '</summary>' 
      + '<div class="sv-entry__body sv-entry__body--thinking">' + esc(th.content || '') + '</div>' 
      + '</details>' 
      + '</div>';
  }

  function renderTaskEntry(item, sessions) {
    var t    = item.data;
    var c    = hashColor(item.sid);
    var icon = t.status === 'complete' ? '✅' : (t.status === 'failed' ? '❌' : '⚙️');
    var statusCls = t.status === 'running' ? ' sv-entry--task-running' : '';
    return '<div class="sv-entry sv-entry--task' + statusCls + '" style="border-left-color:' + c + '">' 
      + '<div class="sv-entry__header">' 
      + (sessions ? originBadge(item.sid, sessions) : '') 
      + '<span class="sv-entry-type-badge sv-entry-type-badge--agent">AGENT</span>' 
      + '<span class="sv-task-agent">' + esc(t.emoji || '⚙️') + ' ' + esc(t.agentName || 'agent') + '</span>' 
      + (t.description ? '<span class="sv-task-desc">' + esc(t.description) + '</span>' : '') 
      + '<span class="sv-tool-status">' + icon + '</span>' 
      + '<span class="sv-entry__time">' + timeAgo(t.startTime) + '</span>' 
      + '</div>' 
      + (t.output ? '<div class="sv-entry__body sv-entry__body--task">' + esc(t.output) + '</div>' : '') 
      + '</div>';
  }

  function renderItem(item, sessions) {
    switch (item.type) {
      case 'response': return renderResponseEntry(item, sessions);
      case 'tool':     return renderToolEntry(item, sessions);
      case 'thinking': return renderThinkingEntry(item, sessions);
      case 'task':     return renderTaskEntry(item, sessions);
      default:         return '';
    }
  }

  // ── Left session panel ────────────────────────────────────────

  function renderPanel(sessions) {
    var ids = Object.keys(sessions);
    if (panelCollapsed) {
      return '<div class="sv-panel sv-panel--collapsed" aria-label="Sessions panel">'
        + '<div class="sv-panel__header">'
        + '<button class="sv-panel__toggle" aria-label="Expand session panel" aria-expanded="false">▶</button>'
        + '</div>'
        + '</div>';
    }

    var allActive = selectedId === ALL_SESSIONS_ID;
    var allCard = '<div class="sv-session-card' + (allActive ? ' sv-session-card--active' : '') + '" '
      + 'data-sv-sid="' + ALL_SESSIONS_ID + '" style="border-left-color:#2563eb" '
      + 'role="button" tabindex="0" aria-selected="' + allActive + '">'
      + '<div class="sv-session-card__row">'
      + '<span class="sv-status-dot sv-status-dot--active" title="All sessions"></span>'
      + '<span class="sv-session-card__name">All Sessions</span>'
      + '</div>'
      + '<div class="sv-session-card__meta">'
      + '<span class="sv-session-card__count">' + ids.length + ' session' + (ids.length !== 1 ? 's' : '') + '</span>'
      + '</div>'
      + '</div>';

    var cards = ids.map(function (sid) {
      var data    = sessions[sid];
      var meta    = data.metadata || {};
      var c       = hashColor(sid);
      var status  = meta.status || 'ended';
      var dotCls  = 'sv-status-dot--' + (status === 'active' ? 'active' : status === 'idle' ? 'idle' : 'ended');
      var name    = getSmartName(sid, data);
      var isActive = sid === selectedId;
      var runCnt  = (data.backgroundTasks || []).filter(function (t) { return t.status === 'running'; }).length;
      var isProcessing = data.session && !data.session.isIdle && status !== 'ended';
      var isEnded = status === 'ended';

      // Per-session action buttons
      var actions = '';
      if (!isEnded) {
        actions = '<div class="sv-session-card__actions">'
          + (isProcessing
            ? '<button class="sv-session-action sv-session-action--stop" data-sv-card-stop="' + esc(sid) + '" title="Stop this session">⏹</button>'
            : '')
          + '</div>';
      } else {
        actions = '<div class="sv-session-card__actions">'
          + '<span class="sv-session-card__ended-label">ended</span>'
          + '</div>';
      }

      return '<div class="sv-session-card' + (isActive ? ' sv-session-card--active' : '') + (isEnded ? ' sv-session-card--ended' : '') + '" '
        + 'data-sv-sid="' + esc(sid) + '" style="border-left-color:' + c + '" '
        + 'role="button" tabindex="0" aria-selected="' + isActive + '">'
        + '<div class="sv-session-card__row">'
        + '<span class="sv-status-dot ' + dotCls + '" title="' + esc(status) + '"></span>'
        + '<span class="sv-session-card__name" title="' + esc(name) + '">' + esc(name) + '</span>'
        + actions
        + '</div>'
        + '<div class="sv-session-card__meta">'
        + (meta.lastSeen ? '<span class="sv-session-card__time">' + timeAgo(meta.lastSeen) + '</span>' : '')
        + (runCnt > 0 ? '<span class="sv-session-running">' + runCnt + ' running</span>' : '')
        + '</div>'
        + '</div>';
    }).join('');

    return '<div class="sv-panel" aria-label="Sessions panel">'
      + '<div class="sv-panel__header">'
      + '<span class="sv-panel__title">SESSIONS</span>'
      + '<button class="sv-panel__toggle" aria-label="Collapse session panel" aria-expanded="true">◀</button>'
      + '</div>'
      + '<div class="sv-panel__cards">' + allCard + cards + '</div>'
      + '</div>';
  }

  // ── Main stream area ──────────────────────────────────────────

  function renderMainArea(sessions) {
    var isAll   = (selectedId === ALL_SESSIONS_ID);
    var selectedSession = !isAll && sessions[selectedId] ? sessions[selectedId] : null;
    var selectedEnded = selectedSession && selectedSession.metadata && selectedSession.metadata.status === 'ended';
    var fullTimeline = isAll
      ? buildMergedTimeline(sessions)
      : buildTimeline(sessions[selectedId] || { responses: [], toolCalls: [], thinking: [], backgroundTasks: [] }, selectedId);

    // Filter bar uses full counts, but only filtered items render
    var filterBar = renderFilterBar(fullTimeline, sessions);
    var approvalBanner = renderApprovalBanner(sessions);
    var userInputBanner = renderUserInputBanner(sessions);
    var timeline = fullTimeline.filter(function (item) { return filters[item.type] !== false; });

    var count   = timeline.length;
    var multiSessions = isAll ? sessions : null;
    var entries = timeline.map(function (item) { return renderItem(item, multiSessions); }).join('');

    // Processing indicator
    var processing = isSessionProcessing(sessions);
    var processingHtml = processing ? renderProcessingIndicator() : '';

    var streamContent = entries
      || '<div class="sv-stream-empty">' + (Object.keys(sessions).length === 0
          ? 'Waiting for a CLI session to connect…'
          : 'No activity yet — start a conversation') + '</div>';

    var chatDisabled = (isAll || selectedEnded) ? ' disabled' : '';
    var chatPlaceholder = isAll
      ? 'Select a session to send a message'
      : selectedEnded
        ? 'This session has ended'
        : 'Send a message to ' + esc(getSmartName(selectedId, selectedSession)) + '…';

    // Session target label for chat bar
    var chatTarget = '';
    if (!isAll && selectedSession && !selectedEnded) {
      var tgtColor = hashColor(selectedId);
      var tgtName = getSmartName(selectedId, selectedSession);
      chatTarget = '<div class="sv-chat-target">'
        + '<span class="sv-chat-target__dot" style="background:' + tgtColor + '"></span>'
        + '<span class="sv-chat-target__name">' + esc(tgtName) + '</span>'
        + '</div>';
    }

    return '<div class="sv-main">'
      + '<div class="sv-main__header">'
      + '<span class="sv-main__title">Activity Stream</span>'
      + (count > 0 ? '<span class="sv-stream-count">' + count + '</span>' : '')
      + '<button class="sv-pin-btn' + (isPinned ? ' sv-pin-btn--active' : '') + '" title="Auto-scroll to bottom" aria-pressed="' + isPinned + '">⬇</button>'
      + '</div>'
      + filterBar
      + userInputBanner
      + approvalBanner
      + '<div class="sv-stream">'
      + '<div class="sv-stream__entries">' + streamContent + processingHtml + '</div>'
      + '</div>'
      + '<div class="sv-chat-bar">'
      + chatTarget
      + '<input class="sv-chat-input" type="text" placeholder="' + esc(chatPlaceholder) + '"' + chatDisabled + ' />'
      + '<button class="sv-chat-send"' + chatDisabled + '>Send</button>'
      + '</div>'
      + '</div>';
  }

  // ── Full render ───────────────────────────────────────────────

  function render() {
    if (!container) return;

    var sessions = getSessions();
    validateSelection(sessions);

    // Persist transient UI state before replacing DOM
    var prevDraft = '';
    var openDetails = [];
    var streamEl = container.querySelector('.sv-stream');
    var wasAtBottom = !streamEl || (streamEl.scrollHeight - streamEl.scrollTop - streamEl.clientHeight < 40);
    var prevInput = container.querySelector('.sv-chat-input');
    if (prevInput) prevDraft = prevInput.value;
    container.querySelectorAll('details[open]').forEach(function (d) {
      var key = d.dataset.toolKey || '';
      if (!key) {
        var code = d.querySelector('code');
        if (code) key = code.textContent;
      }
      if (key) openDetails.push(key);
    });

    container.innerHTML = '<div class="sv-layout">'
      + renderPanel(sessions)
      + renderMainArea(sessions)
      + '</div>';

    // Restore draft text and focus
    var newInput = container.querySelector('.sv-chat-input');
    if (newInput && prevDraft) {
      newInput.value = prevDraft;
    }

    // Restore open <details> by key
    if (openDetails.length) {
      container.querySelectorAll('details').forEach(function (d) {
        var key = d.dataset.toolKey || '';
        if (!key) {
          var code = d.querySelector('code');
          if (code) key = code.textContent;
        }
        if (key && openDetails.indexOf(key) !== -1) d.open = true;
      });
    }

    // Scroll position
    var newStreamEl = container.querySelector('.sv-stream');
    if (newStreamEl) {
      if (isPinned || wasAtBottom) newStreamEl.scrollTop = newStreamEl.scrollHeight;
      newStreamEl.addEventListener('scroll', function () {
        isPinned = (newStreamEl.scrollHeight - newStreamEl.scrollTop - newStreamEl.clientHeight < 40);
        var pinBtn = container.querySelector('.sv-pin-btn');
        if (pinBtn) {
          pinBtn.classList.toggle('sv-pin-btn--active', isPinned);
          pinBtn.setAttribute('aria-pressed', String(isPinned));
        }
      });
    }

    // Panel toggle
    var toggleBtn = container.querySelector('.sv-panel__toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        panelCollapsed = !panelCollapsed;
        savePanelState();
        render();
      });
    }

    // Filter pills
    container.querySelectorAll('.sv-filter-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        var key = pill.dataset.svFilter;
        if (key && filters[key] !== undefined) {
          filters[key] = !filters[key];
          saveFilters();
          render();
        }
      });
    });

    // Auto-approve toggle
    var autoApproveBtn = container.querySelector('[data-sv-auto-approve]');
    if (autoApproveBtn) {
      autoApproveBtn.addEventListener('click', function () {
        var sessions = getSessions();
        var current = getAutoApproveState(sessions);
        var newVal = !current;
        saveAutoApprove(newVal);
        // Send to all active sessions
        var ids = Object.keys(sessions);
        ids.forEach(function (sid) {
          if (sessions[sid] && sessions[sid].metadata && sessions[sid].metadata.status === 'active') {
            if (window.ToolApproval) window.ToolApproval.setAutoApprove(sid, newVal);
          }
        });
        render();
      });
    }

    // Approval card buttons
    container.querySelectorAll('.sv-approval-card').forEach(function (card) {
      var tid = card.dataset.approvalId;
      var sid = card.dataset.approvalSid;
      card.querySelectorAll('.sv-approval-btn').forEach(function (btn) {
        var decision = btn.dataset.decision;
        if (decision && window.ToolApproval) {
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            window.ToolApproval.respond(sid, tid, decision);
            render();
          });
        }
      });
    });

    // Bulk approve/deny
    var approveAllBtn = container.querySelector('.sv-approval-btn--approve-all');
    if (approveAllBtn) {
      approveAllBtn.addEventListener('click', function () {
        var sessions = getSessions();
        var ids = (selectedId !== ALL_SESSIONS_ID) ? [selectedId] : Object.keys(sessions);
        ids.forEach(function (sid) { if (window.ToolApproval) window.ToolApproval.approveAll(sid); });
        render();
      });
    }
    var denyAllBtn = container.querySelector('.sv-approval-btn--deny-all');
    if (denyAllBtn) {
      denyAllBtn.addEventListener('click', function () {
        var sessions = getSessions();
        var ids = (selectedId !== ALL_SESSIONS_ID) ? [selectedId] : Object.keys(sessions);
        ids.forEach(function (sid) { if (window.ToolApproval) window.ToolApproval.denyAll(sid); });
        render();
      });
    }

    // User-input: choice buttons
    container.querySelectorAll('.sv-input-choice-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var card = btn.closest('.sv-input-card');
        if (!card || !window.UserInput) return;
        window.UserInput.respond(card.dataset.inputSid, card.dataset.inputId, btn.dataset.inputChoice, false);
        render();
      });
    });

    // User-input: freeform submit (button + Enter key)
    container.querySelectorAll('.sv-input-submit').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var card = btn.closest('.sv-input-card');
        if (!card || !window.UserInput) return;
        var input = card.querySelector('.sv-input-text');
        var answer = input ? input.value.trim() : '';
        if (!answer) return;
        window.UserInput.respond(card.dataset.inputSid, card.dataset.inputId, answer, true);
        render();
      });
    });
    container.querySelectorAll('.sv-input-text').forEach(function (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var card = input.closest('.sv-input-card');
        if (!card || !window.UserInput) return;
        var answer = input.value.trim();
        if (!answer) return;
        window.UserInput.respond(card.dataset.inputSid, card.dataset.inputId, answer, true);
        render();
      });
    });

    // Session card clicks (mouse + keyboard) — only select, not if action button clicked
    container.querySelectorAll('.sv-session-card').forEach(function (card) {
      function select(e) {
        // Don't select if an action button was clicked
        if (e.target.closest('.sv-session-action')) return;
        selectedId = card.dataset.svSid;
        isPinned = true;
        render();
      }
      card.addEventListener('click', select);
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(e); }
      });
    });

    // Per-session stop buttons in panel cards
    container.querySelectorAll('[data-sv-card-stop]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var sid = btn.dataset.svCardStop;
        if (sid && window.SessionControl) window.SessionControl.stop(sid);
      });
    });

    // Pin button
    var pinBtn = container.querySelector('.sv-pin-btn');
    if (pinBtn) {
      pinBtn.addEventListener('click', function () {
        isPinned = !isPinned;
        pinBtn.classList.toggle('sv-pin-btn--active', isPinned);
        pinBtn.setAttribute('aria-pressed', String(isPinned));
        if (isPinned && newStreamEl) newStreamEl.scrollTop = newStreamEl.scrollHeight;
      });
    }

    // Stop button (in processing indicator)
    var stopBtn = container.querySelector('[data-sv-stop]');
    if (stopBtn) {
      stopBtn.addEventListener('click', function () {
        var sessions = getSessions();
        var targetIds = (selectedId !== ALL_SESSIONS_ID) ? [selectedId] : Object.keys(sessions);
        targetIds.forEach(function (sid) {
          var s = sessions[sid];
          if (s && s.metadata && s.metadata.status !== 'ended') {
            if (window.SessionControl) window.SessionControl.stop(sid);
          }
        });
      });
    }

    // Chat input
    var chatInput = container.querySelector('.sv-chat-input');
    var sendBtn   = container.querySelector('.sv-chat-send');

    function sendChat() {
      if (!chatInput || chatInput.disabled) return;
      var msg = chatInput.value.trim();
      if (!msg) return;
      chatInput.value = '';

      // If a specific session is selected, send directly to it
      if (selectedId && selectedId !== ALL_SESSIONS_ID) {
        var sessions = getSessions();
        var s = sessions[selectedId];
        // Only send to active (connected) sessions
        if (s && s.metadata && s.metadata.status !== 'ended') {
          if (typeof window.AppConnection !== 'undefined' && typeof window.AppConnection.send === 'function') {
            window.AppConnection.send({
              type: 'chat:send',
              sessionId: selectedId,
              data: { message: msg }
            });
          }
          return;
        }
      }

      // Fallback: use global dispatcher (picks active session or shows picker)
      if (typeof window.dispatchCopilotAction === 'function') window.dispatchCopilotAction(msg);
    }

    if (sendBtn)   sendBtn.addEventListener('click', sendChat);
    if (chatInput) chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
    });
  }

  // ── Tick (refresh timeAgo labels every 30s) ───────────────────

  function startTick() {
    stopTick();
    tickTimer = setInterval(function () { if (container) render(); }, 30000);
  }

  function stopTick() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  // ── Debounced render ──────────────────────────────────────────

  var _renderRaf = null;

  function scheduleRender() {
    if (_renderRaf) return;            // already scheduled
    _renderRaf = requestAnimationFrame(function () {
      _renderRaf = null;
      if (container) render();
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  function mount(el) {
    container = el;
    container.classList.add('sv-host');
    isPinned = true;
    loadPanelState();
    loadFilters();
    render();
    startTick();
    if (typeof window.AppState !== 'undefined' && typeof window.AppState.subscribe === 'function') {
      unsubscribe = window.AppState.subscribe(function () { scheduleRender(); });
    }
  }

  function unmount() {
    if (typeof unsubscribe === 'function') { unsubscribe(); unsubscribe = null; }
    if (_renderRaf) { cancelAnimationFrame(_renderRaf); _renderRaf = null; }
    stopTick();
    if (container) container.classList.remove('sv-host');
    container = null;
  }

  function onActivate() {
    isPinned = true;
    if (container) render();
  }

  window.sessionsView = { mount: mount, unmount: unmount, onActivate: onActivate };
})();
