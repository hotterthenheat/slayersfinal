import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';
import Overlay from './Overlay';
import { readExpandPref, writeExpandPref } from '../../hooks/useExpandPreference';

/*
==================================================
  SLAYER TERMINAL - DETAIL MODAL (ui/DetailModal.tsx)
  The one shell every drilldown opens in: a row on the tape, a contract on the
  scanner, a name on the Stocks board.

  This replaces the right-hand slide-in drawer the desks used to share. The
  drawer was a 520px column pinned to the edge of the screen, and it cost twice:
  it read as a side tab rather than as the thing you just asked for, and 520px
  of width is a hard ceiling on how much a drilldown can say. Everything had to
  stack in one narrow column, so each drawer showed the few fields that fit and
  dropped the rest.

  Centred and wide, the same drilldowns carry two columns of detail and several
  times the content. The width is the feature, not the styling.

  Owns the portal, the backdrop, the focus trap, Escape-to-close and the scroll
  region — callers supply a header and a body and nothing else, so every
  drilldown in the terminal behaves identically.

  TWO SIZES, because two readers want different things from the same click. The
  default is the drilldown: enough to answer the question the row raised,
  without taking the desk away. Expand gives the same object the whole screen —
  and callers are handed the flag, so expanding is not just the card getting
  bigger, it is the card showing what it left out. The choice is remembered, so
  whoever prefers the full view gets it on every drilldown from then on rather
  than pressing the same button every time.
==================================================
*/

/*
  One labelled value in a drilldown section.

  This was a filled tile — `bg-inset`, its own padding box — sitting in a
  `gap-px` grid over a border-coloured background, which paints a hairline
  LATTICE: every figure in its own little cell, three across and two down, three
  blocks of them down the pane. It is the single most recognisable shape in
  generated UI and it was the loudest thing in every drilldown in the terminal.

  `ui/StatCard` went through exactly this and its comment is the argument:
  "This used to be a card, and the card was the problem… The metric is now a
  cell on a ruled strip — no surface, no radius, no padding box. That is what
  the header of a terminal actually looks like, and it is the same information
  in roughly a third of the vertical space."

  Same move here. The cell keeps its own left rule so the columns stay readable
  as columns, the row keeps a rule under it, and nothing is filled. Denser,
  quieter, and the numbers are what carries — which is the point of a drilldown.
*/
export const Field = ({
  label,
  value,
  tone = 'text-textPrimary',
  sub,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
  sub?: ReactNode;
}) => (
  <div className="px-3 py-2 flex flex-col gap-0.5 min-w-0 border-l border-borderSubtle first:border-l-0">
    <span className="font-mono text-micro uppercase tracking-widest text-textMuted truncate">{label}</span>
    <span className={`font-mono text-data font-semibold tnum ${tone} truncate`}>{value}</span>
    {sub != null && <span className="font-mono text-micro text-textSecondary truncate">{sub}</span>}
  </div>
);

/**
 * A titled grid of Fields. `cols` defaults to 3 — the width the drawer could
 * hold. The modal can carry 4 comfortably, and 2 when the values are long.
 */
export const Section = ({
  title,
  cols = 3,
  children,
}: {
  title: string;
  cols?: 2 | 3 | 4;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <span className="font-mono text-label uppercase tracking-widest text-textSecondary">{title}</span>
    {/* Ruled, not tiled. `gap-px` over `bg-borderSubtle` drew a full lattice —
        a border on all four sides of every figure. A rule above and below the
        strip, and one between the columns, separates them just as well and
        stops the drilldown reading as a grid of cards. */}
    <div
      className={`grid border-y border-borderSubtle ${
        cols === 2 ? 'grid-cols-2' : cols === 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'
      }`}
    >
      {children}
    </div>
  </div>
);

/** A titled block of prose or custom content, matching Section's label rhythm. */
export const Block = ({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    <span className="font-mono text-label uppercase tracking-widest text-textSecondary">{title}</span>
    {/* Matches Section: ruled top and bottom, no surface and no radius, so a
        block of prose sits in the same rhythm as the figures above it instead of
        floating on a second card. */}
    <div className="border-y border-borderSubtle px-1 py-3 flex flex-col gap-2">{children}</div>
  </div>
);

interface DetailModalProps {
  /** Modal is mounted while this is true. */
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  /** Sticky header content (title chips, timestamp, …). */
  header: ReactNode;
  /**
   * Max width when NOT expanded. `wide` (default) is the two-column drilldown;
   * `standard` suits a drilldown that genuinely has one column of content.
   */
  size?: 'standard' | 'wide';
  /**
   * Offer the full-screen view. Default on. Turn it off for a drilldown that
   * has nothing more to say at full width — a control that only makes the same
   * content wider is a control that lies about there being more.
   */
  expandable?: boolean;
  /**
   * Drive the expanded state from the caller instead of internally. Pair with
   * `useExpandPreference` when the caller needs the flag above its markup.
   */
  expanded?: boolean;
  onToggleExpanded?: () => void;
  /** Optional pinned footer — actions that should not scroll away. */
  footer?: ReactNode;
  /**
   * A function child is handed the expanded flag, so a caller can render the
   * extra columns and deeper sections that only earn their place at full width.
   */
  children: ReactNode | ((expanded: boolean) => ReactNode);
}

const DetailModal = ({
  open,
  onClose,
  ariaLabel,
  header,
  size = 'wide',
  expandable = true,
  expanded: expandedProp,
  onToggleExpanded,
  footer,
  children,
}: DetailModalProps) => {
  const [ownExpanded, setOwnExpanded] = useState(readExpandPref);
  const controlled = expandedProp != null;

  // Re-read on each open so a preference set in one drilldown is already in
  // force in the next, including one opened on another desk.
  useEffect(() => {
    if (open && !controlled) setOwnExpanded(readExpandPref());
  }, [open, controlled]);

  const toggleOwn = useCallback(() => {
    setOwnExpanded(prev => {
      writeExpandPref(!prev);
      return !prev;
    });
  }, []);

  const expanded = controlled ? expandedProp : ownExpanded;
  const toggleExpanded = controlled ? (onToggleExpanded ?? (() => {})) : toggleOwn;
  const isFull = expandable && expanded;

  /* Escape, the scroll lock, the portal and the focus trap are Radix's now —
     see ui/Overlay.tsx for what each hand-rolled copy was getting wrong. */

  return (
    <Overlay
      open={open}
      onClose={onClose}
      label={ariaLabel}
      className={
        isFull
          ? // Fills what the padding leaves, rather than growing to fit its
            // content — the expanded view is a page, and a page has a bottom
            // edge the reader can rely on.
            'max-w-[110rem] h-[calc(100vh-1.5rem)] sm:h-[calc(100vh-3rem)]'
          : `max-h-[calc(100vh-1.5rem)] sm:max-h-[88vh] ${size === 'wide' ? 'max-w-5xl' : 'max-w-2xl'}`
      }
    >
      <>
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-borderSubtle bg-panelRaised px-4 py-3 sm:px-5">
              <div className="min-w-0">{header}</div>
              <div className="flex shrink-0 items-center gap-1.5">
                {expandable && (
                  <button
                    onClick={toggleExpanded}
                    aria-pressed={isFull}
                    aria-label={isFull ? 'Collapse to the drilldown view' : 'Expand to the full view'}
                    title={isFull ? 'Back to the drilldown view' : 'Expand — full screen, with everything this print carries'}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded border transition-colors ${
                      isFull
                        ? 'border-select/40 bg-select/10 text-select'
                        : 'border-borderSubtle bg-white/[0.02] text-textSecondary hover:border-borderMuted hover:text-textPrimary'
                    }`}
                  >
                    {isFull ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </button>
                )}
                <button
                  onClick={onClose}
                  aria-label="Close detail"
                  className="inline-flex h-7 w-7 items-center justify-center rounded border border-borderSubtle bg-white/[0.02] text-textSecondary transition-colors hover:border-borderMuted hover:text-textPrimary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {typeof children === 'function' ? children(isFull) : children}
            </div>
            {footer != null && (
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-borderSubtle bg-panelRaised px-4 py-3 sm:px-5">
                {footer}
              </div>
            )}
      </>
    </Overlay>
  );
};

export default DetailModal;
