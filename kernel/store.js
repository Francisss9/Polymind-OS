const Store = require('electron-store');

const store = new Store({ name: 'polymind-os' });

function getConfig() {
  return {
    notionToken: store.get('notionToken', ''),
    databaseId: store.get('databaseId', ''),
    habitsDbId: store.get('habitsDbId', ''),
    goalsDbId: store.get('goalsDbId', ''),
    setupComplete: store.get('setupComplete', false),
  };
}

function setConfig({ notionToken, databaseId, habitsDbId, goalsDbId, setupComplete }) {
  if (notionToken !== undefined) store.set('notionToken', notionToken);
  if (databaseId !== undefined) store.set('databaseId', databaseId);
  if (habitsDbId !== undefined) store.set('habitsDbId', habitsDbId);
  if (goalsDbId !== undefined) store.set('goalsDbId', goalsDbId);
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

module.exports = {
  store,
  getConfig, setConfig,
  getCachedTrades, setCachedTrades, getLastSyncedAt, setLastSyncedAt,
  getCachedHabits, setCachedHabits, getHabitsLastSyncedAt, setHabitsLastSyncedAt,
  getCachedGoals, setCachedGoals, getGoalsLastSyncedAt, setGoalsLastSyncedAt,
};
