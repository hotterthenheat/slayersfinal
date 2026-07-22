/*
==================================================
  SLAYER TERMINAL - DARK POOL FEED (darkpoolfeed.ts)
  A market-wide, sector-grouped view of off-exchange
  prints — the same shared equity universe as Stocks,
  News and Earnings, so cross-module stories line up.
  Deterministic per ticker + session day (same pattern
  as buildStockBoard); swaps for a real consolidated
  dark-pool print feed behind the same shape.
==================================================
*/

import { UNIVERSE, SECTORS, type Sector } from './universe';
import { dayKey, hGauss, hRange, hash } from '../core/rng';

export interface DarkPoolFeedRow {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
  /** Off-exchange dollars transacted today */
  notional: number;
  /** Today's off-exchange volume as a % of average */
  avgVolPct: number;
  /** Largest cross, shares */
  size: number;
  /** Off-exchange prints today */
  prints: number;
}

export interface DarkPoolFeedSector {
  sector: Sector;
  /** Sum of member off-exchange notional */
  notional: number;
  /** Sum of member prints */
  prints: number;
  rows: DarkPoolFeedRow[];
}

/** Build the sector-grouped dark-pool feed for the shared universe. */
export function buildDarkPoolFeed(): DarkPoolFeedSector[] {
  const day = dayKey();
  const rows: (DarkPoolFeedRow & { sector: Sector })[] = UNIVERSE.map(u => {
    const seed = (k: string) => `${u.ticker}-${day}-dp-${k}`;
    const changePct = hGauss(seed('chg')) * 1.3 * u.beta;
    // Off-exchange notional scales loosely with the name's price level (a rough
    // liquidity proxy) and a per-name draw; a few names print outsized blocks.
    const liq = Math.log10(u.px + 10);
    const spike = hash(seed('spike')) % 9 === 0 ? hRange(seed('spikex'), 2.4, 4.2) : 1;
    const notional = hRange(seed('notional'), 40e6, 520e6) * liq * spike;
    const avgVolPct = hRange(seed('avgvol'), 3, 60) * (hash(seed('hot')) % 7 === 0 ? hRange(seed('hotx'), 2.6, 4) : 1);
    const size = hRange(seed('size'), 220e3, 9e6) * (spike > 1 ? 1.8 : 1);
    const prints = Math.round(hRange(seed('prints'), 8, 46));
    return {
      ticker: u.ticker,
      name: u.name,
      sector: u.sector,
      price: Number((u.px * (1 + changePct / 100)).toFixed(2)),
      changePct,
      notional,
      avgVolPct,
      size,
      prints,
    };
  });

  return SECTORS.map(sector => {
    const members = rows.filter(r => r.sector === sector).sort((a, b) => b.notional - a.notional);
    return {
      sector,
      notional: members.reduce((a, m) => a + m.notional, 0),
      prints: members.reduce((a, m) => a + m.prints, 0),
      rows: members,
    };
  })
    .filter(s => s.rows.length > 0)
    .sort((a, b) => b.notional - a.notional);
}
