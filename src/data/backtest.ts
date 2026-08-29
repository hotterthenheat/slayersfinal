import { h01, hPick, hRange } from '../core/rng';
import { SCANNERS, type ScannerKey } from '../types/compass';

/*
==================================================
  SLAYER TERMINAL - THE BACKTEST (data/backtest.ts)

  What the scanners would have done, over sessions
  that have already happened.
==================================================

  §9. Compass scores setups today. The question it could not answer was
  whether those scores have ever been worth anything — and a scanner that
  cannot be checked is a horoscope with a number on it.

  THIS IS A MODEL, AND IT IS BADGED AS ONE. There is no historical fill data
  behind it: outcomes are generated deterministically per (scanner, date,
  index) from the same seeded hash as every other simulated surface here.
  What it demonstrates is the SHAPE of the answer — the curve, the markers,
  the statistics — so the page is built and readable now, and a real harness
  swaps the outcome function without touching the screen.

  R, NOT DOLLARS, is the unit — the same choice the journal makes, for the
  same reason: dollars flatter whoever sized biggest, and a backtest is a
  comparison between STRATEGIES, where position size is the one variable
  that must not be allowed to speak.

  THE EDGE IS STATED WITH ITS SAMPLE, and refuses to appear without one.
  Thirty trades is the floor below which a win rate is noise wearing a
  percent sign — the same discipline the leaderboard and the journal apply,
  because a desk that uses three different floors for the same kind of claim
  is not applying a rule, it is decorating.

  AND THE WORST DRAWDOWN IS ON THE PAGE, always. An equity curve without its
  drawdown is the half of the picture that sells; the half that matters to
  someone deciding whether they could actually have held it is how far
  underwater it went on the way.
*/

export interface BacktestTrade {
  /** Session index, 0 = oldest in the window. */
  i: number;
  date: string;
  scanner: ScannerKey;
  ticker: string;
  /** Multiple of risk. */
  r: number;
  /** Equity in R after this trade. */
  equity: number;
}

export interface BacktestStats {
  trades: number;
  wins: number;
  losses: number;
  /** Null under the minimum sample. */
  winRate: number | null;
  /** Sum of R. */
  netR: number;
  avgR: number | null;
  /** Gross win R over gross loss R. Null with no losses. */
  profitFactor: number | null;
  /** Deepest peak-to-trough, in R. Always reported. */
  maxDrawdownR: number;
  bestR: number;
  worstR: number;
}

export interface BacktestRun {
  scanner: ScannerKey | 'ALL';
  sessions: number;
  trades: BacktestTrade[];
  stats: BacktestStats;
}

/** Below this, a win rate is noise. The same floor the journal uses. */
export const MIN_BACKTEST_TRADES = 30;

const TICKERS = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMD', 'META', 'IWM', 'GOOGL'];

/** ISO date `back` sessions before today, skipping weekends. */
function sessionDate(back: number, from = new Date()): string {
  const d = new Date(from);
  let left = back;
  while (left > 0) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Run one scanner over `sessions` past sessions.
 *
 * Each scanner carries its own edge and variance, so the curves differ in
 * SHAPE rather than only in level — a high-variance sweep chaser and a
 * patient discount hunter should not produce the same line with a different
 * slope, because that would teach a reader nothing about either.
 */
export function runBacktest(scanner: ScannerKey | 'ALL', sessions: number, from = new Date()): BacktestRun {
  const keys: ScannerKey[] = scanner === 'ALL' ? SCANNERS.map(s => s.key) : [scanner];
  const trades: BacktestTrade[] = [];
  let equity = 0;

  for (let i = 0; i < sessions; i++) {
    const date = sessionDate(sessions - i, from);
    for (const k of keys) {
      const seed = `${k}|${date}`;
      /* Not every scanner fires every session. */
      if (h01(`${seed}|fire`) > 0.62) continue;
      const edge = 0.06 + (h01(`${k}|edge`) - 0.5) * 0.34;
      const variance = 0.8 + h01(`${k}|var`) * 1.6;
      const u = h01(`${seed}|out`);
      /* A win takes a multiple; a loss is bounded near −1R because the stop
         is what defines R in the first place. */
      const r = u < 0.5 + edge
        ? Number((hRange(`${seed}|w`, 0.4, 1.2 + variance)).toFixed(2))
        : Number((-hRange(`${seed}|l`, 0.55, 1.05)).toFixed(2));
      equity = Number((equity + r).toFixed(2));
      trades.push({ i, date, scanner: k, ticker: hPick(`${seed}|t`, TICKERS), r, equity });
    }
  }

  return { scanner, sessions, trades, stats: statsOfRun(trades) };
}

export function statsOfRun(trades: readonly BacktestTrade[]): BacktestStats {
  let wins = 0, losses = 0, gw = 0, gl = 0, net = 0;
  let peak = 0, dd = 0, run = 0;
  let best = 0, worst = 0;
  for (const t of trades) {
    net += t.r;
    if (t.r > 0) { wins++; gw += t.r; } else if (t.r < 0) { losses++; gl += Math.abs(t.r); }
    best = Math.max(best, t.r);
    worst = Math.min(worst, t.r);
    run += t.r;
    peak = Math.max(peak, run);
    dd = Math.max(dd, peak - run);
  }
  const n = trades.length;
  return {
    trades: n,
    wins, losses,
    winRate: n >= MIN_BACKTEST_TRADES && wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
    netR: Number(net.toFixed(2)),
    avgR: n > 0 ? Number((net / n).toFixed(3)) : null,
    profitFactor: gl > 0 ? Number((gw / gl).toFixed(2)) : null,
    maxDrawdownR: Number(dd.toFixed(2)),
    bestR: Number(best.toFixed(2)),
    worstR: Number(worst.toFixed(2)),
  };
}
