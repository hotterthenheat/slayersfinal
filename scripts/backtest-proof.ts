/*
  Acceptance test for §9's backtest.

  A backtest is the easiest surface on any desk to make lie, so the
  assertions are about what it refuses to claim: no win rate under a sample,
  no profit factor out of thin air when nothing lost, and a drawdown that is
  ALWAYS on the page because an equity curve without one is the half that
  sells.

  Proves:
  1. Equity is the running sum of R, and every trade carries the equity
     AFTER it — so the curve and the table cannot disagree
  2. Max drawdown is the deepest peak-to-trough, and it is never negative
  3. Win rate is null under the floor — the same floor the journal and the
     leaderboard use, because one rule applied three ways is not a rule
  4. Profit factor is null rather than Infinity when nothing lost
  5. Losses are bounded near −1R, because the stop is what DEFINES R
  6. Scanners differ in shape, not just level
  7. Deterministic per (scanner, date)
*/
import { MIN_BACKTEST_TRADES, runBacktest, statsOfRun, type BacktestTrade } from '../src/data/backtest';
import { SCANNERS } from '../src/types/compass';

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, x = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`);
  ok ? pass++ : fail++;
};
const FROM = new Date('2026-08-28T12:00:00Z');

// ── 1+2. the curve ────────────────────────────────────────────────────────
{
  const run = runBacktest('ALL', 120, FROM);
  check('PREMISE: the run produced trades', run.trades.length > 50, `${run.trades.length}`);
  let acc = 0;
  const consistent = run.trades.every(t => {
    acc = Number((acc + t.r).toFixed(2));
    return Math.abs(acc - t.equity) < 0.011;
  });
  check('equity is the running sum of R, trade by trade', consistent);
  check('net R matches the last equity point',
    Math.abs(run.stats.netR - run.trades[run.trades.length - 1].equity) < 0.011,
    `${run.stats.netR} vs ${run.trades[run.trades.length - 1].equity}`);

  /* Drawdown, computed independently here. */
  let peak = 0, dd = 0, r = 0;
  for (const t of run.trades) { r += t.r; peak = Math.max(peak, r); dd = Math.max(dd, peak - r); }
  check('max drawdown is the deepest peak-to-trough', Math.abs(run.stats.maxDrawdownR - dd) < 0.02,
    `${run.stats.maxDrawdownR} vs ${dd.toFixed(2)}`);
  check('and it is never negative', run.stats.maxDrawdownR >= 0);
  check('a losing run still reports a drawdown', statsOfRun([
    { i: 0, date: 'x', scanner: 'whale-sweeps', ticker: 'SPY', r: -1, equity: -1 },
    { i: 1, date: 'x', scanner: 'whale-sweeps', ticker: 'SPY', r: -1, equity: -2 },
  ] as BacktestTrade[]).maxDrawdownR === 2);
}

// ── 3+4. the refusals ─────────────────────────────────────────────────────
{
  const thin = statsOfRun(Array.from({ length: MIN_BACKTEST_TRADES - 1 }, (_, i) => ({
    i, date: 'x', scanner: 'whale-sweeps', ticker: 'SPY', r: 1, equity: i + 1,
  })) as BacktestTrade[]);
  check(`under ${MIN_BACKTEST_TRADES} trades there is no win rate`, thin.winRate === null, String(thin.winRate));
  check('— but the R total is still real', thin.netR === MIN_BACKTEST_TRADES - 1);

  const fat = statsOfRun(Array.from({ length: MIN_BACKTEST_TRADES + 10 }, (_, i) => ({
    i, date: 'x', scanner: 'whale-sweeps', ticker: 'SPY', r: i % 3 === 0 ? -1 : 1, equity: 0,
  })) as BacktestTrade[]);
  check('at the floor, a win rate appears', fat.winRate !== null, `${fat.winRate?.toFixed(1)}%`);
  check('and it is wins over wins+losses, exactly',
    Math.abs((fat.winRate as number) - (fat.wins / (fat.wins + fat.losses)) * 100) < 1e-9);

  const noLoss = statsOfRun(Array.from({ length: 40 }, (_, i) => ({
    i, date: 'x', scanner: 'whale-sweeps', ticker: 'SPY', r: 1, equity: i + 1,
  })) as BacktestTrade[]);
  check('with nothing lost, profit factor is null rather than Infinity', noLoss.profitFactor === null);
  check('an empty run is zeros and nulls, not a crash',
    statsOfRun([]).trades === 0 && statsOfRun([]).winRate === null && statsOfRun([]).avgR === null);
}

// ── 5. losses are bounded by the stop ─────────────────────────────────────
{
  const run = runBacktest('ALL', 200, FROM);
  const losses = run.trades.filter(t => t.r < 0);
  check('PREMISE: the run has losses', losses.length > 20, `${losses.length}`);
  check('no loss exceeds about 1R — the stop is what defines R',
    losses.every(t => t.r >= -1.1), `worst ${Math.min(...losses.map(t => t.r))}`);
  check('and wins are unbounded above, as they should be',
    Math.max(...run.trades.map(t => t.r)) > 1.2, `best ${Math.max(...run.trades.map(t => t.r))}`);
}

// ── 6. scanners differ in shape ───────────────────────────────────────────
{
  const runs = SCANNERS.map(s => runBacktest(s.key, 150, FROM));
  const rates = runs.map(r => r.stats.avgR ?? 0);
  check('PREMISE: every scanner ran', runs.every(r => r.trades.length > 10), runs.map(r => r.trades.length).join(' '));
  check('scanners differ in average R', new Set(rates.map(v => v.toFixed(3))).size > 1,
    rates.map(v => v.toFixed(2)).join(' '));
  /* Different in SHAPE: the ratio of drawdown to net must not be constant. */
  const shapes = runs.filter(r => r.stats.netR !== 0).map(r => (r.stats.maxDrawdownR / Math.abs(r.stats.netR)).toFixed(2));
  check('— and in the shape of the ride, not only its level', new Set(shapes).size > 1, shapes.join(' '));
}

// ── 7. determinism ────────────────────────────────────────────────────────
{
  check('the same window replays identically',
    JSON.stringify(runBacktest('ALL', 60, FROM)) === JSON.stringify(runBacktest('ALL', 60, FROM)));
  check('a longer window extends rather than reshuffles', (() => {
    const a = runBacktest('ALL', 60, FROM).trades;
    const b = runBacktest('ALL', 90, FROM).trades;
    /* The last 60 sessions are shared; the same dates must carry the same
       trades, or a reader widening the window would see history change. */
    const aDates = new Set(a.map(t => t.date));
    return b.filter(t => aDates.has(t.date)).every(t => {
      const m = a.find(x => x.date === t.date && x.scanner === t.scanner);
      return !m || m.r === t.r;
    });
  })());
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
