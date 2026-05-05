/* ============================================================
 *  Hash Router — /#/home, /#/sessions, /#/skills, etc.
 * ============================================================ */
(function () {
  'use strict';

  function normalizeHash(hash) {
    if (!hash || hash === '#') return 'home';
    return hash.replace(/^#\/?/, '') || 'home';
  }

  function updateNav(route) {
    document.querySelectorAll('.nav-item').forEach(function (item) {
      item.classList.toggle('active', item.dataset.route === route);
    });
  }

  function createRouter(options) {
    var views = options.views || {};
    var defaultRoute = options.defaultRoute || 'home';
    var container = document.getElementById(options.containerId);
    var activeRoute = null;

    function render(route) {
      if (!container) return;
      var resolved = views[route] ? route : defaultRoute;
      var view = views[resolved];
      if (!view) return;

      if (activeRoute && views[activeRoute] && typeof views[activeRoute].unmount === 'function') {
        views[activeRoute].unmount();
      }
      container.innerHTML = '';
      if (typeof view.mount === 'function') view.mount(container);
      if (typeof view.onActivate === 'function') view.onActivate();
      activeRoute = resolved;
      updateNav(resolved);
    }

    function onHashChange() { render(normalizeHash(window.location.hash)); }

    function start() {
      if (!window.location.hash || window.location.hash === '#') {
        window.location.hash = '#/' + defaultRoute;
      }
      window.addEventListener('hashchange', onHashChange);
      onHashChange();
    }

    return { start: start, render: render };
  }

  window.Router = { createRouter: createRouter };
})();
