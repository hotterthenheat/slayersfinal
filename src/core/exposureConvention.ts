import { DEALER_BOOK, type DealerBookConvention } from './dealerBook';
import type { MarketSnapshot, StrikeNode } from '../types/market';

/*
==================================================
  SLAYER TERMINAL - RE-CONVENTION THE CHAIN (core/exposureConvention.ts)
  Show the same book under the other assumption, and let the reader watch the
  regime invert while every magnitude stays put.

  WHY THIS IS THE WHOLE POINT. Black-Scholes gamma is identical and positive for
  a call and a put at the same strike, so the call-versus-put sign in a
  gamma-exposure figure is an assumption about who holds which side — not a
  property of the greek, and not anything the entitled data can settle. Nothing
  in OPRA names the holder of a contract.

  A reader cannot see that in the output. Flip the convention and long-gamma /
  range-bound becomes short-gamma / trending, support becomes acceleration, and
  every number on screen looks exactly as authoritative as it did a second
  earlier. Naming the assumption in a subtitle helps; letting someone flip it and
  watch the conclusion inverts is the version they will believe.

  WHY IT IS A CHAIN TRANSFORM AND NOT A VIEW FLAG. `core/dealerBook.ts` said this
  needed engine work — that the figure is baked in at simulation time so
  switching it live means recomputing the chain. That was half right and the
  wrong half mattered: it DOES mean recomputing the chain, and the chain can be
  recomputed here, from data the snapshot already carries.

      callGex = callOI × 100 × gamma × spot² × 0.01 × convention.call

  Every input on the right is on `StrikeNode` — `callOI`, `putOI`, `gamma` — plus
  `spot` from the snapshot. Nothing needs re-pricing, because the CONVENTION does
  not move gamma; it only decides which way the inventory it sits on points.

  So the transform runs at the top of a desk, the existing builders consume the
  result unchanged, and every derived figure downstream — the map, the levels,
  the regime words, the king strike — restates itself coherently with no second
  copy of the arithmetic anywhere.

  WHAT IT DELIBERATELY DOES NOT TOUCH. Delta exposure. `netDex` is built on the
  standard delta-weighted-OI DISPLAY convention — call delta positive, put delta
  negative — so the profile reads call-heavy above spot and put-heavy below with
  no dealer-direction overlay at all. It carries no inventory assumption, so
  there is nothing here to flip, and flipping it would invent one.

  WHAT IT CANNOT DO. Spot, IV and rate shocks. Those move gamma itself, and
  re-deriving gamma needs each strike's implied vol and tenor, which
  `StrikeNode` does not carry. That is genuine engine work; this is not.
==================================================
*/

/** The other book. Same magnitudes, opposite inventory. */
export const INVERTED_BOOK: DealerBookConvention = {
  call: -DEALER_BOOK.call,
  put: -DEALER_BOOK.put,
  label: 'Dealers short calls, long puts',
};

export const CONVENTIONS = [DEALER_BOOK, INVERTED_BOOK] as const;

/**
 * One strike under a different book.
 *
 * The per-leg exposure is `OI × multiplier × greek × (scale) × direction`, so
 * moving from one convention to another is a ratio: divide out the direction the
 * figure was built with, multiply in the new one. Doing it that way rather than
 * rebuilding from `OI × gamma × spot²` keeps this in step with the simulator's
 * own formula automatically — if the multiplier or the 1%-scaling ever changes
 * there, the ratio still holds and this file needs no edit.
 */
function reconventionNode(node: StrikeNode, to: DealerBookConvention): StrikeNode {
  const callRatio = to.call / DEALER_BOOK.call;
  const putRatio = to.put / DEALER_BOOK.put;

  const callGex = node.callGex * callRatio;
  const putGex = node.putGex * putRatio;
  const callVex = node.callVex * callRatio;
  const putVex = node.putVex * putRatio;

  return {
    ...node,
    callGex,
    putGex,
    netGex: callGex + putGex,
    callVex,
    putVex,
    netVex: callVex + putVex,
    // callDex / putDex / netDex untouched — see the header. They carry a display
    // convention, not an inventory one.
  };
}

/**
 * The snapshot as it would read under `to`.
 *
 * Returns the SAME OBJECT when `to` is the convention the chain was built with,
 * so the default path allocates nothing and a memo upstream keeps its identity.
 */
export function withConvention(snapshot: MarketSnapshot, to: DealerBookConvention): MarketSnapshot {
  if (to.call === DEALER_BOOK.call && to.put === DEALER_BOOK.put) return snapshot;
  return { ...snapshot, chain: snapshot.chain.map(n => reconventionNode(n, to)) };
}

/**
 * Net dealer gamma across a chain — the one figure whose SIGN is the regime.
 *
 * Exported so a pane can state the inversion as a fact rather than asking the
 * reader to compare two screens from memory: this book reads X, the other reads
 * −X, and the strikes did not move.
 */
export const netGammaOf = (chain: StrikeNode[]): number => chain.reduce((a, n) => a + n.netGex, 0);
