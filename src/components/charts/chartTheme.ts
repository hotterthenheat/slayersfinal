/*
==================================================
  SLAYER TERMINAL - CHART THEME (charts/chartTheme.ts)
  One source for how every recharts chart on the desk is dressed: tick type,
  grid weight, axis hairlines, cursor, margins. The terminal used to hand-roll
  each chart's SVG, which meant each one invented its own tick size, its own
  grey and its own idea of how much padding a plot needs — so two charts on one
  screen never quite matched. Import from here and they do.

  Colour still comes from components/gex/palette.ts. Nothing in this file picks
  a data colour; it only decides how the FURNITURE around the data looks, so the
  house colour discipline (green/red = market direction, silver/amber = data
  quality) stays in exactly one place.
==================================================
*/

import { MUTED_INK } from '../gex/palette';

/** Axis tick label. 10px is the terminal's readability floor for mono. */
export const axisTick = {
  fill: MUTED_INK,
  fontSize: 10,
  fontFamily: 'JetBrains Mono, monospace',
} as const;

/** Same as axisTick but for the emphasised axis (the one carrying the subject). */
export const axisTickBright = {
  fill: '#9aa0aa',
  fontSize: 10,
  fontFamily: 'JetBrains Mono, monospace',
} as const;

/** Grid lines sit at the edge of visibility — present when looked for, invisible otherwise. */
export const GRID = 'rgba(255,255,255,0.05)';

/** The hairline under an axis. Slightly stronger than the grid so the plot has a floor. */
export const AXIS_LINE = { stroke: 'rgba(255,255,255,0.09)' } as const;

/** A zero / reference rule — brighter than the grid, dashed, never a data colour. */
export const REF_LINE = 'rgba(255,255,255,0.20)';

/** The vertical line recharts draws under the pointer. */
export const CURSOR = { stroke: 'rgba(255,255,255,0.22)', strokeWidth: 1 } as const;

/** The translucent block recharts draws under the pointer on a bar chart. */
export const BAR_CURSOR = { fill: 'rgba(255,255,255,0.05)' } as const;

/**
 * Default plot margins. Left is 0 because every house chart puts its value axis
 * on the right (price-chart convention) or gives the left axis an explicit
 * `width`; recharts reserves left gutter on top of axis width, and the two
 * together used to leave a visible dead rail.
 */
export const chartMargin = { top: 8, right: 6, bottom: 2, left: 0 } as const;

/** Standard axis props for a right-hand value axis. Spread, then override. */
export const valueAxis = {
  orientation: 'right',
  tick: axisTick,
  tickLine: false,
  axisLine: false,
  width: 52,
} as const;

/** Standard axis props for a left-hand value axis. */
export const valueAxisLeft = {
  tick: axisTick,
  tickLine: false,
  axisLine: false,
  width: 52,
} as const;

/** Standard axis props for the category / time axis along the bottom. */
export const categoryAxis = {
  tick: axisTick,
  tickLine: false,
  axisLine: AXIS_LINE,
  minTickGap: 18,
} as const;

/**
 * Compact axis money — `$1.2B` / `$840M` / `$12K`. Deliberately shorter than the
 * body-copy `fmtUsd`, because an axis tick has ~6 characters before it collides
 * with its neighbour. Sign is preserved so a negative-gamma axis reads correctly.
 */
export function axisUsd(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  if (a === 0) return '$0';
  return `${s}$${a.toFixed(0)}`;
}

/** Axis percent, no decimals — `42%`. */
export const axisPct = (v: number): string => `${Math.round(v)}%`;

/** Axis vol point — `24.5`. Two-decimal ticks make a vol axis unreadable. */
export const axisVol = (v: number): string => v.toFixed(1);

/**
 * A domain padded by a fraction of its own span, so a line never runs along the
 * top or bottom edge of its plot. Recharts' `domain={['auto','auto']}` clamps to
 * the extremes, which is exactly the look the render pass flagged.
 */
export function paddedDomain(values: number[], pad = 0.12): [number, number] {
  const clean = values.filter(Number.isFinite);
  if (clean.length === 0) return [0, 1];
  const lo = Math.min(...clean);
  const hi = Math.max(...clean);
  const span = hi - lo;
  if (span === 0) {
    const p = Math.abs(hi) * pad || 1;
    return [hi - p, hi + p];
  }
  return [lo - span * pad, hi + span * pad];
}

/**
 * A zero-anchored symmetric domain — for any series that has a meaningful sign
 * (net premium, dealer gamma, charm). Keeps $0 dead-centre so "above the line"
 * and "below the line" carry their plain meaning.
 */
export function symmetricDomain(values: number[], pad = 1.1): [number, number] {
  const clean = values.filter(Number.isFinite).map(Math.abs);
  const m = (clean.length ? Math.max(...clean) : 1) * pad || 1;
  return [-m, m];
}

/** Evenly spaced ticks across a symmetric domain, always including 0. */
export function symmetricTicks(max: number): number[] {
  return [-max, -max / 2, 0, max / 2, max];
}
