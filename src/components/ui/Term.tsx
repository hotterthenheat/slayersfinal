import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { TERMS, type TermKey } from '../../data/terms';

interface TermProps {
  /** Dictionary key — the definition shown in the card */
  k: TermKey;
  /** Visible text; defaults to the key itself */
  children?: ReactNode;
  className?: string;
}

/**
 * Inline jargon explainer — wraps an abbreviation (GEX, OTM%, Sig…) with a
 * dotted underline and reveals its one-line definition in a floating card on
 * hover OR keyboard focus. Fixed-position so it never clips inside scroll
 * containers; any scroll dismisses it (a fixed card would detach from its
 * anchor otherwise). The card itself stays hoverable so the glossary link is
 * reachable; a short close delay bridges the anchor→card gap.
 */
const Term = ({ k, children, className = '' }: TermProps) => {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const closeTimer = useRef(0);
  const [pos, setPos] = useState<{ x: number; y: number; up: boolean } | null>(null);

  const show = () => {
    window.clearTimeout(closeTimer.current);
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Open upward when the anchor sits in the lower half of the viewport.
    const up = r.top > (window.innerHeight || 900) * 0.5;
    setPos({ x: r.left + r.width / 2, y: up ? r.top - 6 : r.bottom + 6, up });
  };
  const hide = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setPos(null), 140);
  };

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
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className={`cursor-help underline decoration-dotted decoration-textMuted/60 underline-offset-2 outline-none focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-select/60 ${className}`}
    >
      {children ?? k}
      {pos &&
        // Portaled to <body> — inside transformed containers (Pulse grid tiles)
        // `fixed` would anchor to the tile and clip.
        createPortal(
        <span
          role="tooltip"
          onMouseEnter={show}
          onMouseLeave={hide}
          onClick={e => e.stopPropagation()}
          className="fixed z-[60] block w-56 rounded-md border border-borderMuted bg-panelRaised px-3 py-2 shadow-overlay normal-case tracking-normal"
          style={{
            left: Math.min(Math.max(pos.x, 120), (window.innerWidth || 1440) - 120),
            top: pos.y,
            transform: `translate(-50%, ${pos.up ? '-100%' : '0'})`,
          }}
        >
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-label font-semibold uppercase tracking-wider text-textPrimary">{k}</span>
            <Link
              to="/guide/concepts"
              tabIndex={-1}
              className="font-mono text-micro uppercase tracking-wider text-textMuted no-underline hover:text-textSecondary"
            >
              glossary →
            </Link>
          </span>
          <span className="mt-0.5 block font-sans text-label font-normal leading-relaxed text-textSecondary">
            {TERMS[k]}
          </span>
        </span>,
        document.body
      )}
    </span>
  );
};

export default Term;
