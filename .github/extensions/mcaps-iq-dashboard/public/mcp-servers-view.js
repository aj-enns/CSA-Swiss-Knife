/* ============================================================
 *  MCP Servers View — Toggle MCP servers on/off
 * ============================================================ */
(function () {
  'use strict';

  var _el = null;
  var _servers = [];
  var _fetched = 0;
  var TTL = 30000;
  var _categoryFilter = 'all';

  var CATEGORY_META = {
    m365:      { label: 'Microsoft 365',  color: '#2563eb' },
    crm:       { label: 'CRM',            color: '#7c3aed' },
    vault:     { label: 'Vault',          color: '#10b981' },
    analytics: { label: 'Analytics',      color: '#f59e0b' },
    dev:       { label: 'Developer',      color: '#6366f1' },
    other:     { label: 'Other',          color: '#64748b' }
  };

  function mount(c) {
    _el = c;
    _el.innerHTML = '<div class="mcp-servers-view" id="mcp-servers-root"></div>';
    load(true);
  }

  function unmount() {
    if (_el) _el.innerHTML = '';
    _el = null;
  }

  function onActivate() { load(false); }

  function load(force) {
    if (!force && Date.now() - _fetched < TTL) { render(); return; }
    fetch('/api/mcp/servers')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _servers = data.servers || [];
        _fetched = Date.now();
        render();
      })
      .catch(function () { render(); });
  }

  function H(v) {
    if (!v) return '';
    var e = document.createElement('span');
    e.textContent = v;
    return e.innerHTML;
  }

  // ── Render ──────────────────────────────────────────────────

  function render() {
    var root = document.getElementById('mcp-servers-root');
    if (!root) return;

    var categories = {};
    _servers.forEach(function (s) {
      var cat = s.category || 'other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(s);
    });

    var enabledCount = _servers.filter(function (s) { return s.enabled; }).length;
    var totalCount = _servers.length;

    var html = '';

    // Header
    html += '<div class="mcp-header">' +
      '<div class="mcp-header__top">' +
        '<h2 class="mcp-header__title">MCP Servers</h2>' +
        '<div class="mcp-header__stats">' +
          '<span class="mcp-stat">' +
            '<span class="mcp-stat__value">' + totalCount + '</span>' +
            '<span class="mcp-stat__label">Total</span>' +
          '</span>' +
          '<span class="mcp-stat mcp-stat--active">' +
            '<span class="mcp-stat__value">' + enabledCount + '</span>' +
            '<span class="mcp-stat__label">Active</span>' +
          '</span>' +
        '</div>' +
      '</div>' +
      '<p class="mcp-header__desc">Manage MCP server connections available to Copilot agents. Toggle servers on or off to control which tools and data sources are accessible.</p>' +
    '</div>';

    // Category filter chips
    var allCats = ['all'].concat(Object.keys(categories).sort());
    html += '<div class="mcp-filters">';
    allCats.forEach(function (cat) {
      var active = cat === _categoryFilter ? ' mcp-chip--active' : '';
      var label = cat === 'all' ? 'All' : (CATEGORY_META[cat]?.label || cat);
      var count = cat === 'all' ? totalCount : (categories[cat]?.length || 0);
      html += '<button class="mcp-chip' + active + '" data-category="' + cat + '">' +
        label + ' <span class="mcp-chip__count">' + count + '</span>' +
      '</button>';
    });
    html += '</div>';

    // Server cards grouped by category
    var visibleCats = _categoryFilter === 'all' ? Object.keys(categories).sort() : [_categoryFilter];

    if (_servers.length === 0) {
      html += '<div class="mcp-empty">' +
        '<div class="mcp-empty__icon">🔌</div>' +
        '<h3>No MCP Servers Found</h3>' +
        '<p>Add servers to <code>.vscode/mcp.json</code> to get started.</p>' +
      '</div>';
    } else {
      visibleCats.forEach(function (cat) {
        var servers = categories[cat];
        if (!servers || !servers.length) return;
        var meta = CATEGORY_META[cat] || CATEGORY_META.other;

        html += '<div class="mcp-group">' +
          '<div class="mcp-group__header">' +
            '<span class="mcp-group__dot" style="background:' + meta.color + '"></span>' +
            '<span class="mcp-group__label">' + H(meta.label) + '</span>' +
            '<span class="mcp-group__count">' + servers.length + '</span>' +
          '</div>' +
          '<div class="mcp-group__cards">';

        servers.forEach(function (s) {
          var statusClass = s.enabled ? 'mcp-card--enabled' : 'mcp-card--disabled';
          var transportBadge = s.type === 'http'
            ? '<span class="mcp-transport mcp-transport--http">HTTP</span>'
            : '<span class="mcp-transport mcp-transport--stdio">STDIO</span>';
          var endpoint = s.url
            ? '<span class="mcp-endpoint" title="' + H(s.url) + '">' + truncateUrl(s.url) + '</span>'
            : s.command
              ? '<span class="mcp-endpoint" title="' + H(s.command) + '">' + H(s.command) + '</span>'
              : '';

          html += '<div class="mcp-card ' + statusClass + '" data-server="' + H(s.name) + '">' +
            '<div class="mcp-card__left">' +
              '<span class="mcp-card__icon">' + s.icon + '</span>' +
              '<div class="mcp-card__info">' +
                '<div class="mcp-card__name">' + H(s.label) + '</div>' +
                '<div class="mcp-card__meta">' +
                  transportBadge +
                  '<span class="mcp-card__id">' + H(s.name) + '</span>' +
                  endpoint +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="mcp-card__right">' +
              '<label class="mcp-toggle" title="' + (s.enabled ? 'Disable' : 'Enable') + ' ' + H(s.label) + '">' +
                '<input type="checkbox" class="mcp-toggle__input" data-server="' + H(s.name) + '"' +
                  (s.enabled ? ' checked' : '') + '>' +
                '<span class="mcp-toggle__track"></span>' +
              '</label>' +
            '</div>' +
          '</div>';
        });

        html += '</div></div>';
      });
    }

    root.innerHTML = html;
    bindEvents(root);
  }

  function truncateUrl(url) {
    try {
      var u = new URL(url);
      var host = u.hostname;
      if (host.length > 30) host = host.substring(0, 27) + '…';
      return host;
    } catch {
      return url.length > 40 ? url.substring(0, 37) + '…' : url;
    }
  }

  // ── Events ──────────────────────────────────────────────────

  function bindEvents(root) {
    // Category filter chips
    root.querySelectorAll('.mcp-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        _categoryFilter = chip.dataset.category;
        render();
      });
    });

    // Toggle switches
    root.querySelectorAll('.mcp-toggle__input').forEach(function (toggle) {
      toggle.addEventListener('change', function () {
        var serverName = toggle.dataset.server;
        var enabled = toggle.checked;
        toggleServer(serverName, enabled, toggle);
      });
    });
  }

  function toggleServer(name, enabled, toggleEl) {
    // Optimistic UI update
    var server = _servers.find(function (s) { return s.name === name; });
    if (server) server.enabled = enabled;

    var card = toggleEl.closest('.mcp-card');
    if (card) {
      card.classList.toggle('mcp-card--enabled', enabled);
      card.classList.toggle('mcp-card--disabled', !enabled);
    }

    fetch('/api/mcp/servers/' + encodeURIComponent(name) + '/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: enabled })
    }).then(function (r) {
      if (!r.ok) throw new Error('Toggle failed');
      return r.json();
    }).catch(function () {
      // Revert on failure
      if (server) server.enabled = !enabled;
      if (toggleEl) toggleEl.checked = !enabled;
      if (card) {
        card.classList.toggle('mcp-card--enabled', !enabled);
        card.classList.toggle('mcp-card--disabled', enabled);
      }
    });
  }

  // ── Listen for WS broadcasts ──────────────────────────────

  if (window.AppState) {
    window.AppState.subscribe('mcp:server-toggled', function (data) {
      var s = _servers.find(function (sv) { return sv.name === data.server; });
      if (s) { s.enabled = data.enabled; render(); }
    });
  }

  // ── Export ──────────────────────────────────────────────────

  window.mcpServersView = { mount: mount, unmount: unmount, onActivate: onActivate };
})();
