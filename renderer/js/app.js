const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const NOTION_INTEGRATIONS_URL = 'https://www.notion.so/my-integrations';

let trades = [];
let config = {};
let syncing = false;
let connecting = false;

const views = {
  dashboard: $('#view-dashboard'),
  settings: $('#view-settings'),
};

function showError(el, message) {
  if (!message) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.textContent = message;
  el.classList.remove('hidden');
}

function showGate() {
  $('#gate').classList.remove('hidden');
  $('#app-shell').classList.add('hidden');
}

function showApp() {
  $('#gate').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
}

function formatPnl(value) {
  if (typeof value !== 'number') return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

function resultClass(result) {
  const r = (result || '').toLowerCase();
  if (r === 'win') return 'win';
  if (r === 'loss') return 'loss';
  return 'breakeven';
}

function updateStats() {
  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const wins = trades.filter((t) => (t.result || '').toLowerCase() === 'win' || t.pnl > 0).length;
  const winRate = trades.length ? Math.round((wins / trades.length) * 100) : 0;
  const rrValues = trades.map((t) => t.rr).filter((v) => typeof v === 'number');
  const avgRr = rrValues.length ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : null;

  const pnlEl = $('#stat-pnl');
  pnlEl.textContent = formatPnl(totalPnl);
  pnlEl.className = `value ${totalPnl > 0 ? 'positive' : totalPnl < 0 ? 'negative' : ''}`;

  $('#stat-winrate').textContent = trades.length ? `${winRate}%` : '—';
  $('#stat-count').textContent = String(trades.length);
  $('#stat-rr').textContent = avgRr != null ? avgRr.toFixed(2) : '—';
  $('#trades-count-label').textContent = `${trades.length} trade${trades.length === 1 ? '' : 's'}`;
}

function renderTrades() {
  const tbody = $('#trades-body');
  const empty = $('#trades-empty');
  tbody.innerHTML = '';

  if (!trades.length) {
    empty.classList.remove('hidden');
    updateStats();
    return;
  }

  empty.classList.add('hidden');

  trades.forEach((trade) => {
    const tr = document.createElement('tr');
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
          <button class="btn btn-danger" data-delete="${trade.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openTradeModal(trades.find((t) => t.id === btn.dataset.edit)));
  });

  tbody.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => deleteTrade(btn.dataset.delete));
  });

  updateStats();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function updateSyncStatus(lastSyncedAt) {
  const el = $('#sync-status');
  if (!lastSyncedAt) {
    el.textContent = 'Not synced';
    return;
  }
  const d = new Date(lastSyncedAt);
  el.textContent = `Synced ${d.toLocaleString()}`;
}

function setSyncing(active) {
  syncing = active;
  $('#sync-spinner').classList.toggle('hidden', !active);
  $('#btn-sync').disabled = active;
}

function setConnecting(active) {
  connecting = active;
  $('#connect-spinner').classList.toggle('hidden', !active);
  const btn = $('#setup-form').querySelector('.btn-connect');
  if (btn) btn.disabled = active;
}

async function loadCached() {
  trades = await window.polymind.trades.getCached();
  renderTrades();
}

async function syncTrades() {
  if (syncing) return;
  setSyncing(true);
  try {
    const result = await window.polymind.trades.sync();
    trades = result.trades;
    updateSyncStatus(result.lastSyncedAt);
    renderTrades();
    return result;
  } catch (err) {
    throw err;
  } finally {
    setSyncing(false);
  }
}

function showView(name) {
  views.dashboard.classList.toggle('hidden', name !== 'dashboard');
  views.settings.classList.toggle('hidden', name !== 'settings');

  if (name === 'settings') {
    $('#settings-database').value = config.databaseId || '';
  }

  $$('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === name);
  });

  $('#view-title').textContent = name === 'settings' ? 'Kernel' : 'Trading Tracker';
}

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
  showError($('#trade-error'), null);
  $('#trade-modal').classList.remove('hidden');
}

function closeTradeModal() {
  $('#trade-modal').classList.add('hidden');
  $('#trade-form').reset();
}

function readTradeForm() {
  const num = (id) => {
    const v = $(id).value;
    return v === '' ? null : Number(v);
  };

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
  showError($('#trade-error'), null);
  $('#btn-modal-save').disabled = true;

  try {
    if (trade.id) {
      const updated = await window.polymind.trades.update(trade);
      trades = trades.map((t) => (t.id === updated.id ? updated : t));
    } else {
      const created = await window.polymind.trades.create(trade);
      trades.unshift(created);
    }
    renderTrades();
    closeTradeModal();
  } catch (err) {
    showError($('#trade-error'), err.message || 'Failed to save');
  } finally {
    $('#btn-modal-save').disabled = false;
  }
}

async function deleteTrade(id) {
  if (!confirm('Archive this trade in Notion?')) return;
  try {
    await window.polymind.trades.delete(id);
    trades = trades.filter((t) => t.id !== id);
    renderTrades();
  } catch (err) {
    alert(err.message || 'Delete failed');
  }
}

async function handleSetup(e) {
  e.preventDefault();
  if (connecting) return;
  showError($('#setup-error'), null);

  const notionToken = $('#setup-token').value.trim();
  const databaseId = $('#setup-database').value.trim().replace(/-/g, '');

  setConnecting(true);
  try {
    await window.polymind.config.set({ notionToken, databaseId, setupComplete: true });
    config = await window.polymind.config.get();
    await syncTrades();
    showApp();
    showView('dashboard');
  } catch (err) {
    showError($('#setup-error'), err.message || 'Connection failed. Check token and database ID.');
  } finally {
    setConnecting(false);
  }
}

async function handleSettings(e) {
  e.preventDefault();
  showError($('#settings-error'), null);

  const payload = { databaseId: $('#settings-database').value.trim().replace(/-/g, '') };
  const token = $('#settings-token').value.trim();
  if (token) payload.notionToken = token;

  try {
    config = await window.polymind.config.set(payload);
    $('#settings-token').value = '';
  } catch (err) {
    showError($('#settings-error'), err.message || 'Save failed');
  }
}

function openNotionIntegrations() {
  window.polymind.openExternal(NOTION_INTEGRATIONS_URL);
}

function bindEvents() {
  $$('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  $('#btn-sync').addEventListener('click', () => syncTrades().catch((err) => alert(err.message || 'Sync failed')));
  $('#btn-new-trade').addEventListener('click', () => openTradeModal());
  $('#btn-modal-cancel').addEventListener('click', closeTradeModal);
  $('#trade-form').addEventListener('submit', saveTrade);
  $('#setup-form').addEventListener('submit', handleSetup);
  $('#settings-form').addEventListener('submit', handleSettings);
  $('#btn-open-notion').addEventListener('click', openNotionIntegrations);
  $('#btn-create-integration').addEventListener('click', openNotionIntegrations);

  $('#trade-modal').addEventListener('click', (e) => {
    if (e.target === $('#trade-modal')) closeTradeModal();
  });
}

async function init() {
  bindEvents();
  config = await window.polymind.config.get();
  updateSyncStatus(config.lastSyncedAt);

  const needsSetup = !config.setupComplete || !config.notionToken || !config.databaseId;
  if (needsSetup) {
    showGate();
  } else {
    showApp();
    await loadCached();
    showView('dashboard');
  }
}

init();
