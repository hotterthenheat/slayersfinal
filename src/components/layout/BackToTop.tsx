import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import { DUR, EASE } from '../../lib/motion';

/*
==================================================
  SLAYER TERMINAL - BACK TO TOP (layout/BackToTop.tsx)
  One action back to the top of a long document — the Guide, the Concepts
  glossary, a 240-row board.

  This was written when the terminal scrolled inside <main> rather than the
  window, which put the scroll somewhere none of the browser's own affordances
  could reach. The document owns the scroll now, so Home and End work on their
  own and this is a convenience rather than a repair — but a convenience worth
  keeping on a desk whose boards run thousands of pixels.

  It reads the window for the same reason: a control that scrolled a region the
  page no longer has would do nothing at all.
==================================================
*/

/** How far down before the button is worth showing — roughly one viewport. */
const REVEAL_PX = 600;

const BackToTop = () => {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // Read on mount as well as on scroll: a route change can leave the document
    // already scrolled (a hash link lands mid-page), and a button that only
    // appears after the next scroll event would be missing exactly then.
    const read = () => setShown(window.scrollY > REVEAL_PX);
    read();
    window.addEventListener('scroll', read, { passive: true });
    return () => window.removeEventListener('scroll', read);
  }, []);

  return (
    <AnimatePresence>
      {shown && (
        <motion.button
          type="button"
          onClick={() =>
            window.scrollTo({
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
