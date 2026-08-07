/*
==================================================
  SLAYER TERMINAL - GAMMA ROLL-OFF CALENDAR (gammaRolloff.ts)  [P4.5]
  Every option expires on a date, and the dealer gamma living on it vanishes
  when it does. The pin that held price on Thursday is gone Friday afternoon.
  This is the schedule: how much gamma sits on each of the root's next listed
  expiries, so a known future regime shift stops being a surprise.

  Expiries come from core/expiryCalendar (P3.2) — the ones the root actually
  lists, holiday-aware — so a daily index shows a rung every session while a
  monthly name shows third Fridays. Gamma at an expiry is modelled the same way
  the strike x expiry matrix models it (data/gex.ts): ATM gamma density scales
  ~1/sqrt(t), so a nearer expiry carries more per contract, and a standard
  monthly (OPEX) carries an open-interest concentration on top. The book's gross
  gamma anchors the front; the rest scale off it.
==================================================
*/

import { expiryCalendar, listingConvention, type ListingConvention } from '../core/expiryCalendar';
import { fmtExpiryShort } from '../core/calendar';
import type { MarketSnapshot } from '../types/market';

export interface RolloffExpiry {
  date: Date;
  /** '0DTE' or a short month/day. */
  label: string;
  dte: number;
  sessions: number;
  /** True for a standard monthly (third-Friday) expiry — the OPEX rungs. */
  opex: boolean;
  /** $ gamma expiring on this date (magnitude). */
  gamma: number;
  /** Share of the shown horizon's gamma expiring here, 0-1. */
  share: number;
  /** Cumulative share expired through this date, 0-1. */
  cumShare: number;
}

export interface GammaRolloffView {
  ticker: string;
  convention: ListingConvention;
  expiries: RolloffExpiry[];
  /** Total gamma across the shown horizon, $. */
  totalGamma: number;
  /** The single expiry shedding the most gamma. */
  biggest: RolloffExpiry | null;
  /** Sessions until half the horizon's gamma has rolled off. */
  halfLifeSessions: number;
}

/** A standard monthly expiry — the third Friday, where OI concentrates. */
function isOpex(d: Date): boolean {
  return d.getDay() === 5 && d.getDate() >= 15 && d.getDate() <= 21;
}

/** OI concentration relative to the front: 0DTE is heavy, OPEX carries a bump,
    ordinary rungs sit below. Multiplies the 1/sqrt(t) gamma density. */
function oiWeight(dte: number, opex: boolean): number {
  if (dte === 0) return 1;
  if (opex) return 1.35;
  return 0.7;
}

export function buildGammaRolloff(snapshot: MarketSnapshot): GammaRolloffView {
  const { ticker, chain } = snapshot;
  const expiries = expiryCalendar(ticker);
  const gross = chain.reduce((a, n) => a + Math.abs(n.netGex), 0);
  const tFront = expiries[0]?.t ?? 1;

  const raw = expiries.map(e => {
    const density = Math.sqrt(tFront / e.t); // 1 at the front, <1 further out
    return gross * density * oiWeight(e.dte, isOpex(e.date));
  });
  const totalGamma = raw.reduce((a, x) => a + x, 0) || 1;

  let cum = 0;
  const rows: RolloffExpiry[] = expiries.map((e, i) => {
    const share = raw[i] / totalGamma;
    cum += share;
    return {
      date: e.date,
      label: e.dte === 0 ? '0DTE' : fmtExpiryShort(e.date),
      dte: e.dte,
      sessions: e.sessions,
      opex: isOpex(e.date),
      gamma: raw[i],
      share,
      cumShare: cum,
    };
  });

  const biggest = rows.reduce<RolloffExpiry | null>((b, r) => (!b || r.gamma > b.gamma ? r : b), null);
  const half = rows.find(r => r.cumShare >= 0.5);

  return {
    ticker,
    convention: listingConvention(ticker),
    expiries: rows,
    totalGamma,
    biggest,
    halfLifeSessions: half ? half.sessions : rows[rows.length - 1]?.sessions ?? 0,
  };
}
