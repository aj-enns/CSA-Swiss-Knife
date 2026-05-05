/* ============================================================
 *  Gantt View — Milestone timeline with ACR mapping
 *  Pure HTML/CSS, no external dependencies.
 * ============================================================ */
(function () {
  'use strict';

  var container = null;
  var ganttData  = null; // { customerMap, range }
  var loading    = false;
  var loadError  = null;

  // ── Lookup tables ──────────────────────────────────────────

  var STATUS_LABEL = {
    861980000: 'On Track',
    861980001: 'At Risk',
    861980002: 'Blocked',
    861980003: 'Completed',
    861980004: 'Cancelled',
    861980005: 'Not Started',
    861980007: 'Closed Incomplete'
  };

  var COMMIT = {
    861980000: { label: 'Uncommitted', short: 'UC', cls: 'uc' },
    861980002: { label: 'Pipeline',    short: 'PL', cls: 'pl' },
    861980003: { label: 'Committed',   short: 'C',  cls: 'c'  }
  };

  function barClass(m) {
    var committed = m.msp_commitmentrecommendation === 861980003;
    var sc        = m.statuscode;
    if (!committed)       return 'gantt-bar--uc';
    if (sc === 861980002) return 'gantt-bar--blocked';
    if (sc === 861980001) return 'gantt-bar--risk';
    return 'gantt-bar--ok';
  }

  // ── Formatting helpers ────────────────────────────────────

  function safeEsc(v) {
    if (!v && v !== 0) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmt(dateStr) {
    if (!dateStr) return '—';
    var d = new Date(dateStr);
    return isNaN(d) ? '—' : d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  }

  function fmtMonthYear(date) {
    return date.toLocaleDateString('en-CA', { month: 'short', year: '2-digit' });
  }

  function fmtAcr(val) {
    var n = Number(val);
    if (!val && val !== 0 || isNaN(n)) return '';
    if (n >= 1000) return '$' + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
    return '$' + n;
  }

  function isPast(dateStr) {
    return dateStr && new Date(dateStr) < new Date();
  }

  // ── Data loading ──────────────────────────────────────────

  function loadData() {
    loading   = true;
    loadError = null;
    ganttData = null;
    render();

    Promise.all([
      fetch('/api/crm/milestones?mine=true&status=active').then(function (r) { return r.ok ? r.json() : null; }),
      fetch('/api/crm/opportunities?dealTeam=false').then(function (r) { return r.ok ? r.json() : null; })
    ]).then(function (results) {
      ganttData  = buildData(results[0], results[1]);
      loading    = false;
      render();
    }).catch(function (err) {
      loadError = err.message || 'Failed to load data';
      loading   = false;
      render();
    });
  }

  function buildData(msResp, oppsResp) {
    // Normalise milestones array
    var ms = [];
    if (msResp) {
      if (Array.isArray(msResp))             ms = msResp;
      else if (msResp.milestones)            ms = msResp.milestones;
      else if (Array.isArray(msResp.value))  ms = msResp.value;
    }

    // Build opp id → { name, accountName } lookup
    var oppMap = {};
    var opps = [];
    if (oppsResp) {
      if (Array.isArray(oppsResp))           opps = oppsResp;
      else if (oppsResp.opportunities)       opps = oppsResp.opportunities;
    }
    opps.forEach(function (o) {
      var id = o.opportunityid || o.id;
      if (id) oppMap[id] = {
        name: o.name || o.msp_name || '',
        account: o.parentaccountidname || o._parentaccountid_value_label || o.accountname || ''
      };
    });

    // Group: customer → opp name → { oppId, milestones[], totalAcr }
    var customerMap = {};
    ms.forEach(function (m) {
      var oppId   = m._msp_opportunityid_value;
      var oppInfo = oppId ? oppMap[oppId] : null;
      var customer = (oppInfo && oppInfo.account) || 'Unknown Account';
      var oppName  = (oppInfo && oppInfo.name) || (oppId ? 'Opp ' + oppId.slice(0, 8) : 'Unknown Opp');

      if (!customerMap[customer]) customerMap[customer] = {};
      if (!customerMap[customer][oppName]) {
        customerMap[customer][oppName] = { oppId: oppId, milestones: [], totalAcr: 0 };
      }
      customerMap[customer][oppName].milestones.push(m);
      customerMap[customer][oppName].totalAcr += Number(m.msp_monthlyuse || 0);
    });

    // Compute timeline range from milestones
    var today = new Date();
    var rangeStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    var rangeEnd   = new Date(today.getFullYear(), today.getMonth() + 8, 1);
    ms.forEach(function (m) {
      if (m.msp_milestoneduedate) {
        var d = new Date(m.msp_milestoneduedate);
        if (!isNaN(d) && d > rangeEnd) rangeEnd = new Date(d.getFullYear(), d.getMonth() + 2, 1);
      }
    });

    return { customerMap: customerMap, rangeStart: rangeStart, rangeEnd: rangeEnd };
  }

  // ── Timeline math ─────────────────────────────────────────

  function pct(date, start, end) {
    var total = end - start;
    if (!total) return 0;
    return Math.max(0, Math.min(100, ((date - start) / total) * 100));
  }

  function monthHeaders(start, end) {
    var headers = [];
    var cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) { headers.push(new Date(cur)); cur.setMonth(cur.getMonth() + 1); }
    return headers;
  }

  // ── Render ────────────────────────────────────────────────

  function render() {
    if (!container) return;
    container.innerHTML = buildHtml();
    bindEvents();
  }

  function buildHtml() {
    if (loading) {
      return '<div class="gantt-state"><span class="mcaps-spinner"></span><span>Loading milestone timeline…</span></div>';
    }
    if (loadError) {
      return '<div class="gantt-state gantt-state--error"><span>⚠️ ' + safeEsc(loadError) + '</span>' +
        '<button class="mcaps-btn mcaps-btn--primary" id="gantt-retry">Retry</button></div>';
    }
    if (!ganttData || !Object.keys(ganttData.customerMap).length) {
      return '<div class="gantt-state">No active milestones found. ' +
        '<button class="mcaps-btn mcaps-btn--ghost" id="gantt-retry" style="margin-left:8px">Refresh</button></div>';
    }

    var customerMap = ganttData.customerMap;
    var rStart = ganttData.rangeStart;
    var rEnd   = ganttData.rangeEnd;
    var today  = new Date();
    var todayPct = pct(today, rStart, rEnd);
    var months = monthHeaders(rStart, rEnd);

    // Summary counts
    var totMs = 0, totAcr = 0, overdues = 0, uncommitted = 0;
    Object.values(customerMap).forEach(function (opps) {
      Object.values(opps).forEach(function (opp) {
        opp.milestones.forEach(function (m) {
          totMs++;
          totAcr += Number(m.msp_monthlyuse || 0);
          if (isPast(m.msp_milestoneduedate)) overdues++;
          if (m.msp_commitmentrecommendation !== 861980003) uncommitted++;
        });
      });
    });

    // Month header labels (positioned absolutely)
    var monthLabelHtml = months.map(function (m) {
      return '<span class="gantt-month" style="left:' + pct(m, rStart, rEnd).toFixed(1) + '%">' + fmtMonthYear(m) + '</span>';
    }).join('');

    // Grid lines HTML (injected into each bars cell via the same pct values)
    var gridLines = months.map(function (m) {
      return '<div class="gantt-vline" style="left:' + pct(m, rStart, rEnd).toFixed(1) + '%"></div>';
    }).join('');
    var todayLine = '<div class="gantt-today-vline" style="left:' + todayPct.toFixed(1) + '%"><span class="gantt-today-tip">Today</span></div>';

    // Build rows HTML
    var rowsHtml = '';
    Object.keys(customerMap).forEach(function (customer) {
      var opps      = customerMap[customer];
      var custAcr   = Object.values(opps).reduce(function (s, o) { return s + o.totalAcr; }, 0);
      var custMs    = Object.values(opps).reduce(function (s, o) { return s + o.milestones.length; }, 0);
      rowsHtml += '<div class="gantt-customer-group">' +
        '<div class="gantt-row gantt-row--customer">' +
          '<div class="gantt-label">' +
            '<span class="gantt-customer-name">🏢 ' + safeEsc(customer) + '</span>' +
            '<span class="gantt-label-meta">' + custMs + ' milestones · ' + fmtAcr(custAcr) + '/mo</span>' +
          '</div>' +
          '<div class="gantt-bars-cell">' + gridLines + todayLine + '</div>' +
        '</div>';

      Object.keys(opps).forEach(function (oppName) {
        var opp = opps[oppName];
        rowsHtml += '<div class="gantt-row gantt-row--opp">' +
          '<div class="gantt-label gantt-label--opp">' +
            '<span class="gantt-opp-dot">🎯</span>' +
            '<span class="gantt-opp-name">' + safeEsc(oppName) + '</span>' +
            '<span class="gantt-label-meta">' + fmtAcr(opp.totalAcr) + '/mo</span>' +
          '</div>' +
          '<div class="gantt-bars-cell gantt-bars-cell--opp">' + gridLines + todayLine + '</div>' +
        '</div>';

        opp.milestones.forEach(function (m) {
          rowsHtml += renderMilestoneRow(m, rStart, rEnd, gridLines, todayLine);
        });
      });

      rowsHtml += '</div>';
    });

    return '<div class="gantt-view">' +

      // ── Top bar
      '<div class="gantt-topbar">' +
        '<h2 class="gantt-title">📅 Milestone Timeline</h2>' +
        '<div class="gantt-pills">' +
          '<span class="gantt-pill">' + totMs + ' milestones</span>' +
          '<span class="gantt-pill gantt-pill--acr">~' + fmtAcr(totAcr) + '/mo</span>' +
          (overdues   ? '<span class="gantt-pill gantt-pill--danger">⚠️ ' + overdues   + ' overdue</span>'    : '') +
          (uncommitted? '<span class="gantt-pill gantt-pill--warn">🔴 ' + uncommitted + ' uncommitted</span>' : '') +
        '</div>' +
        '<button class="mcaps-btn mcaps-btn--ghost" id="gantt-refresh" style="flex-shrink:0">↺ Refresh</button>' +
      '</div>' +

      // ── Legend
      '<div class="gantt-legend">' +
        '<span class="gantt-leg"><span class="gantt-swatch gantt-swatch--ok"></span>Committed / On Track</span>' +
        '<span class="gantt-leg"><span class="gantt-swatch gantt-swatch--risk"></span>At Risk</span>' +
        '<span class="gantt-leg"><span class="gantt-swatch gantt-swatch--uc"></span>Uncommitted</span>' +
        '<span class="gantt-leg"><span class="gantt-swatch gantt-swatch--blocked"></span>Blocked / Overdue</span>' +
      '</div>' +

      // ── Chart
      '<div class="gantt-chart">' +

        // Sticky header row
        '<div class="gantt-header-row">' +
          '<div class="gantt-label gantt-label--header">Account / Milestone</div>' +
          '<div class="gantt-month-header">' + monthLabelHtml + '</div>' +
        '</div>' +

        // Data rows
        '<div class="gantt-rows">' + rowsHtml + '</div>' +

      '</div>' + // .gantt-chart

    '</div>'; // .gantt-view
  }

  function renderMilestoneRow(m, rStart, rEnd, gridLines, todayLine) {
    var today   = new Date();
    var dueDate = m.msp_milestoneduedate ? new Date(m.msp_milestoneduedate) : null;
    var name    = m.msp_name || m.msp_milestonename || 'Milestone';
    var acr     = Number(m.msp_monthlyuse || 0);
    var bc      = barClass(m);
    var overdue = dueDate && dueDate < today;
    var commit  = COMMIT[m.msp_commitmentrecommendation] || COMMIT[861980000];
    var status  = STATUS_LABEL[m.statuscode] || 'Unknown';
    var crmId   = m.msp_engagementmilestoneid || '';
    var crmUrl  = crmId
      ? 'https://microsoftsales.crm.dynamics.com/main.aspx?etn=msp_engagementmilestone&id=' + crmId + '&pagetype=entityrecord'
      : '#';

    // Bar geometry
    var barLeft = 0, barWidth = 0, hasBar = false;
    if (dueDate && !isNaN(dueDate)) {
      hasBar = true;
      if (overdue) {
        barLeft  = pct(dueDate, rStart, rEnd);
        barWidth = pct(today,   rStart, rEnd) - barLeft;
      } else {
        barLeft  = pct(today,   rStart, rEnd);
        barWidth = pct(dueDate, rStart, rEnd) - barLeft;
      }
      barWidth = Math.max(barWidth, 0.8);
    }

    var acrLabel = acr ? fmtAcr(acr) + '/mo' : '';
    var dueLabel = dueDate ? fmt(dueDate) : 'No date';
    var tip = safeEsc(name) + ' · ' + commit.label + ' · ' + status + ' · Due: ' + dueLabel + (acrLabel ? ' · ACR: ' + acrLabel : '');

    var barHtml = hasBar
      ? '<div class="gantt-bar ' + bc + (overdue ? ' gantt-bar--overdue' : '') + '" ' +
          'style="left:' + barLeft.toFixed(1) + '%;width:' + barWidth.toFixed(1) + '%;" ' +
          'title="' + tip + '">' +
          (acrLabel ? '<span class="gantt-bar-inner">' + acrLabel + '</span>' : '') +
          '<span class="gantt-bar-due">' + dueLabel + (overdue ? ' ⚠' : '') + '</span>' +
        '</div>'
      : '<span class="gantt-no-date">No date</span>';

    return '<div class="gantt-row gantt-row--ms">' +
      '<div class="gantt-label gantt-label--ms">' +
        '<span class="gantt-commit-badge gantt-commit-badge--' + commit.cls + '">' + commit.short + '</span>' +
        '<a href="' + crmUrl + '" target="_blank" class="gantt-ms-link" title="' + tip + '">' + safeEsc(name) + '</a>' +
      '</div>' +
      '<div class="gantt-bars-cell gantt-bars-cell--ms">' +
        gridLines + todayLine + barHtml +
      '</div>' +
    '</div>';
  }

  // ── Events ────────────────────────────────────────────────

  function bindEvents() {
    var retry   = container && container.querySelector('#gantt-retry');
    var refresh = container && container.querySelector('#gantt-refresh');
    if (retry)   retry.addEventListener('click',   loadData);
    if (refresh) refresh.addEventListener('click', loadData);
  }

  // ── Lifecycle ─────────────────────────────────────────────

  function mount(el) { container = el; loadData(); }
  function unmount()  { container = null; }

  window.ganttView = { mount: mount, unmount: unmount };
})();
