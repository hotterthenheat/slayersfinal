/*
==================================================
  SLAYER TERMINAL - COMMON STOCKS ENGINE (stocks.ts)
  Ranks the shared universe on four sleeves —
  momentum, quality, flow and news — then rolls the
  same sleeves up into a sector rotation board, so
  "what to buy" and "which sectors are worth being
  in" come from one composite, not two opinions.
==================================================
*/

import { dayKey, hGauss, hRange } from '../core/rng';
import { buildDarkPoolFeed } from './darkpoolfeed';
import { SECTORS, UNIVERSE, type Sector } from './universe';
import type { Tone } from '../components/ui/tones';

export type StockVerdict = 'ACCUMULATE' | 'HOLD' | 'AVOID';
export type SectorVerdict = 'OVERWEIGHT' | 'NEUTRAL' | 'UNDERWEIGHT';
export type RotationPhase = 'LEADING' | 'IMPROVING' | 'WEAKENING' | 'LAGGING';

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
  quality: number;
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

export interface SectorRow {
  sector: Sector;
  /** Composite of member stocks, 0–100 */
  score: number;
  /** 1-week relative strength vs the tape, signed % */
  rs1w: number;
  /** 1-month relative strength, signed % */
  rs1m: number;
  /** % of members above their trend */
  breadthPct: number;
  phase: RotationPhase;
  verdict: SectorVerdict;
  note: string;
  leaders: string[];
  /** Weakest two members by composite */
  laggards: string[];
  /** Names screened in the group */
  memberCount: number;
  /** Off-exchange dollars transacted across the group today (darkpoolfeed) */
  offExDollars: number;
  /** The group's share of the board's off-exchange dollars, % */
  dollarSharePct: number;
  /** Mean member off-exchange volume as a % of its own average */
  pacePct: number;
}

// ---- sleeves ------------------------------------------------------------------

// News sleeve removed (no news wire on any feed tier); the three survivors are
// renormalised to sum to 1 so the composite still spans its 0-100 range.
const SLEEVE_WEIGHTS = { momentum: 0.39, quality: 0.293, flow: 0.317 } as const;

function sleevesFor(ticker: string, day: string): StockSleeves {
  const s = (tag: string) => `${ticker}-${day}-stk-${tag}`;
  return {
    momentum: Math.round(hRange(s('mom'), 18, 96)),
    quality: Math.round(hRange(s('qual'), 25, 94)),
    flow: Math.round(hRange(s('flow'), 15, 95)),
  };
}

function composite(sl: StockSleeves): number {
  return Math.round(
    sl.momentum * SLEEVE_WEIGHTS.momentum +
      sl.quality * SLEEVE_WEIGHTS.quality +
      sl.flow * SLEEVE_WEIGHTS.flow
  );
}

function thesisFor(name: string, sl: StockSleeves, verdict: StockVerdict): string {
  const ranked = [
    { k: 'momentum', v: sl.momentum, good: 'trend and RSI both constructive', bad: 'trend is broken and momentum works against you' },
    { k: 'quality', v: sl.quality, good: 'fundamentals screen clean (margins, growth, balance sheet)', bad: 'fundamental screen flags deterioration' },
    { k: 'flow', v: sl.flow, good: 'options flow and dark pool lean accumulative', bad: 'smart-money flow is distributive' },
  ].sort((a, b) => b.v - a.v);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  if (verdict === 'ACCUMULATE') {
    return `${name}: ${best.good}; ${worst.v < 45 ? `watch that ${worst.k} (${worst.v}) doesn't roll over` : 'no sleeve is fighting the trade'}. Pullbacks read cleaner than breakouts here.`;
  }
  if (verdict === 'AVOID') {
    return `${name}: ${worst.bad} (${worst.v}); ${best.v > 65 ? `${best.k} alone isn't enough to carry it` : 'nothing on the board argues for owning it here'}. Strength here reads as supply, not a base.`;
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

/** Signed % formatted for prose — the notes quote their own inputs. */
const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

export function buildSectorBoard(picks: StockPick[]): SectorRow[] {
  const day = dayKey();
  // Rotation is a question about dollars, not only about scores, so the group
  // carries the off-exchange tape beside its relative strength. Read from the
  // dark-pool engine rather than re-rolled here: the Flow desk and this board
  // then quote the same notional for the same group.
  const dp = buildDarkPoolFeed();
  const dpBySector = new Map(dp.map(s => [s.sector as Sector, s]));
  const boardDollars = dp.reduce((a, s) => a + s.notional, 0) || 1;

  return SECTORS.map(sector => {
    const members = picks.filter(p => p.sector === sector);
    const score = Math.round(members.reduce((a, p) => a + p.composite, 0) / Math.max(members.length, 1));
    const rs1w = hGauss(`${sector}-${day}-rs1w`) * 1.2 + (score - 55) * 0.05;
    const rs1m = hGauss(`${sector}-${day}-rs1m`) * 2.2 + (score - 55) * 0.09;
    const breadthPct = Math.round(
      (members.filter(p => p.sleeves.momentum > 50).length / Math.max(members.length, 1)) * 100
    );
    const phase: RotationPhase =
      rs1m >= 0 && rs1w >= 0 ? 'LEADING' : rs1m < 0 && rs1w >= 0 ? 'IMPROVING' : rs1m >= 0 && rs1w < 0 ? 'WEAKENING' : 'LAGGING';
    const verdict: SectorVerdict = score >= 64 && phase !== 'LAGGING' ? 'OVERWEIGHT' : score <= 48 || phase === 'LAGGING' ? 'UNDERWEIGHT' : 'NEUTRAL';
    // picks arrive sorted by composite, so member order is the group's own rank.
    const leaders = members.slice(0, 2).map(m => m.ticker);
    const laggards = members.slice(-2).map(m => m.ticker);

    const feed = dpBySector.get(sector);
    const offExDollars = feed?.notional ?? 0;
    const dollarSharePct = Number(((offExDollars / boardDollars) * 100).toFixed(1));
    const rows = feed?.rows ?? [];
    const pacePct = rows.length ? Math.round(rows.reduce((a, r) => a + r.avgVolPct, 0) / rows.length) : 0;

    // Keyed on PHASE, not verdict: seven of ten groups land on NEUTRAL, so a
    // verdict-keyed template printed one sentence seven times. Phase splits the
    // board four ways and is the axis the rotation map is drawn on, so the note
    // reads as a caption for where the dot sits.
    const lead = leaders.join(' & ') || sector;
    const note =
      phase === 'LEADING'
        ? `Ahead on both windows (${pct(rs1w)} 1w, ${pct(rs1m)} 1m). ${lead} carry it at ${breadthPct}% breadth, on ${dollarSharePct}% of the board's off-exchange dollars.`
        : phase === 'IMPROVING'
          ? `The month is still ${pct(rs1m)} but the week turned up to ${pct(rs1w)}. ${lead} screen best; ${breadthPct}% of the group is above trend and the tape is running at ${pacePct}% of normal.`
          : phase === 'WEAKENING'
            ? `Month holds at ${pct(rs1m)} while the week rolled to ${pct(rs1w)}. Leadership is thinning at ${breadthPct}% breadth, ${lead} still the strongest read.`
            : `Behind on both windows (${pct(rs1w)} 1w, ${pct(rs1m)} 1m) with ${breadthPct}% above trend. ${dollarSharePct}% of off-exchange dollars sat here; ${laggards.join(' & ') || sector} anchor the bottom.`;

    return {
      sector,
      score,
      rs1w,
      rs1m,
      breadthPct,
      phase,
      verdict,
      note,
      leaders,
      laggards,
      memberCount: members.length,
      offExDollars,
      dollarSharePct,
      pacePct,
    };
  }).sort((a, b) => b.score - a.score || phaseRank(b.phase) - phaseRank(a.phase));
}

function phaseRank(p: RotationPhase): number {
  return p === 'LEADING' ? 3 : p === 'IMPROVING' ? 2 : p === 'WEAKENING' ? 1 : 0;
}
