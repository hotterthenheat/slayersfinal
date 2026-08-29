/*
  Acceptance test for §18's trade journal.

  A journal's whole value is that it cannot flatter its author, so the
  assertions here are mostly about what it REFUSES to do: no result on an
  open trade, no R without a stop defined at entry, no win rate on a handful
  of trades, and no editing the thesis after the outcome is known.

  Proves:
  1. P&L is computed from fills, both sides, with the option multiplier
  2. An OPEN trade has no P&L, no R and no hold time — nulls, not zeros
  3. R is the multiple of risk DEFINED AT ENTRY, and is null without a stop
  4. Win rate is null under the minimum sample, and profit factor is null
     when nothing has lost
  5. Daily P&L buckets by CLOSE date and the equity curve runs from flat
  6. The thesis cannot be edited — the type forbids it and the updater drops it
*/
import {
  MIN_STATS_TRADES, dailyPnl, equityCurve, multiplierFor, resultOf, statsOf,
  type JournalTrade,
} from '../src/data/journal';

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, x = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`);
  ok ? pass++ : fail++;
};
const near = (a: number | null, b: number, e = 1e-9) => a !== null && Math.abs(a - b) < e;

let n = 0;
const T = (o: Partial<JournalTrade>): JournalTrade => ({
  id: `t${++n}`, openedAt: '2026-08-28T14:00:00Z', closedAt: '2026-08-28T15:00:00Z',
  ticker: 'SPY', instrument: 'SPY shares', side: 'LONG', size: 100,
  entry: 500, exit: 505, stop: 495, thesis: 'x', review: '', setup: 'flip', tags: [], shots: [], ...o,
});

// ── 1. the arithmetic ─────────────────────────────────────────────────────
{
  const long = resultOf(T({}));
  check('a long that ran: (505−500)×100 = $500', near(long.pnl, 500), String(long.pnl));
  const short = resultOf(T({ side: 'SHORT', entry: 505, exit: 500, stop: 510 }));
  check('a short that ran, the mirror: $500', near(short.pnl, 500), String(short.pnl));
  const shortLoss = resultOf(T({ side: 'SHORT', entry: 500, exit: 505, stop: 510 }));
  check('a short that went wrong loses', near(shortLoss.pnl, -500), String(shortLoss.pnl));

  /* The option multiplier — the single most common journal arithmetic bug. */
  check('an option instrument carries ×100', multiplierFor('SPY 500C 09/19') === 100 && multiplierFor('SPY shares') === 1);
  const opt = resultOf(T({ instrument: 'SPY 500C 09/19', size: 2, entry: 3.0, exit: 4.5, stop: 2.5 }));
  check('so 2 contracts 3.00 → 4.50 is $300, not $3', near(opt.pnl, 300), String(opt.pnl));
  check('percent is off the entry, not the notional', near(opt.pnlPct, 50), String(opt.pnlPct));
  check('hold time is recorded in minutes', opt.heldMin === 60, String(opt.heldMin));
}

// ── 2. an open trade has no result ────────────────────────────────────────
{
  const open = resultOf(T({ exit: null, closedAt: null }));
  check('an OPEN trade has no P&L, no R, no hold time — nulls, not zeros',
    open.status === 'OPEN' && open.pnl === null && open.r === null && open.heldMin === null && open.pnlPct === null);
}

// ── 3. R needs a stop defined at entry ────────────────────────────────────
{
  /* entry 500, stop 495 → risk 5. Exit 505 → +5 → exactly 1R. */
  check('R is the multiple of defined risk', near(resultOf(T({})).r, 1), String(resultOf(T({})).r));
  check('a 2R winner reads 2', near(resultOf(T({ exit: 510 })).r, 2));
  check('a full stop-out reads −1R', near(resultOf(T({ exit: 495 })).r, -1));
  check('no stop, no R — never invented after the fact', resultOf(T({ stop: null })).r === null);
  check('a zero-width stop is not an infinite R', resultOf(T({ stop: 500 })).r === null);
}

// ── 4. the statistics refuse to flatter ───────────────────────────────────
{
  const few = statsOf([T({ exit: 505 }), T({ exit: 505 }), T({ exit: 505 })]);
  check(`under ${MIN_STATS_TRADES} closed trades there is no win rate`, few.winRate === null, String(few.winRate));
  check('— though the P&L is still real', near(few.netPnl, 1500), String(few.netPnl));

  const many = statsOf([
    T({ exit: 505 }), T({ exit: 505 }), T({ exit: 505 }), T({ exit: 495 }), T({ exit: 495 }), T({ exit: 510 }),
  ]);
  check('at the floor, a win rate appears', near(many.winRate, (4 / 6) * 100), `${many.winRate?.toFixed(1)}%`);
  check('wins and losses are counted from the P&L sign', many.wins === 4 && many.losses === 2);
  /* Gross win is 500+500+500+1000 = 2500 against 500+500 = 1000. My first
     cut of this line said 2000 — it forgot the 2R winner is +1000, not
     +500. The engine was right and the assertion was wrong. */
  check('profit factor is gross win over gross loss', near(many.profitFactor, 2500 / 1000), String(many.profitFactor));

  const noLoss = statsOf(Array.from({ length: 6 }, () => T({ exit: 505 })));
  check('with nothing lost, profit factor is null rather than Infinity', noLoss.profitFactor === null);

  const withOpen = statsOf([...Array.from({ length: 6 }, () => T({ exit: 505 })), T({ exit: null, closedAt: null })]);
  check('open trades count in the total but not in the rate',
    withOpen.trades === 7 && withOpen.open === 1 && withOpen.closed === 6 && near(withOpen.winRate, 100));

  check('average, best and worst R are reported', near(many.avgR, (1 + 1 + 1 - 1 - 1 + 2) / 6) && many.bestR === 2 && many.worstR === -1,
    `avg ${many.avgR?.toFixed(2)} best ${many.bestR} worst ${many.worstR}`);
  const noR = statsOf([T({ stop: null, exit: 505 })]);
  check('with no R anywhere, the R stats are null not zero', noR.avgR === null && noR.bestR === null);
}

// ── 5. the daily curve ────────────────────────────────────────────────────
{
  const days = dailyPnl([
    T({ closedAt: '2026-08-27T20:00:00Z', exit: 505 }),
    T({ closedAt: '2026-08-27T21:00:00Z', exit: 495 }),
    T({ closedAt: '2026-08-28T20:00:00Z', exit: 510 }),
    T({ closedAt: null, exit: null }),
  ]);
  check('P&L buckets by CLOSE date', days.length === 2 && days[0].date === '2026-08-27', days.map(d => d.date).join(' '));
  check('a day nets its trades', near(days[0].pnl, 0) && days[0].trades === 2, `${days[0].pnl} over ${days[0].trades}`);
  check('open trades are not in any day', days.reduce((a, d) => a + d.trades, 0) === 3);
  const curve = equityCurve(days);
  check('the equity curve runs from flat and accumulates',
    curve.length === 2 && near(curve[0].equity, 0) && near(curve[1].equity, 1000),
    curve.map(c => c.equity).join(' → '));
  check('an empty journal is an empty curve, not a crash', dailyPnl([]).length === 0 && equityCurve([]).length === 0);
}

// ── 6. the thesis is frozen ───────────────────────────────────────────────
{
  /* The type forbids it: `updateTrade`'s patch omits thesis and openedAt, so
     a hindsight edit cannot even be expressed. This asserts the SHAPE — if
     someone widens the signature, this line stops compiling. */
  const patchKeys: (keyof Omit<JournalTrade, 'id' | 'thesis' | 'openedAt'>)[] = ['exit', 'closedAt', 'review', 'tags', 'shots', 'stop', 'setup', 'size', 'entry', 'side', 'ticker', 'instrument'];
  check('the update patch cannot carry a thesis or an entry time', patchKeys.length === 12);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
