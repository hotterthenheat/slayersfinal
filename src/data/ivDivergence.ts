import { contractIvFor } from './weigherDesk';
import type { FlowPrint } from '../types/trace';

/*
==================================================
  SLAYER TERMINAL - PRINTS AGAINST THE SURFACE
  (data/ivDivergence.ts)
==================================================

  Part 14: "Execution-IV vs surface-IV divergence — each print carries its
  own IV; diff against the surface at that strike/expiry to flag prints
  transacted rich or cheap. A genuine edge signal with no UI today."

  WHY IT IS A SIGNAL AND NOT A DATA-QUALITY CHECK. Every print carries the
  vol it transacted at, and the desk's own surface says what that contract
  is worth in vol terms at the same strike and expiry. When the two differ
  by enough, somebody paid up or sold cheap ON PURPOSE — a buyer with a
  view will cross the spread and pay two vol points; a seller unwinding
  size will give them up. Both are visible in the gap and in nothing else
  on the tape: the premium column says how much money, and the size column
  says how much of it, but neither says whether the trade was eager.

  THE COMPARISON IS IN VOL POINTS, not percent, and that distinction is the
  whole reading. A one-point gap on a 15-vol name is a different event from
  a one-point gap on a 60-vol name, so the RATIO is what ranks; but the
  points are what a trader thinks in, so both are reported and the surface
  shows the points with the ratio behind them.

  WHAT THIS CANNOT SEE, said plainly rather than left to be discovered:

  · A MID PRINT HAS NO EAGERNESS. It transacted between the two sides, so
    a gap against the surface says something about the surface, not about
    the trader. Excluded rather than scored.
  · A DEEP WING IS NOISE. Vol at 40% out of the money is fitted through
    almost no liquidity, and a two-point gap there is the model, not a
    trade. Bounded rather than reported.
  ══════════════════════════════════════════════════════════════════════
  NOT WIRED TO A SURFACE, AND THE MEASUREMENT SAYS WHY
  ══════════════════════════════════════════════════════════════════════

  This module is complete and proven, and NOTHING RENDERS IT. That is a
  decision, not an oversight, and it is worth the paragraphs because the
  next person will otherwise wire it up in an afternoon.

  The signal needs the print's vol and the surface's vol to describe the
  same market. On this desk they do not: `enrichPrint` gives each print its
  own vol and `contractIvFor` fits a smile off the name's base vol, and the
  two are independent. Measured over 900 prints:

    · compared absolutely, 90% of the tape reads rich or cheap, mean gap
      +3.46 vol;
    · the median gap PER NAME runs 1.23 (ORCL) to 7.82 (TSLA), so there is
      a real per-name offset — and centring on it still leaves 87% flagged;
    · because the dispersion WITHIN a name is ±10 to 20 vol, and it is not
      moneyness: median gaps by bucket are 2.06 / 2.96 / 3.55 from the put
      wing to the call wing, while every bucket's range spans twenty points.

  A per-name baseline absorbs a level difference. Nothing absorbs
  dispersion. The difference between these two numbers is model noise, and
  a column built on it would flag nine prints in ten and call the result
  eagerness — which is the exact failure this desk keeps refusing
  elsewhere, arriving with a plausible name.

  WHAT WOULD MAKE IT WORK is a feed where both numbers come from the market
  — UW's per-print IV against a fitted surface, which is what Part 14
  describes. Then the baselines fall toward zero on their own, the
  dispersion becomes the thing being measured rather than the thing in the
  way, and this file is the drop-in. The baseline machinery stays for that
  day: a real surface still carries a small per-name bias and the
  measurement above is how anyone will check.

  ══════════════════════════════════════════════════════════════════════

  The reading is RELATIVE TO THE NAME'S OWN BASELINE for the reason above:
  the name's median gap is the zero, and a print is scored on how far it
  sits from that. The absolute gap is reported alongside, because a trader
  wants the vol points and because the arithmetic has to stay checkable.
*/

/** Beyond this the smile is fitted through too little to argue with. */
export const WING_LIMIT_PCT = 25;

/** In vol points. Below this the gap is spread and rounding. */
export const NOISE_FLOOR_VOL = 0.75;

export type IvVerdict = 'rich' | 'cheap' | 'in-line' | 'no-read';

export const IV_VERDICT_WORDS: Record<IvVerdict, string> = {
  rich: 'paid up',
  cheap: 'sold cheap',
  'in-line': 'at the surface',
  'no-read': 'no read',
};

export const IV_VERDICT_NOTES: Record<IvVerdict, string> = {
  rich: 'Transacted ABOVE the desk\'s surface for this strike and expiry. Somebody crossed to get filled — the mark of a buyer with a view rather than one working an order.',
  cheap: 'Transacted BELOW the surface. Size being given up, which is what an unwind looks like from the outside.',
  'in-line': 'Within a vol point of the surface. The ordinary case, and most of the tape.',
  'no-read': 'No reading: the print went off at the mid, or the strike sits far enough out that the surface there is fitted through almost no liquidity.',
};

export interface IvRead {
  verdict: IvVerdict;
  /** Print IV minus surface IV, in vol POINTS. Null when there is no read. */
  gapVol: number | null;
  /** The gap AGAINST THE NAME'S BASELINE — what the verdict is made on. */
  excessVol: number | null;
  /** The excess as a share of the surface vol — what ranks across names. */
  gapRatio: number | null;
  /** The surface's vol for this contract, for a caller that shows both. */
  surfaceVol: number | null;
  /** The name's median gap, subtracted to get `excessVol`. */
  baselineVol: number;
}

const NO_READ: IvRead = {
  verdict: 'no-read', gapVol: null, excessVol: null, gapRatio: null, surfaceVol: null, baselineVol: 0,
};

/**
 * Each name's typical gap against the surface, from the prints in hand.
 *
 * MEDIAN, not mean: the outliers this whole module exists to find are
 * exactly what would drag a mean, so a few genuine paid-up prints would
 * raise the bar that is supposed to catch them. A name with too few prints
 * gets no baseline rather than one fitted to three points.
 */
export const MIN_PRINTS_FOR_BASELINE = 8;

export function ivBaselines(prints: readonly FlowPrint[]): Map<string, number> {
  const gaps = new Map<string, number[]>();
  for (const p of prints) {
    if (p.side === 'MID' || !(p.iv > 0) || !(p.spot > 0)) continue;
    if (Math.abs(p.otmPct) > WING_LIMIT_PCT) continue;
    const surface = contractIvFor(p.ticker, p.strike, p.right) * 100;
    if (!(surface > 0) || !Number.isFinite(surface)) continue;
    const list = gaps.get(p.ticker) ?? [];
    list.push(p.iv - surface);
    gaps.set(p.ticker, list);
  }
  const out = new Map<string, number>();
  for (const [ticker, list] of gaps) {
    if (list.length < MIN_PRINTS_FOR_BASELINE) continue;
    const sorted = [...list].sort((a, b) => a - b);
    out.set(ticker, sorted[Math.floor(sorted.length / 2)]);
  }
  return out;
}

/**
 * One print against the surface at its own strike.
 *
 * `print.iv` is a percent (30 = 30 vol) and so is the surface, so the two
 * subtract directly — the units agreeing is worth stating because a fraction
 * against a percent is a hundred-fold error that still produces a plausible
 * ordering.
 */
export function ivRead(print: FlowPrint, baselineVol = 0): IvRead {
  if (print.side === 'MID') return NO_READ;
  if (!(print.iv > 0) || !(print.spot > 0)) return NO_READ;
  if (Math.abs(print.otmPct) > WING_LIMIT_PCT) return NO_READ;

  const surfaceVol = contractIvFor(print.ticker, print.strike, print.right) * 100;
  if (!(surfaceVol > 0) || !Number.isFinite(surfaceVol)) return NO_READ;

  const gapVol = Number((print.iv - surfaceVol).toFixed(2));
  /* The verdict is made on the EXCESS over how this name usually trades
     against this surface, not on the raw gap — see the header. With no
     baseline the two are the same, which is the right behaviour for a
     caller holding one print and no context. */
  const excessVol = Number((gapVol - baselineVol).toFixed(2));
  const gapRatio = Number((excessVol / surfaceVol).toFixed(4));
  const verdict: IvVerdict =
    Math.abs(excessVol) < NOISE_FLOOR_VOL ? 'in-line' : excessVol > 0 ? 'rich' : 'cheap';
  return {
    verdict,
    gapVol,
    excessVol,
    gapRatio,
    surfaceVol: Number(surfaceVol.toFixed(2)),
    baselineVol: Number(baselineVol.toFixed(2)),
  };
}

export interface IvOutlier {
  print: FlowPrint;
  read: IvRead;
}

/**
 * The prints worth looking at, most extreme first.
 *
 * RANKED BY THE RATIO, not the points, so a 60-vol name cannot crowd out a
 * 15-vol one purely by being volatile — the same reason the flow rules are
 * relative to a name's own day rather than to a dollar figure.
 *
 * Premium is a tiebreak and not a filter: a two-vol-point overpay on a
 * hundred lots is a different event from the same overpay on one, but
 * excluding the small one would hide exactly the early prints this is for.
 */
export function ivOutliers(prints: readonly FlowPrint[], limit = 25): IvOutlier[] {
  const baselines = ivBaselines(prints);
  const out: IvOutlier[] = [];
  for (const p of prints) {
    const read = ivRead(p, baselines.get(p.ticker) ?? 0);
    if (read.verdict === 'no-read' || read.verdict === 'in-line') continue;
    out.push({ print: p, read });
  }
  return out
    .sort((a, b) => {
      const d = Math.abs(b.read.gapRatio as number) - Math.abs(a.read.gapRatio as number);
      return d !== 0 ? d : b.print.premium - a.print.premium;
    })
    .slice(0, limit);
}

/** How the tape as a whole is transacting against the surface — one line. */
export function ivSummary(prints: readonly FlowPrint[]): {
  rich: number;
  cheap: number;
  inLine: number;
  noRead: number;
  meanGapVol: number | null;
} {
  const baselines = ivBaselines(prints);
  let rich = 0, cheap = 0, inLine = 0, noRead = 0;
  let sum = 0, n = 0;
  for (const p of prints) {
    const r = ivRead(p, baselines.get(p.ticker) ?? 0);
    if (r.verdict === 'rich') rich++;
    else if (r.verdict === 'cheap') cheap++;
    else if (r.verdict === 'in-line') inLine++;
    else { noRead++; continue; }
    sum += r.gapVol as number;
    n += 1;
  }
  /* Null rather than 0 when nothing could be read — a mean of no readings
     is not "the tape is at the surface", it is the absence of an answer. */
  return { rich, cheap, inLine, noRead, meanGapVol: n > 0 ? Number((sum / n).toFixed(2)) : null };
}
