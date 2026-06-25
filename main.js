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

// Normalize database ID: strip dashes and then reformat, or accept raw UUID
function normalizeDatabaseId(raw) {
  if (!raw) return '';
  // If it's a full Notion URL, extract the ID
  const urlMatch = raw.match(/([a-f0-9]{32})/i);
  if (urlMatch) return urlMatch[1].replace(/-/g, '');
  // Strip dashes and spaces
  return raw.replace(/[-\s]/g, '');
}

function requireNotion() {
  const config = getConfig();
  const client = getNotionClient(config.notionToken);
  if (!client || !config.databaseId) {
    throw new Error('Notion is not configured. Complete setup first.');
  }
  return { client, databaseId: config.databaseId };
}

// ---- IPC: config ---------------------------------------------------------
ipcMain.handle('config:get', () => ({
  ...getConfig(),
  lastSyncedAt: getLastSyncedAt(),
}));

ipcMain.handle('config:set', (_e, payload) => {
  if (payload.databaseId) {
    payload.databaseId = normalizeDatabaseId(payload.databaseId);
  }
  resetNotionClient();
  return setConfig(payload);
});

// ---- IPC: test connection ------------------------------------------------
ipcMain.handle('notion:test', async (_e, { notionToken, databaseId }) => {
  const normalizedId = normalizeDatabaseId(databaseId);
  const { Client } = require('@notionhq/client');
  const testClient = new Client({ auth: notionToken });
  try {
    const db = await testClient.databases.retrieve({ database_id: normalizedId });
    return { ok: true, title: db.title?.[0]?.plain_text || 'Untitled Database' };
  } catch (err) {
    const msg = err?.body ? JSON.parse(err.body)?.message : err.message;
    throw new Error(msg || 'Could not connect. Check your token and database ID.');
  }
});

// ---- IPC: cached trades (instant load) -----------------------------------
ipcMain.handle('trades:getCached', () => getCachedTrades());

// ---- IPC: full sync from Notion ------------------------------------------
ipcMain.handle('trades:sync', async () => {
  const { client, databaseId } = requireNotion();

  const trades = [];
  let cursor = undefined;

  try {
    do {
      const response = await client.databases.query({
        database_id: databaseId,
        start_cursor: cursor,
        page_size: 100,
        sorts: [{ property: 'Date', direction: 'descending' }],
      });
      response.results.forEach((page) => {
        try {
          trades.push(notionPageToTrade(page));
        } catch (e) {
          console.warn('Skipped page due to parse error:', page.id, e.message);
        }
      });
      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);
  } catch (err) {
    const body = err?.body ? JSON.parse(err.body) : null;
    const msg = body?.message || err.message || 'Sync failed';
    throw new Error(`Notion sync error: ${msg}`);
  }

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
