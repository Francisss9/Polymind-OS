'use strict';

// =========================================================
// CHARTS MODULE
// =========================================================
// Uses Chart.js loaded via <script> in index.html (local copy).
// All data comes from the already-cached `trades` array — no
// new Notion queries. Balance history comes from balance:getCached.
// =========================================================

let _chartInstances = {};

function destroyChart(id) {
  if (_chartInstances[id]) {
    _chartInstances[id].destroy();
    delete _chartInstances[id];
  }
}

// ---- Colour helpers ----------------------------------------

const C = {
  text:        getComputedStyle(document.documentElement).getPropertyValue('--text').trim()        || '#ececec',
  muted:       getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim()  || '#4d4f54',
  faint:       getComputedStyle(document.documentElement).getPropertyValue('--text-faint').trim()  || '#2a2b2e',
  border:      getComputedStyle(document.documentElement).getPropertyValue('--border-subtle').trim()|| 'rgba(255,255,255,0.04)',
  surface:     getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()     || '#131416',
  win:  '#c8c8c8',
  loss: '#555759',
  be:   '#3a3b3e',
};

function pnlColor(v) { return v > 0 ? C.win : v < 0 ? C.loss : C.be; }

// ---- Shared Chart.js defaults ------------------------------

function baseOptions(yLabel = '') {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 500, easing: 'easeOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1f2023',
        borderColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        titleColor: '#4d4f54',
        bodyColor: '#ececec',
        padding: 10,
        cornerRadius: 5,
        titleFont: { size: 10, family: 'Inter, sans-serif' },
        bodyFont: { size: 12, family: 'Inter, sans-serif' },
      },
    },
    scales: {
      x: {
        ticks: { color: C.muted, font: { size: 10, family: 'Inter, sans-serif' }, maxRotation: 0 },
        grid:  { color: C.border },
        border:{ color: 'transparent' },
      },
      y: {
        ticks: { color: C.muted, font: { size: 10, family: 'Inter, sans-serif' } },
        grid:  { color: C.border },
        border:{ color: 'transparent' },
        title: yLabel ? { display: true, text: yLabel, color: C.muted, font: { size: 10 } } : undefined,
      },
    },
  };
}

// =========================================================
// 1. EQUITY CURVE
// =========================================================

function renderEquityCurve(tradeList, balanceHistory = []) {
  destroyChart('equity');
  const canvas = document.getElementById('chart-equity');
  if (!canvas || !window.Chart) return;

  const sorted = [...tradeList]
    .filter(t => t.date && typeof t.pnl === 'number')
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!sorted.length) {
    showChartEmpty(canvas, 'No trade data yet');
    return;
  }

  // Cumulative P&L from trades
  let cumulative = 0;
  const labels = [];
  const pnlData = [];
  sorted.forEach(t => {
    cumulative += t.pnl || 0;
    labels.push(fmtChartDate(t.date));
    pnlData.push(parseFloat(cumulative.toFixed(2)));
  });

  const rangeEl = document.getElementById('chart-equity-range');
  if (rangeEl && sorted.length) {
    rangeEl.textContent = `${fmtChartDate(sorted[0].date)} – ${fmtChartDate(sorted[sorted.length - 1].date)}`;
  }

  const finalPnl = pnlData[pnlData.length - 1] || 0;
  const lineColor = finalPnl >= 0 ? C.win : C.loss;

  // Weekly account balance overlay (from Performance Tracker)
  const datasets = [{
    label: 'Cumulative P&L',
    data: pnlData,
    borderColor: lineColor,
    borderWidth: 1.5,
    pointRadius: sorted.length > 30 ? 0 : 3,
    pointHoverRadius: 5,
    pointBackgroundColor: lineColor,
    tension: 0.3,
    fill: true,
    backgroundColor: (ctx) => {
      const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
      gradient.addColorStop(0, finalPnl >= 0 ? 'rgba(200,200,200,0.08)' : 'rgba(85,87,89,0.08)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      return gradient;
    },
    yAxisID: 'y',
  }];

  // Add balance overlay if we have history
  const sortedBalance = [...balanceHistory]
    .filter(b => b.weekStart && b.balance != null)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  if (sortedBalance.length) {
    datasets.push({
      label: 'Account Balance',
      data: sortedBalance.map(b => b.balance),
      borderColor: 'rgba(255,255,255,0.18)',
      borderWidth: 1,
      borderDash: [4, 4],
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.3,
      fill: false,
      yAxisID: 'y2',
      labels: sortedBalance.map(b => fmtChartDate(b.weekStart)),
    });
  }

  _chartInstances['equity'] = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      ...baseOptions('P&L (€)'),
      scales: {
        ...baseOptions().scales,
        y2: sortedBalance.length ? {
          position: 'right',
          ticks: { color: C.faint, font: { size: 9 } },
          grid: { drawOnChartArea: false },
          border: { color: 'transparent' },
          title: { display: true, text: 'Balance (€)', color: C.faint, font: { size: 9 } },
        } : undefined,
      },
      plugins: {
        ...baseOptions().plugins,
        legend: { display: sortedBalance.length > 0, labels: { color: C.muted, font: { size: 10 }, boxWidth: 12 } },
        tooltip: {
          ...baseOptions().plugins.tooltip,
          callbacks: { label: ctx => `${ctx.dataset.label}: €${ctx.parsed.y.toFixed(2)}` },
        },
      },
    },
  });
}

// =========================================================
// 2. P&L BAR CHART
// =========================================================

function renderPnlBars(tradeList) {
  destroyChart('pnlbars');
  const canvas = document.getElementById('chart-pnl-bars');
  if (!canvas || !window.Chart) return;

  const sorted = [...tradeList]
    .filter(t => t.date && typeof t.pnl === 'number')
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!sorted.length) {
    showChartEmpty(canvas, 'No trade data yet');
    return;
  }

  const labels = sorted.map(t => fmtChartDate(t.date));
  const data   = sorted.map(t => parseFloat((t.pnl || 0).toFixed(2)));
  const colors = data.map(v => pnlColor(v));

  _chartInstances['pnlbars'] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderRadius: 2,
        borderSkipped: false,
      }],
    },
    options: {
      ...baseOptions('P&L (€)'),
      plugins: {
        ...baseOptions().plugins,
        tooltip: {
          ...baseOptions().plugins.tooltip,
          callbacks: {
            label: ctx => `€${ctx.parsed.y.toFixed(2)}`,
          },
        },
      },
    },
  });
}

// =========================================================
// 3. WIN / LOSS DONUT
// =========================================================

function renderDonut(tradeList) {
  destroyChart('donut');
  const canvas = document.getElementById('chart-donut');
  const legend = document.getElementById('donut-legend');
  if (!canvas || !window.Chart) return;

  const wins  = tradeList.filter(t => (t.result||'').toLowerCase() === 'win'  || t.pnl > 0).length;
  const losses= tradeList.filter(t => (t.result||'').toLowerCase() === 'loss' || t.pnl < 0).length;
  const bes   = tradeList.filter(t => (t.result||'').toLowerCase() === 'breakeven' || t.pnl === 0).length;
  const total = wins + losses + bes;

  if (!total) {
    if (legend) legend.innerHTML = '';
    showChartEmpty(canvas, 'No trades');
    return;
  }

  const pct = n => total ? Math.round((n / total) * 100) : 0;

  if (legend) {
    legend.innerHTML = `
      <div class="donut-item"><span class="donut-dot" style="background:${C.win}"></span>Win <strong>${pct(wins)}%</strong></div>
      <div class="donut-item"><span class="donut-dot" style="background:${C.loss}"></span>Loss <strong>${pct(losses)}%</strong></div>
      ${bes ? `<div class="donut-item"><span class="donut-dot" style="background:${C.be}"></span>BE <strong>${pct(bes)}%</strong></div>` : ''}
    `;
  }

  _chartInstances['donut'] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Win', 'Loss', 'Breakeven'],
      datasets: [{
        data: [wins, losses, bes],
        backgroundColor: [C.win, C.loss, C.be],
        borderColor: '#0e0f11',
        borderWidth: 3,
        hoverOffset: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      animation: { duration: 600 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1f2023',
          borderColor: 'rgba(255,255,255,0.07)',
          borderWidth: 1,
          bodyColor: '#ececec',
          padding: 10,
          cornerRadius: 5,
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed} trades (${pct(ctx.parsed)}%)`,
          },
        },
      },
    },
  });
}

// =========================================================
// 4. MONTHLY HEATMAP (pure DOM, no Chart.js)
// =========================================================

function renderHeatmap(tradeList) {
  const container = document.getElementById('chart-heatmap');
  if (!container) return;

  if (!tradeList.length) {
    container.innerHTML = '<div class="chart-empty">No trades to map</div>';
    return;
  }

  // Aggregate P&L by month
  const byMonth = {};
  tradeList.forEach(t => {
    if (!t.date) return;
    const key = t.date.slice(0, 7); // YYYY-MM
    byMonth[key] = (byMonth[key] || 0) + (t.pnl || 0);
  });

  // Get date range
  const keys = Object.keys(byMonth).sort();
  if (!keys.length) { container.innerHTML = ''; return; }

  const minKey = keys[0];
  const maxKey = keys[keys.length - 1];
  const [minY, minM] = minKey.split('-').map(Number);
  const [maxY, maxM] = maxKey.split('-').map(Number);

  // Max absolute value for scaling colour intensity
  const maxAbs = Math.max(...Object.values(byMonth).map(Math.abs), 1);

  const months = MONTHS_SHORT;

  let html = '<div class="heatmap-grid">';
  let y = minY, m = minM;
  while (y < maxY || (y === maxY && m <= maxM)) {
    const key = `${y}-${String(m).padStart(2,'0')}`;
    const val = byMonth[key] || 0;
    const intensity = Math.min(Math.abs(val) / maxAbs, 1);
    const isPos = val >= 0;
    const alpha = (0.08 + intensity * 0.55).toFixed(2);
    const bg = val === 0
      ? 'rgba(255,255,255,0.03)'
      : isPos
        ? `rgba(200,200,200,${alpha})`
        : `rgba(85,87,89,${alpha})`;
    const label = val !== 0
      ? `${val > 0 ? '+' : ''}${val.toFixed(1)}`
      : '–';

    html += `
      <div class="heatmap-cell" title="${months[m-1]} ${y}: €${val.toFixed(2)}" style="background:${bg}">
        <span class="heatmap-month">${months[m-1]}</span>
        <span class="heatmap-year">${y}</span>
        <span class="heatmap-val">${label}</span>
      </div>`;

    m++;
    if (m > 12) { m = 1; y++; }
  }
  html += '</div>';
  container.innerHTML = html;
}

// =========================================================
// Helpers
// =========================================================

function fmtChartDate(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  const months = MONTHS_SHORT;
  return `${months[parseInt(m,10)-1]} ${parseInt(d,10)}`;
}

function showChartEmpty(canvas, msg) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.style.display = 'none';
  let empty = canvas.parentNode.querySelector('.chart-empty');
  if (!empty) {
    empty = document.createElement('div');
    empty.className = 'chart-empty';
    canvas.parentNode.appendChild(empty);
  }
  empty.textContent = msg;
  empty.style.display = 'flex';
}

// =========================================================
// ENTRY — called from app.js showView('charts')
// =========================================================

async function renderCharts(tradeList) {
  if (!window.Chart) {
    console.warn('Chart.js not loaded — run npm install then npm start');
    const cards = document.querySelectorAll('.chart-wrap canvas');
    cards.forEach(c => showChartEmpty(c, 'Chart.js not loaded — run npm install'));
    return;
  }

  // Load balance history from cache for equity overlay
  let balanceHistory = [];
  try {
    const cached = await window.polymind.balance.getCached();
    balanceHistory = cached.history || [];
  } catch(e) {
    // Intentionally silent — balance DB is optional. Charts render without it.
    console.warn('[charts] Balance history not available:', e.message);
  }

  renderEquityCurve(tradeList || [], balanceHistory);
  renderPnlBars(tradeList || []);
  renderDonut(tradeList || []);
  renderHeatmap(tradeList || []);
}
