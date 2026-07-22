'use strict';

// =========================================================
// APP — shared state + local auth + entry constants
// =========================================================
// Load order (index.html):
//   utils.js → app.js → home.js → calendar.js → charts.js
//   → trades.js → notes.js → gate.js → sync.js → settings.js
//   → shell.js (calls init() at bottom)
//
// All globals defined here are available to every module
// that loads after this file. gate.js owns login/logout,
// sync.js owns pulling data from Notion, settings.js owns
// the Kernel view's save/test/disconnect actions, and
// shell.js owns view routing + wiring everything together
// via init().
// =========================================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const NOTION_INTEGRATIONS_URL = 'https://www.notion.so/my-integrations';

// =========================================================
// LOCAL AUTH
// =========================================================
// Single-user offline lock for the desktop app.
// First run: any email + password → saved as credentials.
// Subsequent runs: must match exactly.
// Reset: DevTools → Application → localStorage → delete "polymind_auth"
// Why btoa? Light obfuscation — sufficient for a personal desktop tool.

const AUTH_KEY    = 'polymind_auth';
const SESSION_KEY = 'polymind_session';

function getLocalAuth() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
}
function setLocalAuth(email, password) {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ encoded: btoa(`${email}:${password}`) }));
}
function clearLocalAuth() { localStorage.removeItem(AUTH_KEY); }
function verifyLocalAuth(email, password) {
  const s = getLocalAuth();
  return s ? s.encoded === btoa(`${email}:${password}`) : false;
}
function isFirstRun() { return !getLocalAuth(); }

// =========================================================
// SESSION
// =========================================================
// Written on successful login. Checked on app start to skip
// the gate entirely. Cleared on logout or auth reset.
// Not a security token — this is a personal desktop tool.
// The session just means "this machine already authenticated."

function setSession() {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ ts: Date.now() }));
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
function hasActiveSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    return !!s && !!s.ts;
  } catch { return false; }
}

// =========================================================
// SHARED STATE
// =========================================================
// Mutated by sync.js (trades/balance sync) and trades.js
// (manual CRUD). Read by calendar.js and charts.js.

let trades         = [];
let filteredTrades = [];
let config         = {};
let syncing        = false;
let connecting     = false;
let currentView    = 'dashboard';
let currentBalance = null;
