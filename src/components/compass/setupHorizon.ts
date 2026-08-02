/*
==================================================
  SLAYER TERMINAL - SCANNER HORIZON LANGUAGE
  What a contract's expiry lets a screen call its
  exit levels, and how that expiry is spelled.
==================================================
*/

import { expiryFor, isoDate, today } from '../../core/calendar';

/*
  The engine hands the screens a bucket label ("0DTE") and nothing else, so each
  screen invented its own words for the two exit levels and both landed on
  "Swing Target" — a lie on a contract that expires this session. The horizon is
  the only thing entitled to decide what those levels are called, so it decides
  once, here, and the card, the table and the compare pane all read it.

  Value-only module (no component export) so importing it never trips
  react-refresh, matching ./compass/verdict.ts.
*/

export interface ExpiryRead {
  /**
   * CALENDAR days to the resolved expiry. Sorts and dates read from this.
   * It is NOT the horizon: ask for a 0DTE on a Saturday and the nearest session
   * is Monday, so this says 2 while the contract is still a same-session trade.
   */
  dte: number;
  /** Sessions the contract lives, per the engine's bucket. The horizon. */
  bucketDte: number;
  /** The engine's bucket label, verbatim, e.g. "0DTE". */
  bucket: string;
  /** MM/DD/YY — the house expiry format (src/core/calendar.ts). */
  date: string;
  /** "Mon" — the tell that makes a bad date obvious. */
  weekday: string;
  /** "0DTE · 08/03/26" — what a card or a row shows. */
  chip: string;
  /** "Expires Mon 08/03/26 · 0DTE" — what a panel header shows. */
  sentence: string;
}

/** "0DTE" → 0, "1DTE" → 1. Anything unreadable is treated as same-session. */
export function dteOfBucket(bucket: string): number {
  const n = parseInt(bucket, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

// Resolving a bucket walks the market calendar, and every card on screen asks
// the same two or three questions every sweep. Keyed by the day as well as the
// bucket so a terminal left open overnight does not keep yesterday's date.
const readCache = new Map<string, ExpiryRead>();

export function expiryRead(bucket: string): ExpiryRead {
  const key = `${isoDate(today())}|${bucket}`;
  const hit = readCache.get(key);
  if (hit) return hit;

  const bucketDte = dteOfBucket(bucket);
  const exp = expiryFor(bucketDte);
  const read: ExpiryRead = {
    dte: exp.dte,
    bucketDte,
    bucket,
    date: exp.label,
    weekday: exp.weekday,
    chip: `${bucket} · ${exp.label}`,
    sentence: `Expires ${exp.weekday} ${exp.label} · ${bucket}`,
  };
  readCache.set(key, read);
  return read;
}

export interface HorizonCopy {
  /** The upper level the engine projects for this contract's life. */
  target: string;
  /** The tighter level, taken before the horizon closes. */
  exit: string;
  /** One line of plain English about how long the contract lives. */
  hold: string;
}

/**
 * Horizon-honest names for the two exit levels. The engine's two multipliers are
 * aggressiveness tiers, not time horizons, so the word for them has to come from
 * the DTE. "Swing" survives only past a week, which is the point at which it
 * describes something — it matches the SWINGS sleeve in core/contractScore.ts.
 *
 * Feed this `bucketDte`, never `dte`. A 0DTE contract read on a Saturday is two
 * calendar days from its expiry and is still a same-session trade; keying off
 * the calendar gap would have it calling itself a weekly.
 */
export function horizonCopy(bucketDte: number): HorizonCopy {
  if (bucketDte <= 0) return { target: 'Session Target', exit: 'Momentum Exit', hold: 'Expires this session' };
  if (bucketDte === 1) return { target: 'Overnight Target', exit: 'Scalp Exit', hold: 'Carries one session' };
  if (bucketDte <= 7) return { target: 'Weekly Target', exit: 'Scalp Exit', hold: `Carries ${bucketDte} sessions` };
  return { target: 'Swing Target', exit: 'Scalp Exit', hold: `Carries ${bucketDte} sessions` };
}

/**
 * Name a scanner preset by the expiries it actually selected: "0DTE", or
 * "0-1DTE" when a preset spans two. Read from the setups a sweep returned, so
 * the tab strip cannot drift from the engine the way a second hard-coded table
 * would.
 */
export function expiryRangeLabel(buckets: string[]): string {
  if (buckets.length === 0) return '';
  const dtes = [...new Set(buckets.map(dteOfBucket))].sort((a, b) => a - b);
  const lo = dtes[0];
  const hi = dtes[dtes.length - 1];
  return lo === hi ? `${lo}DTE` : `${lo}-${hi}DTE`;
}
