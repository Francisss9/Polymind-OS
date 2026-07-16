'use strict';

// =========================================================
// SHELL MODULE
// Owns: gate/app transitions, view switching, trade sync,
// balance sync, settings handlers, auth flow, keybindings,
// event binding, and app init.
// =========================================================

// ---- Gate ---------------------------------------------------

function showGate(step = 'login') {
  $('#gate').classList.remove('hidden');
  $('#app-shell').classList.add('hidden');
  showStep(step);
}

function showApp() {
  $('#gate').classList.add('hidden');
  const shell = $('#app-shell');
  shell.classList.remove('hidden');
  shell.classList.remove('app-enter');
  void shell.offsetWidth; // reflow
  shell.classList.add('app-enter');
}

function showStep(name) {
  ['step-login', 'step-notion'].forEach((id) => {
    $('#' + id).classList.toggle('hidden', id !== 'step-' + name);
  });
}

// ---- View switching -----------------------------------------

// Per-view render guard: stores hash of data at last render
const _lastRenderHash = {};

function _hash(data) {
  try { return JSON.stringify(data).length + (data?.length ?? 0); } catch(e) {
    console.warn('[shell] _hash failed:', e.message); return 0;
  }
}

function showView(name) {
  ['home', 'dashboard', 'charts', 'settings'].forEach((v) => {
    const el = $(`#view-${v}`);
    if (!el) return;
    el.classList.toggle('hidden', v !== name);
    if (v === name) {
      el.classList.remove('view-enter');
      void el.offsetWidth;
      el.classList.add('view-enter');
    }
  });

  if (name === 'settings') {
    $('#settings-database').value  = config.databaseId  || '';
    $('#settings-habits-db').value = config.habitsDbId  || '';
    $('#settings-goals-db').value  = config.goalsDbId   || '';
    $('#settings-balance-db').value= config.balanceDbId || '';
    $('#settings-token').value = '';
    clearBanners($('#settings-error'), $('#settings-success'));
  }

  if (name === 'charts') {
    // Render guard — skip if trade data hasn't changed since last render
    const h = _hash(trades);
    if (h !== _lastRenderHash['charts']) {
      _lastRenderHash['charts'] = h;
      try {
        if (typeof renderCharts === 'function') renderCharts(trades);
      } catch(e) {
        console.error('[charts] Render failed:', e.message);
        const err = document.getElementById('charts-render-error');
        if (err) err.classList.remove('hidden');
      }
    }
  }

  const titles = { home: 'WorkStation', dashboard: 'Trading', charts: 'Charts', settings: 'Kernel' };
  $$('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === name));
  $('#view-title').textContent = titles[name] || name;
  currentView = name;
}

// ---- Sync status --------------------------------------------

function updateSyncStatus(ts) {
  const el = $('#sync-status');
  if (!el) return;
  if (!ts) { el.textContent = 'Not synced'; return; }
  const d = new Date(ts);
  el.textContent = `Synced ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function setSyncing(active) {
  syncing = active;
  $('#sync-spinner')?.classList.toggle('hidden', !active);
  if ($('#btn-sync')) $('#btn-sync').disabled = active;
}

// ---- Trade sync ---------------------------------------------

async function loadCached() {
  try {
    trades = await window.polymind.trades.getCached();
    filteredTrades = [...trades];
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderTrades   === 'function') renderTrades();
  } catch(e) {
    console.error('[shell] loadCached failed:', e.message);
  }
}

async function syncTrades() {
  if (syncing) return;
  setSyncing(true);
  const errBar = $('#sync-error-bar');
  errBar?.classList.add('hidden');
  try {
    const result = await window.polymind.trades.sync();
    trades = result.trades;
    filteredTrades = [...trades];
    _lastRenderHash['charts'] = -1; // invalidate charts cache
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderTrades   === 'function') renderTrades();
    if (typeof applyFilter    === 'function') applyFilter($('#trades-search')?.value);
    updateSyncStatus(result.lastSyncedAt);
  } catch (err) {
    const msg = `Sync failed: ${err.message || 'Unknown error'}`;
    console.error('[trades] Sync failed:', err.message);
    if (errBar) { errBar.textContent = msg; errBar.classList.remove('hidden'); }
  } finally {
    setSyncing(false);
  }
}

// ---- Balance sync -------------------------------------------

function updateBalanceStat(value) {
  currentBalance = value;
  const fmt = value != null
    ? `€${Number(value).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';
  const statEl = document.getElementById('stat-balance');
  if (statEl) statEl.textContent = fmt;
  const chartsEl = document.getElementById('charts-balance');
  if (chartsEl) chartsEl.textContent = fmt;
}

async function loadCachedBalance() {
  try {
    const { balance } = await window.polymind.balance.getCached();
    updateBalanceStat(balance);
  } catch(e) {
    console.warn('[balance] Cache load failed:', e.message);
  }
}

async function syncBalance() {
  const btn = document.getElementById('btn-balance-sync');
  if (btn) btn.disabled = true;
  try {
    const { balance } = await window.polymind.balance.sync();
    updateBalanceStat(balance);
    _lastRenderHash['charts'] = -1; // invalidate so charts re-render with new balance
    if (typeof renderCharts === 'function') renderCharts(trades);
  } catch(e) {
    console.error('[balance] Sync failed:', e.message);
    const el = document.getElementById('charts-balance');
    if (el) el.textContent = 'Sync failed';
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---- Auth ---------------------------------------------------

async function handleLogin() {
  const email = $('#login-email').value.trim();
  const pw    = $('#login-password').value;
  clearBanners($('#login-error'));

  if (!email || !pw) {
    showBanner($('#login-error'), 'Enter your email and password.');
    return;
  }

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
      await loadCachedBalance();
      updateSyncStatus(config.lastSyncedAt);
      showView('home');
    }
  } finally {
    $('#login-spinner').classList.add('hidden');
    $('#btn-login').disabled = false;
  }
}

async function handleNotionConnect() {
  if (connecting) return;
  clearBanners($('#setup-error'), $('#setup-success'));

  const notionToken = $('#setup-token').value.trim();
  const databaseId  = $('#setup-database').value.trim();

  if (!notionToken || !databaseId) {
    showBanner($('#setup-error'), 'Both fields are required.');
    return;
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
    showView('home');
    await syncTrades();
  } catch (err) {
    showBanner($('#setup-error'), err.message || 'Connection failed.');
  } finally {
    connecting = false;
    $('#connect-spinner').classList.add('hidden');
    $('#btn-test-connect').disabled = false;
  }
}

// ---- Settings -----------------------------------------------

async function handleSettingsSave() {
  clearBanners($('#settings-error'), $('#settings-success'));
  const payload = {
    databaseId:  $('#settings-database').value.trim(),
    habitsDbId:  $('#settings-habits-db').value.trim(),
    goalsDbId:   $('#settings-goals-db').value.trim(),
    balanceDbId: $('#settings-balance-db').value.trim(),
  };
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
      databaseId:  $('#settings-database').value.trim(),
    });
    showBanner($('#settings-success'), `✓ Connected to "${r.title}"`);
    $('#settings-success').classList.remove('hidden');
  } catch (err) {
    showBanner($('#settings-error'), err.message);
  }
}

function handleDisconnect() {
  const btn = document.getElementById('btn-disconnect');
  if (!btn) return;
  if (btn.dataset.confirm !== 'pending') {
    btn.dataset.confirm = 'pending';
    btn.textContent = 'Sure? Click again';
    setTimeout(() => {
      if (btn.dataset.confirm === 'pending') {
        btn.dataset.confirm = '';
        btn.textContent = 'Disconnect Notion';
      }
    }, 3000);
    return;
  }
  window.polymind.config.set({ setupComplete: false, notionToken: '', databaseId: '' });
  showGate('notion');
}

// ---- Helpers ------------------------------------------------

function setupToggle(btnId, inputId) {
  const btn   = $('#' + btnId);
  const input = $('#' + inputId);
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    input.type = input.type === 'text' ? 'password' : 'text';
  });
}

// ---- Keyboard shortcuts -------------------------------------

function bindShortcuts() {
  document.addEventListener('keydown', (e) => {
    const modalOpen = !$('#trade-modal').classList.contains('hidden');
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

    if (e.key === 'Escape' && modalOpen) {
      closeTradeModal();
      return;
    }

    if (typing || $('#app-shell').classList.contains('hidden')) return;

    if (e.key === 'n' && !e.metaKey && !e.ctrlKey) { openTradeModal(); return; }
    if (e.key === 'r' && !e.metaKey && !e.ctrlKey) { syncTrades();    return; }
    if (e.key === '/') { e.preventDefault(); $('#trades-search')?.focus(); return; }
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      $('#trades-search')?.focus();
      return;
    }
  });
}

// ---- Event binding ------------------------------------------

function bindEvents() {
  // Titlebar
  $('#tb-min')?.addEventListener('click',   () => window.polymind.window.minimize());
  $('#tb-max')?.addEventListener('click',   () => window.polymind.window.maximize());
  $('#tb-close')?.addEventListener('click', () => window.polymind.window.close());

  // Gate
  $('#btn-login').addEventListener('click', handleLogin);
  $('#login-email').addEventListener('keydown',    (e) => e.key === 'Enter' && $('#login-password').focus());
  $('#login-password').addEventListener('keydown', (e) => e.key === 'Enter' && handleLogin());
  $('#btn-goto-token').addEventListener('click',   () => showStep('notion'));
  $('#btn-back-login').addEventListener('click',   () => showStep('login'));
  $('#btn-test-connect').addEventListener('click', handleNotionConnect);
  $('#btn-open-notion').addEventListener('click',  () => window.polymind.openExternal(NOTION_INTEGRATIONS_URL));

  // Nav
  $$('.nav-item').forEach((btn) => btn.addEventListener('click', () => showView(btn.dataset.view)));

  // Topbar
  $('#btn-sync').addEventListener('click',      () => syncTrades());
  $('#btn-new-trade').addEventListener('click', () => openTradeModal());

  // Balance / Charts
  $('#btn-balance-sync')?.addEventListener('click', syncBalance);

  // Modal
  $('#btn-modal-cancel').addEventListener('click', closeTradeModal);
  $('#btn-modal-close').addEventListener('click',  closeTradeModal);
  $('#trade-form').addEventListener('submit', saveTrade);
  $('#trade-modal').addEventListener('click', (e) => {
    if (e.target === $('#trade-modal')) closeTradeModal();
  });

  // Settings
  $('#btn-settings-save').addEventListener('click', handleSettingsSave);
  $('#btn-settings-test').addEventListener('click', handleSettingsTest);
  $('#btn-disconnect').addEventListener('click',    handleDisconnect);

  // Search
  $('#trades-search').addEventListener('input', (e) => applyFilter(e.target.value));

  // Password toggles
  setupToggle('toggle-pw',    'login-password');
  setupToggle('toggle-token', 'setup-token');

  // Calendar
  if (typeof initCalendar === 'function') initCalendar();

  // Shortcuts
  bindShortcuts();
}

// ---- Init ---------------------------------------------------

async function init() {
  // Set login background image
  const artBg = document.getElementById('gate-art-bg');
  if (artBg) artBg.style.backgroundImage = "url('assets/login-bg.jpg')";

  if (typeof initHome === 'function') initHome();
  bindEvents();
  config = await window.polymind.config.get();
  updateSyncStatus(config.lastSyncedAt);
  showGate('login');
}

init();
