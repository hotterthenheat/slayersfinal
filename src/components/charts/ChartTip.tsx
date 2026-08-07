import type { ReactNode } from 'react';

/*
==================================================
  SLAYER TERMINAL - CHART TOOLTIP (charts/ChartTip.tsx)
  The recharts-side twin of ui/HoverReadout — same card, same paddings, same
  border and shadow — so a hover on a recharts chart and a hover on one of the
  hand-drawn SVG charts are visually the same object. Two look-alike-but-not
  cards is exactly the kind of seam that makes a terminal feel assembled rather
  than built.

  The content contract is deliberate, and it is the same one HoverReadout uses:

    HEAD   what am I looking at, and when          (TipHead)
    ROWS   the numbers, labelled, with units       (TipRow)
    NOTE   what it means / what it implies         (TipNote)

  A hover that only repeats the value already printed on the axis is wasted
  surface. Every read-out in the app owes the reader at least one thing the
  chart itself does not already say.
==================================================
*/

/** The card shell. Matches ui/HoverReadout exactly — change both together. */
export const TipCard = ({ children }: { children: ReactNode }) => (
  <div className="pointer-events-none max-w-[300px] rounded-md border border-borderMuted bg-panelRaised px-3 py-2 shadow-overlay">
    <div className="flex flex-col gap-1">{children}</div>
  </div>
);

/** The subject line — the contract, the strike, the timestamp. */
export const TipHead = ({ children, sub }: { children: ReactNode; sub?: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="font-mono text-label font-semibold uppercase tracking-wider text-textPrimary">{children}</span>
    {sub != null && <span className="font-mono text-micro uppercase tracking-wider text-textMuted tnum">{sub}</span>}
  </div>
);

/**
 * One labelled number. `tone` carries a Tailwind text class from the caller so
 * the colour decision stays with the chart that owns the meaning — this file
 * must never decide that a number is green.
 */
export const TipRow = ({ label, value, tone = 'text-textPrimary' }: { label: string; value: ReactNode; tone?: string }) => (
  <div className="flex items-baseline justify-between gap-4">
    <span className="font-mono text-micro uppercase tracking-wider text-textMuted">{label}</span>
    <span className={`font-mono text-label font-semibold tnum ${tone}`}>{value}</span>
  </div>
);

/** A swatch + label row, for series identity inside a multi-series read-out. */
export const TipSeries = ({ color, label, value }: { color: string; label: string; value: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4">
    <span className="flex items-center gap-1.5 font-mono text-micro uppercase tracking-wider text-textMuted">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      {label}
    </span>
    <span className="font-mono text-label font-semibold tnum text-textPrimary">{value}</span>
  </div>
);

/** The closing sentence — the reason the reader hovered. Observational, never instructive. */
export const TipNote = ({ children }: { children: ReactNode }) => (
  <p className="mt-0.5 border-t border-borderSubtle pt-1 text-micro leading-snug text-textSecondary">{children}</p>
);

interface ChartTipProps<T> {
  /** Injected by recharts via cloneElement. */
  active?: boolean;
  payload?: { payload: T }[];
  label?: string | number;
  /** Renders the card body from the hovered datum. */
  render: (row: T, ctx: { label?: string | number; rows: T[] }) => ReactNode;
}

/**
 * Plugs into recharts as `<Tooltip content={<ChartTip<Row> render={…} />} />`.
 * Recharts clones the element and injects `active` / `payload` / `label`, so the
 * component type stays stable across renders and the card never remounts
 * mid-hover (which reads as a flicker).
 */
export function ChartTip<T>({ active, payload, label, render }: ChartTipProps<T>) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (row == null) return null;
  return <TipCard>{render(row, { label, rows: payload.map(p => p.payload) })}</TipCard>;
}

export default ChartTip;
