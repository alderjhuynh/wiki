(function () {
  var STORAGE_KEY = 'aurasmp_theme';
  var docEl = document.documentElement;

  function getStored() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function setStored(v) {
    try {
      if (v) localStorage.setItem(STORAGE_KEY, v);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }
  function apply(theme) {
    if (theme === 'light' || theme === 'dark') docEl.setAttribute('data-theme', theme);
    else docEl.removeAttribute('data-theme');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#231e33' : theme === 'light' ? '#fdf6ff' : (window.matchMedia('(prefers-color-scheme: dark)').matches ? '#231e33' : '#fdf6ff'));
    }
  }
  function currentEffective() {
    var stored = getStored();
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  var stored = getStored();
  if (stored) apply(stored);

  function toggle() {
    var next = currentEffective() === 'dark' ? 'light' : 'dark';
    setStored(next);
    apply(next);
  }
  function resetToSystem() {
    setStored(null);
    apply(null);
  }

  function bind() {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('click', toggle);
      var updateLabel = function () {
        var eff = currentEffective();
        btn.setAttribute('aria-label', 'Switch to ' + (eff === 'dark' ? 'light' : 'dark') + ' theme');
        btn.setAttribute('title', 'Switch to ' + (eff === 'dark' ? 'light' : 'dark') + ' — ' + (eff === 'dark' ? 'Cream' : 'Cocoa'));
      };
      updateLabel();
      var obs = new MutationObserver(updateLabel);
      obs.observe(docEl, { attributes: true, attributeFilter: ['data-theme'] });
      window.addEventListener('storage', updateLabel);
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        if (!getStored()) updateLabel();
      });
    });
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('dblclick', function (e) {
        e.preventDefault();
        resetToSystem();
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  window.__parfaitTheme = { toggle: toggle, reset: resetToSystem, apply: apply, getStored: getStored };
})();
