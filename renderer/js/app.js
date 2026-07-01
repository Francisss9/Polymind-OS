'use strict';

// =========================================================
// APP — shared state + local auth + entry constants
// =========================================================
// Load order (index.html):
//   utils.js → home.js → calendar.js → charts.js
//   → trades.js → shell.js (calls init() at bottom)
//
// All globals defined here are available to every module
// that loads after this file. shell.js owns init().
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

const AUTH_KEY = 'polymind_auth';

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
// SHARED STATE
// =========================================================
// Mutated by shell.js (sync) and trades.js (CRUD).
// Read by calendar.js and charts.js.

let trades         = [];
let filteredTrades = [];
let config         = {};
let syncing        = false;
let connecting     = false;
let currentView    = 'dashboard';
let currentBalance = null;
