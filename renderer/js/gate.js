'use strict';

// =========================================================
// GATE MODULE
// Owns: the login/onboarding gate and its transitions —
// local auth, first-run Notion connect, session-based
// auto-login, and logout. Nothing in here knows about
// views, sync, or settings; it only decides whether the
// person is let into the app.
// =========================================================

function showGate(step = 'login') {
  $('#gate').classList.remove('hidden');
  $('#app-shell').classList.add('hidden');
  showStep(step);
}

function showApp() {
  $('#gate').classList.add('hidden');
  const shell = $('#app-shell');
  shell.classList.remove('hidden');
  shell.classList.remove('app-enter');
  void shell.offsetWidth; // reflow to restart animation
  shell.classList.add('app-enter');
}

function showStep(name) {
  ['step-login', 'step-notion'].forEach((id) => {
    $('#' + id).classList.toggle('hidden', id !== 'step-' + name);
  });
}

// ---- Login ----------------------------------------------------

async function handleLogin() {
  const email = $('#login-email').value.trim();
  const pw    = $('#login-password').value;
  clearBanners($('#login-error'));

  if (!email || !pw) {
    showBanner($('#login-error'), 'Enter your email and password.');
    return;
  }

  $('#login-spinner').classList.remove('hidden');
  $('#btn-login').disabled = true;
  await new Promise((r) => setTimeout(r, 280));

  try {
    if (isFirstRun()) {
      setLocalAuth(email, pw);
    } else if (!verifyLocalAuth(email, pw)) {
      showBanner($('#login-error'), 'Incorrect email or password.');
      return;
    }
    setSession();
    config = await window.polymind.config.get();
    if (typeof updateClock === 'function') updateClock(); // pick up displayName immediately
    if (!config.setupComplete || !config.notionToken || !config.databaseId) {
      showStep('notion');
    } else {
      showApp();
      showView('home');
      bootSync(); // fire-and-forget: UI appears instantly, syncs run in background
    }
  } finally {
    $('#login-spinner').classList.add('hidden');
    $('#btn-login').disabled = false;
  }
}

// ---- First-run Notion connect ----------------------------------

async function handleNotionConnect() {
  if (connecting) return;
  clearBanners($('#setup-error'), $('#setup-success'));

  const notionToken = $('#setup-token').value.trim();
  const databaseId  = $('#setup-database').value.trim();

  if (!notionToken || !databaseId) {
    showBanner($('#setup-error'), 'Both fields are required.');
    return;
  }

  connecting = true;
  $('#connect-spinner').classList.remove('hidden');
  $('#btn-test-connect').disabled = true;

  try {
    const result = await window.polymind.notion.test({ notionToken, databaseId });
    showBanner($('#setup-success'), `✓ Connected to "${result.title}". Syncing…`);
    $('#setup-success').classList.remove('hidden');
    await window.polymind.config.set({ notionToken, databaseId, setupComplete: true });
    config = await window.polymind.config.get();
    await new Promise((r) => setTimeout(r, 500));
    showApp();
    showView('home');
    await syncTrades();
  } catch (err) {
    showBanner($('#setup-error'), err.message || 'Connection failed.');
  } finally {
    connecting = false;
    $('#connect-spinner').classList.add('hidden');
    $('#btn-test-connect').disabled = false;
  }
}

// ---- Logout ------------------------------------------------------

function handleLogout() {
  clearSession();
  showGate('login');
}

// ---- Helpers -----------------------------------------------------

function setupToggle(btnId, inputId) {
  const btn   = $('#' + btnId);
  const input = $('#' + inputId);
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    input.type = input.type === 'text' ? 'password' : 'text';
  });
}
