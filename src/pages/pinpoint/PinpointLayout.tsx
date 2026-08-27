import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useMarketData } from '../../context/MarketDataContext';
import TickerSearch from '../../components/ui/TickerSearch';
import SubNav from '../../components/ui/SubNav';
import { GEX_SUBPAGES } from './subnav';

/*
==================================================
  SLAYER TERMINAL - PINPOINT SHELL (PinpointLayout)

  Terrain's grammar, applied here: STRIP WHAT
  NARRATES, KEEP WHAT ACTS.

  This shell used to open with a PageHeader — a
  breadcrumb reading TERMINAL / PINPOINT / VANNA &
  CHARM, an h1 reading "Pinpoint", and a one-line
  subtitle — and then a SubNav under it. Measured at
  1440x900 on /pinpoint/vanna-charm: 212px between
  the top bar and the first panel heading, 24% of the
  window, before a single number.

  Terrain deleted exactly this and said why (Noah,
  2026-08-25: "i don't need to be told what page i'm
  on i know what i clicked"). He is right, and the
  argument is stronger here than it was there,
  because the breadcrumb's last segment and the
  active subnav pill are THE SAME WORD rendered
  twice, 90px apart — "Vanna & Charm" as a crumb and
  "Vanna & Charm" as the pill you just pressed.

  What is left is the two things that DO something:
  which desk you are on, and which name it is
  pointed at. They share one row, because they are
  one thought — "this view, of this symbol".

  The subtitle SURVIVES, as one muted line rather
  than the third element of a heading block. It is
  the only part of the old header that said anything
  a pill cannot: "Vanna & Charm" names the desk,
  "where dealer exposure migrates as vol and time
  shift" says what it measures. Two words are a
  label; that sentence is the desk's purpose, and it
  costs 16px.

  PageHeader itself is untouched. Nine other pages
  render it and none of them asked for this.
==================================================
*/
const PinpointLayout = () => {
  const { activeTicker, changeTicker } = useMarketData();
  const location = useLocation();
  const outlet = useOutlet();

  const active = GEX_SUBPAGES.find(page => location.pathname.startsWith(page.path)) ?? GEX_SUBPAGES[0];

  return (
    <>
      {/* One row: the desk, and the name it is pointed at. `flex-wrap` so a
          narrow window stacks them instead of pushing the picker off the
          edge — the subnav is 3 pills and the picker is ~130px, which fits
          on one line from about 560px up. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SubNav ariaLabel="Pinpoint subpages" items={GEX_SUBPAGES} />
        <TickerSearch value={activeTicker} onChange={changeTicker} />
      </div>

      {/* The active desk's own sentence, for a reader meeting it for the first
          time — one muted line rather than a heading block. It says what THIS
          desk measures, which the pill's two words cannot. */}
      <p className="-mt-1 text-[11px] leading-snug text-textMuted">{active.subtitle}</p>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-4"
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
    </>
  );
};

export default PinpointLayout;
