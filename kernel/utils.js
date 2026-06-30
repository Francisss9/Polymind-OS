'use strict';

/**
 * Extracts a clean 32-char Notion database ID from a raw string.
 * Accepts: full Notion URLs, UUIDs with dashes, bare 32-char hex strings.
 */
function normalizeDatabaseId(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const match = raw.match(/([a-f0-9]{32})/i);
  if (match) return match[1];
  return raw.replace(/[-\s]/g, '');
}

module.exports = { normalizeDatabaseId };
