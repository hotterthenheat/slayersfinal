import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import SubNav from '../../components/ui/SubNav';
import RegimeBanner from '../../components/pinpoint/RegimeBanner';
import { GEX_SUBPAGES } from './subnav';

/*
==================================================
  SLAYER TERMINAL - PINPOINT SHELL (pages/pinpoint/PinpointLayout.tsx)
  Rebuilt from zero, 2026-09-06.
==================================================

  Noah: "i do not want you to rebuild the current pages i want you to
  restart from 0 on that page because some of the things i have i cant
  understand some of it and the placements are super bad."

  The shell is three things and nothing else:

    THE RAIL      nine desks in five groups, named for questions
                  (subnav.ts) — the reading order of the product.
    THE STRIP     the conditions every desk is read under: which name,
                  where it is, which regime that puts you in, and what
                  volatility is doing. Not the levels — those belong to
                  Levels, and repeating them here put the same two numbers
                  in front of a reader nine times.
    THE DESK      the outlet, on the section's one placement grammar
                  (components/pinpoint/Desk.tsx): a hero, a rail, benches.

  Each desk names its own purpose in its own header; the shell does not
  repeat it. The rail is the one thing not about the current desk, so it
  sits above the strip rather than inside it.
*/
const PinpointLayout = () => {
  const location = useLocation();
  const outlet = useOutlet();

  return (
    <div className="flex flex-col gap-5 flex-grow">
      <SubNav ariaLabel="Pinpoint desks" items={GEX_SUBPAGES} />
      <RegimeBanner />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          /* The desk owns its first screen — the footer waits below it.
             gap-7 between sections rather than gap-4: with the card borders
             gone, SPACE is what separates one section from the next, so it
             has to be large enough to do that job alone. */
          className="flex flex-col gap-7 flex-grow min-h-[calc(100vh-230px)]"
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default PinpointLayout;
