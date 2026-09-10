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
