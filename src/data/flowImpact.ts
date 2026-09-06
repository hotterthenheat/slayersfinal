import type { FlowPrint } from '../types/trace';
import type { StrikeNode } from '../types/market';

/*
==================================================
  SLAYER TERMINAL - FLOW AGAINST THE SURFACE (data/flowImpact.ts)
  What a print does to the exposure at the strike it hit.
==================================================

  ── THE QUESTION THIS ANSWERS ─────────────────────────────────────────────

  A flow feed on its own is a list of things that happened. The question a
  positioning desk is actually asking is narrower and much more useful:
  WHICH OF TODAY'S PRINTS MOVED THE SURFACE, AND BY HOW MUCH.

  That is one multiplication away from data this terminal already has —
  the per-contract greek is on the strike node, the size is on the print —
  and it is the join that turns two separate screens into one desk.

  ── THE THREE THINGS THIS CANNOT KNOW, SAID OUT LOUD ──────────────────────

  1. WHETHER A PRINT OPENED OR CLOSED. Open interest arrives at settlement,
     not on the tape. A print of 500 contracts might be 500 new contracts,
     or it might be someone closing 500 they already had — the first adds
     the exposure below, the second removes it, and nothing observable on
     the print says which. So `impact` is signed as IF THE PRINT OPENED and
     the page says so beside it. It is a magnitude with a direction, not a
     measurement.

  2. WHO INITIATED. A fill at the ask is evidence a buyer crossed the
     spread, not proof; a fill at the midpoint is barely evidence at all.
     `classify` returns the reading and `confidence` returns how much the
     execution itself supports it, built only from things that were
     observed: where in the spread the fill landed, how wide the spread was,
     how big the print was, and whether it swept.

  3. WHAT THE DEALER DID. Nobody outside a market maker sees their
     inventory. The direction constants here are the house assumption the
     whole terminal runs on — dealers net short both wings — and they are
     imported rather than restated so this file cannot drift from the
     surface it is annotating.
*/

/* The house assumption, and the one place a reader can find it. Mirrors
   simulator.ts's DEALER_CALL_DIR / DEALER_PUT_DIR; if those move, the
   proof that pins them against this pair fails rather than the desks
   quietly disagreeing. */
export const DEALER_CALL_DIR = -0.55;
export const DEALER_PUT_DIR = -0.53;

export type FlowSide = 'buy-initiated' | 'sell-initiated' | 'mid' | 'unknown';

export const SIDE_WORDS: Record<FlowSide, { label: string; note: string }> = {
  'buy-initiated': {
    label: 'Buy initiated',
    note: 'Filled at or near the offer — a buyer crossed the spread to get done.',
  },
  'sell-initiated': {
    label: 'Sell initiated',
    note: 'Filled at or near the bid — a seller crossed the spread to get done.',
  },
  mid: {
    label: 'Mid',
    note: 'Filled between the quotes. Both sides agreed a price; neither had to reach, so the print says little about who wanted it more.',
  },
  unknown: {
    label: 'Unknown',
    note: 'The quote around this print was too wide or too stale to read a side from it.',
  },
};

/**
 * Which side reached across, from the fill's place in the spread.
 *
 * The bands are deliberately wide at the middle: a print two cents off the
 * midpoint of a forty-cent spread is a midpoint print, and calling it
 * buy-initiated because it rounded up is the false precision this desk is
 * trying not to have.
 */
export function classify(print: FlowPrint): FlowSide {
  const spread = print.ask - print.bid;
  if (!(spread > 0)) return 'unknown';
  const pos = print.fillPos;
  if (pos >= 0.7) return 'buy-initiated';
  if (pos <= 0.3) return 'sell-initiated';
  return 'mid';
}

export interface FlowConfidence {
  /** 0-100. What the EXECUTION supports, not what the reader hopes. */
  score: number;
  /** Every input, so a reader can see which one is carrying the number. */
  parts: { label: string; score: number; note: string }[];
}

/**
 * How much the print's own execution supports the side it was given.
 *
 * Four observable things, none of them a guess about intent:
 *
 *   · how far from the midpoint the fill landed — the whole basis of the read
 *   · how wide the spread was — a fill "at the ask" of a $2-wide market is
 *     a much weaker claim than one at the ask of a 2-cent market
 *   · how large the print was — a one-lot at the offer is noise
 *   · whether it swept — a sweep is somebody taking liquidity across venues,
 *     which is the least ambiguous thing on a tape
 */
export function confidenceOf(print: FlowPrint, side: FlowSide): FlowConfidence {
  const spread = Math.max(0, print.ask - print.bid);
  const mid = (print.ask + print.bid) / 2;
  /* Distance from the midpoint, as a share of the half-spread: 0 at mid,
     1 at either quote. This is the read itself, so it carries most weight. */
  const off = spread > 0 ? Math.min(1, Math.abs(print.fill - mid) / (spread / 2)) : 0;
  /* A spread wider than a tenth of the contract's price is a market nobody
     is really quoting, and a fill inside it says correspondingly little. */
  const relSpread = mid > 0 ? spread / mid : 1;
  const tightness = Math.max(0, 1 - Math.min(1, relSpread / 0.1));
  const heft = Math.min(1, Math.log10(Math.max(1, print.size)) / 3);
  const swept = print.sweep ? 1 : 0;

  const parts = [
    { label: 'Distance from mid', score: Math.round(off * 100), note: 'How far into the spread the fill landed. At the midpoint this read has no basis at all.' },
    { label: 'Spread tightness', score: Math.round(tightness * 100), note: `Spread is ${(relSpread * 100).toFixed(1)}% of the contract's price. A fill at the quote of a wide market is a weak claim.` },
    { label: 'Size', score: Math.round(heft * 100), note: `${print.size} contracts. A one-lot at the offer is noise; a thousand is not.` },
    { label: 'Swept', score: swept * 100, note: print.sweep ? 'Taken across venues — the least ambiguous thing on a tape.' : 'Single venue. Nothing added and nothing subtracted.' },
  ];

  /* A midpoint print has nothing to be confident ABOUT, so the reading is
     capped rather than scored — the alternative is a confident "Mid", which
     is a sentence with no meaning. */
  if (side === 'mid' || side === 'unknown') {
    return { score: Math.round(Math.min(35, 20 + heft * 15)), parts };
  }
  const score = off * 0.45 + tightness * 0.25 + heft * 0.2 + swept * 0.1;
  return { score: Math.round(Math.min(99, score * 100)), parts };
}

export interface PrintImpact {
  /** Dollars of dealer gamma the strike gains if this print opened. */
  gex: number;
  /** …delta dollars. */
  dex: number;
  /** …dollars per vol point. */
  vex: number;
  /** The node the print landed on, or null when the strike is off the book. */
  node: StrikeNode | null;
}

/**
 * What one print does to the exposure at its strike, IF IT OPENED.
 *
 * The per-contract greek comes off the strike node the print hit — the same
 * node the surface is drawn from, which is the whole point: this number and
 * the cell it would move are computed from one book.
 *
 * Delta and vega per contract are recovered from the node's own OI-weighted
 * exposures rather than re-derived from a pricing model, so a print's impact
 * and the strike's total cannot disagree about what a contract is worth.
 */
export function impactOf(print: FlowPrint, chain: readonly StrikeNode[], spot: number): PrintImpact {
  const node = chain.find(n => Math.abs(n.strike - print.strike) < 0.001) ?? null;
  if (!node) return { gex: 0, dex: 0, vex: 0, node: null };

  const isCall = print.right === 'C';
  const dir = isCall ? DEALER_CALL_DIR : DEALER_PUT_DIR;
  const contracts = print.size * 100;
  const oi = Math.max(1, isCall ? node.callOI : node.putOI);

  /* Gamma is on the node per contract already. The put leg carries the
     extra sign the simulator applies, so the two legs cannot come out with
     the same sign from the same gamma. */
  const gex = contracts * node.gamma * spot * spot * 0.01 * dir * (isCall ? 1 : -1);

  /* Per contract = the strike's exposure divided by the contracts behind it.
     Recovering it this way rather than repricing keeps one definition of a
     contract's worth across the desk. */
  const dexPer = (isCall ? node.callDex : node.putDex) / (oi * 100);
  const vexPer = (isCall ? node.callVex : node.putVex) / (oi * 100);

  return { gex, dex: contracts * dexPer, vex: contracts * vexPer, node };
}

/** The windows a reader aggregates over — §43's "a single print should not
    radically alter the entire positioning map". */
export const FLOW_WINDOWS = [
  { key: '5m', label: '5m', ms: 5 * 60_000 },
  { key: '15m', label: '15m', ms: 15 * 60_000 },
  { key: '30m', label: '30m', ms: 30 * 60_000 },
  { key: 'session', label: 'Session', ms: Number.POSITIVE_INFINITY },
] as const;
export type FlowWindowKey = (typeof FLOW_WINDOWS)[number]['key'];

export interface StrikeImpact {
  strike: number;
  gex: number;
  dex: number;
  vex: number;
  contracts: number;
  prints: number;
  /** Share of the window's contracts that read as buy-initiated, 0-1. */
  buyShare: number;
}

/**
 * The window rolled up by strike — which strikes today's tape actually moved.
 *
 * This is the page's answer to "what is changing the positioning right now":
 * not a list of prints, but the strikes those prints landed on, ranked by how
 * much exposure they would have added.
 */
export function rollUp(
  prints: readonly FlowPrint[],
  chain: readonly StrikeNode[],
  spot: number
): StrikeImpact[] {
  const by = new Map<number, StrikeImpact & { buys: number }>();
  for (const p of prints) {
    const im = impactOf(p, chain, spot);
    if (!im.node) continue;
    const cur = by.get(p.strike) ?? { strike: p.strike, gex: 0, dex: 0, vex: 0, contracts: 0, prints: 0, buyShare: 0, buys: 0 };
    cur.gex += im.gex;
    cur.dex += im.dex;
    cur.vex += im.vex;
    cur.contracts += p.size;
    cur.prints += 1;
    if (classify(p) === 'buy-initiated') cur.buys += p.size;
    by.set(p.strike, cur);
  }
  return [...by.values()]
    .map(r => ({ ...r, buyShare: r.contracts > 0 ? r.buys / r.contracts : 0 }))
    .sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex));
}
