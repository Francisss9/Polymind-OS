'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRendererDom } = require('./dom-harness');

function click(el) {
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('click', { bubbles: true }));
}

test('notes.js: XSS — the single most important thing this file must never regress', async (t) => {
  await t.test('a malicious note title from Notion is never inserted as live HTML in the list', async () => {
    const malicious = '<img src=x onerror="window.__pwned = true">';
    const { window } = createRendererDom();
    window.polymind.notes.getCached.mockResolvedValue({
      notes: [{ id: 'n1', title: malicious, content: 'body', tags: [], pinned: false, updatedAt: new Date().toISOString() }],
      syncedAt: null,
    });

    await window.Notes.init();

    assert.equal(window.__pwned, undefined, 'the onerror handler must never execute — if it did, this note title was inserted as live HTML instead of text');
    const listHtml = window.document.getElementById('notes-list').innerHTML;
    assert.ok(!listHtml.includes('<img'), 'the raw <img> tag must not appear unescaped in the rendered list');
    assert.ok(listHtml.includes('&lt;img'), 'the title should appear as escaped text');
  });

  await t.test('a malicious tag name never executes and never becomes a real element in the tree', async () => {
    const malicious = '"><script>window.__pwned2 = true</script>';
    const { window } = createRendererDom();
    window.polymind.notes.getCached.mockResolvedValue({
      notes: [{ id: 'n1', title: 'Note', content: '', tags: [malicious], pinned: false, updatedAt: new Date().toISOString() }],
      syncedAt: null,
    });

    await window.Notes.init();

    // This is the test that actually matters: did the payload execute.
    // (Checking for a raw "<script>" substring in re-serialized innerHTML
    // is not a meaningful check on its own — the HTML parser legitimately
    // decodes entities back to literal characters inside attribute
    // values during parsing, and re-serialization doesn't need to
    // re-escape "<"/">" there since it's inert attribute data, never
    // re-parsed as markup. What must never happen is a real <script>
    // *element* appearing in the tree, or the payload executing.)
    assert.equal(window.__pwned2, undefined, 'the payload must never execute');
    const tagRow = window.document.getElementById('notes-tag-row');
    assert.equal(tagRow.querySelector('script'), null, 'no real <script> element must exist in the tag row');
    assert.equal(tagRow.querySelectorAll('button').length, 1, 'the malicious tag must render as exactly one inert button, not extra injected elements');
  });

  await t.test('a malicious note preview (content) is escaped, not rendered live', async () => {
    const malicious = '<svg onload="window.__pwned3 = true">';
    const { window } = createRendererDom();
    window.polymind.notes.getCached.mockResolvedValue({
      notes: [{ id: 'n1', title: 'Note', content: malicious, tags: [], pinned: false, updatedAt: new Date().toISOString() }],
      syncedAt: null,
    });

    await window.Notes.init();

    assert.equal(window.__pwned3, undefined);
  });
});

test('notes.js: create', async (t) => {
  await t.test('clicking "New note" creates a note via the API and it appears in the list', async () => {
    const { window } = createRendererDom();
    window.polymind.notes.getCached.mockResolvedValue({ notes: [], syncedAt: null });
    window.polymind.notes.create.mockResolvedValue({
      id: 'new-1', title: 'Untitled', content: '', tags: [], pinned: false, updatedAt: new Date().toISOString(),
    });
    await window.Notes.init();

    click(window.document.getElementById('notes-new-btn'));
    await new Promise((r) => setTimeout(r, 20)); // let the async click handler settle

    assert.equal(window.polymind.notes.create.calls.length, 1);
    assert.equal(window.document.getElementById('notes-list').textContent.includes('Untitled'), true);
  });

  await t.test('a failed create shows a visible error in the sync bar, not just a console log', async () => {
    const { window } = createRendererDom();
    window.polymind.notes.getCached.mockResolvedValue({ notes: [], syncedAt: null });
    window.polymind.notes.create.mockRejectedValue(new Error('Notes DB not configured. Add it in Kernel settings.'));
    await window.Notes.init();

    click(window.document.getElementById('notes-new-btn'));
    await new Promise((r) => setTimeout(r, 20));

    const label = window.document.querySelector('#notes-sync-bar .notes-sync-label');
    assert.ok(label.textContent.includes('not configured'), 'the real error message must reach the screen');
    assert.equal(label.classList.contains('notes-sync-error'), true);
  });
});

test('notes.js: delete — double-click confirm pattern', async (t) => {
  async function setupWithOneNote(window) {
    window.polymind.notes.getCached.mockResolvedValue({
      notes: [{ id: 'n1', title: 'My note', content: '', tags: [], pinned: false, updatedAt: new Date().toISOString() }],
      syncedAt: null,
    });
    await window.Notes.init();
    click(window.document.querySelector('.note-item[data-id="n1"]')); // select it
  }

  await t.test('a single click on Delete only arms the confirmation, it does not delete', async () => {
    const { window } = createRendererDom();
    await setupWithOneNote(window);

    click(window.document.getElementById('notes-delete-btn'));

    assert.equal(window.polymind.notes.delete.calls.length, 0, 'must not delete on the first click');
    const label = window.document.querySelector('#notes-delete-btn .notes-btn-label');
    assert.equal(label.textContent, 'Sure?');
  });

  await t.test('a second click while armed actually deletes', async () => {
    const { window } = createRendererDom();
    await setupWithOneNote(window);

    click(window.document.getElementById('notes-delete-btn'));
    click(window.document.getElementById('notes-delete-btn'));
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(window.polymind.notes.delete.calls.length, 1);
    assert.deepEqual(window.polymind.notes.delete.calls[0], ['n1']);
  });

  await t.test('switching to a different note resets the armed confirmation, preventing an accidental delete of the wrong note', async () => {
    const { window } = createRendererDom();
    window.polymind.notes.getCached.mockResolvedValue({
      notes: [
        { id: 'n1', title: 'First', content: '', tags: [], pinned: false, updatedAt: new Date().toISOString() },
        { id: 'n2', title: 'Second', content: '', tags: [], pinned: false, updatedAt: new Date().toISOString() },
      ],
      syncedAt: null,
    });
    await window.Notes.init();
    click(window.document.querySelector('.note-item[data-id="n1"]'));
    click(window.document.getElementById('notes-delete-btn')); // arm on note 1

    click(window.document.querySelector('.note-item[data-id="n2"]')); // switch notes
    click(window.document.getElementById('notes-delete-btn')); // this must only ARM, not delete note 2
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(window.polymind.notes.delete.calls.length, 0, 'the confirm-arm state from note 1 must not carry over to note 2');
  });
});

test('notes.js: search and tag filtering', async (t) => {
  await t.test('typing in search narrows the visible list to matching titles', async () => {
    const { window } = createRendererDom();
    window.polymind.notes.getCached.mockResolvedValue({
      notes: [
        { id: 'n1', title: 'Trading plan', content: '', tags: [], pinned: false, updatedAt: new Date().toISOString() },
        { id: 'n2', title: 'Grocery list', content: '', tags: [], pinned: false, updatedAt: new Date().toISOString() },
      ],
      syncedAt: null,
    });
    await window.Notes.init();

    const search = window.document.getElementById('notes-search');
    search.value = 'trading';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));

    const listText = window.document.getElementById('notes-list').textContent;
    assert.ok(listText.includes('Trading plan'));
    assert.ok(!listText.includes('Grocery list'));
  });
});

test('notes.js: pin toggle error handling', async (t) => {
  await t.test('a failed pin toggle shows a visible error', async () => {
    const { window } = createRendererDom();
    window.polymind.notes.getCached.mockResolvedValue({
      notes: [{ id: 'n1', title: 'Note', content: '', tags: [], pinned: false, updatedAt: new Date().toISOString() }],
      syncedAt: null,
    });
    window.polymind.notes.update.mockRejectedValue(new Error('Network error'));
    await window.Notes.init();
    click(window.document.querySelector('.note-item[data-id="n1"]'));

    click(window.document.getElementById('notes-pin-btn'));
    await new Promise((r) => setTimeout(r, 20));

    const label = window.document.querySelector('#notes-sync-bar .notes-sync-label');
    assert.equal(label.classList.contains('notes-sync-error'), true);
  });
});
