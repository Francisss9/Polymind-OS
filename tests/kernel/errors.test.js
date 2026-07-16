'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { toUserError } = require('../../kernel/errors');

test('toUserError', async (t) => {
  await t.test('extracts message from a JSON-encoded Notion SDK error body', () => {
    const err = { body: JSON.stringify({ message: 'API token is invalid.' }) };
    const result = toUserError(err, 'fallback');
    assert.equal(result.message, 'API token is invalid.');
    assert.ok(result instanceof Error);
  });

  await t.test('falls back to err.message when body is not JSON', () => {
    const err = { body: 'not json at all', message: 'plain message' };
    assert.equal(toUserError(err, 'fallback').message, 'plain message');
  });

  await t.test('falls back to err.message when there is no body at all', () => {
    const err = new Error('network timeout');
    assert.equal(toUserError(err, 'fallback').message, 'network timeout');
  });

  await t.test('uses the fallback when nothing usable can be extracted', () => {
    assert.equal(toUserError({}, 'fallback message').message, 'fallback message');
    assert.equal(toUserError(null, 'fallback message').message, 'fallback message');
    assert.equal(toUserError(undefined, 'fallback message').message, 'fallback message');
  });

  await t.test('uses the default fallback when none is given', () => {
    assert.equal(toUserError({}).message, 'Something went wrong.');
  });

  await t.test('ignores a JSON body that parses but has no message field', () => {
    const err = { body: JSON.stringify({ code: 'unauthorized' }), message: 'sdk message' };
    assert.equal(toUserError(err, 'fallback').message, 'sdk message');
  });
});
