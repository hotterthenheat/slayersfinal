/*
  Acceptance test for the multi-timeframe confluence strip (T-12) and for the
  two indicator curves it and the tape now share. Runs the ACTUAL modules —
  no browser, no React, no chart.

  Proves:
  1. The EMA and VWAP are the SAME numbers the tape draws — asserted against
     the formulas as they were written inside StrikeChart, so the extraction
     cannot have moved a line
  2. VWAP re-anchors at a session gap, and `barMinutes` is what decides where
     a gap is
  3. The rule is the whole rule: above both is up, below both is down, one of
     each is flat — with no threshold anywhere
  4. Too little history is `null`, never `flat` — a strip that reports a
     measurement it did not make is worse than one that says so
  5. Every timeframe in the strip gets a row, in the strip's order
  6. THE FLIP LEVELS ARE THE RULE READ BACKWARDS. The two prices the panel
     prints are the higher and the lower of those same two curves, and the
     state read off them is the state the glyph shows — on four staged tapes,
     every row, no exceptions. There is no second rule to drift.
  7. A run is counted back to the bar the reading changed, and a row that has
     simply never been anything else in view says THAT instead — the panel
     and the strip's freshness mark both hang off the difference
  8. The edges come out nearest first, with the right state on the far side
     of each, and two curves on one price is one edge rather than two at the
     same number
*/
import {
  CONFLUENCE_EMA,
  CONFLUENCE_TFS,
  FRESH_BARS,
  TREND_GLYPH,
  buildConfluence,
  confluenceTally,
  flipEdges,
  flipWords,
  heldWords,
  isFreshFlip,
  nearestFlip,
  trendWords,
  type ConfluenceRow,
  type TrendState,
} from '../src/data/confluence';
import { emaSeries, emaWarmup, vwapSeries } from '../src/data/indicators';
import { aggregateCandles, tfMinutes, type Timeframe } from '../src/data/timeframe';
import type { Candle } from '../src/types/market';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const T0 = 1_700_000_000; // a fixed epoch — nothing here reads a clock

/** `n` one-minute bars walking from `from` to `to`, with volume. */
const ramp = (n: number, from: number, to: number, vol = 1000, start = T0): Candle[] =>
  Array.from({ length: n }, (_, i) => {
    const c = n === 1 ? to : from + ((to - from) * i) / (n - 1);
    return { time: start + i * 60, open: c, high: c + 0.05, low: c - 0.05, close: c, volume: vol };
  });

/** A staged row — for the helpers that take one and read no series. */
const row = (tf: Timeframe, state: TrendState | null, over: Partial<ConfluenceRow> = {}): ConfluenceRow => {
  const base: ConfluenceRow = {
    tf, state, bars: 99, close: 100,
    turnsUpAt: state === null ? null : 101,
    turnsDownAt: state === null ? null : 99,
    ema: null, vwap: null,
    heldBars: 12, flippedInView: true, sinceTime: T0, sincePrice: 98,
    ...over,
  };
  /* A staged row keeps the invariant a built one has — the boundaries ARE the
     two curves — so `curve` means the same thing here as on the desk. VWAP on
     top unless the caller stages it otherwise. */
  return { ...base, vwap: base.vwap ?? base.turnsUpAt, ema: base.ema ?? base.turnsDownAt };
};

// ── 1. the curves are the ones the tape drew ──────────────────────────────
/*
  The reference implementations, transcribed from StrikeChart's indicator
  effect exactly as it stood before the extraction. If `data/indicators.ts`
  ever drifts from these, a line on the chart moved.
*/
{
  const bars = ramp(200, 400, 430);

  const refEma = (bs: Candle[], period: number) => {
    const k = 2 / (period + 1);
    let ema = bs[0].close;
    return bs.map(b => {
      ema = b.close * k + ema * (1 - k);
      return ema;
    });
  };
  const refVwap = (bs: Candle[], mins: number) => {
    const out: number[] = [];
    let pv = 0, vol = 0;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (i > 0 && b.time - bs[i - 1].time > mins * 60 * 1.5) { pv = 0; vol = 0; }
      const typical = (b.high + b.low + b.close) / 3;
      pv += typical * b.volume;
      vol += b.volume;
      out.push(vol > 0 ? pv / vol : b.close);
    }
    return out;
  };

  for (const period of [9, 21, 50]) {
    const mine = emaSeries(bars, period);
    const ref = refEma(bars, period);
    check(
      `EMA${period} matches the curve the tape drew, bar for bar`,
      mine.length === ref.length && mine.every((v, i) => Math.abs(v - ref[i]) < 1e-12),
      `${mine.length} bars, last ${mine[mine.length - 1].toFixed(6)}`
    );
  }
  const v = vwapSeries(bars, 1);
  const vr = refVwap(bars, 1);
  check(
    'VWAP matches the curve the tape drew, bar for bar',
    v.length === vr.length && v.every((x, i) => Math.abs(x - vr[i]) < 1e-12),
    `last ${v[v.length - 1].toFixed(6)}`
  );
  check('an empty series produces an empty curve rather than throwing', emaSeries([], 21).length === 0 && vwapSeries([], 1).length === 0);
}

// ── 2. VWAP re-anchors at a session gap ───────────────────────────────────
{
  /* Two "sessions" of flat but different price, separated by an hour. */
  const a = ramp(30, 100, 100, 1000, T0);
  const b = ramp(30, 200, 200, 1000, T0 + 30 * 60 + 3600);
  const both = [...a, ...b];
  const anchored = vwapSeries(both, 1);
  const last = anchored[anchored.length - 1];
  check(
    'VWAP re-anchors after an overnight gap rather than averaging across it',
    Math.abs(last - 200) < 0.01,
    `last ${last.toFixed(4)} (a blended one would be near 150)`
  );
  /* The SAME bars called 1h bars have no gap in them — 3600s is not more than
     1.5 × 3600 — so the whole thing is one session and the average blends. */
  const asHourly = vwapSeries(both, 60);
  check(
    'and barMinutes is what decides where a gap is',
    Math.abs(asHourly[asHourly.length - 1] - 150) < 1,
    `same bars at 60m: ${asHourly[asHourly.length - 1].toFixed(4)}`
  );
  check('a bar with no volume behind it reports a price, not zero', vwapSeries(ramp(3, 50, 50, 0), 1).every(x => x === 50));
}

// ── 3 & 4. the rule, and the state that is not a measurement ──────────────
{
  const rows = buildConfluence(ramp(2000, 300, 400));
  check('every timeframe in the strip gets a row, in the strip’s order', rows.length === CONFLUENCE_TFS.length && rows.every((r, i) => r.tf === CONFLUENCE_TFS[i]), rows.map(r => r.tf).join(' · '));

  /* A long, monotone climb is above both curves on every timeframe that has
     enough bars — the unambiguous UP case. */
  const decided = rows.filter(r => r.state !== null);
  check('a monotone climb reads up on every timeframe that has a view', decided.length > 0 && decided.every(r => r.state === 'up'), rows.map(r => `${r.tf}:${r.state ?? '—'}`).join(' '));

  const down = buildConfluence(ramp(2000, 400, 300)).filter(r => r.state !== null);
  check('a monotone fall reads down on every timeframe that has a view', down.length > 0 && down.every(r => r.state === 'down'), down.map(r => `${r.tf}:${r.state}`).join(' '));

  /*
    FLAT IS ONE OF EACH, and this is the case a threshold would have hidden.
    A long climb followed by a short pullback puts price BELOW the fast EMA
    while it is still ABOVE the session VWAP the climb built.
  */
  const pullback = [...ramp(400, 300, 400), ...ramp(40, 400, 386, 1000, T0 + 400 * 60)];
  const oneM = buildConfluence(pullback).find(r => r.tf === '1m');
  {
    const bars = aggregateCandles(pullback, 1);
    const e = emaSeries(bars, CONFLUENCE_EMA);
    const v = vwapSeries(bars, 1);
    const i = bars.length - 1;
    const above = bars[i].close > v[i];
    const below = bars[i].close < e[i];
    check(
      'PREMISE: the pullback really does sit below the EMA and above the VWAP',
      above && below,
      `close ${bars[i].close.toFixed(2)} · ema ${e[i].toFixed(2)} · vwap ${v[i].toFixed(2)}`
    );
    check('and one of each reads flat', oneM?.state === 'flat', String(oneM?.state));
  }

  /* Too little history — reported, never guessed at. */
  const thin = buildConfluence(ramp(30, 100, 110));
  const daily = thin.find(r => r.tf === '1D');
  check('a timeframe with too little history reports no view at all', daily?.state === null, `1D: ${daily?.state ?? 'null'} on ${daily?.bars} bar(s)`);
  check('and says how little it had', trendWords(daily!).includes('not enough history'), trendWords(daily!));
  const fast = thin.find(r => r.tf === '1m');
  check('while a timeframe on the same data that DOES have the bars still answers', fast?.state !== null, `1m: ${fast?.state} on ${fast?.bars} bars`);
  check(`the bar floor is the EMA's own period (${CONFLUENCE_EMA})`, emaWarmup(CONFLUENCE_EMA) === CONFLUENCE_EMA);

  check('no data at all is every row with no view, rather than a throw', buildConfluence([]).every(r => r.state === null && r.bars === 0));
}

// ── the glyphs, and the words ─────────────────────────────────────────────
check('every state has a glyph', Object.keys(TREND_GLYPH).length === 3 && TREND_GLYPH.up !== TREND_GLYPH.down && TREND_GLYPH.flat !== TREND_GLYPH.up);
{
  const w = trendWords(row('5m', 'up'));
  check('the words name both references, so the rule is readable off the strip', w.includes(`EMA${CONFLUENCE_EMA}`) && w.includes('VWAP'), w);
  /* THE DOT ON THE STRIP HAS TO MEAN SOMETHING IN WORDS. A mark only a
     reader who already knows it can read is decoration, and a screen reader
     gets nothing at all from it. */
  const fresh = trendWords(row('5m', 'down', { heldBars: 2 }));
  check('a fresh flip says so in the words the mark stands for', fresh.includes('just flipped'), fresh);
  check('and a settled row does not', !trendWords(row('5m', 'down', { heldBars: 40 })).includes('just flipped'));
  check('nor does one that has simply never been anything else', !trendWords(row('5m', 'down', { heldBars: 1, flippedInView: false })).includes('just flipped'));
}
check('and the timeframes named are ones the desk actually has', CONFLUENCE_TFS.every(tf => tfMinutes(tf) > 0));

/*
  ══ THE FLIP LEVELS ═════════════════════════════════════════════════════════

  The panel claims two prices per row and a distance to each. All of it has to
  fall out of the SAME sentence the glyph comes from, or the desk is running
  two rules that agree by luck.
*/

/** The rule, transcribed as the panel reads it — from the boundaries. */
const stateFromEdges = (r: ConfluenceRow): TrendState | null =>
  r.close === null || r.turnsUpAt === null || r.turnsDownAt === null
    ? null
    : r.close > r.turnsUpAt ? 'up' : r.close < r.turnsDownAt ? 'down' : 'flat';

// ── the boundaries are the rule, read backwards ───────────────────────────
{
  const tapes: [string, Candle[]][] = [
    ['a climb', ramp(2000, 300, 400)],
    ['a fall', ramp(2000, 400, 300)],
    ['a climb then a pullback', [...ramp(400, 300, 400), ...ramp(40, 400, 386, 1000, T0 + 400 * 60)]],
    ['a climb then a rout', [...ramp(600, 300, 400), ...ramp(160, 400, 320, 1000, T0 + 600 * 60)]],
  ];
  /* Counted rather than asserted row by row: one line per row would be forty
     identical PASSes hiding the one that matters. Every count has to reach
     `seen`, and `seen` has to be more than zero. */
  let seen = 0, blank = 0, sameState = 0, sameCurves = 0, sameClose = 0;
  const kinds = new Set<string>();
  const off: string[] = [];
  for (const [name, tape] of tapes) {
    for (const r of buildConfluence(tape)) {
      if (r.state === null) {
        if (r.turnsUpAt === null && r.turnsDownAt === null && r.close === null) blank++;
        else off.push(`${name} ${r.tf}: no view but a boundary`);
        continue;
      }
      seen++;
      kinds.add(r.state);
      if (stateFromEdges(r) === r.state) sameState++;
      else off.push(`${name} ${r.tf}: ${r.state} but the boundaries say ${stateFromEdges(r)}`);
      /* The two curves themselves, recomputed here rather than trusted. */
      const bars = aggregateCandles(tape, tfMinutes(r.tf));
      const i = bars.length - 1;
      const e = emaSeries(bars, CONFLUENCE_EMA)[i];
      const v = vwapSeries(bars, tfMinutes(r.tf))[i];
      if (Math.abs(r.turnsUpAt! - Math.max(e, v)) < 1e-9 && Math.abs(r.turnsDownAt! - Math.min(e, v)) < 1e-9) sameCurves++;
      else off.push(`${name} ${r.tf}: ${r.turnsUpAt}/${r.turnsDownAt} vs ${Math.max(e, v)}/${Math.min(e, v)}`);
      if (Math.abs(r.close! - bars[i].close) < 1e-9) sameClose++;
      else off.push(`${name} ${r.tf}: close ${r.close} vs ${bars[i].close}`);
    }
  }
  check('the state read off the two boundaries is the state the glyph shows', seen > 0 && sameState === seen, `${sameState}/${seen} rows`);
  check('the boundaries ARE the higher and the lower of the two curves', sameCurves === seen, `${sameCurves}/${seen} rows${off.length ? ' — ' + off[0] : ''}`);
  check('and the close each was read at is the last bar of that timeframe', sameClose === seen, `${sameClose}/${seen} rows`);
  check('a row with no view carries no boundary and no close either', blank > 0 && off.length === 0, `${blank} such rows`);
  check('and the tapes exercised all three readings, not just one', kinds.size === 3, [...kinds].join(' '));
  check('turnsUpAt is never below turnsDownAt', tapes.every(([, t]) => buildConfluence(t).every(r => r.state === null || r.turnsUpAt! >= r.turnsDownAt!)));
  check(
    'and the pair the row carries is exactly the pair it is bounded by',
    tapes.every(([, t]) => buildConfluence(t).every(r =>
      r.state === null
        ? r.ema === null && r.vwap === null
        : r.turnsUpAt === Math.max(r.ema!, r.vwap!) && r.turnsDownAt === Math.min(r.ema!, r.vwap!))),
  );
}

// ── how long it has said so, and whether anybody could have seen it start ──
{
  const climb = buildConfluence(ramp(2000, 300, 400));
  const oneM = climb.find(r => r.tf === '1m')!;
  check(
    'a row that has never been anything else does not claim a flip',
    oneM.flippedInView === false && oneM.sinceTime === null && oneM.sincePrice === null,
    `1m: held ${oneM.heldBars}, flipped ${oneM.flippedInView}`
  );
  check(
    'and its run is every bar the EMA warm-up leaves measurable',
    oneM.heldBars === oneM.bars - emaWarmup(CONFLUENCE_EMA) + 1,
    `${oneM.heldBars} of ${oneM.bars} bars, warm-up ${emaWarmup(CONFLUENCE_EMA)}`
  );

  /* A climb into a rout: the 1m row changes its mind inside the window, so
     the run is countable and the bar it started on is nameable. */
  const rout = [...ramp(600, 300, 400), ...ramp(160, 400, 320, 1000, T0 + 600 * 60)];
  const r = buildConfluence(rout).find(x => x.tf === '1m')!;
  const bars = aggregateCandles(rout, 1);
  const ema = emaSeries(bars, CONFLUENCE_EMA);
  const vwap = vwapSeries(bars, 1);
  const refState = (k: number): TrendState =>
    bars[k].close > Math.max(ema[k], vwap[k]) ? 'up' : bars[k].close < Math.min(ema[k], vwap[k]) ? 'down' : 'flat';
  let refHeld = 1, refSince = -1;
  for (let k = bars.length - 2; k >= emaWarmup(CONFLUENCE_EMA) - 1; k--) {
    if (refState(k) === r.state) { refHeld++; continue; }
    refSince = k + 1;
    break;
  }
  check('PREMISE: the rout really does change the 1m reading inside the window', refSince > 0 && r.state === 'down', `${r.state}, flip at bar ${refSince}`);
  check('the run is counted back to the bar the reading changed', r.heldBars === refHeld, `${r.heldBars} vs ${refHeld}`);
  check('and it is marked as a flip somebody could have watched', r.flippedInView === true);
  check(
    'the moment named is the FIRST bar of the run, not the last of the one before',
    r.sinceTime === bars[refSince].time && r.sincePrice === bars[refSince].close,
    `${r.sinceTime} @ ${r.sincePrice}`
  );
  check('the words tell the two apart', heldWords(r).startsWith('for ') && !heldWords(r).includes('in view') && heldWords(oneM).includes('in view'), `${heldWords(r)} · ${heldWords(oneM)}`);

  /* Freshness is a flip that was SEEN and is recent — never a row that has
     simply held since the first measurable bar. */
  check(`a flip is news for ${FRESH_BARS} bars`, isFreshFlip(row('5m', 'down', { heldBars: FRESH_BARS })) && !isFreshFlip(row('5m', 'down', { heldBars: FRESH_BARS + 1 })));
  check('a row that never flipped in view is never fresh, however short its run', !isFreshFlip(row('5m', 'up', { heldBars: 1, flippedInView: false })));
  const exact = buildConfluence(ramp(emaWarmup(CONFLUENCE_EMA), 100, 110)).find(x => x.tf === '1m')!;
  check(
    'and the row with exactly the warm-up in bars is that case, not a fresh flip',
    exact.state !== null && exact.heldBars === 1 && exact.flippedInView === false && !isFreshFlip(exact),
    `${exact.bars} bars, held ${exact.heldBars}`
  );
}

// ── the edges: what changes it, nearest first ─────────────────────────────
{
  const up = row('1m', 'up', { close: 100, turnsUpAt: 99, turnsDownAt: 97 });
  const dn = row('1m', 'down', { close: 100, turnsUpAt: 103, turnsDownAt: 101 });
  const flat = row('1m', 'flat', { close: 100, turnsUpAt: 100.5, turnsDownAt: 98 });

  const eUp = flipEdges(up);
  check('an up row goes FLAT under the higher curve and DOWN under the lower', eUp.length === 2 && eUp[0].to === 'flat' && eUp[0].price === 99 && eUp[1].to === 'down' && eUp[1].price === 97, eUp.map(e => `${e.to}@${e.price}`).join(' '));
  check('and both of its edges are below it', eUp.every(e => e.move < 0));

  const eDn = flipEdges(dn);
  check('a down row is the mirror of that', eDn.length === 2 && eDn[0].to === 'flat' && eDn[0].price === 101 && eDn[1].to === 'up' && eDn[1].price === 103, eDn.map(e => `${e.to}@${e.price}`).join(' '));
  check('and both of its edges are above it', eDn.every(e => e.move > 0));

  const eFlat = flipEdges(flat);
  check('a flat row has one edge each way, and the nearer comes first', eFlat.length === 2 && eFlat[0].to === 'up' && eFlat[1].to === 'down', eFlat.map(e => `${e.to}@${e.price}`).join(' '));
  check('so the far side of a flat row is the other way', eFlat[0].move > 0 && eFlat[1].move < 0);
  const eFlatLow = flipEdges(row('1m', 'flat', { close: 100, turnsUpAt: 105, turnsDownAt: 99.5 }));
  check('and when the DOWN edge is the nearer, it is the one that leads', eFlatLow[0].to === 'down', eFlatLow.map(e => `${e.to}@${e.price}`).join(' '));

  check('every row lists its edges nearest first', [eUp, eDn, eFlat, eFlatLow].every(es => Math.abs(es[0].move) <= Math.abs(es[1].move)));
  check('the distance is the move from the close the state was read at', Math.abs(eUp[0].move - (99 - 100) / 100) < 1e-12, String(eUp[0].move));

  /* The two curves on one price: one boundary, and it moves the reading two
     steps. Two edges there would print the same price twice. */
  const collapsed = flipEdges(row('1m', 'up', { close: 100, turnsUpAt: 98, turnsDownAt: 98 }));
  check('two curves on one price is ONE edge, straight to the far reading', collapsed.length === 1 && collapsed[0].to === 'down' && collapsed[0].price === 98, collapsed.map(e => `${e.to}@${e.price}`).join(' '));
  check('and the mirror of it from below', (() => { const c = flipEdges(row('1m', 'down', { close: 100, turnsUpAt: 102, turnsDownAt: 102 })); return c.length === 1 && c[0].to === 'up'; })());

  check('a row with no view has no edges at all', flipEdges(row('1D', null)).length === 0);

  /*
    WHICH LINE EACH LEVEL IS. Four of the five rows hang off one number —
    today's session VWAP is the same average however the bars are cut — so
    the panel prints it four times, and the tag is what makes that the point
    rather than a puzzle.
  */
  const tagged = flipEdges(row('1m', 'up', { close: 100, turnsUpAt: 99, turnsDownAt: 97, vwap: 99, ema: 97 }));
  check('the level that is the VWAP says so, and the one that is the EMA says so', tagged[0].curve === 'vwap' && tagged[1].curve === 'ema', tagged.map(e => `${e.price}:${e.curve}`).join(' '));
  const swapped = flipEdges(row('1m', 'up', { close: 100, turnsUpAt: 99, turnsDownAt: 97, vwap: 97, ema: 99 }));
  check('and it follows the curve, not the column', swapped[0].curve === 'ema' && swapped[1].curve === 'vwap', swapped.map(e => `${e.price}:${e.curve}`).join(' '));
  check('two curves on one price is named as both', flipEdges(row('1m', 'up', { close: 100, turnsUpAt: 98, turnsDownAt: 98, vwap: 98, ema: 98 }))[0].curve === 'both');

  /* On a real tape: every edge names a curve, and it is the curve it sits on. */
  let edges = 0, named = 0;
  for (const r of buildConfluence(ramp(2000, 300, 400))) {
    for (const e of flipEdges(r)) {
      edges++;
      const truth = e.price === r.ema && e.price === r.vwap ? 'both' : e.price === r.vwap ? 'vwap' : 'ema';
      if (e.curve === truth) named++;
    }
  }
  check('and on a built strip every level names the curve it is', edges > 0 && named === edges, `${named}/${edges} edges`);
}

// ── the nearest flip on the desk ──────────────────────────────────────────
{
  const rows: ConfluenceRow[] = [
    row('1m', 'up', { close: 100, turnsUpAt: 97, turnsDownAt: 95 }),   // 3.00% away
    row('5m', 'up', { close: 100, turnsUpAt: 99.5, turnsDownAt: 98 }), // 0.50% away
    row('15m', 'down', { close: 100, turnsUpAt: 104, turnsDownAt: 102 }), // 2.00%
    row('1D', null),
  ];
  const n = nearestFlip(rows);
  check('the nearest flip is the smallest move, whichever way it goes', n?.tf === '5m' && Math.abs(n.edge.move + 0.005) < 1e-12, `${n?.tf} ${n?.edge.move}`);
  check('a row with no view cannot be the nearest', nearestFlip([row('1D', null)]) === null);
  check('and a strip with nothing measured has no headline to print', nearestFlip([]) === null);
  const tie = nearestFlip([
    row('1m', 'up', { close: 100, turnsUpAt: 99, turnsDownAt: 98 }),
    row('5m', 'up', { close: 100, turnsUpAt: 99, turnsDownAt: 98 }),
  ]);
  check('a tie goes to the faster timeframe — it gets there first', tie?.tf === '1m', String(tie?.tf));

  const w = flipWords('5m', { price: 574.9, to: 'flat', move: -0.0019, curve: 'ema' });
  check('the sentence names the timeframe, the reading, the distance and the price', w.includes('5m') && w.includes('goes flat') && w.includes('0.19%') && w.includes('lower') && w.includes('574.90'), w);
  check('and a move upward says so', flipWords('1h', { price: 10, to: 'up', move: 0.02, curve: 'vwap' }).includes('higher'));
  /* A DISTANCE THAT ROUNDS TO NOTHING IS NOT ONE. Price sits on the session
     VWAP often, and "turns up 0.00% higher" is a number where a fact belongs. */
  const onIt = flipWords('1m', { price: 500.21, to: 'up', move: 0.00002, curve: 'vwap' });
  check('a level the tape is already on says so instead of printing 0.00%', onIt.includes('the tape is on it') && !onIt.includes('%'), onIt);
  check('and a hair further away goes back to the distance', flipWords('1m', { price: 500.21, to: 'up', move: 0.0002, curve: 'vwap' }).includes('0.02%'));

  check('every reading has a verb of its own', new Set((['up', 'flat', 'down'] as TrendState[]).map(t => flipWords('1m', { price: 1, to: t, move: 0.02, curve: 'ema' }))).size === 3);
}

// ── the tally ─────────────────────────────────────────────────────────────
{
  const rows = [row('1m', 'up'), row('5m', 'up'), row('15m', 'flat'), row('1h', 'down'), row('1D', null)];
  const t = confluenceTally(rows);
  check('the tally counts every row exactly once', t.up + t.flat + t.down + t.none === rows.length && t.up === 2 && t.flat === 1 && t.down === 1 && t.none === 1, JSON.stringify(t));
  check('and a row with no view is counted, not dropped', confluenceTally([row('1D', null)]).none === 1);
  const live = confluenceTally(buildConfluence(ramp(2000, 300, 400)));
  check('on a real tape it agrees with the strip it counts', live.up + live.flat + live.down + live.none === CONFLUENCE_TFS.length, JSON.stringify(live));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
