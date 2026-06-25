const { Client } = require('@notionhq/client');

let client = null;

function getNotionClient(token) {
  if (!token) return null;
  if (!client) client = new Client({ auth: token });
  return client;
}

function resetNotionClient() {
  client = null;
}

module.exports = { getNotionClient, resetNotionClient };
