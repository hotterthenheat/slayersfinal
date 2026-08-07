import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { DUR, EASE } from '../../lib/motion';
import { useFocusTrap } from '../../hooks/useFocusTrap';

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
==================================================
*/

/** One labelled value inside a drilldown section grid. */
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
  <div className="bg-inset px-3 py-2 flex flex-col gap-0.5 min-w-0">
    <span className="font-mono text-label uppercase tracking-widest text-textMuted truncate">{label}</span>
    <span className={`font-mono text-data font-semibold tnum ${tone} truncate`}>{value}</span>
    {sub != null && <span className="font-mono text-label text-textSecondary truncate">{sub}</span>}
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
    <div
      className={`grid gap-px bg-borderSubtle rounded-md overflow-hidden ${
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
    <div className="inst-surface rounded-md px-4 py-3 flex flex-col gap-2">{children}</div>
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
   * Max width. `wide` (default) is the two-column drilldown; `standard` suits a
   * drilldown that genuinely has one column of content.
   */
  size?: 'standard' | 'wide';
  /** Optional pinned footer — actions that should not scroll away. */
  footer?: ReactNode;
  children: ReactNode;
}

const DetailModal = ({ open, onClose, ariaLabel, header, size = 'wide', footer, children }: DetailModalProps) => {
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // A modal that scrolls the page behind it reads as broken: the backdrop moves
  // under a fixed card. Lock the document while one is open, and restore the
  // exact value rather than assuming it was ''.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.fast }}
            onClick={onClose}
          />
          <motion.div
            ref={trapRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className={`relative flex w-full flex-col overflow-hidden rounded-lg border border-borderMuted bg-panel shadow-overlay focus:outline-none max-h-[calc(100vh-1.5rem)] sm:max-h-[88vh] ${
              size === 'wide' ? 'max-w-5xl' : 'max-w-2xl'
            }`}
            // Rises into the middle of the screen rather than sliding in from an
            // edge — the drilldown is the thing you asked for, not a side tab.
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: DUR.quick, ease: EASE }}
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-borderSubtle bg-panelRaised px-4 py-3 sm:px-5">
              <div className="min-w-0">{header}</div>
              <button
                onClick={onClose}
                aria-label="Close detail"
                className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded border border-borderSubtle bg-white/[0.02] text-textSecondary transition-colors hover:border-borderMuted hover:text-textPrimary"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
            {footer != null && (
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-borderSubtle bg-panelRaised px-4 py-3 sm:px-5">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default DetailModal;
