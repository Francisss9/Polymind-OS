'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { queryAllPages, syncCollection, mergeCollection } = require('../../kernel/notion-sync');
const { createFakeNotionClient } = require('../helpers/fake-notion-client');

function fakePage(id, extra = {}) {
  return { id, properties: {}, ...extra };
}

test('queryAllPages', async (t) => {
  await t.test('walks every page of a multi-page result set', async () => {
    const pages = Array.from({ length: 7 }, (_, i) => fakePage(`page-${i}`));
    const client = createFakeNotionClient(pages, 3); // 3 requests: 3 + 3 + 1

    const results = await queryAllPages(client, 'db-1');

    assert.equal(results.length, 7);
    assert.deepEqual(results.map((p) => p.id), pages.map((p) => p.id));
  });

  await t.test('makes a single request when everything fits on one page', async () => {
    const pages = [fakePage('a'), fakePage('b')];
    const client = createFakeNotionClient(pages, 10);

    await queryAllPages(client, 'db-1');

    assert.equal(client.calls.length, 1);
  });

  await t.test('returns an empty array for an empty database', async () => {
    const client = createFakeNotionClient([], 5);
    const results = await queryAllPages(client, 'db-1');
    assert.deepEqual(results, []);
  });

  await t.test('forwards query options (sorts/filter) on every page request', async () => {
    const pages = Array.from({ length: 4 }, (_, i) => fakePage(`p${i}`));
    const client = createFakeNotionClient(pages, 2);
    const sorts = [{ property: 'Date', direction: 'descending' }];

    await queryAllPages(client, 'db-1', { sorts });

    assert.equal(client.calls.length, 2);
    for (const call of client.calls) {
      assert.deepEqual(call.sorts, sorts);
    }
  });
});

test('syncCollection', async (t) => {
  await t.test('maps every page through mapPage', async () => {
    const pages = [fakePage('a'), fakePage('b'), fakePage('c')];
    const client = createFakeNotionClient(pages, 10);

    const results = await syncCollection({
      client,
      databaseId: 'db-1',
      mapPage: (page) => ({ id: page.id, mapped: true }),
    });

    assert.deepEqual(results, [
      { id: 'a', mapped: true },
      { id: 'b', mapped: true },
      { id: 'c', mapped: true },
    ]);
  });

  await t.test('skips a row that fails to map instead of failing the whole sync', async () => {
    const pages = [fakePage('good-1'), fakePage('bad'), fakePage('good-2')];
    const client = createFakeNotionClient(pages, 10);

    const results = await syncCollection({
      client,
      databaseId: 'db-1',
      mapPage: (page) => {
        if (page.id === 'bad') throw new Error('malformed row');
        return { id: page.id };
      },
    });

    assert.deepEqual(results.map((r) => r.id), ['good-1', 'good-2']);
  });

  await t.test('returns an empty array if every row fails to map', async () => {
    const pages = [fakePage('a'), fakePage('b')];
    const client = createFakeNotionClient(pages, 10);

    const results = await syncCollection({
      client,
      databaseId: 'db-1',
      mapPage: () => { throw new Error('always fails'); },
    });

    assert.deepEqual(results, []);
  });
});

test('mergeCollection', async (t) => {
  await t.test('returns the existing collection unchanged when nothing new came in', () => {
    const existing = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }];
    const result = mergeCollection(existing, []);
    assert.deepEqual(result, existing);
  });

  await t.test('upserts a row that already exists in place, without reordering', () => {
    const existing = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }, { id: 'c', v: 1 }];
    const result = mergeCollection(existing, [{ id: 'b', v: 2 }]);
    assert.deepEqual(result, [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 1 }]);
  });

  await t.test('appends a row that is not already present', () => {
    const existing = [{ id: 'a', v: 1 }];
    const result = mergeCollection(existing, [{ id: 'z', v: 1 }]);
    assert.deepEqual(result, [{ id: 'a', v: 1 }, { id: 'z', v: 1 }]);
  });

  await t.test('handles a mix of updates and new rows in one call', () => {
    const existing = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }];
    const result = mergeCollection(existing, [{ id: 'b', v: 2 }, { id: 'c', v: 1 }]);
    assert.deepEqual(result, [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 1 }]);
  });

  await t.test('does not mutate the original existing array or its objects', () => {
    const original = [{ id: 'a', v: 1 }];
    const existingCopy = JSON.parse(JSON.stringify(original));
    mergeCollection(original, [{ id: 'a', v: 2 }]);
    assert.deepEqual(original, existingCopy);
  });

  await t.test('supports a custom id key', () => {
    const existing = [{ pageId: 'x', v: 1 }];
    const result = mergeCollection(existing, [{ pageId: 'x', v: 2 }], 'pageId');
    assert.deepEqual(result, [{ pageId: 'x', v: 2 }]);
  });
});
