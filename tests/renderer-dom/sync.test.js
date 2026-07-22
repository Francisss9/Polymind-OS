'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRendererDom } = require('./dom-harness');

test('sync.js: bootSync fan-out — only syncs configured databases', async (t) => {
  await t.test('when only trades is configured, only the trades sync fires', async () => {
    const { window } = createRendererDom();
    window.polymind.config.get.mockResolvedValue({ databaseId: 'db-1' });

    await window.bootSync();

    assert.equal(window.polymind.trades.sync.calls.length, 1);
    assert.equal(window.polymind.habits.sync.calls.length, 0);
    assert.equal(window.polymind.goals.sync.calls.length, 0);
    assert.equal(window.polymind.notes.sync.calls.length, 0);
    assert.equal(window.polymind.balance.sync.calls.length, 0);
  });

  await t.test('when every database is configured, every module syncs exactly once', async () => {
    const { window } = createRendererDom();
    window.polymind.config.get.mockResolvedValue({
      databaseId: 'db-1', balanceDbId: 'db-2', habitsDbId: 'db-3', goalsDbId: 'db-4', notesDbId: 'db-5',
    });

    await window.bootSync();

    assert.equal(window.polymind.trades.sync.calls.length, 1);
    assert.equal(window.polymind.balance.sync.calls.length, 1);
    assert.equal(window.polymind.habits.sync.calls.length, 1);
    assert.equal(window.polymind.goals.sync.calls.length, 1);
    assert.equal(window.polymind.notes.sync.calls.length, 1);
  });

  await t.test('when nothing is configured, nothing is synced and nothing throws', async () => {
    const { window } = createRendererDom();
    window.polymind.config.get.mockResolvedValue({});

    await assert.doesNotReject(() => window.bootSync());

    assert.equal(window.polymind.trades.sync.calls.length, 0);
    assert.equal(window.polymind.habits.sync.calls.length, 0);
  });
});

test('sync.js: regression guard — bootSync must visibly refresh every widget, not just update the cache silently', async (t) => {
  // This is the exact bug found and fixed this session: bootSync() used
  // to call the raw window.polymind.habits.sync() / goals.sync() /
  // notes.sync() IPC directly, which updated the background cache but
  // never re-rendered the on-screen widget. It looked exactly like
  // "only trades is syncing" even though habits/goals/notes were
  // silently succeeding underneath. These tests assert the actual
  // user-visible outcome, not just that an IPC call happened.

  await t.test('after bootSync, the Saving Goals widget shows freshly-synced data, not stale placeholder text', async () => {
    const { window } = createRendererDom();
    window.polymind.config.get.mockResolvedValue({ goalsDbId: 'db-4' });
    window.polymind.goals.sync.mockResolvedValue({
      goals: [{ id: 'g1', name: 'Brand New Goal From Notion', saved: 100, goal: 500 }],
    });

    await window.bootSync();

    const goalsWidget = window.document.getElementById('saving-goals-list') || window.document.querySelector('.saving-list');
    assert.ok(goalsWidget, 'the saving goals widget container must exist');
    assert.ok(goalsWidget.textContent.includes('Brand New Goal From Notion'),
      'bootSync must call the UI-refreshing syncGoals(), not the raw IPC — otherwise the fresh data syncs but never appears on screen');
  });

  await t.test('after bootSync, the Notes list shows freshly-synced notes, not the pre-sync empty state', async () => {
    const { window } = createRendererDom();
    window.polymind.config.get.mockResolvedValue({ notesDbId: 'db-5' });
    window.polymind.notes.getCached.mockResolvedValue({ notes: [], syncedAt: null });
    window.polymind.notes.sync.mockResolvedValue({
      notes: [{ id: 'n1', title: 'Freshly Synced Note', content: '', tags: [], pinned: false, updatedAt: new Date().toISOString() }],
      syncedAt: new Date().toISOString(),
    });
    await window.Notes.init(); // must be awaited before bootSync, exactly like real shell.js init()

    await window.bootSync();

    const listText = window.document.getElementById('notes-list').textContent;
    assert.ok(listText.includes('Freshly Synced Note'),
      'bootSync must call Notes.sync() (which re-renders), not the raw notes.sync IPC directly');
  });
});

test('sync.js: bootSync resilience — one failing sync must not block or crash the others', async (t) => {
  await t.test('if trades sync fails, balance still syncs successfully', async () => {
    const { window } = createRendererDom();
    window.polymind.config.get.mockResolvedValue({ databaseId: 'db-1', balanceDbId: 'db-2' });
    window.polymind.trades.sync.mockRejectedValue(new Error('Notion API down'));

    await assert.doesNotReject(() => window.bootSync());

    assert.equal(window.polymind.balance.sync.calls.length, 1, 'balance sync must still fire despite trades failing');
  });
});

test('sync.js: syncTrades', async (t) => {
  await t.test('a successful sync updates the sync status and clears any previous error banner', async () => {
    const { window } = createRendererDom();
    window.polymind.trades.sync.mockResolvedValue({
      trades: [{ id: 't1' }],
      lastSyncedAt: '2026-07-20T10:00:00.000Z',
    });
    window.document.getElementById('sync-error-bar').classList.remove('hidden'); // simulate a prior error

    await window.syncTrades();

    const errBar = window.document.getElementById('sync-error-bar');
    assert.equal(errBar.classList.contains('hidden'), true, 'a successful sync must clear any previously shown error');
    assert.ok(window.document.getElementById('sync-status').textContent.includes('Synced'));
  });

  await t.test('a failed sync shows the real error message in the error bar', async () => {
    const { window } = createRendererDom();
    window.polymind.trades.sync.mockRejectedValue(new Error('Notion token not configured. Complete setup first.'));

    await window.syncTrades();

    const errBar = window.document.getElementById('sync-error-bar');
    assert.equal(errBar.classList.contains('hidden'), false);
    assert.ok(errBar.textContent.includes('Notion token not configured'));
  });

  await t.test('calling syncTrades while one is already in flight is a safe no-op, not a duplicate request', async () => {
    const { window } = createRendererDom();
    let resolveSync;
    window.polymind.trades.sync.mockImplementation(() => new Promise((r) => { resolveSync = r; }));

    const first = window.syncTrades();
    const second = window.syncTrades(); // fired while the first is still pending

    resolveSync({ trades: [], lastSyncedAt: null });
    await Promise.all([first, second]);

    assert.equal(window.polymind.trades.sync.calls.length, 1, 'a concurrent call must be ignored, never queued or duplicated');
  });
});

test('sync.js: updateSyncStatus', async (t) => {
  await t.test('a null timestamp shows "Not synced"', () => {
    const { window } = createRendererDom();
    window.updateSyncStatus(null);
    assert.equal(window.document.getElementById('sync-status').textContent, 'Not synced');
  });

  await t.test('a real timestamp shows a formatted "Synced HH:MM" string', () => {
    const { window } = createRendererDom();
    window.updateSyncStatus('2026-07-20T14:30:00.000Z');
    assert.ok(window.document.getElementById('sync-status').textContent.startsWith('Synced'));
  });
});
