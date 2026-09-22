'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRendererDom } = require('./dom-harness');

// Skills and Goals used to be hardcoded straight into index.html with no
// way to edit them without touching code. These tests cover the local,
// device-only editable-list behaviour that replaced that — same
// localStorage persistence path the Scratchpad and Q3 Objectives
// widgets already used, so no Notion database is involved here.

function itemTexts(window, listId) {
  return [...window.document.getElementById(listId).querySelectorAll('.li-text')]
    .map((el) => el.textContent);
}

test('Skills / Goals editable lists', async (t) => {
  await t.test('renders the seeded defaults on first load (nothing in localStorage yet)', () => {
    const { window } = createRendererDom();
    window.loadHomeData();
    window.initEditableList('skills', 'skills-list', 'skills-add');
    window.initEditableList('goals', 'goals-list', 'goals-add');

    assert.ok(itemTexts(window, 'skills-list').includes('Trading (TJR / journaling / discipline / consistency)'));
    assert.ok(itemTexts(window, 'goals-list').includes('Reach 12000€ net worth'));
  });

  await t.test('pressing Enter in the add-input appends an item and persists it', () => {
    const { window } = createRendererDom();
    window.loadHomeData();
    window.initEditableList('skills', 'skills-list', 'skills-add');

    const input = window.document.getElementById('skills-add');
    input.value = 'Public speaking';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    assert.ok(itemTexts(window, 'skills-list').includes('Public speaking'));
    assert.equal(input.value, '', 'input clears itself after adding');

    const saved = JSON.parse(window.localStorage.getItem('polymind_home'));
    assert.ok(saved.skills.includes('Public speaking'), 'new item is actually persisted, not just rendered');
  });

  await t.test('blank input on Enter is ignored (no empty items)', () => {
    const { window } = createRendererDom();
    window.loadHomeData();
    window.initEditableList('goals', 'goals-list', 'goals-add');
    const before = itemTexts(window, 'goals-list').length;

    const input = window.document.getElementById('goals-add');
    input.value = '   ';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    assert.equal(itemTexts(window, 'goals-list').length, before);
  });

  await t.test('clicking an item\'s remove control deletes it and persists', () => {
    const { window } = createRendererDom();
    window.loadHomeData();
    window.initEditableList('goals', 'goals-list', 'goals-add');
    const before = itemTexts(window, 'goals-list').length;

    window.document.querySelector('#goals-list [data-remove="0"]').dispatchEvent(new window.Event('click', { bubbles: true }));

    assert.equal(itemTexts(window, 'goals-list').length, before - 1);
    const saved = JSON.parse(window.localStorage.getItem('polymind_home'));
    assert.equal(saved.goals.length, before - 1);
  });

  await t.test('list text is HTML-escaped, not injected raw', () => {
    const { window } = createRendererDom();
    window.loadHomeData();
    window.initEditableList('skills', 'skills-list', 'skills-add');

    const input = window.document.getElementById('skills-add');
    input.value = '<img src=x onerror=alert(1)>';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const li = [...window.document.querySelectorAll('#skills-list .li-text')].pop();
    assert.equal(li.querySelector('img'), null, 'no live <img> element was created from the text');
    assert.ok(li.textContent.includes('<img'), 'the raw text is still shown, just escaped');
  });
});

// Daily Log's summary line is derived from `trades` and `habitEntries` —
// both `let`-declared in app.js/home.js, so (like `__test` in
// dom-harness.js) they're mutated here via a plain reassignment inside
// an injected <script>, not `window.trades = ...` (which would just set
// an unrelated property and never reach the real binding).
function setGlobals(window, { trades, habitEntries } = {}) {
  const script = window.document.createElement('script');
  script.textContent = `
    ${trades !== undefined ? `trades = ${JSON.stringify(trades)};` : ''}
    ${habitEntries !== undefined ? `habitEntries = ${JSON.stringify(habitEntries)};` : ''}
  `;
  window.document.body.appendChild(script);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('Daily Log widget', async (t) => {
  await t.test('shows today\'s date in the widget header', () => {
    const { window } = createRendererDom();
    window.initDailyLog();

    const now = new Date();
    const expected = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    assert.equal(window.document.getElementById('daily-log-date').textContent, expected);
  });

  await t.test('summary shows empty states when there is no habit entry or trades for today', () => {
    const { window } = createRendererDom();
    setGlobals(window, { trades: [], habitEntries: [] });
    window.renderDailyLogSummary();

    const html = window.document.getElementById('daily-log-summary').innerHTML;
    assert.match(html, /no habit entry synced for today/);
    assert.match(html, /no trades today/);
  });

  await t.test('summary reflects today\'s real habit count and trade stats once they load', () => {
    const { window } = createRendererDom();
    const today = window.todayISO();
    setGlobals(window, {
      trades: [
        { date: today, pnl: 5, result: 'Win' },
        { date: today, pnl: -2, result: 'Loss' },
        { date: '2020-01-01', pnl: 999, result: 'Win' }, // a different day — must be excluded
      ],
      habitEntries: [
        { date: today, 'Wake up early': true, GM: true, Read: true, Trading: false, Journal: false, Gym: false, '3L Hydration': false, Shower: false, 'Study/Work': false, Nutrition: false, God: false },
      ],
    });
    window.renderDailyLogSummary();

    const summary = window.document.getElementById('daily-log-summary');
    assert.match(summary.innerHTML, /3\/11.*habits done/s);
    assert.match(summary.textContent, /2 trades \(1W\/1L\)/);
    assert.match(summary.textContent, /\+3\.00/, 'net P&L for today only (5 + -2), not the excluded 999 from another day');
  });

  await t.test('loads an existing entry\'s content into the textarea on init', async () => {
    const { window, polymind } = createRendererDom();
    polymind.dailyLog.get.mockResolvedValue({ content: 'Already wrote this earlier.', updatedAt: '2026-09-13T10:00:00.000Z' });

    await window.initDailyLog();

    assert.equal(window.document.getElementById('daily-log-text').value, 'Already wrote this earlier.');
  });

  await t.test('leaves the textarea empty when there is no saved entry yet', async () => {
    const { window } = createRendererDom(); // default mock resolves null
    await window.initDailyLog();
    assert.equal(window.document.getElementById('daily-log-text').value, '');
  });

  await t.test('typing debounces the save instead of firing on every keystroke', async () => {
    const { window, polymind } = createRendererDom();
    await window.initDailyLog();

    const textEl = window.document.getElementById('daily-log-text');
    textEl.value = 'W';
    textEl.dispatchEvent(new window.Event('input', { bubbles: true }));
    textEl.value = 'Wr';
    textEl.dispatchEvent(new window.Event('input', { bubbles: true }));
    textEl.value = 'Writing.';
    textEl.dispatchEvent(new window.Event('input', { bubbles: true }));

    assert.equal(polymind.dailyLog.save.calls.length, 0, 'no save yet — still inside the debounce window');

    await wait(500);

    assert.equal(polymind.dailyLog.save.calls.length, 1, 'exactly one save, not one per keystroke');
    const [savedDate, savedContent] = polymind.dailyLog.save.calls[0];
    assert.equal(savedDate, window.todayISO());
    assert.equal(savedContent, 'Writing.');
  });
});

test('toggleHabitCheckbox — error surfacing (regression: a rejected update used to only log to console, with zero on-screen sign that anything went wrong)', async (t) => {
  function addCheckboxFixture(window, { pageId, habitName, checked }) {
    const el = window.document.createElement('div');
    el.className = `habit-checkbox${checked ? ' checked' : ''}`;
    el.dataset.page = pageId;
    el.dataset.habit = habitName;
    el.dataset.checked = String(checked);
    window.document.body.appendChild(el);
    return el;
  }

  await t.test('on success, the checkbox stays toggled and no warning appears', async () => {
    const { window, polymind } = createRendererDom();
    setGlobals(window, { habitEntries: [{ id: 'p1', 'Wake up early': false }] });
    const el = addCheckboxFixture(window, { pageId: 'p1', habitName: 'Wake up early', checked: false });
    polymind.habits.updateCheckbox.mockResolvedValue({ ok: true });

    await window.toggleHabitCheckbox('p1', 'Wake up early', false);

    assert.ok(el.classList.contains('checked'));
    assert.equal(window.document.getElementById('habit-sync-status').textContent, '');
  });

  await t.test('on failure, the checkbox reverts AND a warning naming the habit is shown, not just logged', async () => {
    const { window, polymind } = createRendererDom();
    setGlobals(window, { habitEntries: [{ id: 'p1', 'Wake up early': false }] });
    const el = addCheckboxFixture(window, { pageId: 'p1', habitName: 'Wake up early', checked: false });
    polymind.habits.updateCheckbox.mockRejectedValue(new Error('object_not_found'));

    await window.toggleHabitCheckbox('p1', 'Wake up early', false);

    assert.equal(el.classList.contains('checked'), false, 'reverted back to unchecked');
    const status = window.document.getElementById('habit-sync-status').textContent;
    assert.match(status, /Wake up early/, 'names which habit failed, not a generic message');
  });
});
