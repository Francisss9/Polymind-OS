'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { getNotionClient, resetNotionClient } = require('./kernel/notion-client');
const { normalizeDatabaseId } = require('./kernel/utils');
const { toUserError } = require('./kernel/errors');
const { syncCollection } = require('./kernel/notion-sync');
const store = require('./kernel/store');
const { tradeToNotionProperties, notionPageToTrade }               = require('./modules/trading-tracker/schema');
const { notionPageToHabitEntry, habitCheckboxPatch }                = require('./modules/habits/schema');
const { notionPageToGoal, goalToNotionProperties }                  = require('./modules/saving-goals/schema');
const { notionPageToBalance }                                       = require('./modules/balance/schema');

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
// Notion access helpers
// =========================================================
// main.js's only job with Notion is: get a ready client, and turn
// whatever goes wrong into a clean message. Pagination, per-row error
// tolerance, and error-body parsing now live in kernel/ — main.js just
// wires IPC channels to that behavior.

/**
 * Resolve the configured Notion client, throwing a clean error if
 * setup hasn't been completed. Every handler below goes through this
 * instead of touching getNotionClient/getConfig directly, so "not
 * configured" always fails the same way.
 */
function requireNotionClient() {
  const config = store.getConfig();
  const client = getNotionClient(config.notionToken);
  if (!client) throw new Error('Notion token not configured. Complete setup first.');
  return { client, config };
}

/**
 * Resolve a specific per-module database ID from config, throwing a
 * clean, module-named error if it's missing. Centralizes what used to
 * be four near-identical "if (!XDbId) throw ..." lines.
 */
function requireDatabaseId(config, key, label) {
  const dbId = normalizeDatabaseId(config[key] || '');
  if (!dbId) throw new Error(`${label} not configured. Add it in Kernel settings.`);
  return dbId;
}

// =========================================================
// IPC: config
// =========================================================

ipcMain.handle('config:get', () => ({
  ...store.getConfig(),
  lastSyncedAt: store.getLastSyncedAt(),
}));

ipcMain.handle('config:set', (_e, payload) => {
  const idFields = ['databaseId', 'habitsDbId', 'goalsDbId', 'balanceDbId', 'notesDbId'];
  for (const field of idFields) {
    if (payload[field]) payload[field] = normalizeDatabaseId(payload[field]);
  }
  resetNotionClient();
  return store.setConfig(payload);
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
    throw toUserError(err, 'Could not connect. Check your token and database ID.');
  }
});

// =========================================================
// IPC: trades
// =========================================================

ipcMain.handle('trades:getCached', () => store.getCachedTrades());

ipcMain.handle('trades:sync', async () => {
  const { client, config } = requireNotionClient();
  const databaseId = requireDatabaseId(config, 'databaseId', 'Trading Tracker DB');

  try {
    const trades = await syncCollection({
      client,
      databaseId,
      mapPage: notionPageToTrade,
      queryOptions: { sorts: [{ property: 'Date', direction: 'descending' }] },
      logLabel: 'trades:sync',
    });
    const lastSyncedAt = new Date().toISOString();
    store.setCachedTrades(trades);
    store.setLastSyncedAt(lastSyncedAt);
    return { trades, lastSyncedAt };
  } catch (err) {
    throw toUserError(err, 'Notion sync error.');
  }
});

ipcMain.handle('trades:create', async (_e, trade) => {
  const { client, config } = requireNotionClient();
  const databaseId = requireDatabaseId(config, 'databaseId', 'Trading Tracker DB');

  const page = await client.pages.create({
    parent: { database_id: databaseId },
    properties: tradeToNotionProperties(trade),
  });
  const newTrade = notionPageToTrade(page);
  store.setCachedTrades([newTrade, ...store.getCachedTrades()]);
  return newTrade;
});

ipcMain.handle('trades:update', async (_e, trade) => {
  const { client } = requireNotionClient();
  const page = await client.pages.update({
    page_id: trade.id,
    properties: tradeToNotionProperties(trade),
  });
  const updated = notionPageToTrade(page);
  store.setCachedTrades(store.getCachedTrades().map((t) => (t.id === updated.id ? updated : t)));
  return updated;
});

ipcMain.handle('trades:delete', async (_e, id) => {
  const { client } = requireNotionClient();
  await client.pages.update({ page_id: id, archived: true });
  store.setCachedTrades(store.getCachedTrades().filter((t) => t.id !== id));
  return { ok: true };
});

// =========================================================
// IPC: habits
// =========================================================

ipcMain.handle('habits:getCached', () => ({
  entries: store.getCachedHabits(),
  lastSyncedAt: store.getHabitsLastSyncedAt(),
}));

ipcMain.handle('habits:sync', async () => {
  const { client, config } = requireNotionClient();
  const databaseId = requireDatabaseId(config, 'habitsDbId', 'Habits DB');

  const entries = await syncCollection({
    client,
    databaseId,
    mapPage: notionPageToHabitEntry,
    queryOptions: { sorts: [{ property: 'Date', direction: 'descending' }] },
    logLabel: 'habits:sync',
  });
  const lastSyncedAt = new Date().toISOString();
  store.setCachedHabits(entries);
  store.setHabitsLastSyncedAt(lastSyncedAt);
  return { entries, lastSyncedAt };
});

ipcMain.handle('habits:updateCheckbox', async (_e, { pageId, habitName, checked }) => {
  const { client } = requireNotionClient();

  // The Notion database owns "Progress" as a formula over the checkbox
  // columns. The old code patched the checkbox, then hand-recomputed
  // progress locally as a plain average — duplicating whatever logic
  // the real Notion formula uses, and silently drifting from it if
  // that formula is ever more than a flat average (weighted habits,
  // excluded days, etc.). `pages.update` already returns the page with
  // every property recalculated server-side, so we just re-map *that*
  // through the same schema function sync uses — one source of truth
  // for "what a habit entry looks like," no reimplemented math.
  const page = await client.pages.update({
    page_id: pageId,
    properties: habitCheckboxPatch(habitName, checked),
  });
  const updated = notionPageToHabitEntry(page);

  store.setCachedHabits(store.getCachedHabits().map((e) => (e.id === updated.id ? updated : e)));
  return updated;
});

// =========================================================
// IPC: goals
// =========================================================

ipcMain.handle('goals:getCached', () => ({
  goals: store.getCachedGoals(),
  lastSyncedAt: store.getGoalsLastSyncedAt(),
}));

ipcMain.handle('goals:sync', async () => {
  const { client, config } = requireNotionClient();
  const databaseId = requireDatabaseId(config, 'goalsDbId', 'Saving Goals DB');

  const goals = await syncCollection({
    client,
    databaseId,
    mapPage: notionPageToGoal,
    logLabel: 'goals:sync',
  });
  const lastSyncedAt = new Date().toISOString();
  store.setCachedGoals(goals);
  store.setGoalsLastSyncedAt(lastSyncedAt);
  return { goals, lastSyncedAt };
});

ipcMain.handle('goals:update', async (_e, { id, saved, earned }) => {
  const { client } = requireNotionClient();
  const page = await client.pages.update({
    page_id: id,
    properties: goalToNotionProperties({ saved, earned }),
  });
  const updated = notionPageToGoal(page);
  store.setCachedGoals(store.getCachedGoals().map((g) => (g.id === updated.id ? updated : g)));
  return updated;
});

// =========================================================
// IPC: balance
// =========================================================

ipcMain.handle('balance:getCached', () => ({
  balance: store.getCachedBalance(),
  history: store.getCachedBalanceHistory(),
  lastSyncedAt: store.getBalanceLastSyncedAt(),
}));

ipcMain.handle('balance:sync', async () => {
  const { client, config } = requireNotionClient();
  const databaseId = requireDatabaseId(config, 'balanceDbId', 'Account Balance DB');

  const allEntries = await syncCollection({
    client,
    databaseId,
    mapPage: notionPageToBalance,
    queryOptions: { sorts: [{ property: 'Date', direction: 'descending' }] },
    logLabel: 'balance:sync',
  });
  // Rows with no End Balance value aren't a real week entry yet — keep
  // them out of history rather than letting every consumer re-filter.
  const entries = allEntries.filter((entry) => entry.balance !== null);

  const latest = entries[0]?.balance ?? null;
  const lastSyncedAt = new Date().toISOString();

  store.setCachedBalance(latest);
  store.setCachedBalanceHistory(entries);
  store.setBalanceLastSyncedAt(lastSyncedAt);

  return { balance: latest, history: entries, lastSyncedAt };
});

// =========================================================
// IPC: shell + window controls
// =========================================================

// =========================================================
// IPC: Notes
// =========================================================

ipcMain.handle('notes:getCached', () => ({
  notes: store.getCachedNotes(),
  syncedAt: store.getNotesLastSyncedAt(),
}));

ipcMain.handle('notes:sync', async () => {
  const { notionToken, notesDbId } = store.getConfig();
  if (!notionToken || !notesDbId) throw new Error('Notes DB not configured.');
  const { Client } = require('@notionhq/client');
  const { queryAllPages } = require('./kernel/notion-sync');
  const client = new Client({ auth: notionToken });
  const rows = await queryAllPages(client, notesDbId);
  const notes = rows.map((page) => {
    const p = page.properties;
    const title   = p['Title']?.title?.[0]?.plain_text || p['Name']?.title?.[0]?.plain_text || 'Untitled';
    const content = p['Content']?.rich_text?.map((r) => r.plain_text).join('') || '';
    const tags    = p['Tags']?.multi_select?.map((t) => t.name) || [];
    const pinned  = p['Pinned']?.checkbox || false;
    return { id: page.id, title, content, tags, pinned, updatedAt: page.last_edited_time };
  });
  notes.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
  store.setCachedNotes(notes);
  store.setNotesLastSyncedAt(new Date().toISOString());
  return { notes, syncedAt: store.getNotesLastSyncedAt() };
});

ipcMain.handle('notes:create', async (_e, { title, content, tags }) => {
  const { notionToken, notesDbId } = store.getConfig();
  if (!notionToken || !notesDbId) throw new Error('Notes DB not configured.');
  const { Client } = require('@notionhq/client');
  const client = new Client({ auth: notionToken });
  const page = await client.pages.create({
    parent: { database_id: notesDbId },
    properties: {
      Title:   { title:      [{ text: { content: title || 'Untitled' } }] },
      Content: { rich_text:  [{ text: { content: content || '' } }] },
      Tags:    { multi_select: (tags || []).map((name) => ({ name })) },
      Pinned:  { checkbox: false },
    },
  });
  const note = { id: page.id, title: title || 'Untitled', content: content || '', tags: tags || [], pinned: false, updatedAt: page.last_edited_time };
  store.setCachedNotes([note, ...store.getCachedNotes()]);
  return note;
});

ipcMain.handle('notes:update', async (_e, { id, title, content, tags, pinned }) => {
  const { notionToken } = store.getConfig();
  if (!notionToken) throw new Error('Not connected to Notion.');
  const { Client } = require('@notionhq/client');
  const client = new Client({ auth: notionToken });
  const props = {};
  if (title   !== undefined) props.Title   = { title:     [{ text: { content: title } }] };
  if (content !== undefined) props.Content = { rich_text: [{ text: { content } }] };
  if (tags    !== undefined) props.Tags    = { multi_select: tags.map((name) => ({ name })) };
  if (pinned  !== undefined) props.Pinned  = { checkbox: pinned };
  const page = await client.pages.update({ page_id: id, properties: props });
  const cached = store.getCachedNotes().map((n) =>
    n.id !== id ? n : {
      ...n,
      ...(title   !== undefined && { title }),
      ...(content !== undefined && { content }),
      ...(tags    !== undefined && { tags }),
      ...(pinned  !== undefined && { pinned }),
      updatedAt: page.last_edited_time,
    }
  );
  store.setCachedNotes(cached);
  return { id, updatedAt: page.last_edited_time };
});

ipcMain.handle('notes:delete', async (_e, id) => {
  const { notionToken } = store.getConfig();
  if (!notionToken) throw new Error('Not connected to Notion.');
  const { Client } = require('@notionhq/client');
  const client = new Client({ auth: notionToken });
  await client.pages.update({ page_id: id, archived: true });
  store.setCachedNotes(store.getCachedNotes().filter((n) => n.id !== id));
  return { id };
});

ipcMain.handle('shell:openExternal', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) {
    shell.openExternal(url);
  }
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => (mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()));
ipcMain.on('window-close', () => mainWindow?.close());
