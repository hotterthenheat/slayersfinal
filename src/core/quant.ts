/*
==================================================
  SLAYER TERMINAL - QUANT ENGINE (quant.ts)
  Prove It's machinery: a deterministic Monte Carlo
  over the active name, forecast stats derived from
  the simulated distribution, and the scoreboard
  that tracks how the terminal's own engines have
  been grading out.
==================================================
*/

import { dayKey, hGauss, hRange } from './rng';
import { now as engineNow } from './clock';
import type { MarketSnapshot } from '../types/market';

// ---- Monte Carlo ---------------------------------------------------------------

export interface MonteCarloResult {
  /** Sampled paths for the fan chart (a subset of the full run) */
  paths: number[][];
  /** Percentile cone per step across the FULL run */
  cone: { p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[] };
  /** Sorted terminal prices, full run */
  terminal: number[];
  days: number;
  runs: number;
  stats: {
    probUpPct: number;
    expReturnPct: number;
    /** 95% one-tailed downside over the window, % */
    var95Pct: number;
    rangeLow: number;
    rangeHigh: number;
  };
}

const RUNS = 1200;
const DRAWN_PATHS = 90;

/*
  10 · THE MODEL, NAMED — because this is the tab that advertises rigour.

  The checklist puts it bluntly: GBM is the weakest assumption in the app,
  and it is sitting on the page that exists to demonstrate the desk can be
  trusted. A fan chart with a percentile cone and a histogram is the most
  authoritative-looking object a quant interface produces, and a reader has
  no way to know what is behind it unless the page says.

  SO THE PAGE SAYS. Not as a disclaimer at the bottom — as a card next to
  the chart naming the model and the three assumptions that are wrong in
  the direction that matters for options:

    · RETURNS ARE NOT NORMAL. Real returns have fat tails; a lognormal walk
      under-counts big moves, which is precisely the move an option buyer
      is paying for. Every tail percentile on this chart is too tight.
    · VOL IS NOT CONSTANT. Real vol clusters — quiet begets quiet, a shock
      begets a week of shocks. One sigma for the whole horizon smooths that
      away and makes the cone too smooth in both directions.
    · THERE ARE NO JUMPS. A gap is not a large diffusion step, and this
      model cannot produce one. Overnight risk is exactly the risk this
      desk's 0DTE argument is about.

  UPGRADING THIS is real work — a jump-diffusion or a bootstrapped path
  sampler — and the checklist offers either that or disclosure. Disclosure
  is what ships here, honestly labelled, rather than an upgrade rushed onto
  the page that is supposed to be the trustworthy one.
*/
export const MC_MODEL_NAME = 'Geometric Brownian motion';

export const MC_MODEL_ASSUMPTIONS: { claim: string; why: string }[] = [
  {
    claim: 'Returns are lognormal',
    why: 'Real returns have fatter tails than this. Every extreme percentile on the cone is too close in — the model under-counts exactly the moves an option buyer is paying for.',
  },
  {
    claim: 'Volatility is constant over the horizon',
    why: 'Real vol clusters: quiet begets quiet and a shock begets a week of them. One sigma for the whole path makes the cone smoother than any real week.',
  },
  {
    claim: 'Prices move continuously — no jumps',
    why: 'A gap is not a large diffusion step, and this model cannot produce one. Overnight risk is the risk this desk is built to talk about, and it is the risk this chart cannot show.',
  },
  {
    claim: 'Drift is a small trend-following term',
    why: 'Taken from the EMA spread and capped hard. It is a nudge, not a forecast — the cone is dominated by sigma, as it should be.',
  },
];

export const MC_MODEL_NOTE =
  `${MC_MODEL_NAME}, ${RUNS.toLocaleString('en-US')} paths, daily steps. This is the standard textbook model and it is the weakest assumption on this page: it has no fat tails, no vol clustering and no jumps. Read the cone as a shape, not as a probability you could trade against.`;

export function runMonteCarlo(snapshot: MarketSnapshot, ivAnnual: number, days: number): MonteCarloResult {
  const { ticker, spot, indicators } = snapshot;
  const day = dayKey();
  // Mild trend-following drift: the sim's EMAs stand in for the return forecast
  const trend = indicators.ema9 >= indicators.ema21 ? 1 : -1;
  const muAnnual = trend * Math.min(Math.abs(indicators.ema9 - indicators.ema21) / spot, 0.004) * 252 * 0.6;
  const dt = 1 / 252;
  const sig = ivAnnual * Math.sqrt(dt);
  const drift = (muAnnual - (ivAnnual * ivAnnual) / 2) * dt;

  const stepsAt: number[][] = Array.from({ length: days + 1 }, () => []);
  const paths: number[][] = [];
  const terminal: number[] = [];

  for (let r = 0; r < RUNS; r++) {
    let px = spot;
    const path: number[] = [px];
    stepsAt[0].push(px);
    for (let d = 1; d <= days; d++) {
      px *= Math.exp(drift + sig * hGauss(`${ticker}-${day}-mc-${r}-${d}`));
      path.push(px);
      stepsAt[d].push(px);
    }
    terminal.push(px);
    if (r < DRAWN_PATHS) paths.push(path);
  }

  terminal.sort((a, b) => a - b);
  const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];

  const cone = { p5: [] as number[], p25: [] as number[], p50: [] as number[], p75: [] as number[], p95: [] as number[] };
  for (let d = 0; d <= days; d++) {
    const sorted = stepsAt[d].sort((a, b) => a - b);
    cone.p5.push(q(sorted, 0.05));
    cone.p25.push(q(sorted, 0.25));
    cone.p50.push(q(sorted, 0.5));
    cone.p75.push(q(sorted, 0.75));
    cone.p95.push(q(sorted, 0.95));
  }

  const ups = terminal.filter(t => t > spot).length;
  const mean = terminal.reduce((a, t) => a + t, 0) / terminal.length;

  return {
    paths,
    cone,
    terminal,
    days,
    runs: RUNS,
    stats: {
      probUpPct: Math.round((ups / terminal.length) * 100),
      expReturnPct: ((mean - spot) / spot) * 100,
      var95Pct: ((q(terminal, 0.05) - spot) / spot) * 100,
      rangeLow: q(terminal, 0.05),
      rangeHigh: q(terminal, 0.95),
    },
  };
}

// ---- histogram -------------------------------------------------------------------

export interface HistBin {
  from: number;
  to: number;
  count: number;
  aboveSpot: boolean;
}

export function histogram(terminal: number[], spot: number, bins: number): HistBin[] {
  const lo = terminal[0];
  const hi = terminal[terminal.length - 1];
  const w = (hi - lo) / bins || 1;
  const out: HistBin[] = Array.from({ length: bins }, (_, i) => ({
    from: lo + i * w,
    to: lo + (i + 1) * w,
    count: 0,
    aboveSpot: lo + (i + 0.5) * w >= spot,
  }));
  for (const t of terminal) {
    const i = Math.min(bins - 1, Math.floor((t - lo) / w));
    out[i].count++;
  }
  return out;
}

// ---- model scoreboard --------------------------------------------------------------

/*
==================================================
  THE SCOREBOARD MOVED, AND ITS NUMBERS WERE NOT REAL (2026-09-06)
==================================================

  `modelScoreboard()` lived here and returned five engine rows whose hit
  rates were `Math.round(base + hRange(seed, -3, 3))` around a hand-picked
  base, whose samples were literals, and whose 24-point trends were a random
  walk — printed under "every engine tracked against what actually
  happened", on the one tab in the product that advertises rigour.

  It is gone. The board counts the reader's own tracked setups now, graded
  by the maturity rule that already refuses to grade anything early:
  `data/scoreboard.ts` does the arithmetic and `data/labelMaturity.ts` says
  when a claim has closed.

  WHAT SURVIVES IS THE DISCIPLINE, because it was always the valuable part.
  A hit rate is worth nothing unless the calls were fixed before the results
  were known, and `MATURITY_DAYS` and `SCOREBOARD_LOCK_NOTE` are what say so
  on the surface. They stay here, imported by the page, so the sentence and
  the horizon cannot drift apart.
*/

/** The horizon a prediction needs before it can be graded. */
export const MATURITY_DAYS = 3;

export const SCOREBOARD_LOCK_NOTE =
  'Every call counted here was recorded BEFORE its outcome was known, and is graded only after its window closed. A setup tracked yesterday on a contract that expires next month is not in this sample and cannot be, which is the only thing that makes a hit rate mean anything.';
