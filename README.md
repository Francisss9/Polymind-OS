# Polymind OS

Desktop shell that uses **Notion as the data kernel** — similar to how an Arch-based distro sits on the Linux kernel. Your workspace stays the source of truth; Polymind OS is the native UI on top.

## First module: Trading Tracker

Syncs with your Notion **Trading Tracker** database. Create, edit, and archive trades in the app; changes appear in Notion automatically. A local cache gives instant startup; use **Sync** to pull the latest.

## Setup

1. **Create a Notion integration** at [notion.so/my-integrations](https://www.notion.so/my-integrations) and copy the secret token.
2. **Share your Trading Tracker database** with that integration (database → ••• → Connections).
3. Copy the **database ID** from the URL (32-character hex).
4. Install and run:

```bash
npm install
npm start
```

On first launch, paste your token and database ID in the setup screen.

## Architecture

```
Polymind OS (Electron shell)
├── kernel/           ← Notion client + local store (the "kernel")
│   ├── notion-client.js
│   └── store.js
└── modules/          ← Apps that mount on the kernel (like distros)
    └── trading-tracker/
        └── schema.js   ← Maps Notion ↔ app data shapes
```

More modules (tasks, notes, etc.) can plug into the same kernel pattern.

## Security

- Integration tokens are stored in Electron's user-data folder, not in this repo.
- Never commit `config.local.js` or `.env` files.

## Scripts

| Command     | Description        |
|------------|--------------------|
| `npm start` | Launch Polymind OS |

## License

MIT
