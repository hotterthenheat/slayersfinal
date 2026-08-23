/*
==================================================
  SLAYER TERMINAL - SESSION WALK (priceWalk.ts)
  Where a name is trading right now, as a closed
  form of (ticker, epoch).

  WHY THIS MODULE EXISTS. Two price sources used to
  answer the same question. scanUniverse.ts priced
  the ~190 names the simulator does not hold with a
  cosine walk around their reference; simulator.ts
  priced the handful it does hold by seeding a
  200-step random walk from the same reference and
  keeping wherever it landed. Nothing tied the two
  together, so a name moved the instant you clicked
  it: the scan row said one number, opening it ran
  ensureTicker, and the desk underneath said another.
  Measured across the field, 190 of 194 names took
  the walk and disagreed with their own detail view.

  The fix is one function, not one caller. This
  module holds the walk; scanUniverse reads it to
  price a name it is not holding, and simulator ties
  the tail of its seeded history down onto it, so
  promotion to live is a no-op on the number.

  IT LIVES HERE, NOT IN EITHER CALLER, because
  scanUniverse imports simulator and simulator must
  never import scanUniverse (see that file's header:
  the cycle resolves as `undefined` at module init
  and every price in the terminal arrives NaN a layer
  later). This file imports rng.ts, which imports
  nothing, so neither direction can close a loop.

  Everything here is pure. Same (ticker, iv, epoch)
  in, same price out, on any machine, forever.
==================================================
*/

import { hash } from './rng';

/**
 * The scanner sweeps on a fixed cadence rather than every price tick, so the
 * universe is quantised to the same clock. Compass's own SCAN_INTERVAL_MS is
 * 10s; matching it means a sweep reuses one universe across all six scanner
 * builds instead of rebuilding the field six times.
 */
export const SCAN_EPOCH_MS = 10_000;

export function scanEpoch(now: number = Date.now()): number {
  return Math.floor(now / SCAN_EPOCH_MS);
}

export const HOUR_EPOCHS = 360; // 3600s / SCAN_EPOCH_MS
export const SESSION_EPOCHS = 2340; // 6.5h

/** The per-name constants the walk is shaped by. Derived, never stored. */
export interface WalkPhases {
  /** Phase offsets so two names never trace the same path */
  p1: number;
  p2: number;
  /** Swing width, % — higher-vol names swing wider */
  amp: number;
}

export function walkPhases(ticker: string, iv: number): WalkPhases {
  const h = hash(ticker);
  return {
    p1: ((h % 1000) / 1000) * Math.PI * 2,
    p2: (((h >>> 11) % 1000) / 1000) * Math.PI * 2,
    amp: iv * 5.5,
  };
}

/**
 * Session path, % from base. Two cosine terms with hashed phases: a slow one on
 * roughly an hour and a fast one on roughly six minutes. Closed form, so any
 * epoch — past or future — costs the same and lands on the same number, which
 * is what lets a lean read momentum without replaying a candle buffer.
 */
export function walkPct(w: WalkPhases, epoch: number): number {
  const slow = Math.cos(epoch / 57.3 + w.p1);
  const fast = Math.cos(epoch / 9.7 + w.p2);
  return (slow * 0.72 + fast * 0.28) * w.amp;
}

/**
 * Where the name is trading at `epoch`, rounded the way every desk prints it.
 *
 * Rounding HERE and not at each call site is the point: the scanner compares
 * this against a simulator price that was tied down to it, and two call sites
 * rounding independently is how a one-cent disagreement gets reintroduced.
 */
export function sessionPrice(base: number, ticker: string, iv: number, epoch: number): number {
  return Number((base * (1 + walkPct(walkPhases(ticker, iv), epoch) / 100)).toFixed(2));
}
