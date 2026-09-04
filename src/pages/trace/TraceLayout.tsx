import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useMarketData } from '../../context/MarketDataContext';
import TickerSearch from '../../components/ui/TickerSearch';
import SectionIdentity from '../../components/ui/SectionIdentity';
import { TRACE_SUBPAGES, type TraceSubpage } from './subnav';

/** Section shell for Trace — ONE strip of chrome: identity + tabs fused on a
    single row (Noah, 2026-08-30: "figure a way to move this... push the tape
    up even more" — the stacked header + tab box cost the tape a whole row;
    the taskbar verdict applies: a persistent utility bar is chrome, full
    width, fused, no container). Only the subpage body cross-fades. */

/* A HOVER CARD, NOT A WHISPER (Noah, 2026-08-30: "remove the entire
   animation for everything on the top including the trace one. i dont like
   it and its not smooth. instead just allow the hover on any of the
   subpages to open up a small translucent card that gives a brief
   description just like the top section does"). The card is the top bar's
   own menu material — glass, /80 panel, blur, the 160ms settle — carrying
   one row in the menu's rhythm: icon, name, sentence.

   It hangs off the STRIP, not the tab. The tab row scrolls sideways on a
   narrow screen, and a scroll box clips anything that pokes out of it, so
   the card is placed from the strip's left edge at the hovered tab's x
   (clamped so the far-right tabs never push it off screen). Keyboard focus
   opens it the same way — that is the tabs' focus indicator.

   THE CARD IS PART OF THE HOVER (Noah, 2026-08-30: "sometimes the user
   wants to hover from the word -> card but... the moment they move cursor
   away from the word the card disappears"). Leaving the word starts a short
   GRACE instead of closing; entering the card — or the next word — cancels
   it. The card's wrapper wears the gap under the strip as padding rather
   than margin, so the pointer never crosses dead space on the way down. */
interface Peek {
  page: TraceSubpage;
  left: number;
}
const CARD_W = 272;

const TraceLayout = () => {
  const { activeTicker, changeTicker } = useMarketData();
  const location = useLocation();
  const outlet = useOutlet();

  const navigate = useNavigate();
  const active = TRACE_SUBPAGES.find(page => location.pathname.startsWith(page.path)) ?? TRACE_SUBPAGES[0];

  const stripRef = useRef<HTMLDivElement>(null);
  const [peek, setPeek] = useState<Peek | null>(null);
  const peekAt = (page: TraceSubpage, tab: HTMLElement) => {
    const strip = stripRef.current?.getBoundingClientRect();
    if (!strip) return;
    const left = tab.getBoundingClientRect().left - strip.left;
    setPeek({ page, left: Math.max(0, Math.min(left, strip.width - CARD_W)) });
  };
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const closeSoon = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPeek(null), 160);
  };
  useEffect(() => cancelClose, []);

  // Full-bleed pages lose the shell's gutters — the strip keeps a slim inset
  // of its own so the words don't glue to the screen edge.
  const bleed = /^\/trace\/(net-flow|odte)/.test(location.pathname);

  // The Live Tape carries its own ticker/contract search, and the flow-book
  // pages sweep the whole universe — a single-ticker picker would mislead on
  // all of them. The remaining Trace pages are single-ticker.
  const noPicker =
    location.pathname.startsWith('/trace/live-tape') ||
    location.pathname.startsWith('/trace/screener') ||
    location.pathname.startsWith('/trace/net-flow') ||
    location.pathname.startsWith('/trace/footprints') ||
    location.pathname.startsWith('/trace/flow-alerts') ||
    location.pathname.startsWith('/trace/windows') ||
    location.pathname.startsWith('/trace/odte') ||
    location.pathname.startsWith('/trace/multi-leg');

  return (
    <>
      <div ref={stripRef} className={`relative flex items-center gap-4 border-b border-borderSubtle ${bleed ? 'px-3' : ''}`}>
        {/* The identity is just the word here — its sentence lives in the
            top bar's Discover menu, and the tabs carry their own cards. */}
        <div className="shrink-0 pb-1.5">
          <SectionIdentity path="/trace" whisper={false} />
        </div>
        {/* pb-px is load-bearing (Noah, 2026-08-30: "random scroll bar on the
            right side"). `overflow-x-auto` is here so the tabs can scroll on a
            narrow screen — but CSS will not let one axis scroll while the other
            stays `visible`, so overflow-y silently computes to `auto` too. The
            active tab's underline is drawn at `-bottom-px`, deliberately
            straddling the strip's border, which left the nav overflowing
            vertically by exactly 1px — and 1px is all it takes for Chrome to
            hang a vertical scrollbar on it. The padding gives that 1px a place
            to live inside the box. */}
        {/*
          TEN TABS DO NOT FIT A PHONE, AND SCROLLING THEM IS NOT THE ANSWER.

          The Trace family grew from two subpages to ten; the row measures
          989px, so at 390 and 768 the last four ran off the window. The
          `overflow-x-auto` that used to absorb that is exactly what this
          desk forbids — a tab you have to discover by swiping is a tab
          nobody finds, which is the rule the sweep enforces by asking the
          bar to FIT rather than to scroll.

          So the row is shown only where it fits, and below that the same
          registry becomes one control naming the current page. Same links,
          same order, no hidden ones.
        */}
        <nav aria-label="Trace subpages" className="hidden lg:flex items-center gap-1 min-w-0 pb-px">
          {TRACE_SUBPAGES.map(page => {
            const isActive = page.path === active.path;
            const TabIcon = page.icon;
            return (
              <Link
                key={page.path}
                to={page.path}
                aria-current={isActive ? 'page' : undefined}
                onMouseEnter={e => {
                  cancelClose();
                  peekAt(page, e.currentTarget);
                }}
                onMouseLeave={closeSoon}
                onFocus={e => {
                  if (!e.currentTarget.matches(':focus-visible')) return;
                  cancelClose();
                  peekAt(page, e.currentTarget);
                }}
                onBlur={closeSoon}
                // pb-[7px], not pb-2: the nav above spends 1px on padding to
                // house the underline's overhang, and this hands that pixel
                // back so the strip stays exactly as tall as Noah left it.
                // outline-none: the card is the focus indicator — the global
                // ring, clipped by the scroll box, was the stray bar beside a
                // tab that Noah kept seeing.
                className={`relative flex items-center gap-1.5 px-2 pb-[7px] pt-0.5 text-xs whitespace-nowrap outline-none transition-colors ${
                  isActive ? 'text-textPrimary font-medium' : 'text-textSecondary hover:text-textPrimary'
                }`}
              >
                <TabIcon className="w-3.5 h-3.5" />
                {page.label}
                {isActive && (
                  <motion.span
                    layoutId="trace-tab-underline"
                    className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-white"
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
        {/* The narrow-width equivalent: every subpage, one tap, nothing
            off-screen. A native select so it is reachable by keyboard and
            by a screen reader without rebuilding a listbox. */}
        <div className="lg:hidden flex items-center gap-1.5 min-w-0 pb-1.5">
          <active.icon className="w-3.5 h-3.5 shrink-0 text-textMuted" aria-hidden />
          <select
            aria-label="Trace subpages"
            value={active.path}
            onChange={e => navigate(e.target.value)}
            className="min-w-0 max-w-[52vw] bg-transparent font-mono text-xs text-textPrimary outline-none cursor-pointer"
          >
            {TRACE_SUBPAGES.map(page => (
              <option key={page.path} value={page.path} className="bg-panel text-textPrimary">
                {page.label}
              </option>
            ))}
          </select>
        </div>
        {!noPicker && (
          <div className="flex items-center gap-2 shrink-0 ml-auto pb-1.5">
            <TickerSearch value={activeTicker} onChange={changeTicker} />
          </div>
        )}
        <AnimatePresence>
          {peek && (
            <motion.div
              key={peek.page.path}
              role="tooltip"
              className="absolute top-full z-50 pt-1"
              style={{ left: peek.left, width: CARD_W }}
              onMouseEnter={cancelClose}
              onMouseLeave={closeSoon}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="border border-borderMuted bg-panel/80 backdrop-blur-xl backdrop-saturate-150 rounded-md shadow-2xl shadow-black/60 px-2.5 py-2 flex items-start gap-2.5">
                <peek.page.icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-textMuted" />
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-mono text-[12px] font-semibold leading-none text-textPrimary">{peek.page.label}</span>
                  <span className="text-[10px] text-textMuted leading-snug">{peek.page.subtitle}</span>
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* A CROSS-FADE, NO TRAVEL (Noah, 2026-08-30: "on open... things get
          out of place like the tables shrink then go back to normal spacing
          for a very brief moment"). Measured frame by frame: the old page
          left sliding UP 4px, the new one arrived 6px LOW and slid up — a
          quarter second of every row re-rasterised at fractional offsets on
          its way home, on pages whose rows, read strip and navigator differ
          in height. Opacity is the only thing that moves now; the exit is
          short so the wait between pages is a blink, not a blank. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          transition={{ duration: 0.14 }}
          className={`flex flex-col gap-2.5 ${bleed ? 'flex-1 min-h-0' : ''}`}
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
    </>
  );
};

export default TraceLayout;
