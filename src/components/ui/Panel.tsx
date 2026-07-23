import React, { useId } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { Tone } from './tones';
import { useFocus } from '../../context/FocusContext';

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
  /** Opt in to Focus Mode — a header control blooms this panel full-bleed */
  focusable?: boolean;
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
  info: 'bg-flip/[0.05]',
  select: 'bg-select/[0.05]',
  magenta: 'bg-king/[0.06]',
  neutral: '',
};

const toneDivider: Record<Tone, string> = {
  bull: 'border-bull/15',
  bear: 'border-bear/15',
  warn: 'border-warn/15',
  info: 'border-flip/15',
  select: 'border-select/15',
  magenta: 'border-king/15',
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
  focusable = false,
  className = '',
  bodyClassName = '',
  children,
}: PanelProps) => {
  // Emphasis is now a quiet static lift (brighter hairline) — no animated
  // holo frame, glow, or corner ticks. Hierarchy from contrast, not ornament.
  const surface = emphasis ? 'inst-emphasis' : 'inst-surface';
  const uid = useId();
  const { focusedId, overlayEl, focus, close } = useFocus();
  const isFocused = focusable && focusedId === uid;
  const bodyPad = flush ? '' : 'p-4';

  return (
    <section
      className={`relative ${surface} rounded-md flex flex-col min-w-0 ${className}`}
    >
      {(title || actions || focusable) && (
        <header
          className={`relative flex items-center justify-between gap-3 px-3.5 h-10 border-b ${toneDivider[tone]} ${toneHeaderTint[tone]} shrink-0`}
        >
          <div className="flex items-baseline gap-2 min-w-0">
            {title && (
              <h3 className="font-mono text-label font-semibold uppercase tracking-widest text-textPrimary truncate">
                {title}
              </h3>
            )}
            {subtitle && (
              // Hidden on phones: the title + subtitle + actions can't share one
              // narrow row without the title truncating to a few letters, and a
              // clipped subtitle reads as nothing. Title wins; subtitle returns at sm.
              <span className="hidden sm:inline font-mono text-label text-textSecondary uppercase tracking-wider truncate">
                {subtitle}
              </span>
            )}
          </div>
          {(actions || focusable) && (
            <div className="flex items-center gap-2 shrink-0">
              {actions}
              {focusable && (
                <button
                  onClick={() => (isFocused ? close() : focus(uid, title ?? subtitle))}
                  aria-label={isFocused ? 'Exit focus' : 'Focus this panel'}
                  title={isFocused ? 'Exit focus (Esc)' : 'Focus'}
                  className="text-textMuted hover:text-textPrimary transition-colors"
                >
                  {isFocused ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          )}
        </header>
      )}
      {isFocused && overlayEl ? (
        <>
          {/* Body lives in the focus overlay while focused — hold the height here. */}
          <div className={`${bodyPad} flex-grow min-h-0 flex items-center justify-center`}>
            <span className="font-mono text-micro uppercase tracking-widest text-textMuted">
              Viewing in focus · Esc to return
            </span>
          </div>
          {createPortal(<div className={`h-full min-h-0 ${bodyClassName}`}>{children}</div>, overlayEl)}
        </>
      ) : (
        <div className={`${bodyPad} flex-grow min-h-0 ${bodyClassName}`}>{children}</div>
      )}
    </section>
  );
};

export default Panel;
