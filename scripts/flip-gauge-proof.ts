/*
  Acceptance test for the ONE flip rule (core/walls.ts pickFlip) and for P-4's
  gauge. Runs the ACTUAL modules; the crossing counter is driven with staged
  sessions and the composed gauge against the real simulator.

  Proves:
  1. pickFlip takes the crossing NEAREST SPOT — the case the divergent
     first-from-the-bottom copy in vannacharm.ts got wrong, staged exactly
  2. A one-sided book has NO flip, not a flip at spot
  3. Every module that used to carry its own copy now agrees with the shared
     rule, on the same book — the assertion that would have caught the
     divergence when it was written
  4. Crossings are counted against each bar's OWN flip — a migrating flip
     produces the crossings that happened, not the ones today's line implies
  5. A bar with no flip, or a time mismatch between the buffers, breaks the
     streak rather than counting
  6. The regime is the SIDE of the flip, and thin history reports null, not 0
*/
import { pickFlip } from '../src/core/walls';
import { GAUGE_MIN_BARS, REGIME_WORDS, buildExpiryFlips, buildFlipGauge, countFlipCrossings } from '../src/data/flipGauge';
import { buildExposureProfile } from '../src/data/exposure';
import { buildLevelsFor } from '../src/data/gex';
import { buildVannaCharm } from '../src/data/vannacharm';
import Simulator from '../src/core/simulator';
import type { Candle, GexSnapshot } from '../src/types/market';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const T0 = 1_700_000_000;

// ── 1 & 2. the rule itself ────────────────────────────────────────────────
{
  /*
    THE DIVERGENCE CASE. A jitter crossing deep in the put tail (95/96) and
    the structural one at spot (100/101). First-from-the-bottom names 95.5;
    nearest-to-spot names 100.5. Spot at 100.4.
  */
  const noisy = [
    { strike: 95, value: 5 },
    { strike: 96, value: -1 }, // the jitter crossing
    { strike: 97, value: 2 },
    { strike: 98, value: 4 },
    { strike: 99, value: 6 },
    { strike: 100, value: 3 },
    { strike: 101, value: -8 }, // the structural crossing
    { strike: 102, value: -9 },
  ];
  const flip = pickFlip(noisy, 100.4, r => r.value);
  check('the flip is the crossing NEAREST SPOT', flip === 100.5, String(flip));
  check('— not the first one walking up the chain', flip !== 95.5);
  check('order in does not matter', pickFlip([...noisy].reverse(), 100.4, r => r.value) === 100.5);

  const oneSided = [
    { strike: 98, value: -3 },
    { strike: 99, value: -5 },
    { strike: 100, value: -2 },
  ];
  check('a one-sided book has NO flip, not a flip at spot', pickFlip(oneSided, 99, r => r.value) === null);
  check('an empty book has no flip either', pickFlip([], 99, (r: { strike: number }) => r.strike) === null);
}

// ── 3. the modules agree on one book ──────────────────────────────────────
{
  /*
    THE ASSERTION THAT WOULD HAVE CAUGHT THE DIVERGENCE. buildExposureProfile,
    buildLevelsFor and buildVannaCharm each publish a flip off the same
    simulator book; before this change the third used a different rule and
    could name a different line. The windows differ (±10 vs the full book), so
    the comparison is against the shared rule applied to EACH module's own
    input rather than flip === flip across modules — the claim is "everyone
    reads pickFlip", not "every window sees the same crossing".
  */
  const snap = Simulator.snapshotFor('SPY');
  const vc = buildVannaCharm(snap, 'CHARM', 1, 10);
  const vcExpected = pickFlip(
    vc.rows.map(r => ({ strike: r.strike, value: r.current })),
    snap.spot,
    r => r.value
  );
  check(
    'vannacharm’s current flip is the shared rule over its own window',
    vc.flipCurrent === (vcExpected ?? snap.spot),
    `${vc.flipCurrent} vs ${vcExpected}`
  );

  const exp = buildExposureProfile(snap, '0DTE', 10);
  const expExpected = pickFlip(exp.strikes, snap.spot, s => s.gex.net);
  check('exposure’s flip is the shared rule over its own window', exp.levels.flip === (expExpected ?? snap.spot), `${exp.levels.flip} vs ${expExpected}`);

  const lv = buildLevelsFor('SPY');
  const latest = Simulator.getGexHistory('SPY');
  const lvExpected = latest?.length
    ? pickFlip(latest[latest.length - 1].levels, lv.spot, l => l.value)
    : null;
  check('buildLevelsFor’s flip is the shared rule over the latest snapshot', lv.flip === (lvExpected ?? lv.spot), `${lv.flip} vs ${lvExpected}`);
}

// ── 4 & 5. the crossing counter ───────────────────────────────────────────
/** A bar and a book for one minute: the flip sits at `flipAt`, price at `close`. */
const minute = (i: number, close: number, flipAt: number | null): { bar: Candle; snap: GexSnapshot } => ({
  bar: { time: T0 + i * 60, open: close, high: close + 0.1, low: close - 0.1, close, volume: 100 },
  snap: {
    time: T0 + i * 60,
    levels:
      flipAt === null
        ? [
            { strike: Math.floor(close) - 2, value: -4 },
            { strike: Math.floor(close) + 2, value: -6 },
          ]
        : [
            { strike: flipAt - 0.5, value: 5 },
            { strike: flipAt + 0.5, value: -5 },
          ],
  },
});
const stage = (rows: { bar: Candle; snap: GexSnapshot }[]) => ({
  candles: rows.map(r => r.bar),
  snaps: rows.map(r => r.snap),
});

{
  /* Price oscillates around a fixed flip at 100: below, above, below, above. */
  const osc = stage([minute(0, 99, 100), minute(1, 101, 100), minute(2, 99, 100), minute(3, 101, 100)]);
  check('price oscillating across a fixed flip counts every crossing', countFlipCrossings(osc.candles, osc.snaps) === 3, String(countFlipCrossings(osc.candles, osc.snaps)));

  /* Price NEVER moves; the FLIP walks across it. Crossed twice all the same —
     the case counting against today's flip alone would score 0. */
  const walk = stage([minute(0, 100, 99), minute(1, 100, 101), minute(2, 100, 99)]);
  check('a migrating flip crossing a still price still counts', countFlipCrossings(walk.candles, walk.snaps) === 2, String(countFlipCrossings(walk.candles, walk.snaps)));

  /* And the inverse control: price and flip move TOGETHER, same side all day. */
  const drift = stage([minute(0, 99, 100), minute(1, 101, 102), minute(2, 103, 104)]);
  check('price tracking below a rising flip never counts', countFlipCrossings(drift.candles, drift.snaps) === 0);

  /* A minutes-long hole in the flip breaks the streak. */
  const gap = stage([minute(0, 99, 100), minute(1, 101, null), minute(2, 101, 100)]);
  check('a bar with no flip breaks the streak rather than counting across it', countFlipCrossings(gap.candles, gap.snaps) === 0, String(countFlipCrossings(gap.candles, gap.snaps)));
  const gapThenCross = stage([minute(0, 99, 100), minute(1, 101, null), minute(2, 101, 100), minute(3, 99, 100)]);
  check('and counting resumes on the far side of the gap', countFlipCrossings(gapThenCross.candles, gapThenCross.snaps) === 1);

  /* Misaligned buffers are skipped, not counted. */
  const mis = stage([minute(0, 99, 100), minute(1, 101, 100)]);
  mis.snaps[1] = { ...mis.snaps[1], time: mis.snaps[1].time + 60 };
  check('a time mismatch between the buffers is skipped rather than crossed', countFlipCrossings(mis.candles, mis.snaps) === 0);

  check('empty inputs count nothing rather than throwing', countFlipCrossings([], []) === 0);
}

// ── 6. the composed gauge ─────────────────────────────────────────────────
{
  const snap = Simulator.snapshotFor('SPY');
  const g = buildFlipGauge(snap);
  check('the gauge reads the live book', g.spot === snap.spot && g.bars > 0, `spot ${g.spot}, ${g.bars} bars`);
  check(
    'its flip is the shared rule over the same chain',
    g.flip === pickFlip(snap.chain, snap.spot, n => n.netGex),
    String(g.flip)
  );
  if (g.flip !== null) {
    check('the regime is the SIDE of the flip', g.regime === (snap.spot >= g.flip ? 'LONG' : 'SHORT'), `${g.regime} with spot ${snap.spot} vs flip ${g.flip}`);
    check('the distance is the flip less spot, signed', Math.abs((g.distAbs ?? NaN) - (g.flip - snap.spot)) < 1e-9, String(g.distAbs));
    check('and the percent agrees with it', Math.abs((g.distPct ?? NaN) - ((g.flip - snap.spot) / snap.spot) * 100) < 1e-9);
  } else {
    check('with no flip the gauge carries no regime and no distance', g.regime === null && g.distAbs === null && g.distPct === null);
  }
  check(`a full session reports a crossing COUNT (bars ${g.bars} ≥ ${GAUGE_MIN_BARS})`, g.crossings !== null && g.crossings >= 0, String(g.crossings));
  check('both regimes have words, and the words name the mechanism', REGIME_WORDS.SHORT.blurb.includes('amplif') && REGIME_WORDS.LONG.blurb.includes('absorb'));
}

// ── P-9. the flip, by expiry ──────────────────────────────────────────────
{
  /*
    THE SEAM CLAIM: each lens's flip is the shared rule over THAT LENS'S OWN
    windowed profile — the same numbers the map and the matrix draw for it.
    A "0DTE flip" computed off anything else could disagree with the page it
    sits on, which is the failure this feature exists to avoid.
  */
  const snap = Simulator.snapshotFor('SPY');
  const f = buildExpiryFlips(snap);
  for (const [key, expiry] of [['d0', '0DTE'], ['weekly', '7D'], ['book', 'ALL']] as const) {
    const prof = buildExposureProfile(snap, expiry, 15);
    const expect = pickFlip(prof.strikes, snap.spot, s => s.gex.net);
    check(`the ${key} flip is the shared rule over the ${expiry} lens's own profile`, f[key] === expect, `${f[key]} vs ${expect}`);
  }
  check('the spread is book − 0DTE', f.d0 !== null && f.book !== null ? Math.abs((f.spread ?? NaN) - (f.book - f.d0)) < 1e-9 : f.spread === null, String(f.spread));

  /*
    WHAT THE THREE LENSES CAN SAY ON THIS FEED, and what they cannot.

    THIS ASSERTION USED TO DEMAND THE OPPOSITE. It scanned the roster for
    names where the three lenses disagreed and required at least one — and it
    passed, on 6 of 22 names, which is why the feature shipped looking
    differentiated. Its own comment named the mechanism without drawing the
    conclusion: "the divergence comes from the expiry-seeded jitter". The
    profile's per-strike jitter was seeded with the expiry NAME, so a hash of
    the string "7D" was tilting near-balanced strikes. Three numbers off one
    book and one hash is fake differentiation, and P-24B removed the tilt by
    making the split net-preserving.

    So the true property, asserted in both directions:

      ON THIS FEED THEY MUST AGREE. The expiry view is one positive scalar
      over the whole book, and scaling by a positive constant cannot move a
      sign change. Every name, every time — no roster luck involved.

      GIVEN A REAL PER-EXPIRY BOOK THEY SEPARATE. Staged below, because the
      simulator has no per-expiry open interest to stage it for us: two books
      whose sign changes sit at different strikes really do yield different
      flips through this same function.
  */
  const roster = ['SPY','QQQ','AAPL','NVDA','TSLA','META','MSFT','AMZN','GOOGL','AMD','NFLX','AVGO','COIN','PLTR','JPM','ORCL','CRM','UBER','MU','BA','DIS','INTC'];
  let diverging = 0;
  for (const t of roster) {
    const x = buildExpiryFlips(Simulator.snapshotFor(t));
    const set = new Set([x.d0, x.weekly, x.book].map(v => (v === null ? 'null' : v.toFixed(2))));
    if (set.size > 1) diverging++;
  }
  check(
    `a scalar expiry lens CANNOT move the flip — all three agree on every name (${roster.length} checked)`,
    diverging === 0,
    `${diverging} names disagreed, which means a lens is perturbing the book`
  );

  /* And the shape still differentiates when the data can. Two staged books,
     one flipping at +4 and one at −6 off the same spot, read through the
     same picker the lenses use. */
  const stagedFlip = (crossAt: number): number | null => {
    const spot = 100;
    const strikes = [];
    for (let i = -15; i <= 15; i++) strikes.push({ strike: spot + i, gex: { net: i >= crossAt ? -1e8 : 1e8, put: 0, call: 0 } });
    return pickFlip(strikes, spot, s => s.gex.net);
  };
  const a = stagedFlip(4);
  const b = stagedFlip(-6);
  check('given books that really differ, the shared rule separates them', a !== null && b !== null && a !== b, `${a} vs ${b}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
