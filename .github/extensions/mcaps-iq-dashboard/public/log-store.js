/* ============================================================
 *  Log Store — Global activity/error log with fetch intercept
 *  Captures: API errors, uncaught exceptions, unhandled promises.
 *  Exposes window.LogStore + manages the #log-drawer panel.
 * ============================================================ */
(function () {
  'use strict';

  var MAX = 300;
  var _entries = [];
  var _subs    = [];
  var _unread  = 0;
  var _lastAction = null;

  // Track the last clicked interactive element for log context
  document.addEventListener('mousedown', function (e) {
    var el = e.target.closest('button, a, label, input[type="checkbox"], input[type="radio"], select, [data-log-action]');
    if (el) {
      _lastAction =
        el.dataset.logAction ||
        el.title ||
        (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50) ||
        el.tagName;
    }
  }, true);

  function ts() {
    return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function add(level, action, message, detail) {
    var entry = {
      id:      Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      time:    ts(),
      level:   level,   // 'info' | 'warn' | 'error'
      action:  action || _lastAction || '—',
      message: message,
      detail:  detail || null
    };
    _entries.unshift(entry);
    if (_entries.length > MAX) _entries.pop();
    if (level === 'error' || level === 'warn') _unread++;
    _subs.forEach(function (cb) { try { cb(entry); } catch (e) {} });
    return entry;
  }

  // ── Global fetch intercept ────────────────────────────────
  var _origFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    var method   = (opts && opts.method) || 'GET';
    var shortUrl = String(url).replace(/^https?:\/\/[^/]+/, '');
    var ctx      = _lastAction;
    return _origFetch(url, opts)
      .then(function (r) {
        if (!r.ok) {
          add('error', ctx || (method + ' ' + shortUrl), 'HTTP ' + r.status + ' ' + r.statusText, shortUrl);
        }
        return r;
      })
      .catch(function (err) {
        add('error', ctx || (method + ' ' + shortUrl), err.message || String(err), shortUrl);
        throw err;
      });
  };

  // ── Global error handlers ─────────────────────────────────
  window.addEventListener('error', function (e) {
    add('error', 'Uncaught', e.message || String(e.error || e),
        (e.filename ? e.filename.replace(/.*\//, '') : '') + (e.lineno ? ':' + e.lineno : ''));
  });

  window.addEventListener('unhandledrejection', function (e) {
    var msg = e.reason
      ? (e.reason.message || String(e.reason))
      : 'Unhandled promise rejection';
    add('error', 'Promise', msg, null);
  });

  // ── Public API ────────────────────────────────────────────
  window.LogStore = {
    log:   function (level, action, msg, detail) { return add(level, action, msg, detail); },
    info:  function (action, msg, detail) { return add('info',  action, msg, detail); },
    warn:  function (action, msg, detail) { return add('warn',  action, msg, detail); },
    error: function (action, msg, detail) { return add('error', action, msg, detail); },
    entries:     function () { return _entries.slice(); },
    clear:       function () { _entries = []; _unread = 0; _subs.forEach(function (cb) { try { cb(null); } catch (e) {} }); },
    getUnread:   function () { return _unread; },
    resetUnread: function () { _unread = 0; },
    subscribe:   function (cb) {
      _subs.push(cb);
      return function () { _subs = _subs.filter(function (s) { return s !== cb; }); };
    }
  };

  // ── Drawer UI ─────────────────────────────────────────────
  function escHtml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function levelIcon(level) {
    return level === 'error' ? '🔴' : level === 'warn' ? '🟡' : '🔵';
  }

  function renderEntries(entriesEl) {
    var list = _entries;
    if (!list.length) {
      entriesEl.innerHTML = '<div class="log-empty">No log entries yet.</div>';
      return;
    }
    entriesEl.innerHTML = list.map(function (e) {
      var detailHtml = e.detail
        ? '<div class="log-entry__detail">' + escHtml(e.detail) + '</div>'
        : '';
      return '<div class="log-entry log-entry--' + e.level + '">' +
        '<span class="log-entry__icon">' + levelIcon(e.level) + '</span>' +
        '<div class="log-entry__body">' +
          '<div class="log-entry__row">' +
            '<span class="log-entry__action">' + escHtml(e.action) + '</span>' +
            '<span class="log-entry__msg">' + escHtml(e.message) + '</span>' +
          '</div>' +
          detailHtml +
        '</div>' +
        '<span class="log-entry__time">' + e.time + '</span>' +
      '</div>';
    }).join('');
  }

  function initDrawer() {
    var drawer    = document.getElementById('log-drawer');
    var toggleBtn = document.getElementById('log-drawer-toggle');
    var clearBtn  = document.getElementById('log-clear-btn');
    var closeBtn  = document.getElementById('log-close-btn');
    var entriesEl = document.getElementById('log-entries');
    var badgeEl   = document.getElementById('log-unread-badge');

    if (!drawer || !toggleBtn || !entriesEl) return;

    var isOpen = false;

    function updateBadge() {
      if (!badgeEl) return;
      var n = _unread;
      badgeEl.textContent = n > 99 ? '99+' : String(n);
      badgeEl.classList.toggle('log-badge--active', n > 0);
    }

    function open() {
      isOpen = true;
      drawer.classList.add('log-drawer--open');
      drawer.classList.remove('log-drawer--closed');
      window.LogStore.resetUnread();
      updateBadge();
      renderEntries(entriesEl);
    }

    function close() {
      isOpen = false;
      drawer.classList.remove('log-drawer--open');
      drawer.classList.add('log-drawer--closed');
    }

    toggleBtn.addEventListener('click', function () { isOpen ? close() : open(); });
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (clearBtn) clearBtn.addEventListener('click', function () {
      window.LogStore.clear();
      renderEntries(entriesEl);
      updateBadge();
    });

    // Live updates from LogStore
    window.LogStore.subscribe(function (entry) {
      if (!entry) {                     // fired after clear()
        if (isOpen) renderEntries(entriesEl);
        updateBadge();
        return;
      }
      if (isOpen) {
        renderEntries(entriesEl);
      } else {
        updateBadge();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDrawer);
  } else {
    initDrawer();
  }
})();
