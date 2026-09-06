/*
==================================================
  SLAYER TERMINAL - THE QUALITY SLEEVE
  (data/qualityScore.ts) — Part 7.2.
==================================================

  "The quality sleeve currently has no defined inputs — this panel is where
  they live." The checklist is exactly right, and the state it describes was
  worse than "no defined inputs":

    quality: Math.round(hRange(`${ticker}-${day}-stk-qual`, 25, 94))

  A seeded random number in a range, rendered as a 0–100 bar beside three
  others, under a note claiming it was "balance-sheet and margin health from
  the last four reported quarters". The note described inputs that were not
  being read. That is the worst shape a number on this desk can have: not
  missing, not approximate — SOURCED-SOUNDING and unsourced.

  data/fundamentals.ts has carried real statements and ratios for every name
  in the universe the whole time. Measured: 28 of 28 names return a full set
  in 4ms, with properly separated distributions — net margin 6.4% to 39.3%,
  ROE 7.6% to 55.6%, debt/equity 0.10 to 0.68. There was nothing to build,
  only something to connect.

  ── HOW IT IS NORMALISED, WHICH IS THE ONLY INTERESTING DECISION ─────────

  PERCENTILE WITHIN THE UNIVERSE, not an absolute band. A 14% net margin is
  excellent for a retailer and poor for a software company, and this board
  ranks both. Absolute thresholds would encode a sector view nobody argued
  for; a percentile says "this balance sheet ranks here among the names on
  this board", which is what a reader comparing rows actually wants to know
  and is a claim the board can support.

  It also means the sleeve is a RANKING and cannot be read as a grade. A 50
  is the middle of this universe, not a C. The methodology door says so.

  ── LIQUIDITY IS THE ONE FIELD THAT IS NOT MONOTONE ──────────────────────

  More net margin is better without limit. More CURRENT RATIO is not: past
  roughly 3, a company is holding idle assets rather than being safer, and
  the measured top of this universe is 8.2 — which a raw percentile would
  reward as the healthiest balance sheet on the board. So liquidity is
  scored on `min(currentRatio, LIQUIDITY_CAP)`, which credits the distance
  from danger and stops crediting distance beyond it.

  That is a modelling decision, not a measurement, and it is the kind that
  belongs in the open. Leverage is inverted for the same reason it is
  obvious: less debt is better, so the percentile is taken on −(d/e).
*/

import { buildFundamentals } from './fundamentals';
import { UNIVERSE } from './universe';

/** Past this, a current ratio is idle assets rather than more safety. */
export const LIQUIDITY_CAP = 3;

/*
  THE WEIGHTS ARE AN OPINION AND ARE LABELLED AS ONE. Nothing on this desk
  has fitted them; they encode a plain view — what a company earns matters
  more than how it is financed, and financing matters as a guard rail rather
  than as a score. Three profitability fields carry 0.70 between them and
  the two balance-sheet fields carry 0.30.
*/
export const QUALITY_WEIGHTS = {
  netMargin: 0.25,
  roe: 0.25,
  fcfMargin: 0.2,
  leverage: 0.15,
  liquidity: 0.15,
} as const;

export type QualityField = keyof typeof QUALITY_WEIGHTS;

export const QUALITY_FIELD_WORDS: Record<QualityField, { label: string; note: string }> = {
  netMargin: { label: 'Net margin', note: 'What survives to the bottom line, as a share of revenue.' },
  roe: { label: 'Return on equity', note: 'What the business earns on the capital its owners have in it.' },
  fcfMargin: { label: 'Free cash flow margin', note: 'Cash left after the business has paid to keep running. The hardest of the three to flatter.' },
  leverage: { label: 'Debt to equity', note: 'Inverted — less debt scores higher. A guard rail, not a virtue.' },
  liquidity: { label: 'Current ratio', note: `Credited up to ${LIQUIDITY_CAP}×; past that a balance sheet is holding idle assets, not getting safer.` },
};

/** The raw figure each field is scored on, before ranking. Higher is better
    in every case — leverage arrives already negated. */
function rawFields(ticker: string): Record<QualityField, number> | null {
  const f = buildFundamentals(ticker);
  if (!f) return null;
  const r = f.ratios;
  return {
    netMargin: r.netMarginPct,
    /* ROE is nullable on a name with no equity base. Zero is the honest
       stand-in HERE and only here: it puts such a name at the bottom of the
       ranking on this field rather than removing it from the board, which
       is what a missing return on equity actually means to a reader
       comparing balance sheets. */
    roe: r.roePct ?? 0,
    fcfMargin: r.fcfMarginPct,
    leverage: -r.debtToEquity,
    liquidity: Math.min(r.currentRatio, LIQUIDITY_CAP),
  };
}

/*
  The universe's figures, computed once. `buildFundamentals` is
  deterministic per name and costs 4ms for the whole board, but the
  percentile needs every name's value before it can place any one of them,
  so caching the table is what stops a 28-row board from building 28 tables.
*/
let table: { ticker: string; fields: Record<QualityField, number> }[] | null = null;

function universeTable() {
  if (table) return table;
  table = [];
  for (const u of UNIVERSE) {
    const fields = rawFields(u.ticker);
    if (fields) table.push({ ticker: u.ticker, fields });
  }
  return table;
}

/** TEST-ONLY — drop the cached table. */
export function resetQualityTable(): void {
  table = null;
}

/**
 * Where `value` sits among the universe on one field, 0–100.
 *
 * The share of names STRICTLY BELOW, so the bottom name reads 0 and a
 * reader can see the bottom of the range is real rather than an arbitrary
 * fraction. Ties therefore share the lower placing, which is the right way
 * round: two identical balance sheets should not be separated by an
 * accident of iteration order.
 */
function percentile(values: number[], value: number): number {
  const below = values.filter(v => v < value).length;
  return (below / Math.max(1, values.length - 1)) * 100;
}

export interface QualityBreakdown {
  score: number;
  /** Each field's percentile within the universe, and what it contributed. */
  parts: { field: QualityField; raw: number; pct: number; weighted: number }[];
}

/**
 * The quality sleeve for one name, with its working shown.
 *
 * Null for a name outside the universe — an ETF or an index has no
 * statements at all, and a zero there would read as the worst balance sheet
 * on the board rather than as the absence of one.
 */
export function qualityBreakdown(ticker: string): QualityBreakdown | null {
  const rows = universeTable();
  const me = rows.find(r => r.ticker === ticker.toUpperCase());
  if (!me) return null;

  const parts = (Object.keys(QUALITY_WEIGHTS) as QualityField[]).map(field => {
    const values = rows.map(r => r.fields[field]);
    const pct = percentile(values, me.fields[field]);
    return { field, raw: me.fields[field], pct, weighted: pct * QUALITY_WEIGHTS[field] };
  });

  return {
    score: Math.round(parts.reduce((a, p) => a + p.weighted, 0)),
    parts,
  };
}

/** Just the number, for the board. Null where there are no statements. */
export function qualityScore(ticker: string): number | null {
  return qualityBreakdown(ticker)?.score ?? null;
}
