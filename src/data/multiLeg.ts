import type { FlowPrint, StratTag } from '../types/trace';

/*
==================================================
  SLAYER TERMINAL - MULTI-LEG FLOW (data/multiLeg.ts)
==================================================

  The structures in the tape — verticals, butterflies, ratios — pulled out
  of the single-leg noise and grouped by what they are.

  WHY IT IS WORTH SEPARATING. A 2,000-lot print that is one leg of a
  vertical is not a 2,000-lot directional bet, and read in the flat tape it
  looks exactly like one. A structure is a VIEW, and the reader who wants
  "who is buying calls" is badly served by a feed where half the size is
  someone financing a spread.

  WHAT THIS TAPE ACTUALLY CARRIES, stated plainly, because the honest
  version of this surface is smaller than the reference product's. Each
  print knows how many legs its structure had (`legs`) and what shape it was
  (`strat`) — it does NOT carry a link to its sibling legs. So this groups
  by structure TYPE and reports size, premium and direction per type; it
  does not reconstruct "the other side of this butterfly", because that
  relationship is not in the data and guessing it from timing would be
  inventing a fill nobody printed.

  When a feed lands that carries a structure id, `legGroups` is where it
  goes in, and every reading above it keeps working.

  THE RATIO IS THE READ. A tape that is 8% structures is a directional day;
  one that is 35% structures is a day when desks are financing and hedging,
  and price moves differently under the two. That share is the headline
  here, not any single print.
*/

export interface LegGroup {
  strat: StratTag;
  /** Prints of this shape in the window. */
  prints: number;
  /** Contracts across those prints. */
  contracts: number;
  /** Premium in dollars. */
  premium: number;
  /** Share of the window's MULTI-LEG premium, 0–100. */
  sharePct: number;
  /** Ask-side share of this shape's premium, 0–100 — who wanted it more. */
  askPct: number;
  /** Typical leg count for the shape, averaged over its prints. */
  avgLegs: number;
}

export interface MultiLegFlow {
  groups: LegGroup[];
  /** Every multi-leg print in the window. */
  prints: (FlowPrint & { at: number })[];
  multiPrints: number;
  singlePrints: number;
  /** Multi-leg share of ALL premium in the window, 0–100 — the headline. */
  structureSharePct: number;
  multiPremium: number;
  singlePremium: number;
}

const EMPTY: MultiLegFlow = {
  groups: [],
  prints: [],
  multiPrints: 0,
  singlePrints: 0,
  structureSharePct: 0,
  multiPremium: 0,
  singlePremium: 0,
};

const premiumOf = (p: FlowPrint): number => {
  const size = Number.isFinite(p.size) ? p.size : 0;
  const fill = Number.isFinite(p.fill) ? p.fill : 0;
  return size * fill * 100;
};

/**
 * Structures in the tape.
 *
 * @param tape     prints with an `at` stamp
 * @param ticker   null for every name — the structure share is a market
 *                 reading as much as a per-name one
 * @param windowMs how far back to look
 */
export function buildMultiLegFlow(
  tape: readonly (FlowPrint & { at: number })[],
  ticker: string | null,
  windowMs: number,
  now: number = Date.now()
): MultiLegFlow {
  if (tape.length === 0 || !(windowMs > 0)) return EMPTY;
  const cutoff = now - windowMs;

  const multi: (FlowPrint & { at: number })[] = [];
  const byStrat = new Map<StratTag, { prints: number; contracts: number; premium: number; ask: number; legs: number }>();
  let multiPremium = 0;
  let singlePremium = 0;
  let singlePrints = 0;

  for (const p of tape) {
    if (p.at < cutoff) continue;
    if (ticker && p.ticker !== ticker) continue;
    const prem = premiumOf(p);
    if (prem <= 0) continue;

    if (!(p.legs > 1)) {
      singlePrints += 1;
      singlePremium += prem;
      continue;
    }
    multi.push(p);
    multiPremium += prem;
    let g = byStrat.get(p.strat);
    if (!g) {
      g = { prints: 0, contracts: 0, premium: 0, ask: 0, legs: 0 };
      byStrat.set(p.strat, g);
    }
    g.prints += 1;
    g.contracts += Number.isFinite(p.size) ? p.size : 0;
    g.premium += prem;
    g.legs += p.legs;
    if (p.side === 'ASK') g.ask += prem;
  }

  if (multi.length === 0 && singlePrints === 0) return EMPTY;

  const groups: LegGroup[] = [...byStrat.entries()]
    .map(([strat, g]) => ({
      strat,
      prints: g.prints,
      contracts: g.contracts,
      premium: g.premium,
      sharePct: multiPremium > 0 ? Number(((g.premium / multiPremium) * 100).toFixed(1)) : 0,
      askPct: g.premium > 0 ? Number(((g.ask / g.premium) * 100).toFixed(0)) : 0,
      avgLegs: Number((g.legs / g.prints).toFixed(1)),
    }))
    .sort((a, b) => b.premium - a.premium);

  const total = multiPremium + singlePremium;
  return {
    groups,
    /* Newest first, the way a tape reads. */
    prints: multi.sort((a, b) => b.at - a.at),
    multiPrints: multi.length,
    singlePrints,
    structureSharePct: total > 0 ? Number(((multiPremium / total) * 100).toFixed(1)) : 0,
    multiPremium,
    singlePremium,
  };
}

/** The day's character, in a sentence — see the header on why the share is
    the headline rather than any single print. */
export function structureRead(f: MultiLegFlow): string {
  if (f.multiPrints === 0 && f.singlePrints === 0) return 'No prints in the window yet.';
  if (f.multiPrints === 0) return 'Every print in the window is a single leg — a purely directional tape.';
  const s = f.structureSharePct;
  const lead = f.groups[0];
  const shape = lead ? `, mostly ${lead.strat.toLowerCase()}s` : '';
  if (s < 12) return `${s}% of premium is structured${shape} — a directional tape.`;
  if (s < 28) return `${s}% of premium is structured${shape} — the usual mix of bets and hedges.`;
  return `${s}% of premium is structured${shape} — desks are financing and hedging more than betting.`;
}
