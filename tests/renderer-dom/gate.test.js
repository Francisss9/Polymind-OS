'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRendererDom } = require('./dom-harness');

function fillLogin(window, email, password) {
  window.document.getElementById('login-email').value = email;
  window.document.getElementById('login-password').value = password;
}

test('gate.js: first-run login', async (t) => {
  await t.test('any email+password on first run becomes the local credentials and logs in', async () => {
    const { window } = createRendererDom();
    window.polymind.config.get.mockResolvedValue({ setupComplete: false });
    fillLogin(window, 'me@example.com', 'hunter2');

    await window.handleLogin();

    assert.equal(window.isFirstRun(), false, 'credentials should now exist');
    assert.equal(window.hasActiveSession(), true, 'a session should be set on successful login');
  });

  await t.test('first-run login with incomplete Notion setup routes to the Notion connect step, not the app', async () => {
    const { window } = createRendererDom();
    window.polymind.config.get.mockResolvedValue({ setupComplete: false });
    fillLogin(window, 'me@example.com', 'hunter2');

    await window.handleLogin();

    const notionStep = window.document.getElementById('step-notion');
    const loginStep = window.document.getElementById('step-login');
    assert.equal(notionStep.classList.contains('hidden'), false, 'Notion step should be visible');
    assert.equal(loginStep.classList.contains('hidden'), true, 'Login step should be hidden');
  });

  await t.test('empty email or password is rejected with a visible error, no session is created', async () => {
    const { window } = createRendererDom();
    fillLogin(window, '', '');

    await window.handleLogin();

    assert.equal(window.hasActiveSession(), false);
    const err = window.document.getElementById('login-error');
    assert.equal(err.classList.contains('hidden'), false);
  });
});

test('gate.js: returning-user login', async (t) => {
  await t.test('correct password on a returning visit succeeds', async () => {
    const { window } = createRendererDom();
    window.polymind.config.get.mockResolvedValue({ setupComplete: false });
    fillLogin(window, 'me@example.com', 'correct-password');
    await window.handleLogin(); // establishes local auth (first run)
    window.clearSession(); // simulate closing and reopening the app

    fillLogin(window, 'me@example.com', 'correct-password');
    await window.handleLogin();

    assert.equal(window.hasActiveSession(), true);
  });

  await t.test('wrong password on a returning visit is rejected and no session is granted', async () => {
    const { window } = createRendererDom();
    window.polymind.config.get.mockResolvedValue({ setupComplete: false });
    fillLogin(window, 'me@example.com', 'correct-password');
    await window.handleLogin();
    window.clearSession();

    fillLogin(window, 'me@example.com', 'WRONG-password');
    await window.handleLogin();

    assert.equal(window.hasActiveSession(), false, 'a wrong password must never grant a session');
    const err = window.document.getElementById('login-error');
    assert.equal(err.classList.contains('hidden'), false, 'an incorrect-password error must be visible');
  });

  await t.test('a fully-configured returning user goes straight to the app, not the Notion step', async () => {
    const { window } = createRendererDom();
    window.polymind.config.get.mockResolvedValue({
      setupComplete: true, notionToken: 'secret_abc', databaseId: 'db-1',
    });
    fillLogin(window, 'me@example.com', 'correct-password');

    await window.handleLogin();

    const shell = window.document.getElementById('app-shell');
    assert.equal(shell.classList.contains('hidden'), false, 'app shell should be visible');
  });
});

test('gate.js: session-based auto-login is a real security boundary, not just a UI convenience', async (t) => {
  await t.test('hasActiveSession is false until a session is explicitly set', () => {
    const { window } = createRendererDom();
    assert.equal(window.hasActiveSession(), false);
  });

  await t.test('a corrupted session value in localStorage is treated as "no session", not as a crash or a bypass', () => {
    const { window } = createRendererDom();
    window.localStorage.setItem('polymind_session', '{not valid json');
    assert.equal(window.hasActiveSession(), false);
  });

  await t.test('logout clears the session so a subsequent check reports no active session', async () => {
    const { window } = createRendererDom();
    window.polymind.config.get.mockResolvedValue({ setupComplete: false });
    fillLogin(window, 'me@example.com', 'hunter2');
    await window.handleLogin();
    assert.equal(window.hasActiveSession(), true);

    window.handleLogout();

    assert.equal(window.hasActiveSession(), false);
  });

  await t.test('logout returns the person to the login gate, not the Notion step', async () => {
    const { window } = createRendererDom();
    window.polymind.config.get.mockResolvedValue({ setupComplete: false });
    fillLogin(window, 'me@example.com', 'hunter2');
    await window.handleLogin();

    window.handleLogout();

    const loginStep = window.document.getElementById('step-login');
    assert.equal(loginStep.classList.contains('hidden'), false);
  });
});

test('gate.js: first-run Notion connect', async (t) => {
  await t.test('a successful connection test saves config and lands on the app', async () => {
    const { window } = createRendererDom();
    window.polymind.notion.test.mockResolvedValue({ title: 'My Trades' });
    window.document.getElementById('setup-token').value = 'secret_abc';
    window.document.getElementById('setup-database').value = 'db-123';

    await window.handleNotionConnect();

    assert.equal(window.polymind.config.set.calls.length, 1);
    const [savedPayload] = window.polymind.config.set.calls[0];
    assert.equal(savedPayload.setupComplete, true);
    assert.equal(savedPayload.notionToken, 'secret_abc');
  });

  await t.test('a failed connection test shows the error and never saves config', async () => {
    const { window } = createRendererDom();
    window.polymind.notion.test.mockRejectedValue(new Error('Invalid token'));
    window.document.getElementById('setup-token').value = 'bad_token';
    window.document.getElementById('setup-database').value = 'db-123';

    await window.handleNotionConnect();

    assert.equal(window.polymind.config.set.calls.length, 0, 'config must never be saved after a failed test');
    const err = window.document.getElementById('setup-error');
    assert.equal(err.classList.contains('hidden'), false);
  });

  await t.test('missing token or database ID is rejected before ever calling the Notion API', async () => {
    const { window } = createRendererDom();
    window.document.getElementById('setup-token').value = '';
    window.document.getElementById('setup-database').value = '';

    await window.handleNotionConnect();

    assert.equal(window.polymind.notion.test.calls.length, 0, 'must not call the API with empty fields');
  });

  await t.test('a connect attempt already in progress is not fired twice concurrently', async () => {
    const { window } = createRendererDom();
    let resolveTest;
    window.polymind.notion.test.mockImplementation(() => new Promise((r) => { resolveTest = r; }));
    window.document.getElementById('setup-token').value = 'secret_abc';
    window.document.getElementById('setup-database').value = 'db-123';

    const first = window.handleNotionConnect();
    const second = window.handleNotionConnect(); // fired while the first is still pending

    resolveTest({ title: 'DB' });
    await Promise.all([first, second]);

    assert.equal(window.polymind.notion.test.calls.length, 1, 'a second concurrent attempt must be ignored, not queued or duplicated');
  });
});

test('gate.js: password visibility toggles', async (t) => {
  await t.test('clicking the login password toggle switches its input type', () => {
    const { window } = createRendererDom();
    const input = window.document.getElementById('login-password');
    const toggle = window.document.getElementById('toggle-pw');
    assert.equal(input.type, 'password');

    window.setupToggle('toggle-pw', 'login-password');
    toggle.dispatchEvent(new window.Event('click', { bubbles: true }));

    assert.equal(input.type, 'text');
  });
});
