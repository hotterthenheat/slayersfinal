/*
  NASDAQ-listed symbols + common index ETFs, bundled from
  nasdaqTickers.json (6,300+ symbols). Used by the ticker search menu.
*/

import raw from './nasdaqTickers.json';

export interface TickerListing {
  symbol: string;
  name: string;
}

export const NASDAQ_TICKERS = raw as TickerListing[];

const bySymbol = new Map(NASDAQ_TICKERS.map(t => [t.symbol, t]));

export function tickerName(symbol: string): string {
  return bySymbol.get(symbol.toUpperCase())?.name ?? symbol.toUpperCase();
}

/** Prefix matches first (by symbol), then symbol/name substring matches. */
export function searchTickers(query: string, limit = 60): TickerListing[] {
  const q = query.trim().toUpperCase();
  if (!q) return NASDAQ_TICKERS.slice(0, limit);

  const prefix: TickerListing[] = [];
  const contains: TickerListing[] = [];
  for (const t of NASDAQ_TICKERS) {
    if (t.symbol.startsWith(q)) prefix.push(t);
    else if (t.symbol.includes(q) || t.name.toUpperCase().includes(q)) contains.push(t);
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...contains].slice(0, limit);
}
