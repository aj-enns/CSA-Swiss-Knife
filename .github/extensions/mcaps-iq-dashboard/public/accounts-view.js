/* ============================================================
 *  Accounts View — Account-centric pipeline aggregation
 *  Derives account cards from opportunity data, grouped by
 *  customer name with pipeline totals, stage breakdown, and
 *  opportunity drill-down.
 * ============================================================ */
(function () {
  'use strict';

  var _el = null;
  var _accounts = [];
  var _loading = false;
  var _error = null;
  var _expanded = new Set();
  var _search = '';
  var _sort = 'monthly'; // monthly | value | opps | name

  var STAGE_COLORS = {
    '1': { bg: '#dbeafe', text: '#1e40af' },
    '2': { bg: '#e0e7ff', text: '#3730a3' },
    '3': { bg: '#ede9fe', text: '#5b21b6' },
    '4': { bg: '#fae8ff', text: '#86198f' },
    '5': { bg: '#fce7f3', text: '#9d174d' }
  };

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

  function healthIcon(h) {
    return h === 'red' ? '🔴' : h === 'yellow' ? '🟡' : '🟢';
  }

  function worstHealth(opps) {
    var hasRed = opps.some(function (o) { return o.health === 'red'; });
    if (hasRed) return 'red';
    var hasYellow = opps.some(function (o) { return o.health === 'yellow'; });
    return hasYellow ? 'yellow' : 'green';
  }

  function crmLink(id) {
    return 'https://microsoftsales.crm.dynamics.com/main.aspx?etn=opportunity&id=' +
      encodeURIComponent(id) + '&pagetype=entityrecord';
  }

  // ── Aggregate opportunities into accounts ────────────────────

  function buildAccounts(rawOpps) {
    var map = {};
    rawOpps.forEach(function (raw) {
      var customer = raw.customer || raw.accountName || raw.account || 'Unknown';
      if (!map[customer]) {
        map[customer] = {
          name: customer,
          opportunities: [],
          totalMonthly: 0,
          totalValue: 0,
          stages: {},
          health: 'green'
        };
      }
      var opp = {
        id: raw.id || raw.opportunityId || '',
        name: raw.name || raw.opportunityName || '',
        number: raw.opportunityNumber || raw.number || '',
        stage: raw.stage || raw.stageName || '',
        sn: stageNum(raw.stage || raw.stageName || ''),
        monthlyUse: parseMonthly(raw.monthlyUse || raw.totalMonthlyUse),
        estimatedValue: raw.estimatedValue || raw.estimatedvalue || raw.revenue || 0,
        estimatedClose: raw.estimatedCloseDate || raw.estimated_close || '',
        health: normalizeHealth(raw.health),
        relationship: (raw.relationship === 'both' ? 'owner' : raw.relationship) || '',
        dealTeamCount: raw.dealTeamCount || (raw.dealTeam ? raw.dealTeam.length : 0)
      };
      map[customer].opportunities.push(opp);
      map[customer].totalMonthly += opp.monthlyUse;
      map[customer].totalValue += opp.estimatedValue;
      map[customer].stages[opp.sn] = (map[customer].stages[opp.sn] || 0) + 1;
    });

    return Object.values(map).map(function (acct) {
      acct.health = worstHealth(acct.opportunities);
      return acct;
    });
  }

  // ── Data loading ────────────────────────────────────────────

  function loadData(bustCache) {
    _loading = true;
    _error = null;
    render();

    var pipeline = bustCache
      ? fetch('/api/crm/refresh', { method: 'POST' }).then(function () {
          return fetch('/api/crm/opportunities');
        })
      : fetch('/api/crm/opportunities');

    pipeline
      .then(function (r) {
        if (!r.ok) throw new Error('CRM returned ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var opps = [];
        if (Array.isArray(data)) opps = data;
        else if (data.opportunities) opps = data.opportunities;
        else if (data.content) {
          try {
            var parsed = typeof data.content === 'string' ? JSON.parse(data.content) : data.content;
            opps = Array.isArray(parsed) ? parsed : parsed.opportunities || [];
          } catch (e) { opps = []; }
        }
        _accounts = buildAccounts(opps);
        _loading = false;
        render();
      })
      .catch(function (err) {
        _error = err.message;
        _loading = false;
        render();
      });
  }

  // ── Filtering & Sorting ─────────────────────────────────────

  function filterAndSort(accounts) {
    var filtered = accounts;
    if (_search) {
      var q = _search.toLowerCase();
      filtered = accounts.filter(function (a) {
        if (a.name.toLowerCase().indexOf(q) !== -1) return true;
        return a.opportunities.some(function (o) {
          return (o.name + ' ' + o.number).toLowerCase().indexOf(q) !== -1;
        });
      });
    }

    return filtered.slice().sort(function (a, b) {
      // Vault-tracked customers float to top
      var aVault = window.VaultCustomers && window.VaultCustomers.isTracked(a.name) ? 1 : 0;
      var bVault = window.VaultCustomers && window.VaultCustomers.isTracked(b.name) ? 1 : 0;
      if (aVault !== bVault) return bVault - aVault;

      switch (_sort) {
        case 'monthly': return b.totalMonthly - a.totalMonthly;
        case 'value': return b.totalValue - a.totalValue;
        case 'opps': return b.opportunities.length - a.opportunities.length;
        case 'name': return a.name.localeCompare(b.name);
        default: return 0;
      }
    });
  }

  // ── Render ──────────────────────────────────────────────────

  function renderStagePips(stages) {
    var html = '';
    ['1', '2', '3', '4', '5'].forEach(function (s) {
      var count = stages[s] || 0;
      if (!count) return;
      var sc = STAGE_COLORS[s] || { bg: '#f1f5f9', text: '#475569' };
      html += '<span class="acct-stage-pip" style="background:' + sc.bg + ';color:' + sc.text + '">S' + s + '×' + count + '</span>';
    });
    return html || '<span class="acct-no-stages">—</span>';
  }

  function renderOppRow(opp) {
    var sn = opp.sn;
    var sc = STAGE_COLORS[sn] || { bg: '#f1f5f9', text: '#475569' };
    return '<tr class="acct-opp-row">' +
      '<td><a href="' + crmLink(opp.id) + '" target="_blank" rel="noopener" class="opp-link acct-ext-link">' + esc(opp.name || opp.number) + '</a></td>' +
      '<td><span class="stage-badge" style="background:' + sc.bg + ';color:' + sc.text + '">S' + sn + '</span></td>' +
      '<td>' + healthIcon(opp.health) + '</td>' +
      '<td>' + currency(opp.monthlyUse) + '</td>' +
      '<td>' + fmtDate(opp.estimatedClose) + '</td>' +
      '<td>' + (opp.dealTeamCount || '—') + '</td>' +
    '</tr>';
  }

  function renderAccountCard(acct) {
    var isOpen = _expanded.has(acct.name);
    var arrow = isOpen ? '▼' : '▶';

    var html = '<div class="acct-card' + (isOpen ? ' acct-card--expanded' : '') + '" data-acct="' + esc(acct.name) + '">';

    // Header row
    html += '<div class="acct-card__header" data-acct-toggle="' + esc(acct.name) + '">';
    html += '<div class="acct-card__left">';
    html += '<span class="acct-card__health">' + healthIcon(acct.health) + '</span>';
    html += '<div class="acct-card__info">';
    html += '<div class="acct-card__name">' + esc(acct.name) + (window.VaultCustomers && window.VaultCustomers.isTracked(acct.name) ? ' <span class="vault-badge" title="Tracked in vault">📌</span>' : '') + '</div>';
    html += '<div class="acct-card__meta">';
    html += '<span class="acct-card__opp-count">' + acct.opportunities.length + ' opp' + (acct.opportunities.length !== 1 ? 's' : '') + '</span>';
    html += '<span class="acct-card__stages">' + renderStagePips(acct.stages) + '</span>';
    html += '</div>';
    html += '</div></div>';

    html += '<div class="acct-card__right">';
    html += '<div class="acct-card__metric"><span class="acct-card__metric-val">' + currency(acct.totalMonthly) + '</span><span class="acct-card__metric-label">Monthly</span></div>';
    if (acct.totalValue > 0) {
      html += '<div class="acct-card__metric"><span class="acct-card__metric-val">' + currency(acct.totalValue) + '</span><span class="acct-card__metric-label">Pipeline</span></div>';
    }
    html += '<button class="acct-card__toggle" title="' + (isOpen ? 'Collapse' : 'Expand') + '">' + arrow + '</button>';
    html += '</div></div>';

    // Expanded detail
    if (isOpen) {
      html += '<div class="acct-card__detail">';
      html += '<div class="acct-card__actions">';
      html += '<button class="acct-action-btn" data-action="review" data-acct-name="' + esc(acct.name) + '">📊 Account Review</button>';
      html += '<button class="acct-action-btn" data-action="prep" data-acct-name="' + esc(acct.name) + '">📋 Prep Me</button>';
      html += '<button class="acct-action-btn" data-action="landscape" data-acct-name="' + esc(acct.name) + '">🗺️ Landscape</button>';
      html += '</div>';
      html += '<table class="acct-opp-table"><thead><tr>';
      html += '<th>Opportunity</th><th>Stage</th><th>Health</th><th>Monthly Use</th><th>Close Date</th><th>Team</th>';
      html += '</tr></thead><tbody>';
      acct.opportunities.forEach(function (o) { html += renderOppRow(o); });
      html += '</tbody></table>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function render() {
    if (!_el) return;
    var html = '<div class="acct-view">';

    // Header
    html += '<div class="acct-header">';
    html += '<h2>🏢 Accounts</h2>';
    html += '<button class="opps-refresh-btn" data-action="refresh">🔄 Refresh</button>';
    html += '</div>';

    if (_loading) {
      html += '<div class="opps-loading"><div class="spinner"></div><p>Loading accounts from CRM…</p></div></div>';
      _el.innerHTML = html;
      bindEvents();
      return;
    }

    if (_error) {
      html += '<div class="opps-error"><p>⚠️ ' + esc(_error) + '</p>' +
        '<p class="opps-error-hint">Make sure you are authenticated with <code>az login</code>.</p>' +
        '<button class="opps-refresh-btn" data-action="refresh">Retry</button></div></div>';
      _el.innerHTML = html;
      bindEvents();
      return;
    }

    if (_accounts.length === 0) {
      html += '<div class="opps-empty"><p>No accounts found on your deal team.</p>' +
        '<button class="opps-refresh-btn" data-action="refresh">Refresh</button></div></div>';
      _el.innerHTML = html;
      bindEvents();
      return;
    }

    // Summary
    var totalOpps = 0, totalMonthly = 0;
    _accounts.forEach(function (a) { totalOpps += a.opportunities.length; totalMonthly += a.totalMonthly; });
    html += '<div class="opps-summary">';
    html += '<div class="summary-card"><span class="summary-val">' + _accounts.length + '</span><span class="summary-label">Accounts</span></div>';
    html += '<div class="summary-card"><span class="summary-val">' + totalOpps + '</span><span class="summary-label">Opportunities</span></div>';
    html += '<div class="summary-card"><span class="summary-val">' + currency(totalMonthly) + '</span><span class="summary-label">Total Monthly</span></div>';
    html += '</div>';

    // Toolbar
    html += '<div class="acct-toolbar">';
    html += '<input type="text" class="opps-search acct-search" placeholder="Search accounts or opportunities…" value="' + esc(_search) + '">';
    html += '<div class="acct-sort">';
    html += '<span class="acct-sort-label">Sort:</span>';
    ['monthly', 'value', 'opps', 'name'].forEach(function (s) {
      var labels = { monthly: 'Monthly Use', value: 'Pipeline', opps: 'Opp Count', name: 'Name' };
      var active = _sort === s ? ' active' : '';
      html += '<button class="type-pill acct-sort-btn' + active + '" data-sort-key="' + s + '">' + labels[s] + '</button>';
    });
    html += '</div></div>';

    // Account cards
    var sorted = filterAndSort(_accounts);
    if (sorted.length === 0) {
      html += '<div class="empty-state">No accounts match your search</div>';
    } else {
      html += '<div class="acct-list">';
      sorted.forEach(function (a) { html += renderAccountCard(a); });
      html += '</div>';
    }

    html += '</div>';
    _el.innerHTML = html;
    bindEvents();
  }

  // ── Events ──────────────────────────────────────────────────

  function bindEvents() {
    if (!_el) return;

    // Refresh (bust server-side CRM cache so fresh data is returned)
    _el.querySelectorAll('[data-action="refresh"]').forEach(function (btn) {
      btn.addEventListener('click', function () { loadData(true); });
    });

    // Expand/collapse
    _el.querySelectorAll('[data-acct-toggle]').forEach(function (el) {
      el.addEventListener('click', function () {
        var name = el.dataset.acctToggle;
        if (_expanded.has(name)) _expanded.delete(name);
        else _expanded.add(name);
        render();
      });
    });

    // Sort
    _el.querySelectorAll('[data-sort-key]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _sort = btn.dataset.sortKey;
        render();
      });
    });

    // Search
    var searchInput = _el.querySelector('.acct-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        _search = searchInput.value.trim();
        render();
        var newInput = _el.querySelector('.acct-search');
        if (newInput) { newInput.focus(); newInput.selectionStart = newInput.selectionEnd = newInput.value.length; }
      });
    }

    // Copilot actions
    _el.querySelectorAll('[data-action="review"]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (window.dispatchCopilotAction) window.dispatchCopilotAction('Account review for ' + btn.dataset.acctName);
      });
    });
    _el.querySelectorAll('[data-action="prep"]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (window.dispatchCopilotAction) window.dispatchCopilotAction('Prep me for ' + btn.dataset.acctName);
      });
    });
    _el.querySelectorAll('[data-action="landscape"]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (window.dispatchCopilotAction) window.dispatchCopilotAction('Account landscape for ' + btn.dataset.acctName);
      });
    });

    // External links — native navigation via target="_blank"
  }

  // ── Public API ──────────────────────────────────────────────

  function mount(c) {
    _el = c;
    render();
    loadData();
    if (window.AppState) {
      window.AppState.subscribe('vault:customers', function () { if (_el && _accounts.length) render(); });
    }
  }
  function unmount() { _el = null; }
  function onActivate() { if (_accounts.length === 0 && !_loading) loadData(); }

  window.accountsView = { mount: mount, unmount: unmount, onActivate: onActivate };
})();
