// Theme Manager: Dark Mode (Default) / Light Mode with localStorage persistence
(function () {
  const THEME_KEY = 'assoc_portal_theme';

  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved;
    return 'dark'; // Default is dark as required
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    updateToggleButtons(theme);
  }

  function updateToggleButtons(theme) {
    const btns = document.querySelectorAll('.theme-toggle-btn');
    btns.forEach(btn => {
      if (theme === 'light') {
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
        btn.setAttribute('title', 'Switch to Dark Mode');
      } else {
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
        btn.setAttribute('title', 'Switch to Light Mode');
      }
    });
  }

  // Initial apply
  applyTheme(getPreferredTheme());

  document.addEventListener('DOMContentLoaded', () => {
    updateToggleButtons(getPreferredTheme());

    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
      });
    });

    // Mobile Hamburger logic
    const hamburger = document.querySelector('.hamburger-btn');
    const mobileNav = document.querySelector('.mobile-nav');
    if (hamburger && mobileNav) {
      hamburger.addEventListener('click', () => {
        mobileNav.classList.toggle('open');
      });
    }
  });

  window.toggleTheme = function () {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  };
})();
