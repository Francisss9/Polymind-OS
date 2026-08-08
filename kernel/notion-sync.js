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

/**
 * Merge freshly-synced rows into an existing cached collection, keyed by
 * id. Existing rows keep their position; rows present in `incoming` are
 * upserted in place, and any row in `incoming` not already present is
 * appended. Used to fold an incremental (filtered) Notion query into the
 * local cache without discarding everything that wasn't touched since
 * the last sync.
 *
 * Note: this only ever adds/updates — it cannot detect a row that was
 * deleted (archived) directly in Notion, since a filtered query never
 * returns it in the first place. A full, unfiltered sync (empty
 * `sinceIso` in the caller) still fully replaces the cache and is the
 * only path that self-heals a Notion-side deletion.
 *
 * @param {Array<object>} existing   Current cached rows
 * @param {Array<object>} incoming   Freshly-fetched rows to merge in
 * @param {string} [idKey]           Property used to match rows (default 'id')
 * @returns {Array<object>} Merged collection
 */
function mergeCollection(existing, incoming, idKey = 'id') {
  if (!incoming.length) return existing;

  const merged = existing.map((row) => ({ ...row }));
  const indexById = new Map(merged.map((row, i) => [row[idKey], i]));

  for (const row of incoming) {
    const i = indexById.get(row[idKey]);
    if (i === undefined) {
      indexById.set(row[idKey], merged.length);
      merged.push(row);
    } else {
      merged[i] = row;
    }
  }

  return merged;
}

module.exports = { queryAllPages, syncCollection, mergeCollection };
