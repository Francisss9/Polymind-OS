const Store = require('electron-store');

const store = new Store({ name: 'polymind-os' });

function getConfig() {
  return {
    notionToken: store.get('notionToken', ''),
    databaseId: store.get('databaseId', ''),
    setupComplete: store.get('setupComplete', false),
  };
}

function setConfig({ notionToken, databaseId, setupComplete }) {
  if (notionToken !== undefined) store.set('notionToken', notionToken);
  if (databaseId !== undefined) store.set('databaseId', databaseId);
  if (setupComplete !== undefined) store.set('setupComplete', setupComplete);
  return getConfig();
}

function getCachedTrades() {
  return store.get('trades', []);
}

function setCachedTrades(trades) {
  store.set('trades', trades);
}

function getLastSyncedAt() {
  return store.get('lastSyncedAt', null);
}

function setLastSyncedAt(iso) {
  store.set('lastSyncedAt', iso);
}

module.exports = {
  store,
  getConfig,
  setConfig,
  getCachedTrades,
  setCachedTrades,
  getLastSyncedAt,
  setLastSyncedAt,
};
