const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { getNotionClient, resetNotionClient } = require('./kernel/notion-client');
const {
  getConfig,
  setConfig,
  getCachedTrades,
  setCachedTrades,
  getLastSyncedAt,
  setLastSyncedAt,
} = require('./kernel/store');
const { tradeToNotionProperties, notionPageToTrade } = require('./modules/trading-tracker/schema');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#0D0E0F',
    autoHideMenuBar: true,
    title: 'Polymind OS',
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

function requireNotion() {
  const config = getConfig();
  const client = getNotionClient(config.notionToken);
  if (!client || !config.databaseId) {
    throw new Error('Notion kernel is not configured. Complete setup in Settings.');
  }
  return { client, databaseId: config.databaseId };
}

// ---- IPC: config ---------------------------------------------------------
ipcMain.handle('config:get', () => ({
  ...getConfig(),
  lastSyncedAt: getLastSyncedAt(),
}));

ipcMain.handle('config:set', (_e, payload) => {
  resetNotionClient();
  return setConfig(payload);
});

// ---- IPC: cached trades (instant load) -----------------------------------
ipcMain.handle('trades:getCached', () => getCachedTrades());

// ---- IPC: full sync from Notion ------------------------------------------
ipcMain.handle('trades:sync', async () => {
  const { client, databaseId } = requireNotion();

  const trades = [];
  let cursor = undefined;

  do {
    const response = await client.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
      sorts: [{ property: 'Date', direction: 'descending' }],
    });
    response.results.forEach((page) => trades.push(notionPageToTrade(page)));
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  setCachedTrades(trades);
  const lastSyncedAt = new Date().toISOString();
  setLastSyncedAt(lastSyncedAt);
  return { trades, lastSyncedAt };
});

// ---- IPC: create a trade --------------------------------------------------
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

// ---- IPC: update a trade ---------------------------------------------------
ipcMain.handle('trades:update', async (_e, trade) => {
  const { client } = requireNotion();

  const page = await client.pages.update({
    page_id: trade.id,
    properties: tradeToNotionProperties(trade),
  });

  const updated = notionPageToTrade(page);
  const cached = getCachedTrades().map((t) => (t.id === updated.id ? updated : t));
  setCachedTrades(cached);
  return updated;
});

// ---- IPC: delete (archive) a trade -----------------------------------------
ipcMain.handle('trades:delete', async (_e, id) => {
  const { client } = requireNotion();

  await client.pages.update({ page_id: id, archived: true });

  setCachedTrades(getCachedTrades().filter((t) => t.id !== id));
  return { ok: true };
});

ipcMain.handle('shell:openExternal', (_e, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});
