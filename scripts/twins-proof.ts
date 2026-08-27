/*
  Acceptance test for T-17's measured twin lens. Runs the ACTUAL module
  against staged pair series where the answers are computable by hand.

  Proves:
  1. The measurement is a MEDIAN over the pairs — a single bad print in
     either leg moves the lens by nothing, which a mean cannot claim
  2. Below MIN_TWIN_SAMPLES the measurement refuses — too little tape is
     not a reading — and the inferred fallback wears sampled: 0 openly
  3. twinPrice converts off the MEASURE (index = etf × measured ratio) and
     futures round to their quarter-point tick
  4. The sim-era pair series is deterministic off bar times, reads only the
     window it claims, and stays coherent with its seeds — ratio within its
     dividend-drift band, basis within its carry band
*/
import {
  inferredMeasure, measureTwins, synthTwinPairs, twinFamilyFor, twinPrice,
  MIN_TWIN_SAMPLES, TWIN_WINDOW, type TwinPair,
} from '../src/data/indexTwins';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const near = (a: number | null | undefined, b: number, eps = 1e-9) => a != null && Math.abs(a - b) < eps;

const T0 = 1_760_000_000;
const pair = (i: number, etf: number, ratio: number, basis: number): TwinPair => ({
  time: T0 + i * 60, etf, index: etf * ratio, futures: etf * ratio + basis,
});

// ── 1. medians, and the bad print ─────────────────────────────────────────
{
  const pairs = Array.from({ length: 15 }, (_, i) => pair(i, 500 + i * 0.1, 10.02, 11.5));
  const m = measureTwins(pairs);
  check('ratio is measured off the series', near(m?.ratio, 10.02), String(m?.ratio));
  check('basis is measured off the series', near(m?.basis, 11.5), String(m?.basis));
  check('and says how much tape it stands on', m?.sampled === 15);

  /* One insane index print among fifteen: the median does not move. */
  const spiked = [...pairs.slice(0, 7), { ...pairs[7], index: 99999, futures: 99999 + 11.5 }, ...pairs.slice(8)];
  const ms = measureTwins(spiked);
  check('a single bad print moves the lens by NOTHING', near(ms?.ratio, 10.02) && near(ms?.basis, 11.5), `ratio ${ms?.ratio?.toFixed(4)}`);
}

// ── 2. the floor, and the inferred fallback ───────────────────────────────
{
  const few = Array.from({ length: MIN_TWIN_SAMPLES - 1 }, (_, i) => pair(i, 500, 10, 12));
  check(`${MIN_TWIN_SAMPLES - 1} pairs is not a reading`, measureTwins(few) === null);
  const enough = [...few, pair(99, 500, 10, 12)];
  check('exactly at the floor it measures', measureTwins(enough) !== null);
  const fam = twinFamilyFor('SPY')!;
  const inf = inferredMeasure(fam);
  check('the fallback is the seeds, wearing sampled: 0', inf.ratio === fam.ratio && inf.basis === fam.baseBasis && inf.sampled === 0);
}

// ── 3. conversion off the measure ─────────────────────────────────────────
{
  const fam = twinFamilyFor('SPY')!;
  const m = { ratio: 10, basis: 11.6, sampled: 60 };
  check('the ETF lens is the identity', twinPrice(fam, 'etf', 500, m) === 500);
  check('the index lens is etf × measured ratio', twinPrice(fam, 'index', 500, m) === 5000);
  check('futures land on the quarter tick', twinPrice(fam, 'futures', 500, m) === 5011.5, String(twinPrice(fam, 'futures', 500, m)));
}

// ── 4. the sim-era series ─────────────────────────────────────────────────
{
  const fam = twinFamilyFor('SPY')!;
  const bars = Array.from({ length: 100 }, (_, i) => ({ time: T0 + i * 60, close: 500 + Math.sin(i / 7) }));
  const a = synthTwinPairs(fam, bars);
  const b = synthTwinPairs(fam, bars);
  check(`the series reads its window — ${TWIN_WINDOW} of 100 bars`, a.length === TWIN_WINDOW, String(a.length));
  check('and is deterministic off bar times', JSON.stringify(a) === JSON.stringify(b));
  const ratioOk = a.every(p => Math.abs(p.index / p.etf / fam.ratio - 1) < 0.004);
  check('the drifting ratio stays inside its dividend band (±0.4%)', ratioOk);
  const basisOk = a.every(p => {
    const bps = p.futures - p.index;
    return bps > fam.baseBasis * 0.8 && bps < fam.baseBasis * 1.2;
  });
  check('the basis stays inside its carry band', basisOk);
  /* And the real measurement over the synthesised series lands near the
     seeds — the coherence the lens depends on. */
  const m = measureTwins(a);
  check('measured over the synth series, the lens lands near its seeds', m !== null && Math.abs(m.ratio / fam.ratio - 1) < 0.004 && Math.abs(m.basis - fam.baseBasis) < fam.baseBasis * 0.2, `ratio ${m?.ratio.toFixed(3)}, basis ${m?.basis.toFixed(2)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
