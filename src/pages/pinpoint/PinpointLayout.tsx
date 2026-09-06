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

    THE RAIL      nine desks named for questions (subnav.ts), with their
                  icons back — nine fit one row where thirteen did not.
    THE BANNER    the regime, the flip, the walls, the distances — the
                  read every desk opens with, in the regime's own colour.
    THE DESK      the outlet, on the section's one placement grammar
                  (components/pinpoint/Desk.tsx): a hero, a rail, benches.

  Each desk names its own purpose in its own header; the shell does not
  repeat it. The rail is the one thing not about the current desk, so it
  sits above the banner rather than inside it.
*/
const PinpointLayout = () => {
  const location = useLocation();
  const outlet = useOutlet();

  return (
    <>
      <SubNav ariaLabel="Pinpoint desks" items={GEX_SUBPAGES} />
      <RegimeBanner />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          /* The desk owns its first screen — the footer waits below it. */
          className="flex flex-col gap-4 flex-grow min-h-[calc(100vh-220px)]"
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
    </>
  );
};

export default PinpointLayout;
