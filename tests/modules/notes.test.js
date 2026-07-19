'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { notionPageToNote, noteToNotionProperties, sortNotes } = require('../../modules/notes/schema');

test('notionPageToNote', async (t) => {
  await t.test('maps a fully-populated page', () => {
    const page = {
      id: 'note-1',
      last_edited_time: '2026-07-18T09:00:00.000Z',
      properties: {
        Title: { title: [{ plain_text: 'Trading plan' }] },
        Content: { rich_text: [{ plain_text: 'Risk 2% max.' }] },
        Tags: { multi_select: [{ name: 'trading' }, { name: 'discipline' }] },
        Pinned: { checkbox: true },
      },
    };
    const note = notionPageToNote(page);
    assert.equal(note.id, 'note-1');
    assert.equal(note.title, 'Trading plan');
    assert.equal(note.content, 'Risk 2% max.');
    assert.deepEqual(note.tags, ['trading', 'discipline']);
    assert.equal(note.pinned, true);
    assert.equal(note.updatedAt, '2026-07-18T09:00:00.000Z');
  });

  await t.test('untitled note falls back to a placeholder, not an empty string', () => {
    const note = notionPageToNote({ id: 'note-2', properties: {} });
    assert.equal(note.title, 'Untitled');
  });

  await t.test('falls back to a Name title property if Title is absent', () => {
    const page = {
      id: 'note-3',
      properties: { Name: { title: [{ plain_text: 'Legacy title' }] } },
    };
    const note = notionPageToNote(page);
    assert.equal(note.title, 'Legacy title');
  });

  await t.test('empty content, tags, and pinned default sanely', () => {
    const note = notionPageToNote({ id: 'note-4', properties: {} });
    assert.equal(note.content, '');
    assert.deepEqual(note.tags, []);
    assert.equal(note.pinned, false);
  });
});

test('noteToNotionProperties', async (t) => {
  await t.test('includes only the fields provided', () => {
    const props = noteToNotionProperties({ title: 'Hi', content: 'Body' });
    assert.deepEqual(Object.keys(props).sort(), ['Content', 'Title']);
  });

  await t.test('omits a field entirely when it is undefined', () => {
    const props = noteToNotionProperties({ title: 'Only title' });
    assert.ok(!('Content' in props));
    assert.ok(!('Tags' in props));
    assert.ok(!('Pinned' in props));
  });

  await t.test('pinned:false is still included (false is meaningful, not "unset")', () => {
    const props = noteToNotionProperties({ pinned: false });
    assert.equal(props.Pinned.checkbox, false);
  });

  await t.test('tags map to multi_select name objects', () => {
    const props = noteToNotionProperties({ tags: ['a', 'b'] });
    assert.deepEqual(props.Tags.multi_select, [{ name: 'a' }, { name: 'b' }]);
  });
});

test('sortNotes', async (t) => {
  await t.test('pinned notes come before unpinned, regardless of date', () => {
    const notes = [
      { id: '1', pinned: false, updatedAt: '2026-07-18T00:00:00.000Z' },
      { id: '2', pinned: true,  updatedAt: '2026-01-01T00:00:00.000Z' },
    ];
    const sorted = sortNotes(notes);
    assert.equal(sorted[0].id, '2');
    assert.equal(sorted[1].id, '1');
  });

  await t.test('within the same pinned state, most recently edited comes first', () => {
    const notes = [
      { id: 'old', pinned: false, updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'new', pinned: false, updatedAt: '2026-07-18T00:00:00.000Z' },
    ];
    const sorted = sortNotes(notes);
    assert.equal(sorted[0].id, 'new');
  });

  await t.test('does not mutate the original array', () => {
    const notes = [{ id: '1', pinned: false, updatedAt: '2026-01-01T00:00:00.000Z' }];
    const original = [...notes];
    sortNotes(notes);
    assert.deepEqual(notes, original);
  });
});
