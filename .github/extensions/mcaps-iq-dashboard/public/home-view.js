/* ============================================================
 *  Home View — Role-contextual landing dashboard
 * ============================================================ */
(function () {
  'use strict';

  var ROLE_CONFIGS = {
    specialist: {
      label: 'Specialist',
      greeting: 'Pipeline builder',
      actions: [
        { icon: '🎯', label: 'My Opportunities', link: '#/opportunities' },
        { icon: '📊', label: 'Pipeline Review', prompt: '/weekly' },
        { icon: '📋', label: 'Milestone Review', prompt: 'Review my milestones' },
        { icon: '💡', label: 'What Next', prompt: '/what-next' }
      ]
    },
    se: {
      label: 'Solution Engineer',
      greeting: 'Technical proof driver',
      actions: [
        { icon: '🎯', label: 'My Opportunities', link: '#/opportunities' },
        { icon: '📋', label: 'Milestone Review', prompt: 'Review my milestones' },
        { icon: '🚀', label: 'Proof Plan', prompt: 'Build a proof plan' },
        { icon: '💡', label: 'What Next', prompt: '/what-next' }
      ]
    },
    csa: {
      label: 'Cloud Solution Architect',
      greeting: 'Execution owner',
      actions: [
        { icon: '🎯', label: 'My Opportunities', link: '#/opportunities' },
        { icon: '📅', label: 'Timeline',         link: '#/gantt' },
        { icon: '📊', label: 'Job2 Tracker',     link: '#/job2' },
        { icon: '📈', label: 'ACR by Quarter',   link: '#/acr-quarter' },
        { icon: '📋', label: 'Account Brief',    prompt: '@account-brief Give me an account brief for {{customer}}', needsCustomer: true },
        { icon: '🔥', label: 'Burn Check',       prompt: '@burn-planner Show my burn dashboard' },
        { icon: '💡', label: 'Action Plan',      link: '#/action-plan' }
      ]
    },
    csam: {
      label: 'Customer Success AM',
      greeting: 'Outcome orchestrator',
      actions: [
        { icon: '🎯', label: 'My Opportunities', link: '#/opportunities' },
        { icon: '📊', label: 'Job2 Tracker',     link: '#/job2' },
        { icon: '📈', label: 'ACR by Quarter',   link: '#/acr-quarter' },
        { icon: '📋', label: 'Account Brief', prompt: '@account-brief Give me an account brief for {{customer}}', needsCustomer: true },
        { icon: '🧹', label: 'Hygiene Check', prompt: '@hygiene-genie Run a hygiene check on all my active accounts' },
        { icon: '🗓️', label: 'Delivery Plan', prompt: '@delivery-plan-builder Build a delivery plan for {{customer}}', needsCustomer: true },
        { icon: '💡', label: 'Action Plan',   link: '#/action-plan' }
      ]
    },
    ae: {
      label: 'Account Executive',
      greeting: 'Relationship owner',
      actions: [
        { icon: '🎯', label: 'My Opportunities', link: '#/opportunities' },
        { icon: '📊', label: 'Pipeline Review', prompt: '/weekly' },
        { icon: '🔍', label: 'Discovery', prompt: '/daily' },
        { icon: '💡', label: 'What Next', prompt: '/what-next' }
      ]
    },
    ats: {
      label: 'Account Technology Strategist',
      greeting: 'Technology strategist',
      actions: [
        { icon: '🎯', label: 'My Opportunities', link: '#/opportunities' },
        { icon: '📋', label: 'Account Plan', prompt: 'Build an account plan' },
        { icon: '🗺️', label: 'Solution Mapper', prompt: 'Map technical solution' },
        { icon: '🎯', label: 'Exec Vision', prompt: 'Prepare executive conversation' }
      ]
    },
    ia: {
      label: 'Industry Advisor',
      greeting: 'Industry advisor',
      actions: [
        { icon: '🎯', label: 'My Opportunities', link: '#/opportunities' },
        { icon: '📊', label: 'Pipeline Qualification', prompt: 'Qualify my pipeline' },
        { icon: '🔍', label: 'Discovery', prompt: '/daily' },
        { icon: '🏭', label: 'Industry Analysis', prompt: 'Run industry analysis' }
      ]
    },
    sd: {
      label: 'Sales Director',
      greeting: 'Team coach',
      actions: [
        { icon: '🎯', label: 'My Opportunities', link: '#/opportunities' },
        { icon: '📊', label: 'Pipeline Governance', prompt: '/weekly' },
        { icon: '📋', label: 'Weekly Review', prompt: '/weekly' },
        { icon: '👥', label: 'Team Coaching', prompt: 'Coach my team' }
      ]
    }
  };

  // ── CSA Swiss Knife Prompt Definitions ───────────────────────

  var SWISS_KNIFE_PROMPTS = [
    {
      icon: '📋', label: 'Account Brief',
      prompt: '@account-brief Give me a 360° brief on {{customer}}',
      description: 'Pre-call snapshot — vault + CRM + WorkIQ synthesized',
      defaults: { allowAllTools: true, model: '' },
      customerPrompt: true
    },
    {
      icon: '🗓️', label: 'Delivery Plan',
      prompt: '@delivery-plan-builder Build a delivery plan for {{customer}}',
      description: 'Milestone planning, timeline, and delivery doc generation',
      defaults: { allowAllTools: true, model: '' },
      customerPrompt: true
    },
    {
      icon: '🧹', label: 'Hygiene Genie',
      prompt: '@hygiene-genie Run a hygiene check on all my active accounts',
      description: 'CRM data quality, stale records, WorkIQ task hygiene',
      defaults: { allowAllTools: true, model: '' }
    },
    {
      icon: '🔥', label: 'Burn Planner',
      prompt: '@burn-planner Show my burn dashboard across all active engagements',
      description: 'ECIF / Unified utilization, burn rate, at-risk forecast',
      defaults: { allowAllTools: true, model: '' }
    },
    {
      icon: '🏭', label: 'Factory Concierge',
      prompt: '@factory-concierge Help me find the right delivery template and process guidance',
      description: 'WBS templates, SOW guidance, SME routing, escalation paths',
      defaults: { allowAllTools: true, model: '' }
    }
  ];

  // ── Vault & Daily Prompt Definitions ─────────────────────────

  var VAULT_PROMPTS = [
    {
      icon: '🧹', label: 'Customer Hygiene',
      prompt: 'Run customer hygiene on all my customers',
      description: 'Consolidate insights, fix structure, tidy customer notes',
      defaults: { allowAllTools: true, model: '' }
    },
    {
      icon: '📐', label: 'Project Hygiene',
      prompt: 'Run project hygiene on my projects — fix frontmatter, sections, meeting dataview queries',
      description: 'Standardize project notes, fix missing sections',
      defaults: { allowAllTools: true, model: '' }
    },
    {
      icon: '🔄', label: 'Vault Sync',
      prompt: 'vault sync',
      description: 'Bulk CRM → vault sync for deal-team opps',
      defaults: { allowAllTools: true, model: '' }
    },
    {
      icon: '👥', label: 'People Sync',
      prompt: 'Sync people — batch deal team people to vault',
      description: 'Sync deal team members to People notes',
      defaults: { allowAllTools: true, model: '' }
    },
    {
      icon: '📋', label: 'Milestone Sync',
      prompt: 'Run milestone sync across my customers',
      description: 'Deep per-milestone rebuild from CRM',
      defaults: { allowAllTools: true, model: '' }
    },
    {
      icon: '📊', label: 'Dashboard Refresh',
      prompt: 'Refresh my vault dashboard',
      description: 'Rebuild Pipeline Dashboard with latest data',
      defaults: { allowAllTools: true, model: '' }
    }
  ];

  var DAILY_PROMPTS = [
    {
      icon: '🌅', label: 'Morning Prep',
      prompt: '/morning-prep',
      description: 'Populate daily note + meeting prep skeletons',
      defaults: { allowAllTools: true, model: '' }
    },
    {
      icon: '📅', label: 'Daily',
      prompt: '/daily',
      description: 'Role-aware hygiene checks, top 3 actions',
      defaults: { allowAllTools: true, model: '' }
    },
    {
      icon: '📊', label: 'Weekly',
      prompt: '/weekly',
      description: 'Monday governance prep / Friday digest',
      defaults: { allowAllTools: true, model: '' }
    },
    {
      icon: '🔮', label: 'What Next',
      prompt: '/what-next',
      description: 'Highest-impact action for right now',
      defaults: { allowAllTools: false, model: '' }
    },
    {
      icon: '✅', label: 'Task Sync',
      prompt: '/task-sync',
      description: 'Reconcile CRM tasks → vault activity logs',
      defaults: { allowAllTools: true, model: '' }
    }
  ];

  var container = null;
  var summary = null;
  var settings = null;
  var vaultHealth = null;
  var vaultNotes = null;
  var vaultCounts = null;
  var activeFilter = 'all';
  var agentLog = null;
  var vaultName = null;
  var userProfile = null;
  var unsubscribe = null;
  var activeConfigPrompt = null; // tracks which prompt has config panel open
  var availableModels = [];       // populated from /api/models
  var collapsedSections = { vault: true, daily: true, 'swiss-knife': false }; // swiss-knife expanded by default
  var pendingCustomer = null;     // { promptText, flags, draft, label } — set when awaiting customer name input
  var activeAccountResult = null; // { customer, label, sessionId, startResponseIdx, sourcesOpen }
  var drawerRoot = null;          // persistent body-level div for the result drawer
  var drawerStateSubscription = null; // persists across view mount/unmount

  // ── MCP server inference map ──────────────────────────────────

  var SERVER_MAP = [
    { prefix: 'msx-',             name: 'MSX CRM',        icon: '🎯' },
    { prefix: 'powerbi-remote-',  name: 'Power BI',       icon: '📊' },
    { prefix: 'calendar-',        name: 'Calendar',       icon: '📅' },
    { prefix: 'mail-',            name: 'Mail',           icon: '📧' },
    { prefix: 'teams-',           name: 'Teams',          icon: '💬' },
    { prefix: 'sharepoint-',      name: 'SharePoint',     icon: '📁' },
    { prefix: 'word-',            name: 'Word/OneDrive',  icon: '📄' },
    { prefix: 'ide-',             name: 'IDE',            icon: '💻' }
  ];

  function safeEsc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function extractSources(sessionId) {
    var empty = { agents: [], tools: [], servers: [] };
    if (!sessionId || typeof window.AppState === 'undefined') return empty;
    var s = window.AppState.getState().sessions[sessionId];
    if (!s) return empty;
    var agents  = new Set();
    var toolSet = new Set();
    var srvMap  = {};
    (s.backgroundTasks || []).forEach(function (t) { if (t.agentName) agents.add(t.agentName); });
    (s.responses || []).forEach(function (r) { if (r.agentName) agents.add(r.agentName); });
    (s.toolCalls || []).forEach(function (t) {
      if (!t.toolName) return;
      toolSet.add(t.toolName);
      SERVER_MAP.forEach(function (sm) {
        if (t.toolName.startsWith(sm.prefix)) srvMap[sm.name] = sm.icon;
      });
    });
    return {
      agents:  Array.from(agents),
      tools:   Array.from(toolSet),
      servers: Object.keys(srvMap).map(function (n) { return { name: n, icon: srvMap[n] }; })
    };
  }

  function renderResultDrawer() {
    if (!activeAccountResult) return '';
    var sid       = activeAccountResult.sessionId;
    var appSt     = window.AppState ? window.AppState.getState() : null;
    var sess      = appSt && sid ? appSt.sessions[sid] : null;
    var isIdle    = sess && sess.session && sess.session.isIdle;
    var responses = sess ? (sess.responses || []) : [];
    var content   = responses.slice(activeAccountResult.startResponseIdx)
                             .map(function (r) { return r.content || ''; })
                             .filter(Boolean).join('\n\n');
    var sources = extractSources(sid);
    var so = activeAccountResult.sourcesOpen;

    var bodyHtml;
    if (content) {
      var rendered = window.ContentFormatters
        ? window.ContentFormatters.formatMarkdownContent(content)
        : '<pre>' + safeEsc(content) + '</pre>';
      bodyHtml = '<div class="mcaps-result-content">' + rendered + '</div>';
    } else {
      bodyHtml = '<div class="mcaps-result-running">' +
        '<span class="mcaps-spinner" style="width:16px;height:16px;border-width:2px"></span>' +
        '<span>Running <strong>' + safeEsc(activeAccountResult.label) + '</strong>' +
        ' for <strong>' + safeEsc(activeAccountResult.customer) + '</strong>…</span></div>';
    }

    var agentTags = sources.agents.map(function (a) {
      return '<a class="mcaps-source-tag mcaps-source-tag--agent" href="#/skills">🤖 ' + safeEsc(a) + '</a>';
    }).join('') || '<span class="mcaps-source-tag mcaps-source-tag--tool">None yet</span>';

    var serverTags = sources.servers.map(function (s) {
      return '<a class="mcaps-source-tag mcaps-source-tag--server" href="#/mcp-servers">' + s.icon + ' ' + safeEsc(s.name) + '</a>';
    }).join('') || '<span class="mcaps-source-tag mcaps-source-tag--tool">None yet</span>';

    var toolTags = sources.tools.slice(0, 20).map(function (t) {
      return '<span class="mcaps-source-tag mcaps-source-tag--tool" title="' + safeEsc(t) + '">' + safeEsc(t) + '</span>';
    }).join('');
    if (sources.tools.length > 20) toolTags += '<span class="mcaps-source-tag mcaps-source-tag--tool">+' + (sources.tools.length - 20) + ' more</span>';
    if (!toolTags) toolTags = '<span class="mcaps-source-tag mcaps-source-tag--tool">None yet</span>';

    var statusIndicator = isIdle
      ? '<span class="mcaps-result-drawer__done-badge">✓ Done</span>'
      : '<span class="mcaps-result-drawer__running-badge"><span class="mcaps-spinner" style="width:10px;height:10px;border-width:2px"></span> Running</span>';

    var sourcesSummary = sources.agents.length + ' agents · ' +
      sources.tools.length + ' tools · ' + sources.servers.length + ' servers';

    return '<div class="mcaps-result-drawer mcaps-result-drawer--open" id="mcaps-result-drawer">' +
      '<div class="mcaps-result-drawer__header">' +
        '<div class="mcaps-result-drawer__meta">' +
          '<span class="mcaps-result-drawer__label">' + safeEsc(activeAccountResult.label) + '</span>' +
          '<span class="mcaps-result-drawer__customer">🏢 ' + safeEsc(activeAccountResult.customer) + '</span>' +
        '</div>' +
        '<div class="mcaps-result-drawer__controls">' +
          statusIndicator +
          '<a href="#/mission-control" class="mcaps-btn mcaps-btn--ghost" ' +
            'title="View full conversation" style="font-size:11px;padding:3px 8px;">⤢ Full</a>' +
          '<button class="mcaps-btn mcaps-btn--ghost mcaps-result-drawer__close" ' +
            'id="mcaps-result-close" title="Close" style="padding:3px 8px;">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="mcaps-result-drawer__body">' + bodyHtml + '</div>' +
      '<div class="mcaps-result-drawer__footer">' +
        '<button class="mcaps-result-sources__toggle" id="mcaps-sources-toggle">' +
          (so ? '▾' : '▸') + ' 🔍 Sources' +
          '<span class="mcaps-sources-summary">' + sourcesSummary + '</span>' +
        '</button>' +
        (so
          ? '<div class="mcaps-result-sources__panel">' +
              '<div class="mcaps-sources-row">' +
                '<span class="mcaps-sources-label">Agents</span>' +
                '<div class="mcaps-source-tags">' + agentTags + '</div>' +
              '</div>' +
              '<div class="mcaps-sources-row">' +
                '<span class="mcaps-sources-label">Servers</span>' +
                '<div class="mcaps-source-tags">' + serverTags + '</div>' +
              '</div>' +
              '<div class="mcaps-sources-row">' +
                '<span class="mcaps-sources-label">Tools</span>' +
                '<div class="mcaps-source-tags">' + toolTags + '</div>' +
              '</div>' +
            '</div>'
          : '') +
      '</div>' +
    '</div>';
  }

  function renderDrawer() {
    if (!drawerRoot) {
      drawerRoot = document.createElement('div');
      drawerRoot.id = 'mcaps-result-drawer-root';
      document.body.appendChild(drawerRoot);
    }
    drawerRoot.innerHTML = renderResultDrawer();
    bindDrawerEvents();
  }

  function bindDrawerEvents() {
    if (!drawerRoot) return;
    var closeBtn = drawerRoot.querySelector('#mcaps-result-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        activeAccountResult = null;
        renderDrawer();
      });
    }
    var toggleBtn = drawerRoot.querySelector('#mcaps-sources-toggle');
    if (toggleBtn && activeAccountResult) {
      toggleBtn.addEventListener('click', function () {
        activeAccountResult.sourcesOpen = !activeAccountResult.sourcesOpen;
        renderDrawer();
      });
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  function getConnectionStatus() {
    if (typeof window.AppState === 'undefined') return 'waiting';
    var state = window.AppState.getState();
    var sessions = state.sessions || {};
    var ids = Object.keys(sessions);
    if (!ids.length) return 'waiting';
    var hasActive = ids.some(function (id) {
      return sessions[id].metadata.status === 'active';
    });
    return hasActive ? 'connected' : 'idle';
  }

  function renderStatusBadge(status) {
    var map = {
      connected: { text: '● Connected', cls: 'mcaps-status--connected' },
      idle:      { text: '◌ Idle',      cls: 'mcaps-status--idle' },
      waiting:   { text: '○ Waiting',   cls: 'mcaps-status--waiting' }
    };
    var s = map[status] || map.waiting;
    return `<span class="mcaps-status-badge ${s.cls}">${s.text}</span>`;
  }

  function getInitials(name) {
    if (!name) return '?';
    var parts = name.replace(/\s*\([^)]*\)\s*$/, '').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }

  function renderRoleCard(role, cfg) {
    // If we have a CRM profile, show personalized card
    if (userProfile && userProfile.available) {
      var displayName = userProfile.fullname || 'User';
      var cleanName = displayName.replace(/\s*\([^)]*\)\s*$/, '').trim();
      var initials = getInitials(displayName);
      var titleText = userProfile.title || (cfg ? cfg.greeting : '');
      var roleBadge = userProfile.mspRole
        ? '<span class="mcaps-role-card__badge">' + userProfile.mspRole + '</span>'
        : '';
      var emailLine = userProfile.email
        ? '<div class="mcaps-role-card__email">' + userProfile.email + '</div>'
        : '';
      return `
        <div class="mcaps-role-card mcaps-role-card--profile">
          <div class="mcaps-role-card__avatar">${initials}</div>
          <div class="mcaps-role-card__body">
            <div class="mcaps-role-card__name">${cleanName}</div>
            <div class="mcaps-role-card__sub">${titleText}</div>
            ${roleBadge}
            ${emailLine}
          </div>
          <button class="mcaps-btn mcaps-btn--ghost mcaps-role-card__cta"
                  onclick="window.location.hash='#/settings'">Change</button>
        </div>`;
    }

    if (!cfg) {
      return `
        <div class="mcaps-role-card mcaps-role-card--unset">
          <span class="mcaps-role-card__icon">👤</span>
          <div class="mcaps-role-card__body">
            <div class="mcaps-role-card__name">Select your role</div>
            <div class="mcaps-role-card__sub">Configure in Settings to unlock role-specific actions</div>
          </div>
          <button class="mcaps-btn mcaps-btn--secondary mcaps-role-card__cta"
                  onclick="window.location.hash='#/settings'">Configure</button>
        </div>`;
    }
    return `
      <div class="mcaps-role-card mcaps-role-card--set">
        <span class="mcaps-role-card__icon">👤</span>
        <div class="mcaps-role-card__body">
          <div class="mcaps-role-card__name">${cfg.label}</div>
          <div class="mcaps-role-card__sub">${cfg.greeting}</div>
        </div>
        <button class="mcaps-btn mcaps-btn--ghost mcaps-role-card__cta"
                onclick="window.location.hash='#/settings'">Change</button>
      </div>`;
  }

  function renderActionsGrid(cfg) {
    var actions = cfg ? cfg.actions : [
      { icon: '🎯', label: 'My Opportunities', link: '#/opportunities' },
      { icon: '🌅', label: 'Morning Brief',    prompt: 'Give me my morning brief' },
      { icon: '📋', label: 'Milestone Review', prompt: 'Review my milestones' },
      { icon: '💡', label: 'What Next',        prompt: '/what-next' }
    ];
    var cards = actions.map(function (a) {
      if (a.link) {
        return `
          <a class="mcaps-action-card mcaps-action-card--link" href="${a.link}">
            <span class="mcaps-action-card__icon">${a.icon}</span>
            <span class="mcaps-action-card__label">${a.label}</span>
          </a>`;
      }
      var needsCustomer = a.needsCustomer ? 'true' : 'false';
      return `
        <button class="mcaps-action-card" data-prompt="${a.prompt.replace(/"/g, '&quot;')}"
                data-needs-customer="${needsCustomer}"
                data-label="${(a.label || '').replace(/"/g, '&quot;')}">
          <span class="mcaps-action-card__icon">${a.icon}</span>
          <span class="mcaps-action-card__label">${a.label}</span>
        </button>`;
    });
    return `<div class="mcaps-actions-grid">${cards.join('')}</div>`;
  }

  function renderStatsBar(sum) {
    if (!sum) {
      return '<div class="mcaps-stats-bar mcaps-stats-bar--loading">Loading capabilities…</div>';
    }
    return `
      <div class="mcaps-stats-bar">
        <div class="mcaps-stat">
          <span class="mcaps-stat__value">${sum.skillCount || 0}</span>
          <span class="mcaps-stat__label">Skills</span>
        </div>
        <span class="mcaps-stat__divider"></span>
        <div class="mcaps-stat">
          <span class="mcaps-stat__value">${sum.promptCount || 0}</span>
          <span class="mcaps-stat__label">Prompts</span>
        </div>
        <span class="mcaps-stat__divider"></span>
        <div class="mcaps-stat">
          <span class="mcaps-stat__value">${sum.agentCount || 0}</span>
          <span class="mcaps-stat__label">Agents</span>
        </div>
        <span class="mcaps-stat__divider"></span>
        <div class="mcaps-stat">
          <span class="mcaps-stat__value">${sum.roleCount || 0}</span>
          <span class="mcaps-stat__label">Roles</span>
        </div>
      </div>`;
  }

  // ── Vault / OIL Rendering ────────────────────────────────────

  function renderVaultStatus(health) {
    if (health === null) {
      return `
        <div class="mcaps-vault-status mcaps-vault-status--loading">
          <span class="mcaps-spinner"></span>
          <span>Connecting to vault…</span>
        </div>`;
    }
    if (health === false) {
      return `
        <div class="mcaps-vault-status mcaps-vault-status--offline">
          <span class="mcaps-vault-status__icon">○</span>
          <span class="mcaps-vault-status__text">Vault offline</span>
          <span class="mcaps-vault-status__hint">Start Obsidian + OIL to enable vault features</span>
        </div>`;
    }

    var report = health.report || health;
    var customerCount = report.totalCustomers || 0;
    var customers = report.customers || [];
    var staleCount = customers.filter(function (c) {
      return (c.staleInsights && c.staleInsights.length > 0) ||
             (c.opportunityCompleteness && c.opportunityCompleteness.missingGuid && c.opportunityCompleteness.missingGuid.length > 0);
    }).length;
    var healthClass = staleCount > 0 ? 'mcaps-vault-status--warn' : 'mcaps-vault-status--ok';

    return `
      <div class="mcaps-vault-status ${healthClass}">
        <div class="mcaps-vault-status__header">
          <span class="mcaps-vault-status__icon">${staleCount > 0 ? '⚠️' : '✓'}</span>
          <span class="mcaps-vault-status__text">Vault ${staleCount > 0 ? 'needs attention' : 'healthy'}</span>
        </div>
        <div class="mcaps-vault-counters">
          <div class="mcaps-vault-counter">
            <span class="mcaps-vault-counter__value">${customerCount}</span>
            <span class="mcaps-vault-counter__label">Customers</span>
          </div>
          ${staleCount > 0 ? `
          <div class="mcaps-vault-counter mcaps-vault-counter--warn">
            <span class="mcaps-vault-counter__value">${staleCount}</span>
            <span class="mcaps-vault-counter__label">Need Sync</span>
          </div>` : ''}
        </div>
      </div>`;
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    var now = Date.now();
    var then = new Date(dateStr).getTime();
    if (isNaN(then)) return '';
    var diff = Math.floor((now - then) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return new Date(dateStr).toLocaleDateString();
  }

  function noteTypeIcon(note) {
    var type = note.type || '';
    if (type === 'customer') return '🏢';
    if (type === 'people') return '👤';
    if (type === 'project') return '📐';
    if (type === 'meeting') return '📅';
    if (type === 'weekly') return '📆';

    var path = (note.path || '').toLowerCase();
    if (path.includes('customer')) return '🏢';
    if (path.includes('people')) return '👤';
    if (path.includes('project')) return '📐';
    if (path.includes('meeting')) return '📅';
    if (path.includes('weekly')) return '📆';
    return '📝';
  }

  var FILTER_OPTIONS = [
    { key: 'all',      label: 'All',       icon: '📋' },
    { key: 'customer', label: 'Customers', icon: '🏢' },
    { key: 'project',  label: 'Projects',  icon: '📐' },
    { key: 'people',   label: 'People',    icon: '👤' },
    { key: 'meeting',  label: 'Meetings',  icon: '📅' },
    { key: 'weekly',   label: 'Weekly',    icon: '📆' }
  ];

  function renderFilterBar(counts) {
    var pills = FILTER_OPTIONS.map(function (f) {
      var count = f.key === 'all' ? '' : (counts && counts[f.key] ? counts[f.key] : 0);
      var activeClass = activeFilter === f.key ? ' mcaps-filter-pill--active' : '';
      // Hide filters with 0 results (except "all")
      if (f.key !== 'all' && count === 0) return '';
      var badge = count !== '' ? ' <span class="mcaps-filter-pill__count">' + count + '</span>' : '';
      return '<button class="mcaps-filter-pill' + activeClass + '" data-filter="' + f.key + '">' +
        '<span class="mcaps-filter-pill__icon">' + f.icon + '</span>' +
        f.label + badge + '</button>';
    }).filter(Boolean);
    return '<div class="mcaps-filter-bar">' + pills.join('') + '</div>';
  }

  function renderRecentNotes(notes) {
    if (notes === null) {
      return '<div class="mcaps-vault-notes mcaps-vault-notes--loading"><span class="mcaps-spinner"></span> Loading recent activity…</div>';
    }
    if (notes === false || !Array.isArray(notes) || notes.length === 0) {
      return '<div class="mcaps-vault-notes mcaps-vault-notes--empty">No recent notes found</div>';
    }

    var items = notes.slice(0, 12).map(function (note) {
      var title = note.title || note.name || (note.path || '').split('/').pop().replace(/\.md$/, '');
      var modified = note.modified || '';
      var icon = noteTypeIcon(note);
      var ago = timeAgo(modified);

      // Build context chips based on note type
      var chips = [];
      if (note.type === 'customer') {
        if (note.opportunityCount) chips.push(note.opportunityCount + ' opp' + (note.opportunityCount > 1 ? 's' : ''));
        if (note.milestoneCount) chips.push(note.milestoneCount + ' ms');
        if (note.hasTeam) chips.push('team ✓');
      } else if (note.type === 'project') {
        if (note.headings) chips.push(note.headings + ' sections');
      } else if (note.type === 'people') {
        var tags = note.tags || [];
        if (tags.length) chips.push(tags.slice(0, 2).join(', '));
      } else if (note.type === 'meeting' || note.type === 'weekly') {
        if (note.wordCount) chips.push(note.wordCount + ' words');
      }
      var detail = chips.length
        ? '<span class="mcaps-note-item__chips">' + chips.join(' · ') + '</span>'
        : '';

      var typeBadge = '<span class="mcaps-note-item__type mcaps-note-type--' + (note.type || 'other') + '">' +
        (note.type || 'note') + '</span>';

      return `
        <div class="mcaps-note-item" data-vault-path="${(note.path || '').replace(/"/g, '&quot;')}"
             title="Open in Obsidian: ${(note.path || '').replace(/"/g, '&quot;')}">
          <span class="mcaps-note-item__icon">${icon}</span>
          <div class="mcaps-note-item__body">
            <div class="mcaps-note-item__row">
              <span class="mcaps-note-item__title">${title}</span>
              ${typeBadge}
            </div>
            ${detail}
          </div>
          ${ago ? '<span class="mcaps-note-item__time">' + ago + '</span>' : ''}
        </div>`;
    });

    return '<div class="mcaps-vault-notes">' + items.join('') + '</div>';
  }

  function renderAgentLog(log) {
    if (log === null || log === false) return '';
    var entries = Array.isArray(log) ? log : (log.entries || log.items || []);
    if (!entries.length) return '';

    var recent = entries.slice(-6).reverse();
    var items = recent.map(function (entry) {
      var text = entry.summary || entry.text || entry.content || '';
      var ts = entry.timestamp || entry.date || '';
      var ago = timeAgo(ts);
      if (text.length > 120) text = text.slice(0, 120) + '…';

      return `
        <div class="mcaps-log-item">
          <span class="mcaps-log-item__dot"></span>
          <div class="mcaps-log-item__body">
            <span class="mcaps-log-item__text">${text}</span>
            ${ago ? '<span class="mcaps-log-item__time">' + ago + '</span>' : ''}
          </div>
        </div>`;
    });

    return `
      <section class="mcaps-section">
        <h2 class="mcaps-section__title">Recent Agent Activity</h2>
        <div class="mcaps-agent-log">${items.join('')}</div>
      </section>`;
  }

  // ── Vault Prompt Cards ─────────────────────────────────────

  function renderPromptCard(p, idx, group) {
    var isActive = activeConfigPrompt === group + '-' + idx;
    return `
      <div class="mcaps-prompt-card ${isActive ? 'mcaps-prompt-card--active' : ''}" data-prompt-group="${group}" data-prompt-idx="${idx}">
        <div class="mcaps-prompt-card__main">
          <span class="mcaps-prompt-card__icon">${p.icon}</span>
          <div class="mcaps-prompt-card__text">
            <span class="mcaps-prompt-card__label">${p.label}</span>
            <span class="mcaps-prompt-card__desc">${p.description}</span>
          </div>
          <button class="mcaps-prompt-card__config-btn" data-prompt-group="${group}" data-prompt-idx="${idx}"
                  title="Configure before running">⚙️</button>
          <button class="mcaps-prompt-card__run-btn" data-prompt-group="${group}" data-prompt-idx="${idx}"
                  title="Run with defaults">▶</button>
        </div>
        ${isActive ? renderPromptConfig(p, idx, group) : ''}
      </div>`;
  }

  function renderPromptConfig(p, idx, group) {
    var defs = p.defaults || {};
    var modelOptions = '<option value="" ' + (!defs.model ? 'selected' : '') + '>Default</option>';
    availableModels.forEach(function (m) {
      var sel = defs.model === m.id ? 'selected' : '';
      var label = m.name || m.id;
      modelOptions += '<option value="' + m.id + '" ' + sel + '>' + label + '</option>';
    });
    return `
      <div class="mcaps-prompt-config" data-prompt-group="${group}" data-prompt-idx="${idx}">
        <div class="mcaps-prompt-config__row">
          <label class="mcaps-prompt-config__label">
            <input type="checkbox" class="mcaps-prompt-config__check" data-cfg="allowAllTools"
                   ${defs.allowAllTools ? 'checked' : ''} />
            Allow all tools
          </label>
          <span class="mcaps-prompt-config__hint">Grants access to CRM write, M365, vault, PBI tools</span>
        </div>
        <div class="mcaps-prompt-config__row">
          <label class="mcaps-prompt-config__label mcaps-prompt-config__label--inline">
            Model
            <select class="mcaps-prompt-config__select" data-cfg="model">
              ${modelOptions}
            </select>
          </label>
        </div>
        <div class="mcaps-prompt-config__actions">
          <button class="mcaps-btn mcaps-btn--secondary mcaps-prompt-config__cancel"
                  data-prompt-group="${group}" data-prompt-idx="${idx}">Cancel</button>
          <button class="mcaps-btn mcaps-btn--primary mcaps-prompt-config__go"
                  data-prompt-group="${group}" data-prompt-idx="${idx}">Run</button>
        </div>
      </div>`;
  }

  function renderPromptGrid(prompts, group, title, subtitle) {
    var isCollapsed = !!collapsedSections[group];
    var cards = prompts.map(function (p, i) {
      return renderPromptCard(p, i, group);
    });
    var chevron = isCollapsed ? '▸' : '▾';
    return `
      <div class="mcaps-prompt-group ${isCollapsed ? 'mcaps-prompt-group--collapsed' : ''}">
        <button class="mcaps-prompt-group__toggle" data-toggle-group="${group}">
          <span class="mcaps-prompt-group__chevron">${chevron}</span>
          <h3 class="mcaps-prompt-group__title">${title}</h3>
          ${subtitle ? '<span class="mcaps-prompt-group__subtitle">' + subtitle + '</span>' : ''}
          <span class="mcaps-prompt-group__count">${prompts.length}</span>
        </button>
        <div class="mcaps-prompt-grid" ${isCollapsed ? 'style="display:none"' : ''}>${cards.join('')}</div>
      </div>`;
  }

  function buildPromptMessage(p, configEl) {
    var msg = p.prompt;
    var flags = [];
    if (configEl) {
      var atCheck = configEl.querySelector('[data-cfg="allowAllTools"]');
      if (atCheck && atCheck.checked) flags.push('--allow-all-tools');
      var modelSel = configEl.querySelector('[data-cfg="model"]');
      if (modelSel && modelSel.value) flags.push('--model ' + modelSel.value);
    } else if (p.defaults) {
      if (p.defaults.allowAllTools) flags.push('--allow-all-tools');
      if (p.defaults.model) flags.push('--model ' + p.defaults.model);
    }
    if (flags.length) msg = msg + ' ' + flags.join(' ');
    return msg;
  }

  function getPromptFromGroup(group, idx) {
    var list = group === 'vault' ? VAULT_PROMPTS : group === 'swiss-knife' ? SWISS_KNIFE_PROMPTS : DAILY_PROMPTS;
    return list[parseInt(idx, 10)] || null;
  }

  function buildDefaultFlags(p) {
    var flags = [];
    if (p && p.defaults) {
      if (p.defaults.allowAllTools) flags.push('--allow-all-tools');
      if (p.defaults.model) flags.push('--model ' + p.defaults.model);
    }
    return flags;
  }

  function buildFlagsFromConfigEl(configEl) {
    var flags = [];
    if (!configEl) return flags;
    var atCheck = configEl.querySelector('[data-cfg="allowAllTools"]');
    if (atCheck && atCheck.checked) flags.push('--allow-all-tools');
    var modelSel = configEl.querySelector('[data-cfg="model"]');
    if (modelSel && modelSel.value) flags.push('--model ' + modelSel.value);
    return flags;
  }

  function openCustomerDialog(promptText, flags, label) {
    pendingCustomer = { promptText: promptText, flags: flags, label: label || '', draft: '' };
    render();
    // Focus is handled in the bind phase after innerHTML is set
  }

  function closeCustomerDialog() {
    pendingCustomer = null;
    render();
  }

  function dispatchCustomerPrompt() {
    if (!pendingCustomer) return;
    var name = pendingCustomer.draft.trim();
    if (!name) return;
    var label = pendingCustomer.label;
    var msg = pendingCustomer.promptText.replace(/\{\{customer\}\}/g, name);
    if (pendingCustomer.flags.length) msg = msg + ' ' + pendingCustomer.flags.join(' ');

    // Capture current response count so the drawer shows only THIS invocation's responses
    var appSt    = window.AppState ? window.AppState.getState() : null;
    var sessions = appSt ? appSt.sessions : {};
    var nonEnded = Object.keys(sessions).filter(function (id) {
      return sessions[id].metadata.status !== 'ended';
    });
    var targetId  = appSt ? (appSt.activeSessionId || nonEnded[0]) : null;
    var startIdx  = targetId && sessions[targetId] ? (sessions[targetId].responses || []).length : 0;

    pendingCustomer = null;

    var sessionId = null;
    if (typeof window.dispatchCopilotAction === 'function') {
      sessionId = window.dispatchCopilotAction(msg, { suppressNav: true }) || targetId;
    }

    activeAccountResult = {
      customer: name,
      label: label,
      sessionId: sessionId || targetId,
      startResponseIdx: startIdx,
      sourcesOpen: false
    };

    renderDrawer();
    render(); // close the customer dialog
  }

  function renderCustomerDialog() {
    var draft = pendingCustomer ? pendingCustomer.draft : '';
    var label = pendingCustomer ? pendingCustomer.label : '';
    var canRun = draft.trim().length > 0;
    var title = label ? label + ' — which customer?' : 'Which customer?';
    return `
      <div class="mcaps-customer-overlay" id="mcaps-customer-overlay">
        <div class="mcaps-customer-dialog">
          <h4 class="mcaps-customer-dialog__title">${safeEsc(title)}</h4>
          <input id="mcaps-customer-input" class="mcaps-customer-dialog__input"
                 type="text" placeholder="e.g. Contoso" autocomplete="off"
                 value="${draft.replace(/"/g, '&quot;')}" />
          <div class="mcaps-customer-dialog__actions">
            <button class="mcaps-btn mcaps-btn--ghost" id="mcaps-customer-cancel">Cancel</button>
            <button class="mcaps-btn mcaps-btn--primary" id="mcaps-customer-run"
                    ${canRun ? '' : 'disabled'}>Run</button>
          </div>
        </div>
      </div>`;
  }



  function render() {
    if (!container) return;
    var role = settings && settings.role ? settings.role : null;
    var cfg = role ? ROLE_CONFIGS[role] : null;
    var status = getConnectionStatus();

    container.innerHTML = `
      <div class="mcaps-home">
        <div class="mcaps-hero">
          <div class="mcaps-hero__content">
            <h1 class="mcaps-hero__title">Welcome to MCAPS IQ</h1>
            <p class="mcaps-hero__subtitle">Your AI-powered account team assistant</p>
          </div>
          <div class="mcaps-hero__meta">
            ${renderStatusBadge(status)}
          </div>
        </div>

        <div class="mcaps-experimental-banner">
          <div class="mcaps-experimental-banner__icon">🧪</div>
          <div class="mcaps-experimental-banner__body">
            <strong>Experimental</strong>
            <p>This dashboard is a highly experimental surface exploring how GitHub Copilot Extensions
            can enhance the user experience. It leverages MCP connections as raw API calls to provide
            a context-driven, personalizable visualization of your CRM, M365, and vault data — all
            rendered outside the chat window. Expect rough edges; your feedback shapes what this becomes.</p>
          </div>
        </div>

        <div class="mcaps-home__body">
          <section class="mcaps-section">
            <h2 class="mcaps-section__title">Your Role</h2>
            ${renderRoleCard(role, cfg)}
          </section>

          <section class="mcaps-section">
            <h2 class="mcaps-section__title">Quick Actions</h2>
            ${renderActionsGrid(cfg)}
          </section>

          <section class="mcaps-section mcaps-section--swiss-knife">
            <div class="mcaps-section__header">
              <h2 class="mcaps-section__title">🔪 CSA Swiss Knife</h2>
              <span class="mcaps-section__subtitle">One entry point — five specialist agents</span>
            </div>
            ${renderPromptGrid(SWISS_KNIFE_PROMPTS, 'swiss-knife', 'Specialist Agents', 'Account Brief · Delivery Plan · Hygiene · Burn · Factory')}
          </section>

          <section class="mcaps-section">
            <div class="mcaps-section__header">
              <h2 class="mcaps-section__title">Knowledge Vault</h2>
            </div>
            ${renderVaultStatus(vaultHealth)}
            ${renderPromptGrid(VAULT_PROMPTS, 'vault', 'Vault Hygiene', 'Sync and clean your vault data')}
            ${renderPromptGrid(DAILY_PROMPTS, 'daily', 'Daily Commands', 'Routines and workflows')}
          </section>

          <section class="mcaps-section">
            <h2 class="mcaps-section__title">Recent Activity</h2>
            ${renderFilterBar(vaultCounts)}
            ${renderRecentNotes(vaultNotes)}
          </section>

          ${renderAgentLog(agentLog)}
        </div>

        ${renderStatsBar(summary)}
      </div>
      ${pendingCustomer ? renderCustomerDialog() : ''}`;

    container.querySelectorAll('.mcaps-action-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var prompt = card.dataset.prompt;
        if (!prompt) return;
        if (card.dataset.needsCustomer === 'true') {
          openCustomerDialog(prompt, [], card.dataset.label || '');
          return;
        }
        if (typeof window.dispatchCopilotAction === 'function') {
          window.dispatchCopilotAction(prompt);
        } else {
          window.location.hash = '#/mission-control';
        }
      });
    });

    // Wire customer name dialog
    var customerInput = container.querySelector('#mcaps-customer-input');
    if (customerInput) {
      customerInput.focus();
      customerInput.setSelectionRange(customerInput.value.length, customerInput.value.length);
      customerInput.addEventListener('input', function () {
        pendingCustomer.draft = customerInput.value;
        var runBtn = container.querySelector('#mcaps-customer-run');
        if (runBtn) runBtn.disabled = !customerInput.value.trim();
      });
      customerInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && customerInput.value.trim()) dispatchCustomerPrompt();
        if (e.key === 'Escape') closeCustomerDialog();
      });
    }
    var cancelBtn = container.querySelector('#mcaps-customer-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeCustomerDialog);
    var runBtn = container.querySelector('#mcaps-customer-run');
    if (runBtn) runBtn.addEventListener('click', function () {
      if (pendingCustomer && pendingCustomer.draft.trim()) dispatchCustomerPrompt();
    });
    var overlay = container.querySelector('#mcaps-customer-overlay');
    if (overlay) overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeCustomerDialog();
    });

    // Wire vault note click → open in Obsidian
    container.querySelectorAll('.mcaps-note-item[data-vault-path]').forEach(function (item) {
      item.style.cursor = 'pointer';
      item.addEventListener('click', function () {
        var notePath = item.dataset.vaultPath;
        if (!notePath || !vaultName) return;
        var obsidianUrl = 'obsidian://open?vault=' + encodeURIComponent(vaultName) +
          '&file=' + encodeURIComponent(notePath.replace(/\.md$/, ''));
        fetch('/api/open-external', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: obsidianUrl })
        }).catch(function () {});
      });
    });

    // Wire filter pill clicks
    container.querySelectorAll('.mcaps-filter-pill[data-filter]').forEach(function (pill) {
      pill.addEventListener('click', function () {
        var newFilter = pill.dataset.filter;
        if (newFilter === activeFilter) return;
        activeFilter = newFilter;
        vaultNotes = null; // show loading state
        render();
        fetchVaultNotes();
      });
    });

    // Wire prompt card — run button (runs with defaults)
    container.querySelectorAll('.mcaps-prompt-card__run-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var p = getPromptFromGroup(btn.dataset.promptGroup, btn.dataset.promptIdx);
        if (!p) return;
        if (p.customerPrompt) {
          openCustomerDialog(p.prompt, buildDefaultFlags(p), p.label || '');
          return;
        }
        var msg = buildPromptMessage(p, null);
        if (typeof window.dispatchCopilotAction === 'function') {
          window.dispatchCopilotAction(msg);
        }
      });
    });

    // Wire prompt card — config button (toggles config panel)
    container.querySelectorAll('.mcaps-prompt-card__config-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var key = btn.dataset.promptGroup + '-' + btn.dataset.promptIdx;
        activeConfigPrompt = activeConfigPrompt === key ? null : key;
        render();
      });
    });

    // Wire prompt config — cancel
    container.querySelectorAll('.mcaps-prompt-config__cancel').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        activeConfigPrompt = null;
        render();
      });
    });

    // Wire prompt config — go (run with configured options)
    container.querySelectorAll('.mcaps-prompt-config__go').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var p = getPromptFromGroup(btn.dataset.promptGroup, btn.dataset.promptIdx);
        if (!p) return;
        var configEl = btn.closest('.mcaps-prompt-config');
        if (p.customerPrompt) {
          var flags = buildFlagsFromConfigEl(configEl);
          activeConfigPrompt = null;
          openCustomerDialog(p.prompt, flags, p.label || '');
          return;
        }
        var msg = buildPromptMessage(p, configEl);
        activeConfigPrompt = null;
        if (typeof window.dispatchCopilotAction === 'function') {
          window.dispatchCopilotAction(msg);
        }
      });
    });

    // Wire prompt group collapse toggles
    container.querySelectorAll('.mcaps-prompt-group__toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var group = btn.dataset.toggleGroup;
        collapsedSections[group] = !collapsedSections[group];
        render();
      });
    });
  }

  // ── Data loading ─────────────────────────────────────────────

  function loadData() {
    return Promise.all([
      fetch('/api/capabilities/summary').then(function (r) { return r.ok ? r.json() : null; }),
      fetch('/api/settings').then(function (r) { return r.ok ? r.json() : null; }),
      fetch('/api/crm/profile').then(function (r) { return r.ok ? r.json() : null; }),
      fetch('/api/models').then(function (r) { return r.ok ? r.json() : null; })
    ]).then(function (results) {
      summary = results[0];
      settings = results[1];
      userProfile = results[2];
      if (results[3] && Array.isArray(results[3].models)) {
        availableModels = results[3].models;
      }
    }).catch(function () {
      // render with whatever we have
    }).then(render).then(loadVaultData);
  }

  function fetchVaultNotes() {
    fetch('/api/vault/recent-activity?type=' + encodeURIComponent(activeFilter))
      .then(function (r) { return r.ok ? r.json() : false; })
      .then(function (data) {
        vaultNotes = data && data.notes ? data.notes : false;
        if (data && data.counts) vaultCounts = data.counts;
        render();
      })
      .catch(function () { vaultNotes = false; render(); });
  }

  function loadVaultData() {
    // Fetch vault name for Obsidian URI construction
    if (!vaultName) {
      fetch('/api/vault/name')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) { if (data && data.name) vaultName = data.name; })
        .catch(function () {});
    }

    // Fire vault requests in parallel — non-blocking, renders progressively
    fetch('/api/vault/health')
      .then(function (r) { return r.ok ? r.json() : false; })
      .then(function (data) { vaultHealth = data; render(); })
      .catch(function () { vaultHealth = false; render(); });

    fetchVaultNotes();

    fetch('/api/vault/agent-log')
      .then(function (r) { return r.ok ? r.json() : false; })
      .then(function (data) { agentLog = data; render(); })
      .catch(function () { agentLog = false; render(); });
  }

  // ── Lifecycle ────────────────────────────────────────────────

  function mount(el) {
    container = el;
    container.innerHTML = '<div class="mcaps-home mcaps-loading-state"><span class="mcaps-spinner"></span>Loading…</div>';
    loadData();

    if (typeof window.AppState !== 'undefined' && typeof window.AppState.subscribe === 'function') {
      unsubscribe = window.AppState.subscribe(function () {
        if (container) render();
      });
      // Persistent drawer subscription — stays active across view changes
      if (!drawerStateSubscription) {
        drawerStateSubscription = window.AppState.subscribe(function () {
          if (activeAccountResult) renderDrawer();
        });
      }
    }
  }

  function unmount() {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
      unsubscribe = null;
    }
    container = null;
  }

  function onActivate() {
    // Re-fetch settings in case role was changed via settings view
    if (container) {
      fetch('/api/settings')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (s) { if (s) { settings = s; render(); } })
        .catch(function () {});
      // Refresh vault data (may have changed)
      loadVaultData();
    }
  }

  window.homeView = { mount: mount, unmount: unmount, onActivate: onActivate };
})();
