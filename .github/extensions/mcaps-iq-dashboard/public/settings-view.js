/* ============================================================
 *  Settings View — Role, accounts, and display preferences
 * ============================================================ */
(function () {
  'use strict';

  var ROLES = [
    { value: 'ae',         label: 'Account Executive (AE)' },
    { value: 'specialist', label: 'Specialist' },
    { value: 'se',         label: 'Solution Engineer (SE)' },
    { value: 'csa',        label: 'Cloud Solution Architect (CSA)' },
    { value: 'csam',       label: 'Customer Success AM (CSAM)' },
    { value: 'ats',        label: 'Account Technology Strategist (ATS)' },
    { value: 'ia',         label: 'Industry Advisor (IA)' },
    { value: 'sd',         label: 'Sales Director (SD)' }
  ];

  var container = null;
  var currentSettings = null;
  var saveStatus = null; // 'saving' | 'saved' | 'error' | null
  var detectedRole = null; // from CRM whoami
  var whoamiData = null;   // raw whoami response

  // ── HTML escaping ─────────────────────────────────────────────

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Render helpers ────────────────────────────────────────────

  function renderDetectedRoleBanner(selectedRole) {
    if (!detectedRole || detectedRole === selectedRole) return '';
    var match = ROLES.find(function (r) { return r.value === detectedRole; });
    if (!match) return '';
    var userName = whoamiData && whoamiData.fullName ? whoamiData.fullName : 'You';
    return `
      <div class="mcaps-role-detected">
        <span class="mcaps-role-detected__icon">🔍</span>
        <div class="mcaps-role-detected__text">
          CRM identifies <strong>${escapeHtml(userName)}</strong> as <strong>${escapeHtml(match.label)}</strong>
        </div>
        <button class="mcaps-role-detected__apply" id="mcaps-apply-detected-role">Apply</button>
      </div>`;
  }

  function renderRoleRadios(selectedRole) {
    return ROLES.map(function (r) {
      var checked = r.value === selectedRole ? 'checked' : '';
      return `
        <label class="mcaps-radio-label">
          <input type="radio" name="role" value="${r.value}" ${checked}
                 class="mcaps-radio-input" />
          <span class="mcaps-radio-custom"></span>
          <span class="mcaps-radio-text">${r.label}</span>
        </label>`;
    }).join('');
  }

  function renderPriorityAccounts(accounts) {
    if (!accounts || !accounts.length) {
      return '<p class="mcaps-accounts-empty">No priority accounts added yet.</p>';
    }
    return `
      <ul class="mcaps-accounts-list">
        ${accounts.map(function (a, i) {
          var name = typeof a === 'string' ? a : (a.name || '');
          var tpid = typeof a === 'object' && a.tpid ? `<span class="mcaps-account-tpid">${escapeHtml(a.tpid)}</span>` : '';
          return `
            <li class="mcaps-account-item" data-index="${i}">
              <span class="mcaps-account-name">${escapeHtml(name)}</span>
              ${tpid}
              <button class="mcaps-btn mcaps-btn--icon mcaps-account-remove"
                      data-index="${i}" title="Remove">✕</button>
            </li>`;
        }).join('')}
      </ul>`;
  }

  function renderConnectionStatus() {
    return `
      <div class="mcaps-conn-status" id="mcaps-conn-status">
        <span class="mcaps-conn-status__label">Server</span>
        <span class="mcaps-conn-status__value" id="mcaps-conn-value">Checking…</span>
      </div>`;
  }

  function renderSaveStatus() {
    if (!saveStatus) return '';
    var map = {
      saving: '<span class="mcaps-save-status mcaps-save-status--saving">Saving…</span>',
      saved:  '<span class="mcaps-save-status mcaps-save-status--saved">✓ Saved</span>',
      error:  '<span class="mcaps-save-status mcaps-save-status--error">✕ Save failed</span>'
    };
    return map[saveStatus] || '';
  }

  function render() {
    if (!container) return;
    var s = currentSettings || {};
    var role = s.role || null;
    var accounts = s.priorityAccounts || [];
    var prefs = s.displayPrefs || {};

    container.innerHTML = `
      <div class="mcaps-settings">
        <div class="mcaps-settings__header">
          <h1 class="mcaps-settings__title">Settings</h1>
        </div>

        <div class="mcaps-settings__body">

          <!-- Role -->
          <section class="mcaps-settings-section">
            <h2 class="mcaps-settings-section__title">Your Role</h2>
            <p class="mcaps-settings-section__desc">
              Determines which Quick Actions and workflow defaults you see on the Home page.
            </p>
            ${renderDetectedRoleBanner(role)}
            <div class="mcaps-role-radios">
              ${renderRoleRadios(role)}
            </div>
          </section>

          <!-- Priority Accounts -->
          <section class="mcaps-settings-section">
            <h2 class="mcaps-settings-section__title">Priority Accounts</h2>
            <p class="mcaps-settings-section__desc">
              Accounts surfaced first in pipeline reviews and morning briefs.
            </p>
            <div class="mcaps-accounts-panel" id="mcaps-accounts-panel">
              ${renderPriorityAccounts(accounts)}
            </div>
            <div class="mcaps-account-add">
              <input type="text"  class="mcaps-input" id="mcaps-account-name"
                     placeholder="Account name" />
              <input type="text"  class="mcaps-input mcaps-input--short" id="mcaps-account-tpid"
                     placeholder="TPID (optional)" />
              <button class="mcaps-btn mcaps-btn--secondary" id="mcaps-account-add-btn">Add</button>
            </div>
          </section>

          <!-- Display Preferences -->
          <section class="mcaps-settings-section">
            <h2 class="mcaps-settings-section__title">Display Preferences</h2>

            <div class="mcaps-pref-row">
              <label class="mcaps-toggle-label" for="mcaps-show-code">
                <span class="mcaps-pref-name">Show code blocks</span>
                <span class="mcaps-pref-desc">Render raw code in responses (may be verbose)</span>
              </label>
              <label class="mcaps-toggle">
                <input type="checkbox" id="mcaps-show-code" class="mcaps-toggle__input"
                       ${prefs.showCode ? 'checked' : ''} />
                <span class="mcaps-toggle__track"></span>
              </label>
            </div>

            <div class="mcaps-pref-row">
              <label class="mcaps-pref-name" for="mcaps-verbosity">Verbosity</label>
              <select id="mcaps-verbosity" class="mcaps-select">
                <option value="minimal"  ${prefs.verbosity === 'minimal'  ? 'selected' : ''}>Minimal</option>
                <option value="normal"   ${prefs.verbosity === 'normal' || !prefs.verbosity ? 'selected' : ''}>Normal</option>
                <option value="detailed" ${prefs.verbosity === 'detailed' ? 'selected' : ''}>Detailed</option>
              </select>
            </div>
          </section>

          <!-- Connection -->
          <section class="mcaps-settings-section">
            <h2 class="mcaps-settings-section__title">Connection</h2>
            ${renderConnectionStatus()}
          </section>

        </div>

        <div class="mcaps-settings__footer">
          ${renderSaveStatus()}
          <button class="mcaps-btn mcaps-btn--primary mcaps-settings-save" id="mcaps-save-btn">
            Save Settings
          </button>
        </div>
      </div>`;

    attachHandlers(accounts);
    checkServerHealth();
  }

  // ── Event handlers ────────────────────────────────────────────

  function attachHandlers(accounts) {
    if (!container) return;
    var accountsCopy = accounts.slice();

    // Apply detected role from CRM whoami
    var applyBtn = document.getElementById('mcaps-apply-detected-role');
    if (applyBtn && detectedRole) {
      applyBtn.addEventListener('click', function () {
        var radio = container.querySelector('input[name="role"][value="' + detectedRole + '"]');
        if (radio) {
          radio.checked = true;
          // Re-render to hide the banner
          if (currentSettings) currentSettings.role = detectedRole;
          render();
        }
      });
    }

    // Remove account buttons
    container.querySelectorAll('.mcaps-account-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.index, 10);
        if (!isNaN(idx)) {
          accountsCopy.splice(idx, 1);
          refreshAccountsPanel(accountsCopy);
        }
      });
    });

    // Add account
    var addBtn = document.getElementById('mcaps-account-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var nameEl = document.getElementById('mcaps-account-name');
        var tpidEl = document.getElementById('mcaps-account-tpid');
        var name = nameEl ? nameEl.value.trim() : '';
        var tpid = tpidEl ? tpidEl.value.trim() : '';
        if (!name) return;
        var entry = tpid ? { name: name, tpid: tpid } : name;
        accountsCopy.push(entry);
        if (nameEl) nameEl.value = '';
        if (tpidEl) tpidEl.value = '';
        refreshAccountsPanel(accountsCopy);
      });
    }

    // Allow Enter in account name field to trigger add
    var nameInput = document.getElementById('mcaps-account-name');
    if (nameInput) {
      nameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); if (addBtn) addBtn.click(); }
      });
    }

    // Save button
    var saveBtn = document.getElementById('mcaps-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        saveSettings(accountsCopy);
      });
    }
  }

  function refreshAccountsPanel(accounts) {
    var panel = document.getElementById('mcaps-accounts-panel');
    if (!panel) return;
    panel.innerHTML = renderPriorityAccounts(accounts);
    // Re-attach remove buttons on the refreshed panel
    panel.querySelectorAll('.mcaps-account-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.index, 10);
        if (!isNaN(idx)) {
          accounts.splice(idx, 1);
          refreshAccountsPanel(accounts);
        }
      });
    });
  }

  // ── Save settings ────────────────────────────────────────────

  function saveSettings(accountsCopy) {
    var role = null;
    var roleInput = container && container.querySelector('input[name="role"]:checked');
    if (roleInput) role = roleInput.value;

    var showCode = !!(container && container.querySelector('#mcaps-show-code') &&
                      container.querySelector('#mcaps-show-code').checked);
    var verbosityEl = container && container.querySelector('#mcaps-verbosity');
    var verbosity = verbosityEl ? verbosityEl.value : 'normal';

    var payload = {
      role: role,
      priorityAccounts: accountsCopy,
      displayPrefs: { showCode: showCode, verbosity: verbosity }
    };

    saveStatus = 'saving';
    updateSaveStatusEl();

    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (saved) {
        currentSettings = saved;
        saveStatus = 'saved';
        updateSaveStatusEl();
        // Notify filter changes via AppConnection WebSocket
        if (typeof window.AppConnection !== 'undefined' && typeof window.AppConnection.send === 'function') {
          window.AppConnection.send({
            type: 'filter:update',
            data: { showCode: showCode, verbosity: verbosity }
          });
        }
        setTimeout(function () { saveStatus = null; updateSaveStatusEl(); }, 2500);
      })
      .catch(function () {
        saveStatus = 'error';
        updateSaveStatusEl();
        setTimeout(function () { saveStatus = null; updateSaveStatusEl(); }, 3000);
      });
  }

  function updateSaveStatusEl() {
    if (!container) return;
    var footer = container.querySelector('.mcaps-settings__footer');
    if (!footer) return;
    var existing = footer.querySelector('.mcaps-save-status');
    var html = renderSaveStatus();
    if (existing) {
      existing.outerHTML = html;
    } else if (html) {
      footer.insertAdjacentHTML('afterbegin', html);
    }
  }

  // ── Server health check ───────────────────────────────────────

  function checkServerHealth() {
    var valEl = document.getElementById('mcaps-conn-value');
    if (!valEl) return;
    fetch('/api/health')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (data) {
        valEl.textContent = `✓ Online · ${data.sessions || 0} session(s) · uptime ${Math.floor(data.uptime || 0)}s`;
        valEl.className = 'mcaps-conn-status__value mcaps-conn-status__value--ok';
      })
      .catch(function () {
        valEl.textContent = '✕ Unreachable';
        valEl.className = 'mcaps-conn-status__value mcaps-conn-status__value--err';
      });
  }

  // ── CRM role detection ────────────────────────────────────────

  var ROLE_TITLE_MAP = {
    'account executive': 'ae',
    'specialist': 'specialist',
    'solution engineer': 'se',
    'cloud solution architect': 'csa',
    'customer success': 'csam',
    'account technology strategist': 'ats',
    'industry advisor': 'ia',
    'sales director': 'sd'
  };

  function inferRoleFromWhoami(data) {
    if (!data) return null;
    var title = (data.title || data.jobTitle || data.role || '').toLowerCase();
    for (var key in ROLE_TITLE_MAP) {
      if (title.indexOf(key) !== -1) return ROLE_TITLE_MAP[key];
    }
    // Check businessUnitName or other hints
    var bu = (data.businessUnitName || '').toLowerCase();
    if (bu.indexOf('specialist') !== -1) return 'specialist';
    if (bu.indexOf('customer success') !== -1) return 'csam';
    return null;
  }

  function loadWhoami() {
    fetch('/api/crm/whoami')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && !data.error) {
          whoamiData = data;
          detectedRole = inferRoleFromWhoami(data);
          if (detectedRole && container) render();
        }
      })
      .catch(function () { /* CRM unavailable — silent */ });
  }

  // ── Data loading ─────────────────────────────────────────────

  function loadSettings() {
    fetch('/api/settings')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) { if (s) currentSettings = s; render(); })
      .catch(function () { render(); });
  }

  // ── Lifecycle ────────────────────────────────────────────────

  function mount(el) {
    container = el;
    container.innerHTML = '<div class="mcaps-settings mcaps-loading-state"><span class="mcaps-spinner"></span>Loading…</div>';
    loadSettings();
    loadWhoami();
  }

  function unmount() {
    container = null;
  }

  function onActivate() {
    if (container) loadSettings();
  }

  window.settingsView = { mount: mount, unmount: unmount, onActivate: onActivate };
})();
