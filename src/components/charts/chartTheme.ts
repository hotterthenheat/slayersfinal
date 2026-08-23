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

/*
  THE FAMILY, FOR SURFACES TAILWIND CANNOT REACH.

  Charts label themselves through a canvas `ctx.font` string or an SVG
  `font-family` attribute, so `font-mono` never applies to them — the family has
  to be written out. It was written out twenty-four times, in seventeen files,
  as the literal `'JetBrains Mono, monospace'`.

  That was survivable while JetBrains Mono was actually loaded. It stopped being
  survivable when the terminal moved to one self-hosted family: every one of
  those strings would have fallen through to the platform's generic `monospace`,
  which is a DIFFERENT TYPEFACE from the rest of the page — so the axis ticks on
  a chart would have quietly disagreed with the label sitting directly above it.

  One token, imported everywhere, and the failure mode is gone: changing the
  family is one edit, and a chart cannot drift from the page by accident.

  Quoted, because `Inter Variable` has a space in it and an unquoted multi-word family
  name is not valid in a canvas `ctx.font` shorthand — the whole declaration is
  dropped, silently, back to the 10px sans default.
*/
export const CHART_FONT =
  '"Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

/** Axis tick label. 10px is the terminal's readability floor for mono. */
export const axisTick = {
  fill: MUTED_INK,
  fontSize: 10,
  fontFamily: CHART_FONT,
} as const;

/** Same as axisTick but for the emphasised axis (the one carrying the subject). */
export const axisTickBright = {
  fill: '#9aa0aa',
  fontSize: 10,
  fontFamily: CHART_FONT,
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

/**
 * Standard axis props for the category / time axis along the bottom.
 *
 * `padding` insets the first and last tick from the plot edges. Tick labels are
 * centred on their tick, so a tick sitting exactly on the left edge has half its
 * label outside the clip region: the Vol Lab's skew slice rendered its 0.60
 * column as "60". The inset is inside the plot area, not an outer margin, so it
 * costs nothing on charts that already reserve width for a left-hand axis.
 */
export const categoryAxis = {
  tick: axisTick,
  tickLine: false,
  axisLine: AXIS_LINE,
  minTickGap: 18,
  padding: { left: 10, right: 10 },
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
 * A zero-anchored symmetric domain — $0 dead-centre, equal room either side.
 * Correct ONLY where the two halves are genuinely comparable by construction
 * (net call vs net put premium, where the builder hands over one shared bound).
 *
 * For a signed series that simply happens to have a sign — a cumulative dealer
 * gamma book that spent the session long — use `zeroAnchoredDomain` instead.
 * Forcing symmetry there reserves half the plot for a range the data never
 * visits, which is exactly what the render pass caught: a book running −$9M to
 * +$21M drawn on a ±$30M axis, using 40% of its own height.
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

/**
 * A padded domain that always CONTAINS zero without being centred on it. Use for
 * any signed series where above-the-line and below-the-line carry meaning but
 * the two sides are not the same size: the zero rule stays on the plot, and the
 * data still fills the height it has earned.
 */
export function zeroAnchoredDomain(values: number[], pad = 0.1): [number, number] {
  const clean = values.filter(Number.isFinite);
  if (clean.length === 0) return [0, 1];
  const lo = Math.min(0, ...clean);
  const hi = Math.max(0, ...clean);
  const span = hi - lo || Math.abs(hi) || 1;
  // A side that sits exactly on zero is not padded away from it — the axis
  // should read $0 at the floor, not a negative number the series never reaches.
  return [lo === 0 ? 0 : lo - span * pad, hi === 0 ? 0 : hi + span * pad];
}

/**
 * Round tick values across a domain — 1 / 2 / 5 x a power of ten, the ticks a
 * person would choose. recharts' own auto-ticks divide the domain evenly, so a
 * padded domain produces ticks like 37.8 / 31.6 / 21.6 / 11.6 / 1.6, which is a
 * scale nobody can read a value off.
 *
 * Zero is included whenever the domain spans it, so a signed chart always shows
 * its own baseline.
 */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return [];
  const raw = (hi - lo) / Math.max(1, count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
    // Re-round each step: repeated addition of a fractional step accumulates
    // float error, and a tick labelled 20.000000000000004 is a visible bug.
    out.push(Number(v.toPrecision(12)));
  }
  if (lo < 0 && hi > 0 && !out.includes(0)) out.push(0);
  return out.sort((a, b) => a - b);
}
