import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useFocus } from '../../context/FocusContext';
import { EASE } from '../../lib/motion';

/**
 * The cinematic frame Focus Mode blooms into. Rendered once (inside
 * FocusProvider); a focused Panel portals its live body into the container
 * this exposes via registerOverlay, so the instrument keeps streaming.
 */
const FocusLayer = () => {
  const { focusedId, title, close, registerOverlay } = useFocus();
  const open = focusedId !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6 md:p-10">
          <motion.div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
          />
          <motion.div
            className="relative w-full max-w-[1600px] h-[88vh] inst-emphasis holo-glow rounded-lg overflow-hidden flex flex-col shadow-overlay"
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ duration: 0.28, ease: EASE }}
          >
            <header className="flex items-center justify-between gap-3 px-4 h-11 border-b border-borderSubtle shrink-0">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="font-mono text-micro uppercase tracking-widest text-textMuted shrink-0">Focus</span>
                <div className="min-w-0 truncate">{title}</div>
              </div>
              <button
                onClick={close}
                aria-label="Exit focus"
                className="inline-flex items-center gap-1.5 rounded border border-borderSubtle bg-white/[0.02] px-2 h-7 text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors"
              >
                <span className="font-mono text-micro uppercase tracking-widest">Esc</span>
                <X className="w-3.5 h-3.5" />
              </button>
            </header>
            {/* Focused panels portal their live body in here. */}
            <div ref={registerOverlay} className="flex-1 min-h-0 p-4" />
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default FocusLayer;
