'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  toISODate,
  todayISO,
  formatPnl,
  formatDate,
  resultClass,
  escapeHtml,
} = require('../../renderer/js/utils');

test('toISODate', async (t) => {
  await t.test('formats using local time, not UTC', () => {
    const d = new Date(2026, 6, 18); // July 18 2026, local midnight
    assert.equal(toISODate(d), '2026-07-18');
  });

  await t.test('zero-pads single-digit month and day', () => {
    const d = new Date(2026, 0, 5); // Jan 5
    assert.equal(toISODate(d), '2026-01-05');
  });
});

test('todayISO', async (t) => {
  await t.test('matches toISODate(new Date()) format shape', () => {
    assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
  });
});

test('formatPnl', async (t) => {
  await t.test('positive numbers get an explicit + sign', () => {
    assert.equal(formatPnl(42.5), '+42.50');
  });

  await t.test('negative numbers keep their own minus sign, no double sign', () => {
    assert.equal(formatPnl(-12), '-12.00');
  });

  await t.test('zero has no sign prefix', () => {
    assert.equal(formatPnl(0), '0.00');
  });

  await t.test('non-numbers (null, undefined, NaN) render as an em dash', () => {
    assert.equal(formatPnl(null), '—');
    assert.equal(formatPnl(undefined), '—');
    assert.equal(formatPnl('12'), '—'); // string, not number — must not coerce
  });
});

test('formatDate', async (t) => {
  await t.test('truncates a full ISO datetime to just the date', () => {
    assert.equal(formatDate('2026-07-18T09:30:00.000Z'), '2026-07-18');
  });

  await t.test('null/empty input renders as an em dash, never "null" or "undefined"', () => {
    assert.equal(formatDate(null), '—');
    assert.equal(formatDate(''), '—');
  });
});

test('resultClass', async (t) => {
  await t.test('is case-insensitive', () => {
    assert.equal(resultClass('WIN'), 'win');
    assert.equal(resultClass('Loss'), 'loss');
  });

  await t.test('anything that is not exactly win/loss falls back to breakeven', () => {
    assert.equal(resultClass('breakeven'), 'breakeven');
    assert.equal(resultClass(''), 'breakeven');
    assert.equal(resultClass(undefined), 'breakeven');
    assert.equal(resultClass('scratch'), 'breakeven'); // unrecognized value — must not throw or misclassify as a win
  });
});

test('escapeHtml', async (t) => {
  await t.test('escapes all five dangerous characters', () => {
    assert.equal(escapeHtml(`<script>alert("x")&'y'</script>`),
      '&lt;script&gt;alert(&quot;x&quot;)&amp;\'y\'&lt;/script&gt;');
  });

  await t.test('null/undefined become an empty string, not the literal word "null"', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });

  await t.test('numbers and other non-strings are coerced safely', () => {
    assert.equal(escapeHtml(42), '42');
  });

  await t.test('plain text with no special characters passes through unchanged', () => {
    assert.equal(escapeHtml('Trading plan v2'), 'Trading plan v2');
  });
});
