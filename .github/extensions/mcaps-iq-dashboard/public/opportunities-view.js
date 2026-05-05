/* ============================================================
 *  Opportunities View — Pipeline Health Dashboard
 *  Live CRM data via MCP Client bridge. Sortable table, MCEM
 *  stage badges, health indicators, milestone drill-down.
 * ============================================================ */
(function () {
  'use strict';

  var _el = null;
  var _data = { opportunities: [], summary: {} };
  var _milestoneCache = {};
  var _taskCache = {};
  var _pendingOps = [];
  var _sortCol = 'estimated_close';
  var _sortDir = 'asc';
  var _expanded = new Set();
  var _taskExpanded = new Set(); // milestone IDs with task panel open
  var _loading = false;
  var _error = null;
  var _filters = { stage: '', health: '', search: '' };
  var _visibleCount = 20;
  var _scrollBatch = 20;
  var _editingMs = null; // { milestoneId, field } when inline editing
  var _detailDrawer = null; // { type: 'opportunity'|'milestone', id, data, loading }
  var _dealTeamCache = {}; // oppId → [{ name, email, role, isOwner }]

  var STAGE_COLORS = {
    '1': { bg: '#dbeafe', text: '#1e40af', label: 'S1 — Listen & Consult' },
    '2': { bg: '#e0e7ff', text: '#3730a3', label: 'S2 — Inspire & Design' },
    '3': { bg: '#ede9fe', text: '#5b21b6', label: 'S3 — Empower & Achieve' },
    '4': { bg: '#fae8ff', text: '#86198f', label: 'S4 — Realize Value' },
    '5': { bg: '#fce7f3', text: '#9d174d', label: 'S5 — Manage & Optimize' }
  };

  var MS_STATUS = {
    861980000: { label: 'On Track', cls: 'ms-on-track' },
    861980001: { label: 'At Risk', cls: 'ms-at-risk' },
    861980002: { label: 'Blocked', cls: 'ms-blocked' },
    861980003: { label: 'Completed', cls: 'ms-completed' },
    861980004: { label: 'Cancelled', cls: 'ms-cancelled' },
    861980005: { label: 'Not Started', cls: 'ms-not-started' },
    861980007: { label: 'Closed Incomplete', cls: 'ms-closed' }
  };

  var COMMITMENT = { 861980000: 'Uncommitted', 861980003: 'Committed', 861980002: 'Pipeline' };

  // ── Helpers ──────────────────────────────────────────────────

  function esc(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function currency(val) {
    if (val == null || val === 0) return '$0';
    if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'M';
    if (val >= 1000) return '$' + Math.round(val / 1000) + 'K';
    return '$' + Math.round(val);
  }

  function fmtDate(d) {
    if (!d) return '—';
    var p = d.slice(0, 10).split('-');
    return p.length === 3 ? p[1] + '/' + p[2] + '/' + p[0] : d;
  }

  function stageNum(stage) {
    if (!stage) return '?';
    var m = String(stage).match(/(\d)/);
    if (m) return m[1];
    // Map full CRM stage names to numbers
    var lower = String(stage).toLowerCase();
    if (lower.indexOf('listen') !== -1 || lower.indexOf('consult') !== -1) return '1';
    if (lower.indexOf('inspire') !== -1 || lower.indexOf('design') !== -1) return '2';
    if (lower.indexOf('empower') !== -1 || lower.indexOf('achieve') !== -1) return '3';
    if (lower.indexOf('realize') !== -1) return '4';
    if (lower.indexOf('manage') !== -1 || lower.indexOf('optimize') !== -1) return '5';
    return '?';
  }

  function parseMonthly(val) {
    if (val == null) return 0;
    if (typeof val === 'number') return val;
    // Parse "$11,000/month" or "$78,800" etc. to a number
    var cleaned = String(val).replace(/[^0-9.]/g, '');
    var num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  function normalizeHealth(h) {
    if (!h) return 'green';
    var lower = String(h).toLowerCase();
    if (lower === 'red' || lower === 'yellow' || lower === 'green') return lower;
    if (lower.indexOf('on track') !== -1) return 'green';
    if (lower.indexOf('at risk') !== -1) return 'yellow';
    if (lower.indexOf('blocked') !== -1) return 'red';
    return 'green';
  }

  function crmLink(opp) {
    var id = opp.id || opp.opportunityId || '';
    return 'https://microsoftsales.crm.dynamics.com/main.aspx?etn=opportunity&id=' +
      encodeURIComponent(id) + '&pagetype=entityrecord';
  }

  function healthFromMilestones(milestones) {
    if (!milestones || !milestones.length) return 'green';
    var hasBlocked = milestones.some(function (m) { return (m.msp_milestonestatus || m.status) === 861980002; });
    var hasAtRisk = milestones.some(function (m) { return (m.msp_milestonestatus || m.status) === 861980001; });
    if (hasBlocked) return 'red';
    if (hasAtRisk) return 'yellow';
    return 'green';
  }

  function healthIcon(h) {
    var icon = h === 'red' ? '🔴' : h === 'yellow' ? '🟡' : '🟢';
    var tip = h === 'red' ? 'Blocked — has blocked milestones' : h === 'yellow' ? 'At risk — has at-risk milestones' : 'On track';
    return '<span class="health-hint" data-tooltip="' + esc(tip) + '">' + icon + '</span>';
  }

  // ── Normalize CRM data ──────────────────────────────────────

  function normalizeOpp(raw) {
    var monthly = parseMonthly(raw.totalMonthlyUse || raw.monthlyUse);
    var estVal = raw.estimatedValue || raw.estimatedvalue || raw.revenue || 0;
    return {
      id: raw.id || raw.opportunityId || '',
      name: raw.name || raw.opportunityName || '',
      number: raw.opportunityNumber || raw.number || '',
      account: raw.customer || raw.accountName || raw.account || '',
      stage: raw.stageName || raw.stage || '',
      stageNum: stageNum(raw.stageName || raw.stage || ''),
      estimatedValue: estVal || (monthly * 12),
      monthlyUse: monthly,
      estimatedClose: raw.estimatedCloseDate || raw.estimated_close || '',
      health: normalizeHealth(raw.health),
      relationship: (raw.relationship === 'both' ? 'owner' : raw.relationship) || '',
      dealTeam: raw.dealTeam || [],
      milestones: [],
      _raw: raw
    };
  }

  // ── Data loading ────────────────────────────────────────────

  function loadData() {
    _loading = true;
    _error = null;
    render();

    fetch('/api/crm/opportunities')
      .then(function (r) {
        if (!r.ok) throw new Error('CRM returned ' + r.status);
        return r.json();
      })
      .then(function (data) {
        // Handle various response shapes from the MCP server
        var opps = [];
        if (Array.isArray(data)) {
          opps = data;
        } else if (data.opportunities) {
          opps = data.opportunities;
        } else if (data.content) {
          // MCP text content — try to parse
          try {
            var parsed = typeof data.content === 'string' ? JSON.parse(data.content) : data.content;
            opps = Array.isArray(parsed) ? parsed : parsed.opportunities || [];
          } catch { opps = []; }
        }

        _data.opportunities = opps.map(normalizeOpp);
        _data.summary = buildSummary(_data.opportunities);
        _loading = false;
        _visibleCount = _scrollBatch;
        render();

        // Pre-fetch milestones for visible opps
        loadVisibleMilestones();
      })
      .catch(function (err) {
        _error = err.message;
        _loading = false;
        render();
      });
  }

  function getVisibleOpps() {
    var filtered = applyFilters(_data.opportunities);
    var sorted = sortOpps(filtered);
    return sorted.slice(0, _visibleCount);
  }

  function loadVisibleMilestones() {
    var visibleOpps = getVisibleOpps();
    visibleOpps.forEach(function (opp) {
      if (_milestoneCache[opp.id]) {
        // Already cached — just recompute health
        if (_milestoneCache[opp.id] !== 'loading') {
          opp.health = healthFromMilestones(_milestoneCache[opp.id]);
        }
        return;
      }
      _milestoneCache[opp.id] = 'loading';

      fetch('/api/crm/milestones?opportunityId=' + encodeURIComponent(opp.id))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          var milestones = parseMilestoneResponse(data);
          _milestoneCache[opp.id] = milestones;
          opp.health = healthFromMilestones(milestones);
          render();
        })
        .catch(function () {
          _milestoneCache[opp.id] = [];
          render();
        });
    });
  }

  function parseMilestoneResponse(data) {
    if (Array.isArray(data)) return data;
    if (data?.milestones) return data.milestones;
    if (data?.content) {
      try {
        var p = typeof data.content === 'string' ? JSON.parse(data.content) : data.content;
        return Array.isArray(p) ? p : p.milestones || [];
      } catch { return []; }
    }
    return [];
  }

  function loadMilestones(oppId) {
    if (_milestoneCache[oppId]) return;
    _milestoneCache[oppId] = 'loading';
    render();

    fetch('/api/crm/milestones?opportunityId=' + encodeURIComponent(oppId))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var milestones = parseMilestoneResponse(data);
        _milestoneCache[oppId] = milestones;

        // Update health based on actual milestones
        var opp = _data.opportunities.find(function (o) { return o.id === oppId; });
        if (opp) opp.health = healthFromMilestones(milestones);

        render();
      })
      .catch(function () {
        _milestoneCache[oppId] = [];
        render();
      });
  }

  // ── Summary ─────────────────────────────────────────────────

  function buildSummary(opps) {
    var accounts = new Set();
    var totalValue = 0, totalMonthly = 0;
    opps.forEach(function (o) {
      accounts.add(o.account);
      totalValue += o.estimatedValue || 0;
      totalMonthly += o.monthlyUse || 0;
    });
    return {
      count: opps.length,
      accountCount: accounts.size,
      totalValue: totalValue,
      totalMonthly: totalMonthly
    };
  }

  // ── Filtering & Sorting ─────────────────────────────────────

  function applyFilters(opps) {
    return opps.filter(function (o) {
      if (_filters.stage && o.stageNum !== _filters.stage) return false;
      if (_filters.health && o.health !== _filters.health) return false;
      if (_filters.search) {
        var q = _filters.search.toLowerCase();
        var hay = [o.name, o.account, o.number].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function sortOpps(opps) {
    var dir = _sortDir === 'asc' ? 1 : -1;
    return opps.slice().sort(function (a, b) {
      // Vault-tracked customers float to top regardless of sort column
      var aVault = window.VaultCustomers && window.VaultCustomers.isTracked(a.account) ? 1 : 0;
      var bVault = window.VaultCustomers && window.VaultCustomers.isTracked(b.account) ? 1 : 0;
      if (aVault !== bVault) return bVault - aVault;

      var av, bv;
      switch (_sortCol) {
        case 'name': av = (a.name || '').toLowerCase(); bv = (b.name || '').toLowerCase(); break;
        case 'account': av = (a.account || '').toLowerCase(); bv = (b.account || '').toLowerCase(); break;
        case 'stage': av = a.stageNum; bv = b.stageNum; break;
        case 'estimated_close': av = a.estimatedClose || '9999'; bv = b.estimatedClose || '9999'; break;
        case 'monthly_use': av = a.monthlyUse || 0; bv = b.monthlyUse || 0; break;
        case 'health': av = { red: 0, yellow: 1, green: 2 }[a.health] ?? 3; bv = { red: 0, yellow: 1, green: 2 }[b.health] ?? 3; break;
        default: av = 0; bv = 0;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  // ── Task Panel ───────────────────────────────────────────────

  function renderTaskPanel(msId) {
    var tasks = _taskCache[msId];
    var html = '<tr class="task-sub-row"><td colspan="7"><div class="task-panel">';
    html += '<div class="task-panel-header"><strong>Tasks</strong></div>';

    if (tasks === 'loading') {
      html += '<div class="ms-loading">Loading tasks…</div>';
    } else if (!tasks || tasks.length === 0) {
      html += '<div class="ms-empty">No tasks found</div>';
    } else {
      html += '<table class="task-table"><thead><tr><th>Subject</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>';
      tasks.forEach(function (t) {
        var tId = t.activityid || t.id || '';
        var tSubject = t.subject || '—';
        var tDue = t.scheduledend || '';
        var tStatus = t.statuscode === 5 ? 'Completed' : t.statecode === 0 ? 'Open' : 'Closed';
        var isDone = t.statuscode === 5 || t.statecode !== 0;

        html += '<tr class="' + (isDone ? 'task-done' : '') + '">';
        html += '<td>' + esc(tSubject) + '</td>';
        html += '<td>' + fmtDate(tDue) + '</td>';
        html += '<td><span class="task-status-badge ' + (isDone ? 'task-closed' : 'task-open') + '">' + tStatus + '</span></td>';
        html += '<td>';
        if (!isDone) {
          html += '<button class="ms-action-sm" data-action="close-task" data-task-id="' + esc(tId) + '" title="Close task">✓</button>';
        }
        html += '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
    }

    // Inline add-task form
    html += '<div class="task-add-form">';
    html += '<input type="text" class="task-add-subject" data-ms-id="' + esc(msId) + '" placeholder="New task subject…">';
    html += '<input type="date" class="task-add-date" data-ms-id="' + esc(msId) + '">';
    html += '<button class="ms-action-sm task-add-btn" data-action="submit-task" data-ms-id="' + esc(msId) + '">+ Add</button>';
    html += '</div>';

    html += '</div></td></tr>';
    return html;
  }

  // ── API helpers (staged writes) ─────────────────────────────

  function loadTasks(msId) {
    if (_taskCache[msId] && _taskCache[msId] !== 'loading') return;
    _taskCache[msId] = 'loading';
    render();

    fetch('/api/crm/milestones/' + encodeURIComponent(msId) + '/activities')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var tasks = [];
        if (data) {
          // Response shape varies — handle { byMilestone: { id: [...] } } or flat array or { tasks: [...] }
          if (Array.isArray(data)) tasks = data;
          else if (data.tasks) tasks = data.tasks;
          else if (data.byMilestone) {
            var byMs = data.byMilestone[msId] || data.byMilestone[Object.keys(data.byMilestone)[0]];
            tasks = Array.isArray(byMs) ? byMs : [];
          }
        }
        _taskCache[msId] = tasks;
        render();
      })
      .catch(function () {
        _taskCache[msId] = [];
        render();
      });
  }

  function stageMilestoneUpdate(msId, field, value) {
    var payload = {};
    payload[field] = Number(value);
    fetch('/api/crm/milestones/' + encodeURIComponent(msId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: payload })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.staged || data.operationId) {
          _pendingOps.push(data);
          showToast('Change staged: ' + (data.operationId || 'pending'));
        } else if (data.mock) {
          showToast('Preview: ' + JSON.stringify(data.preview || data).substring(0, 80));
        }
        refreshPendingOps();
        render();
      })
      .catch(function (err) { showToast('Error: ' + err.message, 'error'); });
  }

  function stageCreateTask(msId, subject, scheduledEnd, opts) {
    var body = { subject: subject, milestoneId: msId };
    if (scheduledEnd) body.scheduledEnd = scheduledEnd;
    if (opts) {
      if (opts.description) body.description = opts.description;
      if (opts.msp_taskcategory != null) body.msp_taskcategory = opts.msp_taskcategory;
    }
    fetch('/api/crm/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.staged || data.operationId) {
          _pendingOps.push(data);
          showToast('Task staged: ' + subject);
        } else {
          showToast('Task queued: ' + subject);
        }
        refreshPendingOps();
        delete _taskCache[msId]; // force reload
        render();
      })
      .catch(function (err) { showToast('Error: ' + err.message, 'error'); });
  }

  function stageCloseTask(taskId) {
    fetch('/api/crm/tasks/' + encodeURIComponent(taskId) + '/close', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.staged || data.operationId) {
          _pendingOps.push(data);
          showToast('Close task staged');
        }
        refreshPendingOps();
        _taskCache = {}; // force reload
        render();
      })
      .catch(function (err) { showToast('Error: ' + err.message, 'error'); });
  }

  function refreshPendingOps() {
    fetch('/api/crm/operations')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.operations) _pendingOps = data.operations;
        else if (Array.isArray(data)) _pendingOps = data;
        render();
      })
      .catch(function () { /* silent */ });
  }

  function executeAllOps() {
    fetch('/api/crm/operations/execute-all', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function () {
        _pendingOps = [];
        _milestoneCache = {};
        _taskCache = {};
        showToast('All changes applied');
        loadData();
      })
      .catch(function (err) { showToast('Execute failed: ' + err.message, 'error'); });
  }

  function discardAllOps() {
    fetch('/api/crm/operations/cancel-all', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function () {
        _pendingOps = [];
        showToast('All changes discarded');
        render();
      })
      .catch(function (err) { showToast('Discard failed: ' + err.message, 'error'); });
  }

  // ── Add Task Modal ───────────────────────────────────────────

  function showAddTaskModal(oppId) {
    var opp = _data.opportunities.find(function (o) { return o.id === oppId; });
    if (!opp) return;

    // Ensure milestones are loaded
    var milestones = _milestoneCache[oppId];
    if (!milestones || milestones === 'loading') {
      loadMilestones(oppId);
      showToast('Loading milestones…');
      return;
    }

    var overlay = document.createElement('div');
    overlay.className = 'task-modal-overlay';

    var activeMilestones = milestones.filter(function (m) {
      var sc = m.msp_milestonestatus || m.statuscode;
      return sc !== 861980003 && sc !== 861980004 && sc !== 861980007; // not completed/cancelled/closed
    });

    var msOptions = activeMilestones.map(function (m) {
      var msId = m.msp_engagementmilestoneid || m.id || '';
      var msName = m.msp_name || m.name || 'Unnamed';
      return '<option value="' + esc(msId) + '">' + esc(msName) + '</option>';
    }).join('');

    if (!msOptions) {
      msOptions = milestones.map(function (m) {
        var msId = m.msp_engagementmilestoneid || m.id || '';
        var msName = m.msp_name || m.name || 'Unnamed';
        return '<option value="' + esc(msId) + '">' + esc(msName) + '</option>';
      }).join('');
    }

    if (!msOptions) {
      showToast('No milestones found for this opportunity', 'error');
      return;
    }

    var today = new Date().toISOString().slice(0, 10);

    overlay.innerHTML =
      '<div class="task-modal" role="dialog" aria-modal="true" aria-label="Add Task">' +
        '<div class="task-modal__header">' +
          '<h3 class="task-modal__title">Add Task</h3>' +
          '<button class="task-modal__close" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="task-modal__context">' +
          '<span class="task-modal__opp-label">' + esc(opp.name) + '</span>' +
        '</div>' +
        '<div class="task-modal__body">' +
          '<label class="task-modal__label">Milestone <span class="task-modal__req">*</span></label>' +
          '<select class="task-modal__select" id="task-modal-ms">' + msOptions + '</select>' +
          '<div class="task-modal__row">' +
            '<div class="task-modal__field task-modal__field--grow">' +
              '<label class="task-modal__label">Subject <span class="task-modal__req">*</span></label>' +
              '<input class="task-modal__input" id="task-modal-subject" type="text" placeholder="e.g. Schedule POC demo" autofocus />' +
            '</div>' +
            '<div class="task-modal__field">' +
              '<label class="task-modal__label">Task Type</label>' +
              '<select class="task-modal__select" id="task-modal-category">' +
                '<option value="">— Select —</option>' +
                '<option value="861980004">Architecture Design Session</option>' +
                '<option value="861980005">PoC/Pilot</option>' +
                '<option value="606820005">Technical Close/Win Plan</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<label class="task-modal__label">Description</label>' +
          '<textarea class="task-modal__textarea" id="task-modal-desc" rows="3" placeholder="Optional details…"></textarea>' +
          '<label class="task-modal__label">Due Date</label>' +
          '<input class="task-modal__input" id="task-modal-date" type="date" value="' + today + '" />' +
        '</div>' +
        '<div class="task-modal__footer">' +
          '<span class="task-modal__gate-note">⚡ Staged — requires approval before CRM write</span>' +
          '<button class="task-modal__btn task-modal__btn--cancel">Cancel</button>' +
          '<button class="task-modal__btn task-modal__btn--submit">Stage Task</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var modal = overlay.querySelector('.task-modal');
    var subjectInput = modal.querySelector('#task-modal-subject');

    // Focus subject input
    requestAnimationFrame(function () { if (subjectInput) subjectInput.focus(); });

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    function submit() {
      var msId = modal.querySelector('#task-modal-ms').value;
      var subject = (subjectInput.value || '').trim();
      var desc = (modal.querySelector('#task-modal-desc').value || '').trim();
      var dueDate = modal.querySelector('#task-modal-date').value;
      var categoryVal = modal.querySelector('#task-modal-category').value;

      if (!subject) {
        subjectInput.classList.add('task-modal__input--error');
        subjectInput.focus();
        return;
      }

      var opts = {};
      if (desc) opts.description = desc;
      if (categoryVal) opts.msp_taskcategory = parseInt(categoryVal, 10);

      stageCreateTask(msId, subject, dueDate, opts);
      close();
    }

    // Event handlers
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    modal.querySelector('.task-modal__close').addEventListener('click', close);
    modal.querySelector('.task-modal__btn--cancel').addEventListener('click', close);
    modal.querySelector('.task-modal__btn--submit').addEventListener('click', submit);

    // Enter to submit from subject input
    subjectInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });

    // Escape to close
    function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } }
    document.addEventListener('keydown', onKey);
  }

  // ── Detail Drawer ─────────────────────────────────────────────

  var OPP_DETAIL_SELECT = [
    'opportunityid', 'name', 'msp_opportunitynumber', 'description',
    'msp_activesalesstage', 'estimatedclosedate', 'msp_estcompletiondate',
    'estimatedvalue', 'msp_consumptionconsumedrecurring', 'msp_salesplay',
    'statecode', '_ownerid_value', '_parentaccountid_value'
  ].join(',');

  var MS_DETAIL_SELECT = [
    'msp_engagementmilestoneid', 'msp_name', 'msp_milestonenumber',
    'msp_milestonestatus', 'msp_commitmentrecommendation', 'msp_milestonedate',
    'msp_monthlyuse', 'msp_milestoneworkload', 'msp_deliveryspecifiedfield',
    'msp_forecastcomments', 'msp_forecastcommentsjsonfield',
    'msp_milestonepreferredazureregion', 'msp_milestoneazurecapacitytype',
    '_ownerid_value', '_msp_opportunityid_value', '_msp_workloadlkid_value'
  ].join(',');

  function openDetailDrawer(type, id, contextName) {
    _detailDrawer = { type: type, id: id, data: null, loading: true, name: contextName || '' };
    renderDrawer();

    var entitySet = type === 'opportunity' ? 'opportunities' : 'msp_engagementmilestones';
    var select = type === 'opportunity' ? OPP_DETAIL_SELECT : MS_DETAIL_SELECT;
    var url = '/api/crm/records/' + entitySet + '/' + encodeURIComponent(id) + '?select=' + encodeURIComponent(select);

    var fetches = [fetch(url).then(function (r) { return r.ok ? r.json() : null; })];

    // For opportunities, also fetch deal team + annotations (notes/comments)
    if (type === 'opportunity') {
      var dtUrl = '/api/crm/query?entitySet=msp_dealteams' +
        '&filter=' + encodeURIComponent("_msp_parentopportunityid_value eq " + id + " and statecode eq 0") +
        '&select=' + encodeURIComponent('_msp_dealteamuserid_value,msp_isowner');
      fetches.push(
        fetch(dtUrl).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      );
      var notesUrl = '/api/crm/query?entitySet=annotations' +
        '&filter=' + encodeURIComponent("_objectid_value eq " + id) +
        '&select=' + encodeURIComponent('subject,notetext,createdon,_createdby_value') +
        '&top=20';
      fetches.push(
        fetch(notesUrl).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      );
    }

    // For milestones, also fetch activities
    if (type === 'milestone') {
      fetches.push(
        fetch('/api/crm/milestones/' + encodeURIComponent(id) + '/activities')
          .then(function (r) { return r.ok ? r.json() : null; })
          .catch(function () { return null; })
      );
    }

    Promise.all(fetches)
      .then(function (results) {
        if (!_detailDrawer || _detailDrawer.id !== id) return;
        _detailDrawer.loading = false;
        _detailDrawer.data = results[0];
        if (type === 'opportunity') {
          if (results[1]) _detailDrawer.dealTeam = parseDealTeamResponse(results[1]);
          if (results[2]) _detailDrawer.notes = parseNotesResponse(results[2]);
        }
        if (type === 'milestone' && results[1]) {
          _detailDrawer.activities = parseActivitiesResponse(results[1]);
        }
        renderDrawer();
      })
      .catch(function () {
        if (_detailDrawer && _detailDrawer.id === id) {
          _detailDrawer.loading = false;
          _detailDrawer.error = 'Failed to load details';
          renderDrawer();
        }
      });
  }

  function closeDetailDrawer() {
    _detailDrawer = null;
    var overlay = document.querySelector('.dd-overlay');
    if (overlay) overlay.remove();
  }

  function parseDealTeamResponse(data) {
    if (!data) return [];
    var records = Array.isArray(data) ? data : data.value || [];
    return records.map(function (r) {
      return {
        name: r['_msp_dealteamuserid_value@OData.Community.Display.V1.FormattedValue'] || r.userName || '—',
        userId: r._msp_dealteamuserid_value || '',
        isOwner: r.msp_isowner === true || r.msp_isowner === 1
      };
    });
  }

  function parseActivitiesResponse(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (data.tasks) return data.tasks;
    if (data.byMilestone) {
      var keys = Object.keys(data.byMilestone);
      return keys.length ? (data.byMilestone[keys[0]] || []) : [];
    }
    return [];
  }

  function fmtField(label, value) {
    if (value == null || value === '') return '';
    return '<div class="dd-field"><span class="dd-field__label">' + esc(label) + '</span>' +
      '<span class="dd-field__value">' + esc(String(value)) + '</span></div>';
  }

  function parseCommentHistory(jsonStr) {
    if (!jsonStr) return [];
    try {
      var arr = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
      if (!Array.isArray(arr)) return [];
      return arr.map(function (c) {
        return {
          user: c.userName || c.userId || '—',
          date: c.modifiedOn || c.date || '',
          comment: c.comment || c.text || ''
        };
      });
    } catch (e) {
      return [];
    }
  }

  function parseNotesResponse(data) {
    if (!data) return [];
    var records = Array.isArray(data) ? data : data.value || [];
    return records.map(function (r) {
      return {
        subject: r.subject || '',
        text: r.notetext || '',
        createdOn: r.createdon || '',
        createdBy: r['_createdby_value@OData.Community.Display.V1.FormattedValue'] || ''
      };
    }).sort(function (a, b) {
      return (b.createdOn || '').localeCompare(a.createdOn || '');
    });
  }

  function renderOppDetail(d, dealTeam, notes) {
    var html = '';
    var formatted = function (key) {
      return d[key + '@OData.Community.Display.V1.FormattedValue'] || d[key] || '';
    };

    html += '<div class="dd-section">';
    html += '<h4 class="dd-section__title">Key Details</h4>';
    html += fmtField('Opportunity #', d.msp_opportunitynumber);
    html += fmtField('Sales Stage', formatted('msp_activesalesstage'));
    html += fmtField('Sales Play', formatted('msp_salesplay'));
    html += fmtField('Est. Close Date', fmtDate(d.msp_estcompletiondate || d.estimatedclosedate));
    html += fmtField('Est. Value', currency(d.estimatedvalue));
    html += fmtField('Recurring ACR', d.msp_consumptionconsumedrecurring != null ? currency(d.msp_consumptionconsumedrecurring) : '');
    html += fmtField('Owner', formatted('_ownerid_value'));
    html += fmtField('Account', formatted('_parentaccountid_value'));
    html += '</div>';

    if (d.description) {
      html += '<div class="dd-section">';
      html += '<h4 class="dd-section__title">Description</h4>';
      html += '<div class="dd-description">' + esc(d.description) + '</div>';
      html += '</div>';
    }

    // Notes / Comments (CRM annotations)
    if (notes && notes.length > 0) {
      html += '<div class="dd-section">';
      html += '<h4 class="dd-section__title">Comments (' + notes.length + ')</h4>';
      html += '<div class="dd-comments">';
      notes.forEach(function (n) {
        html += '<div class="dd-comment">';
        html += '<div class="dd-comment__header">';
        html += '<span class="dd-comment__user">' + esc(n.createdBy || 'Unknown') + '</span>';
        html += '<span class="dd-comment__date">' + fmtDate(n.createdOn) + '</span>';
        html += '</div>';
        if (n.subject) {
          html += '<div class="dd-comment__subject">' + esc(n.subject) + '</div>';
        }
        if (n.text) {
          html += '<div class="dd-comment__body">' + esc(n.text) + '</div>';
        }
        html += '</div>';
      });
      html += '</div></div>';
    }

    if (dealTeam && dealTeam.length) {
      html += '<div class="dd-section">';
      html += '<h4 class="dd-section__title">Deal Team (' + dealTeam.length + ')</h4>';
      html += '<div class="dd-team-list">';
      dealTeam.forEach(function (member) {
        var ownerBadge = member.isOwner ? ' <span class="dd-owner-badge">Owner</span>' : '';
        html += '<div class="dd-team-member"><span class="dd-team-member__name">' +
          esc(member.name) + '</span>' + ownerBadge + '</div>';
      });
      html += '</div></div>';
    }

    return html;
  }

  function renderMsDetail(d, activities) {
    var html = '';
    var formatted = function (key) {
      return d[key + '@OData.Community.Display.V1.FormattedValue'] || d[key] || '';
    };

    html += '<div class="dd-section">';
    html += '<h4 class="dd-section__title">Key Details</h4>';
    html += fmtField('Milestone #', d.msp_milestonenumber);
    html += fmtField('Status', formatted('msp_milestonestatus'));
    html += fmtField('Commitment', formatted('msp_commitmentrecommendation'));
    html += fmtField('Due Date', fmtDate(d.msp_milestonedate));
    html += fmtField('Monthly Use', d.msp_monthlyuse != null ? currency(d.msp_monthlyuse) : '');
    html += fmtField('Workload', formatted('_msp_workloadlkid_value') || formatted('msp_milestoneworkload'));
    html += fmtField('Delivered By', formatted('msp_deliveryspecifiedfield'));
    html += fmtField('Azure Region', formatted('msp_milestonepreferredazureregion'));
    html += fmtField('Capacity Type', formatted('msp_milestoneazurecapacitytype'));
    html += fmtField('Owner', formatted('_ownerid_value'));
    html += '</div>';

    var comments = parseCommentHistory(d.msp_forecastcommentsjsonfield);
    if (comments.length > 0) {
      html += '<div class="dd-section">';
      html += '<h4 class="dd-section__title">Forecast Comments (' + comments.length + ')</h4>';
      html += '<div class="dd-comments">';
      comments.forEach(function (c) {
        html += '<div class="dd-comment">';
        html += '<div class="dd-comment__header">';
        html += '<span class="dd-comment__user">' + esc(c.user) + '</span>';
        html += '<span class="dd-comment__date">' + fmtDate(c.date) + '</span>';
        html += '</div>';
        html += '<div class="dd-comment__body">' + esc(c.comment) + '</div>';
        html += '</div>';
      });
      html += '</div></div>';
    } else if (d.msp_forecastcomments) {
      html += '<div class="dd-section">';
      html += '<h4 class="dd-section__title">Forecast Comments</h4>';
      html += '<div class="dd-description">' + esc(d.msp_forecastcomments) + '</div>';
      html += '</div>';
    }

    if (activities && activities.length > 0) {
      html += '<div class="dd-section">';
      html += '<h4 class="dd-section__title">Activities (' + activities.length + ')</h4>';
      html += '<table class="dd-activities-table"><thead><tr><th>Subject</th><th>Due</th><th>Status</th></tr></thead><tbody>';
      activities.forEach(function (a) {
        var subject = a.subject || '—';
        var due = a.scheduledend || '';
        var isDone = a.statuscode === 5 || a.statecode !== 0;
        var status = isDone ? 'Completed' : 'Open';
        html += '<tr class="' + (isDone ? 'task-done' : '') + '">';
        html += '<td>' + esc(subject) + '</td>';
        html += '<td>' + fmtDate(due) + '</td>';
        html += '<td><span class="task-status-badge ' + (isDone ? 'task-closed' : 'task-open') + '">' + status + '</span></td>';
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    }

    return html;
  }

  function renderDrawer() {
    if (!_detailDrawer) {
      var rem = document.querySelector('.dd-overlay');
      if (rem) rem.remove();
      return;
    }

    var bodyHtml = '';
    if (_detailDrawer.loading) {
      bodyHtml = '<div class="dd-loading"><div class="spinner"></div><p>Loading details…</p></div>';
    } else if (_detailDrawer.error) {
      bodyHtml = '<div class="dd-error">⚠️ ' + esc(_detailDrawer.error) + '</div>';
    } else if (_detailDrawer.data) {
      if (_detailDrawer.type === 'opportunity') {
        bodyHtml = renderOppDetail(_detailDrawer.data, _detailDrawer.dealTeam, _detailDrawer.notes);
      } else {
        bodyHtml = renderMsDetail(_detailDrawer.data, _detailDrawer.activities);
      }
    } else {
      bodyHtml = '<div class="dd-error">No data returned</div>';
    }

    // If drawer already exists, just update the body content — no re-animation
    var existing = document.querySelector('.dd-overlay');
    if (existing) {
      var body = existing.querySelector('.dd-drawer__body');
      if (body) body.innerHTML = bodyHtml;
      return;
    }

    // First render — create the full overlay and animate in
    var overlay = document.createElement('div');
    overlay.className = 'dd-overlay';

    var typeLabel = _detailDrawer.type === 'opportunity' ? 'Opportunity' : 'Milestone';
    var displayName = _detailDrawer.name || _detailDrawer.id;

    var entityType = _detailDrawer.type === 'opportunity' ? 'opportunity' : 'msp_engagementmilestone';
    var crmUrl = 'https://microsoftsales.crm.dynamics.com/main.aspx?etn=' +
      entityType + '&id=' + encodeURIComponent(_detailDrawer.id) + '&pagetype=entityrecord';

    overlay.innerHTML =
      '<div class="dd-backdrop"></div>' +
      '<div class="dd-drawer" role="dialog" aria-modal="true" aria-label="' + typeLabel + ' Details">' +
        '<div class="dd-drawer__header">' +
          '<div class="dd-drawer__header-left">' +
            '<span class="dd-drawer__type">' + typeLabel + '</span>' +
            '<h3 class="dd-drawer__title">' + esc(displayName) + '</h3>' +
          '</div>' +
          '<div class="dd-drawer__header-right">' +
            '<a href="' + crmUrl + '" target="_blank" class="dd-crm-link" title="Open in CRM">↗ CRM</a>' +
            '<button class="dd-close-btn" aria-label="Close">✕</button>' +
          '</div>' +
        '</div>' +
        '<div class="dd-drawer__body">' + bodyHtml + '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    overlay.querySelector('.dd-backdrop').addEventListener('click', closeDetailDrawer);
    overlay.querySelector('.dd-close-btn').addEventListener('click', closeDetailDrawer);
    function onEsc(e) {
      if (e.key === 'Escape') { closeDetailDrawer(); document.removeEventListener('keydown', onEsc); }
    }
    document.addEventListener('keydown', onEsc);

    requestAnimationFrame(function () { overlay.classList.add('dd-open'); });
  }

  function showToast(msg, type) {
    var toast = document.createElement('div');
    toast.className = 'ops-toast' + (type === 'error' ? ' ops-toast-error' : '');
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function () { toast.classList.add('ops-toast-show'); }, 10);
    setTimeout(function () {
      toast.classList.remove('ops-toast-show');
      setTimeout(function () { toast.remove(); }, 300);
    }, 3000);
  }

  // ── Render ──────────────────────────────────────────────────

  function render() {
    if (!_el) return;
    var html = '<div class="opps-view">';

    // Header
    html += '<div class="opps-header">' +
      '<h2>📋 My Opportunities</h2>' +
      '<div class="opps-actions">' +
        '<button class="opps-refresh-btn" data-action="refresh">🔄 Refresh</button>' +
      '</div>' +
    '</div>';

    // Loading / Error
    if (_loading) {
      html += '<div class="opps-loading"><div class="spinner"></div><p>Loading opportunities from CRM…</p></div>';
      html += '</div>';
      _el.innerHTML = html;
      bindEvents();
      return;
    }

    if (_error) {
      html += '<div class="opps-error">' +
        '<p>⚠️ ' + esc(_error) + '</p>' +
        '<p class="opps-error-hint">Make sure you are authenticated with <code>az login</code> and have access to MSX CRM.</p>' +
        '<button class="opps-refresh-btn" data-action="refresh">Retry</button>' +
      '</div>';
      html += '</div>';
      _el.innerHTML = html;
      bindEvents();
      return;
    }

    if (_data.opportunities.length === 0) {
      html += '<div class="opps-empty">' +
        '<p>No opportunities found on your deal team.</p>' +
        '<button class="opps-refresh-btn" data-action="refresh">Refresh from CRM</button>' +
      '</div>';
      html += '</div>';
      _el.innerHTML = html;
      bindEvents();
      return;
    }

    // Summary cards
    var s = _data.summary;
    html += '<div class="opps-summary">' +
      '<div class="summary-card"><span class="summary-val">' + s.count + '</span><span class="summary-label">Opportunities</span></div>' +
      '<div class="summary-card"><span class="summary-val">' + currency(s.totalValue) + '</span><span class="summary-label">Annual Pipeline</span></div>' +
      '<div class="summary-card"><span class="summary-val">' + currency(s.totalMonthly) + '</span><span class="summary-label">Monthly ACR</span></div>' +
      '<div class="summary-card"><span class="summary-val">' + s.accountCount + '</span><span class="summary-label">Accounts</span></div>' +
    '</div>';

    // Filters
    html += '<div class="opps-filters">';
    html += '<div class="filter-pills">';
    ['1', '2', '3', '4', '5'].forEach(function (st) {
      var sc = STAGE_COLORS[st] || {};
      var active = _filters.stage === st ? ' active' : '';
      html += '<button class="stage-pill' + active + '" data-stage="' + st + '" style="--pill-bg:' + (sc.bg || '#eee') + ';--pill-text:' + (sc.text || '#333') + '">S' + st + '</button>';
    });
    html += '</div>';
    html += '<div class="filter-pills">';
    [{ k: 'green', i: '🟢' }, { k: 'yellow', i: '🟡' }, { k: 'red', i: '🔴' }].forEach(function (h) {
      var active = _filters.health === h.k ? ' active' : '';
      html += '<button class="health-pill' + active + '" data-health="' + h.k + '">' + h.i + '</button>';
    });
    html += '</div>';
    html += '<input type="text" class="opps-search" placeholder="Search opportunities…" value="' + esc(_filters.search) + '">';
    html += '</div>';

    // Table with infinite scroll
    var filtered = applyFilters(_data.opportunities);
    var sorted = sortOpps(filtered);
    var visibleItems = sorted.slice(0, _visibleCount);

    html += '<div class="opps-table-wrap"><table class="opps-table">';
    html += '<thead><tr>';
    var cols = [
      { key: 'name', label: 'Opportunity' },
      { key: 'account', label: 'Account' },
      { key: 'stage', label: 'Stage' },
      { key: 'health', label: 'Health' },
      { key: 'estimated_close', label: 'Close Date' },
      { key: 'monthly_use', label: 'Monthly Use' },
      { key: 'actions', label: '' }
    ];
    cols.forEach(function (c) {
      var arrow = _sortCol === c.key ? (_sortDir === 'asc' ? ' ▲' : ' ▼') : '';
      var sortable = c.key !== 'actions' ? ' data-sort="' + c.key + '"' : '';
      html += '<th' + sortable + '>' + c.label + arrow + '</th>';
    });
    html += '</tr></thead><tbody>';

    if (visibleItems.length === 0) {
      html += '<tr><td colspan="7" class="empty-state">No matches for current filters</td></tr>';
    }

    visibleItems.forEach(function (opp) {
      var isOpen = _expanded.has(opp.id);
      var sn = opp.stageNum;
      var sc = STAGE_COLORS[sn] || { bg: '#f1f5f9', text: '#475569', label: 'Stage ' + sn };
      var relTip = opp.relationship === 'owner' ? 'You own this opportunity' : opp.relationship === 'deal-team' ? 'You are on the deal team' : opp.relationship ? 'Role: ' + opp.relationship : '';
      var rel = opp.relationship ? '<span class="rel-badge rel-badge-wrap" data-tooltip="' + esc(relTip) + '">' + esc(opp.relationship) + '</span>' : '';

      html += '<tr class="opp-row' + (isOpen ? ' expanded' : '') + '" data-opp-id="' + esc(opp.id) + '">';
      html += '<td><a href="' + crmLink(opp) + '" target="_blank" class="opp-link opp-ext-link">' + esc(opp.name || opp.number) + '</a> ' + rel + '</td>';
      html += '<td>' + esc(opp.account) + (window.VaultCustomers && window.VaultCustomers.isTracked(opp.account) ? ' <span class="vault-badge" data-tooltip="Account tracked in Obsidian vault">📌</span>' : '') + '</td>';
      html += '<td><span class="stage-badge" style="background:' + sc.bg + ';color:' + sc.text + '" data-tooltip="' + esc(sc.label) + '">S' + sn + '</span></td>';
      html += '<td>' + healthIcon(opp.health) + '</td>';
      html += '<td>' + fmtDate(opp.estimatedClose) + '</td>';
      html += '<td>' + currency(opp.monthlyUse) + '</td>';
      html += '<td class="opp-row-actions">';
      html += '<button class="opp-action-btn dd-icon-btn" data-action="drill-opp" data-opp-id="' + esc(opp.id) + '" data-opp-name="' + esc(opp.name || opp.number) + '" title="View details">🔎</button>';
      html += '<button class="opp-action-btn" data-action="expand" data-opp="' + esc(opp.id) + '" title="' + (isOpen ? 'Collapse' : 'Expand milestones') + '">' + (isOpen ? '▼' : '▶') + '</button>';
      html += '</td>';
      html += '</tr>';

      // Milestone expansion
      if (isOpen) {
        var ms = _milestoneCache[opp.id];
        html += '<tr class="milestone-row"><td colspan="7"><div class="milestone-panel">';

        if (ms === 'loading') {
          html += '<div class="ms-loading">Loading milestones…</div>';
        } else if (!ms || ms.length === 0) {
          html += '<div class="ms-empty">No milestones found</div>';
        } else {
          html += '<table class="ms-table"><thead><tr><th>Milestone</th><th>Status</th><th>Commitment</th><th>Due Date</th><th>Monthly Use</th><th>Owner</th><th></th></tr></thead><tbody>';
          ms.forEach(function (m) {
            var msId = m.msp_engagementmilestoneid || m.id || '';
            var statusCode = m.msp_milestonestatus || m.status || m.milestoneStatus;
            var statusInfo = MS_STATUS[statusCode] || { label: String(statusCode), cls: '' };
            var commitCode = m.msp_commitmentrecommendation;
            var commit = m.commitment
              || m['msp_commitmentrecommendation@OData.Community.Display.V1.FormattedValue']
              || COMMITMENT[commitCode] || '—';
            var mDate = m.msp_milestonedate || m.milestoneDate || m.date || '';
            var mUseRaw = m.msp_monthlyuse;
            var mUse = (typeof mUseRaw === 'number') ? mUseRaw : parseMonthly(m.monthlyUse || 0);
            var mOwner = m['_ownerid_value@OData.Community.Display.V1.FormattedValue']
              || m.ownerName || m.owner || '—';
            var mName = m.msp_name || m.name || m.milestoneName || '—';
            var msUrl = m.recordUrl || 'https://microsoftsales.crm.dynamics.com/main.aspx?etn=msp_engagementmilestone&id=' + encodeURIComponent(msId) + '&pagetype=entityrecord';

            html += '<tr data-ms-id="' + esc(msId) + '">';
            html += '<td><a href="' + msUrl + '" target="_blank" class="opp-link opp-ext-link">' + esc(mName) + '</a></td>';

            // Status — inline dropdown
            html += '<td><select class="ms-inline-select" data-ms-id="' + esc(msId) + '" data-field="msp_milestonestatus" data-current="' + statusCode + '">';
            Object.keys(MS_STATUS).forEach(function (code) {
              var sel = String(statusCode) === code ? ' selected' : '';
              html += '<option value="' + code + '"' + sel + '>' + MS_STATUS[code].label + '</option>';
            });
            html += '</select></td>';

            // Commitment — inline dropdown
            html += '<td><select class="ms-inline-select" data-ms-id="' + esc(msId) + '" data-field="msp_commitmentrecommendation" data-current="' + commitCode + '">';
            Object.keys(COMMITMENT).forEach(function (code) {
              var sel = String(commitCode) === code ? ' selected' : '';
              html += '<option value="' + code + '"' + sel + '>' + COMMITMENT[code] + '</option>';
            });
            html += '</select></td>';

            html += '<td>' + fmtDate(mDate) + '</td>';
            html += '<td>' + currency(mUse) + '</td>';
            html += '<td>' + esc(mOwner) + '</td>';

            // Actions
            html += '<td class="ms-row-actions">';
            html += '<button class="ms-action-sm dd-icon-btn" data-action="drill-ms" data-ms-id="' + esc(msId) + '" data-ms-name="' + esc(mName) + '" title="View details">🔎</button>';
            html += '<button class="ms-action-sm" data-action="toggle-tasks" data-ms-id="' + esc(msId) + '" title="Tasks">' + (_taskExpanded.has(msId) ? '📋▼' : '📋') + '</button>';
            html += '</td>';
            html += '</tr>';

            // Task sub-panel
            if (_taskExpanded.has(msId)) {
              html += renderTaskPanel(msId);
            }
          });
          html += '</tbody></table>';
        }

        html += '<div class="ms-actions">' +
          '<button class="ms-action" data-action="add-task" data-opp-id="' + esc(opp.id) + '">+ Add Task</button>' +
          '<button class="ms-action" data-action="deep-dive" data-opp-name="' + esc(opp.name) + '">🔍 Deep Dive</button>' +
          '<button class="ms-action" data-action="prep" data-opp-name="' + esc(opp.name) + '">📋 Prep Me</button>' +
        '</div>';
        html += '</div></td></tr>';
      }
    });

    html += '</tbody></table></div>';

    // Scroll status
    if (sorted.length > 0) {
      var hasMore = visibleItems.length < sorted.length;
      html += '<div class="scroll-status">';
      html += '<span>Showing ' + visibleItems.length + ' of ' + sorted.length + '</span>';
      if (hasMore) html += ' <span class="scroll-hint">↓ Scroll for more</span>';
      html += '</div>';
    }

    // Pending operations bar
    if (_pendingOps.length > 0) {
      html += '<div class="ops-bar">';
      html += '<span class="ops-bar-count">' + _pendingOps.length + ' pending change' + (_pendingOps.length > 1 ? 's' : '') + '</span>';
      html += '<button class="ops-bar-btn ops-bar-review" data-action="review-ops">Review & Apply</button>';
      html += '<button class="ops-bar-btn ops-bar-discard" data-action="discard-ops">Discard All</button>';
      html += '</div>';
    }

    html += '</div>';

    _el.innerHTML = html;
    bindEvents();
  }

  // ── Events ──────────────────────────────────────────────────

  function bindEvents() {
    if (!_el) return;

    _el.querySelectorAll('[data-action="refresh"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _milestoneCache = {};
        _taskCache = {};
        _expanded.clear();
        _taskExpanded.clear();
        fetch('/api/crm/refresh', { method: 'POST' }).then(loadData).catch(loadData);
      });
    });

    _el.querySelectorAll('[data-action="expand"]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var oppId = btn.dataset.opp;
        if (_expanded.has(oppId)) {
          _expanded.delete(oppId);
        } else {
          _expanded.add(oppId);
          loadMilestones(oppId);
        }
        render();
      });
    });

    _el.querySelectorAll('[data-sort]').forEach(function (th) {
      th.style.cursor = 'pointer';
      th.addEventListener('click', function () {
        var col = th.dataset.sort;
        if (_sortCol === col) _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
        else { _sortCol = col; _sortDir = 'asc'; }
        _visibleCount = _scrollBatch;
        render();
        loadVisibleMilestones();
      });
    });

    _el.querySelectorAll('.stage-pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _filters.stage = _filters.stage === btn.dataset.stage ? '' : btn.dataset.stage;
        _visibleCount = _scrollBatch;
        render();
        loadVisibleMilestones();
      });
    });

    _el.querySelectorAll('.health-pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _filters.health = _filters.health === btn.dataset.health ? '' : btn.dataset.health;
        _visibleCount = _scrollBatch;
        render();
        loadVisibleMilestones();
      });
    });

    var searchInput = _el.querySelector('.opps-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        _filters.search = searchInput.value.trim();
        _visibleCount = _scrollBatch;
        render();
        loadVisibleMilestones();
        var newInput = _el.querySelector('.opps-search');
        if (newInput) { newInput.focus(); newInput.selectionStart = newInput.selectionEnd = newInput.value.length; }
      });
    }

    _el.querySelectorAll('[data-action="deep-dive"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (window.dispatchCopilotAction) {
          window.dispatchCopilotAction('Deep dive on opportunity: ' + btn.dataset.oppName);
        }
      });
    });

    // Drill-down into opportunity detail
    _el.querySelectorAll('[data-action="drill-opp"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openDetailDrawer('opportunity', link.dataset.oppId, link.dataset.oppName);
      });
    });

    // Drill-down into milestone detail
    _el.querySelectorAll('[data-action="drill-ms"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openDetailDrawer('milestone', link.dataset.msId, link.dataset.msName);
      });
    });

    // Infinite scroll on table container
    var tableWrap = _el.querySelector('.opps-table-wrap');
    if (tableWrap) {
      tableWrap.addEventListener('scroll', function () {
        var nearBottom = tableWrap.scrollTop + tableWrap.clientHeight >= tableWrap.scrollHeight - 80;
        if (!nearBottom) return;
        var filtered = applyFilters(_data.opportunities);
        var sorted = sortOpps(filtered);
        if (_visibleCount >= sorted.length) return;
        _visibleCount += _scrollBatch;
        render();
        loadVisibleMilestones();
      });
    }

    _el.querySelectorAll('[data-action="prep"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (window.dispatchCopilotAction) {
          window.dispatchCopilotAction('Prep me for ' + btn.dataset.oppName);
        }
      });
    });

    // Add Task modal
    _el.querySelectorAll('[data-action="add-task"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showAddTaskModal(btn.dataset.oppId);
      });
    });

    // Inline milestone field edits
    _el.querySelectorAll('.ms-inline-select').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var msId = sel.dataset.msId;
        var field = sel.dataset.field;
        var oldVal = sel.dataset.current;
        var newVal = sel.value;
        if (newVal === oldVal) return;
        stageMilestoneUpdate(msId, field, newVal);
      });
    });

    // Toggle task panel
    _el.querySelectorAll('[data-action="toggle-tasks"]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var msId = btn.dataset.msId;
        if (_taskExpanded.has(msId)) {
          _taskExpanded.delete(msId);
        } else {
          _taskExpanded.add(msId);
          loadTasks(msId);
        }
        render();
      });
    });

    // Close task
    _el.querySelectorAll('[data-action="close-task"]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        stageCloseTask(btn.dataset.taskId);
      });
    });

    // Submit new task
    _el.querySelectorAll('[data-action="submit-task"]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var msId = btn.dataset.msId;
        var subjectInput = _el.querySelector('.task-add-subject[data-ms-id="' + msId + '"]');
        var dateInput = _el.querySelector('.task-add-date[data-ms-id="' + msId + '"]');
        var subject = subjectInput ? subjectInput.value.trim() : '';
        if (!subject) { showToast('Task subject is required', 'error'); return; }
        var scheduledEnd = dateInput ? dateInput.value : '';
        stageCreateTask(msId, subject, scheduledEnd);
      });
    });

    // Approval bar
    _el.querySelectorAll('[data-action="review-ops"]').forEach(function (btn) {
      btn.addEventListener('click', function () { executeAllOps(); });
    });

    _el.querySelectorAll('[data-action="discard-ops"]').forEach(function (btn) {
      btn.addEventListener('click', function () { discardAllOps(); });
    });

    // External links — native navigation via target="_blank"
    // No interception needed in browser context.
  }

  // ── Public API ──────────────────────────────────────────────

  function mount(c) {
    _el = c;
    render();
    loadData();
    // Re-sort when vault customer data arrives
    if (window.AppState) {
      window.AppState.subscribe('vault:customers', function () { if (_el && _data.opportunities.length) render(); });
    }
  }
  function unmount() { _el = null; }
  function onActivate() { if (_data.opportunities.length === 0 && !_loading) loadData(); }

  window.opportunitiesView = { mount: mount, unmount: unmount, onActivate: onActivate };
})();
