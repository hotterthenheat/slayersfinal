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
import { tickerSentiment } from './news';
import { SECTORS, UNIVERSE, type Sector } from './universe';

export type StockVerdict = 'ACCUMULATE' | 'HOLD' | 'AVOID';
export type SectorVerdict = 'OVERWEIGHT' | 'NEUTRAL' | 'UNDERWEIGHT';
export type RotationPhase = 'LEADING' | 'IMPROVING' | 'WEAKENING' | 'LAGGING';

export interface StockSleeves {
  /** All 0–100 */
  momentum: number;
  quality: number;
  flow: number;
  news: number;
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
}

// ---- sleeves ------------------------------------------------------------------

const SLEEVE_WEIGHTS = { momentum: 0.32, quality: 0.24, flow: 0.26, news: 0.18 } as const;

function sleevesFor(ticker: string, day: string): StockSleeves {
  const s = (tag: string) => `${ticker}-${day}-stk-${tag}`;
  return {
    momentum: Math.round(hRange(s('mom'), 18, 96)),
    quality: Math.round(hRange(s('qual'), 25, 94)),
    flow: Math.round(hRange(s('flow'), 15, 95)),
    news: Math.round(50 + tickerSentiment(ticker) * 48),
  };
}

function composite(sl: StockSleeves): number {
  return Math.round(
    sl.momentum * SLEEVE_WEIGHTS.momentum +
      sl.quality * SLEEVE_WEIGHTS.quality +
      sl.flow * SLEEVE_WEIGHTS.flow +
      sl.news * SLEEVE_WEIGHTS.news
  );
}

function thesisFor(name: string, sl: StockSleeves, verdict: StockVerdict): string {
  const ranked = [
    { k: 'momentum', v: sl.momentum, good: 'trend and RSI both constructive', bad: 'trend broken — momentum works against you' },
    { k: 'quality', v: sl.quality, good: 'fundamentals screen clean (margins, growth, balance sheet)', bad: 'fundamental screen flags deterioration' },
    { k: 'flow', v: sl.flow, good: 'options flow and dark pool lean accumulative', bad: 'smart-money flow is distributive' },
    { k: 'news', v: sl.news, good: 'news tape is a tailwind', bad: 'headline risk is live' },
  ].sort((a, b) => b.v - a.v);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  if (verdict === 'ACCUMULATE') {
    return `${name}: ${best.good}; ${worst.v < 45 ? `watch that ${worst.k} (${worst.v}) doesn't roll over` : 'no sleeve is fighting the trade'}. Pullbacks read cleaner than breakouts here.`;
  }
  if (verdict === 'AVOID') {
    return `${name}: ${worst.bad} (${worst.v}); ${best.v > 65 ? `${best.k} alone isn't enough to carry it` : 'nothing on the board argues for owning it here'}. Strength here reads as supply, not a base.`;
  }
  return `${name}: sleeves disagree — ${best.good}, but ${worst.bad.replace('—', 'and')}. Needs a catalyst; keep it on the bench.`;
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

export function buildSectorBoard(picks: StockPick[]): SectorRow[] {
  const day = dayKey();
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
    const leaders = members.slice(0, 2).map(m => m.ticker);
    // Weave each sector's own leaders + breadth/RS into the note so no two
    // cards print byte-identical copy (the old static NEUTRAL/UNDERWEIGHT
    // strings repeated verbatim across every card in the bucket).
    const lead = leaders.join(' & ') || sector;
    const note =
      verdict === 'OVERWEIGHT'
        ? `${phase === 'LEADING' ? 'Leadership intact' : 'Turning up'} — money rotating in; ${lead} carry the group at ${breadthPct}% breadth.`
        : verdict === 'UNDERWEIGHT'
          ? `${phase === 'LAGGING' ? 'Lagging on both windows' : 'Rolling over'} — ${rs1m >= 0 ? '+' : ''}${rs1m.toFixed(1)}% monthly RS; even ${lead} don't argue for fresh exposure.`
          : `Middle of the pack — ${lead} screen best; own the names, not the group (${breadthPct}% breadth).`;
    return { sector, score, rs1w, rs1m, breadthPct, phase, verdict, note, leaders };
  }).sort((a, b) => b.score - a.score || phaseRank(b.phase) - phaseRank(a.phase));
}

function phaseRank(p: RotationPhase): number {
  return p === 'LEADING' ? 3 : p === 'IMPROVING' ? 2 : p === 'WEAKENING' ? 1 : 0;
}
