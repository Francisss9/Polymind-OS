const Store = require('electron-store');

const store = new Store({ name: 'polymind-os' });

function getConfig() {
  return {
    notionToken:  store.get('notionToken', ''),
    databaseId:   store.get('databaseId', ''),
    habitsDbId:   store.get('habitsDbId', ''),
    goalsDbId:    store.get('goalsDbId', ''),
    balanceDbId:  store.get('balanceDbId', ''),
    setupComplete: store.get('setupComplete', false),
  };
}

function setConfig({ notionToken, databaseId, habitsDbId, goalsDbId, balanceDbId, setupComplete }) {
  if (notionToken  !== undefined) store.set('notionToken', notionToken);
  if (databaseId   !== undefined) store.set('databaseId', databaseId);
  if (habitsDbId   !== undefined) store.set('habitsDbId', habitsDbId);
  if (goalsDbId    !== undefined) store.set('goalsDbId', goalsDbId);
  if (balanceDbId  !== undefined) store.set('balanceDbId', balanceDbId);
  if (setupComplete !== undefined) store.set('setupComplete', setupComplete);
  return getConfig();
}

// ---- Trades ----
function getCachedTrades() { return store.get('trades', []); }
function setCachedTrades(trades) { store.set('trades', trades); }
function getLastSyncedAt() { return store.get('lastSyncedAt', null); }
function setLastSyncedAt(iso) { store.set('lastSyncedAt', iso); }

// ---- Habits ----
function getCachedHabits() { return store.get('habits', []); }
function setCachedHabits(entries) { store.set('habits', entries); }
function getHabitsLastSyncedAt() { return store.get('habitsLastSyncedAt', null); }
function setHabitsLastSyncedAt(iso) { store.set('habitsLastSyncedAt', iso); }

// ---- Saving Goals ----
function getCachedGoals() { return store.get('savingGoals', []); }
function setCachedGoals(goals) { store.set('savingGoals', goals); }
function getGoalsLastSyncedAt() { return store.get('goalsLastSyncedAt', null); }
function setGoalsLastSyncedAt(iso) { store.set('goalsLastSyncedAt', iso); }

// ---- Balance ----
function getCachedBalance() { return store.get('balance', null); }
function setCachedBalance(val) { store.set('balance', val); }
function getBalanceLastSyncedAt() { return store.get('balanceLastSyncedAt', null); }
function setBalanceLastSyncedAt(iso) { store.set('balanceLastSyncedAt', iso); }
function getCachedBalanceHistory() { return store.get('balanceHistory', []); }
function setCachedBalanceHistory(entries) { store.set('balanceHistory', entries); }

module.exports = {
  // Do NOT export raw `store` — use typed accessors below
  getConfig, setConfig,
  getCachedTrades, setCachedTrades, getLastSyncedAt, setLastSyncedAt,
  getCachedHabits, setCachedHabits, getHabitsLastSyncedAt, setHabitsLastSyncedAt,
  getCachedGoals, setCachedGoals, getGoalsLastSyncedAt, setGoalsLastSyncedAt,
  getCachedBalance, setCachedBalance, getBalanceLastSyncedAt, setBalanceLastSyncedAt,
  getCachedBalanceHistory, setCachedBalanceHistory,
};
