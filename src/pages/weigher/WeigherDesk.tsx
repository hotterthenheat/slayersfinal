/*
==================================================
  SLAYER TERMINAL - WEIGHER DESK (pages/weigher/WeigherDesk.tsx)

  The Weigher, rebuilt as a workstation (Noah,
  2026-08-25): chart, chain, scanner and the weigh
  station as movable glass cards on one desk, over
  a field that breathes the market's own color.
==================================================

  THE THREE CARDS, and the loop that makes them one page:
  the scanner picks the NAME → the chain picks the CONTRACT → the chart can
  show either the stock's tape or that contract's modeled premium → and the
  chain row OPENS, carrying what the contract costs and what it has to clear.
  Facts only, Term-explained; there is no order entry anywhere because we are
  not a broker (Noah, 2026-08-25: "forget everything related to buy/sell").

  This paragraph said FOUR cards, with a weigh station as the fourth, and it
  was already wrong in the file it shipped in: the station was removed the same
  day (`DEFAULT_LAYOUT` below records it — "remove the weigh station completely
  and let the chain fill that space") and its stats moved into the row
  drilldown. Corrected on the way in rather than carried across, because a
  header that names a card nobody can find is the first thing a reader trusts
  and the first thing that misleads them.

  THE MOOD FIELD. The page's background is a slow-drifting translucent wash
  keyed to the Nasdaq's session (QQQ, the name the twins already map to NDX):
  green day = green room, red day = red room, mixed tape = gray. This is the
  ONE place a background carries direction ink, and it is legal under the
  color law precisely because it IS price direction — with a ±0.15% flat band
  so noise cannot flicker the room, alphas low enough that every panel keeps
  its contrast, and the number it was read from printed in the corner so the
  color is never unexplained.
*/

import { useEffect, useMemo, useRef, useState } from 'react';
import RGL, { WidthProvider, type Layout } from 'react-grid-layout';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, ArrowUp, ChevronRight, GripHorizontal, Moon, Sun } from 'lucide-react';
import Simulator from '../../core/simulator';
import { useMarketData } from '../../context/MarketDataContext';
import { buildLevelsFor, buildPrints, fmtUsd, spotChangePct } from '../../data/gex';
import {
  DESK_DTES,
  SCAN_PRESETS,
  buildDeskChain,
  buildScan,
  deskExpiries,
  marketMood,
  marketSession,
  type DeskChain,
  type DeskContract,
  type ScanPreset,
} from '../../data/weigherDesk';
import StrikeChart, {
  DEFAULT_INDICATORS,
  DEFAULT_OVERLAYS,
  type ChartIndicators,
  type ChartOverlays,
  type ChartStyle,
} from '../../components/gex/StrikeChart';
import ChartToolbar from '../../components/gex/ChartToolbar';
import TickerQuickPick from '../../components/gex/TickerQuickPick';
import SpotPrice from '../../components/gex/SpotPrice';
import ContractPremiumPane from './ContractPremiumPane';
import Chip from '../../components/ui/Chip';
import Term from '../../components/ui/Term';
import { TIMEFRAMES, type Timeframe } from '../../data/timeframe';
import type { OptionRight } from '../../types/compass';

const Grid = WidthProvider(RGL);

const DESK_KEY = 'slayer_weigher_desk_v1';

/* Three cards since 2026-08-25 ("remove the weigh station completely and let
   the chain fill that space") — the chain owns the full right column, and its
   row drilldown carries the stats the station used to. A stored layout that
   still holds a weigh entry simply has it ignored. */
const DEFAULT_LAYOUT: Layout[] = [
  { i: 'chart', x: 0, y: 0, w: 7, h: 5, minW: 4, minH: 3 },
  { i: 'chain', x: 7, y: 0, w: 5, h: 8, minW: 4, minH: 3 },
  { i: 'scan', x: 0, y: 5, w: 7, h: 3, minW: 3, minH: 2 },
];

/** How far the chain reaches each side of spot. The book maintains ~30; the
    ladder synthesizes honest wings beyond it (see buildDeskChain). Sized to
    read like a FULL listed chain — Robinhood shows SPY roughly ±150 strikes,
    and Noah asked twice (2026-08-25: "WAYY more", then "add more strikes
    please"). The second ask was a migration bug wearing a feature-request
    coat: his stored depth (30) was still on the previous list, so it
    validated and never fell forward. No old value (10/15/20/30/50/80) is on
    THIS list, so every stored depth migrates to the new default. */
const DESK_DEPTHS = [100, 150, 250, 400] as const;

interface DeskState {
  ticker: string;
  dte: number;
  lens: 'stock' | 'contract';
  right: OptionRight;
  preset: ScanPreset;
  depth: number;
  layout: Layout[];
}

const CARD_KEYS = new Set<string>(['chart', 'chain', 'scan']);

function loadDesk(): DeskState {
  const def: DeskState = { ticker: 'SPY', dte: 2, lens: 'stock', right: 'C', preset: 'gainers', depth: 150, layout: DEFAULT_LAYOUT };
  try {
    const raw = localStorage.getItem(DESK_KEY);
    if (!raw) return def;
    const c = JSON.parse(raw) as Partial<DeskState>;
    const layout = Array.isArray(c.layout)
      ? DEFAULT_LAYOUT.map(d => {
          const hit = (c.layout as Layout[]).find(l => l && l.i === d.i);
          return hit && CARD_KEYS.has(hit.i)
            ? { ...d, x: hit.x ?? d.x, y: hit.y ?? d.y, w: hit.w ?? d.w, h: hit.h ?? d.h }
            : d;
        })
      : DEFAULT_LAYOUT;
    return {
      ticker: typeof c.ticker === 'string' && c.ticker ? c.ticker : def.ticker,
      dte: typeof c.dte === 'number' && (DESK_DTES as readonly number[]).includes(c.dte) ? c.dte : def.dte,
      lens: c.lens === 'contract' ? 'contract' : 'stock',
      right: c.right === 'P' ? 'P' : 'C',
      preset: c.preset === 'losers' || c.preset === 'voliv' ? c.preset : 'gainers',
      depth: typeof c.depth === 'number' && (DESK_DEPTHS as readonly number[]).includes(c.depth) ? c.depth : def.depth,
      layout,
    };
  } catch {
    return def;
  }
}

/* ---- the mood field --------------------------------------------------------
   Robinhood's wash (Noah, 2026-08-25: "red hugging the top and slowly
   dimming down as we get to the bottom") — one top-anchored gradient per
   tone, crossfaded over a second on a mood change. Layers never unmount;
   opacity is the whole switch. */
const MOOD_WASH: Record<'up' | 'down' | 'flat', string> = {
  up: 'linear-gradient(180deg, rgba(48,209,88,0.20) 0%, rgba(48,209,88,0.07) 32%, transparent 66%)',
  down: 'linear-gradient(180deg, rgba(255,59,48,0.22) 0%, rgba(255,59,48,0.08) 32%, transparent 66%)',
  flat: 'linear-gradient(180deg, rgba(163,163,163,0.07) 0%, rgba(163,163,163,0.03) 32%, transparent 66%)',
};

/* FIXED to the viewport, not the desk box (Noah, 2026-08-25: "it should
   cover the ENTIRE siding... and into the top section just right before the
   main task bar") - full width, from the 56px top bar down, behind every
   card and over the page header's black. Translucent, so nothing under it
   loses its ink. */
const MoodField = ({ mood }: { mood: 'up' | 'down' | 'flat' }) => (
  <div className="fixed left-0 right-0 top-14 bottom-0 overflow-hidden pointer-events-none" aria-hidden>
    {(Object.keys(MOOD_WASH) as ('up' | 'down' | 'flat')[]).map(tone => (
      <div
        key={tone}
        className="absolute inset-0 transition-opacity duration-1000 ease-out"
        style={{ opacity: mood === tone ? 1 : 0, background: MOOD_WASH[tone] }}
      />
    ))}
  </div>
);

/* ---- the glass card shell -------------------------------------------------- */
const DeskCard = ({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div
    className="h-full flex flex-col overflow-hidden rounded-md border border-white/[0.07] backdrop-blur-[2px]"
    style={{ background: 'rgba(13,14,17,0.55)' }}
  >
    {/* Controls live BESIDE the drag handle, never inside it — a mousedown
        on the handle starts a card drag and eats the click (the Pulse desk
        learned this in 2026-07; this desk re-learned it on day one). */}
    {/* min-h, not h: a crowded actions strip (the chain's) wraps, and the
        header must GROW with it — with a fixed height the wrapped chips
        slid under the table and its sticky header ate their clicks. */}
    <div className="shrink-0 flex items-center gap-2 pr-2.5 py-0.5 min-h-8 border-b border-white/[0.05]">
      {/* min-w keeps the grab zone alive when the actions strip is wide —
          the chain's chips once squeezed it to nothing and the card could
          not be dragged from its own header. */}
      <div className="desk-drag cursor-grab active:cursor-grabbing select-none flex items-center gap-2 pl-2.5 self-stretch min-w-[56px] flex-1">
        <GripHorizontal className="w-3.5 h-3.5 text-textMuted shrink-0" />
        {title && (
          <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-textPrimary truncate">{title}</span>
        )}
      </div>
      {/* NO overflow-x-auto here: overflow-x forces overflow-y clipping too,
          and it cut the chain's ticker dropdown to a 26px sliver below the
          header (Noah, 2026-08-25: "the chain ticker should have the same
          dropdown as the chart ticker" — it always was the same menu, just
          decapitated). Wide strips wrap instead; the header grows. */}
      {actions && <span className="ml-auto flex items-center gap-1.5 min-w-0">{actions}</span>}
    </div>
    <div className="flex-grow min-h-0">{children}</div>
  </div>
);

/* ---- the chain card -------------------------------------------------------- */
const fmtStrike = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));
const fmtCount = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v));

const ChainCard = ({
  chain,
  right,
  sel,
  onSelect,
  centerKey,
}: {
  chain: DeskChain;
  right: OptionRight;
  sel: number | null;
  onSelect: (strike: number) => void;
  /** Changes when the ladder itself changes (name, expiry, depth) — the cue
      to re-centre the scroll on the market. A moving spot alone must NOT
      re-centre; it would fight the user's own scrolling every tick. */
  centerKey: string;
}) => {
  const contracts = chain.rows.map(r => (right === 'C' ? r.call : r.put));
  // The spot divider slots between the strikes that bracket the market
  const dividerAfter = contracts.findIndex(
    (c, i) => c.strike <= chain.spot && (contracts[i + 1]?.strike ?? Infinity) > chain.spot
  );
  const ordered = [...contracts].reverse(); // high strikes at the top, like a price axis
  const dividerIdx = dividerAfter >= 0 ? contracts.length - 1 - dividerAfter : -1;

  /* A ±150 ladder is 301 rows — without a way home, scrolling it is a walk
     in the dark (Noah, 2026-08-25: "when im scrolling on the chain and i get
     too far down or up there should be some sort of button that allows me to
     go back to the current price"). The chain opens centred on the market,
     and once the spot row leaves the window a pill floats up with the live
     price and an arrow pointing back the way it went. */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const spotRef = useRef<HTMLTableRowElement | null>(null);
  const [away, setAway] = useState<'above' | 'below' | null>(null);

  const locate = () => {
    const box = scrollRef.current;
    const row = spotRef.current;
    if (!box || !row) return setAway(null);
    const mid = row.offsetTop + row.offsetHeight / 2;
    // The sticky header owns the top ~28px of the window — a row under it is
    // covered, not visible.
    if (mid < box.scrollTop + 40) setAway('above');
    else if (mid > box.scrollTop + box.clientHeight - 12) setAway('below');
    else setAway(null);
  };

  const centerOnSpot = (smooth: boolean) => {
    const box = scrollRef.current;
    const row = spotRef.current;
    if (!box || !row) return;
    const top = row.offsetTop - box.clientHeight / 2 + row.offsetHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    centerOnSpot(false);
    locate();
  }, [centerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative h-full">
    <div ref={scrollRef} onScroll={locate} className="h-full overflow-y-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10">
          <tr style={{ background: 'rgba(13,14,17,0.92)' }}>
            {(
              [
                ['Strike', null],
                ['Mark', 'Mark'],
                ['Delta', 'Delta'],
                ['IV', 'IV'],
                ['ITM odds', 'ITM odds'],
                ['Vol', 'Volume'],
                ['OI', 'Open interest'],
              ] as [string, string | null][]
            ).map(([label, term], i) => (
              <th
                key={label}
                className={`px-2 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-textSecondary border-b border-white/[0.06] whitespace-nowrap ${
                  i === 0 ? 'text-left' : 'text-right'
                }`}
              >
                {term ? <Term k={term as never}>{label}</Term> : label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map((c, i) => {
            const active = sel != null && Math.abs(c.strike - sel) < 1e-9;
            return (
              <FragmentRow
                key={c.strike}
                c={c}
                active={active}
                onSelect={onSelect}
                showDivider={i === dividerIdx}
                spot={chain.spot}
                rowRef={i === dividerIdx ? spotRef : undefined}
              />
            );
          })}
        </tbody>
      </table>
    </div>
      {away && (
        /* bottom-7, not lower: RGL's south resize handle owns the card's
           bottom-centre 20px and paints above everything inside the card
           (the backdrop-blur makes it one stacking context) — any lower and
           the handle eats the pill's clicks. */
        <button
          onClick={() => centerOnSpot(true)}
          title="Back to the market price"
          className="absolute bottom-7 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 font-mono text-[10px] font-semibold tnum text-textPrimary backdrop-blur-[3px] transition-colors hover:bg-white/[0.08]"
          style={{ background: 'rgba(13,14,17,0.85)' }}
        >
          {away === 'above' ? (
            <ArrowUp className="w-3 h-3 text-textSecondary" aria-hidden />
          ) : (
            <ArrowDown className="w-3 h-3 text-textSecondary" aria-hidden />
          )}
          ${chain.spot.toFixed(2)}
        </button>
      )}
    </div>
  );
};

/** One labeled figure in the drilldown - silver label, bright number. */
const StatCell = ({ label, value, term, ink }: { label: string; value: string; term?: string; ink?: string }) => (
  <span className="flex flex-col gap-0.5 min-w-0">
    <span className="font-mono text-[9px] uppercase tracking-widest text-[#C7D3E8] whitespace-nowrap">
      {term ? <Term k={term as never}>{label}</Term> : label}
    </span>
    <span className={`font-mono text-[11px] font-semibold tnum ${ink ?? 'text-textPrimary'}`}>{value}</span>
  </span>
);

/** One chain row, with the spot rule under it when it brackets the market and
    the full stats drilldown while it is the selected contract. */
const FragmentRow = ({
  c,
  active,
  onSelect,
  showDivider,
  spot,
  rowRef,
}: {
  c: DeskContract;
  active: boolean;
  onSelect: (strike: number) => void;
  showDivider: boolean;
  spot: number;
  /** Set on the row that brackets the market — the chain's scroll anchor. */
  rowRef?: React.Ref<HTMLTableRowElement>;
}) => (
  <>
    <tr
      ref={rowRef}
      onClick={() => onSelect(c.strike)}
      aria-selected={active}
      className={`cursor-pointer transition-colors ${active ? 'bg-select/[0.08]' : 'hover:bg-white/[0.03]'}`}
    >
      <td className={`px-2 py-1.5 font-mono text-[11px] font-semibold tnum ${active ? 'text-select' : 'text-textPrimary'}`}>
        {/* The drilldown's own affordance (Noah, 2026-08-25): the arrow says
            this row opens, turns while it is open, and turns back on the
            click that closes it. The whole row stays the click target. */}
        <span className="inline-flex items-center gap-1">
          <ChevronRight
            aria-hidden
            className={`w-3 h-3 shrink-0 transition-transform duration-200 ${
              active ? 'rotate-90 text-select' : 'text-textMuted'
            }`}
          />
          {fmtStrike(c.strike)}
        </span>
      </td>
      <td className="px-2 py-1.5 text-right font-mono text-[11px] font-bold tnum text-textPrimary">${c.mark.toFixed(2)}</td>
      <td className="px-2 py-1.5 text-right font-mono text-[10px] tnum text-textSecondary">{c.delta.toFixed(2)}</td>
      <td className="px-2 py-1.5 text-right font-mono text-[10px] tnum text-textSecondary">{c.iv.toFixed(0)}%</td>
      <td className="px-2 py-1.5 text-right font-mono text-[10px] tnum text-textSecondary">{c.itmOdds.toFixed(0)}%</td>
      <td className="px-2 py-1.5 text-right font-mono text-[10px] tnum text-textSecondary">{fmtCount(c.volume)}</td>
      <td className="px-2 py-1.5 text-right font-mono text-[10px] tnum text-textSecondary">{fmtCount(c.oi)}</td>
    </tr>
    {/* The drilldown OPENS rather than appears (Noah, 2026-08-25: "make the
        strike drop down a smooth transition") — the row's height eases from
        zero and back, padding riding inside the collapsing box so it folds
        flat. AnimatePresence keeps the row mounted through the close. */}
    <AnimatePresence initial={false}>
      {active && (
        <motion.tr key="drill" className="bg-select/[0.04]">
          <td colSpan={7} className="p-0">
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.25, 1, 0.5, 1] }}
              className="overflow-hidden"
            >
              <div className="px-3 py-2.5 border-b border-white/[0.05]">
          {/* The drilldown carries what the weigh station used to (Noah,
              2026-08-25): the full quote and the greeks, in the two-section
              grammar of the reference. Labels whisper silver; numbers never
              whisper. Greeks are magnitudes - no direction ink on them. */}
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-textSecondary">Stats</span>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-x-4 gap-y-2">
              <StatCell label="Bid" value={`$${c.bid.toFixed(2)}`} />
              <StatCell label="Mark" term="Mark" value={`$${c.mark.toFixed(2)}`} />
              <StatCell label="High" value={`$${c.high.toFixed(2)}`} />
              <StatCell label="Last trade" value={`$${c.last.toFixed(2)}`} />
              <StatCell label="Volume" term="Volume" value={fmtCount(c.volume)} />
              <StatCell label="Ask" value={`$${c.ask.toFixed(2)}`} />
              <StatCell label="Prev close" value={`$${c.prevClose.toFixed(2)}`} />
              <StatCell label="Low" value={`$${c.low.toFixed(2)}`} />
              <StatCell label="IV" term="IV" value={`${c.iv.toFixed(2)}%`} />
              <StatCell label="Open interest" term="Open interest" value={fmtCount(c.oi)} />
              <StatCell label="Breakeven" term="Breakeven" value={`$${c.breakeven.toFixed(2)}`} />
              <StatCell
                label="From spot"
                value={`${c.fromSpotPct >= 0 ? '+' : ''}${c.fromSpotPct.toFixed(1)}%`}
                ink={c.fromSpotPct >= 0 ? 'text-bull' : 'text-bear'}
              />
            </div>
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-textSecondary pt-1">The Greeks</span>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-x-4 gap-y-2">
              <StatCell label="Delta" term="Delta" value={c.delta.toFixed(4)} />
              <StatCell label="Gamma" term="Gamma" value={c.gamma.toFixed(4)} />
              <StatCell label="Theta / day" term="Theta" value={c.theta.toFixed(4)} />
              <StatCell label="Vega" term="Vega" value={c.vega.toFixed(4)} />
              <StatCell label="Rho" term="Rho" value={c.rho.toFixed(4)} />
            </div>
          </div>
              </div>
            </motion.div>
          </td>
        </motion.tr>
      )}
    </AnimatePresence>
    {showDivider && (
      <tr aria-hidden>
        <td colSpan={7} className="px-2 py-0.5">
          <span className="flex items-center gap-2 select-none">
            <span className="flex-1 h-px bg-textPrimary/25" />
            <span className="font-mono text-[9px] font-semibold tnum text-textPrimary bg-white/[0.06] rounded px-1.5 py-0.5">
              {spot.toFixed(2)}
            </span>
            <span className="flex-1 h-px bg-textPrimary/25" />
          </span>
        </td>
      </tr>
    )}
  </>
);

/* ---- the desk -------------------------------------------------------------- */
const WeigherDesk = () => {
  const { marketData } = useMarketData();
  // A monotonic tick per snapshot — the pattern every desk page uses
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setTick(t => t + 1);
  }, [marketData]);

  const [desk, setDesk] = useState<DeskState>(loadDesk);
  const [sel, setSel] = useState<number | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');
  const [overlays, setOverlays] = useState<ChartOverlays>(DEFAULT_OVERLAYS);
  const [chartStyle, setChartStyle] = useState<ChartStyle>('candles');
  const [indicators, setIndicators] = useState<ChartIndicators>(DEFAULT_INDICATORS);

  useEffect(() => {
    try {
      localStorage.setItem(DESK_KEY, JSON.stringify(desk));
    } catch {
      /* storage can be full or off — never fatal */
    }
  }, [desk]);

  const { ticker, dte, lens, right, preset, depth, layout } = desk;
  const patch = (p: Partial<DeskState>) => setDesk(d => ({ ...d, ...p }));

  const mood = useMemo(() => marketMood(), [tick]);
  const session = useMemo(() => marketSession(), [tick]);
  const chain = useMemo(() => buildDeskChain(ticker, dte, depth), [ticker, dte, depth, tick]);
  const scan = useMemo(() => buildScan(preset, ticker), [preset, ticker, tick]);
  const levels = useMemo(() => buildLevelsFor(ticker), [ticker, tick]);
  const changePct = useMemo(() => spotChangePct(ticker), [ticker, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const prints = useMemo(() => buildPrints(ticker, levels.spot), [ticker]); // eslint-disable-line react-hooks/exhaustive-deps
  const expiries = useMemo(() => deskExpiries(), []);

  const selected: DeskContract | null = useMemo(() => {
    if (sel == null) return null;
    const row = chain.rows.find(r => Math.abs(r.strike - sel) < 1e-9);
    return row ? (right === 'C' ? row.call : row.put) : null;
  }, [chain, sel, right]);

  const pickTicker = (t: string) => {
    if (t === ticker) return;
    Simulator.ensureTicker(t);
    setSel(null);
    patch({ ticker: t, lens: 'stock' });
  };

  const pickStrike = (strike: number) => {
    setSel(cur => {
      const next = cur != null && Math.abs(cur - strike) < 1e-9 ? null : strike;
      patch({ lens: next != null ? 'contract' : 'stock' });
      return next;
    });
  };

  const tYears = Math.max(chain.expiry.sessions, 0.5) / 252;

  /* Floating identity, defined once and rendered inside EACH lens's chart
     box — over the plot, below the toolbar (it was landing on the Tools
     row). */
  // The name leads the toolbar row (Noah, 2026-08-25: "right next to the
  // timeframes on the left, pushing the timeframes and tools down to the
  // right") - an inline group, nothing floating.
  const identity = (
    <span className="inline-flex items-center gap-2 select-none shrink-0">
      <TickerQuickPick ticker={ticker} onPick={pickTicker} />
      <SpotPrice value={Simulator.TICKERS[ticker]?.currentPrice ?? chain.spot} />
      <span className={`font-mono text-[11px] font-semibold tnum ${changePct >= 0 ? 'text-bull' : 'text-bear'}`}>
        {changePct >= 0 ? '\u25b2' : '\u25bc'} {changePct >= 0 ? '+' : ''}
        {changePct.toFixed(2)}%
      </span>
    </span>
  );

  return (
    <div className="relative">
      <MoodField mood={mood.mood} />

      {/* One thin line for the market itself — the session pill, dead
          centre like the reference. The name and its price moved INTO the
          chart card (Noah, 2026-08-25: "this should be within the chart
          like robinhood legend"). */}
      <div className="relative flex items-center justify-center pb-1.5 min-h-[26px]">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold tnum select-none ${
            session === 'overnight'
              ? 'border-[#7DD3FC]/30 bg-[#7DD3FC]/[0.13] text-[#7DD3FC]'
              : mood.mood === 'up'
                ? 'border-bull/30 bg-bull/[0.12] text-bull'
                : mood.mood === 'down'
                  ? 'border-bear/30 bg-bear/[0.12] text-bear'
                  : 'border-borderMuted bg-white/[0.05] text-textSecondary'
          }`}
          title={
            session === 'overnight'
              ? 'Overnight — New York is closed; the room follows the Nasdaq session (QQQ)'
              : 'Trading hours — the room follows the Nasdaq session (QQQ)'
          }
        >
          {session === 'overnight' ? (
            <Moon className="w-3 h-3" aria-hidden />
          ) : (
            <Sun className="w-3 h-3 text-warn" aria-hidden />
          )}
          NDX {mood.changePct >= 0 ? '+' : ''}
          {mood.changePct.toFixed(2)}%
        </span>
      </div>

      <Grid
        className="relative"
        layout={layout}
        cols={12}
        rowHeight={88}
        margin={[10, 10]}
        containerPadding={[0, 0]}
        draggableHandle=".desk-drag"
        /* Every edge and corner resizes - the SE-only default read as "not
           fully movable" (Noah, 2026-08-25). */
        resizeHandles={['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne']}
        onLayoutChange={(next: Layout[]) => patch({ layout: next })}
      >
        <div key="chart">
          <DeskCard
            actions={
              <span className="flex items-center gap-0.5">
                <Chip active={lens === 'stock'} onClick={() => patch({ lens: 'stock' })} title="The stock's own tape">
                  Stock
                </Chip>
                <Chip
                  active={lens === 'contract'}
                  onClick={() => selected && patch({ lens: 'contract' })}
                  title={selected ? 'The selected contract, modeled premium' : 'Pick a contract in the chain first'}
                >
                  Contract
                </Chip>
              </span>
            }
          >
            <div className="relative h-full">
            {lens === 'contract' && selected ? (
              <div className="h-full flex flex-col">
                {/* The contract keeps the reader's interval — same timeframe
                    state the stock lens uses, so flipping lenses never
                    changes the clock. */}
                <div className="shrink-0 px-2 py-1 flex items-center gap-2.5 flex-wrap">
                  {identity}
                  <span className="inline-flex items-center gap-0.5">
                  {TIMEFRAMES.map(t => (
                    <Chip key={t.value} active={timeframe === t.value} onClick={() => setTimeframe(t.value)} title={t.label}>
                      {t.label}
                    </Chip>
                  ))}
                  </span>
                </div>
                <div className="relative flex-1 min-h-0">
                  <ContractPremiumPane
                    ticker={ticker}
                    strike={selected.strike}
                    right={right}
                    tYears={tYears}
                    timeframe={timeframe}
                    revision={tick}
                  />
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col">
                {/* The SAME chart Terrain and Pulse speak (Noah, 2026-08-25):
                    full toolbar - style, indicators, theme, the blank Alerts -
                    behind the Tools door, since a desk card is Terrain-pane
                    narrow. */}
                <div className="shrink-0 px-2 py-1 flex items-center gap-2.5 flex-wrap">
                  {identity}
                  <ChartToolbar
                    minimal
                    candles
                    /*
                      PORTED ONTO THIS TREE'S TOOLBAR, and two props changed
                      because both were superseded here rather than missing.

                      `alerts` was a boolean that showed an Alerts button whose
                      menu was "an empty shell for now". This tree's Alerts menu
                      is real, and it is gated on being handed the symbol and
                      where the market is — which is what fixes the side a new
                      alert has to be crossed from. So the desk passes those
                      instead and gets a working menu rather than a shell.

                      `collapsed` stacked Indicators/Alerts/Candles/Overlays/
                      Theme behind one Tools trigger because "the space is too
                      small" in a desk card. `compact` answers the same problem
                      on this tree — the timeframes collapse to the current
                      interval and every dropdown trades its word for its icon —
                      and it is the one that is portalled, placement-clamped and
                      covered by the sweep. Two collapse modes for one job is
                      the duplication this codebase keeps deleting.
                    */
                    compact
                    alertTicker={ticker}
                    alertSpot={levels.spot}
                    timeframe={timeframe}
                    onTimeframe={setTimeframe}
                    overlays={overlays}
                    onOverlays={setOverlays}
                    chartStyle={chartStyle}
                    onChartStyle={setChartStyle}
                    indicators={indicators}
                    onIndicators={setIndicators}
                  />
                </div>
                <div className="flex-1 min-h-0">
                  <StrikeChart
                    ticker={ticker}
                    revision={tick}
                    levels={levels}
                    timeframe={timeframe}
                    overlays={overlays}
                    chartStyle={chartStyle}
                    indicators={indicators}
                    prints={prints}
                    height={180}
                    frameless
                  />
                </div>
              </div>
            )}
            </div>
          </DeskCard>
        </div>

        <div key="chain">
          <DeskCard
            title="Chain"
            actions={
              <span className="flex items-center gap-1.5 flex-wrap">
                {/* The chain's own door to the desk ticker (Noah, 2026-08-25:
                    "the chain should have its own ticker search") — same
                    state as the chart's picker, so either one repoints both. */}
                <TickerQuickPick ticker={ticker} onPick={pickTicker} squared />
                <span className="w-px h-3.5 bg-white/[0.08]" aria-hidden />
                <span className="flex items-center gap-0.5">
                  <Chip active={right === 'C'} onClick={() => patch({ right: 'C' })} title="Calls">
                    Calls
                  </Chip>
                  <Chip active={right === 'P'} onClick={() => patch({ right: 'P' })} title="Puts">
                    Puts
                  </Chip>
                </span>
                <span className="w-px h-3.5 bg-white/[0.08]" aria-hidden />
                <span className="flex items-center gap-0.5">
                  {expiries.map(e => (
                    <Chip
                      key={e.dte}
                      active={chain.expiry.dte === e.dte}
                      onClick={() => patch({ dte: e.dte })}
                      title={`${e.label} · ${e.weekday} · ${e.dte}d out`}
                    >
                      {e.dte === 0 ? '0d' : `${e.dte}d`}
                    </Chip>
                  ))}
                </span>
                <span className="w-px h-3.5 bg-white/[0.08]" aria-hidden />
                {/* How far the ladder reaches — the strike distance is a
                    choice, not a cap (Noah, 2026-08-25) */}
                <span className="flex items-center gap-0.5">
                  {DESK_DEPTHS.map(d => (
                    <Chip
                      key={d}
                      active={depth === d}
                      onClick={() => patch({ depth: d })}
                      title={`${d} strikes each side of the market`}
                    >
                      ±{d}
                    </Chip>
                  ))}
                </span>
                <span
                  className="font-mono text-[9px] tnum text-textMuted whitespace-nowrap"
                  title="The move the options are charging for by this expiry"
                >
                  ±{chain.expectedMovePct.toFixed(1)}%
                </span>
              </span>
            }
          >
            <ChainCard chain={chain} right={right} sel={sel} onSelect={pickStrike} centerKey={`${ticker}:${dte}:${depth}`} />
          </DeskCard>
        </div>

        <div key="scan">
          <DeskCard
            title="Scanner"
            actions={
              <span className="flex items-center gap-0.5">
                {SCAN_PRESETS.map(p => (
                  <Chip key={p.key} active={preset === p.key} onClick={() => patch({ preset: p.key })} title={p.hint}>
                    {p.label}
                  </Chip>
                ))}
              </span>
            }
          >
            <div className="h-full overflow-y-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr style={{ background: 'rgba(13,14,17,0.92)' }}>
                    {['Ticker', 'Last', 'Change', 'Opt vol', 'IV'].map((h, i) => (
                      <th
                        key={h}
                        className={`px-2.5 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-textSecondary border-b border-white/[0.06] ${
                          i === 0 ? 'text-left' : 'text-right'
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scan.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center font-mono text-[10px] uppercase tracking-widest text-textMuted">
                        {preset === 'losers' ? 'No names down today' : preset === 'gainers' ? 'No names up today' : 'Nothing on the tape'}
                      </td>
                    </tr>
                  )}
                  {scan.map(r => (
                    <tr
                      key={r.ticker}
                      onClick={() => pickTicker(r.ticker)}
                      className={`cursor-pointer transition-colors ${r.ticker === ticker ? 'bg-select/[0.06]' : 'hover:bg-white/[0.03]'}`}
                      title={`Put ${r.ticker} on the desk`}
                    >
                      <td className={`px-2.5 py-1.5 font-mono text-[11px] font-semibold ${r.ticker === ticker ? 'text-select' : 'text-textPrimary'}`}>
                        {r.ticker}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-[11px] tnum text-textPrimary">${r.last.toFixed(2)}</td>
                      <td className={`px-2.5 py-1.5 text-right font-mono text-[11px] font-semibold tnum ${r.changePct >= 0 ? 'text-bull' : 'text-bear'}`}>
                        {r.changePct >= 0 ? '+' : ''}
                        {r.changePct.toFixed(2)}%
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-[10px] tnum text-textSecondary">{fmtUsd(r.optVolume).replace('$', '')}</td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-[10px] tnum text-textSecondary">{r.ivPct.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DeskCard>
        </div>

      </Grid>
    </div>
  );
};

export default WeigherDesk;
