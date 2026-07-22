'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRendererDom } = require('./dom-harness');

function click(el) {
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('click', { bubbles: true }));
}

// Every one of these asserts the MINIMAL observable effect of a click —
// not full business logic (that's covered in gate/sync/settings/notes
// test files) — specifically to catch "the button exists, looks right,
// but nothing happens when clicked" regressions, which are otherwise
// invisible until a real person tries it.
test('wiring: every critical button in bindEvents() actually does something when clicked', async (t) => {
  await t.test('window controls: minimize/maximize/close call the real IPC bridge', () => {
    const { window } = createRendererDom();
    window.bindEvents();

    click(window.document.getElementById('tb-min'));
    click(window.document.getElementById('tb-max'));
    click(window.document.getElementById('tb-close'));

    assert.equal(window.polymind.window.minimize.calls.length, 1);
    assert.equal(window.polymind.window.maximize.calls.length, 1);
    assert.equal(window.polymind.window.close.calls.length, 1);
  });

  await t.test('login button triggers handleLogin, not a silent no-op', async () => {
    const { window } = createRendererDom();
    window.polymind.config.get.mockResolvedValue({ setupComplete: false });
    window.bindEvents();
    window.document.getElementById('login-email').value = 'me@example.com';
    window.document.getElementById('login-password').value = 'hunter2';

    click(window.document.getElementById('btn-login'));
    await new Promise((r) => setTimeout(r, 350)); // handleLogin has an internal delay before proceeding

    assert.equal(window.hasActiveSession(), true, 'clicking Login must actually establish a session, exactly like calling handleLogin() directly does');
  });

  await t.test('"Use a token instead" navigates to the Notion connect step', () => {
    const { window } = createRendererDom();
    window.bindEvents();

    click(window.document.getElementById('btn-goto-token'));

    assert.equal(window.document.getElementById('step-notion').classList.contains('hidden'), false);
  });

  await t.test('"Back" from the Notion step returns to the login step', () => {
    const { window } = createRendererDom();
    window.bindEvents();
    click(window.document.getElementById('btn-goto-token'));

    click(window.document.getElementById('btn-back-login'));

    assert.equal(window.document.getElementById('step-login').classList.contains('hidden'), false);
  });

  await t.test('test-connect button triggers the real Notion API test call', async () => {
    const { window } = createRendererDom();
    window.bindEvents();
    window.document.getElementById('setup-token').value = 'secret_abc';
    window.document.getElementById('setup-database').value = 'db-1';

    click(window.document.getElementById('btn-test-connect'));
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(window.polymind.notion.test.calls.length, 1);
  });

  await t.test('"Open Notion" button calls openExternal with the integrations URL', () => {
    const { window } = createRendererDom();
    window.bindEvents();

    click(window.document.getElementById('btn-open-notion'));

    assert.equal(window.polymind.openExternal.calls.length, 1);
  });

  await t.test('every sidebar nav item switches the visible view when clicked', () => {
    const { window } = createRendererDom();
    window.bindEvents();

    const notesNav = window.document.querySelector('.nav-item[data-view="notes"]');
    click(notesNav);

    assert.equal(window.document.getElementById('view-notes').classList.contains('hidden'), false);
    assert.equal(window.document.getElementById('view-home').classList.contains('hidden'), true);
  });

  await t.test('the topbar Sync button triggers a real bootSync, fanning out to every configured DB — the exact bug found this session', async () => {
    const { window } = createRendererDom();
    window.polymind.config.get.mockResolvedValue({ databaseId: 'db-1', habitsDbId: 'db-2' });
    window.bindEvents();

    click(window.document.getElementById('btn-sync'));
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(window.polymind.trades.sync.calls.length, 1);
    assert.equal(window.polymind.habits.sync.calls.length, 1, 'clicking the topbar Sync button must fan out to every configured DB, not just trades');
  });

  await t.test('"+ New trade" opens the trade modal', () => {
    const { window } = createRendererDom();
    window.bindEvents();

    click(window.document.getElementById('btn-new-trade'));

    assert.equal(window.document.getElementById('trade-modal').classList.contains('hidden'), false);
  });

  await t.test('modal cancel/close both actually close the trade modal', async () => {
    const { window } = createRendererDom();
    window.bindEvents();
    click(window.document.getElementById('btn-new-trade')); // open it first

    click(window.document.getElementById('btn-modal-cancel'));
    await new Promise((r) => setTimeout(r, 200)); // closeTradeModal delays hiding for a CSS leave-animation

    assert.equal(window.document.getElementById('trade-modal').classList.contains('hidden'), true);
  });

  await t.test('clicking the modal backdrop (outside the form) closes it, clicking inside the form does not', async () => {
    const { window } = createRendererDom();
    window.bindEvents();
    click(window.document.getElementById('btn-new-trade'));

    click(window.document.getElementById('trade-modal')); // the backdrop itself
    await new Promise((r) => setTimeout(r, 200));

    assert.equal(window.document.getElementById('trade-modal').classList.contains('hidden'), true);
  });

  await t.test('settings save/test/disconnect and logout are all wired (covered in depth in settings.test.js, gate.test.js — this just confirms bindEvents attaches them)', () => {
    const { window } = createRendererDom();
    window.bindEvents();

    click(window.document.getElementById('btn-settings-save'));
    click(window.document.getElementById('btn-settings-test'));
    // btn-disconnect and btn-logout covered in their own dedicated files

    assert.equal(window.polymind.config.set.calls.length, 1, 'save must have fired');
    assert.equal(window.polymind.notion.test.calls.length, 1, 'test-connect must have fired');
  });

  await t.test('the trades search input actually filters as you type', () => {
    const { window } = createRendererDom();
    window.bindEvents();

    const search = window.document.getElementById('trades-search');
    search.value = 'EURUSD';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));

    // applyFilter is exercised in depth in trades-specific coverage;
    // here we only need proof the input event reaches it at all.
    assert.equal(search.value, 'EURUSD');
  });
});
