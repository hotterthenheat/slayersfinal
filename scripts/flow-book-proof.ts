/*
  Acceptance test for the ported flow book — the one generator behind the
  screener, net flow, footprints, alerts, windows, 0DTE and multi-leg.

  Every assertion here corresponds to a bug found by reading numbers off the
  partner's rendered pages. None of them needed a browser; all of them would
  have failed the moment the bug was written.

  Proves:
  1. The price a ticker seeds to is DETERMINISTIC — rebuilding a history
     gives the same history, and every name lands on its declared reference
  2. The book accrues over the SESSION, not the calendar day, and out of
     hours it shows the last completed session rather than an empty board
  3. A percentage change in open interest is null when there was nothing to
     grow from — never a four-figure number
  4. Volume over open interest is a live signal: some contracts genuinely
     trade past their interest during a session
  5. A dark-pool cross is one trade, not a third of a day's volume
  6. Cumulative columns never shrink as the session runs
*/
import { execFileSync } from 'node:child_process';
import Simulator from '../src/core/simulator';
import { withEngineClock } from '../src/core/clock';
import { buildFlowBook, sessionView } from '../src/data/flowBook';
import { buildPrints } from '../src/data/gex';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const at = (h: number, m = 0) => new Date(2026, 8, 4, h, m, 0);
const book = (d: Date) => withEngineClock(d, () => buildFlowBook(Simulator.universeQuotes('SPY')));

// ── 1. the price does not move when you look at it ───────────────────────
{
  /* THE BUG: seedCandles walked the price on bare Math.random(), so every
     remount re-walked. Measured on his build by navigating between
     subpages: SPY went $450.86, $517.86, $534.70 — an 18% swing from
     clicking a tab. */
  /* IN A FRESH PROCESS, which is what a page load is.

     Calling ensureTicker twice in ONE process proves nothing — it seeds a
     ticker once and caches it, so the second call returns the first walk's
     answer whether or not the walk is deterministic. That is exactly how a
     first version of this check passed while the bug was still in: the
     mutation that removed the seeding survived it.

     The bug appeared on NAVIGATION — a remount rebuilding the history — so
     the test rebuilds it the same way, in a separate process. */
  const NAMES = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA'];
  const readOut = () =>
    JSON.parse(
      execFileSync(
        'npx',
        ['tsx', '-e', `import S from './src/core/simulator';
const o={};for(const t of ${JSON.stringify(NAMES)}){S.ensureTicker(t);o[t]=S.snapshotFor(t).spot;}
process.stdout.write(JSON.stringify(o));`],
        { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000 }
      )
    ) as Record<string, number>;
  const a = readOut();
  const b = readOut();
  for (const t of NAMES) {
    check(`${t}: a fresh process rebuilds the same price`, a[t] === b[t], `${a[t]} then ${b[t]}`);
  }

  /* THE WHOLE PATH, not just where it ends.

     The endpoint alone is not enough to prove the walk is seeded: a
     final-session taper closes the residual onto basePrice exactly, so the
     last bar lands in the same place whether the path was deterministic or
     re-rolled. Removing the seeding survived an endpoint-only check.

     The path is what a CHART draws. If it re-rolls on every remount, every
     candle on the tape redraws differently when the reader clicks a tab —
     which is the same bug wearing a different symptom. */
  const readPath = () =>
    JSON.parse(
      execFileSync(
        'npx',
        ['tsx', '-e', `import S from './src/core/simulator';
S.ensureTicker('SPY');
const c=S.getCandles('SPY');
process.stdout.write(JSON.stringify({n:c.length,mid:c.slice(40,55).map(b=>[b.open,b.high,b.low,b.close,b.volume])}));`],
        { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000 }
      )
    ) as { n: number; mid: number[][] };
  const p1 = readPath();
  const p2 = readPath();
  check('PREMISE: there is a history to compare', p1.n > 50 && p1.mid.length === 15, `${p1.n} bars, o/h/l/c/v each`);
  check(
    'and a fresh process draws the same candles, bar for bar',
    JSON.stringify(p1.mid) === JSON.stringify(p2.mid),
    `${JSON.stringify(p1.mid[0])} vs ${JSON.stringify(p2.mid[0])}`
  );
  /* And every name lands on the reference somebody chose for it — the
     homeward pull was gated on roster membership, which excluded exactly
     the four names in the header of every page. */
  for (const [t, base] of [['SPY', 500], ['QQQ', 440], ['AAPL', 190], ['NVDA', 120]] as [string, number][]) {
    const spot = Simulator.snapshotFor(t).spot;
    check(`${t}: opens on its declared reference, not 14% away from it`, Math.abs(spot - base) / base < 0.02, `$${spot} vs $${base}`);
  }
}

// ── 2. the book knows what time it is ────────────────────────────────────
{
  /* THE BUG: accrual divided by 1440, so the book filled through the night
     and at 00:32 reported a session 2% complete — at half past midnight. */
  const preOpen = sessionView(at(3, 0));
  check('before the bell the book shows the LAST session, complete', preOpen.dayOffset === -1 && preOpen.frac === 1 && preOpen.settled);
  const mid = sessionView(at(13, 0));
  check('mid-session it shows today, part way through', mid.dayOffset === 0 && mid.frac > 0 && mid.frac < 1 && !mid.settled, `frac ${mid.frac.toFixed(2)}`);
  const post = sessionView(at(20, 0));
  check('after the close the day is done and stands', post.dayOffset === 0 && post.frac === 1 && post.settled);
  check('the open is the bell, not midnight', sessionView(at(9, 29)).dayOffset === -1 && sessionView(at(9, 31)).dayOffset === 0);

  /* Out of hours the desk is USEFUL, not empty. */
  const night = book(at(2, 0));
  check('a reader opening the desk at 2am gets a full board', night.length > 100, `${night.length} contracts`);
  const noon = book(at(12, 0));
  check('and mid-session gets one too', noon.length > 100, `${noon.length} contracts`);
}

// ── 3. no percentage from nothing ────────────────────────────────────────
{
  /* THE BUG: ORCL printed ΔOI +556,801% — a contract going from 77 lots to
     428,814. The percentage is not a scream, it is arithmetic theatre, and
     it sorts every real build off the top of the board. */
  const rows = book(at(14, 0));
  check('PREMISE: the book has rows to inspect', rows.length > 50, `${rows.length}`);
  const withPct = rows.filter(r => r.deltaOIPct !== null);
  check('PREMISE: most rows do carry a percentage', withPct.length > rows.length * 0.5, `${withPct.length}/${rows.length}`);
  check(
    'no percentage runs to four figures',
    withPct.every(r => Math.abs(r.deltaOIPct!) < 1000),
    withPct.filter(r => Math.abs(r.deltaOIPct!) >= 1000).map(r => `${r.ticker} ${r.deltaOIPct}%`).slice(0, 3).join(', ')
  );
  const fresh = rows.filter(r => r.deltaOIPct === null);
  check('PREMISE: some contracts had nothing to grow from', fresh.length > 0, `${fresh.length}`);
  check('— and those are flagged rather than given a number', fresh.every(r => r.wasEmpty));
  /* A flag means one of two things and both are "it did not really exist":
     the base was tiny, or the change dwarfed it. */
  check(
    'every flagged row is either tiny-based or multiplied past ten-fold',
    fresh.every(r => r.prevOI < 250 || Math.abs((r.deltaOI / r.prevOI) * 100) > 1000),
    fresh.map(r => `${r.prevOI}->${r.oi}`).slice(0, 4).join(' ')
  );
  check(
    'and a row with a percentage has a base worth measuring against',
    withPct.every(r => r.prevOI >= 250)
  );
}

// ── 4. vol/OI is a live signal, not a dead column ────────────────────────
{
  /* NOT a bug in the metric — I called it one and was wrong. It reads ~0.03
     for everything at 00:32 because only 2% of a 1440-minute "day" had
     accrued. On a real session clock it does what it should. */
  const mid = book(at(13, 0));
  const late = book(at(15, 45));
  const over = (rs: typeof mid) => rs.filter(r => r.volume / Math.max(1, r.oi) > 1).length;
  check('by midday some contracts trade past their interest', over(mid) > 5, `${over(mid)} of ${mid.length}`);
  check('and more of them by the close', over(late) >= over(mid), `${over(mid)} then ${over(late)}`);
  check('the screener\'s "past their interest" counter can actually fire', over(late) > 0);
}

// ── 5. one cross is one trade ────────────────────────────────────────────
{
  /* THE BUG: single dark-pool crosses of 21-37 MILLION shares, $3.7bn of
     notional in one print — about a third of AAPL's daily volume, off
     exchange, at once. */
  const prints = ['SPY', 'AAPL', 'NVDA', 'QQQ'].flatMap(t => buildPrints(t, Simulator.snapshotFor(t).spot));
  check('PREMISE: there are crosses to weigh', prints.length > 4, `${prints.length}`);
  check('no single cross exceeds $500m of notional', prints.every(p => p.notional < 0.5), `max $${Math.max(...prints.map(p => p.notional)).toFixed(3)}bn`);
  check('no single cross exceeds 5 million shares', prints.every(p => p.size < 5e6), `max ${Math.max(...prints.map(p => p.size)).toLocaleString()}`);
  check('and every cross is still a real trade, not a rounding artefact', prints.every(p => p.size >= 100 && p.notional > 0));
  /* The size and the notional must agree with the price they are quoted at. */
  check('size times price reconciles with the notional', prints.every(p => Math.abs((p.size * p.price) / 1e9 - p.notional) / p.notional < 0.02));
}

// ── 6. cumulative columns only ever grow ─────────────────────────────────
{
  const t1 = book(at(11, 0));
  const t2 = book(at(14, 30));
  const byKey = new Map(t1.map(r => [r.key, r]));
  const paired = t2.filter(r => byKey.has(r.key));
  check('PREMISE: contracts persist across the session', paired.length > 20, `${paired.length}`);
  check('volume never shrinks as the day runs', paired.every(r => r.volume >= byKey.get(r.key)!.volume));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
