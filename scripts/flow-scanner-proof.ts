/*
  Acceptance test for the flow aggregation behind Trace's Scanner. Runs the
  ACTUAL engine against staged tapes where every roll-up is computable by
  hand.

  Proves:
  1. Prints group by CONTRACT — and expiry is part of that identity, so the
     same strike in a different week is a different row
  2. The directional rule, all four corners: calls at the ask and puts at the
     bid read bullish; calls at the bid and puts at the ask read bearish
  3. A MID fill takes no side — it counts in the dollars and moves the score
     not at all, which is what `decisiveness` exists to report
  4. The score is PREMIUM-weighted, not print-counted: one block outvotes a
     crowd of lottery tickets
  5. Contract-level facts (volume, OI, IV) come from the NEWEST print, not
     the first one seen
  6. A chain's stance is the premium-weighted mean of its contracts
  7. The words match the numbers, and "no side" is said rather than implied
*/
import { aggregateByContract, chainStance, contractKey, printDirection, stanceLabel } from '../src/data/flowScanner';
import { buildSessionTape, recentSessions } from '../src/data/sessionTape';
import { followUp } from '../src/data/flowWatch';
import type { FlowPrint } from '../src/types/trace';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

let id = 0;
const P = (o: Partial<FlowPrint>): FlowPrint => ({
  id: ++id, time: '10:30:00', ticker: 'SPY', legs: 1, strike: 500, right: 'C', otmPct: 1,
  expiry: '09/19/2026', dte: 3, fill: 2.5, bid: 2.4, ask: 2.6, fillPos: 0.5, side: 'ASK',
  flowScore: 50, ratioLabel: 'ASK 60%', ratioBidPct: 40, size: 100, premium: 25_000,
  volume: 1000, oi: 5000, deltaOI: 100, spot: 495, iv: 18, volOverOI: 0.2,
  strat: 'SINGLE' as FlowPrint['strat'], sweep: false, ...o,
});

// ── 1. identity ───────────────────────────────────────────────────────────
{
  const rows = aggregateByContract([
    P({ strike: 500, right: 'C', expiry: '09/19/2026', premium: 10_000 }),
    P({ strike: 500, right: 'C', expiry: '09/19/2026', premium: 30_000 }),
    P({ strike: 500, right: 'C', expiry: '09/26/2026', premium: 20_000 }), // different WEEK
    P({ strike: 500, right: 'P', expiry: '09/19/2026', premium: 5_000 }),  // different RIGHT
  ]);
  check('same contract merges, different expiry or right does not', rows.length === 3, `${rows.length} rows`);
  check('the merged row carries both prints', rows[0].prints === 2 && rows[0].totalPremium === 40_000, `${rows[0].prints} prints, $${rows[0].totalPremium}`);
  check('rows come back biggest-dollars first', rows[0].totalPremium >= rows[1].totalPremium && rows[1].totalPremium >= rows[2].totalPremium);
  check('the key names all four parts', contractKey({ ticker: 'SPY', strike: 500, right: 'C', expiry: '09/19/2026' }) === 'SPY|500|C|09/19/2026');
}

// ── 2. all four corners of the direction rule ─────────────────────────────
{
  check('calls lifted at the ASK are bullish', printDirection({ right: 'C', side: 'ASK' }) === 1);
  check('calls hit at the BID are bearish', printDirection({ right: 'C', side: 'BID' }) === -1);
  check('puts lifted at the ASK are bearish', printDirection({ right: 'P', side: 'ASK' }) === -1);
  check('puts hit at the BID are bullish', printDirection({ right: 'P', side: 'BID' }) === 1);
}

// ── 3. a mid fill takes no side ───────────────────────────────────────────
{
  const rows = aggregateByContract([
    P({ side: 'ASK', premium: 50_000 }),
    P({ side: 'MID', premium: 50_000 }),
  ]);
  const r = rows[0];
  check('a MID print still counts in the dollars', r.totalPremium === 100_000);
  check('— but moves the score not at all', near(r.score, 100), `score ${r.score}`);
  check('and decisiveness reports that half the dollars took no side', near(r.decisiveness, 50), `${r.decisiveness}%`);
  const allMid = aggregateByContract([P({ side: 'MID', premium: 9_000_000 })])[0];
  check('an all-MID contract scores 0 with 0 decisiveness — no opinion, not balance', allMid.score === 0 && allMid.decisiveness === 0);
  check('and it is WORDED as having no side', stanceLabel(allMid.score, allMid.decisiveness) === 'NO SIDE');
}

// ── 4. premium-weighted, not print-counted ────────────────────────────────
{
  /* Forty small bearish tickets against one large bullish block. Counting
     prints reads bearish 40:1; counting dollars reads bullish. */
  const rows = aggregateByContract([
    ...Array.from({ length: 40 }, () => P({ side: 'BID', right: 'C', premium: 5_000 })),
    P({ side: 'ASK', right: 'C', premium: 2_000_000 }),
  ]);
  const r = rows[0];
  check('PREMISE: the crowd outnumbers the block 40 to 1', r.prints === 41);
  /* (2,000,000 − 200,000) / 2,200,000 = 81.8181…% */
  check('one block outvotes a crowd of tickets', near(r.score, (1_800_000 / 2_200_000) * 100), `score ${r.score.toFixed(2)}`);
  check('and it reads bullish in words', stanceLabel(r.score, r.decisiveness) === 'STRONG BULL', stanceLabel(r.score, r.decisiveness));

  /* Size-weighted average fill, by hand: (1.00·100 + 3.00·300) / 400 = 2.50 */
  const fills = aggregateByContract([P({ fill: 1, size: 100 }), P({ fill: 3, size: 300 })])[0];
  check('avg fill is size-weighted, exactly', near(fills.avgFill, 2.5), String(fills.avgFill));
}

// ── 5. contract facts come from the newest print ──────────────────────────
{
  /* The tape hands prints NEWEST FIRST, so index 0 is the latest reading. */
  const rows = aggregateByContract([
    P({ time: '15:59:00', volume: 9_000, oi: 5_500, iv: 24 }),
    P({ time: '09:31:00', volume: 100, oi: 5_000, iv: 18 }),
  ]);
  const r = rows[0];
  check('volume, OI and IV read from the NEWEST print', r.volume === 9_000 && r.oi === 5_500 && r.iv === 24, `vol ${r.volume}, oi ${r.oi}, iv ${r.iv}`);
  check('and so does the clock', r.lastTime === '15:59:00', r.lastTime);
}

// ── 6. the chain ──────────────────────────────────────────────────────────
{
  const rows = aggregateByContract([
    P({ ticker: 'SPY', strike: 500, right: 'C', side: 'ASK', premium: 900_000 }),
    P({ ticker: 'SPY', strike: 490, right: 'P', side: 'ASK', premium: 100_000 }),
    P({ ticker: 'QQQ', strike: 400, right: 'C', side: 'BID', premium: 500_000 }),
  ]);
  const spy = chainStance(rows, 'SPY');
  /* (+900k − 100k) / 1000k = +80 */
  check('a chain is the premium-weighted mean of its contracts', near(spy.score, 80), `score ${spy.score}`);
  check('every dollar took a side here, so decisiveness is 100', near(spy.decisiveness, 100));
  check('call and put premium are split out', spy.callPremium === 900_000 && spy.putPremium === 100_000);
  check('and the other ticker is not mixed in', spy.contracts === 2 && spy.totalPremium === 1_000_000);
  const empty = chainStance(rows, 'AAPL');
  check('a ticker with no flow is 0, not NaN', empty.score === 0 && empty.totalPremium === 0 && empty.contracts === 0);
}

// ── 7. the words ──────────────────────────────────────────────────────────
{
  check('strong bull', stanceLabel(70, 90) === 'STRONG BULL');
  check('bullish', stanceLabel(30, 90) === 'BULLISH');
  check('mixed sits around zero', stanceLabel(5, 90) === 'MIXED' && stanceLabel(-5, 90) === 'MIXED');
  check('bearish', stanceLabel(-30, 90) === 'BEARISH');
  check('strong bear', stanceLabel(-70, 90) === 'STRONG BEAR');
  check('and thin evidence outranks a strong number', stanceLabel(90, 10) === 'NO SIDE');
}

// ── an empty tape ─────────────────────────────────────────────────────────
check('an empty tape is an empty list, not a crash', aggregateByContract([]).length === 0);

// ── 8. the replayed session ───────────────────────────────────────────────
{
  const a = buildSessionTape('SPY', '2026-08-24', 500);
  const b = buildSessionTape('SPY', '2026-08-24', 500);
  check('PREMISE: a replayed session has prints to aggregate', a.length > 100, `${a.length} prints`);
  check('the same date replays the SAME tape, every time',
    JSON.stringify(a) === JSON.stringify(b));
  const other = buildSessionTape('SPY', '2026-08-25', 500);
  check('a different date is a different session', JSON.stringify(a) !== JSON.stringify(other));
  check('and a different ticker is too', JSON.stringify(buildSessionTape('QQQ', '2026-08-24', 500)) !== JSON.stringify(a));

  /* Newest first — the aggregator's "latest reading" rule depends on it. */
  const ordered = a.every((p, i) => i === 0 || a[i - 1].time >= p.time);
  check('prints come back NEWEST first, like the live tape', ordered);

  /* The shape must be the real one, or the screen reads two types. */
  const p0 = a[0];
  check('every print carries the live shape',
    typeof p0.premium === 'number' && p0.premium > 0 &&
    (p0.side === 'BID' || p0.side === 'ASK' || p0.side === 'MID') &&
    (p0.right === 'C' || p0.right === 'P') &&
    /^\d{2}\/\d{2}\/\d{4}$/.test(p0.expiry) &&
    /^\d{2}:\d{2}:\d{2}$/.test(p0.time),
    JSON.stringify({ side: p0.side, right: p0.right, expiry: p0.expiry, time: p0.time }));
  check('premium is size x fill x 100, exactly', a.every(p => p.premium === Math.round(p.size * p.fill * 100)));
  check('and a replayed tape aggregates like a live one', aggregateByContract(a).length > 0);

  /* The picker never offers a weekend. */
  const sessions = recentSessions(10, new Date('2026-08-29T12:00:00'));
  check('the session picker offers 10 weekdays, newest first',
    sessions.length === 10 && sessions.every(d => { const g = new Date(`${d}T12:00:00`).getDay(); return g !== 0 && g !== 6; }),
    sessions.slice(0, 3).join(' '));
}

// ── 9. the watch list's follow-up arithmetic ──────────────────────────────
{
  /* followUp is the one part of the watch store with real logic — the rest
     is a Map with a localStorage write. It answers "what happened to this
     contract AFTER the moment I bookmarked it", and the trap is that the
     tape is newest-first, so "after" is a CLOCK comparison and never an
     array position. */
  const saved = P({ time: '10:41:00', strike: 500, right: 'C', expiry: '09/19/2026' });
  const session = [
    P({ time: '15:30:00', strike: 500, right: 'C', expiry: '09/19/2026', side: 'ASK', premium: 300_000, volume: 9_000, oi: 6_000 }),
    P({ time: '11:00:00', strike: 500, right: 'C', expiry: '09/19/2026', side: 'BID', premium: 100_000, volume: 4_000, oi: 5_800 }),
    P({ time: '09:45:00', strike: 500, right: 'C', expiry: '09/19/2026', side: 'ASK', premium: 999_000 }), // BEFORE
    P({ time: '14:00:00', strike: 505, right: 'C', expiry: '09/19/2026', side: 'ASK', premium: 500_000 }), // other contract
  ];
  const f = followUp({ print: saved, savedAt: 0 }, session);
  check('follow-up counts only prints AFTER the bookmark', f.printsSince === 2, `${f.printsSince}`);
  check('— and only the SAME contract', f.premiumSince === 400_000, `$${f.premiumSince}`);
  check('the side split is of the flow that came after', near(f.askPctSince, 75), `${f.askPctSince}%`);
  check('volume and OI read from the LATEST print after the bookmark', f.volume === 9_000 && f.oi === 6_000, `vol ${f.volume}, oi ${f.oi}`);

  const quiet = followUp({ print: saved, savedAt: 0 }, [P({ time: '09:00:00', strike: 500, right: 'C', expiry: '09/19/2026' })]);
  check('a contract that went quiet reports nothing since, not zero-as-a-number', quiet.printsSince === 0 && quiet.volume === null && quiet.oi === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
