'use strict';





// =========================================================
// Gate
// =========================================================

function showGate(step = 'login') {
  $('#gate').classList.remove('hidden');
  $('#app-shell').classList.add('hidden');
  showStep(step);
}

function showApp() {
  $('#gate').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
  // Animate app shell in
  $('#app-shell').style.opacity = '0';
  requestAnimationFrame(() => {
    $('#app-shell').style.transition = 'opacity 0.25s ease';
    $('#app-shell').style.opacity = '1';
  });
}

function showStep(name) {
  ['step-login', 'step-notion'].forEach((id) => {
    $('#' + id).classList.toggle('hidden', id !== 'step-' + name);
  });
}


// =========================================================
// Step 1 — Login
// =========================================================

async function handleLogin() {
  const email = $('#login-email').value.trim();
  const pw = $('#login-password').value;
  clearBanners($('#login-error'));

  if (!email || !pw) { showBanner($('#login-error'), 'Enter your email and password.'); return; }

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
    config = await window.polymind.config.get();
    if (!config.setupComplete || !config.notionToken || !config.databaseId) {
      showStep('notion');
    } else {
      showApp();
      await loadCached();
      updateSyncStatus(config.lastSyncedAt);
      showView('home');
    }
  } finally {
    $('#login-spinner').classList.add('hidden');
    $('#btn-login').disabled = false;
  }
}


// =========================================================
// Step 2 — Notion connect
// =========================================================

async function handleNotionConnect() {
  if (connecting) return;
  clearBanners($('#setup-error'), $('#setup-success'));

  const notionToken = $('#setup-token').value.trim();
  const databaseId = $('#setup-database').value.trim();

  if (!notionToken || !databaseId) {
    showBanner($('#setup-error'), 'Both fields are required.'); return;
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


// =========================================================
// Password visibility
// =========================================================

function setupToggle(btnId, inputId) {
  const btn = $('#' + btnId), input = $('#' + inputId);
  if (!btn || !input) return;
  btn.addEventListener('click', () => { input.type = input.type === 'text' ? 'password' : 'text'; });
}