import { useEffect, useState, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import { DUR, EASE } from '../../lib/motion';

/*
==================================================
  SLAYER TERMINAL - BACK TO TOP (layout/BackToTop.tsx)
  The terminal scrolls inside <main>, not the window, so none of the browser's
  own affordances reach it: Home does nothing unless focus happens to be in the
  scroll region, and the scrollbar is the shell's, not the page's. A visitor
  4,000px down the Guide or the Concepts glossary has no one-action way back to
  the top of the document.

  Appears only once there is enough scrolled past for the trip back to be worth
  a control, and only on routes that scroll at all.
==================================================
*/

/** How far down before the button is worth showing — roughly one viewport. */
const REVEAL_PX = 600;

const BackToTop = ({ scrollRef }: { scrollRef: RefObject<HTMLElement | null> }) => {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Read on mount as well as on scroll: a route change can leave the region
    // already scrolled (a hash link lands mid-document), and a button that only
    // appears after the next scroll event would be missing exactly then.
    const read = () => setShown(el.scrollTop > REVEAL_PX);
    read();
    el.addEventListener('scroll', read, { passive: true });
    return () => el.removeEventListener('scroll', read);
  }, [scrollRef]);

  return (
    <AnimatePresence>
      {shown && (
        <motion.button
          type="button"
          onClick={() =>
            scrollRef.current?.scrollTo({
              top: 0,
              // Honour the OS setting rather than animating over it — the same
              // contract MotionConfig applies to the rest of the app.
              behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            })
          }
          aria-label="Back to top"
          className="fixed bottom-5 right-5 z-40 inline-flex h-9 w-9 items-center justify-center rounded-md border border-borderMuted bg-panelRaised/90 text-textSecondary shadow-overlay backdrop-blur-sm transition-colors hover:border-select/50 hover:text-textPrimary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select/60"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: DUR.quick, ease: EASE }}
        >
          <ArrowUp className="h-4 w-4" />
        </motion.button>
      )}
    </AnimatePresence>
  );
};

export default BackToTop;
