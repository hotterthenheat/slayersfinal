/*
==================================================
  SLAYER TERMINAL - THE INK KEY (flow tables)

  v1 spelled the palette out as a row of coloured
  words riding every read strip — rejected on sight
  (Noah, 2026-08-30: "childs play and doesnt even
  look decent"). A legend that is always shouting
  is chrome pretending to be data.

  v2 is the Term explainer's exact grammar, because
  "what does this colour mean" IS a jargon question:
  at rest, two muted words with the house dotted
  underline; on hover or focus, one portaled card
  showing each register as a REAL SAMPLE beside a
  plain-English line. The samples carry the inks so
  nothing has to be cross-referenced; the page pays
  nothing until someone asks.
==================================================
*/

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const REGISTERS: { sample: string; ink: string; blurb: string }[] = [
  { sample: '8,412', ink: 'text-textSecondary', blurb: 'the column’s usual run' },
  { sample: '48,210', ink: 'font-bold text-textPrimary', blurb: 'heavy — its top fifth on screen' },
  { sample: '+2,940', ink: 'text-bull', blurb: 'direction, once it’s heavy' },
  { sample: '−8,113', ink: 'text-bear', blurb: 'the same, leaning the other way' },
  { sample: '274,641', ink: 'font-bold text-supreme', blurb: 'the single largest on screen' },
];

const InkKey = ({ className = '' }: { className?: string }) => {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const closeTimer = useRef(0);
  const tipId = useId();
  const [pos, setPos] = useState<{ x: number; y: number; up: boolean } | null>(null);

  const show = () => {
    window.clearTimeout(closeTimer.current);
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const up = r.top > (window.innerHeight || 900) * 0.5;
    setPos({ x: r.left + r.width / 2, y: up ? r.top - 6 : r.bottom + 6, up });
  };
  const hide = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setPos(null), 140);
  };

  // Any scroll dismisses — a fixed card would detach from its anchor (Term's rule).
  useEffect(() => {
    if (!pos) return;
    const dismiss = () => setPos(null);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.clearTimeout(closeTimer.current);
    };
  }, [pos]);

  return (
    <span
      ref={anchorRef}
      tabIndex={0}
      role="button"
      aria-expanded={pos != null}
      aria-describedby={pos ? tipId : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={e => {
        if (e.key === 'Escape' && pos) {
          e.stopPropagation();
          window.clearTimeout(closeTimer.current);
          setPos(null);
        }
      }}
      className={`shrink-0 cursor-help select-none font-mono text-[9px] uppercase tracking-widest text-textMuted hover:text-textSecondary transition-colors underline decoration-dotted decoration-textMuted/60 underline-offset-2 outline-none focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60 ${className}`}
    >
      ink code
      {pos &&
        createPortal(
          <span
            id={tipId}
            role="tooltip"
            onMouseEnter={show}
            onMouseLeave={hide}
            className="fixed z-[60] block w-64 rounded-md border border-borderMuted bg-[#0c0c0c] px-3 py-2 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.75),0_4px_10px_-6px_rgba(0,0,0,0.55)] normal-case tracking-normal"
            style={{
              left: Math.min(Math.max(pos.x, 140), (window.innerWidth || 1440) - 140),
              top: pos.y,
              transform: `translate(-50%, ${pos.up ? '-100%' : '0'})`,
            }}
          >
            <span className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-textPrimary">
              How the numbers wear their ink
            </span>
            <span className="mt-1.5 block">
              {REGISTERS.map(r => (
                <span key={r.sample} className="flex items-baseline justify-between gap-3 py-[3px]">
                  <span className={`font-mono text-[11px] tnum ${r.ink}`}>{r.sample}</span>
                  <span className="font-sans text-[10.5px] leading-tight text-textSecondary text-right">{r.blurb}</span>
                </span>
              ))}
            </span>
            <span className="mt-1.5 block border-t border-borderSubtle pt-1.5 font-sans text-[10px] leading-snug text-textMuted">
              Each column measures its own crowd, so “heavy” always means heavy among the rows you’re looking at.
            </span>
          </span>,
          document.body
        )}
    </span>
  );
};

export default InkKey;
