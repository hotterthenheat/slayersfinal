import { aggregateChain } from '../core/chainAggregate';
import { readStructure, type ChainStructure } from '../core/chainStructure';
import { fmtMonthDay } from '../core/calendar';
import { isMonthlyExpiry } from '../core/expiryCalendar';
import Simulator from '../core/simulator';
import type { ExpiryBook, MarketSnapshot } from '../types/market';

/*
==================================================
  SLAYER TERMINAL - WHICH EXPIRY IS HOLDING THIS UP (data/expiryDependency.ts)

  Take one expiry out of the book, fold what is left, and read the structure
  again. The difference is that expiry's contribution — not a weight anyone
  chose, not a score, an arithmetic difference between two chains.

  WHY THIS COULD NOT BE BUILT BEFORE. The per-expiry surface used to be a
  PROJECTION of the aggregate chain: one book at the front month's time, scaled
  across the calendar by a decay. Removing an expiry from that removes a scaled
  copy of the whole, so the "dependency" you measure is a property of the decay
  function. `core/chainAggregate.ts` inverted it — the books are primary and the
  chain is their fold — so the subtraction is now real.

  WHAT IT REPORTS, AND WHAT IT REFUSES TO. Every figure here is the quantity it
  actually is: a share of gross gamma, a dollar move of the flip, a dollar move
  of a wall. There is deliberately no 0-100 "dependency score". This codebase
  removed the contract grade for being a weighted mean of hand-chosen factors,
  and a structural measure compressed to an unlabelled 0-100 hides exactly the
  same thing — whether it is a share, a rank or a distance. "Removing 0DTE moves
  the flip $2.40 and cuts gross gamma 34%" is the same information, and a reader
  can check it.

  THE ONE JUDGEMENT IT MAKES is naming the load-bearing expiry, and the rule is
  a BINARY FACT rather than a ranking: an expiry is load-bearing when removing it
  FLIPS THE SIGN of net dealer gamma. Long-gamma and short-gamma are opposite
  regimes — dips absorbed versus hedging amplifying the move — so an expiry the
  sign depends on is holding the regime up, and one it does not is not, however
  large it is.

  The first version of this rule ranked expiries by how far removing them moved
  the gamma flip, and it was discarded after being measured rather than after
  being argued about: across the tickers it was run on, every flip move came back
  0.00, so the rule named nothing and would have shipped a permanently empty
  headline. The flip is robust to losing one expiry because the positioning skew
  that sets it is shared across the calendar. `flipMove` is still reported — it
  is a real quantity and it will move on real per-expiry skew — it just cannot
  carry the judgement.

  `heaviest` is reported separately and is a different claim: the largest share
  of gross gamma. The two are not the same expiry, and conflating them is how a
  desk ends up asserting that the biggest thing is the important thing.
==================================================
*/

export interface ExpiryContribution {
  /** '0DTE', 'Aug 22' — the same labels the gamma matrix uses. */
  label: string;
  dte: number;
  isMonthly: boolean;
  /** Open interest this expiry carries, contracts. */
  openInterest: number;
  /** This expiry's own net dealer gamma, signed dollars. */
  ownGex: number;
  /** Its share of the chain's GROSS gamma — Σ|netGex| — as a fraction 0…1. */
  grossShare: number;
  /** The whole structure as it reads with this expiry gone. */
  without: ChainStructure;
  /** Dollar moves of each level when it goes. Always ≥ 0. */
  flipMove: number;
  callWallMove: number;
  putWallMove: number;
  centerMove: number;
  /** Net gamma remaining, as a fraction of the full chain's. Signed. */
  gexRemaining: number;
  /**
   * Removing this expiry inverts the sign of net dealer gamma — the chain reads
   * long-gamma without it and short-gamma with it, or the reverse. The regime
   * depends on this one expiry.
   */
  regimeCritical: boolean;
}

export interface ExpiryDependencyView {
  full: ChainStructure;
  contributions: ExpiryContribution[];
  /**
   * The nearest expiry whose removal inverts the sign of net gamma, or null when
   * the regime survives losing any single expiry.
   */
  loadBearing: ExpiryContribution | null;
  /** The largest share of gross gamma. A different claim — size, not dependency. */
  /**
   * The expiry carrying the largest share of gross gamma. NULL on an empty
   * calendar — a root with no listed expiries has no heaviest one, and saying
   * so is cheaper than the alternative, which was a `reduce` with no seed
   * throwing "Reduce of empty array with no initial value" and taking the whole
   * Dependency route down with it.
   */
  heaviest: ExpiryContribution | null;
  /** Gross gamma across the whole chain — the denominator for every share. */
  grossGex: number;
}

const grossOf = (book: ExpiryBook): number => book.nodes.reduce((a, n) => a + Math.abs(n.netGex), 0);
const oiOf = (book: ExpiryBook): number =>
  book.nodes.reduce((a, n) => a + n.callOI.value + n.putOI.value, 0);

/**
 * The dependency read for one snapshot.
 *
 * `step` comes from the ticker config so the removed-chain structure is read
 * with the same wall fallback the live one uses — a different step would make
 * the two readings differ for a reason that has nothing to do with the book.
 */
export function buildExpiryDependency(snapshot: MarketSnapshot): ExpiryDependencyView {
  const { chain, chainByExpiry, spot } = snapshot;
  const step = Simulator.TICKERS[snapshot.ticker]?.step ?? 1;
  const full = readStructure(chain, spot, step);

  const grossGex = chain.reduce((a, n) => a + Math.abs(n.netGex), 0);

  const contributions = chainByExpiry.map((book, i) => {
    // Fold everything EXCEPT this book, then read it with the same function that
    // read the full chain. Index rather than date equality: two books can never
    // share an index, and a date comparison would need its own tolerance rules.
    const without = readStructure(aggregateChain(chainByExpiry.filter((_, j) => j !== i)), spot, step);

    return {
      label: book.expiry.dte === 0 ? '0DTE' : fmtMonthDay(book.expiry.date),
      dte: book.expiry.dte,
      isMonthly: isMonthlyExpiry(book.expiry.date),
      openInterest: oiOf(book),
      ownGex: book.nodes.reduce((a, n) => a + n.netGex, 0),
      grossShare: grossGex > 0 ? grossOf(book) / grossGex : 0,
      without,
      flipMove: Math.abs(without.flip - full.flip),
      callWallMove: Math.abs(without.callWall - full.callWall),
      putWallMove: Math.abs(without.putWall - full.putWall),
      centerMove: Math.abs(without.gammaCenter - full.gammaCenter),
      // Signed on purpose: an expiry can be carrying enough of one side that
      // removing it FLIPS the sign of net gamma, and that is the single most
      // important thing this engine can surface. A magnitude would hide it.
      gexRemaining: full.netGex !== 0 ? without.netGex / full.netGex : 0,
      // Strict sign inversion. `Math.sign` rather than a `< 0` product so a chain
      // that nets exactly zero — sign 0 — is never called an inversion of
      // anything; it has no regime to invert.
      regimeCritical:
        Math.sign(without.netGex) !== 0 &&
        Math.sign(full.netGex) !== 0 &&
        Math.sign(without.netGex) !== Math.sign(full.netGex),
    };
  });

  /*
    `contributions` is nearest-first, so the first match IS the nearest — no sort
    and no tiebreak rule to get wrong.
  */
  const loadBearing = contributions.find(c => c.regimeCritical) ?? null;
  const heaviest = contributions.length
    ? contributions.reduce((a, b) => (b.grossShare > a.grossShare ? b : a))
    : null;

  return { full, contributions, loadBearing, heaviest, grossGex };
}
