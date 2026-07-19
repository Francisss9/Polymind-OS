'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPolymindStore } = require('../../kernel/store');
const { createFakeBackingStore } = require('../helpers/fake-backing-store');

test('store: config', async (t) => {
  await t.test('getConfig returns defaults when nothing has been set', () => {
    const store = createPolymindStore(createFakeBackingStore());
    assert.deepEqual(store.getConfig(), {
      notionToken: '',
      databaseId: '',
      habitsDbId: '',
      goalsDbId: '',
      balanceDbId: '',
      notesDbId: '',
      setupComplete: false,
    });
  });

  await t.test('setConfig only writes fields that are provided (partial update)', () => {
    const store = createPolymindStore(createFakeBackingStore());
    store.setConfig({ notionToken: 'secret-token' });
    const config = store.getConfig();
    assert.equal(config.notionToken, 'secret-token');
    assert.equal(config.databaseId, ''); // untouched, still default
  });

  await t.test('setConfig returns the full updated config', () => {
    const store = createPolymindStore(createFakeBackingStore());
    const result = store.setConfig({ databaseId: 'db-123', setupComplete: true });
    assert.equal(result.databaseId, 'db-123');
    assert.equal(result.setupComplete, true);
  });

  await t.test('setConfig ignores undefined fields but allows explicit falsy overwrites', () => {
    const store = createPolymindStore(createFakeBackingStore({ setupComplete: true }));
    store.setConfig({ setupComplete: false }); // explicit false must stick
    assert.equal(store.getConfig().setupComplete, false);
  });
});

test('store: cached collections', async (t) => {
  await t.test('trades cache defaults to an empty array', () => {
    const store = createPolymindStore(createFakeBackingStore());
    assert.deepEqual(store.getCachedTrades(), []);
  });

  await t.test('setCachedTrades/getCachedTrades round-trip', () => {
    const store = createPolymindStore(createFakeBackingStore());
    const trades = [{ id: 't1', pnl: 42 }];
    store.setCachedTrades(trades);
    assert.deepEqual(store.getCachedTrades(), trades);
  });

  await t.test('each collection has an independent last-synced timestamp', () => {
    const store = createPolymindStore(createFakeBackingStore());
    store.setLastSyncedAt('2026-01-01T00:00:00.000Z');
    store.setHabitsLastSyncedAt('2026-02-02T00:00:00.000Z');

    assert.equal(store.getLastSyncedAt(), '2026-01-01T00:00:00.000Z');
    assert.equal(store.getHabitsLastSyncedAt(), '2026-02-02T00:00:00.000Z');
  });

  await t.test('balance cache defaults to null, not an empty array/object', () => {
    const store = createPolymindStore(createFakeBackingStore());
    assert.equal(store.getCachedBalance(), null);
  });

  await t.test('balance and balanceHistory are independently readable/writable', () => {
    const store = createPolymindStore(createFakeBackingStore());
    store.setCachedBalance(1000);
    store.setCachedBalanceHistory([{ id: 'w1', balance: 1000 }]);

    assert.equal(store.getCachedBalance(), 1000);
    assert.equal(store.getCachedBalanceHistory().length, 1);
  });

  await t.test('does not leak state between two separately-created stores', () => {
    const storeA = createPolymindStore(createFakeBackingStore());
    const storeB = createPolymindStore(createFakeBackingStore());

    storeA.setCachedGoals([{ id: 'g1' }]);

    assert.equal(storeA.getCachedGoals().length, 1);
    assert.equal(storeB.getCachedGoals().length, 0);
  });

  await t.test('notes cache defaults to an empty array, with its own synced timestamp', () => {
    const store = createPolymindStore(createFakeBackingStore());
    assert.deepEqual(store.getCachedNotes(), []);
    assert.equal(store.getNotesLastSyncedAt(), null);
  });

  await t.test('setCachedNotes/getCachedNotes round-trip', () => {
    const store = createPolymindStore(createFakeBackingStore());
    const notes = [{ id: 'n1', title: 'Test' }];
    store.setCachedNotes(notes);
    assert.deepEqual(store.getCachedNotes(), notes);
  });
});
