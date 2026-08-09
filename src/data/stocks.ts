/*
==================================================
  SLAYER TERMINAL - COMMON STOCKS ENGINE (stocks.ts)
  Ranks the shared universe on the two sleeves these
  feeds can actually back — momentum off price, flow
  off the options tape. Quality (fundamentals) and
  news (a wire) were dropped because nothing on any
  tier supplies them, and a sector-rotation board went
  with them for want of a sector taxonomy.
==================================================
*/

import { dayKey, hGauss, hRange } from '../core/rng';
import { UNIVERSE, type Sector } from './universe';
import type { Tone } from '../components/ui/tones';

export type StockVerdict = 'ACCUMULATE' | 'HOLD' | 'AVOID';

/**
 * The one lexicon the stock screens speak, same rule as
 * components/compass/verdict.ts: the engine state stays ACCUMULATE/HOLD/AVOID,
 * every surface renders STRONG/NEUTRAL/WEAK — the literal reading of a pure
 * threshold on the composite (>=68 / <=46), where "ACCUMULATE" is an instruction
 * the number does not support on its own.
 *
 * It lives beside the engine because the board and the detail drawer both render
 * it and had already drifted: a row badged STRONG while its own drawer badged
 * ACCUMULATE for the same name. Type-only import of `Tone`, so nothing from the
 * component layer survives into the bundle here.
 */
export const VERDICT_LABEL: Record<StockVerdict, string> = {
  ACCUMULATE: 'STRONG',
  HOLD: 'NEUTRAL',
  AVOID: 'WEAK',
};

// A verdict is a process state, so it takes the chrome tones (the rule in
// compass/setupState.ts). AVOID keeps bear because HOLD already owns neutral
// and WEAK must stay distinguishable from NEUTRAL.
export const VERDICT_TONE: Record<StockVerdict, Tone> = {
  ACCUMULATE: 'select',
  HOLD: 'neutral',
  AVOID: 'bear',
};

/**
 * Where a 0-100 sleeve or composite sits. The board and the detail drawer both
 * meter these and had each hard-coded their own 60/40 cut, so a name could read
 * "strong" on one and mid on the other. The THRESHOLD lives here; the class
 * strings stay in the views, because a band is a fact about the score and a
 * fill colour is a fact about the screen.
 */
export type ScoreBand = 'strong' | 'mid' | 'weak';
export const scoreBand = (v: number): ScoreBand => (v >= 60 ? 'strong' : v >= 40 ? 'mid' : 'weak');

export interface StockSleeves {
  /** All 0–100 */
  momentum: number;
  flow: number;
}

export interface StockPick {
  ticker: string;
  name: string;
  sector: Sector;
  price: number;
  changePct: number;
  sleeves: StockSleeves;
  composite: number;
  verdict: StockVerdict;
  thesis: string;
  /** 30 points of relative-strength history for the sparkline */
  trend: number[];
}


// ---- sleeves ------------------------------------------------------------------

/*
  TWO SLEEVES, because two are all this product can back.

  The board started with four — momentum, quality, flow and news. News went
  first (no news wire on any feed tier). Quality goes now for the same reason
  one step further in: it screened "margins, growth, balance sheet", and there
  is no fundamentals feed on any tier either. A composite that is half invented
  is worse than a narrower one that is true, and the two survivors are the two
  the data actually reaches — momentum off price, flow off the options tape.

  Renormalised over the survivors so the composite still spans 0-100 and the
  verdict cuts (>= 68 ACCUMULATE, <= 46 AVOID) keep meaning what they meant:
  0.39/0.707 = 0.552 and 0.317/0.707 = 0.448. Same answer from the pre-news
  originals, 0.32/0.58 and 0.26/0.58 — which is the arithmetic check that this
  is a renormalisation and not a re-weighting.
*/
const SLEEVE_WEIGHTS = { momentum: 0.552, flow: 0.448 } as const;

function sleevesFor(ticker: string, day: string): StockSleeves {
  const s = (tag: string) => `${ticker}-${day}-stk-${tag}`;
  return {
    momentum: Math.round(hRange(s('mom'), 18, 96)),
    flow: Math.round(hRange(s('flow'), 15, 95)),
  };
}

function composite(sl: StockSleeves): number {
  return Math.round(
    sl.momentum * SLEEVE_WEIGHTS.momentum + sl.flow * SLEEVE_WEIGHTS.flow
  );
}

function thesisFor(name: string, sl: StockSleeves, verdict: StockVerdict): string {
  /*
    With two sleeves, `best` and `worst` are just the higher and the lower of
    them — so the copy has to stop implying a panel of independent votes. The
    old ACCUMULATE branch said "no sleeve is fighting the trade" and the AVOID
    branch "nothing on the board argues for owning it", both of which read as a
    survey when they now describe exactly one other number. Named directly
    instead.
  */
  const ranked = [
    { k: 'momentum', v: sl.momentum, good: 'trend and RSI both constructive', bad: 'trend is broken and momentum works against you' },
    { k: 'flow', v: sl.flow, good: 'options flow and dark pool lean accumulative', bad: 'smart-money flow is distributive' },
  ].sort((a, b) => b.v - a.v);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  if (verdict === 'ACCUMULATE') {
    return `${name}: ${best.good}; ${worst.v < 45 ? `watch that ${worst.k} (${worst.v}) doesn't roll over` : `${worst.k} agrees at ${worst.v}`}. Pullbacks read cleaner than breakouts here.`;
  }
  if (verdict === 'AVOID') {
    return `${name}: ${worst.bad} (${worst.v}); ${best.v > 65 ? `${best.k} alone isn't enough to carry it` : `${best.k} is no better at ${best.v}`}. Strength here reads as supply, not a base.`;
  }
  const lead = best.good.charAt(0).toUpperCase() + best.good.slice(1);
  return `${name}: sleeves disagree. ${lead}, but ${worst.bad}. Needs a catalyst; keep it on the bench.`;
}

// ---- public API ------------------------------------------------------------------

export function buildStockBoard(): StockPick[] {
  const day = dayKey();
  return UNIVERSE.map(u => {
    const sl = sleevesFor(u.ticker, day);
    const comp = composite(sl);
    const verdict: StockVerdict = comp >= 68 ? 'ACCUMULATE' : comp <= 46 ? 'AVOID' : 'HOLD';
    const changePct = hGauss(`${u.ticker}-${day}-chg`) * 1.4 * u.beta + (comp - 55) * 0.02;
    const trend: number[] = [];
    let level = 50;
    for (let i = 0; i < 30; i++) {
      level += hGauss(`${u.ticker}-${day}-tr-${i}`) * 3 + (comp - 55) * 0.06;
      trend.push(level);
    }
    return {
      ticker: u.ticker,
      name: u.name,
      sector: u.sector,
      price: Number((u.px * (1 + changePct / 100)).toFixed(2)),
      changePct,
      sleeves: sl,
      composite: comp,
      verdict,
      thesis: thesisFor(u.name, sl, verdict),
      trend,
    };
  }).sort((a, b) => b.composite - a.composite);
}

