/*
  Acceptance test for the rail's five nets.

  Proves:
  1. All five metrics are offered and every one reads a DIFFERENT field —
     a rail that silently showed gamma under four other names would look
     perfectly correct and be a lie
  2. Vanna and charm are real dealer EXPOSURES now: OI-weighted, dollarised
     and direction-applied like the other three, not the raw per-contract
     greeks they used to be
  3. Net charm is NOT the old unweighted (call+put)/2 average — each leg
     carries its own side's open interest, which is the whole point
  4. Each net is the sum of its own two legs, exactly
  5. An unknown metric falls back to gamma rather than drawing an empty rail
*/
import Simulator from '../src/core/simulator';
import { buildLadderFor, RAIL_METRICS, type RailMetric } from '../src/data/gex';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

const TICKER = 'SPY';
Simulator.ensureTicker(TICKER);
const { chain } = Simulator.chainFor(TICKER);

// ── 1. five metrics, five different reads ─────────────────────────────────
{
  check('five nets are offered', RAIL_METRICS.length === 5, RAIL_METRICS.map(m => m.key).join(','));
  const byMetric = new Map<RailMetric, string>();
  for (const m of RAIL_METRICS) {
    const { rows } = buildLadderFor(TICKER, 30, 10, m.key);
    byMetric.set(m.key, rows.map(r => r.value.toFixed(4)).join('|'));
    check(`"${m.label}" builds a rail`, rows.length > 0, `${rows.length} rows`);
  }
  const distinct = new Set(byMetric.values());
  check(
    'every metric draws a DIFFERENT column — none is gamma under another name',
    distinct.size === 5,
    `${distinct.size} distinct of 5`
  );
  /* And the strikes are the same across metrics — only the values move. */
  const g = buildLadderFor(TICKER, 30, 10, 'gex').rows.map(r => r.strike).join(',');
  const v = buildLadderFor(TICKER, 30, 10, 'vanna').rows.map(r => r.strike).join(',');
  check('the strike grid is identical across metrics', g === v);
}

// ── 2+3+4. vanna and charm are exposures now ──────────────────────────────
{
  const withOI = chain.filter(n => n.callOI > 0 && n.putOI > 0);
  check('PREMISE: the chain has two-sided strikes to test', withOI.length > 0, `${withOI.length}`);

  check(
    'net vanna is its own two legs, exactly',
    withOI.every(n => near(n.netVanna, n.callVanna + n.putVanna)),
  );
  check(
    'net charm is its own two legs, exactly',
    withOI.every(n => near(n.netCharm, n.callCharm + n.putCharm)),
  );
  /* The raw greek is still there and is NOT the exposure — if these were
     equal, nothing had been dollarised. */
  check(
    'the raw greek and the exposure are different objects',
    withOI.some(n => Math.abs(n.netVanna - n.vanna) > 1e-6),
  );
  /* THE OLD AVERAGE. `charm` on the node is still (charmCall + charmPut)/2,
     an unweighted mean of two per-contract greeks. The net must not equal
     it — that is the defect this work removed. */
  check(
    'net charm is not the old unweighted average of the two legs',
    withOI.some(n => Math.abs(n.netCharm - n.charm) > 1e-6),
  );
  /* And it really is OI-weighted: a strike whose call OI dwarfs its put OI
     must lean to the call leg. */
  const lopsided = withOI.filter(n => n.callOI > n.putOI * 4);
  if (lopsided.length > 0) {
    check(
      'a call-heavy strike leans its charm to the call leg',
      lopsided.every(n => Math.abs(n.callCharm) > Math.abs(n.putCharm)),
      `${lopsided.length} lopsided strikes`
    );
  } else {
    check('PREMISE: no lopsided strike in this chain to test OI weighting', true, 'skipped');
  }
  /* Scale sanity: an exposure is dollars, so a busy strike's net vanna must
     be far larger than a bare greek ever is. */
  const biggest = withOI.reduce((a, b) => (Math.abs(a.netVanna) > Math.abs(b.netVanna) ? a : b));
  check('net vanna is dollar-scaled, not a bare greek', Math.abs(biggest.netVanna) > 1000, biggest.netVanna.toFixed(0));
}

// ── 5. the fallback ───────────────────────────────────────────────────────
{
  const gex = buildLadderFor(TICKER, 30, 10, 'gex').rows.map(r => r.value).join(',');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const junk = buildLadderFor(TICKER, 30, 10, 'nonsense' as any).rows.map(r => r.value).join(',');
  check('an unknown metric falls back to gamma, not to an empty rail', junk === gex && junk.length > 0);
  const dflt = buildLadderFor(TICKER, 30, 10).rows.map(r => r.value).join(',');
  check('and the default is gamma, as it always was', dflt === gex);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
