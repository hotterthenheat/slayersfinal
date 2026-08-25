import React from 'react';
import type { Tone } from './tones';

interface PanelProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Remove body padding (dense tables bleed to the edges) */
  flush?: boolean;
  /** Tint the surface with a directional/status accent */
  tone?: Tone;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

// Full class strings kept static so Tailwind JIT picks them up
const toneSurface: Record<Tone, string> = {
  bull: 'border-bull/30 bg-bull/[0.04]',
  bear: 'border-bear/30 bg-bear/[0.04]',
  warn: 'border-warn/30 bg-warn/[0.04]',
  select: 'border-select/30 bg-select/[0.04]',
  magenta: 'border-king/30 bg-king/[0.04]',
  // A whole panel never wears the foil — holo is chip-scale hardware. Falls
  // back to the neutral surface so `tone="holo"` on a Panel can't tint it.
  holo: 'border-borderSubtle bg-panel',
  neutral: 'border-borderSubtle bg-panel',
};

const toneDivider: Record<Tone, string> = {
  bull: 'border-bull/20',
  bear: 'border-bear/20',
  warn: 'border-warn/20',
  select: 'border-select/20',
  magenta: 'border-king/20',
  holo: 'border-borderSubtle',
  neutral: 'border-borderSubtle',
};

/** The base dark surface every widget sits in. */
const Panel = ({
  title,
  subtitle,
  actions,
  flush = false,
  tone = 'neutral',
  className = '',
  bodyClassName = '',
  children,
}: PanelProps) => {
  return (
    <section className={`border ${toneSurface[tone]} rounded-lg flex flex-col min-w-0 ${className}`}>
      {(title || actions) && (
        <header className={`flex items-center justify-between gap-3 px-4 h-10 border-b ${toneDivider[tone]} shrink-0`}>
          <div className="flex items-baseline gap-2 min-w-0">
            {/* h2, not h3. Every desk renders one h1 (the page name) and then
                nothing but Panels, so an h3 here made the outline jump h1 -> h3
                on twelve of sixteen routes — a screen reader navigating by
                heading level reads that as a missing section. Panel is not used
                on the landing page, whose own heading order is already correct,
                so this only straightens the desks. Anything nested inside a
                panel (SignalMonitor's setup headline) stays h3, which is now
                the right level under it. */}
            {title && (
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-widest text-textPrimary truncate">
                {title}
              </h2>
            )}
            {subtitle && (
              <span className="font-mono text-[10px] text-textSecondary uppercase tracking-wider truncate">{subtitle}</span>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={`${flush ? '' : 'p-4'} flex-grow min-h-0 ${bodyClassName}`}>{children}</div>
    </section>
  );
};

export default Panel;
