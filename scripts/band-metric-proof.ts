/*
  Acceptance test for the exposure band's five nets.

  This replaces rail-metric-proof.ts. The five nets were briefly a picker on
  the strike LADDER; that was the wrong home — the ladder answers what is
  trading at each strike right now, and burying it under a five-greek
  dropdown was the reason the picker was pulled. They live on the exposure
  band, which is already a tall column of strikes with one net across it.

  Proves:
  1. All five are offered and every one reads a DIFFERENT field — a band
     that silently drew gamma under four other names would look perfectly
     correct and be a lie
  2. Vanna and charm are real dealer EXPOSURES: OI-weighted, dollarised and
     direction-applied like the other three, not raw per-contract greeks
  3. Each net is the sum of its own strikes, exactly, and each strike's net
     is the sum of its own two legs
  4. Every metric has its own bar scale, so a small charm book is not drawn
     flat against a large gamma one
  5. The unit line differs per metric — gamma per 1% and charm per day are
     not comparable, and a reader flicking between them must see the
     denominator change
  6. The ladder no longer takes a metric at all — it is gamma, and only
     gamma
*/
import Simulator from '../src/core/simulator';
import { blackScholesGreeks } from '../src/core/greeks';
import { buildExposureProfile } from '../src/data/exposure';

import { buildLadderFor } from '../src/data/gex';
import { BAND_METRICS, BAND_FIELDS, type BandMetric } from '../src/components/gex/StrikeExposureBand';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const T = 'SPY';
Simulator.ensureTicker(T);
const snapshot = Simulator.snapshotFor(T);
const p = buildExposureProfile(snapshot, 'ALL', 20);

/* Read from the component's OWN table, not a copy. A proof that restates
   the mapping proves only that two copies agree with each other, which is
   exactly how "vanna reads gex" survived the first version of this file. */
const SPLIT = Object.fromEntries(
  (Object.keys(BAND_FIELDS) as BandMetric[]).map(k => [k, BAND_FIELDS[k].split])
) as Record<BandMetric, 'gex' | 'dex' | 'vex' | 'vanna' | 'charm'>;
const NET = Object.fromEntries(
  (Object.keys(BAND_FIELDS) as BandMetric[]).map(k => [k, BAND_FIELDS[k].net])
) as Record<BandMetric, 'netGex' | 'netDex' | 'netVex' | 'netVanna' | 'netCharm'>;

// ── 1. five metrics, five different readings ─────────────────────────────
{
  check('PREMISE: the profile has strikes', p.strikes.length > 0, `${p.strikes.length}`);
  check('all five nets are offered', BAND_METRICS.length === 5, BAND_METRICS.map(m => m.key).join(','));
  const keys = BAND_METRICS.map(m => m.key);
  for (const want of ['gex', 'dex', 'vex', 'vanna', 'charm'] as BandMetric[]) {
    check(`${want} is on the picker`, keys.includes(want));
  }
  /* THE MAPPING, not just the data. A metric's headline net and the bars
     drawn under it must come from the same greek — a band showing the right
     bars under the wrong number is perfectly plausible on screen. Checking
     the five fields are distinct does NOT catch this, and did not. */
  for (const m of BAND_METRICS) {
    const f = BAND_FIELDS[m.key];
    const expected = `net${f.split.charAt(0).toUpperCase()}${f.split.slice(1)}`;
    check(`${m.key}: the headline and the bars read the same greek`, f.net === expected, `${f.net} vs ${expected}`);
    check(`${m.key}: and that greek is its own`, f.split === m.key, `${f.split}`);
  }
  /* The one that matters: no two metrics may read the same numbers. */
  const seen = new Map<string, BandMetric>();
  for (const m of BAND_METRICS) {
    const sig = p.strikes.map(s => s[SPLIT[m.key]].net.toFixed(4)).join('|');
    const dup = seen.get(sig);
    dup
      ? check(`${m.key} reads its own field`, false, `identical to ${dup}`)
      : check(`${m.key} reads its own field`, true);
    seen.set(sig, m.key);
  }
}

// ── 2. vanna and charm are dealer exposures, not raw greeks ──────────────
{
  const { chain } = Simulator.chainFor(T);
  const busiest = [...chain].sort((a, b) => b.callOI + b.putOI - (a.callOI + a.putOI))[0];
  const thinnest = [...chain].filter(n => n.callOI + n.putOI > 0).sort((a, b) => a.callOI + a.putOI - (b.callOI + b.putOI))[0];
  check('PREMISE: the chain has a busy strike and a thin one', !!busiest && !!thinnest);
  /*
    AN EXPOSURE IS THE GREEK TIMES OPEN INTEREST — TESTED AT A FIXED GREEK.

    This compared the busiest strike's net against the thinnest and expected
    the busy one to win, on the reasoning that an OI-weighted number is
    bigger where the open interest is. That is only true when the crowd
    happens to stand where the greek is alive, and vanna is not flat across
    strikes — it collapses away from spot.

    Measured on a Sunday tape, spot 500: the busiest strike was 475, twenty
    five points out, carrying 113,930 contracts and a per-contract vanna of
    -5.2e-8 — an exposure of 2 dollars. The thinnest was 517 with 1,380
    contracts, a per-contract vanna of 0.0029, and an exposure of 1,091.
    Fifty-six thousand times the greek beats eighty times the crowd, and the
    check called a correct book a raw greek.

    Holding the greek fixed is the test that was always meant. If each leg is
    its own side's open interest times that strike's own greek times one
    scale, then `leg / (greek x OI)` is the SAME number at every strike —
    which is exactly what "OI-weighted" means, and cannot be true of a raw
    per-contract greek.
  */
  const alive = chain.filter(n => Math.abs(n.vanna) > 1e-9 && n.callOI > 0);
  check('PREMISE: some strikes carry a live vanna', alive.length > 2, `${alive.length} of ${chain.length}`);
  const scales = alive.map(n => n.callVanna / (n.vanna * n.callOI));
  const scaleSpread = Math.max(...scales) - Math.min(...scales);
  const scaleMid = scales.reduce((a, b) => a + b, 0) / scales.length;
  /* WITHIN THE JITTER, NOT TO THE BIT. The desk perturbs the book rather
     than emitting a textbook chain, so the scale is one number to about a
     percent, not to the last digit — measured, -272.5 across 57 strikes
     with a spread of 2.9. The band is wide enough for that and nowhere near
     wide enough to admit a raw per-contract greek, which would come out at
     1 rather than in the hundreds. */
  check(
    'vanna exposure is that strike’s own greek times its own open interest',
    scaleSpread < Math.abs(scaleMid) * 0.05,
    `scale ${scaleMid.toFixed(2)} across ${scales.length} strikes, spread ${scaleSpread.toFixed(2)} (${((scaleSpread / Math.abs(scaleMid)) * 100).toFixed(2)}%)`
  );
  /* And the scale is a DOLLAR one: a raw per-contract greek would come out
     at 1, not in the hundreds. */
  check(
    'and that scale is a dollar scale, not unity',
    Math.abs(scaleMid) > 10,
    `${Math.abs(scaleMid).toFixed(1)}`
  );
  const aliveCharm = chain.filter(n => Math.abs(n.charm) > 1e-9 && n.callOI > 0);
  const charmScales = aliveCharm.map(n => n.callCharm / n.callOI);
  check(
    'charm is open-interest weighted too — its leg tracks its own side’s crowd',
    aliveCharm.length > 2 && charmScales.every(v => Number.isFinite(v) && v !== 0),
    `${aliveCharm.length} strikes carry a live charm`
  );
  /* The two legs are weighted by their OWN side's open interest AND its own
     dealer direction — which is the whole reason this is an exposure rather
     than a greek, and the reason the two legs are not simply proportional
     to open interest (see the note on the ratio check below).

     They are NOT asserted to carry opposite signs, and that was the first
     version of this check. Vanna is identical for a call and a put at the
     same strike under put-call parity, and this desk's dealer is net short
     both, so the two legs sharing a sign is the correct answer rather than
     a bug. Charm is the one that genuinely differs per side, and it has its
     own per-side greek below. */
  const lopsided = chain.filter(n => n.callOI > 0 && n.putOI > 0 && n.callOI !== n.putOI);
  check('PREMISE: some strike is lopsided between the sides', lopsided.length > 0, `${lopsided.length}`);
  /*
    THE LEG IS OI x THAT SIDE'S OWN DEALER WEIGHT, AND THE WEIGHTS DIFFER.

    This said "the heavier side carries the bigger vanna leg", which is not
    something the engine guarantees. The desk models dealers as slightly
    more short calls than puts — DEALER_CALL_DIR -0.55 against
    DEALER_PUT_DIR -0.53 in simulator.ts — so a call contract carries 3.8%
    more weight than a put one, and the heavier side loses whenever the two
    open interests are closer together than that.

    It passed for a long time because a strike that evenly split is
    uncommon, and failed about one run in twenty. Caught at strike 501:
    callOI 22125 against putOI 22596 — puts heavier by 2.1%, calls weighted
    3.8% harder, so the calls carried the bigger leg and the check called a
    correct book a bug.

    What the engine DOES guarantee is that each leg is its own side's open
    interest times one per-side weight, so the ratio between the two
    per-contract legs is the same at every strike. That is both true and the
    thing the comment above is actually claiming.
  */
  const ratios = lopsided
    .filter(n => n.callVanna !== 0 && n.putVanna !== 0)
    .map(n => Math.abs(n.callVanna) / n.callOI / (Math.abs(n.putVanna) / n.putOI));
  const spread = ratios.length ? Math.max(...ratios) - Math.min(...ratios) : Infinity;
  check(
    'the two vanna legs differ only by open interest and one per-side dealer weight',
    ratios.length > 0 && spread < 1e-9,
    `weight ratio ${ratios[0]?.toFixed(4)} at all ${ratios.length} lopsided strikes, spread ${spread.toExponential(1)}`
  );
  /* The structural difference between the two, asserted where it lives.

     Vanna is ONE number per contract — there is no vannaCall and no
     vannaPut, because put-call parity makes them equal — so the two legs
     of a net vanna differ only by their side's open interest and dealer
     direction. Charm is NOT equal across the sides, so the greeks module
     returns two of them. Reading this off the OI-weighted chain instead was
     the first attempt and it proves nothing: the weighting swamps the
     per-side difference, and every strike came back same-signed whether or
     not the engine bothered to distinguish them. */
  const g = blackScholesGreeks(500, 505, 0.08, 0.2);
  check('vanna is one number for both sides — parity says so', 'vanna' in g && !('vannaCall' in g));
  check('charm is two, one per side', 'charmCall' in g && 'charmPut' in g);
  check('and the two genuinely differ', g.charmCall !== g.charmPut, `${g.charmCall.toFixed(6)} vs ${g.charmPut.toFixed(6)}`);
  check(
    'net vanna is its own two legs, exactly',
    chain.every(n => Math.abs(n.netVanna - (n.callVanna + n.putVanna)) < 1e-6)
  );
  check(
    'net charm is its own two legs — not an unweighted average of them',
    chain.every(n => Math.abs(n.netCharm - (n.callCharm + n.putCharm)) < 1e-6)
  );
  /* Dollarised, read off a strike that HAS a vanna — the busiest strike can
     be far enough from spot that its greek is 5e-8 and its exposure rounds
     to two dollars, which says nothing about the units. */
  const liveVanna = chain
    .filter(n => Math.abs(n.vanna) > 1e-9 && n.callOI + n.putOI > 0)
    .sort((a, b) => Math.abs(b.netVanna) - Math.abs(a.netVanna))[0];
  check(
    'vanna is in dollars, not per-contract units',
    !!liveVanna && Math.abs(liveVanna.netVanna) > 1000,
    liveVanna ? `${liveVanna.netVanna.toFixed(0)} at strike ${liveVanna.strike}` : 'no strike carries a live vanna'
  );
}

// ── 3. the sums ──────────────────────────────────────────────────────────
{
  for (const m of BAND_METRICS) {
    const want = p.strikes.reduce((a, s) => a + s[SPLIT[m.key]].net, 0);
    check(`${m.key}: the headline is the sum of its strikes`, Math.abs(p[NET[m.key]] - want) < 0.01, `${p[NET[m.key]].toFixed(0)} vs ${want.toFixed(0)}`);
    check(
      `${m.key}: each strike is the sum of its own two legs`,
      p.strikes.every(s => Math.abs(s[SPLIT[m.key]].net - (s[SPLIT[m.key]].call + s[SPLIT[m.key]].put)) < 0.01)
    );
  }
}

// ── 4. each metric gets its own scale ────────────────────────────────────
{
  for (const m of BAND_METRICS) {
    const scale = p.maxAbs[m.key];
    check(`${m.key}: has a bar scale`, scale > 0, `${scale.toFixed(0)}`);
    const biggest = Math.max(...p.strikes.map(s => Math.max(Math.abs(s[SPLIT[m.key]].call), Math.abs(s[SPLIT[m.key]].put), Math.abs(s[SPLIT[m.key]].net))));
    check(`${m.key}: the scale covers its own biggest leg`, scale >= biggest - 0.01, `${scale.toFixed(0)} vs ${biggest.toFixed(0)}`);
  }
  /* Scales that were shared would draw a small book flat against a big one. */
  const scales = BAND_METRICS.map(m => p.maxAbs[m.key]);
  check('the five scales are not one shared number', new Set(scales.map(s => s.toFixed(2))).size > 1, scales.map(s => s.toFixed(0)).join(', '));
}

// ── 5. the units differ ──────────────────────────────────────────────────
{
  const units = BAND_METRICS.map(m => m.unit);
  check('every metric states a unit', units.every(u => u.length > 3));
  check('and no two share one', new Set(units).size === units.length, units.join(' | '));
  check('every metric is labelled as a NET exposure', BAND_METRICS.every(m => /^Net /.test(m.label)), BAND_METRICS.map(m => m.label).join(' | '));
}

// ── 6. the ladder is gamma, and only gamma ───────────────────────────────
{
  const l = buildLadderFor(T);
  check('PREMISE: the ladder builds', l.rows.length > 0, `${l.rows.length} rows`);
  /* No fourth argument survives — an argument no caller passes is an
     argument nobody has tested. */
  check('buildLadderFor takes three arguments, not four', buildLadderFor.length <= 3, `${buildLadderFor.length}`);
  const { chain } = Simulator.chainFor(T);
  const byStrike = new Map(chain.map(n => [n.strike, n]));
  check(
    'and every row it draws is net gamma',
    l.rows.every(r => {
      const n = byStrike.get(r.strike);
      return !n || Math.abs(r.value - n.netGex) < 1e-6;
    })
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
