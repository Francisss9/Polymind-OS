// Maps between Polymind trade objects and the Notion "Trading Tracker" database.
// Schema: Name (title), Date (date), Pair (select), Direction (select),
// Entry Price / Exit Price / P&L / R:R (number), Result (select), Notes (text)

function tradeToNotionProperties(trade) {
  const props = {
    Name: { title: [{ text: { content: trade.name || `${trade.pair} ${trade.date}` } }] },
    Date: trade.date ? { date: { start: trade.date } } : undefined,
    Pair: trade.pair ? { select: { name: trade.pair } } : undefined,
    Direction: trade.direction ? { select: { name: trade.direction } } : undefined,
    'Entry Price': typeof trade.entryPrice === 'number' ? { number: trade.entryPrice } : undefined,
    'Exit Price': typeof trade.exitPrice === 'number' ? { number: trade.exitPrice } : undefined,
    'P&L': typeof trade.pnl === 'number' ? { number: trade.pnl } : undefined,
    'R:R': typeof trade.rr === 'number' ? { number: trade.rr } : undefined,
    Result: trade.result
      ? { select: { name: trade.result } }
      : typeof trade.pnl === 'number'
        ? { select: { name: trade.pnl > 0 ? 'Win' : trade.pnl < 0 ? 'Loss' : 'Breakeven' } }
        : undefined,
    Notes: trade.notes ? { rich_text: [{ text: { content: trade.notes } }] } : undefined,
  };

  Object.keys(props).forEach((key) => props[key] === undefined && delete props[key]);
  return props;
}

function notionPageToTrade(page) {
  const p = page.properties;
  return {
    id: page.id,
    name: p.Name?.title?.[0]?.plain_text || '',
    date: p.Date?.date?.start || null,
    pair: p.Pair?.select?.name || '',
    direction: p.Direction?.select?.name || '',
    entryPrice: typeof p['Entry Price']?.number === 'number' ? p['Entry Price'].number : null,
    exitPrice: typeof p['Exit Price']?.number === 'number' ? p['Exit Price'].number : null,
    pnl: typeof p['P&L']?.number === 'number' ? p['P&L'].number : 0,
    rr: typeof p['R:R']?.number === 'number' ? p['R:R'].number : null,
    result: p.Result?.select?.name || '',
    notes: p.Notes?.rich_text?.map((t) => t.plain_text).join('') || '',
    lastEdited: page.last_edited_time,
  };
}

module.exports = { tradeToNotionProperties, notionPageToTrade };
