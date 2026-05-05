/* ============================================================
 *  ACR by Quarter View — Planned ACR per account per CY quarter
 *  Data: /api/crm/acr-quarterly (CRM-based, msp_monthlyuse × 3)
 *  PBI actuals: button per account (future delegation hook)
 * ============================================================ */
(function () {
  'use strict';

  var container = null;
  var data      = null;
  var loading   = false;
  var loadError = null;
  var yearFilter = new Date().getFullYear();

  // ── Helpers ──────────────────────────────────────────────

  function safeEsc(v) {
    if (!v && v !== 0) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtAcr(val) {
    var n = Number(val);
    if (!val && val !== 0 || isNaN(n) || n === 0) return '—';
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000)    return '$' + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
    return '$' + n;
  }

  // ── Data loading ─────────────────────────────────────────

  function loadData() {
    loading   = true;
    loadError = null;
    data      = null;
    render();

    fetch('/api/crm/acr-quarterly')
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
        loadError = err.message || 'Failed to load ACR data';
        loading   = false;
        render();
      });
  }

  // ── Render ───────────────────────────────────────────────

  function render() {
    if (!container) return;

    if (loading) {
      container.innerHTML = '<div class="acr-loading"><span class="spinner">⟳</span> Loading quarterly ACR…</div>';
      return;
    }
    if (loadError) {
      container.innerHTML = '<div class="acr-error">⚠️ ' + safeEsc(loadError) +
        ' <button class="acr-btn acr-btn--sm" onclick="window.acrQuarterView && window.acrQuarterView.refresh()">Retry</button></div>';
      return;
    }

    var accounts = (data && data.accounts) || [];
    var allQuarters = (data && data.quarters) || [];
    container.innerHTML = buildHtml(accounts, allQuarters);
    bindEvents();
  }

  function quartersForYear(allQuarters, year) {
    return allQuarters.filter(function (q) { return q.startsWith(String(year)); });
  }

  function availableYears(allQuarters) {
    var years = {};
    allQuarters.forEach(function (q) { years[q.split('-')[0]] = true; });
    return Object.keys(years).map(Number).sort();
  }

  function buildHtml(accounts, allQuarters) {
    if (!accounts.length) {
      return '<div class="acr-empty">No milestone data found. <button class="acr-btn acr-btn--sm" onclick="window.acrQuarterView && window.acrQuarterView.refresh()">Refresh</button></div>';
    }

    var years   = availableYears(allQuarters);
    var curYear = yearFilter;
    if (years.length && !years.includes(curYear)) curYear = years[years.length - 1];

    var quarters = quartersForYear(allQuarters, curYear);
    var qLabels  = quarters.map(function (q) { return q.replace(/^\d{4}-/, ''); }); // e.g. Q1

    // Find max ACR for bar scaling
    var maxAcr = 0;
    accounts.forEach(function (a) {
      quarters.forEach(function (q, i) {
        var val = (a.quarters[allQuarters.indexOf(q)] || {}).plannedAcr || 0;
        if (val > maxAcr) maxAcr = val;
      });
    });

    var html = '<div class="acr-view">';

    // Header
    html += '<div class="acr-header">';
    html += '<h2 class="acr-title">📈 ACR by Quarter</h2>';
    html += '<div class="acr-header-right">';

    // Year tabs
    html += '<div class="acr-year-tabs">';
    years.forEach(function (y) {
      var active = y === curYear ? ' acr-year-tab--active' : '';
      html += '<button class="acr-year-tab' + active + '" data-year="' + y + '">' + y + '</button>';
    });
    html += '</div>';

    html += '<button class="acr-btn acr-btn--sm" id="acr-refresh-btn">⟳ Refresh</button>';
    html += '</div>';
    html += '</div>';

    // Source note
    html += '<div class="acr-source-note">📌 Planned ACR = <code>msp_monthlyuse × 3</code> per milestone, bucketed by due-date quarter. ' +
      '<span class="acr-pbi-note">PBI actuals available via Power BI delegation.</span></div>';

    // Portfolio totals row
    var quarterTotals = quarters.map(function (q) {
      return accounts.reduce(function (sum, a) {
        var idx = allQuarters.indexOf(q);
        return sum + ((a.quarters[idx] || {}).plannedAcr || 0);
      }, 0);
    });
    var grandTotal = quarterTotals.reduce(function (s, v) { return s + v; }, 0);

    // Quarter headers row for the table
    html += '<div class="acr-table-wrap">';
    html += '<table class="acr-table">';
    html += '<thead><tr>';
    html += '<th class="acr-col-acct">Account</th>';
    qLabels.forEach(function (ql) { html += '<th class="acr-col-q">' + ql + '</th>'; });
    html += '<th class="acr-col-total">Total</th>';
    html += '<th class="acr-col-chart">Trend</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    // Per-account rows
    accounts.forEach(function (a) {
      var rowTotal = 0;
      var qVals = quarters.map(function (q) {
        var idx = allQuarters.indexOf(q);
        return (a.quarters[idx] || {}).plannedAcr || 0;
      });
      qVals.forEach(function (v) { rowTotal += v; });

      html += '<tr class="acr-row">';
      html += '<td class="acr-col-acct"><span class="acr-acct-name">' + safeEsc(a.accountName) + '</span></td>';

      qVals.forEach(function (v) {
        var highlight = v > 0 ? ' acr-cell--has-value' : '';
        html += '<td class="acr-col-q' + highlight + '">' + fmtAcr(v) + '</td>';
      });

      html += '<td class="acr-col-total acr-total-cell">' + fmtAcr(rowTotal) + '</td>';

      // Mini sparkline (pure CSS bars)
      html += '<td class="acr-col-chart">';
      html += '<div class="acr-spark">';
      qVals.forEach(function (v, i) {
        var h = maxAcr > 0 ? Math.max(2, Math.round((v / maxAcr) * 40)) : 2;
        var cls = v > 0 ? 'acr-spark-bar--filled' : 'acr-spark-bar--empty';
        html += '<div class="acr-spark-bar ' + cls + '" style="height:' + h + 'px" title="' + qLabels[i] + ': ' + fmtAcr(v) + '"></div>';
      });
      html += '</div>';
      html += '</td>';

      html += '</tr>';
    });

    // Totals footer row
    html += '<tr class="acr-row acr-row--total">';
    html += '<td class="acr-col-acct"><strong>All Accounts</strong></td>';
    quarterTotals.forEach(function (v) {
      html += '<td class="acr-col-q acr-cell--has-value"><strong>' + fmtAcr(v) + '</strong></td>';
    });
    html += '<td class="acr-col-total acr-total-cell"><strong>' + fmtAcr(grandTotal) + '</strong></td>';
    html += '<td class="acr-col-chart"></td>';
    html += '</tr>';

    html += '</tbody>';
    html += '</table>';
    html += '</div>'; // acr-table-wrap

    // Per-account bar chart cards
    html += '<div class="acr-cards">';
    accounts.forEach(function (a) {
      var qVals = quarters.map(function (q) {
        var idx = allQuarters.indexOf(q);
        return (a.quarters[idx] || {}).plannedAcr || 0;
      });
      var hasData = qVals.some(function (v) { return v > 0; });
      if (!hasData) return;

      html += '<div class="acr-card">';
      html += '<div class="acr-card-header">';
      html += '<span class="acr-card-acct">🏢 ' + safeEsc(a.accountName) + '</span>';
      html += '<span class="acr-card-total">Total: ' + fmtAcr(a.totalPlannedAcr) + '</span>';
      html += '<button class="acr-btn acr-btn--pbi acr-pbi-btn" data-account="' + safeEsc(a.accountName) + '" title="Load actuals from Power BI">📊 PBI Actuals</button>';
      html += '</div>';

      html += '<div class="acr-bar-chart">';
      qVals.forEach(function (v, i) {
        var barH = maxAcr > 0 ? Math.max(4, Math.round((v / maxAcr) * 80)) : 4;
        var cls  = v > 0 ? 'acr-bar--filled' : 'acr-bar--empty';
        html += '<div class="acr-bar-col">';
        html += '<div class="acr-bar-label-top">' + fmtAcr(v) + '</div>';
        html += '<div class="acr-bar-wrap"><div class="acr-bar ' + cls + '" style="height:' + barH + 'px"></div></div>';
        html += '<div class="acr-bar-label-bot">' + qLabels[i] + '</div>';
        html += '</div>';
      });
      html += '</div>';

      html += '</div>'; // acr-card
    });
    html += '</div>'; // acr-cards

    html += '</div>'; // acr-view
    return html;
  }

  function bindEvents() {
    if (!container) return;

    var refreshBtn = container.querySelector('#acr-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { loadData(); });

    var yearTabs = container.querySelectorAll('.acr-year-tab');
    yearTabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        yearFilter = Number(btn.getAttribute('data-year'));
        render();
      });
    });

    var pbiBtns = container.querySelectorAll('.acr-pbi-btn');
    pbiBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var acct = btn.getAttribute('data-account');
        btn.textContent = '⟳ Loading…';
        btn.disabled = true;
        // Delegate to Copilot via dispatchCopilotAction if available
        if (window.dispatchCopilotAction) {
          window.dispatchCopilotAction(
            '@pbi-analyst Run the Azure All-In-One review for ' + acct + ' and show quarterly ACR actuals',
            { suppressNav: true }
          ).catch(function () {
            btn.textContent = '📊 PBI Actuals';
            btn.disabled = false;
          });
        } else {
          setTimeout(function () {
            btn.textContent = '📊 PBI Actuals';
            btn.disabled = false;
            alert('PBI delegation not available — run: @pbi-analyst Run the Azure All-In-One review for ' + acct);
          }, 500);
        }
      });
    });
  }

  // ── View lifecycle ────────────────────────────────────────

  window.acrQuarterView = {
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
