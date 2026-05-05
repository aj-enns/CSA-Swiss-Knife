/* ============================================================
 *  Skills Explorer — 3-tab layout for MCAPS IQ capabilities
 *  Tabs: Roles | All Skills | Agents & Architecture
 * ============================================================ */
(function () {
  'use strict';

  var _el = null, _timer = null, _fetched = 0;
  var TTL = 120000;
  var _skills = [], _prompts = [], _agents = [], _roleMapping = {};
  var _q = '', _tab = 'roles', _role = null, _typeFilter = null;

  function mount(c) { _el = c; _el.innerHTML = '<div class="skills-view" id="skills-root"></div>'; load(true); }
  function unmount() { if (_timer) clearInterval(_timer); _timer = null; if (_el) _el.innerHTML = ''; _el = null; _q = ''; }
  function onActivate() { load(false); }

  function load(force) {
    if (!force && Date.now() - _fetched < TTL) { render(); return; }
    Promise.all([
      fetch('/api/skills').then(function (r) { return r.json(); }),
      fetch('/api/prompts').then(function (r) { return r.json(); }).catch(function () { return []; }),
      fetch('/api/agents').then(function (r) { return r.json(); }).catch(function () { return []; }),
      fetch('/api/skills/roles').then(function (r) { return r.json(); }).catch(function () { return {}; })
    ]).then(function (r) {
      _skills = Array.isArray(r[0]?.core) ? r[0].core : (Array.isArray(r[0]) ? r[0] : []);
      _prompts = r[1]; _agents = r[2]; _roleMapping = r[3];
      _fetched = Date.now(); render();
    }).catch(function () { render(); });
  }

  function H(v) { if (!v) return ''; var e = document.createElement('span'); e.textContent = v; return e.innerHTML; }

  function hl(t) {
    if (!_q || !t) return t;
    var r = t;
    _q.split(/\s+/).filter(Boolean).forEach(function (w) {
      r = r.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
    });
    return r;
  }

  function matches(item) {
    if (!_q) return true;
    var haystack = [item.name || '', item.description || '', item.id || ''].concat(item.triggers || []).join(' ').toLowerCase();
    return _q.split(/\s+/).every(function (t) { return haystack.includes(t); });
  }

  function depBadges(deps) {
    if (!deps || !deps.length) return '';
    return deps.map(function (d) {
      var cls = 'dep-' + d.toLowerCase();
      var icon = d === 'CRM' ? '🔗' : d === 'PBI' ? '📊' : d === 'M365' ? '📧' : d === 'Vault' ? '📂' : '📦';
      return '<span class="dep-badge ' + cls + '">' + icon + ' ' + H(d) + '</span>';
    }).join('');
  }

  // ── Render ──────────────────────────────────────────────────

  function render() {
    var root = document.getElementById('skills-root');
    if (!root) return;

    var html = '<div class="skills-header">' +
      '<h2>Skills Explorer</h2>' +
      '<div class="skills-summary">' +
        '<span class="summary-chip">🔧 ' + _skills.length + ' Skills</span>' +
        '<span class="summary-chip">📝 ' + _prompts.length + ' Prompts</span>' +
        '<span class="summary-chip">🤖 ' + _agents.length + ' Agents</span>' +
        '<span class="summary-chip">👤 ' + Object.keys(_roleMapping).length + ' Roles</span>' +
      '</div>' +
    '</div>';

    // Tabs
    html += '<div class="skills-tabs">' +
      '<button class="skills-tab' + (_tab === 'roles' ? ' active' : '') + '" data-tab="roles">👤 Roles</button>' +
      '<button class="skills-tab' + (_tab === 'all' ? ' active' : '') + '" data-tab="all">🔧 All Skills</button>' +
      '<button class="skills-tab' + (_tab === 'agents' ? ' active' : '') + '" data-tab="agents">🤖 Agents</button>' +
    '</div>';

    // Search
    html += '<div class="skills-search">' +
      '<input type="text" id="skills-search-input" placeholder="Search skills, prompts, agents…" value="' + H(_q) + '">' +
    '</div>';

    // Tab content
    if (_tab === 'roles') html += renderRolesTab();
    else if (_tab === 'all') html += renderAllTab();
    else if (_tab === 'agents') html += renderAgentsTab();

    root.innerHTML = html;
    bindEvents(root);
  }

  // ── Roles Tab ──────────────────────────────────────────────

  function renderRolesTab() {
    var html = '<div class="roles-grid">';
    var roles = Object.values(_roleMapping);

    if (roles.length === 0) {
      html += '<div class="empty-state">No role mappings found. Check .github/skills/role-* files.</div>';
    }

    roles.forEach(function (role) {
      var isOpen = _role === role.id;
      var skillCount = role.skills ? role.skills.length : 0;

      html += '<div class="role-card' + (isOpen ? ' expanded' : '') + '" data-role="' + H(role.id) + '">' +
        '<div class="role-card-header" data-action="toggle-role" data-role-id="' + H(role.id) + '">' +
          '<div class="role-info">' +
            '<h3>' + H(role.label) + '</h3>' +
            '<span class="role-stages">' + H(role.stages) + '</span>' +
          '</div>' +
          '<div class="role-meta">' +
            '<span class="skill-count">' + skillCount + ' skills</span>' +
            '<span class="expand-arrow">' + (isOpen ? '▼' : '▶') + '</span>' +
          '</div>' +
        '</div>';

      if (isOpen) {
        html += '<div class="role-detail">';
        if (role.description) {
          html += '<p class="role-description">' + H(role.description).slice(0, 200) + '</p>';
        }

        if (role.skills && role.skills.length > 0) {
          html += '<div class="role-skills">';
          role.skills.forEach(function (skillId) {
            var skill = _skills.find(function (s) { return s.id === skillId; });
            if (skill) {
              html += '<div class="skill-chip" title="' + H(skill.description) + '">' +
                '<span class="skill-chip-name">🔧 ' + H(skill.name) + '</span>' +
                depBadges(skill.dependencies) +
              '</div>';
            } else {
              html += '<div class="skill-chip"><span class="skill-chip-name">🔧 ' + H(skillId) + '</span></div>';
            }
          });
          html += '</div>';
        }

        html += '<button class="role-action-btn" data-action="load-role" data-role-id="' + H(role.id) + '">🎯 Set as My Role</button>';
        html += '</div>';
      }

      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  // ── All Skills Tab ─────────────────────────────────────────

  function renderAllTab() {
    var html = '';

    // Type filter pills
    html += '<div class="type-pills">' +
      '<button class="type-pill' + (!_typeFilter ? ' active' : '') + '" data-type="">All</button>' +
      '<button class="type-pill' + (_typeFilter === 'skill' ? ' active' : '') + '" data-type="skill">🔧 Skills (' + _skills.length + ')</button>' +
      '<button class="type-pill' + (_typeFilter === 'prompt' ? ' active' : '') + '" data-type="prompt">📝 Prompts (' + _prompts.length + ')</button>' +
    '</div>';

    var items = [];
    if (!_typeFilter || _typeFilter === 'skill') {
      _skills.forEach(function (s) { items.push(s); });
    }
    if (!_typeFilter || _typeFilter === 'prompt') {
      _prompts.forEach(function (p) { items.push(p); });
    }

    var filtered = items.filter(matches);

    html += '<div class="skills-grid">';
    if (filtered.length === 0) {
      html += '<div class="empty-state">No results found for "' + H(_q) + '"</div>';
    }

    filtered.forEach(function (item) {
      var typeIcon = item.type === 'prompt' ? '📝' : '🔧';
      var typeCls = item.type === 'prompt' ? 'type-prompt' : 'type-skill';

      html += '<div class="skill-card ' + typeCls + '">' +
        '<div class="skill-card-header">' +
          '<span class="skill-icon">' + typeIcon + '</span>' +
          '<span class="skill-name">' + hl(H(item.name || item.id)) + '</span>' +
          '<span class="type-badge">' + H(item.type) + '</span>' +
        '</div>' +
        '<p class="skill-desc">' + hl(H((item.description || '').slice(0, 150))) + '</p>';

      if (item.triggers && item.triggers.length > 0) {
        html += '<div class="skill-triggers">';
        item.triggers.slice(0, 5).forEach(function (t) {
          html += '<span class="trigger-tag">' + H(t) + '</span>';
        });
        if (item.triggers.length > 5) {
          html += '<span class="trigger-more">+' + (item.triggers.length - 5) + ' more</span>';
        }
        html += '</div>';
      }

      if (item.dependencies) {
        html += '<div class="skill-deps">' + depBadges(item.dependencies) + '</div>';
      }

      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  // ── Agents Tab ─────────────────────────────────────────────

  function renderAgentsTab() {
    var html = '<div class="agents-section">';

    // Agent architecture diagram (text-based)
    html += '<div class="arch-diagram">' +
      '<h3>🏗️ Agent Architecture</h3>' +
      '<div class="arch-tree">' +
        '<div class="arch-node arch-primary">@mcaps<span class="arch-desc">Primary orchestrator</span></div>' +
        '<div class="arch-children">' +
          '<div class="arch-line"></div>' +
          '<div class="arch-node arch-sub">@m365-actions<span class="arch-desc">Teams, Calendar, Mail</span></div>' +
          '<div class="arch-node arch-sub">@pbi-analyst<span class="arch-desc">Power BI DAX queries</span></div>' +
          '<div class="arch-node arch-sub">@obsidian-viz<span class="arch-desc">Vault dashboards</span></div>' +
        '</div>' +
        '<div class="arch-standalone">' +
          '<div class="arch-node arch-other">@doctor<span class="arch-desc">Doc site editing</span></div>' +
        '</div>' +
      '</div>' +
    '</div>';

    // Agent cards
    html += '<div class="agents-grid">';

    if (_agents.length === 0) {
      html += '<div class="empty-state">No agents found. Check .github/agents/ directory.</div>';
    }

    _agents.forEach(function (agent) {
      var filtered2 = matches(agent);
      if (!filtered2) return;

      html += '<div class="agent-card">' +
        '<div class="agent-header">' +
          '<span class="agent-icon">🤖</span>' +
          '<span class="agent-name">@' + H(agent.name) + '</span>' +
        '</div>' +
        '<p class="agent-desc">' + hl(H((agent.description || '').slice(0, 200))) + '</p>';

      if (agent.tools && agent.tools.length > 0) {
        html += '<div class="agent-tools"><span class="tools-label">Tools:</span> ';
        agent.tools.slice(0, 6).forEach(function (t) {
          html += '<span class="tool-tag">' + H(t) + '</span>';
        });
        if (agent.tools.length > 6) {
          html += '<span class="trigger-more">+' + (agent.tools.length - 6) + '</span>';
        }
        html += '</div>';
      }

      if (agent.subAgents && agent.subAgents.length > 0) {
        html += '<div class="agent-subs"><span class="tools-label">Delegates to:</span> ';
        agent.subAgents.forEach(function (sa) {
          html += '<span class="sub-agent-tag">@' + H(sa) + '</span>';
        });
        html += '</div>';
      }

      html += '</div>';
    });

    html += '</div></div>';
    return html;
  }

  // ── Event Binding ──────────────────────────────────────────

  function bindEvents(root) {
    // Tab switching
    root.querySelectorAll('.skills-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _tab = btn.dataset.tab;
        render();
      });
    });

    // Search
    var searchInput = root.querySelector('#skills-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        _q = searchInput.value.toLowerCase().trim();
        render();
        var newInput = document.getElementById('skills-search-input');
        if (newInput) { newInput.focus(); newInput.selectionStart = newInput.selectionEnd = newInput.value.length; }
      });
    }

    // Type filter pills
    root.querySelectorAll('.type-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        _typeFilter = pill.dataset.type || null;
        render();
      });
    });

    // Role toggle
    root.querySelectorAll('[data-action="toggle-role"]').forEach(function (header) {
      header.addEventListener('click', function () {
        var roleId = header.dataset.roleId;
        _role = _role === roleId ? null : roleId;
        render();
      });
    });

    // Load role action
    root.querySelectorAll('[data-action="load-role"]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var roleId = btn.dataset.roleId;
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: roleId })
        }).then(function () {
          if (window.dispatchCopilotAction) {
            window.dispatchCopilotAction('/my-role');
          }
        });
      });
    });
  }

  window.skillsView = { mount: mount, unmount: unmount, onActivate: onActivate };
})();
