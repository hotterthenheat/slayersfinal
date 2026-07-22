import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

const GROUPS: { title: string; rows: { keys: string[]; label: string }[] }[] = [
  {
    title: 'Global',
    rows: [
      { keys: ['⌘', 'K'], label: 'Open the command palette' },
      { keys: ['?'], label: 'Show this shortcuts sheet' },
      { keys: ['Esc'], label: 'Close palette, drawer or overlay' },
    ],
  },
  {
    title: 'Command palette',
    rows: [
      { keys: ['↑', '↓'], label: 'Move between results' },
      { keys: ['↵'], label: 'Run the highlighted command' },
      { keys: ['Type'], label: 'Filter pages, tickers and actions' },
    ],
  },
  {
    title: 'Tables & drawers',
    rows: [
      { keys: ['Click'], label: 'Open a row’s contract drilldown' },
      { keys: ['Esc'], label: 'Close the drilldown drawer' },
    ],
  },
];

const Key = ({ children }: { children: string }) => (
  <kbd className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded border border-borderMuted bg-inset font-mono text-[11px] text-textPrimary">
    {children}
  </kbd>
);

/** Keyboard-shortcut cheat sheet, opened with `?`. */
const ShortcutsOverlay = ({ open, onClose }: ShortcutsOverlayProps) => {
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            className="relative w-full max-w-lg border border-borderMuted bg-panel rounded-lg shadow-2xl shadow-black overflow-hidden"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <header className="flex items-center justify-between px-4 py-3 border-b border-borderSubtle">
              <span className="font-mono text-[11px] uppercase tracking-widest text-textSecondary">Keyboard shortcuts</span>
              <button
                onClick={onClose}
                aria-label="Close"
                className="inline-flex items-center justify-center w-7 h-7 rounded border border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </header>
            <div className="p-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
              {GROUPS.map(group => (
                <div key={group.title} className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">{group.title}</span>
                  <div className="flex flex-col divide-y divide-borderSubtle/60 rounded-md border border-borderSubtle overflow-hidden">
                    {group.rows.map(row => (
                      <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="text-[12px] text-textSecondary">{row.label}</span>
                        <span className="flex items-center gap-1 shrink-0">
                          {row.keys.map((k, i) => (
                            <Key key={i}>{k}</Key>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ShortcutsOverlay;
