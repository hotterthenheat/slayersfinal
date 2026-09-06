/*
==================================================
  SLAYER TERMINAL - THE STICKY BOOK (data/stickyBook.ts)
  Part 5.1 · "Sticky-strike vs sticky-delta selector,
  stated on the surface. Different choices give
  different flips."
==================================================

  MOVE SPOT AND ASK WHERE THE FLIP IS. Two textbooks give two answers,
  because they disagree about what happens to implied vol when spot
  moves, and gamma depends on vol:

    STICKY STRIKE   each strike keeps the vol it has now. The smile stays
                    nailed to the strikes; a strike's gamma changes only
                    because spot moved nearer to or further from it. The
                    usual assumption for index books over a session.

    STICKY DELTA    the smile moves WITH spot — the strike that is 2%
                    out of the money after the move wears the vol the 2%
                    OTM strike wears now. The usual assumption for single
                    names, and for anything after a large move.

  Neither is right; they are the two ends the truth lives between, and a
  desk that shows only one is guessing on the reader's behalf. This
  re-prices the book at a hypothetical spot under BOTH, with the same
  pricer every other greek on the desk reads, and re-picks the flip on
  each. The Levels desk prints both flips side by side and says which
  assumption made which.

  The book itself is held fixed (open interest, strikes) — this is the
  Spot Scenario's contract, applied to vol: "where would the levels be if
  price were there", not a forecast of how the book re-forms.
*/

import { blackScholesGreeks } from '../core/greeks';
import { pickFlip, pickWalls } from '../core/walls';
import { skewIv } from './optionChain';
import type { StrikeNode } from '../types/market';

export type StickyMode = 'strike' | 'delta';

export const STICKY_WORDS: Record<StickyMode, { label: string; note: string }> = {
  strike: {
    label: 'Sticky strike',
    note: 'Each strike keeps the vol it has now; only distance to spot changes a strike’s gamma. The usual read on an index book over one session.',
  },
  delta: {
    label: 'Sticky delta',
    note: 'The smile moves with spot; the strike that is 2% away after the move wears today’s 2%-away vol. The usual read on a single name, or after a large move.',
  },
};

export interface StickyLevels {
  flip: number | null;
  callWall: number | null;
  putWall: number | null;
}

export interface StickyRead {
  from: number;
  to: number;
  strike: StickyLevels;
  delta: StickyLevels;
  /** The two flips land on the same strike. */
  agree: boolean;
  /** How far apart they land, in price — null unless both exist. */
  flipGap: number | null;
}

/** Gamma per contract at spot S for strike K under vol σ over t years. */
const gammaAt = (S: number, K: number, t: number, iv: number): number => blackScholesGreeks(S, K, t, Math.max(0.01, iv)).gamma;

/**
 * Re-price every strike's net gamma at a new spot under one assumption.
 * Exposure is gamma × OI × multiplier × sign, so the RATIO of the new
 * per-contract gamma to the old one carries straight over to netGex.
 */
export function repriceBook(chain: readonly StrikeNode[], from: number, to: number, baseIv: number, t: number, mode: StickyMode): { strike: number; netGex: number }[] {
  return chain.map(n => {
    const ivNow = skewIv(baseIv, from, n.strike, t);
    const ivThen = mode === 'strike' ? ivNow : skewIv(baseIv, to, n.strike, t);
    const gNow = gammaAt(from, n.strike, t, ivNow);
    const gThen = gammaAt(to, n.strike, t, ivThen);
    const ratio = gNow > 0 ? gThen / gNow : 1;
    return { strike: n.strike, netGex: n.netGex * ratio };
  });
}

const levelsOf = (book: { strike: number; netGex: number }[], spot: number): StickyLevels => {
  const w = pickWalls(book, spot, n => n.netGex);
  return { flip: pickFlip(book, spot, n => n.netGex), callWall: w.callWall ?? null, putWall: w.putWall ?? null };
};

/**
 * Both books at a hypothetical spot.
 *
 * @param t years to the expiry the book is read at — a month by default,
 *   the same horizon the stability read uses
 */
export function buildStickyRead(chain: readonly StrikeNode[], from: number, to: number, baseIv: number, t = 1 / 12): StickyRead | null {
  if (chain.length === 0 || !(from > 0) || !(to > 0) || !(baseIv > 0)) return null;
  const strike = levelsOf(repriceBook(chain, from, to, baseIv, t, 'strike'), to);
  const delta = levelsOf(repriceBook(chain, from, to, baseIv, t, 'delta'), to);
  const agree = strike.flip === delta.flip;
  const flipGap = strike.flip !== null && delta.flip !== null ? Math.abs(strike.flip - delta.flip) : null;
  return { from, to, strike, delta, agree, flipGap };
}

/** The sentence the selector stands on. */
export function stickyWords(r: StickyRead): string {
  const f = (v: number | null) => (v === null ? 'no flip' : v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));
  if (r.from === r.to) return 'At today’s spot the two assumptions agree by construction — move spot to see them part.';
  if (r.agree) return `At ${f(r.to)} both assumptions put the flip at ${f(r.strike.flip)} — the choice does not matter for this move.`;
  return `At ${f(r.to)} the flip sits at ${f(r.strike.flip)} if vol stays on the strikes and at ${f(r.delta.flip)} if the smile moves with spot — ${r.flipGap === null ? 'one book has no flip at all' : `${r.flipGap.toFixed(2)} apart`}. The choice is the read.`;
}
