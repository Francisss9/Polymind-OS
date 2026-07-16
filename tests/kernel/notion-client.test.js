'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// notion-client.js keeps module-level state (the cached client + its
// token), so each test needs a fresh require of the module to avoid
// bleeding state between tests. Node caches modules by resolved path,
// so we bust the cache manually.
function freshNotionClientModule() {
  const modPath = require.resolve('../../kernel/notion-client');
  delete require.cache[modPath];
  return require(modPath);
}

test('notion-client', async (t) => {
  await t.test('returns null when no token is given', () => {
    const { getNotionClient } = freshNotionClientModule();
    assert.equal(getNotionClient(''), null);
    assert.equal(getNotionClient(undefined), null);
  });

  await t.test('returns the same client instance for repeated calls with the same token', () => {
    const { getNotionClient } = freshNotionClientModule();
    const first = getNotionClient('token-a');
    const second = getNotionClient('token-a');
    assert.equal(first, second, 'should reuse the cached client for an unchanged token');
  });

  await t.test('REGRESSION: rebuilds the client when the token changes, even without an explicit reset', () => {
    // This is the bug that was fixed: the old implementation only ever
    // checked `if (!client)`, so a changed token was silently ignored
    // unless resetNotionClient() was called first. This test fails
    // against that old implementation.
    const { getNotionClient } = freshNotionClientModule();
    const first = getNotionClient('token-a');
    const second = getNotionClient('token-b');
    assert.notEqual(first, second, 'a new token must produce a new client, not the stale one');
  });

  await t.test('resetNotionClient forces a fresh client on the next call', () => {
    const { getNotionClient, resetNotionClient } = freshNotionClientModule();
    const first = getNotionClient('token-a');
    resetNotionClient();
    const second = getNotionClient('token-a');
    assert.notEqual(first, second, 'reset should discard the cached client even for the same token');
  });
});
