/* ============================================================
 *  Job2 Tracker — CSA/CSAM delivery health per account
 *  Data: /api/crm/job2-summary
 * ============================================================ */
(function () {
  'use strict';

  var container  = null;
  var data       = null;
  var loading    = false;
  var loadError  = null;

  // ── Helpers ──────────────────────────────────────────────

  function safeEsc(v) {
    if (!v && v !== 0) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtAcr(val) {
    var n = Number(val);
    if (!val && val !== 0 || isNaN(n)) return '—';
    if (n >= 1000) return '$' + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
    return '$' + n;
  }

  function healthIcon(h) {
    return h === 'green' ? '🟢' : h === 'yellow' ? '🟡' : '🔴';
  }

  function healthLabel(h) {
    return h === 'green' ? 'Healthy' : h === 'yellow' ? 'At Risk' : 'Critical';
  }

  // ── Data loading ─────────────────────────────────────────

  function loadData() {
    loading   = true;
    loadError = null;
    data      = null;
    render();

    fetch('/api/crm/job2-summary')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) {
        data    = json;
        loading = false;
        render();
      })
      .catch(function (err) {
        loadError = err.message || 'Failed to load Job2 data';
        loading   = false;
        render();
      });
  }

  // ── Render ───────────────────────────────────────────────

  function render() {
    if (!container) return;

    if (loading) {
      container.innerHTML = '<div class="job2-loading"><span class="spinner">⟳</span> Loading Job2 data…</div>';
      return;
    }
    if (loadError) {
      container.innerHTML = '<div class="job2-error">⚠️ ' + safeEsc(loadError) +
        ' <button class="j2-btn j2-btn--sm" onclick="window.job2View && window.job2View.refresh()">Retry</button></div>';
      return;
    }

    var accounts = (data && data.accounts) || [];
    container.innerHTML = buildHtml(accounts);
    bindRefresh();
  }

  function buildHtml(accounts) {
    if (!accounts.length) {
      return '<div class="job2-empty">No active milestones found. <button class="j2-btn j2-btn--sm" onclick="window.job2View && window.job2View.refresh()">Refresh</button></div>';
    }

    // Portfolio summary pills
    var totalMs = accounts.reduce(function (s, a) { return s + a.milestoneCount; }, 0);
    var totalAcr = accounts.reduce(function (s, a) { return s + a.totalPlannedAcrMonthly; }, 0);
    var totalCommitted = accounts.reduce(function (s, a) { return s + a.committed; }, 0);
    var totalOverdue   = accounts.reduce(function (s, a) { return s + a.overdue; }, 0);
    var totalBlocked   = accounts.reduce(function (s, a) { return s + a.blocked; }, 0);
    var green  = accounts.filter(function (a) { return a.health === 'green'; }).length;
    var yellow = accounts.filter(function (a) { return a.health === 'yellow'; }).length;
    var red    = accounts.filter(function (a) { return a.health === 'red'; }).length;

    var html = '<div class="job2-view">';

    // Header
    html += '<div class="job2-header">';
    html += '<h2 class="job2-title">📊 Job2 Tracker</h2>';
    html += '<button class="j2-btn j2-btn--sm" id="j2-refresh-btn">⟳ Refresh</button>';
    html += '</div>';

    // Portfolio summary
    html += '<div class="job2-summary-bar">';
    html += pill('Accounts', accounts.length, '');
    html += pill('Milestones', totalMs, '');
    html += pill('Committed', totalCommitted, 'green');
    html += pill('Overdue', totalOverdue, totalOverdue > 0 ? 'red' : '');
    html += pill('Blocked', totalBlocked, totalBlocked > 0 ? 'red' : '');
    html += pill('Planned ACR/mo', fmtAcr(totalAcr), 'blue');
    html += pill('🟢', green, '');
    html += pill('🟡', yellow, '');
    html += pill('🔴', red, '');
    html += '</div>';

    // Account cards
    html += '<div class="job2-cards">';
    accounts.forEach(function (a) {
      html += buildCard(a);
    });
    html += '</div>';

    html += '</div>';
    return html;
  }

  function pill(label, value, cls) {
    var clsAttr = cls ? ' job2-pill--' + cls : '';
    return '<div class="job2-pill' + clsAttr + '"><span class="j2-pill-val">' +
      safeEsc(value) + '</span><span class="j2-pill-lbl">' + safeEsc(label) + '</span></div>';
  }

  function buildCard(a) {
    var commitPct = a.commitRatio || 0;
    var barCls = commitPct >= 80 ? 'j2-bar--green' : commitPct >= 50 ? 'j2-bar--yellow' : 'j2-bar--red';

    var statusBadges = '';
    if (a.committed > 0)  statusBadges += '<span class="j2-badge j2-badge--c">✅ ' + a.committed + ' committed</span>';
    if (a.pipeline > 0)   statusBadges += '<span class="j2-badge j2-badge--pl">🔵 ' + a.pipeline + ' pipeline</span>';
    if (a.uncommitted > 0) statusBadges += '<span class="j2-badge j2-badge--uc">⚪ ' + a.uncommitted + ' uncommitted</span>';
    if (a.overdue > 0)    statusBadges += '<span class="j2-badge j2-badge--err">🕐 ' + a.overdue + ' overdue</span>';
    if (a.atRisk > 0)     statusBadges += '<span class="j2-badge j2-badge--warn">⚠️ ' + a.atRisk + ' at risk</span>';
    if (a.blocked > 0)    statusBadges += '<span class="j2-badge j2-badge--err">🚫 ' + a.blocked + ' blocked</span>';

    return '<div class="job2-card job2-card--' + safeEsc(a.health) + '">' +
      '<div class="j2-card-header">' +
        '<div class="j2-acct-name">' + healthIcon(a.health) + ' ' + safeEsc(a.accountName) + '</div>' +
        '<div class="j2-health-badge j2-health--' + safeEsc(a.health) + '">' + healthLabel(a.health) + '</div>' +
      '</div>' +

      '<div class="j2-card-meta">' +
        '<span class="j2-meta-item">📋 ' + a.milestoneCount + ' milestones</span>' +
        '<span class="j2-meta-item">🎯 ' + a.oppCount + ' opp' + (a.oppCount !== 1 ? 's' : '') + '</span>' +
        '<span class="j2-meta-item">💰 ' + fmtAcr(a.totalPlannedAcrMonthly) + '/mo planned ACR</span>' +
      '</div>' +

      '<div class="j2-commit-bar-wrap">' +
        '<div class="j2-commit-label">Commitment: ' + commitPct + '%</div>' +
        '<div class="j2-commit-bar"><div class="j2-commit-fill ' + barCls + '" style="width:' + commitPct + '%"></div></div>' +
      '</div>' +

      '<div class="j2-badges">' + statusBadges + '</div>' +

      '<div class="j2-next-action">⚡ ' + safeEsc(a.nextAction) + '</div>' +
    '</div>';
  }

  function bindRefresh() {
    var btn = container && container.querySelector('#j2-refresh-btn');
    if (btn) btn.addEventListener('click', function () { loadData(); });
  }

  // ── View lifecycle ────────────────────────────────────────

  window.job2View = {
    mount: function (el) {
      container = el;
      loadData();
    },
    unmount: function () {
      container = null;
    },
    refresh: function () {
      loadData();
    }
  };
})();
