'use strict';

// =========================================================
// TRADES MODULE
// Owns: table render, trade modal, CRUD, filter, stats.
// Reads `trades` and `filteredTrades` from shared state (app.js).
// All Notion mutations go through window.polymind.trades.*
// =========================================================

// ---- Stats --------------------------------------------------

function updateStats() {
  if (typeof updatePeriodStats === 'function') updatePeriodStats();
}

function fixStatSuffixes() {
  const el = $('#stat-winrate');
  if (!el) return;
  if (el.dataset.suffix && !el.textContent.includes('%') && el.textContent !== '—') {
    el.textContent += '%';
  }
}

// ---- Table render -------------------------------------------

function renderTrades() {
  const tbody = $('#trades-body');
  const empty = $('#trades-empty');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!filteredTrades.length) {
    empty?.classList.remove('hidden');
    updateStats();
    return;
  }
  empty?.classList.add('hidden');

  filteredTrades.forEach((trade, i) => {
    const tr = document.createElement('tr');
    tr.className = 'trade-row-enter';
    tr.style.animationDelay = `${i * 30}ms`;
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
  });

  // Row click → open modal
  tbody.querySelectorAll('tr').forEach((tr, i) => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
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

// ---- Filter -------------------------------------------------

function applyFilter(q) {
  q = (q || '').toLowerCase().trim();
  filteredTrades = q
    ? trades.filter((t) =>
        (t.pair     || '').toLowerCase().includes(q) ||
        (t.result   || '').toLowerCase().includes(q) ||
        (t.direction|| '').toLowerCase().includes(q) ||
        (t.notes    || '').toLowerCase().includes(q))
    : [...trades];
  renderTrades();
  if (typeof renderCalendar === 'function') renderCalendar();
}

// ---- Modal --------------------------------------------------

function openTradeModal(trade = null) {
  $('#modal-title').textContent = trade ? 'Edit trade' : 'New trade';
  $('#trade-id').value          = trade?.id || '';
  $('#trade-date').value        = trade?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  $('#trade-pair').value        = trade?.pair || '';
  $('#trade-direction').value   = trade?.direction || '';
  $('#trade-result').value      = trade?.result || '';
  $('#trade-entry').value       = trade?.entryPrice ?? '';
  $('#trade-exit').value        = trade?.exitPrice  ?? '';
  $('#trade-pnl').value         = trade?.pnl  ?? '';
  $('#trade-rr').value          = trade?.rr   ?? '';
  $('#trade-notes').value       = trade?.notes || '';
  clearBanners($('#trade-error'));

  const modal = $('#trade-modal');
  modal.classList.remove('hidden');
  const box = modal.querySelector('.modal');
  box.classList.remove('modal-enter', 'modal-leave');
  void box.offsetWidth; // reflow to restart animation
  box.classList.add('modal-enter');

  setTimeout(() => {
    const first = modal.querySelector('input:not([type=hidden])') || $('#trade-pair');
    first?.focus();
  }, 50);
}

function closeTradeModal() {
  const modal = $('#trade-modal');
  const box = modal.querySelector('.modal');
  box.classList.remove('modal-enter');
  box.classList.add('modal-leave');
  setTimeout(() => {
    modal.classList.add('hidden');
    box.classList.remove('modal-leave');
    $('#trade-form').reset();
  }, 150);
}

function readTradeForm() {
  const num = (id) => { const v = $(id).value; return v === '' ? null : Number(v); };
  return {
    id:         $('#trade-id').value || undefined,
    date:       $('#trade-date').value,
    pair:       $('#trade-pair').value.trim(),
    direction:  $('#trade-direction').value,
    result:     $('#trade-result').value || undefined,
    entryPrice: num('#trade-entry'),
    exitPrice:  num('#trade-exit'),
    pnl:        num('#trade-pnl') ?? 0,
    rr:         num('#trade-rr'),
    notes:      $('#trade-notes').value.trim(),
  };
}

// ---- CRUD ---------------------------------------------------

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
  // Use a data attribute on the button to require double-click confirmation
  const btn = document.querySelector(`[data-delete="${id}"]`);
  if (!btn) return;
  if (btn.dataset.confirm !== 'pending') {
    btn.dataset.confirm = 'pending';
    btn.textContent = 'Sure?';
    setTimeout(() => {
      if (btn.dataset.confirm === 'pending') {
        btn.dataset.confirm = '';
        btn.textContent = 'Del';
      }
    }, 2500);
    return;
  }
  btn.disabled = true;
  try {
    await window.polymind.trades.delete(id);
    trades = trades.filter((t) => t.id !== id);
    applyFilter($('#trades-search').value);
  } catch (err) {
    console.error('[trades] Delete failed:', err.message);
    showBanner($('#sync-error-bar'), err.message || 'Delete failed');
    btn.disabled = false;
    btn.dataset.confirm = '';
    btn.textContent = 'Del';
  }
}
