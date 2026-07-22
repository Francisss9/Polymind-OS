'use strict';

// =========================================================
// SHELL MODULE
// Owns: view routing (showView), keyboard shortcuts, wiring
// every DOM event listener to its handler, and app boot
// (init). Gate/auth logic lives in gate.js, sync
// orchestration in sync.js, Kernel settings in settings.js —
// this file only routes and wires, it doesn't implement any
// of those behaviours itself.
// =========================================================

// ---- View switching -------------------------------------------

// Per-view render guard: stores hash of data at last render
const _lastRenderHash = {};

function _hash(data) {
  try { return JSON.stringify(data).length + (data?.length ?? 0); } catch(e) {
    console.warn('[shell] _hash failed:', e.message); return 0;
  }
}

function showView(name) {
  ['home', 'dashboard', 'charts', 'notes', 'settings'].forEach((v) => {
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
    $('#settings-display-name').value = config.displayName || '';
    $('#settings-database').value  = config.databaseId  || '';
    $('#settings-habits-db').value = config.habitsDbId  || '';
    $('#settings-goals-db').value  = config.goalsDbId   || '';
    $('#settings-balance-db').value= config.balanceDbId || '';
    $('#settings-notes-db').value  = config.notesDbId   || '';
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

  const titles = { home: 'WorkStation', dashboard: 'Trading', charts: 'Charts', notes: 'Notes', settings: 'Kernel' };
  $$('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === name));
  $('#view-title').textContent = titles[name] || name;
  currentView = name;
}

// ---- Keyboard shortcuts -----------------------------------------

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
  $('#btn-sync').addEventListener('click', () => bootSync());
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
  $('#btn-disconnect').addEventListener('click', handleDisconnect);

  const logoutBtn = $('#btn-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

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
  const artBg = document.getElementById('gate-art-bg');
  if (artBg) artBg.style.backgroundImage = "url('assets/login-bg.jpg')";

  // Awaited deliberately: both of these have an async cache-load tail
  // (loadCachedHabits/loadCachedGoals inside initHome, getCached inside
  // Notes.init). If bootSync() fired before those resolved, its fresh
  // syncHabits()/syncGoals()/Notes.sync() could render first, then get
  // silently overwritten when the slower stale-cache read finally
  // resolves and re-renders on top of it.
  if (typeof initHome === 'function') await initHome();
  if (typeof Notes !== 'undefined') await Notes.init();
  bindEvents();

  config = await window.polymind.config.get();
  if (typeof updateClock === 'function') updateClock(); // pick up displayName immediately, don't wait for the 10s tick

  // Auto-login: if a session exists and setup is complete, skip the gate entirely
  if (hasActiveSession() && config.setupComplete && config.notionToken && config.databaseId) {
    showApp();
    showView('home');
    bootSync(); // fire-and-forget
    return;
  }

  updateSyncStatus(config.lastSyncedAt);
  showGate('login');
}

init();
