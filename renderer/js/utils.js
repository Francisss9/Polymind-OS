'use strict';

// =========================================================
// RENDERER UTILITIES
// Pure functions — no DOM, no state, no side effects.
// Used by app.js, home.js, calendar.js, charts.js, trades.js
// =========================================================

/** Month abbreviations — single source of truth */
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Format a Date object to YYYY-MM-DD ISO string.
 * Safer than toISOString() which uses UTC — this uses local time.
 */
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dy}`;
}

/** Today as YYYY-MM-DD in local time */
function todayISO() { return toISODate(new Date()); }

/**
 * Format a P&L number with sign prefix.
 * @param {number|null} v
 * @returns {string}
 */
function formatPnl(v) {
  if (typeof v !== 'number') return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`;
}

/**
 * Truncate an ISO datetime to YYYY-MM-DD.
 * @param {string|null} iso
 * @returns {string}
 */
function formatDate(iso) {
  return iso ? iso.slice(0, 10) : '—';
}

/**
 * Return CSS class for a trade result string.
 * @param {string} r
 * @returns {'win'|'loss'|'breakeven'}
 */
function resultClass(r) {
  r = (r || '').toLowerCase();
  return r === 'win' ? 'win' : r === 'loss' ? 'loss' : 'breakeven';
}

/**
 * Escape special HTML characters to prevent XSS in innerHTML.
 * @param {*} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Show a banner element with a message.
 * @param {HTMLElement|null} el
 * @param {string} msg
 */
function showBanner(el, msg) {
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
}

/**
 * Hide multiple banner elements.
 * @param {...HTMLElement} els
 */
function clearBanners(...els) {
  els.forEach((el) => el && el.classList.add('hidden'));
}

/**
 * Animate a number counting up/down inside an element.
 * @param {HTMLElement} el
 * @param {number} target
 * @param {boolean} isFloat
 * @param {string} prefix
 */
function animateNumber(el, target, isFloat = true, prefix = '') {
  const start = parseFloat(el.dataset.current || 0) || 0;
  const duration = 600;
  const startTime = performance.now();
  el.dataset.current = target;

  function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    const val = start + (target - start) * ease;
    el.textContent = prefix + (isFloat ? val.toFixed(2) : Math.round(val).toString());
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
