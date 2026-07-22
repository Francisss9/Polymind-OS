'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRendererDom } = require('./dom-harness');

function click(el) {
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('click', { bubbles: true }));
}

test('settings.js: save', async (t) => {
  await t.test('leaving the token field blank does not overwrite the saved token — the whole point of the placeholder', async () => {
    const { window } = createRendererDom();
    window.document.getElementById('settings-token').value = ''; // deliberately blank
    window.document.getElementById('settings-database').value = 'db-1';

    await window.handleSettingsSave();

    const [payload] = window.polymind.config.set.calls[0];
    assert.ok(!('notionToken' in payload), 'notionToken must be entirely absent from the payload when the field is blank, not sent as an empty string that would wipe the real token');
  });

  await t.test('a filled-in token field is included in the save payload', async () => {
    const { window } = createRendererDom();
    window.document.getElementById('settings-token').value = 'secret_newtoken';

    await window.handleSettingsSave();

    const [payload] = window.polymind.config.set.calls[0];
    assert.equal(payload.notionToken, 'secret_newtoken');
  });

  await t.test('the token field is cleared after a successful save, so it never lingers visibly on screen', async () => {
    const { window } = createRendererDom();
    window.document.getElementById('settings-token').value = 'secret_newtoken';

    await window.handleSettingsSave();

    assert.equal(window.document.getElementById('settings-token').value, '');
  });

  await t.test('a save failure shows the real error message, not a generic one', async () => {
    const { window } = createRendererDom();
    window.polymind.config.set.mockRejectedValue(new Error('Disk write failed'));

    await window.handleSettingsSave();

    const err = window.document.getElementById('settings-error');
    assert.equal(err.classList.contains('hidden'), false);
    assert.ok(err.textContent.includes('Disk write failed'));
  });

  await t.test('display name and every database ID field are all included in the save payload', async () => {
    const { window } = createRendererDom();
    window.document.getElementById('settings-display-name').value = 'Francis';
    window.document.getElementById('settings-database').value = 'db-1';
    window.document.getElementById('settings-habits-db').value = 'db-2';
    window.document.getElementById('settings-goals-db').value = 'db-3';
    window.document.getElementById('settings-balance-db').value = 'db-4';
    window.document.getElementById('settings-notes-db').value = 'db-5';

    await window.handleSettingsSave();

    const [payload] = window.polymind.config.set.calls[0];
    assert.equal(payload.displayName, 'Francis');
    assert.equal(payload.databaseId, 'db-1');
    assert.equal(payload.habitsDbId, 'db-2');
    assert.equal(payload.goalsDbId, 'db-3');
    assert.equal(payload.balanceDbId, 'db-4');
    assert.equal(payload.notesDbId, 'db-5');
  });
});

test('settings.js: test connection', async (t) => {
  await t.test('a successful test shows the real database title back to the user', async () => {
    const { window } = createRendererDom();
    window.polymind.notion.test.mockResolvedValue({ title: 'My Trading Journal' });
    window.document.getElementById('settings-database').value = 'db-1';

    await window.handleSettingsTest();

    const success = window.document.getElementById('settings-success');
    assert.equal(success.classList.contains('hidden'), false);
    assert.ok(success.textContent.includes('My Trading Journal'));
  });

  await t.test('a failed test shows the real error, not a generic message', async () => {
    const { window } = createRendererDom();
    window.polymind.notion.test.mockRejectedValue(new Error('Unauthorized — check your token'));

    await window.handleSettingsTest();

    const err = window.document.getElementById('settings-error');
    assert.ok(err.textContent.includes('Unauthorized'));
  });
});

test('settings.js: disconnect — double-click confirm pattern', async (t) => {
  await t.test('a single click only arms the confirmation, it does not disconnect', () => {
    const { window } = createRendererDom();
    window.bindEvents(); // real production wiring, not calling the handler directly

    click(window.document.getElementById('btn-disconnect'));

    assert.equal(window.polymind.config.set.calls.length, 0);
    assert.equal(window.document.getElementById('btn-disconnect').textContent, 'Sure? Click again');
  });

  await t.test('a second click while armed actually disconnects and clears the stored credentials', () => {
    const { window } = createRendererDom();
    window.bindEvents();

    click(window.document.getElementById('btn-disconnect'));
    click(window.document.getElementById('btn-disconnect'));

    assert.equal(window.polymind.config.set.calls.length, 1);
    const [payload] = window.polymind.config.set.calls[0];
    assert.equal(payload.setupComplete, false);
    assert.equal(payload.notionToken, '', 'the token must be actively wiped, not merely left unset');
  });

  await t.test('disconnecting routes to the Notion connect step so the person can immediately reconnect', () => {
    const { window } = createRendererDom();
    window.bindEvents();

    click(window.document.getElementById('btn-disconnect'));
    click(window.document.getElementById('btn-disconnect'));

    const notionStep = window.document.getElementById('step-notion');
    assert.equal(notionStep.classList.contains('hidden'), false);
  });
});
