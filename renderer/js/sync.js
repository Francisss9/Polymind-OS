'use strict';

// =========================================================
// SYNC MODULE
// Owns: pulling data from Notion into local cache/state for
// every synced collection (trades, balance), plus the single
// bootSync() entry point that fans out to every configured
// database in parallel. Habits/goals/notes each sync
// themselves via their own module — this file only owns the
// two collections that live directly on the shell (trades,
// balance) and the top-level orchestrator.
// =========================================================

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

// ---- Boot sync ----------------------------------------------
// Called once after login/auto-login.
// 1. Load all caches instantly (no network).
// 2. Fire all configured DB syncs in parallel, silently skipping
//    any DB that isn't configured yet. Never crashes the app.

async function bootSync() {
  await loadCached();
  await loadCachedBalance();

  const cfg = await window.polymind.config.get();
  const syncs = [];

  // Each of these calls the same higher-level function the module's own
  // sync button uses — not the raw IPC directly — so the on-screen
  // widget actually re-renders once the sync completes, instead of only
  // updating the background cache with no visible change.
  if (cfg.databaseId)  syncs.push(syncTrades().catch((e) => console.warn('[boot] trades:', e.message)));
  if (cfg.balanceDbId) syncs.push(syncBalance().catch((e) => console.warn('[boot] balance:', e.message)));
  if (cfg.habitsDbId && typeof syncHabits === 'function') {
    syncs.push(syncHabits().catch((e) => console.warn('[boot] habits:', e.message)));
  }
  if (cfg.goalsDbId && typeof syncGoals === 'function') {
    syncs.push(syncGoals().catch((e) => console.warn('[boot] goals:', e.message)));
  }
  if (cfg.notesDbId && typeof Notes !== 'undefined') {
    syncs.push(Notes.sync().catch((e) => console.warn('[boot] notes:', e.message)));
  }

  await Promise.allSettled(syncs);
}
