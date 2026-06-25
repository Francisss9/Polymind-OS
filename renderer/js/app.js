'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const NOTION_INTEGRATIONS_URL = 'https://www.notion.so/my-integrations';

// =========================================================
// LOCAL AUTH — explained
// =========================================================
// This is a single-user, offline lock for the desktop app.
// It does NOT communicate with any server.
//
// How it works:
//   1. First run → you type any email + password → they get saved.
//      Those become YOUR credentials forever (stored in localStorage).
//   2. Every run after → you must type the exact same email + password.
//   3. "Forgot password" = open DevTools → Application → localStorage
//      → delete the "polymind_auth" key → restart app.
//
// Why btoa? It's light obfuscation, not real encryption.
// For a personal desktop tool it's sufficient — nobody else
// has access to your machine's localStorage.
//
// To reset credentials: clear localStorage key "polymind_auth"

const AUTH_KEY = 'polymind_auth';

function getLocalAuth() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
}
function setLocalAuth(email, password) {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ encoded: btoa(`${email}:${password}`) }));
}
function clearLocalAuth() { localStorage.removeItem(AUTH_KEY); }
function verifyLocalAuth(email, password) {
  const s = getLocalAuth();
  return s ? s.encoded === btoa(`${email}:${password}`) : false;
}
function isFirstRun() { return !getLocalAuth(); }

// =========================================================
// State
// =========================================================

let trades = [];
let filteredTrades = [];
let config = {};
let syncing = false;
let connecting = false;
let currentView = 'dashboard';

// =========================================================
// Gate
// =========================================================

function showGate(step = 'login') {
  $('#gate').classList.remove('hidden');
  $('#app-shell').classList.add('hidden');
  showStep(step);
}

function showApp() {
  $('#gate').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
  // Animate app shell in
  $('#app-shell').style.opacity = '0';
  requestAnimationFrame(() => {
    $('#app-shell').style.transition = 'opacity 0.25s ease';
    $('#app-shell').style.opacity = '1';
  });
}

function showStep(name) {
  ['step-login', 'step-notion'].forEach((id) => {
    $('#' + id).classList.toggle('hidden', id !== 'step-' + name);
  });
}

// =========================================================
// Banners
// =========================================================

function showBanner(el, msg) {
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
}
function clearBanners(...els) { els.forEach((el) => el && el.classList.add('hidden')); }

// =========================================================
// Format
// =========================================================

function formatPnl(v) {
  if (typeof v !== 'number') return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`;
}
function formatDate(iso) { return iso ? iso.slice(0, 10) : '—'; }
function resultClass(r) {
  r = (r || '').toLowerCase();
  return r === 'win' ? 'win' : r === 'loss' ? 'loss' : 'breakeven';
}
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// =========================================================
// Stats
// =========================================================

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

function updateStats() {
  const src = filteredTrades;
  const totalPnl = src.reduce((s, t) => s + (t.pnl || 0), 0);
  const wins = src.filter((t) => (t.result || '').toLowerCase() === 'win' || t.pnl > 0).length;
  const winRate = src.length ? Math.round((wins / src.length) * 100) : 0;
  const rrVals = src.map((t) => t.rr).filter((v) => typeof v === 'number');
  const avgRr = rrVals.length ? rrVals.reduce((a, b) => a + b, 0) / rrVals.length : null;

  const pnlEl = $('#stat-pnl');
  animateNumber(pnlEl, totalPnl, true, totalPnl > 0 ? '+' : '');
  pnlEl.className = `value ${totalPnl > 0 ? 'positive' : totalPnl < 0 ? 'negative' : ''}`;

  const wrEl = $('#stat-winrate');
  if (src.length) { animateNumber(wrEl, winRate, false, '', '%'); wrEl.dataset.suffix = '%'; }
  else wrEl.textContent = '—';

  animateNumber($('#stat-count'), src.length, false);
  if (avgRr != null) animateNumber($('#stat-rr'), avgRr, true);
  else $('#stat-rr').textContent = '—';

  $('#trades-count-label').textContent = `${src.length} trade${src.length === 1 ? '' : 's'}`;
}

// Fix winrate display suffix
function fixStatSuffixes() {
  const el = $('#stat-winrate');
  if (el.dataset.suffix && !el.textContent.includes('%') && el.textContent !== '—') {
    el.textContent += '%';
  }
}

// =========================================================
// Render trades (with staggered fade-in)
// =========================================================

function renderTrades() {
  const tbody = $('#trades-body');
  const empty = $('#trades-empty');
  tbody.innerHTML = '';

  if (!filteredTrades.length) {
    empty.classList.remove('hidden');
    updateStats();
    return;
  }
  empty.classList.add('hidden');

  filteredTrades.forEach((trade, i) => {
    const tr = document.createElement('tr');
    tr.style.opacity = '0';
    tr.style.transform = 'translateY(6px)';
    tr.innerHTML = `
      <td>${formatDate(trade.date)}</td>
      <td>${escapeHtml(trade.pair)}</td>
      <td>${escapeHtml(trade.direction)}</td>
      <td>${trade.entryPrice ?? '—'}</td>
      <td>${trade.exitPrice ?? '—'}</td>
      <td class="${trade.pnl > 0 ? 'pnl-positive' : trade.pnl < 0 ? 'pnl-negative' : ''}">${formatPnl(trade.pnl)}</td>
      <td>${trade.rr ?? '—'}</td>
      <td><span class="result-pill ${resultClass(trade.result)}">${escapeHtml(trade.result || '—')}</span></td>
      <td>
        <div class="row-actions">
          <button class="btn btn-ghost" data-edit="${trade.id}">Edit</button>
          <button class="btn btn-danger" data-delete="${trade.id}">Del</button>
        </div>
      </td>`;
    tbody.appendChild(tr);

    // Staggered row entrance
    setTimeout(() => {
      tr.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      tr.style.opacity = '1';
      tr.style.transform = 'translateY(0)';
    }, i * 30);
  });

  // Click row to open (not just edit button)
  tbody.querySelectorAll('tr').forEach((tr, i) => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('button')) return; // let buttons handle themselves
      openTradeModal(filteredTrades[i]);
    });
  });

  tbody.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openTradeModal(trades.find((t) => t.id === btn.dataset.edit)));
  });
  tbody.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => deleteTrade(btn.dataset.delete));
  });

  updateStats();
  setTimeout(fixStatSuffixes, 650);
}

function applyFilter(q) {
  q = (q || '').toLowerCase().trim();
  filteredTrades = q
    ? trades.filter((t) =>
        (t.pair||'').toLowerCase().includes(q) ||
        (t.result||'').toLowerCase().includes(q) ||
        (t.direction||'').toLowerCase().includes(q) ||
        (t.notes||'').toLowerCase().includes(q))
    : [...trades];
  renderTrades();
}

// =========================================================
// Sync
// =========================================================

function updateSyncStatus(ts) {
  const el = $('#sync-status');
  if (!ts) { el.textContent = 'Not synced'; return; }
  const d = new Date(ts);
  el.textContent = `Synced ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function setSyncing(active) {
  syncing = active;
  $('#sync-spinner').classList.toggle('hidden', !active);
  $('#btn-sync').disabled = active;
}

async function loadCached() {
  trades = await window.polymind.trades.getCached();
  filteredTrades = [...trades];
  renderTrades();
}

async function syncTrades() {
  if (syncing) return;
  setSyncing(true);
  const errBar = $('#sync-error-bar');
  errBar.classList.add('hidden');
  try {
    const result = await window.polymind.trades.sync();
    trades = result.trades;
    applyFilter($('#trades-search').value);
    updateSyncStatus(result.lastSyncedAt);
  } catch (err) {
    errBar.textContent = `Sync failed: ${err.message || 'Unknown error'}`;
    errBar.classList.remove('hidden');
  } finally {
    setSyncing(false);
  }
}

// =========================================================
// Views
// =========================================================

function showView(name) {
  ['dashboard', 'settings'].forEach((v) => {
    const el = $(`#view-${v}`);
    el.classList.toggle('hidden', v !== name);
    if (v === name) {
      el.style.opacity = '0';
      requestAnimationFrame(() => {
        el.style.transition = 'opacity 0.18s ease';
        el.style.opacity = '1';
      });
    }
  });

  if (name === 'settings') {
    $('#settings-database').value = config.databaseId || '';
    $('#settings-token').value = '';
    clearBanners($('#settings-error'), $('#settings-success'));
  }

  $$('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === name));
  $('#view-title').textContent = name === 'settings' ? 'Kernel' : 'Trading Tracker';
  currentView = name;
}

// =========================================================
// Trade modal
// =========================================================

function openTradeModal(trade = null) {
  $('#modal-title').textContent = trade ? 'Edit trade' : 'New trade';
  $('#trade-id').value = trade?.id || '';
  $('#trade-date').value = trade?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  $('#trade-pair').value = trade?.pair || '';
  $('#trade-direction').value = trade?.direction || '';
  $('#trade-result').value = trade?.result || '';
  $('#trade-entry').value = trade?.entryPrice ?? '';
  $('#trade-exit').value = trade?.exitPrice ?? '';
  $('#trade-pnl').value = trade?.pnl ?? '';
  $('#trade-rr').value = trade?.rr ?? '';
  $('#trade-notes').value = trade?.notes || '';
  clearBanners($('#trade-error'));

  const modal = $('#trade-modal');
  modal.classList.remove('hidden');
  // Animate in
  const box = modal.querySelector('.modal');
  box.style.opacity = '0';
  box.style.transform = 'translateY(12px) scale(0.98)';
  requestAnimationFrame(() => {
    box.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    box.style.opacity = '1';
    box.style.transform = 'translateY(0) scale(1)';
  });

  // Focus first empty field
  setTimeout(() => {
    const first = modal.querySelector('input:not([type=hidden]):not([value])') || $('#trade-pair');
    first?.focus();
  }, 50);
}

function closeTradeModal() {
  const modal = $('#trade-modal');
  const box = modal.querySelector('.modal');
  box.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
  box.style.opacity = '0';
  box.style.transform = 'translateY(8px) scale(0.98)';
  setTimeout(() => {
    modal.classList.add('hidden');
    $('#trade-form').reset();
  }, 150);
}

function readTradeForm() {
  const num = (id) => { const v = $(id).value; return v === '' ? null : Number(v); };
  return {
    id: $('#trade-id').value || undefined,
    date: $('#trade-date').value,
    pair: $('#trade-pair').value.trim(),
    direction: $('#trade-direction').value,
    result: $('#trade-result').value || undefined,
    entryPrice: num('#trade-entry'),
    exitPrice: num('#trade-exit'),
    pnl: num('#trade-pnl') ?? 0,
    rr: num('#trade-rr'),
    notes: $('#trade-notes').value.trim(),
  };
}

async function saveTrade(e) {
  e.preventDefault();
  const trade = readTradeForm();
  clearBanners($('#trade-error'));
  $('#btn-modal-save').disabled = true;
  try {
    if (trade.id) {
      const updated = await window.polymind.trades.update(trade);
      trades = trades.map((t) => (t.id === updated.id ? updated : t));
    } else {
      const created = await window.polymind.trades.create(trade);
      trades.unshift(created);
    }
    applyFilter($('#trades-search').value);
    closeTradeModal();
  } catch (err) {
    showBanner($('#trade-error'), err.message || 'Failed to save');
  } finally {
    $('#btn-modal-save').disabled = false;
  }
}

async function deleteTrade(id) {
  if (!confirm('Archive this trade in Notion?')) return;
  try {
    await window.polymind.trades.delete(id);
    trades = trades.filter((t) => t.id !== id);
    applyFilter($('#trades-search').value);
  } catch (err) {
    alert(err.message || 'Delete failed');
  }
}

// =========================================================
// Keyboard shortcuts
// =========================================================

function bindShortcuts() {
  document.addEventListener('keydown', (e) => {
    const modal = !$('#trade-modal').classList.contains('hidden');
    const typing = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);

    // Escape — close modal
    if (e.key === 'Escape') {
      if (modal) { closeTradeModal(); return; }
    }

    // Shortcuts only when not typing and app is visible
    if (typing || $('#app-shell').classList.contains('hidden')) return;

    if (e.key === 'n' && !e.metaKey && !e.ctrlKey) { openTradeModal(); return; }
    if (e.key === 'r' && !e.metaKey && !e.ctrlKey) { syncTrades(); return; }
    if (e.key === '/' ) { e.preventDefault(); $('#trades-search')?.focus(); return; }
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $('#trades-search')?.focus(); return; }
  });
}

// =========================================================
// Step 1 — Login
// =========================================================

async function handleLogin() {
  const email = $('#login-email').value.trim();
  const pw = $('#login-password').value;
  clearBanners($('#login-error'));

  if (!email || !pw) { showBanner($('#login-error'), 'Enter your email and password.'); return; }

  $('#login-spinner').classList.remove('hidden');
  $('#btn-login').disabled = true;
  await new Promise((r) => setTimeout(r, 280));

  try {
    if (isFirstRun()) {
      setLocalAuth(email, pw);
    } else if (!verifyLocalAuth(email, pw)) {
      showBanner($('#login-error'), 'Incorrect email or password.');
      return;
    }
    config = await window.polymind.config.get();
    if (!config.setupComplete || !config.notionToken || !config.databaseId) {
      showStep('notion');
    } else {
      showApp();
      await loadCached();
      updateSyncStatus(config.lastSyncedAt);
      showView('dashboard');
    }
  } finally {
    $('#login-spinner').classList.add('hidden');
    $('#btn-login').disabled = false;
  }
}

// =========================================================
// Step 2 — Notion connect
// =========================================================

async function handleNotionConnect() {
  if (connecting) return;
  clearBanners($('#setup-error'), $('#setup-success'));

  const notionToken = $('#setup-token').value.trim();
  const databaseId = $('#setup-database').value.trim();

  if (!notionToken || !databaseId) {
    showBanner($('#setup-error'), 'Both fields are required.'); return;
  }

  connecting = true;
  $('#connect-spinner').classList.remove('hidden');
  $('#btn-test-connect').disabled = true;

  try {
    const result = await window.polymind.notion.test({ notionToken, databaseId });
    showBanner($('#setup-success'), `✓ Connected to "${result.title}". Syncing…`);
    $('#setup-success').classList.remove('hidden');
    await window.polymind.config.set({ notionToken, databaseId, setupComplete: true });
    config = await window.polymind.config.get();
    await new Promise((r) => setTimeout(r, 500));
    showApp();
    showView('dashboard');
    await syncTrades();
  } catch (err) {
    showBanner($('#setup-error'), err.message || 'Connection failed.');
  } finally {
    connecting = false;
    $('#connect-spinner').classList.add('hidden');
    $('#btn-test-connect').disabled = false;
  }
}

// =========================================================
// Settings
// =========================================================

async function handleSettingsSave() {
  clearBanners($('#settings-error'), $('#settings-success'));
  const payload = { databaseId: $('#settings-database').value.trim() };
  const token = $('#settings-token').value.trim();
  if (token) payload.notionToken = token;
  try {
    config = await window.polymind.config.set(payload);
    showBanner($('#settings-success'), 'Saved.');
    $('#settings-success').classList.remove('hidden');
    $('#settings-token').value = '';
  } catch (err) {
    showBanner($('#settings-error'), err.message);
  }
}

async function handleSettingsTest() {
  clearBanners($('#settings-error'), $('#settings-success'));
  try {
    const r = await window.polymind.notion.test({
      notionToken: $('#settings-token').value.trim() || config.notionToken,
      databaseId: $('#settings-database').value.trim(),
    });
    showBanner($('#settings-success'), `✓ Connected to "${r.title}"`);
    $('#settings-success').classList.remove('hidden');
  } catch (err) {
    showBanner($('#settings-error'), err.message);
  }
}

function handleDisconnect() {
  if (!confirm('Disconnect Notion? Local cache kept.')) return;
  window.polymind.config.set({ setupComplete: false, notionToken: '', databaseId: '' });
  showGate('notion');
}

// =========================================================
// Password visibility
// =========================================================

function setupToggle(btnId, inputId) {
  const btn = $('#' + btnId), input = $('#' + inputId);
  if (!btn || !input) return;
  btn.addEventListener('click', () => { input.type = input.type === 'text' ? 'password' : 'text'; });
}

// =========================================================
// Events
// =========================================================

function bindEvents() {
  // Gate
  $('#btn-login').addEventListener('click', handleLogin);
  $('#login-email').addEventListener('keydown', (e) => e.key === 'Enter' && $('#login-password').focus());
  $('#login-password').addEventListener('keydown', (e) => e.key === 'Enter' && handleLogin());
  $('#btn-goto-token').addEventListener('click', () => { showStep('notion'); });
  $('#btn-back-login').addEventListener('click', () => showStep('login'));
  $('#btn-test-connect').addEventListener('click', handleNotionConnect);
  $('#btn-open-notion').addEventListener('click', () => window.polymind.openExternal(NOTION_INTEGRATIONS_URL));

  // Nav
  $$('.nav-item').forEach((btn) => btn.addEventListener('click', () => showView(btn.dataset.view)));

  // Topbar
  $('#btn-sync').addEventListener('click', () => syncTrades());
  $('#btn-new-trade').addEventListener('click', () => openTradeModal());

  // Modal
  $('#btn-modal-cancel').addEventListener('click', closeTradeModal);
  $('#btn-modal-close').addEventListener('click', closeTradeModal);
  $('#trade-form').addEventListener('submit', saveTrade);
  $('#trade-modal').addEventListener('click', (e) => { if (e.target === $('#trade-modal')) closeTradeModal(); });

  // Settings
  $('#btn-settings-save').addEventListener('click', handleSettingsSave);
  $('#btn-settings-test').addEventListener('click', handleSettingsTest);
  $('#btn-disconnect').addEventListener('click', handleDisconnect);

  // Search
  $('#trades-search').addEventListener('input', (e) => applyFilter(e.target.value));

  // Toggles
  setupToggle('toggle-pw', 'login-password');
  setupToggle('toggle-token', 'setup-token');

  // Keyboard shortcuts
  bindShortcuts();
}

// =========================================================
// Init
// =========================================================

async function init() {
  // Wire up login image — uses local asset, no JS needed if set via CSS,
  // but setting inline ensures CSP allows it via 'self'
  const artBg = document.getElementById('gate-art-bg');
  if (artBg) {
    artBg.style.backgroundImage = "url('../assets/login-bg.jpg')";
  }

  bindEvents();
  config = await window.polymind.config.get();
  updateSyncStatus(config.lastSyncedAt);
  showGate('login');
}

init();
