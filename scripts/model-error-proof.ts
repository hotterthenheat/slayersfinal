/*
  Acceptance test for P-23's model error gauge.

  An error gauge has one job — to be harder to fool than the model it
  audits — and the classic ways to fool one are all staged here: signed
  errors cancelling into a flattering average, a zero reference dividing
  into Infinity, interpolation inventing ground truth between readings, and
  a bias verdict that flips on noise.

  Proves:
  1. A perfect model reads zero error, 100% accuracy, CENTERED — the
     boundary a reader checks first
  2. A constant 20% overstatement reads exactly that, at every point and in
     the words
  3. ACCURACY USES MAE: a model swinging +40%/−40% is NOT "perfectly
     accurate on average" — signed cancellation is the flattery this metric
     exists to refuse (bias is CENTERED there, correctly: it has no
     direction, and that is a different fact from being right)
  4. The join is EXACT shared timestamps — a moment present in only one
     series is dropped, never interpolated
  5. A zero reference yields errorPct null, never Infinity
  6. The bias dead zone: a drift under 5% of the book's scale is CENTERED,
     one beyond it is a verdict, and the direction is right both ways
  7. The worst moment is the largest |error|, and the simulated reference
     is deterministic — same seed, same series — because a gauge that
     changes its past on reload is a mood, not a measurement
*/
import { buildModelError, inferredSeries, modelErrorWords, simulatedReference, BIAS_DEADZONE } from '../src/data/modelError';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const near = (a: number | null, b: number, eps = 1e-9) => a !== null && Math.abs(a - b) < eps;

const T0 = 1_760_000_000;
const series = (vals: number[], t0 = T0) => vals.map((value, i) => ({ time: t0 + i * 60, value }));

// ── 1. the perfect model ──────────────────────────────────────────────────
{
  const s = series([100, -50, 80, 120]);
  const read = buildModelError(s, s);
  check('a perfect model reads zero error everywhere', read.points.every(p => p.error === 0));
  check('100% accuracy', near(read.accuracy, 1));
  check('and CENTERED', read.bias === 'CENTERED');
  check('the words say it matches', /matches the reference right now/.test(modelErrorWords(read)), modelErrorWords(read));
}

// ── 2. a constant overstatement ───────────────────────────────────────────
{
  const truth = series([100, 200, -150, 300]);
  const inferred = truth.map(p => ({ ...p, value: p.value * 1.2 }));
  const read = buildModelError(inferred, truth);
  check('a constant 20% overstatement reads 20% at every point', read.points.every(p => near(p.errorPct, p.actualized > 0 ? 0.2 : -0.2, 1e-9) || near(Math.abs(p.errorPct ?? 0), 0.2)), JSON.stringify(read.points.map(p => p.errorPct)));
  check('accuracy is 80%', near(read.accuracy, 0.8), String(read.accuracy));
  check('bias reads OVERSTATES', read.bias === 'OVERSTATES');
  check('and the words carry the direction and the number', /overstating dealer gamma by 20% right now — 80% accurate/.test(modelErrorWords(read)), modelErrorWords(read));
}

// ── 3. THE CANCELLATION TRAP ──────────────────────────────────────────────
{
  const truth = series([100, 100, 100, 100]);
  const inferred = series([140, 60, 140, 60]); // +40%, −40%, mean error 0
  const read = buildModelError(inferred, truth);
  check('swinging ±40% is NOT accurate — MAE refuses the cancellation', near(read.accuracy, 0.6), String(read.accuracy));
  check('— though its bias is rightly CENTERED: no direction is a different fact from no error', read.bias === 'CENTERED');
}

// ── 4. the exact join ─────────────────────────────────────────────────────
{
  const inferred = series([100, 110, 120]);
  const truth = [
    { time: T0, value: 100 },
    { time: T0 + 90, value: 999 }, // between two inferred moments
    { time: T0 + 120, value: 120 },
  ];
  const read = buildModelError(inferred, truth);
  check('only exact shared timestamps join', read.points.length === 2, String(read.points.length));
  check('the moment present in one series alone is DROPPED, never interpolated', !read.points.some(p => p.actualized === 999));
  check('disjoint series audit nothing, and say so', buildModelError(series([1, 2]), series([1, 2], T0 + 7)).now === null && /nothing to audit yet/.test(modelErrorWords(buildModelError([], []))));
}

// ── 5. the zero reference ─────────────────────────────────────────────────
{
  const read = buildModelError(series([50, 100]), series([0, 100]));
  check('a zero reference yields errorPct null, never Infinity', read.points[0].errorPct === null && Number.isFinite(read.points[0].error));
  const allZero = buildModelError(series([50, 60]), series([0, 0]));
  check('an all-zero reference cannot claim an accuracy', allZero.accuracy === null);
  check('and the words refuse the percent at a zero moment', /reads zero at this moment/.test(modelErrorWords(allZero)));
}

// ── 6. the bias dead zone ─────────────────────────────────────────────────
{
  const truth = series([100, 100, 100, 100]);
  const inside = truth.map(p => ({ ...p, value: p.value * (1 + BIAS_DEADZONE * 0.8) }));
  check('a drift inside the dead zone is CENTERED, not a verdict', buildModelError(inside, truth).bias === 'CENTERED');
  const over = truth.map(p => ({ ...p, value: p.value * (1 + BIAS_DEADZONE * 2) }));
  check('beyond it, OVERSTATES', buildModelError(over, truth).bias === 'OVERSTATES');
  const under = truth.map(p => ({ ...p, value: p.value * (1 - BIAS_DEADZONE * 2) }));
  check('and the mirror reads UNDERSTATES', buildModelError(under, truth).bias === 'UNDERSTATES');
}

// ── 7. worst moment, and determinism ──────────────────────────────────────
{
  const truth = series([100, 100, 100]);
  const inferred = series([105, 160, 95]);
  const read = buildModelError(inferred, truth);
  check('the worst moment is the largest |error|', read.worst?.inferred === 160, String(read.worst?.inferred));

  const snaps = Array.from({ length: 30 }, (_, i) => ({ time: T0 + i * 60, levels: [{ strike: 500, value: 1e8 + i * 1e6 }] }));
  const inf = inferredSeries(snaps);
  check('the inferred series is the book summed per snapshot', inf[0].value === 1e8 && inf.length === 30);
  const a = simulatedReference(inf, 'SPY');
  const b = simulatedReference(inf, 'SPY');
  check('the simulated reference is deterministic — same seed, same series', a.every((p, i) => p.value === b[i].value && p.time === b[i].time));
  check('— and it genuinely differs from the inferred, so the gauge has something to show', a.some((p, i) => p.value !== inf[i].value));
  check('a different ticker walks a different path', simulatedReference(inf, 'QQQ').some((p, i) => p.value !== a[i].value));
  /*
    — AND THE DRIFT ITSELF DIFFERS, not just the texture. A mutation that
    zeroed the per-ticker phase survived the check above, because the small
    per-snapshot texture also carries the ticker: every ticker still
    "differed" while all of them rode one identical drift. Averaging a
    window washes the ±4% texture toward zero and leaves the drift, so this
    only passes when the phase is real.
  */
  const flat = Array.from({ length: 66 }, (_, i) => ({ time: T0 + i * 60, value: 1e8 }));
  const smooth = (t: string) => {
    const r = simulatedReference(flat, t).map(p => p.value);
    /* 11-point sliding means: texture (±4% i.i.d.) washes toward zero,
       the sinusoidal drift survives. */
    return Array.from({ length: r.length - 11 }, (_, i) => r.slice(i, i + 11).reduce((x, v) => x + v, 0) / 11);
  };
  const sa = smooth('SPY');
  const sq = smooth('QQQ');
  const gap = Math.max(...sa.map((v, i) => Math.abs(v - sq[i]))) / 1e8;
  check('— the DRIFT differs per ticker, beyond what texture can explain', gap > 0.05, `max window-mean gap ${(gap * 100).toFixed(2)}%`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
