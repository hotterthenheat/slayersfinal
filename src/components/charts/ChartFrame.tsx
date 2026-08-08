import type { ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';

/*
==================================================
  SLAYER TERMINAL - CHART FRAME (charts/ChartFrame.tsx)
  The surface a chart sits on: title left, provenance right, optional legend
  under the rule, plot below. Every desk had rebuilt this header by hand with
  slightly different weights and gaps; this is the one of them.

  `meta` is where a chart states its provenance ("7d -> 360d - Modeled",
  "1D - 5min"). The house rule is that a modelled chart says so on its own face,
  so a reader never has to remember which panels are live.
==================================================
*/

interface ChartFrameProps {
  title: string;
  /** Provenance / range, right-aligned in the header. */
  meta?: ReactNode;
  /** Optional swatch row under the header. */
  legend?: ReactNode;
  /** Plot height in px. ResponsiveContainer needs a fixed one. */
  height?: number;
  /** Description for assistive tech — what the shape shows, in words. */
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
}

const ChartFrame = ({ title, meta, legend, height = 170, ariaLabel, children, className = '' }: ChartFrameProps) => (
  <figure className={`inst-surface rounded-md p-3 ${className}`}>
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <span className="font-mono text-micro font-semibold uppercase tracking-widest text-textSecondary">{title}</span>
      {meta != null && <span className="font-mono text-micro uppercase tracking-wider text-textMuted tnum">{meta}</span>}
    </div>
    {legend != null && <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">{legend}</div>}
    {/* The accessible description lives on the figure, not the SVG: recharts owns
        the <svg> element and would drop any attribute we set on it. */}
    {ariaLabel != null && <figcaption className="sr-only">{ariaLabel}</figcaption>}
    <div role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  </figure>
);

/** One legend swatch. `dash` draws a rule instead of a dot, for line series. */
export const Swatch = ({ color, label, dash = false }: { color: string; label: string; dash?: boolean }) => (
  <span className="inline-flex items-center gap-1.5 font-mono text-micro uppercase tracking-wider text-textMuted">
    <span
      className={dash ? 'h-[2px] w-3 rounded-full' : 'h-1.5 w-1.5 rounded-full'}
      style={{ background: color }}
    />
    {label}
  </span>
);

export default ChartFrame;
