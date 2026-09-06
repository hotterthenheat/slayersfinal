import { readFileSync } from 'node:fs';
import Simulator from '../src/core/simulator';
import {
  STATS,
  STAT_KEYS,
  STAT_WINDOWS,
  fmtStat,
  minSessionsFor,
  rankStat,
  rollingStat,
  seriesLength,
  toDailyBars,
  type StatKey,
} from '../src/data/stockStats';
import type { Candle } from '../src/types/market';

/*
==================================================
  SLAYER TERMINAL - PROOF · ROLLING STATISTICS
  (scripts/stock-stats-proof.ts) — Part 7.3
==================================================

  A statistics panel is the easiest place in a terminal to be quietly wrong,
  because every number it prints looks like every other number it prints.
  Three things have to hold or it is worse than nothing:

    THE WINDOW IS THE CLAIM   a 5-session volatility under a 20-session
                              label is a lie the reader cannot detect. Every
                              reading carries its window, and a window the
                              store cannot fill is REFUSED with the
                              shortfall named rather than silently shortened.
    THE ARITHMETIC IS THE ARITHMETIC   each statistic is recomputed here
                              from a hand-built series whose answer is known
                              in advance, so a sign flip or an n-versus-n−1
                              cannot pass.
    THE SESSIONS ARE REAL     the store holds MINUTES. Folding them into
                              sessions on the wrong gap would silently
                              measure something else — 8,580 one-minute bars
                              are 22 sessions, not 8,580 of them.
*/

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

/** A synthetic tape: one bar a session, at the closes given. */
function tape(closes: number[], opens?: number[], hi?: number[], lo?: number[]): Candle[] {
  return closes.map((c, i) => ({
    time: 1_700_000_000 + i * 86_400,
    open: opens?.[i] ?? c,
    high: hi?.[i] ?? c,
    low: lo?.[i] ?? c,
    close: c,
    volume: 1,
  }));
}

// ── 1. minutes fold into sessions on the overnight gap ─────────────────────
{
  const bars = Simulator.getCandles('AAPL');
  const days = toDailyBars(bars);
  check('the store holds minutes, not sessions', bars.length > 5000, `${bars.length} bars`);
  check('and they fold into the sessions the simulator seeds', days.length >= 20 && days.length <= 24, `${days.length} sessions`);
  check('each session runs forward in time', days.every((d, i) => i === 0 || d.time > days[i - 1].time));
  /* The extremes have to survive the fold, or every range and drawdown is
     measured on a session that never happened. */
  const anyDay = days[1];
  check('a session’s high is at or above its close, and its low at or below', days.every(d => d.high >= d.close && d.low <= d.close), `${anyDay.low.toFixed(2)} ≤ ${anyDay.close.toFixed(2)} ≤ ${anyDay.high.toFixed(2)}`);

  /* THE GAP IS THE THING. One bar a minute all the way through would fold to
     ONE session; the module has to split on the night, not on a date. */
  const oneDay: Candle[] = Array.from({ length: 200 }, (_, i) => ({ time: 1_700_000_000 + i * 60, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
  check('a tape with no overnight gap is one session, not two hundred', toDailyBars(oneDay).length === 1);
}

// ── 2. every statistic recomputes from a series with a known answer ────────
{
  /* +10% then −50%: return is −45%, the drawdown is −50% from the peak. */
  const t = tape([100, 110, 55]);
  const ret = rollingStat(t, 'return', 5);
  check('a window longer than the tape is refused, with the shortfall named',
    ret.now === null && (ret.reason ?? '').includes('3'), ret.reason ?? '');

  const short = rollingStat(tape([100, 110, 55, 55, 55, 55, 55]), 'return', 5);
  check('return is the close-to-close move across the window',
    short.now !== null && near(short.now, ((55 - 110) / 110) * 100, 1e-9), fmtStat('return', short.now));

  const dd = rollingStat(tape([100, 110, 55, 55, 55, 55, 55]), 'drawdown', 5);
  check('max drawdown is the deepest fall from a running peak',
    dd.now !== null && near(dd.now, ((55 - 110) / 110) * 100, 1e-9), fmtStat('drawdown', dd.now));
  check('  · and it is never positive', dd.now !== null && dd.now <= 0);

  /* Three of six sessions close above their open. */
  const ud = rollingStat(tape([1, 2, 3, 4, 5, 6], [2, 1, 4, 3, 6, 5]), 'upDays', 5);
  check('up days is the share of sessions closing above their open',
    ud.now !== null && near(ud.now, (3 / 6) * 100, 1e-9), fmtStat('upDays', ud.now));

  /* A flat tape has no daily range and no volatility. */
  const flat = tape([50, 50, 50, 50, 50, 50, 50]);
  check('a flat tape has zero volatility', near(rollingStat(flat, 'vol', 5).now ?? -1, 0));
  check('  · and zero drawdown', near(rollingStat(flat, 'drawdown', 5).now ?? -1, 0));
  const ranged = rollingStat(tape([100, 100, 100, 100, 100, 100], undefined, [102, 102, 102, 102, 102, 102], [98, 98, 98, 98, 98, 98]), 'range', 5);
  check('daily range is the high-to-low span over the close', ranged.now !== null && near(ranged.now, 4, 1e-9), fmtStat('range', ranged.now));

  /* VOLATILITY USES n−1. Over a five-session window the population formula
     understates by about 11%, which is the difference between two names
     looking alike and one of them being the rougher ride. */
  const closes = [100, 102, 99, 104, 101, 106];
  const v = rollingStat(tape(closes), 'vol', 5).now!;
  const rs: number[] = [];
  for (let i = 1; i < closes.length; i++) rs.push(Math.log(closes[i] / closes[i - 1]));
  const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
  const sample = Math.sqrt((rs.reduce((a, b) => a + (b - mean) ** 2, 0) / (rs.length - 1)) * 252) * 100;
  const population = Math.sqrt((rs.reduce((a, b) => a + (b - mean) ** 2, 0) / rs.length) * 252) * 100;
  check('volatility is the SAMPLE deviation, annualised', near(v, sample, 1e-9), `${v.toFixed(3)} sample vs ${population.toFixed(3)} population`);
  check('  · and the two formulas visibly differ at this window', Math.abs(sample - population) > sample * 0.05, `${(((sample - population) / sample) * 100).toFixed(1)}% apart`);
}

// ── 3. the window is never silently shortened ──────────────────────────────
{
  const bars = Simulator.getCandles('AAPL');
  const sessions = toDailyBars(bars).length;
  for (const w of STAT_WINDOWS) {
    for (const k of STAT_KEYS) {
      const r = rollingStat(bars, k, w);
      const fits = sessions >= minSessionsFor(w);
      check(`${k} @ ${w}d ${fits ? 'reads' : 'refuses'}`, fits ? r.now !== null && r.reason === null : r.now === null && r.reason !== null);
      if (fits) {
        check(`  · and its series is one reading per step — ${r.series.length}`, r.series.length === seriesLength(sessions, w));
        check(`  · with the last reading being the current one`, r.series[r.series.length - 1] === r.now);
      }
    }
  }
  /* THE OFFERED WINDOWS ARE THE ANSWERABLE ONES. A 60-session control over a
     22-session store would return 22 sessions under a 60-session label. */
  check('no window is offered that the store cannot fill', STAT_WINDOWS.every(w => minSessionsFor(w) <= sessions), `deepest ${Math.max(...STAT_WINDOWS)}d needs ${minSessionsFor(Math.max(...STAT_WINDOWS) as (typeof STAT_WINDOWS)[number])}, store has ${sessions}`);
}

// ── 4. the ranking runs the right way for each statistic ───────────────────
{
  const rows = [
    { ticker: 'AAA', now: 10, sessions: 22 },
    { ticker: 'BBB', now: -4, sessions: 22 },
    { ticker: 'CCC', now: 3, sessions: 22 },
  ];
  check('a "high is interesting" statistic ranks highest first', rankStat(rows, 'return')[0].ticker === 'AAA');
  check('a "low is interesting" one ranks lowest first', rankStat(rows, 'vol')[0].ticker === 'BBB');
  check('every statistic declares which end it is read from', STAT_KEYS.every(k => STATS[k].best === 'high' || STATS[k].best === 'low'));
  check('ranking does not mutate its input', (() => {
    const before = rows.map(r => r.ticker).join();
    rankStat(rows, 'vol');
    return rows.map(r => r.ticker).join() === before;
  })());
  check('an empty roster ranks to nothing rather than throwing', rankStat([], 'vol').length === 0);
}

// ── 5. the panel prints the window with the number ─────────────────────────
{
  const src = readFileSync('src/components/stocks/StatisticsPanel.tsx', 'utf8');
  check('the heading carries the window', /over \$\{window_\} sessions/.test(src));
  check('the figure carries it too, beside the number', /\{window_\}-session window/.test(src));
  check('the store’s depth is on the surface', /\{sessions\} sessions in the store/.test(src));
  check('a window the name cannot fill shows the reason, not a number', /reading\.reason \?/.test(src) && /Not enough history for this window/.test(src));
  check('a series too short to read a shape into says so', /Only \$\{points\}/.test(src));

  /* THE ROSTER MUST NOT FREEZE THE PAGE. Warming a cold name is ~360ms
     measured; twenty-eight on mount is a ten-second stall on a board whose
     whole job is to be scanned. */
  check('the roster peeks before it warms', /peekCandles\(t\) \?\? Simulator\.getCandles\(t\)/.test(src));
  check('  · and warms between frames rather than in one pass', /requestIdleCallback/.test(src));
  check('  · saying how far it has got, so a partial ranking is not read as a whole one', /\$\{progress\.done\} of \$\{progress\.total\}/.test(src));

  const engine = readFileSync('src/data/stockStats.ts', 'utf8');
  check('the engine never reaches for a name’s history itself', !/Simulator/.test(engine));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
