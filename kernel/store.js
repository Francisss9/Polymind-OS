'use strict';

const Store = require('electron-store');

// ---------------------------------------------------------
// createPolymindStore(backingStore)
// ---------------------------------------------------------
// Everything Polymind persists is built as a pure factory over a
// "backing store" — anything with .get(key, default) / .set(key, val).
// electron-store satisfies that shape, so does a plain in-memory Map
// wrapper. This is the one thing in kernel/ that touches disk, so it's
// also the one thing that most needed a seam for testing: previously
// this module was a `new Store(...)` at import time, which meant unit
// tests either needed a real Electron user-data dir or couldn't run at
// all. Now tests/kernel/store.test.js calls createPolymindStore(fakeStore)
// directly and never touches disk, while the app itself still gets the
// exact same default export it always did (see bottom of file).
function createPolymindStore(backingStore) {
  // ---- Config ----

  function getConfig() {
    return {
      notionToken:  backingStore.get('notionToken', ''),
      databaseId:   backingStore.get('databaseId', ''),
      habitsDbId:   backingStore.get('habitsDbId', ''),
      goalsDbId:    backingStore.get('goalsDbId', ''),
      balanceDbId:  backingStore.get('balanceDbId', ''),
      notesDbId:    backingStore.get('notesDbId', ''),
      setupComplete: backingStore.get('setupComplete', false),
    };
  }

  function setConfig({ notionToken, databaseId, habitsDbId, goalsDbId, balanceDbId, notesDbId, setupComplete }) {
    if (notionToken   !== undefined) backingStore.set('notionToken', notionToken);
    if (databaseId    !== undefined) backingStore.set('databaseId', databaseId);
    if (habitsDbId    !== undefined) backingStore.set('habitsDbId', habitsDbId);
    if (goalsDbId     !== undefined) backingStore.set('goalsDbId', goalsDbId);
    if (balanceDbId   !== undefined) backingStore.set('balanceDbId', balanceDbId);
    if (notesDbId     !== undefined) backingStore.set('notesDbId', notesDbId);
    if (setupComplete !== undefined) backingStore.set('setupComplete', setupComplete);
    return getConfig();
  }

  // ---- Cached collections ----
  //
  // Every synced entity (trades, habits, goals, balance) needs the same
  // three things: a cached list/value, a "last synced at" timestamp,
  // and get/set pairs for both. defineCachedResource is the single
  // implementation of that shape — see kernel/store notes from the
  // previous refactor for why this replaced four copy-pasted blocks.

  function defineCachedResource(dataKey, syncedAtKey, defaultValue) {
    return {
      get: () => backingStore.get(dataKey, defaultValue),
      set: (value) => backingStore.set(dataKey, value),
      getSyncedAt: () => backingStore.get(syncedAtKey, null),
      setSyncedAt: (iso) => backingStore.set(syncedAtKey, iso),
    };
  }

  const trades        = defineCachedResource('trades', 'lastSyncedAt', []);
  const habits         = defineCachedResource('habits', 'habitsLastSyncedAt', []);
  const goals          = defineCachedResource('savingGoals', 'goalsLastSyncedAt', []);
  const balance        = defineCachedResource('balance', 'balanceLastSyncedAt', null);
  const balanceHistory = defineCachedResource('balanceHistory', 'balanceLastSyncedAt', []); // shares balance's sync timestamp
  const notes          = defineCachedResource('notes', 'notesLastSyncedAt', []);

  return {
    getConfig, setConfig,

    getCachedTrades: trades.get,               setCachedTrades: trades.set,
    getLastSyncedAt: trades.getSyncedAt,       setLastSyncedAt: trades.setSyncedAt,

    getCachedHabits: habits.get,               setCachedHabits: habits.set,
    getHabitsLastSyncedAt: habits.getSyncedAt, setHabitsLastSyncedAt: habits.setSyncedAt,

    getCachedGoals: goals.get,                 setCachedGoals: goals.set,
    getGoalsLastSyncedAt: goals.getSyncedAt,   setGoalsLastSyncedAt: goals.setSyncedAt,

    getCachedBalance: balance.get,             setCachedBalance: balance.set,
    getBalanceLastSyncedAt: balance.getSyncedAt, setBalanceLastSyncedAt: balance.setSyncedAt,
    getCachedBalanceHistory: balanceHistory.get, setCachedBalanceHistory: balanceHistory.set,

    getCachedNotes: notes.get,                 setCachedNotes: notes.set,
    getNotesLastSyncedAt: notes.getSyncedAt,   setNotesLastSyncedAt: notes.setSyncedAt,
  };
}

// The app's real, disk-backed store. Built lazily — electron-store reads
// Electron's app.getPath() under the hood, which only works once Electron
// has actually started. Building it eagerly at require-time meant this
// module couldn't even be imported from a plain Node test process (to
// reach `createPolymindStore` for testing) without crashing. Lazy build
// means: main.js still gets a store that "just works" on first use, and
// tests can import this file and only ever touch createPolymindStore.
let lazyInstance = null;
function getDefaultStore() {
  if (!lazyInstance) {
    lazyInstance = createPolymindStore(new Store({ name: 'polymind-os' }));
  }
  return lazyInstance;
}

// A Proxy so `require('./kernel/store').getConfig()` etc. keeps working
// exactly as before — nothing outside this file needs to know the
// default store is now built lazily.
module.exports = new Proxy(
  { createPolymindStore },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      return getDefaultStore()[prop];
    },
  }
);
