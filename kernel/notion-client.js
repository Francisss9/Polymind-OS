'use strict';

const { Client } = require('@notionhq/client');

// Module-level cache of the *one* client the desktop app needs at a time,
// plus the token it was built with.
//
// Previous version only checked `if (!client)` and ignored the `token`
// argument on every call after the first — so a changed token silently
// kept reusing the old client unless something remembered to call
// resetNotionClient() first. That worked by accident (config:set happens
// to always reset), but it was one missed reset away from talking to
// Notion with a stale token. This version compares the token on every
// call, so passing a new token is *always* correct, with no hidden
// dependency on callers resetting first.
let client = null;
let clientToken = null;

/**
 * Get a Notion client for the given token, creating or replacing the
 * cached client as needed.
 * @param {string} token
 * @returns {import('@notionhq/client').Client | null}
 */
function getNotionClient(token) {
  if (!token) return null;

  if (!client || clientToken !== token) {
    client = new Client({ auth: token });
    clientToken = token;
  }

  return client;
}

/** Force the next getNotionClient() call to build a fresh client. */
function resetNotionClient() {
  client = null;
  clientToken = null;
}

module.exports = { getNotionClient, resetNotionClient };
