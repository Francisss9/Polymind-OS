'use strict';

/**
 * Notion's SDK throws errors whose real message is JSON-encoded inside
 * `err.body`. Every call site used to duplicate this parsing (main.js
 * previously did it twice, slightly differently, both with a silent
 * "assume it's JSON" try). Centralizing it means:
 *   - one place to harden the parsing
 *   - IPC handlers stay focused on *what* they're doing, not on
 *     unwrapping SDK error shapes
 *
 * @param {unknown} err     The caught error (Notion SDK error, or anything else)
 * @param {string}  fallback Message to use if nothing usable can be extracted
 * @returns {Error} A new Error with a clean, user-facing message
 */
function toUserError(err, fallback = 'Something went wrong.') {
  const raw = err && typeof err === 'object' ? err : {};

  if (typeof raw.body === 'string') {
    try {
      const parsed = JSON.parse(raw.body);
      if (parsed?.message) return new Error(parsed.message);
    } catch {
      // body wasn't JSON — fall through to the other cases below
    }
  }

  if (typeof raw.message === 'string' && raw.message.length > 0) {
    return new Error(raw.message);
  }

  return new Error(fallback);
}

module.exports = { toUserError };
