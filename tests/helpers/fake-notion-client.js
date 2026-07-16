'use strict';

/**
 * A fake `client.databases.query` that pages through a fixed array of
 * "pages" a given number at a time, mimicking Notion's has_more/next_cursor
 * pagination contract. Lets notion-sync tests prove pagination actually
 * walks every page without needing network access or real credentials.
 *
 * @param {Array<object>} allPages   The full set of "Notion pages" to serve
 * @param {number} pageSize          How many to return per query call
 */
function createFakeNotionClient(allPages, pageSize = 2) {
  const calls = [];

  return {
    calls, // exposed so tests can assert how many requests were made
    databases: {
      async query({ database_id, start_cursor, sorts, filter }) {
        calls.push({ database_id, start_cursor, sorts, filter });
        const start = start_cursor ? Number(start_cursor) : 0;
        const slice = allPages.slice(start, start + pageSize);
        const nextIndex = start + pageSize;
        const hasMore = nextIndex < allPages.length;
        return {
          results: slice,
          has_more: hasMore,
          next_cursor: hasMore ? String(nextIndex) : null,
        };
      },
    },
  };
}

module.exports = { createFakeNotionClient };
