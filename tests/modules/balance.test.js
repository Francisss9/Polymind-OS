'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { notionPageToBalance } = require('../../modules/balance/schema');

test('notionPageToBalance', async (t) => {
  await t.test('maps a fully-populated weekly entry', () => {
    const page = {
      id: 'week-1',
      properties: {
        Name: { title: [{ plain_text: 'Week 1' }] },
        Date: { date: { start: '2026-01-01', end: '2026-01-07' } },
        'Start Balance': { number: 10000 },
        'End Balance': { number: 10500 },
        'Winning Trades': { number: 4 },
        'Losing Trades': { number: 2 },
        'Goal Met': { checkbox: true },
        Status: { status: { name: 'Complete' } },
      },
    };
    const entry = notionPageToBalance(page);
    assert.equal(entry.name, 'Week 1');
    assert.equal(entry.weekStart, '2026-01-01');
    assert.equal(entry.weekEnd, '2026-01-07');
    assert.equal(entry.startBalance, 10000);
    assert.equal(entry.balance, 10500, 'balance reads from End Balance');
    assert.equal(entry.winningTrades, 4);
    assert.equal(entry.losingTrades, 2);
    assert.equal(entry.goalMet, true);
    assert.equal(entry.status, 'Complete');
  });

  await t.test('balance is null (not 0) when End Balance is unset — used to filter incomplete weeks', () => {
    const entry = notionPageToBalance({ id: 'week-2', properties: {} });
    assert.equal(entry.balance, null);
  });

  await t.test('a zero End Balance is preserved as 0, not treated as unset', () => {
    const page = { id: 'week-3', properties: { 'End Balance': { number: 0 } } };
    assert.equal(notionPageToBalance(page).balance, 0);
  });

  await t.test('goalMet defaults to false when the checkbox property is absent', () => {
    const entry = notionPageToBalance({ id: 'week-4', properties: {} });
    assert.equal(entry.goalMet, false);
  });

  await t.test('handles a missing properties object entirely without throwing', () => {
    assert.doesNotThrow(() => notionPageToBalance({ id: 'week-5' }));
  });
});
