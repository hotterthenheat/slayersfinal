import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

/** One labelled value inside a drilldown section grid. Shared across desk drawers. */
export const Field = ({
  label,
  value,
  tone = 'text-textPrimary',
  sub,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
  sub?: string;
}) => (
  <div className="bg-inset px-3 py-2 flex flex-col gap-0.5 min-w-0">
    <span className="font-mono text-[11px] uppercase tracking-widest text-textMuted truncate">{label}</span>
    <span className={`font-mono text-[13px] font-semibold tnum ${tone} truncate`}>{value}</span>
    {sub && <span className="font-mono text-[11px] text-textSecondary truncate">{sub}</span>}
  </div>
);

/** A titled 3-up grid of Fields. */
export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <span className="font-mono text-[11px] uppercase tracking-widest text-textSecondary">{title}</span>
    <div className="grid grid-cols-3 gap-px bg-borderSubtle rounded-md overflow-hidden">{children}</div>
  </div>
);

interface DrilldownDrawerProps {
  /** Drawer is mounted while this is true. */
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  /** Sticky header content (title chips, timestamp, …). */
  header: ReactNode;
  children: ReactNode;
}

/**
 * Right-hand slide-in drawer shell shared by every desk drilldown (the tape
 * print detail, a scanner contract, …). Owns the portal, backdrop, slide
 * animation, Escape-to-close and scroll — callers supply only the header and
 * body so each desk stays consistent without duplicating the chrome.
 */
const DrilldownDrawer = ({ open, onClose, ariaLabel, header, children }: DrilldownDrawerProps) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className="fixed inset-y-0 right-0 z-[60] w-full max-w-[520px] bg-panel border-l border-borderMuted shadow-2xl shadow-black/60 overflow-y-auto"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-3 px-4 py-3 border-b border-borderSubtle bg-panel/95 backdrop-blur">
              <div className="min-w-0">{header}</div>
              <button
                onClick={onClose}
                aria-label="Close detail"
                className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded border border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </header>
            <div className="px-4 py-4 flex flex-col gap-4">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default DrilldownDrawer;
