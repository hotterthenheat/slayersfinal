import React from 'react';

export interface LegendEntry {
  label: React.ReactNode;
  /** Swatch color as a CSS color (applied inline) — for chart/series colors. */
  color?: string;
  /** OR a Tailwind background class for the swatch (e.g. `bg-bull/60`). */
  swatchClass?: string;
}

interface ChartLegendProps {
  items: LegendEntry[];
  className?: string;
}

/**
 * The house chart legend — a wrap of small square swatches + mono micro labels.
 * One component instead of the same `flex … w-2.5 h-2 rounded-[2px]` swatch list
 * re-spelled per chart. Pass `color` for a raw chart color or `swatchClass` for
 * a token background.
 */
const ChartLegend = ({ items, className = '' }: ChartLegendProps) => (
  <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 select-none ${className}`}>
    {items.map((it, i) => (
      <span key={i} className="inline-flex items-center gap-1.5 font-mono text-micro uppercase tracking-wider text-textMuted">
        <span
          className={`inline-block w-2.5 h-2 rounded-[2px] shrink-0 ${it.swatchClass ?? ''}`}
          style={it.color ? { background: it.color } : undefined}
        />
        {it.label}
      </span>
    ))}
  </div>
);

export default ChartLegend;
