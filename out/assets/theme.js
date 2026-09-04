(function () {
  'use strict';

  const storageKey = 'yqfl-theme-preference';
  const allowed = new Set(['system', 'light', 'dark']);
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  function preference() {
    try {
      const saved = localStorage.getItem(storageKey);
      return allowed.has(saved) ? saved : 'system';
    } catch (_) {
      return 'system';
    }
  }

  function applyTheme(value) {
    const selected = allowed.has(value) ? value : 'system';
    const resolved = selected === 'system' ? (media.matches ? 'dark' : 'light') : selected;
    document.documentElement.dataset.themePreference = selected;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    document.querySelectorAll('[data-theme-select]').forEach(select => { select.value = selected; });
  }

  applyTheme(preference());

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-theme-select]').forEach(select => {
      select.value = preference();
      select.addEventListener('change', () => {
        const selected = allowed.has(select.value) ? select.value : 'system';
        try { localStorage.setItem(storageKey, selected); } catch (_) {}
        applyTheme(selected);
      });
    });
  });

  media.addEventListener?.('change', () => {
    if (preference() === 'system') applyTheme('system');
  });
  window.addEventListener('storage', event => {
    if (event.key === storageKey) applyTheme(preference());
  });
})();
