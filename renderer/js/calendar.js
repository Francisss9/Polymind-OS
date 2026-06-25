'use strict';

// =========================================================
// CALENDAR VIEW
// =========================================================

let calPeriod = 'daily';
let calOffset = 0; // nav offset (e.g. week index, month index, etc.)

// ---- Helpers ----

function isoDate(d) { return d.toISOString().slice(0,10); }

function startOfWeek(d) {
  const c = new Date(d);
  const day = c.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Mon start
  c.setDate(c.getDate() + diff);
  c.setHours(0,0,0,0);
  return c;
}

function addDays(d, n) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function fmtShort(d) {
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
}

function fmtPnl(v) {
  if (typeof v !== 'number') return '—';
  return (v > 0 ? '+' : '') + v.toFixed(2);
}

function pnlClass(v) { return v > 0 ? 'pos' : v < 0 ? 'neg' : ''; }

function tradesByDate(tradeList) {
  const map = {};
  tradeList.forEach(t => {
    const d = (t.date||'').slice(0,10);
    if (!d) return;
    if (!map[d]) map[d] = [];
    map[d].push(t);
  });
  return map;
}

function sumPnl(arr) { return arr.reduce((s,t) => s + (t.pnl||0), 0); }

function bestTrade(arr) {
  if (!arr.length) return null;
  return arr.reduce((b,t) => (t.pnl||0) > (b.pnl||0) ? t : b, arr[0]);
}

// ---- Period stats ----

function getPeriodTrades() {
  const today = new Date();
  today.setHours(0,0,0,0);

  if (calPeriod === 'daily') {
    // Current week shown (Mon–Sun + offset in weeks)
    const mon = startOfWeek(today);
    mon.setDate(mon.getDate() + calOffset * 7);
    const sun = addDays(mon, 6);
    const monStr = isoDate(mon), sunStr = isoDate(sun);
    return trades.filter(t => {
      const d = (t.date||'').slice(0,10);
      return d >= monStr && d <= sunStr;
    });
  }

  if (calPeriod === 'weekly') {
    // Show a month of weeks (4-5 weeks), offset in months
    const d = new Date(today.getFullYear(), today.getMonth() + calOffset, 1);
    const year = d.getFullYear(), month = d.getMonth();
    return trades.filter(t => {
      const dt = new Date((t.date||'').slice(0,10));
      return dt.getFullYear() === year && dt.getMonth() === month;
    });
  }

  if (calPeriod === 'monthly') {
    // Show a year, offset in years
    const year = today.getFullYear() + calOffset;
    return trades.filter(t => {
      const d = (t.date||'').slice(0,10);
      return d && d.slice(0,4) === String(year);
    });
  }

  if (calPeriod === 'quarterly') {
    // Show a year (4 quarters), offset in years
    const year = today.getFullYear() + calOffset;
    return trades.filter(t => {
      const d = (t.date||'').slice(0,10);
      return d && d.slice(0,4) === String(year);
    });
  }

  return trades;
}

function updatePeriodStats() {
  const src = getPeriodTrades();
  const totalPnl = sumPnl(src);
  const wins = src.filter(t => (t.result||'').toLowerCase() === 'win' || t.pnl > 0).length;
  const winRate = src.length ? Math.round((wins / src.length) * 100) : 0;
  const best = bestTrade(src);

  const pnlEl = document.getElementById('stat-pnl');
  if (pnlEl) {
    pnlEl.textContent = (totalPnl > 0 ? '+' : '') + totalPnl.toFixed(2);
    pnlEl.className = 'value ' + pnlClass(totalPnl);
  }

  const wrEl = document.getElementById('stat-winrate');
  if (wrEl) wrEl.textContent = src.length ? winRate + '%' : '—';

  const cntEl = document.getElementById('stat-count');
  if (cntEl) cntEl.textContent = src.length;

  const bestEl = document.getElementById('stat-best');
  if (bestEl) {
    if (best) {
      bestEl.textContent = (best.pnl > 0 ? '+' : '') + (best.pnl||0).toFixed(2);
      bestEl.className = 'value ' + pnlClass(best.pnl);
    } else {
      bestEl.textContent = '—';
      bestEl.className = 'value';
    }
  }
}

// ---- Trade pill HTML ----

function tradePillHtml(t) {
  const res = (t.result||'').toLowerCase() || (t.pnl > 0 ? 'win' : t.pnl < 0 ? 'loss' : 'breakeven');
  const pnl = fmtPnl(t.pnl);
  const pair = (t.pair||'').replace('/', '');
  return `<div class="cal-trade-pill ${res}" data-edit="${t.id}" title="${t.pair} ${t.direction||''} ${pnl}">
    <span class="cal-trade-pair">${pair}</span>
    <span class="cal-trade-pnl ${pnlClass(t.pnl)}">${pnl}</span>
  </div>`;
}

// ---- DAILY (week grid Mon–Sun) ----

function renderDaily() {
  const today = new Date();
  today.setHours(0,0,0,0);
  const todayStr = isoDate(today);

  const mon = startOfWeek(today);
  mon.setDate(mon.getDate() + calOffset * 7);

  // Calendar title
  const sun = addDays(mon, 6);
  const titleEl = document.getElementById('cal-title');
  if (titleEl) {
    if (mon.getMonth() === sun.getMonth()) {
      titleEl.textContent = mon.toLocaleDateString('en-GB', { month:'long', year:'numeric' });
    } else {
      titleEl.textContent = fmtShort(mon) + ' – ' + fmtShort(sun) + ' ' + sun.getFullYear();
    }
  }

  const byDate = tradesByDate(trades);
  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  let html = '<div class="cal-daily">';
  // Weekday headers
  DAYS.forEach(d => { html += `<div class="cal-weekday-header">${d}</div>`; });

  // 7 day cells
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i);
    const ds = isoDate(d);
    const dayTrades = byDate[ds] || [];
    const isToday = ds === todayStr;
    const classes = ['cal-day', isToday ? 'cal-today' : ''].filter(Boolean).join(' ');

    html += `<div class="${classes}">`;
    html += `<div class="cal-day-num">${d.getDate()}</div>`;

    const MAX = 3;
    dayTrades.slice(0, MAX).forEach(t => { html += tradePillHtml(t); });
    if (dayTrades.length > MAX) {
      html += `<div class="cal-overflow">+${dayTrades.length - MAX} more</div>`;
    }
    html += '</div>';
  }
  html += '</div>';

  return html;
}

// ---- WEEKLY (weeks in a month) ----

function renderWeekly() {
  const today = new Date();
  today.setHours(0,0,0,0);

  const refDate = new Date(today.getFullYear(), today.getMonth() + calOffset, 1);
  const year = refDate.getFullYear(), month = refDate.getMonth();

  const titleEl = document.getElementById('cal-title');
  if (titleEl) titleEl.textContent = refDate.toLocaleDateString('en-GB', { month:'long', year:'numeric' });

  // Collect weeks that overlap this month
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Start from the Monday of the week containing firstDay
  let weekStart = startOfWeek(firstDay);
  const weeks = [];
  while (weekStart <= lastDay) {
    weeks.push(new Date(weekStart));
    weekStart = addDays(weekStart, 7);
  }

  const byDate = tradesByDate(trades);

  let html = '<div class="cal-weekly">';
  weeks.forEach((mon, wi) => {
    const sun = addDays(mon, 6);
    const weekTrades = [];
    for (let i = 0; i < 7; i++) {
      const ds = isoDate(addDays(mon, i));
      (byDate[ds]||[]).forEach(t => weekTrades.push(t));
    }
    const weekPnl = sumPnl(weekTrades);
    const weekNum = wi + 1;

    html += `<div class="cal-week-row">
      <div class="cal-week-label">
        <div class="week-num">Week ${weekNum}</div>
        <div class="week-range">${fmtShort(mon)}–${fmtShort(sun)}</div>
        <div class="week-pnl-val ${pnlClass(weekPnl)}" style="margin-top:4px;font-size:12px;font-weight:600;">${weekTrades.length ? fmtPnl(weekPnl) : '—'}</div>
      </div>
      <div class="cal-week-trades">`;

    if (weekTrades.length === 0) {
      html += `<span style="color:var(--text-muted);font-size:12px;align-self:center;">No trades</span>`;
    } else {
      weekTrades.forEach(t => { html += tradePillHtml(t); });
    }
    html += `</div></div>`;
  });
  html += '</div>';
  return html;
}

// ---- MONTHLY (months in a year) ----

function renderMonthly() {
  const today = new Date();
  const year = today.getFullYear() + calOffset;

  const titleEl = document.getElementById('cal-title');
  if (titleEl) titleEl.textContent = String(year);

  const byDate = tradesByDate(trades);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  let html = '<div class="cal-monthly">';
  for (let m = 0; m < 12; m++) {
    const monthTrades = [];
    const daysInMonth = new Date(year, m+1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      (byDate[ds]||[]).forEach(t => monthTrades.push(t));
    }
    const monthPnl = sumPnl(monthTrades);
    const isFuture = (year > today.getFullYear()) || (year === today.getFullYear() && m > today.getMonth());

    html += `<div class="cal-month-row" ${isFuture ? 'style="opacity:0.4"' : ''}>
      <div class="cal-month-label">
        <div class="month-name">${MONTHS[m]}</div>
        <div class="month-pnl ${pnlClass(monthPnl)}">${monthTrades.length ? fmtPnl(monthPnl) : '—'}</div>
      </div>
      <div class="cal-month-trades">`;
    if (monthTrades.length === 0) {
      html += `<span style="color:var(--text-muted);font-size:11px;align-self:center;">${isFuture ? '' : 'No trades'}</span>`;
    } else {
      const MAX = 8;
      monthTrades.slice(0, MAX).forEach(t => { html += tradePillHtml(t); });
      if (monthTrades.length > MAX) {
        html += `<div class="cal-overflow">+${monthTrades.length - MAX} more</div>`;
      }
    }
    html += `</div></div>`;
  }
  html += '</div>';
  return html;
}

// ---- QUARTERLY ----

function renderQuarterly() {
  const today = new Date();
  const year = today.getFullYear() + calOffset;

  const titleEl = document.getElementById('cal-title');
  if (titleEl) titleEl.textContent = String(year);

  const byDate = tradesByDate(trades);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const QUARTERS = [
    { name:'Q1', months:[0,1,2] },
    { name:'Q2', months:[3,4,5] },
    { name:'Q3', months:[6,7,8] },
    { name:'Q4', months:[9,10,11] },
  ];

  // Find max abs pnl per month for bar scaling
  const monthPnls = [];
  for (let m = 0; m < 12; m++) {
    const daysInMonth = new Date(year, m+1, 0).getDate();
    const mt = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      (byDate[ds]||[]).forEach(t => mt.push(t));
    }
    monthPnls.push({ pnl: sumPnl(mt), count: mt.length });
  }
  const maxAbs = Math.max(...monthPnls.map(mp => Math.abs(mp.pnl)), 1);

  let html = '<div class="cal-quarterly">';
  QUARTERS.forEach(q => {
    const qTrades = [];
    q.months.forEach(m => {
      const daysInMonth = new Date(year, m+1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = `${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        (byDate[ds]||[]).forEach(t => qTrades.push(t));
      }
    });
    const qPnl = sumPnl(qTrades);
    const isFutureQ = q.months[0] > today.getMonth() && year === today.getFullYear();

    html += `<div class="cal-quarter-row" ${isFutureQ && year === today.getFullYear() ? 'style="opacity:0.4"' : ''}>
      <div class="cal-quarter-label">
        <div class="q-name">${q.name} ${year}</div>
        <div class="q-pnl ${pnlClass(qPnl)}">${qTrades.length ? fmtPnl(qPnl) : '—'}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${qTrades.length} trade${qTrades.length===1?'':'s'}</div>
      </div>
      <div class="cal-quarter-months">`;

    q.months.forEach(m => {
      const mp = monthPnls[m];
      const barPct = maxAbs > 0 ? Math.round((Math.abs(mp.pnl) / maxAbs) * 100) : 0;
      html += `<div class="cal-q-month-row">
        <span class="q-month-name">${MONTHS[m]}</span>
        <div class="q-month-bar-wrap">
          <div class="q-month-bar ${mp.pnl < 0 ? 'neg' : ''}" style="width:${barPct}%"></div>
        </div>
        <span class="q-month-pnl ${pnlClass(mp.pnl)}">${mp.count ? fmtPnl(mp.pnl) : '—'}</span>
        <span class="q-month-trades">${mp.count} trade${mp.count===1?'':'s'}</span>
      </div>`;
    });

    html += `</div></div>`;
  });
  html += '</div>';
  return html;
}

// ---- Main render ----

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const empty = document.getElementById('trades-empty');
  if (!grid) return;

  updatePeriodStats();

  let html = '';
  if (calPeriod === 'daily') html = renderDaily();
  else if (calPeriod === 'weekly') html = renderWeekly();
  else if (calPeriod === 'monthly') html = renderMonthly();
  else if (calPeriod === 'quarterly') html = renderQuarterly();

  grid.innerHTML = html;

  // Show/hide empty state
  const periodTrades = getPeriodTrades();
  if (empty) empty.classList.toggle('hidden', periodTrades.length > 0 || calPeriod === 'monthly' || calPeriod === 'quarterly');

  // Bind trade pill clicks → open modal
  grid.querySelectorAll('[data-edit]').forEach(el => {
    el.addEventListener('click', () => {
      const t = trades.find(t => t.id === el.dataset.edit);
      if (t) openTradeModal(t);
    });
  });
}

function initCalendar() {
  // Period tabs
  document.querySelectorAll('.period-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      calPeriod = btn.dataset.period;
      calOffset = 0;
      document.querySelectorAll('.period-tab').forEach(b => b.classList.toggle('active', b === btn));
      renderCalendar();
    });
  });

  // Nav arrows
  const prev = document.getElementById('cal-prev');
  const next = document.getElementById('cal-next');
  if (prev) prev.addEventListener('click', () => { calOffset--; renderCalendar(); });
  if (next) next.addEventListener('click', () => { calOffset++; renderCalendar(); });
}
