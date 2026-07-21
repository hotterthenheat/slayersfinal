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
  /** The one hero surface on a page — living holo frame + halo */
  emphasis?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

// Tone reads through a whisper of header tint + the divider — never a muddy
// full-surface wash and never a decorative color bar.
const toneHeaderTint: Record<Tone, string> = {
  bull: 'bg-bull/[0.05]',
  bear: 'bg-bear/[0.05]',
  warn: 'bg-warn/[0.05]',
  select: 'bg-select/[0.05]',
  magenta: 'bg-[#EA00FF]/[0.06]',
  neutral: '',
};

const toneDivider: Record<Tone, string> = {
  bull: 'border-bull/15',
  bear: 'border-bear/15',
  warn: 'border-warn/15',
  select: 'border-select/15',
  magenta: 'border-[#EA00FF]/15',
  neutral: 'border-borderSubtle',
};

/** The base dark surface every widget sits in — a machined instrument panel. */
const Panel = ({
  title,
  subtitle,
  actions,
  flush = false,
  tone = 'neutral',
  emphasis = false,
  className = '',
  bodyClassName = '',
  children,
}: PanelProps) => {
  const surface = emphasis ? 'inst-emphasis holo-glow' : 'inst-surface inst-ticks';
  return (
    <section
      className={`relative ${surface} rounded-md flex flex-col min-w-0 ${className}`}
    >
      {(title || actions) && (
        <header
          className={`relative flex items-center justify-between gap-3 px-3.5 h-10 border-b ${toneDivider[tone]} ${toneHeaderTint[tone]} shrink-0`}
        >
          <div className="flex items-baseline gap-2 min-w-0">
            {title && (
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-widest text-textPrimary truncate">
                {title}
              </h3>
            )}
            {subtitle && (
              <span className="font-mono text-[10px] text-textSecondary uppercase tracking-wider truncate">
                {subtitle}
              </span>
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
