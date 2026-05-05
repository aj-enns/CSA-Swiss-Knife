/* ============================================================
 *  Session Picker — Modal prompt-to-session dispatcher
 * ============================================================ */
(function () {
  'use strict';

  var modalEl = null;
  var overlayEl = null;
  var currentPrompt = null;
  var currentOnSelect = null;
  var focusedIndex = 0;
  var sessionCards = [];

  // ── Helpers ──────────────────────────────────────────────────

  function getSessions() {
    if (typeof window.AppState === 'undefined') return [];
    var state = window.AppState.getState();
    var sessions = state.sessions || {};
    return Object.entries(sessions).map(function (entry) {
      var id = entry[0], s = entry[1];
      return {
        sessionId: id,
        title: s.session.derivedTitle || s.session.title || shortId(id),
        status: s.metadata.status,
        branch: s.metadata.branch,
        startTime: s.metadata.startTime,
        turnCount: s.session.turnCount || 0,
        model: s.session.model,
        runningTasks: (s.backgroundTasks || []).filter(function (t) { return t.status === 'running'; }).length
      };
    }).sort(function (a, b) {
      var aActive = a.status === 'active' ? 1 : 0;
      var bActive = b.status === 'active' ? 1 : 0;
      return bActive - aActive || (b.startTime || 0) - (a.startTime || 0);
    });
  }

  function shortId(id) {
    return id ? id.slice(0, 8) : '--------';
  }

  function formatDuration(startTs) {
    if (!startTs) return '';
    var s = Math.floor((Date.now() - startTs) / 1000);
    var m = Math.floor(s / 60);
    var h = Math.floor(m / 60);
    if (h > 0) return h + 'h ' + (m % 60) + 'm';
    if (m > 0) return m + 'm';
    return s + 's';
  }

  // ── Session card renderer ─────────────────────────────────────

  function renderSessionCard(session, index, isFocused) {
    var statusDot = session.status === 'active' ? 'mcaps-picker-dot--active' : 'mcaps-picker-dot--idle';
    var dur = formatDuration(session.startTime);
    var taskBadge = session.runningTasks > 0
      ? `<span class="mcaps-picker-card__tasks">${session.runningTasks} running</span>`
      : '';
    var modelBadge = session.model
      ? `<span class="mcaps-picker-card__model">${session.model}</span>`
      : '';

    return `
      <div class="mcaps-picker-card ${isFocused ? 'mcaps-picker-card--focused' : ''}"
           data-index="${index}" data-session-id="${session.sessionId}" tabindex="0"
           role="option" aria-selected="${isFocused}">
        <span class="mcaps-picker-dot ${statusDot}"></span>
        <div class="mcaps-picker-card__body">
          <div class="mcaps-picker-card__title">${session.title}</div>
          <div class="mcaps-picker-card__meta">
            ${session.branch ? `<span class="mcaps-picker-card__branch">${session.branch}</span>` : ''}
            ${dur ? `<span class="mcaps-picker-card__dur">${dur}</span>` : ''}
            <span class="mcaps-picker-card__turns">${session.turnCount} turn${session.turnCount !== 1 ? 's' : ''}</span>
            ${modelBadge}
            ${taskBadge}
          </div>
        </div>
        <span class="mcaps-picker-card__arrow">→</span>
      </div>`;
  }

  // ── Dispatch ──────────────────────────────────────────────────

  function dispatchToSession(session) {
    hide();

    window.location.hash = '#/mission-control';

    // Send via WebSocket if available, otherwise fall back to dispatchCopilotAction
    if (typeof window.AppConnection !== 'undefined' && typeof window.AppConnection.send === 'function') {
      window.AppConnection.send({
        type: 'chat:send',
        sessionId: session.sessionId,
        data: { message: currentPrompt }
      });
    } else if (typeof window.dispatchCopilotAction === 'function') {
      window.dispatchCopilotAction(currentPrompt);
    }

    if (typeof currentOnSelect === 'function') {
      currentOnSelect(session);
    }
  }

  // ── Keyboard navigation ───────────────────────────────────────

  function handleKeydown(e) {
    if (!modalEl) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusedIndex = Math.min(focusedIndex + 1, sessionCards.length - 1);
        updateFocus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusedIndex = Math.max(focusedIndex - 1, 0);
        updateFocus();
        break;
      case 'Enter':
        e.preventDefault();
        if (sessionCards[focusedIndex]) dispatchToSession(sessionCards[focusedIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        hide();
        break;
    }
  }

  function updateFocus() {
    if (!modalEl) return;
    modalEl.querySelectorAll('.mcaps-picker-card').forEach(function (card, i) {
      card.classList.toggle('mcaps-picker-card--focused', i === focusedIndex);
      card.setAttribute('aria-selected', String(i === focusedIndex));
    });
    var focused = modalEl.querySelector('.mcaps-picker-card--focused');
    if (focused) focused.scrollIntoView({ block: 'nearest' });
  }

  // ── Modal build ───────────────────────────────────────────────

  function buildModal(sessions) {
    var promptPreview = currentPrompt && currentPrompt.length > 60
      ? currentPrompt.slice(0, 60) + '…'
      : (currentPrompt || '');

    var cards = sessions.map(function (session, i) {
      return renderSessionCard(session, i, i === focusedIndex);
    }).join('');

    var noSessions = !sessions.length
      ? '<div class="mcaps-picker-empty">No active sessions. Start a Copilot CLI conversation first.</div>'
      : '';

    return `
      <div class="mcaps-picker-modal" role="dialog" aria-modal="true"
           aria-label="Select session">
        <div class="mcaps-picker-header">
          <h2 class="mcaps-picker-title">Send to Session</h2>
          <button class="mcaps-picker-close" aria-label="Close">✕</button>
        </div>
        <div class="mcaps-picker-prompt-preview">
          <span class="mcaps-picker-prompt-label">Prompt</span>
          <span class="mcaps-picker-prompt-text">${promptPreview}</span>
        </div>
        <div class="mcaps-picker-list" role="listbox">
          ${cards}
          ${noSessions}
        </div>
        <div class="mcaps-picker-hint">↑↓ navigate · Enter select · Esc close</div>
      </div>`;
  }

  // ── Public API ────────────────────────────────────────────────

  function show(prompt, onSelect) {
    if (modalEl) hide();

    currentPrompt = prompt || '';
    currentOnSelect = onSelect || null;
    focusedIndex = 0;
    sessionCards = getSessions();

    // Auto-select single session without showing picker
    if (sessionCards.length === 1) {
      dispatchToSession(sessionCards[0]);
      return;
    }

    // Build overlay
    overlayEl = document.createElement('div');
    overlayEl.className = 'mcaps-picker-overlay';
    overlayEl.innerHTML = buildModal(sessionCards);
    document.body.appendChild(overlayEl);

    modalEl = overlayEl.querySelector('.mcaps-picker-modal');

    // Backdrop click
    overlayEl.addEventListener('click', function (e) {
      if (e.target === overlayEl) hide();
    });

    // Close button
    var closeBtn = modalEl.querySelector('.mcaps-picker-close');
    if (closeBtn) closeBtn.addEventListener('click', hide);

    // Session card clicks
    modalEl.querySelectorAll('.mcaps-picker-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var idx = parseInt(card.dataset.index, 10);
        if (!isNaN(idx) && sessionCards[idx]) dispatchToSession(sessionCards[idx]);
      });
      card.addEventListener('mouseenter', function () {
        focusedIndex = parseInt(card.dataset.index, 10) || 0;
        updateFocus();
      });
    });

    // Keyboard
    document.addEventListener('keydown', handleKeydown);

    // Focus first card
    requestAnimationFrame(function () {
      var first = modalEl && modalEl.querySelector('.mcaps-picker-card');
      if (first) first.focus();
    });
  }

  function hide() {
    document.removeEventListener('keydown', handleKeydown);
    if (overlayEl && overlayEl.parentNode) {
      overlayEl.parentNode.removeChild(overlayEl);
    }
    overlayEl = null;
    modalEl = null;
    currentPrompt = null;
    currentOnSelect = null;
  }

  function isVisible() {
    return !!modalEl;
  }

  window.SessionPicker = { show: show, hide: hide, isVisible: isVisible };
})();
