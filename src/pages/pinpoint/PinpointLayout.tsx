import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useMarketData } from '../../context/MarketDataContext';
import TickerSearch from '../../components/ui/TickerSearch';
import SubNav from '../../components/ui/SubNav';
import DistanceUnitPicker from '../../components/ui/DistanceUnitPicker';
import FlipGaugeStrip from '../../components/gex/FlipGaugeStrip';
import { GEX_SUBPAGES } from './subnav';

/*
==================================================
  SLAYER TERMINAL - PINPOINT SHELL (PinpointLayout)

  ── THE 2026-09-05 REBUILD, AND WHAT WAS ACTUALLY WRONG ──────────────────

  Noah: "pinpoint it's very ugly rn i want total redesign." He is right,
  and screenshotting all twelve desks at 1440x900 made the reason precise
  rather than a matter of taste. Two things, and neither was the data.

  FIVE STACKED BANDS OF CHROME BEFORE ANY CONTENT. The tab rail, the
  ticker picker on its own line, the subtitle as naked text on ANOTHER
  line, the flip strip, and then the desk's own filter row. Measured: the
  first panel began 266px down a 900px window — 30% of the screen spent on
  furniture before a single number. Each band was full-width and carried
  its own visual weight, so nothing was subordinate to anything and the
  eye had no idea where to land.

  AND THE RAIL WRAPPED. Twelve tabs measured 1,416px against 1,392px of
  content — it missed by twenty-four pixels and put one orphaned tab on a
  second row under eleven. That was the first thing anyone saw on this
  section, and it read as a bug rather than a layout.

  ── WHAT REPLACED THEM ───────────────────────────────────────────────────

  The rail lost its icons (SubNav's ICON_LIMIT — twelve glyphs in a row
  stop distinguishing anything and start reading as texture) and now fits
  one row down to 1280.

  Everything else collapsed into ONE DESK HEADER CARD with two rows
  divided by a hairline, because they are two different kinds of fact and
  a reader treats them differently:

    WHAT AM I LOOKING AT — the symbol, the desk's name, its one-line
    purpose, and the ruler distances are measured in. Static; read once.

    WHAT IS THE MARKET DOING — the flip strip. Live; read every time.

  Putting them in one bordered card with a rule between says they belong
  to each other without pretending they are the same thing, and it is the
  difference between four boxes and one. Measured after: the first panel
  begins at 150px rather than 266px, and 116px of a 900px window came
  back to the desk.

  ── WHAT SURVIVED FROM THE OLD SHELL, DELIBERATELY ───────────────────────

  No PageHeader. The argument for deleting it holds and is worth keeping
  written down: the breadcrumb's last segment and the active pill were THE
  SAME WORD rendered twice, 90px apart (Noah, 2026-08-25: "i don't need to
  be told what page i'm on i know what i clicked"). The desk's name is in
  the card now because it anchors the subtitle beside it, at 13px rather
  than as an h1.

  The subtitle survived for the same reason it survived last time: "Vanna
  & Charm" names the desk, "where dealer exposure migrates as vol and time
  shift" says what it measures, and a pill cannot carry the second.

  PageHeader itself is untouched. Nine other pages render it and none of
  them asked for this.
==================================================
*/
const PinpointLayout = () => {
  const { activeTicker, changeTicker } = useMarketData();
  const location = useLocation();
  const outlet = useOutlet();

  const active = GEX_SUBPAGES.find(page => location.pathname.startsWith(page.path)) ?? GEX_SUBPAGES[0];

  return (
    <>
      {/* THE RAIL, alone on its line and full width. Navigation is the one
          thing here that is not about the current desk, so it sits above the
          card rather than inside it. */}
      <SubNav ariaLabel="Pinpoint subpages" items={GEX_SUBPAGES} />

      {/* THE DESK HEADER — identity over state, one hairline between. */}
      <div className="border border-borderSubtle bg-panel rounded-lg overflow-hidden">
        <div className="flex items-center gap-x-4 gap-y-2 flex-wrap px-3 py-2">
          <TickerSearch value={activeTicker} onChange={changeTicker} />
          <div className="min-w-0 flex-1">
            <h1 className="text-[13px] font-bold tracking-tight text-textPrimary leading-none">{active.label}</h1>
            <p className="mt-1 text-[11px] leading-snug text-textMuted">{active.subtitle}</p>
          </div>
          {/* The ruler belongs beside the name it applies to, not trailing a
              sentence about the flip — it governs every distance on the desk
              below, not just the one in the row underneath. */}
          <DistanceUnitPicker dense />
        </div>

        {/* P-4 — the flip, answered before any desk renders. In the SHELL
            rather than a page, because the directive's ask is "a persistent
            header strip on every Pinpoint tab" and the shell is the one thing
            every tab shares. `bare` because the card is already the box. */}
        <div className="border-t border-borderSubtle bg-inset/40 px-3 py-1.5">
          <FlipGaugeStrip bare />
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          /*
            THE DESK OWNS ITS FIRST SCREEN. flex-grow alone still left short
            pages sharing the viewport with the site footer — the shell's
            min-h-full pins the footer to the FLOOR of screen one, so a page
            using 60% of it read as half a page with a footer riding up.
            Terrain's answer is a viewport-height desk (h-[calc(100vh-3.5rem)]);
            this is the same contract minus this shell's own chrome, and the
            chrome shrank with the rebuild: top bar 56 + pt 20 + rail ~36 +
            header card ~78 + two 16px gaps ≈ 222 — near enough unchanged,
            because what the card saved it gave back to the desk below rather
            than to this constant. Kept at 220 so no height ever spawns a
            needless scrollbar.
          */
          className="flex flex-col gap-4 flex-grow min-h-[calc(100vh-220px)]"
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
    </>
  );
};

export default PinpointLayout;
