'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { wrapWithEncryption } = require('../../kernel/secure-store');
const { createFakeBackingStore } = require('../helpers/fake-backing-store');
const { createFakeCipher } = require('../helpers/fake-cipher');

test('wrapWithEncryption', async (t) => {
  await t.test('a sensitive key is stored encrypted, not as plaintext', () => {
    const backing = createFakeBackingStore();
    const store = wrapWithEncryption(backing, createFakeCipher(), ['notionToken']);

    store.set('notionToken', 'secret_abc123');

    assert.notEqual(backing._dump().notionToken, 'secret_abc123');
    assert.match(backing._dump().notionToken, /^ENC:/);
  });

  await t.test('reading a sensitive key transparently decrypts it back to the original', () => {
    const backing = createFakeBackingStore();
    const store = wrapWithEncryption(backing, createFakeCipher(), ['notionToken']);

    store.set('notionToken', 'secret_abc123');

    assert.equal(store.get('notionToken'), 'secret_abc123');
  });

  await t.test('non-sensitive keys pass through untouched', () => {
    const backing = createFakeBackingStore();
    const store = wrapWithEncryption(backing, createFakeCipher(), ['notionToken']);

    store.set('databaseId', 'db-123');

    assert.equal(backing._dump().databaseId, 'db-123'); // never encrypted
    assert.equal(store.get('databaseId'), 'db-123');
  });

  await t.test('an empty/undefined sensitive value is never encrypted (nothing to protect)', () => {
    const backing = createFakeBackingStore();
    const store = wrapWithEncryption(backing, createFakeCipher(), ['notionToken']);

    store.set('notionToken', '');

    assert.equal(backing._dump().notionToken, '');
  });

  await t.test('migration: a pre-existing plaintext value (written before encryption existed) is returned as-is instead of crashing', () => {
    const backing = createFakeBackingStore({ notionToken: 'legacy_plaintext_token' });
    const store = wrapWithEncryption(backing, createFakeCipher(), ['notionToken']);

    assert.equal(store.get('notionToken'), 'legacy_plaintext_token');
  });

  await t.test('migration: writing after a legacy read encrypts it going forward', () => {
    const backing = createFakeBackingStore({ notionToken: 'legacy_plaintext_token' });
    const store = wrapWithEncryption(backing, createFakeCipher(), ['notionToken']);

    const value = store.get('notionToken');
    store.set('notionToken', value); // simulate re-save, e.g. on next settings save

    assert.match(backing._dump().notionToken, /^ENC:/);
    assert.equal(store.get('notionToken'), 'legacy_plaintext_token');
  });

  await t.test('when the cipher is unavailable (e.g. no OS keyring), falls back to plaintext instead of crashing', () => {
    const backing = createFakeBackingStore();
    const store = wrapWithEncryption(backing, createFakeCipher({ available: false }), ['notionToken']);

    store.set('notionToken', 'secret_abc123');

    assert.equal(backing._dump().notionToken, 'secret_abc123'); // stored as plain text
    assert.equal(store.get('notionToken'), 'secret_abc123');    // still readable
  });

  await t.test('default value passthrough works for unset sensitive keys', () => {
    const backing = createFakeBackingStore();
    const store = wrapWithEncryption(backing, createFakeCipher(), ['notionToken']);

    assert.equal(store.get('notionToken', ''), '');
  });
});
