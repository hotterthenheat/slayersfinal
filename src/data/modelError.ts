import type { GexSnapshot } from '../types/market';

/*
==================================================
  SLAYER TERMINAL - GEX MODEL ERROR (data/modelError.ts)

  How wrong is textbook GEX right now — P-23.
==================================================

  THE STRATEGIC READ. Every GEX vendor infers dealer gamma the same way:
  open interest × a sign assumption. Periscope's actualized SPX net gamma is
  VERIFIED ATTRIBUTION — no assumption — which makes it ground truth, and
  ground truth lets this desk audit the entire competitor category: a live
  "how wrong is textbook GEX right now" number that an OI-inferred vendor
  is structurally unable to replicate, because they have no reference to be
  wrong against.

  BUILT BEFORE THE FEED, BY THE OWNER'S CALL. The whole terminal runs on the
  simulator today, so the gauge runs against a SIMULATED reference — the
  machinery, the metrics and the surface are real, and the day Periscope
  connects only the series swaps. The simulated reference is deterministic
  and seeded (no wall clock, no Math.random — the sim-era contract), and
  every consumer states loudly that the reference is simulated: a gauge
  that measures error against an invented truth without saying so would be
  the exact dishonesty this desk exists to avoid.

  THE METRICS, and the traps each one dodges:

    ERROR      inferred − actualized, signed. POSITIVE = textbook OVERSTATES
               dealer gamma. Joined on EXACT shared timestamps only — a
               reading interpolated between two moments of ground truth is
               not ground truth (the house no-interpolation rule).

    ACCURACY   1 − MAE / mean|actualized|. MAE, not mean error: a model
               that swings +40% and −40% is not "80% accurate on average",
               it is wrong twice — signed errors cancelling is the classic
               way an error gauge flatters the model it audits.

    BIAS       the DIRECTION the model habitually misses, with a dead zone:
               a mean error under 5% of the book's scale is CENTERED, not a
               verdict. A bias read that flips on noise teaches a reader to
               ignore it.
*/

export interface SeriesPoint {
  time: number;
  value: number;
}

export interface ErrorPoint {
  time: number;
  inferred: number;
  actualized: number;
  /** inferred − actualized. Positive = textbook overstates. */
  error: number;
  /** error / |actualized| — null where the truth is zero, never Infinity. */
  errorPct: number | null;
}

export interface ModelErrorRead {
  points: ErrorPoint[];
  now: ErrorPoint | null;
  /** 1 − MAE/mean|actualized|, clamped to [0, 1]. Null with no overlap. */
  accuracy: number | null;
  bias: 'OVERSTATES' | 'UNDERSTATES' | 'CENTERED';
  /** The moment the model was most wrong. */
  worst: ErrorPoint | null;
}

/** Mean error under this share of the book's scale is CENTERED. */
export const BIAS_DEADZONE = 0.05;

/**
 * The gauge. Joins on EXACT shared timestamps — no interpolation.
 */
export function buildModelError(inferred: readonly SeriesPoint[], actualized: readonly SeriesPoint[]): ModelErrorRead {
  const truthAt = new Map(actualized.map(p => [p.time, p.value]));
  const points: ErrorPoint[] = [];
  for (const p of inferred) {
    const truth = truthAt.get(p.time);
    if (truth === undefined) continue;
    const error = p.value - truth;
    points.push({
      time: p.time,
      inferred: p.value,
      actualized: truth,
      error,
      errorPct: truth !== 0 ? error / Math.abs(truth) : null,
    });
  }

  if (points.length === 0) return { points, now: null, accuracy: null, bias: 'CENTERED', worst: null };

  let mae = 0;
  let meanErr = 0;
  let scale = 0;
  let worst = points[0];
  for (const p of points) {
    mae += Math.abs(p.error);
    meanErr += p.error;
    scale += Math.abs(p.actualized);
    if (Math.abs(p.error) > Math.abs(worst.error)) worst = p;
  }
  mae /= points.length;
  meanErr /= points.length;
  scale /= points.length;

  const accuracy = scale > 0 ? Math.min(1, Math.max(0, 1 - mae / scale)) : null;
  const bias: ModelErrorRead['bias'] =
    scale > 0 && Math.abs(meanErr) > BIAS_DEADZONE * scale ? (meanErr > 0 ? 'OVERSTATES' : 'UNDERSTATES') : 'CENTERED';

  return { points, now: points[points.length - 1], accuracy, bias, worst };
}

/** The headline, in the desk's voice. */
export function modelErrorWords(read: ModelErrorRead): string {
  if (read.now === null) return 'No shared moments between the inferred book and the reference — nothing to audit yet';
  const pct = read.now.errorPct;
  const nowWords =
    pct === null
      ? 'the reference reads zero at this moment, so a percent means nothing'
      : Math.abs(pct) < 0.02
        ? 'textbook GEX matches the reference right now'
        : `textbook GEX is ${pct > 0 ? 'overstating' : 'understating'} dealer gamma by ${Math.round(Math.abs(pct) * 100)}% right now`;
  const acc = read.accuracy !== null ? ` — ${Math.round(read.accuracy * 100)}% accurate over the session` : '';
  return nowWords.charAt(0).toUpperCase() + nowWords.slice(1) + acc + '.';
}

/** The inferred series: what this desk's own OI × sign computation says. */
export function inferredSeries(snaps: readonly GexSnapshot[]): SeriesPoint[] {
  return snaps.map(s => ({ time: s.time, value: s.levels.reduce((a, l) => a + l.value, 0) }));
}

/*
  ── THE SIMULATED REFERENCE — DIES THE DAY PERISCOPE CONNECTS ────────────

  A deterministic, seeded transform of the inferred series: a slow drift in
  attribution error through the session plus per-snapshot texture, so the
  gauge exercises every state it has (over, under, centered, worst-moment)
  without a wall clock or Math.random. It exists so the machinery is real
  before the feed is; it is NOT a model of Periscope, and every surface that
  draws it says "simulated" in words.
*/
function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export function simulatedReference(inferred: readonly SeriesPoint[], ticker: string): SeriesPoint[] {
  /* Phase AND amplitude are seeded per ticker. Phase alone proved too weak
     a distinction — two tickers' phases can hash near each other, and then
     every book rides one canned error story with different noise on top.
     The proof pins the smoothed CURVES apart, so the drift must genuinely
     be this ticker's own. */
  const phase = hash01(`${ticker}-periscope-phase`) * Math.PI * 2;
  const amp = 0.08 + 0.12 * hash01(`${ticker}-periscope-amp`);
  return inferred.map((p, i) => {
    const drift = amp * Math.sin(i / 11 + phase);
    const texture = (hash01(`${ticker}-periscope-${i}`) - 0.5) * 0.08;
    return { time: p.time, value: p.value * (1 - drift - texture) };
  });
}
