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
import { qualityScore } from './qualityScore';

export type StockVerdict = 'ACCUMULATE' | 'HOLD' | 'AVOID';
export type SectorVerdict = 'OVERWEIGHT' | 'NEUTRAL' | 'UNDERWEIGHT';
export type RotationPhase = 'LEADING' | 'IMPROVING' | 'WEAKENING' | 'LAGGING';

/*
  7.3 · EVERY STAT STATES ITS WINDOW.

  "A 20-day and 60-day number are different claims and must not share a
  label." The four sleeve scores are the sharpest case on this desk: they
  are rendered as four identical bars, 0-100, in one column, and a reader
  has no way to know that momentum is a month of price and quality is a
  fiscal year of statements. Two bars the same length, measured over
  windows an order of magnitude apart, read as two equally weighted votes.

  Named here rather than in the column header so the sector board, the
  screener and any future consumer all quote the same lookback — a window
  that lives in one page's JSX is a window the next page invents again.
*/
export const SLEEVE_WINDOWS: Record<keyof StockSleeves, { window: string; note: string }> = {
  momentum: {
    window: '30 sessions',
    note: 'The intended window is price and relative strength over the last 30 sessions. The shortest of the four — it would turn first and be noisiest.',
  },
  quality: {
    window: 'last 4 quarters',
    note: 'Balance-sheet and margin health from the last four reported quarters. It moves on a filing schedule, not on price, so it can sit still for months while momentum swings.',
  },
  flow: {
    window: 'this session',
    note: 'The intended window is options and dark-pool positioning as it stands today — the freshest of the four and the one that could reverse inside an hour.',
  },
  news: {
    window: 'last 7 days',
    note: 'Scored headlines over the past week. Decays as stories age, so a name can fall on this sleeve without anything new happening.',
  },
};

/*
  7.1 · THE PER-SLEEVE METHODOLOGY DOOR, and the reason it had to be built
  before anything else on this board was touched.

  Four sleeves render as four identical bars. Two of them are COMPUTED from
  something a reader could go and check; two are drawn from the desk's
  simulator. Nothing on screen distinguished them, and the window notes
  above actively asserted inputs for all four — which for momentum and flow
  described a computation that does not happen.

  That is the Part 3 problem in a different desk: a lens with no specified
  thesis, indistinguishable from the ones that have one. The remedy is the
  same one the checklist prescribed there — say so, in the place the reader
  is looking — and the notes above have been re-worded so "the intended
  window is" carries the tense the number actually deserves.

  `derived` is the flag the door reads. It is not a quality judgement about
  the sleeve; it is the difference between a number with a source and a
  number with a seed.
*/
export interface SleeveMethod {
  /** True when the score is computed from something checkable. */
  derived: boolean;
  /** Where the number comes from, in one line. */
  source: string;
  /** The fields or steps, for a reader who wants the working. */
  detail: string;
}

export const SLEEVE_METHOD: Record<keyof StockSleeves, SleeveMethod> = {
  momentum: {
    derived: false,
    source: 'The desk simulator, seeded per name and day.',
    detail:
      'Real relative strength needs 30 sessions of price for every name on the board, and the engine seeds a candle history only for names that have been opened — four of twenty-two on a fresh desk. Rather than compute it for a handful and model it for the rest, which would put two different measurements under one bar, this sleeve is modelled for all of them and says so. The seam is Simulator.peekCandles.',
  },
  quality: {
    derived: true,
    source: 'Five ratios from the company statements, ranked across the board.',
    detail:
      'Net margin, return on equity and free-cash-flow margin carry 0.70 between them; debt-to-equity (inverted) and the current ratio carry 0.30 as guard rails. Each is scored as a PERCENTILE within this board rather than against an absolute band, so 50 is the middle of this universe and not a grade. The statements themselves are modelled, like everything else on this desk — what changed is that the bar and the fundamentals drawer now read the same numbers instead of contradicting each other.',
  },
  flow: {
    derived: false,
    source: 'The desk simulator, seeded per name and day.',
    detail:
      'Options and dark-pool positioning per name exists on the tape for the roster, and this board reaches past it to the full universe. Scoring the roster from the tape and the rest from a seed would be the same two-measurements-one-bar problem as momentum, so this is modelled throughout until the tape covers the board.',
  },
  news: {
    derived: true,
    source: 'The same scored headlines the News Room shows.',
    detail:
      'tickerSentiment over the past week, mapped from its −1…+1 range onto 2…98 so the sleeve never claims a perfect or a zero score off a handful of stories. Click through to the News Room for the articles behind it.',
  },
};

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

  /*
    §2's named columns. All four are POSITION context rather than price —
    they answer "what happens if this moves", which is the question the
    sleeves above cannot.
  */
  /** Short interest as a percent of float — the squeeze denominator. */
  shortInterestPct: number;
  /** Days to cover at average volume. Above ~5 a squeeze has fuel. */
  daysToCover: number;
  /** Net insider dollars over 90 days; negative is selling. */
  insiderNet90d: number;
  /** Free float in shares — what short interest is a percent OF. */
  floatShares: number;
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

/*
  7.2 — THE QUALITY SLEEVE READS THE STATEMENTS NOW.

  It used to be `hRange(seed, 25, 94)`: a seeded random number rendered as a
  0-100 bar under a note claiming it was balance-sheet health from the last
  four quarters. The note described inputs nothing was reading, and a reader
  who opened the fundamentals drawer on the same name could see 39% net
  margins under a quality bar of 30 — the board contradicting the drawer.

  data/fundamentals.ts had carried real ratios for every name the whole
  time. `qualityScore` composes five of them; data/qualityScore.ts carries
  the weights and the normalisation and why each is what it is.

  THE FALLBACK IS FOR NAMES OUTSIDE THE UNIVERSE ONLY — an ETF or an index
  has no statements at all. This board is built FROM the universe, so it is
  unreachable here today; it exists because a board that widens must not
  start reading a random number again the moment it does.
*/
function sleevesFor(ticker: string, day: string): StockSleeves {
  const s = (tag: string) => `${ticker}-${day}-stk-${tag}`;
  return {
    momentum: Math.round(hRange(s('mom'), 18, 96)),
    quality: qualityScore(ticker) ?? Math.round(hRange(s('qual'), 25, 94)),
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
  // States, not orders: the thesis describes what the screen SAYS, never what
  // to do about it — same doctrine as Compass verdicts.
  if (verdict === 'ACCUMULATE') {
    return `${name}: ${best.good}; ${worst.v < 45 ? `the one soft spot is ${worst.k} (${worst.v})` : 'no sleeve is fighting it'}. All four sleeves point the same way.`;
  }
  if (verdict === 'AVOID') {
    return `${name}: ${worst.bad} (${worst.v}); ${best.v > 65 ? `${best.k} alone isn't enough to carry it` : 'nothing on the board screens in its favor'}.`;
  }
  return `${name}: sleeves disagree — ${best.good}, but ${worst.bad.replace('—', 'and')}. A catalyst decides which side wins.`;
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

      /* §2's position columns. Float scales with the name's price band —
         a $400 stock has fewer shares out than a $20 one at similar cap —
         and short interest is a percent OF that float, so the two move
         together the way a real pair does. */
      floatShares: Math.round(hRange(`${u.ticker}-${day}|float`, 40e6, 3.2e9) * (u.px > 200 ? 0.35 : 1)),
      shortInterestPct: Number(hRange(`${u.ticker}-${day}|si`, 0.4, 24).toFixed(2)),
      daysToCover: Number(hRange(`${u.ticker}-${day}|dtc`, 0.3, 9.5).toFixed(1)),
      insiderNet90d: Math.round(hRange(`${u.ticker}-${day}|ins`, -180e6, 90e6)),
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
    const note =
      verdict === 'OVERWEIGHT'
        ? `${phase === 'LEADING' ? 'Leadership intact' : 'Turning up'} — money is rotating in; ${leaders.join(' & ')} carry the group.`
        : verdict === 'UNDERWEIGHT'
          ? `${phase === 'LAGGING' ? 'Lagging on both windows' : 'Rolling over'} — relative strength argues against fresh exposure.`
          : 'Middle of the pack — own the single names that screen well, not the group.';
    return { sector, score, rs1w, rs1m, breadthPct, phase, verdict, note, leaders };
  }).sort((a, b) => b.score - a.score || phaseRank(b.phase) - phaseRank(a.phase));
}

function phaseRank(p: RotationPhase): number {
  return p === 'LEADING' ? 3 : p === 'IMPROVING' ? 2 : p === 'WEAKENING' ? 1 : 0;
}
