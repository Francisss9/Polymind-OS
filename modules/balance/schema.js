'use strict';

// Performance Tracker database
// ID: 267f09cb5ebe802d9b95000bdb94e641
// Each row = one week entry

function notionPageToBalance(page) {
  const p = page.properties || {};
  return {
    id:            page.id,
    name:          p.Name?.title?.[0]?.plain_text || '',
    weekStart:     p.Date?.date?.start || null,
    weekEnd:       p.Date?.date?.end   || null,
    startBalance:  typeof p['Start Balance']?.number === 'number' ? p['Start Balance'].number : null,
    balance:       typeof p['End Balance']?.number   === 'number' ? p['End Balance'].number   : null,
    winningTrades: typeof p['Winning Trades']?.number === 'number' ? p['Winning Trades'].number : null,
    losingTrades:  typeof p['Losing Trades']?.number  === 'number' ? p['Losing Trades'].number  : null,
    goalMet:       p['Goal Met']?.checkbox ?? false,
    status:        p.Status?.status?.name || '',
  };
}

module.exports = { notionPageToBalance };
