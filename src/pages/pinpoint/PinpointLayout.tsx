import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import Strip from '../../components/pinpoint/Strip';

/*
==================================================
  SLAYER TERMINAL - PINPOINT SHELL (pages/pinpoint/PinpointLayout.tsx)
==================================================

  The shell is two things: THE STRIP — the section's name, its nine desks,
  and the conditions every desk is read under, on one hairline — and THE
  DESK, the outlet, on the section's one grammar (components/pinpoint/
  Desk.tsx): a toolbar where the desk needs one, a hero with a rail, and
  benches under the hero.

  The route swap is a cross-fade with no travel. It used to slide 6px in
  and 4px out, which is a quarter second of every row re-rasterised at a
  fractional offset on its way home — Trace measured this frame by frame
  and removed it, and the same finding applies here. `MotionConfig` makes
  every animation in the section honour a reader's reduced-motion setting,
  which the route swap and the tab underline did not before.
*/
const PinpointLayout = () => {
  const location = useLocation();
  const outlet = useOutlet();

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-4 flex-grow">
        <Strip />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.14 }}
            /* The desk owns its first screen — the footer waits below it. */
            className="flex flex-col gap-6 flex-grow min-h-[calc(100vh-230px)]"
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
};

export default PinpointLayout;
