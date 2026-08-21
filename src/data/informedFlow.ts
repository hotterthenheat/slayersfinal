/*
==================================================
  SLAYER TERMINAL - INFORMED vs UNINFORMED FLOW (informedFlow.ts)  [What-Else]
  Not all flow carries information. A retail 0DTE lotto crossed at the mid and a
  swept institutional block that lifts the whole offer both print on the tape,
  but only one of them is a bet somebody made because they think they know
  something. This scores each print's information content from the exchange
  facts we already carry — the aggressor (P0.2/P3.1), sweep and block tags, size,
  odd-lot retail proxies, and whether it
  is even directional (P4.2) — and reads the tape's SMART-MONEY tilt off the
  informed slice alone.

  The score is a transparent sum of microstructure priors, not a black box:
    + a directional aggressor (someone paid the spread to get done)
    + a sweep (paid across venues for immediacy — the signature of urgency)
    + block premium (institutional — the $150k exchange block threshold)
    + size percentile within the tape
    − a retail-size lot (a retail-participation proxy)
    − structure (a spread leg or delta-hedged print takes no directional view)

  Deterministic: reads FlowPrint fields and the conditions predicates, nothing
  mutable. Scope one underlying — the smart-money TILT is directional, and
  direction is per name.
==================================================
*/

import type { FlowPrint, PrintSentiment } from '../types/flowdesk';
import { sentimentOf } from './flowtape';
import { isDirectional } from '../types/conditions';

export type FlowClass = 'INFORMED' | 'MIXED' | 'UNINFORMED';

export interface ClassifiedPrint {
  print: FlowPrint;
  /** 0-100 information score. */
  score: number;
  klass: FlowClass;
  sentiment: PrintSentiment;
  /** Short factor tags for the read-out, most important first. */
  reasons: string[];
}

export interface InformedFlowView {
  ticker: string;
  /** Newest first for the tape. */
  prints: ClassifiedPrint[];
  informedPremium: number;
  mixedPremium: number;
  uninformedPremium: number;
  /** informedPremium / total, 0-1. */
  informedShare: number;
  informedCount: number;
  uninformedCount: number;
  /** Directional read of the INFORMED slice only — the smart-money tilt. */
  smartBull: number;
  smartBear: number;
  /** smartBull − smartBear. */
  smartNet: number;
  smartBullish: boolean;
  /** The highest-information single print. */
  topInformed: ClassifiedPrint | null;
  /** The two class cut-points, so a chart draws exactly what the scorer used. */
  thresholds: { informed: number; uninformed: number };
  /** Score distribution in fixed buckets — the classification, made visible. */
  scoreBuckets: ScoreBucket[];
  /** Running informed net premium through the window, OLDEST first. */
  tilt: TiltPoint[];
}

export interface ScoreBucket {
  /** Bucket floor, inclusive. */
  lo: number;
  /** Bucket ceiling, exclusive (except the top bucket, which includes 100). */
  hi: number;
  count: number;
  premium: number;
  /** Which class this bucket falls in — bucket edges align with the cut-points. */
  klass: FlowClass;
}

export interface TiltPoint {
  /** Position in the window, oldest first. */
  i: number;
  time: string;
  /** Running informed bull premium − informed bear premium, $. */
  net: number;
}

/**
 * Bucket width for the score histogram. One point per bucket, deliberately: the
 * score is an integer 0-100 and both cut-points are integers, so a wider bucket
 * would straddle a class boundary (a 2-wide bucket at 38 holds one UNINFORMED
 * print and one MIXED one) and no single colour for that bar would be true.
 */
const BUCKET = 1;

const INFORMED_AT = 64;
const UNINFORMED_AT = 38;

/*
  Block and retail size are OPTIONS-NATIVE tests, not condition codes.

  This scorer used to gate its block bonus on `isBlock` (OPRA 75 / 14 / 29) and
  its retail penalty on `isOddLot` (OPRA 115). Both of those are EQUITY-feed
  conditions — types/conditions.ts labels them so — and an options print never
  carries either: options have no odd lot (the round lot IS one contract), and
  an options block is defined by size and premium rather than by a tag. So both
  branches were unreachable on any print this desk can see, and +14 / −20 never
  once entered a score. The two facts are real and worth scoring, so the tests
  move to the definitions that actually apply to an option rather than the
  branches being deleted.
*/

/** The exchange block threshold for options — $150k of premium on one print. */
const BLOCK_PREMIUM = 150_000;
/** Retail-scale lot. Options round-lot is 1, so "small" is the retail proxy. */
const RETAIL_LOT = 10;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Score one print's information content against the tape it sits in. `sizePctile`
 * is the print's premium rank within the (single-name) tape, 0-1 — passed in
 * because it is a property of the whole book, not the print.
 */
export function scorePrint(p: FlowPrint, sizePctile: number): ClassifiedPrint {
  const reasons: string[] = [];
  let s = 50;

  if (p.side === 'MID') {
    s -= 25;
    reasons.push('mid — no aggressor');
  } else {
    s += 12;
    reasons.push(p.side === 'ASK' ? 'lifted the offer' : 'hit the bid');
  }
  if (p.sweep) {
    s += 18;
    reasons.push('swept for immediacy');
  }
  if (p.premium >= BLOCK_PREMIUM) {
    s += 14;
    reasons.push('block premium');
  }
  const sizeAdj = (sizePctile - 0.5) * 30;
  s += sizeAdj;
  if (sizePctile >= 0.8) reasons.push('large for the tape');
  /*
    NO opening/closing term.

    This read `if (p.volOverOI > 1) { s += 12; reasons.push('opening risk (vol >
    OI)') }` — twelve points, and a tag on the print, for "a new position, not a
    close". OPRA carries no open/close flag. Only CBOE's Open-Close Volume
    Summary and ISE's Open/Close Trade Profile do, and neither is on any tier
    here.

    It is not a matter of a weak proxy, either. Open and close are properties of
    a POSITION, and the two counterparties to one print can be on opposite sides
    of that: the same execution opens for the buyer and closes for the seller.
    There is no fact of the matter encoded in the print for a heuristic to
    approximate. End-of-day OI change recovers the NET only, never signed opening
    volume.

    `volOverOI` itself stays — volume over open interest is arithmetic on two
    observed quantities and the tape still shows it. What is gone is the claim
    about what it means.
  */
  if (p.size <= RETAIL_LOT) {
    s -= 20;
    reasons.push('retail-size lot');
  }
  if (!isDirectional(p.conditions)) {
    s -= 15;
    reasons.push('structure — no directional view');
  }

  const score = Math.round(clamp(s, 0, 100));
  const klass: FlowClass = score >= INFORMED_AT ? 'INFORMED' : score <= UNINFORMED_AT ? 'UNINFORMED' : 'MIXED';
  return { print: p, score, klass, sentiment: sentimentOf(p), reasons };
}

export function buildInformedFlow(prints: FlowPrint[], ticker: string): InformedFlowView {
  const scoped = prints.filter(p => p.ticker === ticker);
  // Size percentile from the tape's own premium distribution.
  const sorted = [...scoped].map(p => p.premium).sort((a, b) => a - b);
  const pctileOf = (prem: number): number => {
    if (sorted.length <= 1) return 0.5;
    // Share of prints at or below this premium.
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] <= prem) lo = mid + 1;
      else hi = mid;
    }
    return lo / sorted.length;
  };

  const rows = scoped.map(p => scorePrint(p, pctileOf(p.premium)));

  let informedPremium = 0;
  let mixedPremium = 0;
  let uninformedPremium = 0;
  let smartBull = 0;
  let smartBear = 0;
  let informedCount = 0;
  let uninformedCount = 0;
  let topInformed: ClassifiedPrint | null = null;

  for (const r of rows) {
    if (r.klass === 'INFORMED') {
      informedPremium += r.print.premium;
      informedCount++;
      if (r.sentiment === 'BULLISH') smartBull += r.print.premium;
      else if (r.sentiment === 'BEARISH') smartBear += r.print.premium;
      if (!topInformed || r.score > topInformed.score || (r.score === topInformed.score && r.print.premium > topInformed.print.premium)) {
        topInformed = r;
      }
    } else if (r.klass === 'UNINFORMED') {
      uninformedPremium += r.print.premium;
      uninformedCount++;
    } else {
      mixedPremium += r.print.premium;
    }
  }

  const total = informedPremium + mixedPremium + uninformedPremium || 1;
  const smartNet = smartBull - smartBear;

  // Score distribution. Each bucket takes its class from the SAME expression the
  // scorer uses, so a bar can never be coloured differently from the prints
  // inside it.
  const buckets: ScoreBucket[] = [];
  for (let lo = 0; lo <= 100; lo += BUCKET) {
    buckets.push({
      lo,
      hi: lo + BUCKET,
      count: 0,
      premium: 0,
      klass: lo >= INFORMED_AT ? 'INFORMED' : lo <= UNINFORMED_AT ? 'UNINFORMED' : 'MIXED',
    });
  }
  for (const r of rows) {
    const b = buckets[Math.min(buckets.length - 1, Math.floor(r.score / BUCKET))];
    b.count++;
    b.premium += r.print.premium;
  }

  // Running smart-money tilt. The walk MUST be chronological, and `rows` is not:
  // buildSessionTape returns newest-first, so an in-place walk would accumulate
  // the session backwards and hand back a mirror image of the real path. Sort a
  // copy ascending by id — ids are monotonic in time by construction, so that is
  // exactly chronological without parsing the clock string.
  //
  // Only INFORMED prints move the tilt; it is a read of the informed slice, by
  // definition, and the same premium that feeds smartBull / smartBear above.
  let runBull = 0;
  let runBear = 0;
  const tilt: TiltPoint[] = [...rows]
    .sort((a, b) => a.print.id - b.print.id)
    .map((r, i) => {
      if (r.klass === 'INFORMED') {
        if (r.sentiment === 'BULLISH') runBull += r.print.premium;
        else if (r.sentiment === 'BEARISH') runBear += r.print.premium;
      }
      return { i, time: r.print.time, net: runBull - runBear };
    });

  // Newest first for display.
  rows.sort((a, b) => b.print.id - a.print.id);

  return {
    ticker,
    prints: rows,
    thresholds: { informed: INFORMED_AT, uninformed: UNINFORMED_AT },
    scoreBuckets: buckets,
    tilt,
    informedPremium,
    mixedPremium,
    uninformedPremium,
    informedShare: informedPremium / total,
    informedCount,
    uninformedCount,
    smartBull,
    smartBear,
    smartNet,
    smartBullish: smartNet >= 0,
    topInformed,
  };
}
