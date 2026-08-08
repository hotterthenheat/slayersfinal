/*
==================================================
  SLAYER TERMINAL - QUANT ENGINE (quant.ts)
  Prove It's machinery: a deterministic Monte Carlo
  over the active name, forecast stats derived from
  the simulated distribution, and the scoreboard —
  the terminal's engines replayed over the generated
  history they run on, scored on calls that actually
  resolve there.
==================================================
*/

import { dayKey, hGauss } from './rng';
import Simulator from './simulator';
import { buildFlowSweeps } from '../data/flowSweeps';
import type { Candle, MarketSnapshot } from '../types/market';

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
  The scoreboard used to be a hand-typed table: five engines, hit rates 68/64/71/
  61/66 and sample sizes 412/286/530/348/124 passed straight to a row builder.
  Rendered under "every engine tracked against what actually happened" that is a
  claim five models were backtested over hundreds of observations. Nothing had
  been. The sparkline beside each was a random walk, and "edge bps/signal" was
  the fabricated hit rate minus fifty times a random multiplier — a dollar-unit
  figure derived from a number nobody measured.

  This is the Prove It desk. So the board now grades only calls that RESOLVE on
  the history this terminal actually generates, and n is the count of those
  calls. One engine qualifies: the sweep prints, which are derived from the
  seeded candle series (flowSweeps.ts) and carry a side, so the next bars of
  that same series resolve them.

  A second used to — a news outcome model scored against its own prior
  population. It came off with data/news.ts, which was deleted because no feed
  tier carries a news wire: the priors were the generator's own invention, so
  the row graded the model against itself on a subject the product cannot
  observe at all.

  Five engines came off the board rather than keep a number. The Weigher, the
  dark-pool posture read and the wall-reaction model each need a full option
  chain and trade plan at every historical bar, and the simulator keeps no such
  history: `getGexHistory` carries net GEX per strike but no plan, so scoring a
  wall touch would mean re-deriving the walls and the flip here — and gex.ts's
  buildLevels owns that derivation precisely so a second copy cannot exist. The
  earnings engine grades a print against a move that has not happened yet, and
  its calendar carries no resolved quarters to score instead. A model with
  nothing to resolve it belongs off the board, not on it with a plausible-looking
  number.

  This is a TRACK RECORD, not a prior: the candle
  series re-seeds each session day, so the sweep row moves with the tape it was
  scored over. That is what a track record is supposed to do.
*/

export interface ModelRow {
  model: string;
  /** The call, and what resolved it */
  scope: string;
  /** Share of the engine's calls that resolved the way it called them, % */
  hitRatePct: number;
  /** Calls scored — the real count over generated history, not observed events */
  sample: number;
  /**
   * Mean realized move in the called direction, basis points. What one call was
   * worth on the tape it was scored over, before any cost — not a P/L, and not
   * a claim about a position this app holds.
   */
  edgeBps: number;
  /** Hit rate per equal block of the same population, oldest → newest */
  trend: number[];
  note: string;
}

/** One graded call: which way the engine leaned, and what the tape then did. */
interface ScoredCall {
  /** Ascending with time — orders the rolling series */
  order: number;
  /** +1 the engine called the move up, −1 down */
  side: number;
  /** Realized signed move over the call's horizon, % of price */
  movePct: number;
}

/** Blocks in the rolling hit-rate series each row's sparkline draws. */
const TREND_BLOCKS = 12;
/** Below this a block is a handful of calls and the series is noise, not a trend. */
const MIN_CALLS = TREND_BLOCKS * 4;

const hitRate = (calls: ScoredCall[]): number =>
  (calls.filter(c => c.side * c.movePct > 0).length / calls.length) * 100;

/**
 * Grade one engine. Returns null when the population is too thin to say
 * anything — a row that cannot be scored is dropped, never rounded up.
 */
function grade(model: string, scope: string, note: string, calls: ScoredCall[]): ModelRow | null {
  // A flat outcome resolves neither way; counting it as a miss would understate
  // every engine by the share of the tape that simply did not move.
  const resolved = calls.filter(c => c.side !== 0 && c.movePct !== 0).sort((a, b) => a.order - b.order);
  if (resolved.length < MIN_CALLS) return null;

  const block = Math.floor(resolved.length / TREND_BLOCKS);
  const trend: number[] = [];
  for (let b = 0; b < TREND_BLOCKS; b++) {
    // Last block absorbs the remainder so every call lands in exactly one.
    const end = b === TREND_BLOCKS - 1 ? resolved.length : (b + 1) * block;
    trend.push(hitRate(resolved.slice(b * block, end)));
  }

  return {
    model,
    scope,
    hitRatePct: Math.round(hitRate(resolved)),
    sample: resolved.length,
    // `|| 0` so a mean that rounds to negative zero prints "0", not "−0".
    edgeBps: Math.round((resolved.reduce((a, c) => a + c.side * c.movePct, 0) / resolved.length) * 100) || 0,
    trend,
    note,
  };
}


/** Bars a sweep print is given to resolve — half a session hour. */
const SWEEP_FOLLOW = 30;
/** Bars buildFlowSweeps scans per draw; matches its own default window. */
const SWEEP_WINDOW = 220;

/** Bar spacing in seconds, read off the series rather than assumed. */
function barStep(bars: Candle[]): number {
  let step = Infinity;
  for (let i = 1; i < Math.min(bars.length, 400); i++) {
    const d = bars[i].time - bars[i - 1].time;
    if (d > 0 && d < step) step = d;
  }
  return Number.isFinite(step) ? step : 60;
}

/**
 * The sweep prints pinned on the liquidity chart, scored against the bars they
 * were drawn from. Each print takes a side (calls into strength, puts into
 * weakness, with a contrarian one in five); the next `SWEEP_FOLLOW` closes of
 * the same series say whether the tape went that way.
 *
 * Windows are disjoint and fed to the engine unchanged, so these are the prints
 * the chart would have drawn at each point, not a re-implementation of the pick.
 * Prints whose follow window crosses the overnight gap are skipped — the gap is
 * a jump, not a move the print called.
 */
function gradeSweepPrints(): ModelRow | null {
  const calls: ScoredCall[] = [];
  for (const ticker of Simulator.WATCHLIST) {
    const bars = Simulator.getCandles(ticker);
    if (!bars || bars.length < SWEEP_WINDOW + SWEEP_FOLLOW) continue;
    const step = barStep(bars);
    const indexAt = new Map<number, number>();
    bars.forEach((b, i) => indexAt.set(b.time, i));

    for (let end = SWEEP_WINDOW; end <= bars.length - SWEEP_FOLLOW; end += SWEEP_WINDOW) {
      for (const sweep of buildFlowSweeps(ticker, bars.slice(end - SWEEP_WINDOW, end), SWEEP_WINDOW)) {
        const i = indexAt.get(sweep.time);
        if (i === undefined) continue;
        const from = bars[i];
        const to = bars[i + SWEEP_FOLLOW];
        if (!to || to.time - from.time > SWEEP_FOLLOW * step) continue;
        calls.push({
          order: from.time,
          side: sweep.side === 'C' ? 1 : -1,
          movePct: ((to.close - from.close) / from.close) * 100,
        });
      }
    }
  }
  return grade(
    'Sweep prints',
    `print side vs the next ${SWEEP_FOLLOW} bars`,
    `Every sweep the chart drew on the seeded candle series, resolved ${SWEEP_FOLLOW} bars later on the same series. The simulated tape has no memory, so a print that leans with the last bar sits near the 50% a coin flip posts.`,
    calls
  );
}

/**
 * The engines this terminal can actually grade, and the count of calls behind
 * each. `runMonteCarlo` above is deliberately absent: it publishes a
 * distribution, not a call, and the cone on the same page is where it is judged.
 */
export function modelScoreboard(): ModelRow[] {
  return [gradeSweepPrints()].filter((r): r is ModelRow => r !== null);
}
