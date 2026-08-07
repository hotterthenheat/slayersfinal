/*
==================================================
  SLAYER TERMINAL - INFORMED vs UNINFORMED FLOW (informedFlow.ts)  [What-Else]
  Not all flow carries information. A retail 0DTE lotto crossed at the mid and a
  swept institutional block that lifts the whole offer both print on the tape,
  but only one of them is a bet somebody made because they think they know
  something. This scores each print's information content from the exchange
  facts we already carry — the aggressor (P0.2/P3.1), sweep and block tags, size,
  whether it is opening or closing risk, odd-lot retail proxies, and whether it
  is even directional (P4.2) — and reads the tape's SMART-MONEY tilt off the
  informed slice alone.

  The score is a transparent sum of microstructure priors, not a black box:
    + a directional aggressor (someone paid the spread to get done)
    + a sweep (paid across venues for immediacy — the signature of urgency)
    + block size (institutional)
    + size percentile within the tape
    + opening risk (volume > open interest — a new position, not a close)
    − an odd lot (a retail-participation proxy)
    − structure (a spread leg or delta-hedged print takes no directional view)

  Deterministic: reads FlowPrint fields and the conditions predicates, nothing
  mutable. Scope one underlying — the smart-money TILT is directional, and
  direction is per name.
==================================================
*/

import type { FlowPrint, PrintSentiment } from '../types/flowdesk';
import { sentimentOf } from './flowtape';
import { isBlock, isOddLot, isDirectional } from '../types/conditions';

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
}

const INFORMED_AT = 64;
const UNINFORMED_AT = 38;

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
  if (isBlock(p.conditions)) {
    s += 14;
    reasons.push('block size');
  }
  const sizeAdj = (sizePctile - 0.5) * 30;
  s += sizeAdj;
  if (sizePctile >= 0.8) reasons.push('large for the tape');
  if (p.volOverOI > 1) {
    s += 12;
    reasons.push('opening risk (vol > OI)');
  } else {
    s -= 6;
  }
  if (isOddLot(p.conditions)) {
    s -= 20;
    reasons.push('odd lot — retail proxy');
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

  // Newest first for display.
  rows.sort((a, b) => b.print.id - a.print.id);

  return {
    ticker,
    prints: rows,
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
