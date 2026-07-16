'use strict';

/**
 * Page through every result of a Notion database query.
 * @param {import('@notionhq/client').Client} client
 * @param {string} databaseId
 * @param {object} [options]  Extra query options (sorts, filter, page_size)
 * @returns {Promise<Array>} All result pages, across every page of results
 */
async function queryAllPages(client, databaseId, options = {}) {
  const results = [];
  let cursor;
  let hasMore = true;

  while (hasMore) {
    const res = await client.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
      ...options,
    });
    results.push(...res.results);
    hasMore = res.has_more;
    cursor = res.next_cursor;
  }

  return results;
}

/**
 * Query an entire Notion database and map each page through a schema
 * function, skipping (and logging) any row that fails to map instead of
 * failing the whole sync. This is the one piece of logic that was
 * copy-pasted, with minor drift, across trades/habits/goals/balance sync
 * in main.js — every "sync a collection from Notion" handler now goes
 * through this single implementation.
 *
 * @param {object} params
 * @param {import('@notionhq/client').Client} params.client
 * @param {string} params.databaseId
 * @param {(page: object) => object} params.mapPage   Schema fn: Notion page → local object
 * @param {object} [params.queryOptions]               Passed through to queryAllPages
 * @param {string} [params.logLabel]                    Prefix used in the skip-row warning
 * @returns {Promise<Array>} Successfully-mapped rows
 */
async function syncCollection({ client, databaseId, mapPage, queryOptions = {}, logLabel = 'sync' }) {
  const pages = await queryAllPages(client, databaseId, queryOptions);

  return pages.flatMap((page) => {
    try {
      return [mapPage(page)];
    } catch (err) {
      console.warn(`[${logLabel}] Skipped page ${page.id}: ${err.message}`);
      return [];
    }
  });
}

module.exports = { queryAllPages, syncCollection };
