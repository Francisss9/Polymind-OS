'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDatabaseId } = require('../../kernel/utils');

test('normalizeDatabaseId', async (t) => {
  await t.test('extracts a bare 32-char hex id unchanged', () => {
    const id = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
    assert.equal(normalizeDatabaseId(id), id);
  });

  await t.test('strips dashes from a UUID-formatted id', () => {
    const dashed = 'a1b2c3d4-e5f6-a1b2-c3d4-e5f6a1b2c3d4';
    assert.equal(normalizeDatabaseId(dashed), 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4');
  });

  await t.test('extracts the id out of a full Notion URL', () => {
    const url = 'https://www.notion.so/myworkspace/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4?v=xyz';
    assert.equal(normalizeDatabaseId(url), 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4');
  });

  await t.test('returns empty string for null/undefined/empty input', () => {
    assert.equal(normalizeDatabaseId(null), '');
    assert.equal(normalizeDatabaseId(undefined), '');
    assert.equal(normalizeDatabaseId(''), '');
  });

  await t.test('returns empty string for non-string input', () => {
    assert.equal(normalizeDatabaseId(12345), '');
  });

  await t.test('falls back to dash-stripping when no 32-char hex run is found', () => {
    // Deliberately garbage input — should not throw, just best-effort clean it
    assert.equal(normalizeDatabaseId('not-a-real-id'), 'notarealid');
  });
});
