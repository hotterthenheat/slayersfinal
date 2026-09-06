/*
  Acceptance test for the engines the Pinpoint rebuild added.

    data/stickyBook   — sticky-strike vs sticky-delta, both flips
    data/painCurve    — today's buyers' P&L across spot, the flip spot
    data/oiHeat       — build / unwind / churn classification
    data/rankedtargets — reader-adjustable weights, normalised

  Each is a pure function over the desk's own types, so the assertions
  are relationships a reader could check by hand, on staged books.
*/
import { buildStickyRead, repriceBook, stickyWords, STICKY_WORDS } from '../src/data/stickyBook';
import { buildPainCurve, painWords } from '../src/data/painCurve';
import { CHURN_RATIO, OI_KIND_WORDS, classifyOiRow, type OiHeatRow } from '../src/data/oiHeat';
import { RANK_FACTORS, RANK_WEIGHTS, buildRankedTargets, weightsAreDefault } from '../src/data/rankedtargets';
import Simulator from '../src/core/simulator';
import type { StrikeNode } from '../src/types/market';
import type { FlowPrint } from '../src/types/trace';

let pass = 0,
  fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

/* A staged book: call-heavy overhead, put-heavy underneath, one sign change. */
const node = (strike: number, netGex: number): StrikeNode =>
  ({ strike, callOI: 1000, putOI: 1000, gamma: 0.01, callGex: 0, putGex: 0, netGex, callDex: 0, putDex: 0, netDex: 0, callVex: 0, putVex: 0, netVex: 0, vanna: 0, charm: 0, callVanna: 0, putVanna: 0, netVanna: 0, callCharm: 0, putCharm: 0, netCharm: 0 }) as unknown as StrikeNode;
const BOOK: StrikeNode[] = [];
for (let k = 480; k <= 520; k += 2) BOOK.push(node(k, k >= 500 ? -(k - 498) * 1e6 : (502 - k) * 1e6));
const SPOT = 500;
const IV = 0.22;

// ---- sticky book -------------------------------------------------------------
{
  const same = buildStickyRead(BOOK, SPOT, SPOT, IV)!;
  check('at today’s spot the two assumptions agree by construction', same.agree && same.flipGap === 0);
  check('and the words say to move spot', /move spot/i.test(stickyWords(same)));
  const r = repriceBook(BOOK, SPOT, SPOT, IV, 1 / 12, 'strike');
  check('no move re-prices nothing', r.every((x, i) => Math.abs(x.netGex - BOOK[i].netGex) < 1e-6));

  /* Move spot down 3% — under sticky delta the smile re-centres, so the
     strikes now 3% away wear today's 3%-away vol; under sticky strike they
     keep today's. The two books differ, and the difference is bounded. */
  const moved = buildStickyRead(BOOK, SPOT, SPOT * 0.97, IV)!;
  const rs = repriceBook(BOOK, SPOT, SPOT * 0.97, IV, 1 / 12, 'strike');
  const rd = repriceBook(BOOK, SPOT, SPOT * 0.97, IV, 1 / 12, 'delta');
  const diff = rs.reduce((a, x, i) => a + Math.abs(x.netGex - rd[i].netGex), 0);
  check('under a 3% move the two assumptions produce different books', diff > 0, `Σ|Δ| = ${diff.toExponential(2)}`);
  check('every strike keeps its sign under both — a re-price scales, it does not flip a shelf', rs.every((x, i) => Math.sign(x.netGex) === Math.sign(BOOK[i].netGex)) && rd.every((x, i) => Math.sign(x.netGex) === Math.sign(BOOK[i].netGex)));
  check('both books still have a flip', moved.strike.flip !== null && moved.delta.flip !== null);
  check('the read carries both flips and says which assumption made which', /if vol stays on the strikes|both assumptions/.test(stickyWords(moved)));
  check('the two assumptions have words a reader can choose between', STICKY_WORDS.strike.note.length > 40 && STICKY_WORDS.delta.note.length > 40 && STICKY_WORDS.strike.label !== STICKY_WORDS.delta.label);
  check('an empty book has no read', buildStickyRead([], SPOT, SPOT, IV) === null);
}

// ---- pain curve --------------------------------------------------------------------
{
  const strikes = BOOK.map(n => n.strike);
  const empty = buildPainCurve([], strikes, SPOT, 30 / 365, IV);
  check('no aggressive buying → no legs, no curve, no flip', empty.legs.length === 0 && empty.points.length === 0 && empty.flipSpot === null);
  check('and the words say nobody is in pain', /nobody has paid up/i.test(painWords(empty, SPOT)));

  /* A tape with one population: 100 calls at 500 bought at $6. */
  const print = (over: Partial<FlowPrint>): FlowPrint =>
    ({ id: 1, time: '09:31:00', ticker: 'SPY', legs: 1, strike: 500, right: 'C', otmPct: 0, expiry: '10/06/2026', dte: 30, fill: 6, bid: 5.9, ask: 6.1, fillPos: 1, side: 'ASK', flowScore: 60, ratioLabel: 'ASK 61%', ratioBidPct: 39, size: 100, premium: 60_000, ...over }) as unknown as FlowPrint;
  const tape = [print({ fill: 6, size: 100 })];
  const c = buildPainCurve(tape, strikes, SPOT, 30 / 365, IV, 81);
  if (c.legs.length === 0) {
    check('the staged print counts as an aggressive long (fixture shape)', false, 'buildStrikeBasis rejected the fixture — see costBasis.isAggressiveLong');
  } else {
    check('the curve spans the chain', c.points.length === 81 && c.points[0].spot === 480 && c.points[80].spot === 520);
    check('the curve is monotone for a single long call', c.points.every((p, i) => i === 0 || p.pnl >= c.points[i - 1].pnl - 1e-6));
    check('P&L at the market matches the leg', Math.abs(c.now - c.legs.reduce((a, l) => a + (l.unrealized ?? 0), 0)) < 1e-6);
    check('the flip spot is where the curve crosses zero', c.flipSpot !== null && Math.abs(buildPainCurve(tape, [c.flipSpot!, c.flipSpot!], c.flipSpot!, 30 / 365, IV, 3).now) < 500);
    check('the words say it is not max pain', /not max pain/i.test(painWords(c, SPOT)));
  }
}

// ---- OI classification ------------------------------------------------------------------
{
  const row = (deltas: number[]): OiHeatRow => ({ strike: 500, cells: deltas.map((d, i) => ({ time: i, deltaOi: d, deltaCall: d, deltaPut: 0, flexTransfer: null })), netToday: deltas.reduce((a, b) => a + b, 0) });
  check('steady adding is a build', classifyOiRow(row([100, 200, 150, 50])) === 'build');
  check('steady shedding is an unwind', classifyOiRow(row([-100, -200, -150])) === 'unwind');
  check('put on and taken off is churn, not a small build', classifyOiRow(row([4000, -3600])) === 'churn');
  check('nothing at all is flat', classifyOiRow(row([0, 0, 0])) === 'flat');
  /* net/gross = (1000 − x)/(1000 + x) crosses CHURN_RATIO at x = 1000·(1 − r)/(1 + r). */
  const xCut = (1000 * (1 - CHURN_RATIO)) / (1 + CHURN_RATIO);
  check(`the churn cut is ${CHURN_RATIO} of gross`, classifyOiRow(row([1000, -(Math.floor(xCut) - 1)])) === 'build' && classifyOiRow(row([1000, -(Math.ceil(xCut) + 1)])) === 'churn', `cut at −${xCut.toFixed(1)}`);
  check('every kind has words with distinct labels', new Set((['build', 'unwind', 'churn', 'flat'] as const).map(k => OI_KIND_WORDS[k].label)).size === 4);
}

// ---- reader-adjustable rank weights --------------------------------------------------------
{
  const snap = Simulator.snapshotFor('SPY');
  const base = buildRankedTargets(snap);
  const same = buildRankedTargets(snap, { ...RANK_WEIGHTS });
  check('the default weights reproduce the default ranking', base.targets.every((t, i) => t.strike === same.targets[i].strike && t.score === same.targets[i].score));
  check('weightsAreDefault knows the default', weightsAreDefault({ ...RANK_WEIGHTS }) && !weightsAreDefault({ ...RANK_WEIGHTS, gex: RANK_WEIGHTS.gex + 0.1 }));
  const onlyProx = buildRankedTargets(snap, { gex: 0, oi: 0, volume: 0, nbr: 0, proximity: 1 });
  check('all the weight on proximity ranks the nearest strike first', Math.abs(onlyProx.targets[0].strike - snap.spot) <= Math.abs(onlyProx.targets[1].strike - snap.spot) + 1e-9, `#1 ${onlyProx.targets[0].strike} at spot ${snap.spot.toFixed(2)}`);
  const heavy = buildRankedTargets(snap, { gex: 3, oi: 3, volume: 3, nbr: 3, proximity: 3 });
  check('weights are normalised — a set summing to 15 still yields a 0–100 score', heavy.targets.every(t => t.score >= 0 && t.score <= 100));
  const equal = buildRankedTargets(snap, { gex: 1, oi: 1, volume: 1, nbr: 1, proximity: 1 });
  check('and a scaled set ranks identically to its unit version', heavy.targets.every((t, i) => t.strike === equal.targets[i].strike));
  check('every factor still earns a slice', equal.targets[0].factors.length === RANK_FACTORS.length);
  const neg = buildRankedTargets(snap, { gex: -1, oi: 1, volume: 1, nbr: 1, proximity: 1 });
  check('a negative weight is treated as zero, never as a penalty', neg.targets.every(t => t.factors.find(f => f.key === 'gex')!.points === 0));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
