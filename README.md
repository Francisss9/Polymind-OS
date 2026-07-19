# Polymind OS

A private desktop OS shell built on **Electron**, using **Notion as its data kernel**. Think Notion + Obsidian — a local-first, modular personal workspace for trading, habits, finance, and knowledge. Your Notion workspace stays the source of truth; Polymind OS is the native UI layer on top.

---

## Modules

| Module | Description |
|---|---|
| **WorkStation** | Daily hub — clock, habit tracker, saving goals, scratchpad (device-local, not synced) |
| **Trading** | Calendar-based trade journal synced with Notion. Daily / Weekly / Monthly / Quarterly views. Full CRUD |
| **Charts** | Equity curve, P&L per trade, Win/Loss donut, Monthly P&L heatmap |
| **Notes** | Notion-synced note editor — title, body, tags, pin, search, tag filtering, auto-save |
| **Kernel** | Settings — display name, Notion token, and database IDs for every module |

---

## Setup

### 1. Create a Notion integration
Go to [notion.so/my-integrations](https://www.notion.so/my-integrations), create an integration, and copy the **Internal Integration Secret** token.

### 2. Share your databases
For each database below, open it in Notion → `•••` → **Connections** → add your integration.

### 3. Configure in the app
On first launch, paste your token and Trading Tracker database ID in the setup screen. After logging in, open **Kernel** settings to add the remaining databases and your display name (used in the WorkStation greeting).

| Setting | Notion Database | Key Properties |
|---|---|---|
| Trading Tracker DB | Your trades database | `Date`, `Pair`, `Direction`, `Result`, `P&L`, `R:R`, `Notes` |
| Habit Tracker DB | Daily habit checklist | `Date` + one checkbox per habit |
| Saving Goals DB | Goals tracker | `Name`, `Target`, `Saved`, `Earned` |
| Account Balance DB | Weekly balance log (Performance Tracker) | `Date`, `Start Balance`, `End Balance`, `Winning Trades`, `Losing Trades` |
| Notes DB | Notes | `Name` (title), `Body` (text), `Tags` (multi-select), `Pinned` (checkbox) |

Property names must match exactly — Notion schemas are never assumed, only read from the actual database. If you rename a property, the corresponding `modules/*/schema.js` file needs the same change.

### 4. Auth & sessions
First run: any email + password you enter becomes your local credentials (there's no remote account — this is a single-user desktop lock, not a security boundary). Once logged in, the app remembers your session and skips the login screen on next launch. Use the logout icon at the bottom of the sidebar to end the session manually.

### 5. Install and run

```bash
npm install   # also copies Chart.js bundle via postinstall
npm start
```

### 6. Run tests

```bash
npm test      # or: node --test "tests/**/*.test.js"
```

---

## Architecture

```
Polymind OS
├── main.js                  ← Electron main process + all IPC handlers
├── preload.js                ← Minimal contextBridge (window.polymind.*)
│
├── kernel/
│   ├── notion-client.js      ← Singleton Notion API client
│   ├── notion-sync.js        ← queryAllPages / syncCollection — shared pagination
│   ├── errors.js              ← toUserError — clean, module-named error messages
│   ├── store.js               ← electron-store typed accessors (no raw export)
│   ├── secure-store.js        ← Encrypts specific keys at rest (pluggable cipher)
│   ├── electron-cipher.js     ← Wires secure-store.js to Electron's safeStorage
│   └── utils.js               ← normalizeDatabaseId
│
├── modules/                  ← Pure schema translation (Notion ↔ local)
│   ├── trading-tracker/schema.js
│   ├── habits/schema.js
│   ├── saving-goals/schema.js
│   ├── balance/schema.js
│   └── notes/schema.js
│
├── renderer/
│   ├── index.html
│   ├── assets/
│   │   ├── login-bg.jpg      ← Gate background image
│   │   ├── knight.png
│   │   └── js/
│   │       └── chart.umd.min.js   ← Copied from node_modules by postinstall
│   │
│   ├── js/                   ← Load order matters (defined in index.html)
│   │   ├── utils.js          ← Pure helpers: formatPnl, escapeHtml, animateNumber…
│   │   ├── app.js            ← Shared state, local auth, session constants
│   │   ├── home.js           ← WorkStation module
│   │   ├── calendar.js       ← Trading calendar views
│   │   ├── charts.js         ← Chart.js chart renderers
│   │   ├── trades.js         ← Trade table, modal, CRUD
│   │   ├── notes.js          ← Notes module (list, editor, tags, search)
│   │   ├── gate.js           ← Login, first-run Notion connect, logout
│   │   ├── sync.js           ← Trade/balance sync + bootSync (all-DB fan-out)
│   │   ├── settings.js       ← Kernel view save/test/disconnect
│   │   └── shell.js          ← View routing, keybindings, event wiring, init()
│   │
│   └── styles/
│       ├── tokens.css        ← Design tokens (7-layer depth system)
│       ├── base.css          ← Reset, typography, shared classes
│       ├── gate.css          ← Login + setup screens
│       ├── shell.css         ← Titlebar, sidebar rail, topbar, layout
│       ├── home.css          ← WorkStation bento grid
│       ├── trading.css       ← Trade table, calendar, charts
│       ├── notes.css         ← Notes two-pane editor
│       └── modal.css         ← Trade modal
│
├── tests/
│   ├── kernel/                ← errors, notion-client, notion-sync, store, secure-store, utils
│   ├── modules/                ← one test file per schema module, including notes
│   ├── renderer/                ← pure renderer utility functions (utils.js)
│   └── helpers/                  ← fake backing store, fake Notion client, fake cipher
│
└── scripts/
    └── copy-assets.js        ← postinstall: copies Chart.js to renderer/assets/js/
```

### Data flow

```
Renderer (window.polymind.*)
    ↓ IPC via contextBridge
main.js IPC handlers
    ↓
kernel/notion-client.js  →  Notion API
kernel/store.js          →  electron-store (local cache, sensitive keys encrypted)
    ↓
modules/*/schema.js  (pure: Notion page → local object)
```

### Key principles
- **Local-first**: cache loaded instantly on boot, sync is explicit (button, keyboard `r`, or automatic on login via `bootSync()`)
- **Write-through**: mutations go to Notion immediately, cache updated optimistically
- **Single Responsibility**: each renderer file owns one concern — `gate.js` owns auth, `sync.js` owns pulling data from Notion, `settings.js` owns the Kernel view, `shell.js` only routes views and wires events. `trades.js` owns CRUD. Schemas are pure functions with zero Electron/Notion-SDK dependencies, so they're trivially unit-testable
- **No raw store export**: all persistence goes through typed accessors in `store.js`
- **Consistent error handling**: every IPC handler that talks to Notion uses `requireNotionClient()` / `requireDatabaseId()` / `toUserError()` — same failure shape everywhere, no handler reinvents its own error path
- **CSS-only animations**: no inline style mutations in JS — all transitions via CSS keyframe classes

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `n` | New trade |
| `r` | Sync trades |
| `/` | Focus search |
| `⌘K` / `Ctrl+K` | Focus search |
| `Escape` | Close modal |

---

## Scripts

| Command | Description |
|---|---|
| `npm start` | Launch Polymind OS via Electron Forge |
| `npm run make` | Package for distribution |
| `npm test` | Run the full test suite (118 tests, `node:test`) |

---

## Security

- **Notion integration token is encrypted at rest** via Electron's `safeStorage` (OS-native: macOS Keychain, Windows DPAPI, Linux Secret Service/libsecret), not stored as plaintext JSON. If OS-level encryption is unavailable on a given machine, the app falls back to plaintext storage rather than crashing, and logs a warning
- Pre-existing plaintext values (from before encryption was added) are read once, then automatically re-encrypted on the next save — no manual migration step
- `contextIsolation: true`, `nodeIntegration: false` — renderer has no Node access
- Every `ipcMain.handle()` channel is matched 1:1 by a `preload.js` exposure — nothing orphaned, nothing leaked beyond what's explicitly bridged
- Local auth uses `btoa` obfuscation, not real hashing — sufficient for a single-user personal desktop tool with no remote account, not intended as a defense against a determined local attacker
- CSP: `default-src 'self'` — no external script sources
- All Notion-sourced strings rendered into `innerHTML` are escaped via a shared `escapeHtml()` before insertion

---

## Testing

118 tests across kernel modules, schema modules, the encryption wrapper, and renderer pure functions — run with Node's built-in test runner, no extra framework. Notion API calls are faked via `tests/helpers/fake-notion-client.js`; `electron-store` is faked via `tests/helpers/fake-backing-store.js`; the encryption cipher is faked via `tests/helpers/fake-cipher.js`. `main.js` itself has no direct test coverage — it's tightly coupled to `ipcMain`/`BrowserWindow` and would need a heavier mocking harness to test meaningfully; the logic it calls into (schemas, sync, store, errors) is what's actually tested.

---

## Roadmap

- [ ] Daily Log — one auto-created note per day, linked to habits and trades
- [ ] Unified search — trades + habits + notes in one result set
- [ ] `⌘K` command palette — navigate, create, search from anywhere
- [ ] Bidirectional note links — `[[title]]` syntax
- [ ] Graph view — D3 force-directed knowledge graph
- [ ] Monthly habit editing
- [ ] Offline write queue — retry failed Notion mutations

---

## License

MIT — [Francis Gomes](https://github.com/francisgomesx)
