/*
==================================================
  SLAYER TERMINAL - THE EXPOSURE LIBRARY (data/exposureLibrary.ts)
  One registry for every exposure the terminal draws.
==================================================

  ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────

  Pinpoint had a page per Greek. Gamma lived on Levels, vanna and charm on
  Drift, the higher-order lenses inside a panel on Drift, vega inside
  whatever happened to need it. Five pages meant five vocabularies: the same
  quantity was "VEX" in one place and "vega exposure" in another, the unit
  was stated in one and implied in two, and nothing said which numbers the
  desk OBSERVES and which it MODELS.

  So the exposure is a value now, not a page. This registry is the single
  place that says, for every metric the terminal can draw:

    · what it is called, once, everywhere
    · the formula, in the form a reader can check
    · the unit they should hold in their head
    · whether it is observed, calculated or inferred
    · and whether this desk can honestly produce it at all

  A page picks a metric from here and asks for its value. It does not carry
  its own formula, its own label or its own opinion about units.

  ── THE VEX COLLISION, SETTLED ────────────────────────────────────────────

  "VEX" is used in this industry for BOTH vega exposure and vanna exposure,
  and the two are different numbers with different units. This terminal has
  always meant VEGA: the simulator builds it as `OI × 100 × greeks.vega ×
  direction`, and Levels, Drift and Compare have drawn it that way since
  they were written.

  It keeps that meaning, and vanna gets its own name rather than sharing
  one. The alternative — redefining VEX as vanna to match one convention —
  would silently change what every existing number on three desks means,
  which is the exact failure this registry is here to prevent. The formula
  and unit ride with the metric everywhere it is drawn, so a reader never
  has to know which convention the author had in mind.

  ── WHAT THIS DESK CANNOT DO ──────────────────────────────────────────────

  Theta exposure, rho and ultima are declared here and marked unavailable,
  with the reason. That is deliberate: a metric a reader can see is missing,
  and can see WHY, is worth more than a metric quietly absent from a menu —
  and far more than one fabricated because a chart wanted a number.
*/

import { LENS_META, type GreekLens } from './greekSurfaces';
import type { GreekSplit, StrikeExposure } from '../types/gex';

/*
  WHERE A NUMBER COMES FROM — the four classes, and the reason there are
  four rather than a boolean.

  A reader trusts an observed trade differently from a modelled dealer
  position, and both differently from a ranking that is an opinion with a
  formula. Collapsing those into "data" is how a terminal ends up asserting
  things it cannot know.
*/
export type TruthClass = 'observed' | 'calculated' | 'inferred';

export const TRUTH_WORDS: Record<TruthClass, { label: string; note: string }> = {
  observed: {
    label: 'Observed',
    note: 'Read from the feed as it arrived — a trade, a quote, a size, an open-interest figure. Not modelled.',
  },
  calculated: {
    label: 'Calculated',
    note: 'Computed by this desk from observed inputs through a stated formula. Reproducible: same inputs, same number.',
  },
  inferred: {
    label: 'Inferred',
    note: 'A model estimate about something nobody can observe directly — dealer positioning, the side that initiated a trade, what a level will do. Defensible, not factual.',
  },
};

/** Every exposure the terminal has a name for, available or not. */
export type ExposureMetric =
  | 'gex'
  | 'dex'
  | 'vex'
  | 'vanna'
  | 'charm'
  | 'tex'
  | 'rho'
  | GreekLens;

export interface MetricMeta {
  key: ExposureMetric;
  /** The rail's label. Short enough for a dense control. */
  label: string;
  /** Said in full, once, where there is room. */
  name: string;
  /** The unit a reader should hold in their head. */
  unit: string;
  /** The formula, in the form a reader can check against their own book. */
  formula: string;
  truth: TruthClass;
  /** What the metric answers, in one line. */
  question: string;
  /**
   * Present on a metric this desk cannot honestly produce, and it is the
   * REASON rather than a flag — an empty menu slot teaches nothing.
   */
  unavailable?: string;
}

/* The order is the order the rail draws them: the three first-order
   exposures a reader reaches for constantly, then the second order, then
   the lenses that only matter once you are asking a narrower question. */
export const EXPOSURE_METRICS: MetricMeta[] = [
  {
    key: 'gex',
    label: 'GEX',
    name: 'Gamma exposure',
    unit: 'dollars per 1% move',
    formula: 'Σ gamma × OI × 100 × spot² × 0.01 × dealer direction',
    truth: 'inferred',
    question: 'How hard the book pushes price back toward a strike, or away from it.',
  },
  {
    key: 'dex',
    label: 'DEX',
    name: 'Delta exposure',
    unit: 'dollars of underlying',
    formula: 'Σ delta × OI × 100 × spot × dealer direction',
    truth: 'inferred',
    question: 'Which way the book is leaning, in shares of the underlying.',
  },
  {
    key: 'vex',
    label: 'VEX',
    name: 'Vega exposure',
    unit: 'dollars per vol point',
    formula: 'Σ vega × OI × 100 × dealer direction',
    truth: 'inferred',
    question: 'What one point of implied volatility is worth to the book.',
  },
  {
    key: 'vanna',
    label: 'VANNA',
    name: 'Vanna exposure',
    unit: 'delta dollars per vol point',
    formula: 'Σ vanna × OI × 100 × spot × 0.01 × dealer direction',
    truth: 'inferred',
    question: 'How much hedging a move in volatility alone forces, with price standing still.',
  },
  {
    key: 'charm',
    label: 'CHARM',
    name: 'Charm exposure',
    unit: 'delta dollars per day',
    formula: 'Σ charm × OI × 100 × spot × 0.01 × dealer direction',
    truth: 'inferred',
    question: 'How much hedging the passage of time alone forces — the drift that has nothing to do with price.',
  },
  ...(Object.values(LENS_META).map(l => ({
    key: l.key,
    label: l.label.toUpperCase(),
    name: l.label,
    unit: l.unit,
    /* The lens engine states its own formula per lens; what this registry
       adds is that they are all one step further from the feed than the
       five above, and are drawn only where their inputs are stable. */
    formula: `Pinpoint greek-surface engine — ${l.label.toLowerCase()} from the same chain, per strike`,
    truth: 'calculated' as TruthClass,
    question: l.question,
  })) as MetricMeta[]),
  {
    key: 'tex',
    label: 'TEX',
    name: 'Theta exposure',
    unit: 'dollars per day',
    formula: 'Σ theta × OI × 100 × dealer direction',
    truth: 'inferred',
    question: 'What the book earns or pays for one more day passing.',
    unavailable:
      'The chain this desk reads carries gamma, delta, vega, vanna and charm per strike; theta is priced per contract in the Weigher and is not aggregated to the strike here. Showing a strike-level theta exposure would mean inventing the aggregation.',
  },
  {
    key: 'rho',
    label: 'RHO',
    name: 'Rate exposure',
    unit: 'dollars per rate point',
    formula: 'Σ rho × OI × 100 × dealer direction',
    truth: 'inferred',
    question: 'What a move in rates is worth to the book.',
    unavailable:
      'Rho is not on the strike record, and at the tenors this desk draws — most of the book inside 30 days — it is small enough that a modelled figure would carry more error than signal.',
  },
];

export const METRIC_BY_KEY: Record<string, MetricMeta> = Object.fromEntries(
  EXPOSURE_METRICS.map(m => [m.key, m])
);

/** The metrics a page can actually draw today. */
export const AVAILABLE_METRICS = EXPOSURE_METRICS.filter(m => !m.unavailable);
/** Declared, named, and honestly absent — the menu shows these greyed. */
export const WITHHELD_METRICS = EXPOSURE_METRICS.filter(m => m.unavailable);

/** The five the strike profile carries directly, in registry order. */
export const PROFILE_METRICS = ['gex', 'dex', 'vex', 'vanna', 'charm'] as const;
export type ProfileMetric = (typeof PROFILE_METRICS)[number];
export const isProfileMetric = (k: string): k is ProfileMetric =>
  (PROFILE_METRICS as readonly string[]).includes(k);

/**
 * One strike's value for one metric.
 *
 * `side` is the reading, not a filter: the net is what the book does, and
 * the legs are how it got there. A page that only ever draws the net hides
 * the case where a big call shelf and a big put shelf cancel to nothing.
 */
export type ExposureSide = 'net' | 'call' | 'put' | 'abs';

export function valueAt(row: StrikeExposure, metric: ProfileMetric, side: ExposureSide): number {
  const split: GreekSplit = row[metric];
  if (side === 'abs') return Math.abs(split.net);
  return split[side];
}

export const SIDE_WORDS: Record<ExposureSide, string> = {
  net: 'Net',
  call: 'Calls',
  put: 'Puts',
  abs: 'Absolute',
};
