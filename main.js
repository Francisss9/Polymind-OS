'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { getNotionClient, resetNotionClient } = require('./kernel/notion-client');
const { normalizeDatabaseId } = require('./kernel/utils');
const {
  getConfig, setConfig,
  getCachedTrades, setCachedTrades, getLastSyncedAt, setLastSyncedAt,
  getCachedHabits, setCachedHabits, getHabitsLastSyncedAt, setHabitsLastSyncedAt,
  getCachedGoals, setCachedGoals, getGoalsLastSyncedAt, setGoalsLastSyncedAt,
  getCachedBalance, setCachedBalance, getBalanceLastSyncedAt, setBalanceLastSyncedAt,
  getCachedBalanceHistory, setCachedBalanceHistory,
} = require('./kernel/store');
const { tradeToNotionProperties, notionPageToTrade }   = require('./modules/trading-tracker/schema');
const { HABIT_PROPS, notionPageToHabitEntry, habitCheckboxPatch } = require('./modules/habits/schema');
const { notionPageToGoal, goalToNotionProperties }     = require('./modules/saving-goals/schema');
const { notionPageToBalance }                          = require('./modules/balance/schema');

// =========================================================
// Window
// =========================================================

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#07080a',
    autoHideMenuBar: true,
    title: 'Polymind OS',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// =========================================================
// Shared helpers
// =========================================================

/**
 * Returns a configured Notion client + the trading databaseId.
 * Throws a clean user-facing error if not configured.
 */
function requireNotion() {
  const config = getConfig();
  const client = getNotionClient(config.notionToken);
  if (!client || !config.databaseId) {
    throw new Error('Notion is not configured. Complete setup first.');
  }
  return { client, databaseId: config.databaseId, config };
}

/**
 * Returns the shared singleton Notion client.
 * Throws if token is missing.
 */
function requireNotionClient() {
  const config = getConfig();
  const client = getNotionClient(config.notionToken);
  if (!client) throw new Error('Notion token not configured.');
  return { client, config };
}

/**
 * Paginate through all results of a Notion database query.
 * @param {import('@notionhq/client').Client} client
 * @param {string} databaseId
 * @param {object} options  Extra query options (sorts, filter, page_size)
 * @returns {Promise<Array>} All result pages
 */
async function queryAll(client, databaseId, options = {}) {
  const results = [];
  let cursor;
  do {
    const res = await client.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
      ...options,
    });
    results.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results;
}

// =========================================================
// IPC: config
// =========================================================

ipcMain.handle('config:get', () => ({
  ...getConfig(),
  lastSyncedAt: getLastSyncedAt(),
}));

ipcMain.handle('config:set', (_e, payload) => {
  if (payload.databaseId)  payload.databaseId  = normalizeDatabaseId(payload.databaseId);
  if (payload.habitsDbId)  payload.habitsDbId  = normalizeDatabaseId(payload.habitsDbId);
  if (payload.goalsDbId)   payload.goalsDbId   = normalizeDatabaseId(payload.goalsDbId);
  if (payload.balanceDbId) payload.balanceDbId = normalizeDatabaseId(payload.balanceDbId);
  resetNotionClient();
  return setConfig(payload);
});

// =========================================================
// IPC: notion test connection
// =========================================================

ipcMain.handle('notion:test', async (_e, { notionToken, databaseId }) => {
  const { Client } = require('@notionhq/client');
  const testClient = new Client({ auth: notionToken });
  try {
    const db = await testClient.databases.retrieve({
      database_id: normalizeDatabaseId(databaseId),
    });
    return { ok: true, title: db.title?.[0]?.plain_text || 'Untitled Database' };
  } catch (err) {
    const msg = err?.body ? JSON.parse(err.body)?.message : err.message;
    throw new Error(msg || 'Could not connect. Check your token and database ID.');
  }
});

// =========================================================
// IPC: trades
// =========================================================

ipcMain.handle('trades:getCached', () => getCachedTrades());

ipcMain.handle('trades:sync', async () => {
  const { client, databaseId } = requireNotion();
  try {
    const pages = await queryAll(client, databaseId, {
      sorts: [{ property: 'Date', direction: 'descending' }],
    });
    const trades = pages.flatMap(page => {
      try { return [notionPageToTrade(page)]; }
      catch (e) { console.warn('[trades:sync] Skipped page', page.id, e.message); return []; }
    });
    setCachedTrades(trades);
    const lastSyncedAt = new Date().toISOString();
    setLastSyncedAt(lastSyncedAt);
    return { trades, lastSyncedAt };
  } catch (err) {
    const body = err?.body ? JSON.parse(err.body) : null;
    throw new Error(`Notion sync error: ${body?.message || err.message || 'Unknown'}`);
  }
});

ipcMain.handle('trades:create', async (_e, trade) => {
  const { client, databaseId } = requireNotion();
  const page = await client.pages.create({
    parent: { database_id: databaseId },
    properties: tradeToNotionProperties(trade),
  });
  const newTrade = notionPageToTrade(page);
  const cached = getCachedTrades();
  cached.unshift(newTrade);
  setCachedTrades(cached);
  return newTrade;
});

ipcMain.handle('trades:update', async (_e, trade) => {
  const { client } = requireNotion();
  const page = await client.pages.update({
    page_id: trade.id,
    properties: tradeToNotionProperties(trade),
  });
  const updated = notionPageToTrade(page);
  const cached = getCachedTrades().map(t => t.id === updated.id ? updated : t);
  setCachedTrades(cached);
  return updated;
});

ipcMain.handle('trades:delete', async (_e, id) => {
  const { client } = requireNotion();
  await client.pages.update({ page_id: id, archived: true });
  setCachedTrades(getCachedTrades().filter(t => t.id !== id));
  return { ok: true };
});

// =========================================================
// IPC: habits
// =========================================================

ipcMain.handle('habits:getCached', () => ({
  entries: getCachedHabits(),
  lastSyncedAt: getHabitsLastSyncedAt(),
}));

ipcMain.handle('habits:sync', async () => {
  const { client, config } = requireNotionClient();
  const HABITS_DB_ID = normalizeDatabaseId(config.habitsDbId || '');
  if (!HABITS_DB_ID) throw new Error('Habits DB not configured. Add it in Kernel settings.');

  const pages = await queryAll(client, HABITS_DB_ID, {
    sorts: [{ property: 'Date', direction: 'descending' }],
  });
  const entries = pages.flatMap(page => {
    try { return [notionPageToHabitEntry(page)]; }
    catch (e) { console.warn('[habits:sync] Skipped page', page.id, e.message); return []; }
  });

  setCachedHabits(entries);
  const lastSyncedAt = new Date().toISOString();
  setHabitsLastSyncedAt(lastSyncedAt);
  return { entries, lastSyncedAt };
});

ipcMain.handle('habits:updateCheckbox', async (_e, { pageId, habitName, checked }) => {
  const { client } = requireNotionClient();
  await client.pages.update({
    page_id: pageId,
    properties: habitCheckboxPatch(habitName, checked),
  });

  // Update local cache — recalculate progress from checkboxes
  const cached = getCachedHabits();
  const entry = cached.find(e => e.id === pageId);
  if (entry) {
    entry[habitName] = checked;
    const done = HABIT_PROPS.filter(p => entry[p]).length;
    entry.progress = Math.round((done / HABIT_PROPS.length) * 100);
    setCachedHabits(cached);
  }
  return { ok: true };
});

// =========================================================
// IPC: goals
// =========================================================

ipcMain.handle('goals:getCached', () => ({
  goals: getCachedGoals(),
  lastSyncedAt: getGoalsLastSyncedAt(),
}));

ipcMain.handle('goals:sync', async () => {
  const { client, config } = requireNotionClient();
  const GOALS_DB_ID = normalizeDatabaseId(config.goalsDbId || '');
  if (!GOALS_DB_ID) throw new Error('Saving Goals DB not configured. Add it in Kernel settings.');

  const pages = await queryAll(client, GOALS_DB_ID);
  const goals = pages.flatMap(page => {
    try { return [notionPageToGoal(page)]; }
    catch (e) { console.warn('[goals:sync] Skipped page', page.id, e.message); return []; }
  });

  setCachedGoals(goals);
  const lastSyncedAt = new Date().toISOString();
  setGoalsLastSyncedAt(lastSyncedAt);
  return { goals, lastSyncedAt };
});

ipcMain.handle('goals:update', async (_e, { id, saved, earned }) => {
  const { client } = requireNotionClient();
  const page = await client.pages.update({
    page_id: id,
    properties: goalToNotionProperties({ saved, earned }),
  });
  const updated = notionPageToGoal(page);
  const cached = getCachedGoals().map(g => g.id === updated.id ? updated : g);
  setCachedGoals(cached);
  return updated;
});

// =========================================================
// IPC: balance
// =========================================================

ipcMain.handle('balance:getCached', () => ({
  balance:     getCachedBalance(),
  history:     getCachedBalanceHistory(),
  lastSyncedAt: getBalanceLastSyncedAt(),
}));

ipcMain.handle('balance:sync', async () => {
  const { client, config } = requireNotionClient();
  const BALANCE_DB_ID = normalizeDatabaseId(config.balanceDbId || '');
  if (!BALANCE_DB_ID) throw new Error('Balance DB not configured. Add it in Kernel settings.');

  const pages = await queryAll(client, BALANCE_DB_ID, {
    sorts: [{ property: 'Date', direction: 'descending' }],
  });
  const entries = pages.flatMap(page => {
    try {
      const entry = notionPageToBalance(page);
      return entry.balance !== null ? [entry] : [];
    } catch (e) {
      console.warn('[balance:sync] Skipped page', page.id, e.message);
      return [];
    }
  });

  const latest = entries[0]?.balance ?? null;
  const lastSyncedAt = new Date().toISOString();

  setCachedBalance(latest);
  setCachedBalanceHistory(entries);
  setBalanceLastSyncedAt(lastSyncedAt);

  return { balance: latest, history: entries, lastSyncedAt };
});

// =========================================================
// IPC: shell + window controls
// =========================================================

ipcMain.handle('shell:openExternal', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) {
    shell.openExternal(url);
  }
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window-close',    () => mainWindow?.close());
