/* ============================================================
 *  Mission Control — Unified live sessions + history + delegation
 *  Combines real-time activity stream with session history browser,
 *  delegation tracking, and parallel session discovery.
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

  var PANEL_STORAGE_KEY = 'mcaps-iq-mc-panel-collapsed';
  var TAB_STORAGE_KEY   = 'mcaps-iq-mc-active-tab';
  var ALL_SESSIONS_ID   = '__all__';

  // ── Filter defaults ──────────────────────────────────────────

  var FILTER_STORAGE_KEY = 'mcaps-iq-stream-filters';
  var DEFAULT_FILTERS = { response: true, tool: true, thinking: false, task: true };

  // ── Module state ─────────────────────────────────────────────

  var container      = null;
  var unsubscribe    = null;
  var selectedLiveId = ALL_SESSIONS_ID;
  var panelCollapsed = false;
  var isPinned       = true;
  var tickTimer      = null;
  var filters        = Object.assign({}, DEFAULT_FILTERS);
  var activeTab      = 'live';   // 'live' | 'history'

  // History state
  var historySessions = [];
  var historyStats = null;
  var historyTotal = 0;
  var historyPage = 0;
  var historyPageSize = 30;
  var historySearch = '';
  var historyRepoFilter = '';
  var historySelectedId = null;
  var historyDetail = null;
  var historyLoading = false;
  var searchDebounceTimer = null;

  // Delegation tracking
  var DELEGATION_STORAGE_KEY = 'mcaps-iq-delegations';
  var delegations = [];

  // ── localStorage helpers ──────────────────────────────────────

  function loadPanelState() {
    try { panelCollapsed = localStorage.getItem(PANEL_STORAGE_KEY) === 'true'; } catch (_) {}
  }
  function savePanelState() {
    try { localStorage.setItem(PANEL_STORAGE_KEY, String(panelCollapsed)); } catch (_) {}
  }
  function loadActiveTab() {
    try {
      var t = localStorage.getItem(TAB_STORAGE_KEY);
      if (t === 'live' || t === 'history') activeTab = t;
    } catch (_) {}
  }
  function saveActiveTab() {
    try { localStorage.setItem(TAB_STORAGE_KEY, activeTab); } catch (_) {}
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
  function loadDelegations() {
    try {
      var raw = localStorage.getItem(DELEGATION_STORAGE_KEY);
      if (raw) delegations = JSON.parse(raw);
    } catch (_) { delegations = []; }
  }
  function saveDelegations() {
    try { localStorage.setItem(DELEGATION_STORAGE_KEY, JSON.stringify(delegations)); } catch (_) {}
  }

  // ── Color helpers ─────────────────────────────────────────────

  function hashColor(id) {
    if (!id || id === ALL_SESSIONS_ID) return '#2563eb';
    var h = 0;
    for (var i = 0; i < id.length; i++) h = Math.imul(h, 31) + id.charCodeAt(i) | 0;
    return SESSION_COLORS[Math.abs(h) % SESSION_COLORS.length];
  }

  // ── HTML escape ───────────────────────────────────────────────

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Time helpers ──────────────────────────────────────────────

  function timeAgo(ts) {
    if (!ts) return '';
    var d = Math.floor((Date.now() - (typeof ts === 'number' ? ts : new Date(ts).getTime())) / 1000);
    if (d < 0) d = 0;
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

  function shortDate(ts) {
    if (!ts) return '';
    try {
      var d = new Date(ts);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (_) { return ts; }
  }

  function shortId(id) {
    if (!id) return '--------';
    var m = id.match(/\d{4,}/);
    return m ? m[0] : id.slice(0, 8).toUpperCase();
  }

  function repoName(repo) {
    if (!repo) return '';
    var parts = repo.split('/');
    return parts.length > 1 ? parts[parts.length - 1] : repo;
  }

  function cwdShort(cwd) {
    if (!cwd) return '';
    var parts = cwd.split('/');
    return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : cwd;
  }

  // ── AppState accessors (live WebSocket sessions) ──────────────

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
    if (selectedLiveId === ALL_SESSIONS_ID) return;
    if (!sessions[selectedLiveId]) selectedLiveId = ALL_SESSIONS_ID;
  }

  // ── Timeline builders ─────────────────────────────────────────

  function buildTimeline(data, sid) {
    var items = [];
    (data.responses       || []).forEach(function (r,  i) { items.push({ type: 'response', ts: r.timestamp  || 0, data: r,  sid: sid, ord: i }); });
    (data.toolCalls       || []).forEach(function (t,  i) { items.push({ type: 'tool',     ts: t.startTime  || 0, data: t,  sid: sid, ord: i }); });
    (data.thinking        || []).forEach(function (th, i) { items.push({ type: 'thinking', ts: th.timestamp || 0, data: th, sid: sid, ord: i }); });
    (data.backgroundTasks || []).forEach(function (tk, i) { items.push({ type: 'task',     ts: tk.startTime || 0, data: tk, sid: sid, ord: i }); });
    items.sort(function (a, b) { return a.ts !== b.ts ? a.ts - b.ts : a.ord - b.ord; });
    return items;
  }

  function buildMergedTimeline(sessions) {
    var items = [];
    Object.keys(sessions).forEach(function (sid) {
      buildTimeline(sessions[sid], sid).forEach(function (item) { items.push(item); });
    });
    items.sort(function (a, b) { return a.ts !== b.ts ? a.ts - b.ts : a.ord - b.ord; });
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

  // ── Origin badge ──────────────────────────────────────────────

  function originBadge(sid, sessions) {
    if (!sessions) return '';
    var c = hashColor(sid);
    var data = sessions[sid];
    var name = getSmartName(sid, data);
    return '<span class="mc-origin-badge" style="color:' + c + '" title="Session: ' + esc(name) + '">'
      + '<span class="mc-origin-dot" style="background:' + c + '"></span>'
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
        return esc(lines.slice(0, maxLines).join('\n')) + '\n<span class="mc-json-truncated">… ' + (lines.length - maxLines) + ' more lines</span>';
      }
      return esc(pretty);
    } catch (_) {
      var str = String(raw);
      if (str.length > 500) return esc(str.slice(0, 500)) + '\n<span class="mc-json-truncated">… truncated</span>';
      return esc(str);
    }
  }

  // ── Processing indicator ─────────────────────────────────────

  function isSessionProcessing(sessions) {
    var ids = (selectedLiveId && selectedLiveId !== ALL_SESSIONS_ID) ? [selectedLiveId] : Object.keys(sessions);
    for (var i = 0; i < ids.length; i++) {
      var s = sessions[ids[i]];
      if (!s) continue;
      if (s.metadata && s.metadata.status === 'ended') continue;
      if (s.session && !s.session.isIdle) return true;
      var tasks = s.backgroundTasks || [];
      for (var j = 0; j < tasks.length; j++) {
        if (tasks[j].status === 'running' || tasks[j].status === 'pending') return true;
      }
    }
    return false;
  }

  function renderProcessingIndicator() {
    return '<div class="mc-processing">'
      + '<div class="mc-processing__dots">'
      + '<span class="mc-processing__dot"></span>'
      + '<span class="mc-processing__dot"></span>'
      + '<span class="mc-processing__dot"></span>'
      + '</div>'
      + '<span class="mc-processing__label">Agent is working…</span>'
      + '<button class="mc-stop-btn" data-mc-stop title="Stop">⏹ Stop</button>'
      + '</div>';
  }

  // ── Auto-approve state ───────────────────────────────────────

  var AUTO_APPROVE_STORAGE_KEY = 'mcaps-iq-auto-approve';

  function loadAutoApprove() {
    try {
      var raw = localStorage.getItem(AUTO_APPROVE_STORAGE_KEY);
      if (raw !== null) return raw === 'true';
    } catch (_) {}
    return true;
  }
  function saveAutoApprove(val) {
    try { localStorage.setItem(AUTO_APPROVE_STORAGE_KEY, String(val)); } catch (_) {}
  }

  function getAutoApproveState(sessions) {
    if (sessions) {
      var ids = Object.keys(sessions);
      for (var i = 0; i < ids.length; i++) {
        var s = sessions[ids[i]];
        if (s && s.session && s.session.autoApprove !== undefined) return s.session.autoApprove;
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
        if (a.status === 'pending') approvals.push({ sid: sid, approval: a });
      });
    });
    return approvals;
  }

  // ── Approval banner ─────────────────────────────────────────

  function renderApprovalBanner(sessions) {
    var pending = getPendingApprovals(sessions, selectedLiveId);
    if (pending.length === 0) return '';

    var cards = pending.map(function (item) {
      var a = item.approval;
      var kindLabel = a.kind || 'tool';
      var nameLabel = a.toolName || a.fileName || a.commandText || 'Unknown';
      var extraDetail = '';
      if (a.kind === 'shell' && a.commandText) {
        extraDetail = '<div class="mc-approval-cmd"><code>' + esc(a.commandText.slice(0, 200)) + '</code></div>';
      } else if (a.kind === 'write' && a.fileName) {
        extraDetail = '<div class="mc-approval-file">File: <code>' + esc(a.fileName) + '</code></div>';
      }
      return '<div class="mc-approval-card" data-approval-id="' + esc(a.toolCallId) + '" data-approval-sid="' + esc(item.sid) + '">'
        + '<div class="mc-approval-card__header">'
        + '<span class="mc-approval-kind">' + esc(kindLabel.toUpperCase()) + '</span>'
        + '<span class="mc-approval-name">' + esc(nameLabel) + '</span>'
        + '<span class="mc-entry__time">' + timeAgo(a.timestamp) + '</span>'
        + '</div>'
        + extraDetail
        + '<div class="mc-approval-card__actions">'
        + '<button class="mc-approval-btn mc-approval-btn--approve" data-decision="approve">✓ Approve</button>'
        + '<button class="mc-approval-btn mc-approval-btn--deny" data-decision="deny">✗ Deny</button>'
        + '</div>'
        + '</div>';
    }).join('');

    var bulkActions = pending.length > 1
      ? '<div class="mc-approval-bulk">'
        + '<button class="mc-approval-btn mc-approval-btn--approve-all">✓ Approve All (' + pending.length + ')</button>'
        + '<button class="mc-approval-btn mc-approval-btn--deny-all">✗ Deny All</button>'
        + '</div>'
      : '';

    return '<div class="mc-approval-banner">'
      + '<div class="mc-approval-banner__header">'
      + '<span class="mc-approval-banner__icon">🔒</span>'
      + '<span class="mc-approval-banner__title">' + pending.length + ' tool' + (pending.length !== 1 ? 's' : '') + ' awaiting approval</span>'
      + bulkActions
      + '</div>'
      + '<div class="mc-approval-cards">' + cards + '</div>'
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
        if (u.status === 'pending') inputs.push({ sid: sid, input: u });
      });
    });
    return inputs;
  }

  function renderUserInputBanner(sessions) {
    var pending = getPendingUserInputs(sessions, selectedLiveId);
    if (pending.length === 0) return '';

    var cards = pending.map(function (item) {
      var u = item.input;
      var choicesHtml = '';
      if (u.choices && u.choices.length > 0) {
        choicesHtml = '<div class="mc-input-choices">'
          + u.choices.map(function (choice) {
            return '<button class="mc-input-choice-btn" data-input-choice="' + esc(choice) + '">' + esc(choice) + '</button>';
          }).join('')
          + '</div>';
      }
      var freeformHtml = '';
      if (u.allowFreeform) {
        freeformHtml = '<div class="mc-input-freeform">'
          + '<input class="mc-input-text" type="text" placeholder="Type your answer…" data-input-request="' + esc(u.requestId) + '" />'
          + '<button class="mc-input-submit" data-input-submit="' + esc(u.requestId) + '">Send</button>'
          + '</div>';
      }
      return '<div class="mc-input-card" data-input-id="' + esc(u.requestId) + '" data-input-sid="' + esc(item.sid) + '">'
        + '<div class="mc-input-card__question">'
        + '<span class="mc-input-card__icon">💬</span>'
        + '<span class="mc-input-card__text">' + esc(u.question) + '</span>'
        + '<span class="mc-entry__time">' + timeAgo(u.timestamp) + '</span>'
        + '</div>'
        + choicesHtml
        + freeformHtml
        + '</div>';
    }).join('');

    return '<div class="mc-input-banner">'
      + '<div class="mc-input-banner__header">'
      + '<span class="mc-input-banner__icon">💬</span>'
      + '<span class="mc-input-banner__title">Agent needs your input</span>'
      + '</div>'
      + '<div class="mc-input-cards">' + cards + '</div>'
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
      return '<button class="mc-filter-pill' + (active ? ' mc-filter-pill--active' : '') + '"'
        + ' data-mc-filter="' + f.key + '"'
        + ' title="' + (active ? 'Hide' : 'Show') + ' ' + f.label.toLowerCase() + '"'
        + ' aria-pressed="' + active + '">'
        + f.icon + ' ' + f.label
        + (cnt > 0 ? ' <span class="mc-filter-count">' + cnt + '</span>' : '')
        + '</button>';
    }).join('');

    var autoApprove = getAutoApproveState(sessions);
    var toggleCls = autoApprove ? ' mc-auto-approve--on' : '';
    var autoApproveToggle = '<button class="mc-auto-approve-toggle' + toggleCls + '"'
      + ' data-mc-auto-approve'
      + ' title="' + (autoApprove ? 'Auto-approve ON' : 'Auto-approve OFF') + '"'
      + ' aria-pressed="' + autoApprove + '">'
      + (autoApprove ? '🔓' : '🔒') + ' Auto-approve'
      + '</button>';

    return '<div class="mc-filter-bar">'
      + '<div class="mc-filter-bar__pills">' + pills + '</div>'
      + '<div class="mc-filter-bar__controls">' + autoApproveToggle + '</div>'
      + '</div>';
  }

  // ══════════════════════════════════════════════════════════════
  //  ENTRY RENDERERS (activity stream items)
  // ══════════════════════════════════════════════════════════════

  function renderResponseEntry(item, sessions) {
    var r   = item.data;
    var c   = hashColor(item.sid);
    var fmt = (window.ContentFormatters && typeof window.ContentFormatters.formatMarkdownContent === 'function')
      ? window.ContentFormatters.formatMarkdownContent(r.content || '')
      : esc(r.content || '');
    var agentName = (r.agentName && r.agentName !== 'assistant') ? esc(r.agentName) : 'MCAPS IQ';
    var isSubAgent = r.agentName && r.agentName !== 'assistant';
    var agentCls = isSubAgent ? ' mc-entry--subagent' : '';
    return '<div class="mc-entry mc-entry--response' + agentCls + '" style="border-left-color:' + c + '">'
      + '<div class="mc-entry__header">'
      + (sessions ? originBadge(item.sid, sessions) : '')
      + '<span class="mc-agent-badge">' + (isSubAgent ? '🔧' : '🤖') + ' ' + agentName + '</span>'
      + '<span class="mc-entry__time">' + timeAgo(r.timestamp) + '</span>'
      + '</div>'
      + '<div class="mc-entry__body mc-entry__body--response">'
      + '<div class="mc-response-content">' + fmt + '</div>'
      + '</div>'
      + '</div>';
  }

  function renderToolEntry(item, sessions) {
    var t    = item.data;
    var c    = hashColor(item.sid);
    var dur  = (t.endTime && t.startTime) ? ((t.endTime - t.startTime) + 'ms') : '';
    var icon = (t.success === null || t.success === undefined) ? '⏳' : (t.success ? '✅' : '❌');
    var name = resolveToolName(t.toolName);
    var detail = t.detail ? '<span class="mc-tool-detail">' + esc(t.detail) + '</span>' : '';
    var toolId = t.toolName || '';

    var bodyParts = [];
    bodyParts.push('<div class="mc-tool-id"><span class="mc-tool-id__label">Tool</span> <code>' + esc(toolId) + '</code>' + (t.id ? '<span class="mc-tool-callid">id: ' + esc(t.id) + '</span>' : '') + '</div>');

    if (t.arguments) {
      bodyParts.push(
        '<div class="mc-tool-section">'
        + '<div class="mc-tool-section__label">Input</div>'
        + '<pre class="mc-tool-json">' + formatJsonPreview(t.arguments, 15) + '</pre>'
        + '</div>'
      );
    }
    if (t.result) {
      var resultLabel = (t.success === false) ? 'Error' : 'Output';
      var resultCls = (t.success === false) ? ' mc-tool-json--error' : '';
      bodyParts.push(
        '<div class="mc-tool-section">'
        + '<div class="mc-tool-section__label">' + resultLabel + '</div>'
        + '<pre class="mc-tool-json' + resultCls + '">' + formatJsonPreview(t.result, 12) + '</pre>'
        + '</div>'
      );
    }
    if (!t.arguments && !t.result) {
      bodyParts.push('<div class="mc-tool-section mc-tool-section--empty">No input/output captured</div>');
    }

    return '<div class="mc-entry mc-entry--tool" style="border-left-color:' + c + '">'
      + '<details class="mc-tool-details" data-tool-key="' + esc(toolId + '|' + (t.id || '')) + '">'
      + '<summary class="mc-entry__header mc-entry__header--tool">'
      + (sessions ? originBadge(item.sid, sessions) : '')
      + '<span class="mc-entry-type-badge mc-entry-type-badge--tool">TOOL</span>'
      + '<span class="mc-tool-name">' + esc(name) + '</span>'
      + detail
      + '<span class="mc-tool-status">' + icon + '</span>'
      + (dur ? '<span class="mc-tool-dur">' + esc(dur) + '</span>' : '')
      + '<span class="mc-entry__time">' + timeAgo(t.startTime) + '</span>'
      + '</summary>'
      + '<div class="mc-entry__body mc-entry__body--tool">'
      + bodyParts.join('')
      + '</div>'
      + '</details>'
      + '</div>';
  }

  function renderThinkingEntry(item, sessions) {
    var th      = item.data;
    var c       = hashColor(item.sid);
    var preview = (th.content || '').slice(0, 120).replace(/\n/g, ' ');
    return '<div class="mc-entry mc-entry--thinking" style="border-left-color:' + c + '">'
      + '<details class="mc-thinking-details">'
      + '<summary class="mc-entry__header">'
      + (sessions ? originBadge(item.sid, sessions) : '')
      + '<span class="mc-entry-type-badge mc-entry-type-badge--thinking">REASONING</span>'
      + '<span class="mc-thinking-preview">' + esc(preview) + (preview.length >= 120 ? '…' : '') + '</span>'
      + '<span class="mc-entry__time">' + timeAgo(th.timestamp) + '</span>'
      + '</summary>'
      + '<div class="mc-entry__body mc-entry__body--thinking">' + esc(th.content || '') + '</div>'
      + '</details>'
      + '</div>';
  }

  function renderTaskEntry(item, sessions) {
    var t    = item.data;
    var c    = hashColor(item.sid);
    var icon = t.status === 'complete' ? '✅' : (t.status === 'failed' ? '❌' : '⚙️');
    var statusCls = t.status === 'running' ? ' mc-entry--task-running' : '';
    return '<div class="mc-entry mc-entry--task' + statusCls + '" style="border-left-color:' + c + '">'
      + '<div class="mc-entry__header">'
      + (sessions ? originBadge(item.sid, sessions) : '')
      + '<span class="mc-entry-type-badge mc-entry-type-badge--agent">AGENT</span>'
      + '<span class="mc-task-agent">' + esc(t.emoji || '⚙️') + ' ' + esc(t.agentName || 'agent') + '</span>'
      + (t.description ? '<span class="mc-task-desc">' + esc(t.description) + '</span>' : '')
      + '<span class="mc-tool-status">' + icon + '</span>'
      + '<span class="mc-entry__time">' + timeAgo(t.startTime) + '</span>'
      + '</div>'
      + (t.output ? '<div class="mc-entry__body mc-entry__body--task">' + esc(t.output) + '</div>' : '')
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

  // ══════════════════════════════════════════════════════════════
  //  HISTORY DATA FETCHING
  // ══════════════════════════════════════════════════════════════

  function fetchHistorySessions() {
    historyLoading = true;
    renderHistoryList();

    var params = new URLSearchParams();
    params.set('limit', String(historyPageSize));
    params.set('offset', String(historyPage * historyPageSize));
    if (historySearch) params.set('search', historySearch);
    if (historyRepoFilter) params.set('repository', historyRepoFilter);

    fetch('/api/session-history?' + params.toString())
      .then(function (r) { return r.ok ? r.json() : { sessions: [], total: 0 }; })
      .then(function (data) {
        historySessions = data.sessions || [];
        historyTotal = data.total || 0;
        historyLoading = false;
        renderHistoryList();
      })
      .catch(function () { historyLoading = false; renderHistoryList(); });
  }

  function fetchHistoryStats() {
    fetch('/api/session-history/stats')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { historyStats = data; renderHistoryStatsBar(); })
      .catch(function () {});
  }

  function fetchHistoryDetail(sessionId) {
    historySelectedId = sessionId;
    historyDetail = null;
    render();

    fetch('/api/session-history/' + encodeURIComponent(sessionId))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { historyDetail = data; render(); })
      .catch(function () { render(); });
  }

  function searchHistorySessions(query) {
    if (!query) { fetchHistorySessions(); return; }
    historyLoading = true;
    renderHistoryList();

    fetch('/api/session-history/search?q=' + encodeURIComponent(query))
      .then(function (r) { return r.ok ? r.json() : { results: [] }; })
      .then(function (data) {
        historySessions = data.results || [];
        historyTotal = historySessions.length;
        historyPage = 0;
        historyLoading = false;
        renderHistoryList();
      })
      .catch(function () { historyLoading = false; renderHistoryList(); });
  }

  // ── Delegation ───────────────────────────────────────────────

  function delegateToSession(sessionId, prompt) {
    var delegation = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      sessionId: sessionId,
      prompt: prompt,
      status: 'sending',
      timestamp: Date.now(),
      result: null
    };
    delegations.unshift(delegation);
    saveDelegations();
    render();

    return fetch('/api/session-history/' + encodeURIComponent(sessionId) + '/delegate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        delegation.status = data.dispatched ? 'dispatched' : 'failed';
        delegation.result = data.dispatched ? 'Dispatched successfully' : (data.error || 'unknown error');
        saveDelegations();
        if (data.dispatched) {
          showToast('Prompt delegated to session ' + shortId(sessionId));
        } else {
          showToast('Delegation failed: ' + (data.error || 'unknown'), 'error');
        }
        render();
        return data;
      })
      .catch(function (err) {
        delegation.status = 'failed';
        delegation.result = err.message;
        saveDelegations();
        showToast('Delegation error: ' + err.message, 'error');
        render();
      });
  }

  // ── Toast ────────────────────────────────────────────────────

  function showToast(msg, type) {
    var toast = document.createElement('div');
    toast.className = 'mc-toast ' + (type === 'error' ? 'mc-toast--error' : 'mc-toast--success');
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function () { toast.classList.add('mc-toast--visible'); }, 10);
    setTimeout(function () {
      toast.classList.remove('mc-toast--visible');
      setTimeout(function () { toast.remove(); }, 300);
    }, 3000);
  }

  // ══════════════════════════════════════════════════════════════
  //  SIDEBAR PANEL
  // ══════════════════════════════════════════════════════════════

  function renderSidebar(sessions) {
    if (panelCollapsed) {
      return '<div class="mc-sidebar mc-sidebar--collapsed" aria-label="Sessions panel">'
        + '<div class="mc-sidebar__header">'
        + '<button class="mc-sidebar__toggle" aria-label="Expand panel" aria-expanded="false">▶</button>'
        + '</div>'
        + '</div>';
    }

    var liveCount = Object.keys(sessions).filter(function (sid) {
      var m = sessions[sid] && sessions[sid].metadata;
      return m && m.status !== 'ended';
    }).length;
    var histCount = historyStats ? (historyStats.totalSessions || 0) : '…';

    var tabBar = '<div class="mc-sidebar__tabs">'
      + '<button class="mc-tab' + (activeTab === 'live' ? ' mc-tab--active' : '') + '" data-mc-tab="live">'
      + 'Live' + (liveCount > 0 ? ' <span class="mc-tab__count">' + liveCount + '</span>' : '')
      + '</button>'
      + '<button class="mc-tab' + (activeTab === 'history' ? ' mc-tab--active' : '') + '" data-mc-tab="history">'
      + 'History <span class="mc-tab__count">' + histCount + '</span>'
      + '</button>'
      + '<button class="mc-sidebar__toggle" aria-label="Collapse" aria-expanded="true">◀</button>'
      + '</div>';

    var content = (activeTab === 'live') ? renderLiveSidebar(sessions) : renderHistorySidebar();
    var delegationSection = renderDelegationTracker();

    return '<div class="mc-sidebar" aria-label="Sessions panel">'
      + tabBar
      + '<div class="mc-sidebar__content">' + content + '</div>'
      + delegationSection
      + '</div>';
  }

  // ── Live sidebar ──────────────────────────────────────────────

  function renderLiveSidebar(sessions) {
    var ids = Object.keys(sessions);

    var allActive = selectedLiveId === ALL_SESSIONS_ID;
    var allCard = '<div class="mc-session-card' + (allActive ? ' mc-session-card--active' : '') + '" '
      + 'data-mc-live-sid="' + ALL_SESSIONS_ID + '" style="border-left-color:#2563eb" '
      + 'role="button" tabindex="0" aria-selected="' + allActive + '">'
      + '<div class="mc-session-card__row">'
      + '<span class="mc-status-dot mc-status-dot--active" title="All sessions"></span>'
      + '<span class="mc-session-card__name">All Sessions</span>'
      + '</div>'
      + '<div class="mc-session-card__meta">'
      + '<span class="mc-session-card__count">' + ids.length + ' session' + (ids.length !== 1 ? 's' : '') + '</span>'
      + '</div>'
      + '</div>';

    var cards = ids.map(function (sid) {
      var data    = sessions[sid];
      var meta    = data.metadata || {};
      var c       = hashColor(sid);
      var status  = meta.status || 'ended';
      var dotCls  = 'mc-status-dot--' + (status === 'active' ? 'active' : status === 'idle' ? 'idle' : 'ended');
      var name    = getSmartName(sid, data);
      var isActive = sid === selectedLiveId;
      var runCnt  = (data.backgroundTasks || []).filter(function (t) { return t.status === 'running'; }).length;
      var isProcessing = data.session && !data.session.isIdle && status !== 'ended';
      var isEnded = status === 'ended';

      var actions = '';
      if (!isEnded && isProcessing) {
        actions = '<div class="mc-session-card__actions">'
          + '<button class="mc-session-action mc-session-action--stop" data-mc-card-stop="' + esc(sid) + '" title="Stop">⏹</button>'
          + '</div>';
      } else if (isEnded) {
        actions = '<div class="mc-session-card__actions"><span class="mc-session-card__ended-label">ended</span></div>';
      }

      return '<div class="mc-session-card' + (isActive ? ' mc-session-card--active' : '') + (isEnded ? ' mc-session-card--ended' : '') + '" '
        + 'data-mc-live-sid="' + esc(sid) + '" style="border-left-color:' + c + '" '
        + 'role="button" tabindex="0" aria-selected="' + isActive + '">'
        + '<div class="mc-session-card__row">'
        + '<span class="mc-status-dot ' + dotCls + '" title="' + esc(status) + '"></span>'
        + '<span class="mc-session-card__name" title="' + esc(name) + '">' + esc(name) + '</span>'
        + actions
        + '</div>'
        + '<div class="mc-session-card__meta">'
        + (meta.lastSeen ? '<span class="mc-session-card__time">' + timeAgo(meta.lastSeen) + '</span>' : '')
        + (runCnt > 0 ? '<span class="mc-session-running">' + runCnt + ' running</span>' : '')
        + '</div>'
        + '</div>';
    }).join('');

    var refreshBtn = '<button class="mc-refresh-btn" data-mc-refresh title="Discover parallel Copilot sessions">↻ Refresh</button>';

    var emptyHint = ids.length === 0
      ? '<div class="mc-sidebar-empty">No live sessions.<br>Start a Copilot CLI session to see it here.</div>'
      : '';

    return '<div class="mc-live-header">'
      + '<span class="mc-live-count">' + Object.keys(sessions).length + ' total</span>'
      + refreshBtn
      + '</div>'
      + '<div class="mc-sidebar__cards">' + allCard + cards + '</div>'
      + emptyHint;
  }

  // ── History sidebar ───────────────────────────────────────────

  function renderHistorySidebar() {
    return '<div class="mc-hsearch-box">'
      + '<input class="mc-hsearch-input" type="text" placeholder="Search history…" value="' + esc(historySearch) + '">'
      + '</div>'
      + '<div class="mc-history-stats-bar"></div>'
      + '<div class="mc-history-list"></div>';
  }

  function renderHistoryStatsBar() {
    var el = container && container.querySelector('.mc-history-stats-bar');
    if (!el || !historyStats) return;
    var recentCount = (historyStats.recentActivity || []).reduce(function (sum, d) { return sum + d.sessionCount; }, 0);
    el.innerHTML =
      '<div class="mc-hstat">' + (historyStats.totalSessions || 0) + ' sessions</div>'
      + '<div class="mc-hstat">' + (historyStats.totalTurns || 0) + ' turns</div>'
      + '<div class="mc-hstat">' + recentCount + ' last 30d</div>';
  }

  function renderHistoryList() {
    var el = container && container.querySelector('.mc-history-list');
    if (!el) return;

    if (historyLoading) { el.innerHTML = '<div class="mc-sidebar-empty">Loading…</div>'; return; }
    if (historySessions.length === 0) {
      el.innerHTML = '<div class="mc-sidebar-empty">No sessions found.' + (historySearch ? ' Try different terms.' : '') + '</div>';
      return;
    }

    var rows = historySessions.map(function (s) {
      var isActive = s.sessionId === historySelectedId;
      var canResume = s.canResume !== false;
      var summary = s.summary || s.matchedContent || '(no summary)';
      if (summary.length > 80) summary = summary.slice(0, 80) + '…';
      var loc = s.repository ? repoName(s.repository) : cwdShort(s.cwd);

      return '<div class="mc-history-row' + (isActive ? ' mc-history-row--active' : '') + '" data-mc-history-sid="' + esc(s.sessionId) + '">'
        + '<div class="mc-history-row__header">'
        + '<span class="mc-history-row__id">' + esc(shortId(s.sessionId)) + '</span>'
        + (canResume ? '<span class="mc-badge mc-badge--resume">resumable</span>' : '')
        + '<span class="mc-history-row__time">' + timeAgo(s.updatedAt || s.modifiedTime) + '</span>'
        + '</div>'
        + '<div class="mc-history-row__summary">' + esc(summary) + '</div>'
        + (loc ? '<div class="mc-history-row__meta"><span class="mc-meta-chip">' + esc(loc) + '</span></div>' : '')
        + '</div>';
    }).join('');

    var totalPages = Math.ceil(historyTotal / historyPageSize);
    var pager = '';
    if (totalPages > 1) {
      pager = '<div class="mc-pager">'
        + '<button class="mc-btn mc-btn--sm" data-mc-action="history-prev"' + (historyPage === 0 ? ' disabled' : '') + '>←</button>'
        + '<span class="mc-pager__info">' + (historyPage + 1) + '/' + totalPages + '</span>'
        + '<button class="mc-btn mc-btn--sm" data-mc-action="history-next"' + (historyPage >= totalPages - 1 ? ' disabled' : '') + '>→</button>'
        + '</div>';
    }

    el.innerHTML = rows + pager;
  }

  // ── Delegation tracker ─────────────────────────────────────

  function renderDelegationTracker() {
    var active = delegations.filter(function (d) { return d.status === 'sending' || d.status === 'dispatched'; });
    var recent = delegations.filter(function (d) { return d.status === 'failed' || d.status === 'complete'; }).slice(0, 3);
    var items = active.concat(recent);
    if (items.length === 0) return '';

    var rows = items.map(function (d) {
      var statusIcon = d.status === 'sending' ? '⏳' : d.status === 'dispatched' ? '🚀' : d.status === 'complete' ? '✅' : '❌';
      var promptPreview = d.prompt.length > 50 ? d.prompt.slice(0, 50) + '…' : d.prompt;
      return '<div class="mc-delegation-row mc-delegation-row--' + esc(d.status) + '">'
        + '<span class="mc-delegation-icon">' + statusIcon + '</span>'
        + '<div class="mc-delegation-info">'
        + '<span class="mc-delegation-prompt">' + esc(promptPreview) + '</span>'
        + '<span class="mc-delegation-meta">' + esc(shortId(d.sessionId)) + ' · ' + timeAgo(d.timestamp) + '</span>'
        + '</div>'
        + '</div>';
    }).join('');

    return '<div class="mc-delegation-tracker">'
      + '<div class="mc-delegation-tracker__header">'
      + '<span class="mc-delegation-tracker__title">Delegations</span>'
      + (delegations.length > 0 ? '<button class="mc-delegation-clear" data-mc-action="clear-delegations" title="Clear">✕</button>' : '')
      + '</div>'
      + rows
      + '</div>';
  }

  // ══════════════════════════════════════════════════════════════
  //  MAIN CONTENT AREA
  // ══════════════════════════════════════════════════════════════

  function renderMainContent(sessions) {
    return (activeTab === 'live') ? renderLiveStream(sessions) : renderHistoryDetail();
  }

  // ── Live activity stream ──────────────────────────────────────

  function renderLiveStream(sessions) {
    var isAll   = (selectedLiveId === ALL_SESSIONS_ID);
    var selectedSession = !isAll && sessions[selectedLiveId] ? sessions[selectedLiveId] : null;
    var selectedEnded = selectedSession && selectedSession.metadata && selectedSession.metadata.status === 'ended';
    var fullTimeline = isAll
      ? buildMergedTimeline(sessions)
      : buildTimeline(sessions[selectedLiveId] || { responses: [], toolCalls: [], thinking: [], backgroundTasks: [] }, selectedLiveId);

    var filterBar = renderFilterBar(fullTimeline, sessions);
    var approvalBanner = renderApprovalBanner(sessions);
    var userInputBanner = renderUserInputBanner(sessions);
    var timeline = fullTimeline.filter(function (item) { return filters[item.type] !== false; });

    var count = timeline.length;
    var multiSessions = isAll ? sessions : null;
    var entries = timeline.map(function (item) { return renderItem(item, multiSessions); }).join('');

    var processing = isSessionProcessing(sessions);
    var processingHtml = processing ? renderProcessingIndicator() : '';

    var streamContent = entries
      || '<div class="mc-stream-empty">' + (Object.keys(sessions).length === 0
          ? 'Waiting for a CLI session to connect…'
          : 'No activity yet — start a conversation') + '</div>';

    var chatDisabled = (isAll || selectedEnded) ? ' disabled' : '';
    var chatPlaceholder = isAll
      ? 'Select a session to send a message'
      : selectedEnded
        ? 'This session has ended'
        : 'Send a message to ' + esc(getSmartName(selectedLiveId, selectedSession)) + '…';

    var chatTarget = '';
    if (!isAll && selectedSession && !selectedEnded) {
      var tgtColor = hashColor(selectedLiveId);
      var tgtName = getSmartName(selectedLiveId, selectedSession);
      chatTarget = '<div class="mc-chat-target">'
        + '<span class="mc-chat-target__dot" style="background:' + tgtColor + '"></span>'
        + '<span class="mc-chat-target__name">' + esc(tgtName) + '</span>'
        + '</div>';
    }

    return '<div class="mc-main">'
      + '<div class="mc-main__header">'
      + '<span class="mc-main__title">Activity Stream</span>'
      + (count > 0 ? '<span class="mc-stream-count">' + count + '</span>' : '')
      + '<button class="mc-pin-btn' + (isPinned ? ' mc-pin-btn--active' : '') + '" title="Auto-scroll to bottom" aria-pressed="' + isPinned + '">⬇</button>'
      + '</div>'
      + filterBar
      + userInputBanner
      + approvalBanner
      + '<div class="mc-stream">'
      + '<div class="mc-stream__entries">' + streamContent + processingHtml + '</div>'
      + '</div>'
      + '<div class="mc-chat-bar">'
      + chatTarget
      + '<input class="mc-chat-input" type="text" placeholder="' + esc(chatPlaceholder) + '"' + chatDisabled + ' />'
      + '<button class="mc-chat-send"' + chatDisabled + '>Send</button>'
      + '</div>'
      + '</div>';
  }

  // ── History detail view ───────────────────────────────────────

  function renderHistoryDetail() {
    if (!historySelectedId) {
      return '<div class="mc-main">'
        + '<div class="mc-detail-empty">'
        + '<div class="mc-detail-empty__icon">🎯</div>'
        + '<div class="mc-detail-empty__text">Select a session to inspect</div>'
        + '<div class="mc-detail-empty__hint">Browse history, view turns, and delegate new prompts</div>'
        + '</div>'
        + '</div>';
    }

    if (!historyDetail) {
      return '<div class="mc-main"><div class="mc-loading">Loading session detail…</div></div>';
    }

    var d = historyDetail;
    var turnsHtml = (d.turns || []).map(function (t) {
      return '<div class="mc-turn">'
        + '<div class="mc-turn__header">'
        + '<span class="mc-turn__index">Turn ' + t.turnIndex + '</span>'
        + '<span class="mc-turn__time">' + shortDate(t.timestamp) + '</span>'
        + '</div>'
        + '<div class="mc-turn__user">'
        + '<span class="mc-turn__role">You</span>'
        + '<div class="mc-turn__content">' + esc(t.userMessage || '(empty)') + '</div>'
        + '</div>'
        + (t.assistantResponse ? '<div class="mc-turn__assistant">'
          + '<span class="mc-turn__role">Assistant</span>'
          + '<div class="mc-turn__content">' + esc(t.assistantResponse) + '</div>'
        + '</div>' : '')
        + '</div>';
    }).join('');

    return '<div class="mc-main">'
      + '<div class="mc-detail-view">'
      + '<div class="mc-detail-header">'
      + '<div class="mc-detail-header__title">'
      + '<h3>' + esc(d.summary || 'Session ' + shortId(d.sessionId)) + '</h3>'
      + '<button class="mc-btn mc-btn--icon mc-detail-close" data-mc-action="close-detail">✕</button>'
      + '</div>'
      + '<div class="mc-detail-header__meta">'
      + '<span class="mc-meta-chip">ID: ' + esc(shortId(d.sessionId)) + '</span>'
      + (d.repository ? '<span class="mc-meta-chip">' + esc(d.repository) + '</span>' : '')
      + (d.branch ? '<span class="mc-meta-chip">' + esc(d.branch) + '</span>' : '')
      + '<span class="mc-meta-chip">Created: ' + shortDate(d.createdAt) + '</span>'
      + '<span class="mc-meta-chip">Updated: ' + shortDate(d.updatedAt) + '</span>'
      + '</div>'
      + (d.canResume ? '<div class="mc-detail-actions">'
        + '<button class="mc-btn mc-btn--primary" data-mc-action="delegate" data-sid="' + esc(d.sessionId) + '">▶ Delegate Prompt</button>'
        + '<button class="mc-btn mc-btn--secondary" data-mc-action="copy-id" data-sid="' + esc(d.sessionId) + '">Copy ID</button>'
      + '</div>' : '')
      + '</div>'
      + '<div class="mc-detail-turns">'
      + '<h4 class="mc-detail-section-title">Conversation (' + (d.turns || []).length + ' turns)</h4>'
      + (turnsHtml || '<div class="mc-sidebar-empty">No turns recorded.</div>')
      + '</div>'
      + '</div>'
      + '</div>';
  }

  // ── Delegate modal ───────────────────────────────────────────

  function showDelegateModal(sessionId) {
    var s = historySessions.find(function (s) { return s.sessionId === sessionId; });
    var title = s ? (s.summary || shortId(sessionId)) : shortId(sessionId);

    var overlay = document.createElement('div');
    overlay.className = 'mc-modal-overlay';
    overlay.innerHTML =
      '<div class="mc-modal">'
      + '<div class="mc-modal__header">'
      + '<h3>Delegate to Session</h3>'
      + '<button class="mc-btn mc-btn--icon mc-modal__close">✕</button>'
      + '</div>'
      + '<div class="mc-modal__body">'
      + '<div class="mc-modal__target">'
      + '<span class="mc-meta-chip">' + esc(shortId(sessionId)) + '</span>'
      + '<span>' + esc(title.length > 60 ? title.slice(0, 60) + '…' : title) + '</span>'
      + '</div>'
      + '<label class="mc-modal__label">Prompt to send</label>'
      + '<textarea class="mc-modal__textarea" rows="4" placeholder="Enter the prompt to delegate…" autofocus></textarea>'
      + '<div class="mc-modal__hint">The session will resume with its prior context and execute your prompt.</div>'
      + '</div>'
      + '<div class="mc-modal__footer">'
      + '<button class="mc-btn mc-btn--secondary mc-modal__cancel">Cancel</button>'
      + '<button class="mc-btn mc-btn--primary mc-modal__send">▶ Send</button>'
      + '</div>'
      + '</div>';

    document.body.appendChild(overlay);

    var textarea = overlay.querySelector('.mc-modal__textarea');
    var sendBtn = overlay.querySelector('.mc-modal__send');
    var cancelBtn = overlay.querySelector('.mc-modal__cancel');
    var closeBtn = overlay.querySelector('.mc-modal__close');

    function close() { overlay.remove(); }
    function send() {
      var prompt = textarea.value.trim();
      if (!prompt) return;
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';
      delegateToSession(sessionId, prompt).then(close);
    }

    cancelBtn.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    sendBtn.addEventListener('click', send);
    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
      if (e.key === 'Escape') close();
    });
    setTimeout(function () { textarea.focus(); }, 50);
  }

  // ══════════════════════════════════════════════════════════════
  //  FULL RENDER
  // ══════════════════════════════════════════════════════════════

  function render() {
    if (!container) return;

    var sessions = getSessions();
    validateSelection(sessions);

    // Persist transient UI state
    var prevDraft = '';
    var openDetails = [];
    var streamEl = container.querySelector('.mc-stream');
    var wasAtBottom = !streamEl || (streamEl.scrollHeight - streamEl.scrollTop - streamEl.clientHeight < 40);
    var prevInput = container.querySelector('.mc-chat-input');
    if (prevInput) prevDraft = prevInput.value;
    var prevHistorySearch = '';
    var hSearchInput = container.querySelector('.mc-hsearch-input');
    if (hSearchInput) prevHistorySearch = hSearchInput.value;

    container.querySelectorAll('details[open]').forEach(function (d) {
      var key = d.dataset.toolKey || '';
      if (!key) { var code = d.querySelector('code'); if (code) key = code.textContent; }
      if (key) openDetails.push(key);
    });

    // Build layout
    container.innerHTML = '<div class="mc-layout">'
      + renderSidebar(sessions)
      + renderMainContent(sessions)
      + '</div>';

    // Restore state
    var newInput = container.querySelector('.mc-chat-input');
    if (newInput && prevDraft) newInput.value = prevDraft;
    var newHSearch = container.querySelector('.mc-hsearch-input');
    if (newHSearch && prevHistorySearch) newHSearch.value = prevHistorySearch;

    if (openDetails.length) {
      container.querySelectorAll('details').forEach(function (d) {
        var key = d.dataset.toolKey || '';
        if (!key) { var code = d.querySelector('code'); if (code) key = code.textContent; }
        if (key && openDetails.indexOf(key) !== -1) d.open = true;
      });
    }

    var newStreamEl = container.querySelector('.mc-stream');
    if (newStreamEl) {
      if (isPinned || wasAtBottom) newStreamEl.scrollTop = newStreamEl.scrollHeight;
      newStreamEl.addEventListener('scroll', function () {
        isPinned = (newStreamEl.scrollHeight - newStreamEl.scrollTop - newStreamEl.clientHeight < 40);
        var pinBtn = container.querySelector('.mc-pin-btn');
        if (pinBtn) {
          pinBtn.classList.toggle('mc-pin-btn--active', isPinned);
          pinBtn.setAttribute('aria-pressed', String(isPinned));
        }
      });
    }

    // Attach event handlers
    bindSidebarEvents(sessions);
    bindMainEvents(sessions);

    // Render history sub-parts if on history tab
    if (activeTab === 'history') {
      renderHistoryStatsBar();
      renderHistoryList();
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  EVENT BINDING
  // ══════════════════════════════════════════════════════════════

  function bindSidebarEvents(sessions) {
    var toggleBtn = container.querySelector('.mc-sidebar__toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        panelCollapsed = !panelCollapsed;
        savePanelState();
        render();
      });
    }

    // Tab switching
    container.querySelectorAll('[data-mc-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var newTab = btn.dataset.mcTab;
        if (newTab !== activeTab) {
          activeTab = newTab;
          saveActiveTab();
          if (newTab === 'history' && historySessions.length === 0) {
            fetchHistoryStats();
            fetchHistorySessions();
          }
          render();
        }
      });
    });

    // Refresh button
    var refreshBtn = container.querySelector('[data-mc-refresh]');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        refreshBtn.classList.add('mc-refresh-btn--spinning');
        refreshBtn.disabled = true;
        if (typeof window.AppConnection !== 'undefined' && typeof window.AppConnection.reconnect === 'function') {
          window.AppConnection.reconnect();
        }
        fetchHistorySessions();
        setTimeout(function () {
          refreshBtn.classList.remove('mc-refresh-btn--spinning');
          refreshBtn.disabled = false;
          showToast('Refreshed — checking for parallel sessions');
          render();
        }, 1500);
      });
    }

    // Live session card clicks
    container.querySelectorAll('[data-mc-live-sid]').forEach(function (card) {
      function select(e) {
        if (e.target.closest('.mc-session-action')) return;
        selectedLiveId = card.dataset.mcLiveSid;
        isPinned = true;
        render();
      }
      card.addEventListener('click', select);
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(e); }
      });
    });

    // Per-session stop buttons
    container.querySelectorAll('[data-mc-card-stop]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (btn.dataset.mcCardStop && window.SessionControl) window.SessionControl.stop(btn.dataset.mcCardStop);
      });
    });

    // History session row clicks
    container.querySelectorAll('[data-mc-history-sid]').forEach(function (row) {
      row.addEventListener('click', function () { fetchHistoryDetail(row.dataset.mcHistorySid); });
    });

    // History search
    var hSearchInput = container.querySelector('.mc-hsearch-input');
    if (hSearchInput) {
      hSearchInput.addEventListener('input', function (e) {
        clearTimeout(searchDebounceTimer);
        var val = e.target.value.trim();
        searchDebounceTimer = setTimeout(function () {
          historySearch = val;
          historyPage = 0;
          if (val.length >= 2) searchHistorySessions(val);
          else if (val.length === 0) fetchHistorySessions();
        }, 400);
      });
    }

    // History pagination
    container.querySelectorAll('[data-mc-action="history-prev"]').forEach(function (btn) {
      btn.addEventListener('click', function () { if (historyPage > 0) { historyPage--; fetchHistorySessions(); } });
    });
    container.querySelectorAll('[data-mc-action="history-next"]').forEach(function (btn) {
      btn.addEventListener('click', function () { historyPage++; fetchHistorySessions(); });
    });

    // Clear delegations
    container.querySelectorAll('[data-mc-action="clear-delegations"]').forEach(function (btn) {
      btn.addEventListener('click', function () { delegations = []; saveDelegations(); render(); });
    });
  }

  function bindMainEvents(sessions) {
    // Filter pills
    container.querySelectorAll('[data-mc-filter]').forEach(function (pill) {
      pill.addEventListener('click', function () {
        var key = pill.dataset.mcFilter;
        if (key && filters[key] !== undefined) { filters[key] = !filters[key]; saveFilters(); render(); }
      });
    });

    // Auto-approve toggle
    var autoApproveBtn = container.querySelector('[data-mc-auto-approve]');
    if (autoApproveBtn) {
      autoApproveBtn.addEventListener('click', function () {
        var current = getAutoApproveState(sessions);
        var newVal = !current;
        saveAutoApprove(newVal);
        Object.keys(sessions).forEach(function (sid) {
          if (sessions[sid] && sessions[sid].metadata && sessions[sid].metadata.status === 'active') {
            if (window.ToolApproval) window.ToolApproval.setAutoApprove(sid, newVal);
          }
        });
        render();
      });
    }

    // Approval card buttons
    container.querySelectorAll('.mc-approval-card').forEach(function (card) {
      var tid = card.dataset.approvalId;
      var sid = card.dataset.approvalSid;
      card.querySelectorAll('.mc-approval-btn').forEach(function (btn) {
        var decision = btn.dataset.decision;
        if (decision && window.ToolApproval) {
          btn.addEventListener('click', function (e) { e.stopPropagation(); window.ToolApproval.respond(sid, tid, decision); render(); });
        }
      });
    });

    // Bulk approve/deny
    var approveAllBtn = container.querySelector('.mc-approval-btn--approve-all');
    if (approveAllBtn) {
      approveAllBtn.addEventListener('click', function () {
        var ids = (selectedLiveId !== ALL_SESSIONS_ID) ? [selectedLiveId] : Object.keys(sessions);
        ids.forEach(function (sid) { if (window.ToolApproval) window.ToolApproval.approveAll(sid); });
        render();
      });
    }
    var denyAllBtn = container.querySelector('.mc-approval-btn--deny-all');
    if (denyAllBtn) {
      denyAllBtn.addEventListener('click', function () {
        var ids = (selectedLiveId !== ALL_SESSIONS_ID) ? [selectedLiveId] : Object.keys(sessions);
        ids.forEach(function (sid) { if (window.ToolApproval) window.ToolApproval.denyAll(sid); });
        render();
      });
    }

    // User-input: choice buttons
    container.querySelectorAll('.mc-input-choice-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var card = btn.closest('.mc-input-card');
        if (!card || !window.UserInput) return;
        window.UserInput.respond(card.dataset.inputSid, card.dataset.inputId, btn.dataset.inputChoice, false);
        render();
      });
    });

    // User-input: freeform
    container.querySelectorAll('.mc-input-submit').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var card = btn.closest('.mc-input-card');
        if (!card || !window.UserInput) return;
        var input = card.querySelector('.mc-input-text');
        var answer = input ? input.value.trim() : '';
        if (!answer) return;
        window.UserInput.respond(card.dataset.inputSid, card.dataset.inputId, answer, true);
        render();
      });
    });
    container.querySelectorAll('.mc-input-text').forEach(function (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var card = input.closest('.mc-input-card');
        if (!card || !window.UserInput) return;
        var answer = input.value.trim();
        if (!answer) return;
        window.UserInput.respond(card.dataset.inputSid, card.dataset.inputId, answer, true);
        render();
      });
    });

    // Pin button
    var pinBtn = container.querySelector('.mc-pin-btn');
    if (pinBtn) {
      pinBtn.addEventListener('click', function () {
        isPinned = !isPinned;
        pinBtn.classList.toggle('mc-pin-btn--active', isPinned);
        pinBtn.setAttribute('aria-pressed', String(isPinned));
        var streamEl = container.querySelector('.mc-stream');
        if (isPinned && streamEl) streamEl.scrollTop = streamEl.scrollHeight;
      });
    }

    // Stop button
    var stopBtn = container.querySelector('[data-mc-stop]');
    if (stopBtn) {
      stopBtn.addEventListener('click', function () {
        var targetIds = (selectedLiveId !== ALL_SESSIONS_ID) ? [selectedLiveId] : Object.keys(sessions);
        targetIds.forEach(function (sid) {
          var s = sessions[sid];
          if (s && s.metadata && s.metadata.status !== 'ended') {
            if (window.SessionControl) window.SessionControl.stop(sid);
          }
        });
      });
    }

    // Delegate action
    container.querySelectorAll('[data-mc-action="delegate"]').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); showDelegateModal(btn.dataset.sid); });
    });

    // Close history detail
    container.querySelectorAll('[data-mc-action="close-detail"]').forEach(function (btn) {
      btn.addEventListener('click', function () { historySelectedId = null; historyDetail = null; render(); });
    });

    // Copy session ID
    container.querySelectorAll('[data-mc-action="copy-id"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        navigator.clipboard.writeText(btn.dataset.sid).then(function () { showToast('Session ID copied'); });
      });
    });

    // Chat input
    var chatInput = container.querySelector('.mc-chat-input');
    var sendBtn   = container.querySelector('.mc-chat-send');

    function sendChat() {
      if (!chatInput || chatInput.disabled) return;
      var msg = chatInput.value.trim();
      if (!msg) return;
      chatInput.value = '';

      if (selectedLiveId && selectedLiveId !== ALL_SESSIONS_ID) {
        var s = sessions[selectedLiveId];
        if (s && s.metadata && s.metadata.status !== 'ended') {
          if (typeof window.AppConnection !== 'undefined' && typeof window.AppConnection.send === 'function') {
            window.AppConnection.send({ type: 'chat:send', sessionId: selectedLiveId, data: { message: msg } });
          }
          return;
        }
      }
      if (typeof window.dispatchCopilotAction === 'function') window.dispatchCopilotAction(msg);
    }

    if (sendBtn) sendBtn.addEventListener('click', sendChat);
    if (chatInput) chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
    });
  }

  // ── Tick ──────────────────────────────────────────────────────

  function startTick() { stopTick(); tickTimer = setInterval(function () { if (container) render(); }, 30000); }
  function stopTick() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }

  // ── Debounced render ──────────────────────────────────────────

  var _renderRaf = null;
  function scheduleRender() {
    if (_renderRaf) return;
    _renderRaf = requestAnimationFrame(function () { _renderRaf = null; if (container) render(); });
  }

  // ══════════════════════════════════════════════════════════════
  //  LIFECYCLE
  // ══════════════════════════════════════════════════════════════

  function mount(el) {
    container = el;
    container.classList.add('mc-host');
    isPinned = true;
    loadPanelState();
    loadActiveTab();
    loadFilters();
    loadDelegations();
    render();
    startTick();
    if (typeof window.AppState !== 'undefined' && typeof window.AppState.subscribe === 'function') {
      unsubscribe = window.AppState.subscribe(function (type) {
        scheduleRender();
        if (type === 'delegation:complete' || type === 'delegation:error') {
          if (activeTab === 'history') fetchHistorySessions();
        }
      });
    }
    fetchHistoryStats();
  }

  function unmount() {
    if (typeof unsubscribe === 'function') { unsubscribe(); unsubscribe = null; }
    if (_renderRaf) { cancelAnimationFrame(_renderRaf); _renderRaf = null; }
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    stopTick();
    if (container) container.classList.remove('mc-host');
    container = null;
  }

  function onActivate() {
    isPinned = true;
    if (container) render();
    if (activeTab === 'history') { fetchHistoryStats(); fetchHistorySessions(); }
  }

  window.missionControlView = { mount: mount, unmount: unmount, onActivate: onActivate };
})();
