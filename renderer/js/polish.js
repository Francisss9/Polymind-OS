'use strict';

// =========================================================
// POLISH — fluid UX micro-interactions
// Purely additive: listens/observes, never owns state.
// Loads last so it can safely query the fully-built DOM.
// Every effect degrades silently if its target isn't present.
// =========================================================

(function () {
  // ---- Ripple on any .btn / button click ----
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.btn, .btn-primary, .btn-connect, .btn-outline, .widget-sync-btn, .tb-btn, .nav-item');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.4;
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.width = span.style.height = `${size}px`;
    span.style.left = `${e.clientX - rect.left - size / 2}px`;
    span.style.top = `${e.clientY - rect.top - size / 2}px`;
    btn.appendChild(span);
    span.addEventListener('animationend', () => span.remove());
  });

  // ---- Stagger children of key list containers on first paint ----
  ['.trade-table tbody', 'table.trades tbody', '.stat-grid', '.chart-grid', '.home-widgets']
    .forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) el.classList.add('stagger-in');
    });

  // Re-stagger a container whenever its children are replaced wholesale
  // (covers trades.js re-rendering the table after sync/CRUD).
  function restagger(el) {
    if (!el) return;
    el.classList.remove('stagger-in');
    void el.offsetWidth; // force reflow so the animation replays
    el.classList.add('stagger-in');
  }
  window.polymindRestagger = restagger; // opt-in hook other modules can call

  const tbody = document.querySelector('table.trades tbody');
  if (tbody && window.MutationObserver) {
    const obs = new MutationObserver(() => restagger(tbody));
    obs.observe(tbody, { childList: true });
  }

  // ---- Checkbox pop class ----
  document.addEventListener('click', (e) => {
    const check = e.target.closest('.habit-check');
    if (!check) return;
    // let the app's own handler flip the underlying state first
    requestAnimationFrame(() => {
      if (check.classList.contains('checked') || check.getAttribute('aria-checked') === 'true') {
        check.classList.remove('checked');
        void check.offsetWidth;
        check.classList.add('checked');
      }
    });
  });

  // ---- Number value-pulse: watches for text changes on elements
  // that opt in via [data-pulse] and flashes them briefly ----
  document.querySelectorAll('[data-pulse]').forEach((el) => {
    const obs = new MutationObserver(() => {
      el.classList.remove('value-pulse');
      void el.offsetWidth;
      el.classList.add('value-pulse');
    });
    obs.observe(el, { characterData: true, childList: true, subtree: true });
  });

  // ---- Crossfade between views instead of an instant swap ----
  // shell.js toggles a `.view.active` class per view; we intercept
  // that by watching class changes and briefly keeping the outgoing
  // view painted with an exit animation.
  const views = document.querySelectorAll('.view');
  let lastActive = document.querySelector('.view.active');
  if (views.length && window.MutationObserver) {
    views.forEach((view) => {
      const obs = new MutationObserver(() => {
        const isActive = view.classList.contains('active');
        if (!isActive && view === lastActive) {
          view.classList.add('leaving');
          view.addEventListener('animationend', () => view.classList.remove('leaving'), { once: true });
        }
        if (isActive) lastActive = view;
      });
      obs.observe(view, { attributes: true, attributeFilter: ['class'] });
    });
  }
})();
