/*
==================================================
  SLAYER TERMINAL - WEIGH QUERY (weighQuery.ts)
  The Weigher's free-text contract line. Order-free:
  every token binds the slot it names and the rest
  keep their current picker state — typing steers
  the controls, it never replaces them.

  "TSLA 550C 08/14" · "363c 0d" · "put 550" · "HD"
  all parse; unclaimed tokens surface as leftovers,
  never silently dropped. Dates resolve through the
  clock-aware calendar, so a pinned replay parses
  identically (a bare MM/DD in the past means NEXT
  year — nobody weighs an expired contract on
  purpose).

  Collision rule worth naming: C and P alone are
  RIGHTS, not tickers (sorry, Citigroup) — glued
  forms like 550C exist precisely so the short
  tokens stay unambiguous.
==================================================
*/

import { today } from '../../core/calendar';

export interface WeighQuery {
  ticker: string | null;
  strike: number | null;
  right: 'C' | 'P' | null;
  /** Calendar days out — from a "3d" token or a resolved date token. */
  dte: number | null;
  /** Tokens that bound nothing. Shown, never swallowed. */
  leftovers: string[];
}

const RIGHT_WORDS: Record<string, 'C' | 'P'> = {
  C: 'C',
  CALL: 'C',
  CALLS: 'C',
  P: 'P',
  PUT: 'P',
  PUTS: 'P',
};

export function parseWeighQuery(raw: string): WeighQuery {
  const out: WeighQuery = { ticker: null, strike: null, right: null, dte: null, leftovers: [] };
  const tokens = raw.trim().toUpperCase().split(/[\s,]+/).filter(Boolean);

  for (const t of tokens) {
    // Glued strike+right: 550C / 362.5P / 550CALL
    let m = t.match(/^(\d+(?:\.\d+)?)(C|P|CALL|CALLS|PUT|PUTS)$/);
    if (m) {
      if (out.strike === null) out.strike = Number(m[1]);
      if (out.right === null) out.right = RIGHT_WORDS[m[2]];
      continue;
    }
    // Right words — checked before ticker shape so bare C/P stay rights
    if (RIGHT_WORDS[t] !== undefined) {
      if (out.right === null) out.right = RIGHT_WORDS[t];
      continue;
    }
    // DTE: 0d / 3d / 45dte
    m = t.match(/^(\d+)(?:D|DTE)$/);
    if (m) {
      if (out.dte === null) out.dte = Number(m[1]);
      continue;
    }
    // Date: MM/DD or MM/DD/YY(YY), resolved against the ENGINE clock
    m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (m) {
      if (out.dte === null) {
        const now = today();
        const yy = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.getFullYear();
        let d = new Date(yy, Number(m[1]) - 1, Number(m[2]));
        if (!m[3] && d < now) d = new Date(yy + 1, Number(m[1]) - 1, Number(m[2]));
        out.dte = Math.max(0, Math.round((d.getTime() - now.getTime()) / 86_400_000));
      }
      continue;
    }
    // First bare number is the strike
    if (/^\d+(?:\.\d+)?$/.test(t)) {
      if (out.strike === null) out.strike = Number(t);
      continue;
    }
    // Ticker shape
    if (/^[A-Z]{1,5}$/.test(t)) {
      if (out.ticker === null) out.ticker = t;
      continue;
    }
    out.leftovers.push(t);
  }
  return out;
}

/** A typed strike buys the nearest REAL strike — the grid is the market's,
    and the picker never invents a rung the chain doesn't list. */
export function nearestListed(strike: number, listed: number[]): number | null {
  if (listed.length === 0) return null;
  return listed.reduce((b, s) => (Math.abs(s - strike) < Math.abs(b - strike) ? s : b), listed[0]);
}

/** The line split for autocompletion: `current` is the token still being
    typed (no trailing separator yet), `prefix` is everything already
    committed. "TSLA 51" → prefix "TSLA ", current "51". */
export function splitCurrent(raw: string): { prefix: string; current: string } {
  const m = raw.match(/^(.*?)([^\s,]*)$/);
  return { prefix: m ? m[1] : raw, current: m ? m[2] : '' };
}
