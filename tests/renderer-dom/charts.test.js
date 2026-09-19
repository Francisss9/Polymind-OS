'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRendererDom } = require('./dom-harness');

// Same technique as home.test.js: `trades` is a `let` binding at
// app.js's top level, shared across every <script> tag in the same
// jsdom document — a plain reassignment inside an injected <script>
// reaches it; `window.trades = ...` would not.
function setGlobals(window, { trades } = {}) {
  const script = window.document.createElement('script');
  script.textContent = trades !== undefined ? `trades = ${JSON.stringify(trades)};` : '';
  window.document.body.appendChild(script);
}

// charts.js's array literals/spreads (`[...x]`, `.map()`, etc.) execute
// inside jsdom's realm, so the arrays they return have jsdom's Array as
// their prototype — not this test file's own (outer Node) Array.
// assert.deepEqual (strict) treats that prototype mismatch as "not
// equal" even when every element matches, so results read out of a
// chart's config get funneled through Array.from() first to normalize
// them back to a plain, same-realm array before comparing.

test('Equity curve — balance overlay alignment', async (t) => {
  await t.test('Account Balance series has the same length as Cumulative P&L (regression: used to be squeezed into the first N trade-date slots)', () => {
    const { window } = createRendererDom();
    const tradeList = [
      { date: '2026-01-01', pnl: 10 },
      { date: '2026-01-05', pnl: -5 },
      { date: '2026-01-10', pnl: 3 },
      { date: '2026-01-15', pnl: 2 },
      { date: '2026-01-20', pnl: 1 },
    ];
    const balanceHistory = [
      { weekStart: '2026-01-01', balance: 100 },
      { weekStart: '2026-01-12', balance: 120 },
    ];

    window.renderEquityCurve(tradeList, balanceHistory);

    const { datasets } = window.__test.getChartInstances().equity.config.data;
    const pnl = datasets.find(d => d.label === 'Cumulative P&L');
    const bal = datasets.find(d => d.label === 'Account Balance');
    assert.equal(bal.data.length, pnl.data.length, 'one balance point per trade date, not per weekly snapshot');
  });

  await t.test('forward-fills each trade date to its most recent balance snapshot, not the raw array index', () => {
    const { window } = createRendererDom();
    const tradeList = [
      { date: '2026-01-01', pnl: 1 }, // before any snapshot
      { date: '2026-01-05', pnl: 1 }, // >= Jan 1 snapshot, < Jan 12 snapshot
      { date: '2026-01-10', pnl: 1 }, // still < Jan 12
      { date: '2026-01-15', pnl: 1 }, // >= Jan 12 snapshot
      { date: '2026-01-20', pnl: 1 }, // still >= Jan 12 (no later snapshot)
    ];
    const balanceHistory = [
      { weekStart: '2026-01-01', balance: 100 },
      { weekStart: '2026-01-12', balance: 120 },
    ];

    window.renderEquityCurve(tradeList, balanceHistory);

    const bal = window.__test.getChartInstances().equity.config.data.datasets.find(d => d.label === 'Account Balance');
    assert.deepEqual(Array.from(bal.data), [100, 100, 100, 120, 120]);
  });

  await t.test('trade dates before the very first balance snapshot get null, not a wrong value or a crash', () => {
    const { window } = createRendererDom();
    const tradeList = [{ date: '2025-01-01', pnl: 1 }, { date: '2025-06-01', pnl: 1 }];
    const balanceHistory = [{ weekStart: '2026-01-01', balance: 100 }];

    window.renderEquityCurve(tradeList, balanceHistory);

    const bal = window.__test.getChartInstances().equity.config.data.datasets.find(d => d.label === 'Account Balance');
    assert.deepEqual(Array.from(bal.data), [null, null]);
  });

  await t.test('no Account Balance dataset at all when there is no balance history', () => {
    const { window } = createRendererDom();
    window.renderEquityCurve([{ date: '2026-01-01', pnl: 1 }], []);
    const { datasets } = window.__test.getChartInstances().equity.config.data;
    assert.equal(datasets.find(d => d.label === 'Account Balance'), undefined);
  });
});

test('syncBalance() — scoped re-render (regression: used to rebuild every chart, felt like a page reload)', async (t) => {
  await t.test('rebuilds only the equity chart; pnlbars and donut instances are left untouched', async () => {
    const { window, polymind } = createRendererDom();
    const tradeList = [
      { date: '2026-01-01', pnl: 10, result: 'Win' },
      { date: '2026-01-02', pnl: -5, result: 'Loss' },
    ];
    setGlobals(window, { trades: tradeList });

    await window.renderCharts(tradeList);
    // getChartInstances() returns the module's live, mutable object — not
    // a snapshot — so each reference we care about must be pulled out
    // individually right now, before syncBalance() has a chance to swap
    // any of them out.
    const before = window.__test.getChartInstances();
    const equityRefBefore = before.equity;
    const pnlbarsRef = before.pnlbars;
    const donutRef = before.donut;
    assert.ok(pnlbarsRef && donutRef, 'sanity check: both were actually created by the initial render');

    polymind.balance.sync.mockResolvedValue({ balance: 999 });
    polymind.balance.getCached.mockResolvedValue({ history: [] });
    await window.syncBalance();

    const after = window.__test.getChartInstances();
    assert.equal(after.pnlbars, pnlbarsRef, 'same instance — never destroyed or rebuilt');
    assert.equal(after.donut, donutRef, 'same instance — never destroyed or rebuilt');
    assert.equal(pnlbarsRef.destroyed, false);
    assert.equal(donutRef.destroyed, false);
    assert.notEqual(after.equity, equityRefBefore, 'the equity chart is the one that IS expected to rebuild, since balance feeds it');
  });
});
