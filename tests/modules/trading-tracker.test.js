'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { tradeToNotionProperties, notionPageToTrade } = require('../../modules/trading-tracker/schema');

test('notionPageToTrade', async (t) => {
  await t.test('maps a fully-populated Notion page', () => {
    const page = {
      id: 'page-1',
      last_edited_time: '2026-01-01T00:00:00.000Z',
      properties: {
        Name: { title: [{ plain_text: 'EURUSD long' }] },
        Date: { date: { start: '2026-01-01' } },
        Pair: { select: { name: 'EURUSD' } },
        Direction: { select: { name: 'Long' } },
        'Entry Price': { number: 1.085 },
        'Exit Price': { number: 1.09 },
        'P&L': { number: 125.5 },
        'R:R': { number: 2.1 },
        Result: { select: { name: 'Win' } },
        Notes: { rich_text: [{ plain_text: 'Clean breakout' }] },
      },
    };

    const trade = notionPageToTrade(page);

    assert.equal(trade.id, 'page-1');
    assert.equal(trade.name, 'EURUSD long');
    assert.equal(trade.date, '2026-01-01');
    assert.equal(trade.pair, 'EURUSD');
    assert.equal(trade.direction, 'Long');
    assert.equal(trade.entryPrice, 1.085);
    assert.equal(trade.exitPrice, 1.09);
    assert.equal(trade.pnl, 125.5);
    assert.equal(trade.rr, 2.1);
    assert.equal(trade.result, 'Win');
    assert.equal(trade.notes, 'Clean breakout');
    assert.equal(trade.lastEdited, '2026-01-01T00:00:00.000Z');
  });

  await t.test('fills in safe defaults for a mostly-empty page', () => {
    const page = { id: 'page-2', properties: {} };
    const trade = notionPageToTrade(page);

    assert.equal(trade.date, null);
    assert.equal(trade.pair, '');
    assert.equal(trade.entryPrice, null);
    assert.equal(trade.pnl, 0, 'pnl defaults to 0, not null, so charts can sum it safely');
    assert.equal(trade.rr, null);
    assert.equal(trade.notes, '');
  });

  await t.test('concatenates multi-block rich_text notes', () => {
    const page = {
      id: 'page-3',
      properties: {
        Notes: { rich_text: [{ plain_text: 'Part one. ' }, { plain_text: 'Part two.' }] },
      },
    };
    assert.equal(notionPageToTrade(page).notes, 'Part one. Part two.');
  });
});

test('tradeToNotionProperties', async (t) => {
  await t.test('omits properties for undefined fields instead of sending nulls', () => {
    const props = tradeToNotionProperties({ pair: 'GBPUSD' });
    assert.ok(!('Date' in props));
    assert.ok(!('Entry Price' in props));
    assert.equal(props.Pair.select.name, 'GBPUSD');
  });

  await t.test('derives a Name from pair + date when name is not given', () => {
    const props = tradeToNotionProperties({ pair: 'GBPUSD', date: '2026-03-01' });
    assert.equal(props.Name.title[0].text.content, 'GBPUSD 2026-03-01');
  });

  await t.test('derives Result from P&L sign when result is not explicitly given', () => {
    assert.equal(tradeToNotionProperties({ pnl: 50 }).Result.select.name, 'Win');
    assert.equal(tradeToNotionProperties({ pnl: -50 }).Result.select.name, 'Loss');
    assert.equal(tradeToNotionProperties({ pnl: 0 }).Result.select.name, 'Breakeven');
  });

  await t.test('an explicit result always wins over the derived one', () => {
    const props = tradeToNotionProperties({ pnl: 50, result: 'Breakeven' });
    assert.equal(props.Result.select.name, 'Breakeven');
  });

  await t.test('a zero entry/exit price is still sent (0 is a valid price, not "unset")', () => {
    const props = tradeToNotionProperties({ entryPrice: 0 });
    assert.ok('Entry Price' in props, 'zero must not be treated as missing');
    assert.equal(props['Entry Price'].number, 0);
  });
});

test('round-trip: notionPageToTrade(pageFromTradeToNotionProperties(trade)) preserves core fields', () => {
  const original = { name: 'USDJPY short', pair: 'USDJPY', date: '2026-05-01', pnl: 30, rr: 1.5, result: 'Win' };
  const props = tradeToNotionProperties(original);

  // Real Notion responses fill in `plain_text` server-side for every
  // title/rich_text block — we only ever send `text.content` when
  // writing. Simulate that so this test reflects an actual API
  // round-trip instead of our own outgoing shape.
  const withPlainText = JSON.parse(JSON.stringify(props), (key, value) => {
    if (value && typeof value === 'object' && value.text?.content !== undefined) {
      return { ...value, plain_text: value.text.content };
    }
    return value;
  });

  const page = { id: 'roundtrip-1', properties: withPlainText };
  const roundTripped = notionPageToTrade(page);

  assert.equal(roundTripped.name, original.name);
  assert.equal(roundTripped.pair, original.pair);
  assert.equal(roundTripped.date, original.date);
  assert.equal(roundTripped.pnl, original.pnl);
  assert.equal(roundTripped.rr, original.rr);
  assert.equal(roundTripped.result, original.result);
});
