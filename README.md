# Polymind OS

A private desktop OS shell built on **Electron**, using **Notion as its data kernel**. Think Notion + Obsidian — a local-first, modular personal workspace for trading, habits, finance, and knowledge. Your Notion workspace stays the source of truth; Polymind OS is the native UI layer on top.

---

## Modules

| Module | Description |
|---|---|
| **WorkStation** | Daily hub — clock, habit tracker, saving goals, scratch notes |
| **Trading** | Calendar-based trade journal synced with Notion. Daily / Weekly / Monthly / Quarterly views. Full CRUD |
| **Charts** | Equity curve, P&L per trade, Win/Loss donut, Monthly P&L heatmap |
| **Kernel** | Settings — Notion token + database IDs for all modules |

---

## Setup

### 1. Create a Notion integration
Go to [notion.so/my-integrations](https://www.notion.so/my-integrations), create an integration, and copy the **Internal Integration Secret** token.

### 2. Share your databases
For each database below, open it in Notion → `•••` → **Connections** → add your integration.

### 3. Configure in the app
On first launch, paste your token and Trading Tracker database ID in the setup screen. After logging in, open **Kernel** settings to add the remaining databases.

| Setting | Notion Database | Key Properties |
|---|---|---|
| Trading Tracker DB | Your trades database | `Date`, `Pair`, `Direction`, `Result`, `P&L`, `R:R`, `Notes` |
| Habit Tracker DB | Daily habit checklist | `Date` + one checkbox per habit |
| Saving Goals DB | Goals tracker | `Name`, `Target`, `Saved`, `Earned` |
| Account Balance DB | Weekly balance log (Performance Tracker) | `Date`, `Start Balance`, `End Balance`, `Winning Trades`, `Losing Trades` |

### 4. Install and run

```bash
npm install   # also copies Chart.js bundle via postinstall
npm start
```

---

## Architecture

```
Polymind OS
├── main.js                  ← Electron main process + all IPC handlers
├── preload.js               ← Minimal contextBridge (window.polymind.*)
│
├── kernel/
│   ├── notion-client.js     ← Singleton Notion API client
│   ├── store.js             ← electron-store typed accessors (no raw export)
│   └── utils.js             ← normalizeDatabaseId
│
├── modules/                 ← Pure schema translation (Notion ↔ local)
│   ├── trading-tracker/schema.js
│   ├── habits/schema.js
│   ├── saving-goals/schema.js
│   └── balance/schema.js
│
├── renderer/
│   ├── index.html
│   ├── assets/
│   │   ├── login-bg.jpg     ← Gate background image
│   │   ├── knight.png
│   │   └── js/
│   │       └── chart.umd.min.js   ← Copied from node_modules by postinstall
│   │
│   ├── js/                  ← Load order matters (defined in index.html)
│   │   ├── utils.js         ← Pure helpers: formatPnl, escapeHtml, animateNumber…
│   │   ├── app.js           ← Shared state + local auth constants
│   │   ├── home.js          ← WorkStation module
│   │   ├── calendar.js      ← Trading calendar views
│   │   ├── charts.js        ← Chart.js chart renderers
│   │   ├── trades.js        ← Trade table, modal, CRUD
│   │   └── shell.js         ← Nav, auth, sync, init — calls init() at bottom
│   │
│   └── styles/
│       ├── tokens.css       ← Design tokens (7-layer depth system)
│       ├── base.css         ← Reset, typography, shared classes
│       ├── gate.css         ← Login + setup screens
│       ├── shell.css        ← Titlebar, sidebar rail, topbar, layout
│       ├── home.css         ← WorkStation bento grid
│       ├── trading.css      ← Trade table, calendar, charts
│       └── modal.css        ← Trade modal
│
└── scripts/
    └── copy-assets.js       ← postinstall: copies Chart.js to renderer/assets/js/
```

### Data flow

```
Renderer (window.polymind.*)
    ↓ IPC via contextBridge
main.js IPC handlers
    ↓
kernel/notion-client.js  →  Notion API
kernel/store.js          →  electron-store (local cache)
    ↓
modules/*/schema.js  (pure: Notion page → local object)
```

### Key principles
- **Local-first**: cache loaded instantly on boot, sync is explicit (button or keyboard `r`)
- **Write-through**: mutations go to Notion immediately, cache updated optimistically
- **Single Responsibility**: each file owns one concern. `shell.js` owns init/nav/auth. `trades.js` owns CRUD. Schemas are pure functions
- **No raw store export**: all persistence goes through typed accessors in `store.js`
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

---

## Security

- Notion integration tokens stored in Electron's user-data folder via `electron-store`, never in the repo
- `contextIsolation: true`, `nodeIntegration: false` — renderer has no Node access
- Local auth uses `btoa` obfuscation — sufficient for a single-user personal desktop tool
- CSP: `default-src 'self'` — no external script sources

---

## Roadmap

- [ ] Notes module — Notion-synced, title/body/tags
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
