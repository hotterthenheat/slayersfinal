/*
  Acceptance test for the net-GEX series and its percentile (P-3 / P-7). The
  composed builders read the simulator, whose history cannot be staged, so the
  claims are structural — internal consistency, definitions, and the states
  that are not measurements — plus `ordinal`, which is pure.

  Proves:
  1. The series is one session of aligned (time, netGex, spot) samples, and
     every total is really the sum of that bar's levels
  2. Zero crossings are exactly where the series changes sign
  3. The percentile is "share at or below", ranks today's own total where it
     belongs, and its extremes behave (far below history → 0th; far above →
     100th)
  4. The depth label is sessions of history, not a borrowed "2yr"
  5. A name the simulator has never seen is SYNTHESIZED, not refused — the
     picker's own contract ("unknown symbols still pick on Enter") reaches
     these builders too
  6. Ordinals wear the right suffixes, 11th–13th included
*/
import Simulator from '../src/core/simulator';
import { buildGexPercentile, buildNetGexSeries, ordinal } from '../src/data/gexSeries';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// ── 1 & 2. the series ─────────────────────────────────────────────────────
{
  const s = buildNetGexSeries('SPY');
  check('the series covers the session at the drift stride', s.points.length >= 100 && s.points.length <= 390, `${s.points.length} points`);
  check('every point carries a spot', s.points.every(p => p.spot > 0));
  check('times are strictly increasing', s.points.every((p, i) => i === 0 || p.time > s.points[i - 1].time));

  /* The totals really are the sums of that bar's levels. */
  const snaps = Simulator.getGexHistory('SPY') ?? [];
  const byTime = new Map(snaps.map(x => [x.time, x]));
  const verified = s.points.every(p => {
    const snap = byTime.get(p.time);
    if (!snap) return false;
    let t = 0;
    for (const l of snap.levels) t += l.value;
    return Math.abs(t - p.netGex) < 1e-6;
  });
  check('every total is the sum of that bar’s own levels', verified);

  check(
    'min and max bound the series',
    s.points.every(p => p.netGex >= s.min && p.netGex <= s.max) &&
      s.points.some(p => p.netGex === s.min) &&
      s.points.some(p => p.netGex === s.max)
  );
  check(
    'zero crossings are exactly the sign changes',
    s.zeroCrossings.every(i => i > 0 && Math.sign(s.points[i].netGex) !== Math.sign(s.points[i - 1].netGex)),
    `${s.zeroCrossings.length} crossing(s)`
  );
  const recount = s.points.filter(
    (p, i) => i > 0 && Math.sign(p.netGex) !== Math.sign(s.points[i - 1].netGex) && s.points[i - 1].netGex !== 0
  ).length;
  check('— all of them, not a subset', recount === s.zeroCrossings.length, `${recount} recounted`);
}

// ── 3 & 4. the percentile ─────────────────────────────────────────────────
{
  const s = buildNetGexSeries('SPY');
  const snaps2 = Simulator.getGexHistory('SPY') ?? [];
  const today = s.points[s.points.length - 1].netGex;
  const p = buildGexPercentile('SPY', today);
  check('a full store yields a rank', p !== null, JSON.stringify(p));
  if (p) {
    check('the rank is a share, 0..100', p.pctile >= 0 && p.pctile <= 100, `${p.pctile.toFixed(1)}`);
    check(`the depth is sessions of history (${p.sessions}), never a borrowed period`, p.sessions >= 1 && p.sessions <= 30, `${p.samples} samples`);

    /* The definition, exercised at the ends: a value below everything the
       store holds ranks 0th; above everything, 100th. */
    const lo = buildGexPercentile('SPY', -1e15)!;
    const hi = buildGexPercentile('SPY', 1e15)!;
    check('a total below all history ranks 0th', lo.pctile === 0, `${lo.pctile}`);
    check('a total above all history ranks 100th', hi.pctile === 100, `${hi.pctile}`);
    check('and the rank is monotone in the total', lo.pctile <= p.pctile && p.pctile <= hi.pctile);

    /*
      AT OR BELOW, not strictly below — pinned on a tie, because the extremes
      above cannot tell the two apart (a mutation to `<` passed them all).
      The smallest sampled total ties WITH ITSELF: at-or-below counts it and
      ranks it above 0th; strictly-below counts nothing and calls the store's
      own minimum "below all history", which is a falsehood about a value the
      history visibly contains.
    */
    const sampled: number[] = [];
    for (let i = 0; i < snaps2.length; i += 3) {
      let t = 0;
      for (const l of snaps2[i].levels) t += l.value;
      sampled.push(t);
    }
    const minSample = Math.min(...sampled);
    const atMin = buildGexPercentile('SPY', minSample)!;
    check('a value the history contains ranks above 0th — ties count', atMin.pctile > 0, `${atMin.pctile.toFixed(2)} at the store's own minimum`);
  }
}

// ── 5. an unknown name ────────────────────────────────────────────────────
{
  /*
    NOT the empty answer — the SYNTHESIZED one, and asserting emptiness here
    was this proof's own first bug. `getCandles`/`getGexHistory` run through
    `ensureTicker`, which forward-sims any name it has never seen; that is the
    picker's shipped contract ("a symbol with no listing still picks on Enter:
    the sim synthesizes unknown names"), and these builders sit behind the
    same pickers. The empty guard in the builders is for a genuinely empty
    store, which the public API never exposes — it is a defensive floor, not a
    reachable state to test through here.
  */
  const s = buildNetGexSeries('ZZZZNOTREAL');
  check('a never-seen name is synthesized and measured like any other', s.points.length >= 100, `${s.points.length} points`);
  const p = buildGexPercentile('ZZZZNOTREAL', s.points[s.points.length - 1]?.netGex ?? 0);
  check('and ranks against its own synthesized history', p !== null && p.pctile >= 0 && p.pctile <= 100, JSON.stringify(p));
}

// ── 6. ordinals ───────────────────────────────────────────────────────────
{
  const cases: [number, string][] = [
    [0, '0th'], [1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'],
    [8, '8th'], [11, '11th'], [12, '12th'], [13, '13th'],
    [21, '21st'], [22, '22nd'], [23, '23rd'], [43, '43rd'],
    [91, '91st'], [100, '100th'], [8.4, '8th'], [90.7, '91st'],
  ];
  const wrong = cases.filter(([v, want]) => ordinal(v) !== want);
  check('ordinals wear the right suffixes, the 11th–13th traps included', wrong.length === 0, wrong.map(([v, w]) => `${v}→${ordinal(v)} (want ${w})`).join(', '));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
