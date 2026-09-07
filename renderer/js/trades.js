'use strict';

// =========================================================
// TRADES MODULE
// Owns: trade modal + CRUD. Reads `trades` from shared state
// (app.js). All Notion mutations go through window.polymind.trades.*
// =========================================================

// Trading view is calendar-based (see calendar.js / renderCalendar()) —
// there used to be a plain table + text-search UI here too, but it was
// removed from index.html at some point and this file never got
// cleaned up after it. renderTrades()/applyFilter()/filteredTrades were
// dead code: renderTrades() targeted a #trades-body element that no
// longer exists, and calendar.js's getPeriodTrades() reads straight
// from `trades`, never from filteredTrades. updateStats()/
// fixStatSuffixes() were already unreachable before this cleanup too —
// they were only ever called from inside the dead renderTrades().
// Removed together; see saveTrade()/deleteTrade() below for the one
// live behaviour applyFilter() was quietly also responsible for
// (refreshing the calendar after a CRUD op) — that's now a direct,
// explicit call.

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
    if (typeof renderCalendar === 'function') renderCalendar();
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
    if (typeof renderCalendar === 'function') renderCalendar();
  } catch (err) {
    console.error('[trades] Delete failed:', err.message);
    showBanner($('#sync-error-bar'), err.message || 'Delete failed');
    btn.disabled = false;
    btn.dataset.confirm = '';
    btn.textContent = 'Del';
  }
}
