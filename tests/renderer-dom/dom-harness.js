'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const RENDERER_DIR = path.join(__dirname, '..', '..', 'renderer');
const INDEX_HTML = path.join(RENDERER_DIR, 'index.html');

// Scripts are loaded in the exact order index.html specifies (extracted
// live from the file below, not hand-copied — so if load order in
// index.html ever changes, tests immediately reflect that instead of
// silently testing a stale order).
function getScriptOrder() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const matches = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)];
  return matches.map((m) => m[1]).filter((src) => !src.startsWith('assets/js/chart'));
}

/**
 * Creates a real JSDOM window from the actual index.html, evaluates the
 * actual renderer/js/*.js source files into it in production order, and
 * injects a fully-controllable fake window.polymind (matching preload.js's
 * real surface) plus a minimal fake Chart constructor (charts.js needs
 * `Chart` to exist at load time; we never assert on chart rendering here).
 *
 * shell.js's trailing bare `init();` call is stripped before evaluation —
 * every other test file wants to call individual functions deterministically,
 * not trigger the full app boot sequence as an unintended side effect of
 * loading the script. Tests that specifically want to exercise init()/showGate/
 * showView call it themselves once the DOM is ready.
 *
 * Returns { window, document, polymind } — `polymind` is the same object
 * as window.polymind, exposed directly for convenient assertion/configuration.
 */
function createRendererDom({ polymindOverrides = {} } = {}) {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');

  const dom = new JSDOM(html, {
    // A real (non-opaque) origin is required — jsdom disables
    // localStorage entirely for file:// URLs (opaque origin), and
    // app.js's session/auth mechanism is built directly on
    // localStorage. The URL is otherwise unused (no real network
    // access happens; scripts are injected inline, not fetched).
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });

  const { window } = dom;
  const { document } = window;

  // --- Fake Chart.js ---
  // charts.js references `Chart` at module scope for constructing chart
  // instances. We never assert on actual rendering, so a minimal stub
  // that satisfies "doesn't throw when constructed / destroyed" is enough.
  window.Chart = class FakeChart {
    constructor() { this.destroyed = false; }
    destroy() { this.destroyed = true; }
    update() {}
  };

  // --- Fake canvas 2D context ---
  // jsdom does not implement canvas rendering contexts at all (that
  // requires the native `canvas` npm package, a heavy system-level
  // dependency we don't want just to run logic tests). charts.js draws
  // directly on a <canvas> for a mini equity sparkline, separate from
  // the Chart.js instances above. Every drawing method is a no-op; we
  // only care that calling them doesn't throw, never that anything
  // visually renders.
  const noopCtx = new Proxy({}, { get: () => () => {} });
  window.HTMLCanvasElement.prototype.getContext = () => noopCtx;

  // --- Fake window.polymind ---
  // Mirrors preload.js's real contextBridge surface exactly. Every method
  // is a jest-less "spy": records calls, and its resolved/rejected value
  // is controllable per-test via `polymind.<ns>.<method>.mockResolvedValue(...)`
  // or by directly reassigning it.
  function makeSpy(defaultImpl = async () => undefined) {
    const calls = [];
    const fn = (...args) => {
      calls.push(args);
      return fn._impl(...args);
    };
    fn._impl = defaultImpl;
    fn.calls = calls;
    fn.mockResolvedValue = (value) => { fn._impl = async () => value; };
    fn.mockRejectedValue = (err) => { fn._impl = async () => { throw err; }; };
    fn.mockImplementation = (impl) => { fn._impl = impl; };
    return fn;
  }

  const polymind = {
    config: {
      get: makeSpy(async () => ({})),
      set: makeSpy(async (payload) => payload),
    },
    trades: {
      getCached: makeSpy(async () => []),
      sync: makeSpy(async () => ({ trades: [], lastSyncedAt: null })),
      create: makeSpy(async (t) => ({ id: 'trade-1', ...t })),
      update: makeSpy(async (t) => t),
      delete: makeSpy(async () => ({ ok: true })),
    },
    habits: {
      getCached: makeSpy(async () => ({ entries: [], syncedAt: null })),
      sync: makeSpy(async () => ({ entries: [], lastSyncedAt: null })),
      updateCheckbox: makeSpy(async () => ({ ok: true })),
    },
    goals: {
      getCached: makeSpy(async () => ({ goals: [], syncedAt: null })),
      sync: makeSpy(async () => ({ goals: [] })),
      update: makeSpy(async () => ({ ok: true })),
    },
    balance: {
      getCached: makeSpy(async () => ({ balance: null })),
      sync: makeSpy(async () => ({ balance: null })),
    },
    notes: {
      getCached: makeSpy(async () => ({ notes: [], syncedAt: null })),
      sync: makeSpy(async () => ({ notes: [], syncedAt: null })),
      create: makeSpy(async (n) => ({ id: 'note-1', pinned: false, updatedAt: new Date().toISOString(), ...n })),
      update: makeSpy(async (n) => ({ ...n, updatedAt: new Date().toISOString() })),
      delete: makeSpy(async () => ({ ok: true })),
    },
    notion: {
      test: makeSpy(async () => ({ title: 'Test DB' })),
    },
    window: {
      minimize: makeSpy(async () => {}),
      maximize: makeSpy(async () => {}),
      close: makeSpy(async () => {}),
    },
    openExternal: makeSpy(async () => {}),
    ...polymindOverrides,
  };

  window.polymind = polymind;

  // --- Evaluate real renderer source files, in production order ---
  // Inline <script> injection (not window.eval) — eval-goal code with
  // 'use strict' gets its own private variable environment per spec, so
  // top-level function declarations never reach the global object that
  // way. Real <script> tags (inline or src) use Script-goal semantics,
  // where strict mode does NOT prevent top-level functions from becoming
  // window properties. This is why every renderer file's functions
  // (createNote, bootSync, handleLogin, ...) only become visible on
  // `window` when loaded this way.
  const scripts = getScriptOrder();
  for (const src of scripts) {
    let code = fs.readFileSync(path.join(RENDERER_DIR, src), 'utf8');
    if (src.endsWith('shell.js')) {
      // Strip the trailing auto-boot call — see function doc comment.
      code = code.replace(/\ninit\(\);\s*$/, '\n');
    }
    const scriptEl = document.createElement('script');
    scriptEl.textContent = code;
    document.body.appendChild(scriptEl);
  }

  // --- Test-only observability shim ---
  // `config`, `trades`, `currentBalance`, `syncing`, etc. are declared
  // with `let`/`const` in app.js — real renderer code across every file
  // shares them via the same top-level lexical scope (that's how
  // production works today, not a harness artifact), but `let`/`const`
  // bindings never become `window` properties the way `var`/function
  // declarations do. This tiny shim, injected in the same shared scope,
  // exposes read access for test assertions only. It ships in no build
  // output — it only exists inside this test harness.
  const shim = document.createElement('script');
  shim.textContent = `
    window.__test = {
      getConfig: () => config,
      getTrades: () => trades,
      getCurrentBalance: () => currentBalance,
      isSyncing: () => syncing,
      getConnecting: () => connecting,
    };
    if (typeof Notes !== 'undefined') window.Notes = Notes;
  `;
  document.body.appendChild(shim);

  return { window, document, polymind };
}

module.exports = { createRendererDom };
