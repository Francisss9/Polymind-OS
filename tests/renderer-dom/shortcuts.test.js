'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRendererDom } = require('./dom-harness');

function press(window, key, opts = {}) {
  window.document.dispatchEvent(
    new window.KeyboardEvent('keydown', { key, bubbles: true, ...opts })
  );
}

// bindShortcuts() only fires once `#app-shell` is visible (i.e. past the
// gate), so every test here un-hides it directly rather than going
// through the full login flow — these tests are about key-handling
// logic, not auth.
function enterApp(window) {
  window.document.getElementById('app-shell').classList.remove('hidden');
}

test('keyboard shortcuts are contextual to the current view', async (t) => {
  await t.test('"n" opens the trade modal while on the Trading view', () => {
    const { window } = createRendererDom();
    enterApp(window);
    window.bindEvents();
    window.showView('dashboard');

    press(window, 'n');

    assert.equal(
      window.document.getElementById('trade-modal').classList.contains('hidden'),
      false,
      '"n" should open the trade modal on the Trading view'
    );
  });

  await t.test('"n" does nothing while on the Notes view', () => {
    const { window } = createRendererDom();
    enterApp(window);
    window.bindEvents();
    window.showView('notes');

    press(window, 'n');

    assert.equal(
      window.document.getElementById('trade-modal').classList.contains('hidden'),
      true,
      '"n" must not pop the trade modal open while looking at an unrelated view'
    );
  });

  await t.test('"n" does nothing while on the Settings view', () => {
    const { window } = createRendererDom();
    enterApp(window);
    window.bindEvents();
    window.showView('settings');

    press(window, 'n');

    assert.equal(
      window.document.getElementById('trade-modal').classList.contains('hidden'),
      true
    );
  });

  await t.test('"r" still syncs trades from a non-Trading view (global refresh, on purpose)', () => {
    const { window, polymind } = createRendererDom();
    enterApp(window);
    window.bindEvents();
    window.showView('charts'); // Charts renders off the same trades data

    press(window, 'r');

    assert.equal(
      polymind.trades.sync.calls.length,
      1,
      '"r" is a general refresh shortcut and should work from any view'
    );
  });

  await t.test('Escape still closes an open trade modal regardless of view', async () => {
    const { window } = createRendererDom();
    enterApp(window);
    window.bindEvents();
    window.showView('dashboard');
    press(window, 'n'); // open it first
    assert.equal(window.document.getElementById('trade-modal').classList.contains('hidden'), false);

    press(window, 'Escape');
    await new Promise((r) => setTimeout(r, 200)); // closeTradeModal() delays the hidden class for its leave animation

    assert.equal(window.document.getElementById('trade-modal').classList.contains('hidden'), true);
  });

  await t.test('shortcuts are ignored entirely before the app shell is visible (still on the gate)', () => {
    const { window } = createRendererDom();
    window.bindEvents();
    // deliberately not calling enterApp() — app-shell stays hidden, as it
    // does while the person is still on the login/setup gate

    press(window, 'n');

    assert.equal(
      window.document.getElementById('trade-modal').classList.contains('hidden'),
      true
    );
  });
});
