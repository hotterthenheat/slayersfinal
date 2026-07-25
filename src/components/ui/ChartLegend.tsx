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
  /** `square` = area/band fills · `line` = series/level rules (the chart-toolbar look) */
  variant?: 'square' | 'line';
}

/**
 * The house chart legend. Two swatch grammars, both previously re-spelled per
 * chart: `square` (small filled block + uppercase muted label) for area/band
 * fills, and `line` (thin rule + sentence-case secondary label) for series and
 * level lines — the look every lightweight-charts toolbar uses. Pass `color`
 * for a raw chart color or `swatchClass` for a token background.
 */
const ChartLegend = ({ items, className = '', variant = 'square' }: ChartLegendProps) => {
  const line = variant === 'line';
  return (
    <div className={`flex flex-wrap items-center ${line ? 'gap-x-3.5' : 'gap-x-3'} gap-y-1 select-none ${className}`}>
      {items.map((it, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1.5 font-mono text-micro ${
            line ? 'text-textSecondary' : 'uppercase tracking-wider text-textMuted'
          }`}
        >
          <span
            className={`inline-block shrink-0 ${line ? 'w-3 h-0.5 rounded-full' : 'w-2.5 h-2 rounded-sm'} ${it.swatchClass ?? ''}`}
            style={it.color ? { background: it.color } : undefined}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
};

export default ChartLegend;
