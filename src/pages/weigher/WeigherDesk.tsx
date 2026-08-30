/*
==================================================
  SLAYER TERMINAL - WEIGHER DESK (pages/weigher/WeigherDesk.tsx)

  The Weigher, rebuilt as a workstation (Noah,
  2026-08-25): chart, chain, scanner and the weigh
  station as movable glass cards on one desk, over
  a field that breathes the market's own color.
==================================================

  THE FOUR CARDS, and the loop that makes them one page:
  the scanner picks the NAME → the chain picks the CONTRACT → the chart can
  show either the stock's tape or that contract's modeled premium → the weigh
  station says what the contract costs and what it has to clear. Facts only,
  Term-explained; there is no order entry anywhere because we are not a
  broker (Noah, 2026-08-25: "forget everything related to buy/sell").

  THE MOOD FIELD. The page's background is a slow-drifting translucent wash
  keyed to the Nasdaq's session (QQQ, the name the twins already map to NDX):
  green day = green room, red day = red room, mixed tape = gray. This is the
  ONE place a background carries direction ink, and it is legal under the
  color law precisely because it IS price direction — with a ±0.15% flat band
  so noise cannot flicker the room, alphas low enough that every panel keeps
  its contrast, and the number it was read from printed in the corner so the
  color is never unexplained.
*/

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RGL, { WidthProvider, type Layout } from 'react-grid-layout';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, ChevronRight, Columns3, GripHorizontal, Maximize2, Minimize2, Moon, Sun } from 'lucide-react';
import Simulator from '../../core/simulator';
import { useMarketData } from '../../context/MarketDataContext';
import { buildLevelsFor, buildPrints, fmtUsd, spotChangePct } from '../../data/gex';
import { estimatePremium } from '../../data/compass';
import {
  DESK_DTES,
  buildDeskChain,
  contractIvFor,
  deskExpiries,
  marketMood,
  marketSession,
  type DeskChain,
  type DeskContract,
} from '../../data/weigherDesk';
import { SCREENERS, runScreener, type ScreenerKey } from '../../data/screeners';
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
import { useFadeClose } from '../../components/ui/useFadeClose';
import Term from '../../components/ui/Term';
import { TIMEFRAMES, type Timeframe } from '../../data/timeframe';
import type { OptionRight } from '../../types/compass';

const Grid = WidthProvider(RGL);

/* v2 resets every stored desk (Noah, 2026-08-26: "reset my view to be the
   even spacing to begin with") — the layout gained a fourth card and hard
   expanding limits, and an old arrangement would fight both. */
const DESK_KEY = 'slayer_weigher_desk_v2';

/** The heavy tables' sweep cadence — the chain and scanner rebuild on this
    clock and hold still in between, the Pulse contract. Charts and prices
    stay on the 1s tick. */
const SCAN_MS = 3000;

/* FOUR cards, an even 2×2 to begin with (Noah, 2026-08-26: "reset my view
   to be the even spacing"): tape and ladder up top, scanner and the strike's
   weigh-up below. maxH is the Pulse rule — every card has a height past
   which it is only empty surface, so the resize stops there. */
const DEFAULT_LAYOUT: Layout[] = [
  { i: 'chart', x: 0, y: 0, w: 6, h: 5, minW: 4, minH: 3, maxH: 8 },
  { i: 'chain', x: 6, y: 0, w: 6, h: 5, minW: 4, minH: 3, maxH: 10 },
  { i: 'scan', x: 0, y: 5, w: 6, h: 5, minW: 3, minH: 2, maxH: 8 },
  { i: 'info', x: 6, y: 5, w: 6, h: 5, minW: 3, minH: 2, maxH: 8 },
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
  preset: ScreenerKey;
  depth: number;
  /** Which catalog columns the chain shows, in catalog order */
  cols: string[];
  layout: Layout[];
}

const CARD_KEYS = new Set<string>(['chart', 'chain', 'scan', 'info']);

function loadDesk(): DeskState {
  const def: DeskState = { ticker: 'SPY', dte: 2, lens: 'stock', right: 'C', preset: 'gainers', depth: 150, cols: DEFAULT_COLS, layout: DEFAULT_LAYOUT };
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
    // Stored columns keep only keys the catalog still knows, in its order;
    // an empty or unknown set falls back to the default chain.
    const storedCols = Array.isArray(c.cols) ? (c.cols as string[]) : null;
    const cols = storedCols ? CHAIN_COLUMNS.map(x => x.key).filter(k => storedCols.includes(k)) : [];
    return {
      ticker: typeof c.ticker === 'string' && c.ticker ? c.ticker : def.ticker,
      dte: typeof c.dte === 'number' && (DESK_DTES as readonly number[]).includes(c.dte) ? c.dte : def.dte,
      lens: c.lens === 'contract' ? 'contract' : 'stock',
      right: c.right === 'P' ? 'P' : 'C',
      /* A stored preset is now a ScreenerKey. 'voliv' was the old desk-only
         board (options volume x IV); its nearest survivor is the volume
         board, so a reader who left the desk on it lands somewhere that
         still means what they picked rather than being reset to gainers. */
      preset:
        (c.preset as string) === 'voliv'
          ? 'optionsVolume'
          : SCREENERS.some(x => x.key === c.preset)
            ? (c.preset as ScreenerKey)
            : 'gainers',
      depth: typeof c.depth === 'number' && (DESK_DEPTHS as readonly number[]).includes(c.depth) ? c.depth : def.depth,
      cols: cols.length ? cols : [...def.cols],
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
/* The tint never fully dies (Noah, 2026-08-26: "both of the bottom cards
   need to be see through like the top ones") — the cards are all the same
   glass; what differed was the wash ENDING two-thirds down, leaving the
   lower row over plain black with nothing to be see-through TO. A faint
   floor carries the room's color the whole way. */
const MOOD_WASH: Record<'up' | 'down' | 'flat', string> = {
  up: 'linear-gradient(180deg, rgba(48,209,88,0.20) 0%, rgba(48,209,88,0.07) 34%, rgba(48,209,88,0.03) 100%)',
  down: 'linear-gradient(180deg, rgba(255,59,48,0.22) 0%, rgba(255,59,48,0.08) 34%, rgba(255,59,48,0.035) 100%)',
  flat: 'linear-gradient(180deg, rgba(163,163,163,0.07) 0%, rgba(163,163,163,0.03) 34%, rgba(163,163,163,0.015) 100%)',
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
      {/* The grip takes its NATURAL width and keeps it — flex-1 here let the
          chain's loaded strip squeeze the title down to "C…". The actions
          take the remainder and wrap; the header grows to fit them. */}
      <div className="desk-drag cursor-grab active:cursor-grabbing select-none flex items-center gap-2 pl-2.5 self-stretch shrink-0">
        <GripHorizontal className="w-3.5 h-3.5 text-textMuted shrink-0" />
        {title && (
          <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-textPrimary whitespace-nowrap">{title}</span>
        )}
      </div>
      {/* NO overflow-x-auto here: overflow-x forces overflow-y clipping too,
          and it cut the chain's ticker dropdown to a 26px sliver below the
          header (Noah, 2026-08-25: "the chain ticker should have the same
          dropdown as the chart ticker" — it always was the same menu, just
          decapitated). Wide strips wrap instead; the header grows. */}
      {actions && (
        <span className="ml-auto flex flex-1 flex-wrap items-center justify-end gap-1.5 min-w-0">{actions}</span>
      )}
    </div>
    <div className="flex-grow min-h-0">{children}</div>
  </div>
);

/* ---- the chain card -------------------------------------------------------- */
const fmtStrike = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));
const fmtCount = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v));

/* ---- the chain's column catalog -------------------------------------------
   Every face of the contract the reference offers that is a FACT (Noah,
   2026-08-26, the customize-columns screenshots). The four return-on-…
   entries stayed out on purpose: a projected yield on a position is strategy
   advice wearing a stat's clothes, and we are not a broker. Order here IS
   column order; the menu speaks the reference's wording, the header speaks
   compact, and every jargon head carries its Term. */
export interface ChainCol {
  key: string;
  /** The menu's wording - the reference's own names */
  label: string;
  /** The column header's compact wording */
  head: string;
  term?: string;
  render: (c: DeskContract) => { text: string; ink?: string; bold?: boolean };
}

const money = (v: number) => `$${v.toFixed(2)}`;
const signedPct = (v: number, dp = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(dp)}%`;

export const CHAIN_COLUMNS: ChainCol[] = [
  { key: 'mark', label: 'Mark', head: 'Mark', term: 'Mark', render: c => ({ text: money(c.mark), bold: true }) },
  { key: 'bid', label: 'Bid', head: 'Bid', render: c => ({ text: money(c.bid) }) },
  { key: 'ask', label: 'Ask', head: 'Ask', render: c => ({ text: money(c.ask) }) },
  { key: 'bidSize', label: 'Bid size', head: 'Bid size', render: c => ({ text: fmtCount(c.bidSize) }) },
  { key: 'askSize', label: 'Ask size', head: 'Ask size', render: c => ({ text: fmtCount(c.askSize) }) },
  { key: 'last', label: 'Last', head: 'Last', render: c => ({ text: money(c.last) }) },
  {
    key: 'netChange',
    label: 'Net change',
    head: 'Net chg',
    render: c => ({
      text: `${c.netChange >= 0 ? '+' : '-'}$${Math.abs(c.netChange).toFixed(2)}`,
      ink: c.netChange >= 0 ? 'text-bull' : 'text-bear',
    }),
  },
  {
    key: 'changePct',
    label: 'Change %',
    head: 'Chg %',
    render: c => ({ text: signedPct(c.netChangePct), ink: c.netChangePct >= 0 ? 'text-bull' : 'text-bear' }),
  },
  { key: 'high', label: 'High', head: 'High', render: c => ({ text: money(c.high) }) },
  { key: 'low', label: 'Low', head: 'Low', render: c => ({ text: money(c.low) }) },
  { key: 'prevClose', label: 'Prev close', head: 'Prev close', render: c => ({ text: money(c.prevClose) }) },
  { key: 'delta', label: 'Delta', head: 'Delta', term: 'Delta', render: c => ({ text: c.delta.toFixed(2) }) },
  { key: 'gamma', label: 'Gamma', head: 'Gamma', term: 'Gamma', render: c => ({ text: c.gamma.toFixed(4) }) },
  { key: 'theta', label: 'Theta', head: 'Theta', term: 'Theta', render: c => ({ text: c.theta.toFixed(4) }) },
  { key: 'vega', label: 'Vega', head: 'Vega', term: 'Vega', render: c => ({ text: c.vega.toFixed(4) }) },
  { key: 'rho', label: 'Rho', head: 'Rho', term: 'Rho', render: c => ({ text: c.rho.toFixed(4) }) },
  { key: 'iv', label: 'IV', head: 'IV', term: 'IV', render: c => ({ text: `${c.iv.toFixed(0)}%` }) },
  { key: 'itm', label: 'Probability ITM', head: 'ITM odds', term: 'ITM odds', render: c => ({ text: `${c.itmOdds.toFixed(0)}%` }) },
  { key: 'otm', label: 'Probability OTM', head: 'OTM odds', term: 'OTM odds', render: c => ({ text: `${(100 - c.itmOdds).toFixed(0)}%` }) },
  {
    key: 'touch',
    label: 'Probability of touching',
    head: 'Touch odds',
    term: 'Touch odds',
    render: c => ({ text: `${c.touchOdds.toFixed(0)}%` }),
  },
  {
    key: 'copLong',
    label: 'Chance of profit (long)',
    head: 'Profit odds L',
    term: 'Profit odds',
    render: c => ({ text: `${c.profitOddsLong.toFixed(0)}%` }),
  },
  {
    key: 'copShort',
    label: 'Chance of profit (short)',
    head: 'Profit odds S',
    term: 'Profit odds',
    render: c => ({ text: `${c.profitOddsShort.toFixed(0)}%` }),
  },
  { key: 'breakeven', label: 'Breakeven', head: 'Breakeven', term: 'Breakeven', render: c => ({ text: money(c.breakeven) }) },
  { key: 'toBreakeven', label: 'To breakeven', head: 'To B/E', term: 'To breakeven', render: c => ({ text: signedPct(c.toBreakevenPct) }) },
  { key: 'intrinsic', label: 'Intrinsic value', head: 'Intrinsic', term: 'Intrinsic value', render: c => ({ text: money(c.intrinsic) }) },
  { key: 'extrinsic', label: 'Extrinsic value', head: 'Extrinsic', term: 'Extrinsic value', render: c => ({ text: money(c.extrinsic) }) },
  { key: 'vol', label: 'Volume', head: 'Vol', term: 'Volume', render: c => ({ text: fmtCount(c.volume) }) },
  { key: 'oi', label: 'Open interest', head: 'OI', term: 'Open interest', render: c => ({ text: fmtCount(c.oi) }) },
];

/** The chain as it has always opened. */
export const DEFAULT_COLS = ['mark', 'delta', 'iv', 'itm', 'vol', 'oi'];

/* The customize-columns door (Noah, 2026-08-26) - the Trace ColumnChooser
   grammar on the desk: same checkbox rows, same header verbs. Toggling keeps
   catalog order, so columns can never end up shuffled. */
const ColumnsDoor = ({ cols, onChange }: { cols: string[]; onChange: (next: string[]) => void }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    // Window-capture Escape, the TickerQuickPick contract - the innermost
    // open thing gets the key and nothing behind it sees it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const toggle = (key: string) =>
    onChange(
      cols.includes(key)
        ? cols.filter(k => k !== key)
        : CHAIN_COLUMNS.map(c => c.key).filter(k => cols.includes(k) || k === key)
    );

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Choose chain columns"
        aria-expanded={open}
        className={`inline-flex items-center gap-1 px-1.5 py-1 rounded font-mono text-[10px] transition-colors ${
          open ? 'bg-white/[0.06] text-textPrimary' : 'text-textMuted hover:text-textPrimary hover:bg-white/[0.04]'
        }`}
      >
        <Columns3 className="w-3.5 h-3.5" />
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 w-[232px] border border-borderMuted bg-panel rounded-md shadow-2xl shadow-black/60 overflow-hidden animate-slide-in">
          <div className="flex items-center justify-between px-3 py-2 border-b border-borderSubtle">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-textPrimary">Chain columns</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onChange(CHAIN_COLUMNS.map(c => c.key))}
                className="font-mono text-[9px] uppercase tracking-wider text-textSecondary hover:text-select transition-colors"
              >
                All
              </button>
              <span className="text-borderMuted">·</span>
              <button
                onClick={() => onChange([...DEFAULT_COLS])}
                className="font-mono text-[9px] uppercase tracking-wider text-textSecondary hover:text-select transition-colors"
              >
                Default
              </button>
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto py-1 px-1">
            {CHAIN_COLUMNS.map(c => {
              const checked = cols.includes(c.key);
              return (
                <button
                  key={c.key}
                  onClick={() => toggle(c.key)}
                  className="w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded hover:bg-white/[0.03] transition-colors"
                >
                  <span
                    className={`inline-flex w-3.5 h-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
                      checked ? 'bg-select border-select' : 'border-borderMuted'
                    }`}
                  >
                    {checked && <Check className="w-2.5 h-2.5 text-[#0a0a0a]" />}
                  </span>
                  <span className={`font-mono text-[11px] text-left ${checked ? 'text-textPrimary' : 'text-textSecondary'}`}>
                    {c.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/* memo, deliberately: this is the desk's whale — 301 rows by up to 29
   columns. It re-renders when its OWN facts change (a chain sweep, a
   selection, a column pick) and sits out everything else: light ticks,
   drag frames, sash steps. The Pulse widgets live by the same rule. */
export const ChainCard = memo(function ChainCard({
  chain,
  right,
  sel,
  onSelect,
  cols,
  centerKey,
  inlineDrill,
}: {
  chain: DeskChain;
  right: OptionRight;
  sel: number | null;
  onSelect: (strike: number, clicks?: number) => void;
  cols: ChainCol[];
  /** Changes when the ladder itself changes (name, expiry, depth) — the cue
      to re-centre the scroll on the market. A moving spot alone must NOT
      re-centre; it would fight the user's own scrolling every tick. */
  centerKey: string;
  /** Pulse's grammar (Noah, 2026-08-26: "it drops down just right under
      that strike and not all the way at the bottom") — the selected row
      unfolds its weigh-up inline, Robinhood-style. The desk page leaves
      this off; its weigh-up owns the bottom-right card. */
  inlineDrill?: boolean;
}) {
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
    {/* overflow-auto, both axes (Noah, 2026-08-26: "if the width gets too
        small for all the rows then there should be a horizontal scroll") -
        nowrap cells give the table a real minimum width, and past it the
        card scrolls sideways instead of crushing the numbers. */}
    <div ref={scrollRef} onScroll={locate} className="h-full overflow-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10">
          <tr style={{ background: 'rgba(13,14,17,0.92)' }}>
            <th className="px-2 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-textSecondary border-b border-white/[0.06] whitespace-nowrap text-left">
              Strike
            </th>
            {cols.map(col => (
              <th
                key={col.key}
                className="px-2 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-textSecondary border-b border-white/[0.06] whitespace-nowrap text-right"
              >
                {col.term ? <Term k={col.term as never}>{col.head}</Term> : col.head}
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
                cols={cols}
                inlineDrill={inlineDrill}
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
});

/** One labeled figure in the drilldown - silver label, bright number. */
const StatCell = ({ label, value, term, ink }: { label: string; value: string; term?: string; ink?: string }) => (
  <span className="flex flex-col gap-0.5 min-w-0">
    <span className="font-mono text-[9px] uppercase tracking-widest text-[#C7D3E8] whitespace-nowrap">
      {term ? <Term k={term as never}>{label}</Term> : label}
    </span>
    <span className={`font-mono text-[11px] font-semibold tnum ${ink ?? 'text-textPrimary'}`}>{value}</span>
  </span>
);

/** The weigh-up's two sections — Stats and The Greeks — shared verbatim by
    the desk's Strike card and Pulse's inline drilldown, so the two surfaces
    can never drift apart. A fragment on purpose: hosts that SPREAD the
    sections (justify-evenly) need them as direct children. */
const WeighGrids = ({ c }: { c: DeskContract }) => (
  <>
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-textSecondary">Stats</span>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-x-4 gap-y-2.5">
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
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-textSecondary">The Greeks</span>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-x-4 gap-y-2.5">
            <StatCell label="Delta" term="Delta" value={c.delta.toFixed(4)} />
            <StatCell label="Gamma" term="Gamma" value={c.gamma.toFixed(4)} />
            <StatCell label="Theta / day" term="Theta" value={c.theta.toFixed(4)} />
            <StatCell label="Vega" term="Vega" value={c.vega.toFixed(4)} />
            <StatCell label="Rho" term="Rho" value={c.rho.toFixed(4)} />
          </div>
        </div>
  </>
);

/* The strike's weigh-up gets its OWN quadrant instead of unfolding inside
   the chain (Noah, 2026-08-26: "to differ from robinhood legend... the empty
   section in the bottom right be the information for the strike you click").
   Every pick lands on a soft fade - keyed remount, the Compass mode-swap
   recipe - and the content spreads to FILL the card rather than huddling at
   the top. Facts only; the greeks stay magnitudes with no direction ink. */
export const StrikeCard = ({ c, contractKey }: { c: DeskContract | null; contractKey: string }) => {
  if (!c) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-1.5 select-none animate-soft-in">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-textMuted">
          Nothing on the scale
        </span>
        <span className="font-mono text-[9px] text-textMuted">
          Click a strike in the chain and its full weigh-up lands here
        </span>
      </div>
    );
  }
  return (
    <div key={contractKey} className="h-full overflow-y-auto animate-soft-in">
      <div className="min-h-full flex flex-col justify-evenly gap-3 px-3.5 py-3">
        <WeighGrids c={c} />
      </div>
    </div>
  );
};

/** One chain row, with the spot rule under it when it brackets the market.
    Clicking it puts the strike ON THE SCALE - the Strike card carries the
    weigh-up now, so the ladder itself stays clean. */
const FragmentRow = ({
  c,
  active,
  onSelect,
  showDivider,
  spot,
  cols,
  inlineDrill,
  rowRef,
}: {
  c: DeskContract;
  active: boolean;
  onSelect: (strike: number, clicks?: number) => void;
  showDivider: boolean;
  spot: number;
  cols: ChainCol[];
  inlineDrill?: boolean;
  /** Set on the row that brackets the market — the chain's scroll anchor. */
  rowRef?: React.Ref<HTMLTableRowElement>;
}) => (
  <>
    <tr
      ref={rowRef}
      /* e.detail counts the clicks — the browser fires click twice on a
         double, so the second arrives as detail 2 and upgrades to the chart
         without a deselect flicker in between. select-none keeps the double
         click from highlighting the row's text. */
      onClick={e => onSelect(c.strike, e.detail)}
      aria-selected={active}
      title="Click: weigh it below · double-click: chart it"
      className={`cursor-pointer select-none transition-colors ${active ? 'bg-select/[0.08]' : 'hover:bg-white/[0.03]'}`}
    >
      <td className={`px-2 py-1.5 font-mono text-[11px] font-semibold tnum whitespace-nowrap ${active ? 'text-select' : 'text-textPrimary'}`}>
        {/* The arrow marks the strike on the scale - it turns while this
            row's weigh-up is on the Strike card and turns back on the click
            that clears it. The whole row stays the click target. */}
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
      {cols.map(col => {
        const v = col.render(c);
        return (
          <td
            key={col.key}
            className={`px-2 py-1.5 text-right font-mono whitespace-nowrap tnum ${v.bold ? 'text-[11px] font-bold' : 'text-[10px]'} ${
              v.ink ?? (v.bold ? 'text-textPrimary' : 'text-textSecondary')
            }`}
          >
            {v.text}
          </td>
        );
      })}
    </tr>
    {/* Pulse's inline weigh-up — the drop-down we had before the Strike card
        (and the reference's own move): the row's height eases open under the
        clicked strike and folds flat on the close, padding riding inside the
        collapsing box. */}
    {inlineDrill && (
      <AnimatePresence initial={false}>
        {active && (
          <motion.tr key="drill" className="bg-select/[0.04]">
            <td colSpan={cols.length + 1} className="p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.24, ease: [0.25, 1, 0.5, 1] }}
                className="overflow-hidden"
              >
                <div className="px-3 py-2.5 border-b border-white/[0.05] flex flex-col gap-3">
                  <WeighGrids c={c} />
                </div>
              </motion.div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    )}
    {showDivider && (
      <tr aria-hidden>
        <td colSpan={cols.length + 1} className="px-2 py-0.5">
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

/* The contract capsule's OWN menu (Noah, 2026-08-27: "i shoudnt be shown
   tickers, rather i should be shown the strikes i can click on") - in the
   contract lens the capsule's job is stepping between CONTRACTS, so its
   door lists the chain's strikes, opened with the one on the scale centred.
   The ticker door still lives where tickers are the subject: the stock
   lens and the chain header. */
const StrikePick = ({
  label,
  contracts,
  sel,
  onPick,
}: {
  label: string;
  contracts: DeskContract[];
  sel: number | null;
  onPick: (strike: number) => void;
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    // Window-capture Escape - the TickerQuickPick contract: the innermost
    // open thing gets the key and nothing behind it sees it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // The menu opens with the selection in the MIDDLE - stepping strikes
  // should feel like nudging a dial, not re-finding your place in a list.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' });
    });
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Switch strike"
        className="inline-flex items-center justify-between gap-2 h-7 min-w-[112px] px-3 rounded-full bg-white/[0.06] hover:bg-white/[0.10] font-mono text-[11px] font-bold text-textPrimary transition-colors"
      >
        {label}
        <ChevronDown className={`w-3 h-3 text-textSecondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-40 w-52 border border-borderMuted bg-panel rounded-md shadow-2xl shadow-black/60 overflow-hidden animate-slide-in">
          <div className="px-3 py-1.5 border-b border-borderSubtle flex items-center justify-between font-mono text-[9px] font-semibold uppercase tracking-widest text-textMuted select-none">
            <span>Strike</span>
            <span>Mark</span>
          </div>
          <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
            {[...contracts].reverse().map(c => {
              const active = sel != null && Math.abs(c.strike - sel) < 1e-9;
              return (
                <button
                  key={c.strike}
                  aria-selected={active}
                  onClick={() => {
                    setOpen(false);
                    onPick(c.strike);
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-1 font-mono text-[11px] tnum transition-colors ${
                    active ? 'bg-select/[0.08] text-select font-bold' : 'text-textPrimary hover:bg-white/[0.04]'
                  }`}
                >
                  <span>{fmtStrike(c.strike)}</span>
                  <span className={active ? '' : 'text-textSecondary'}>${c.mark.toFixed(2)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/* ---- the pane sash ---------------------------------------------------------
   The divider you can PULL (Noah, 2026-08-26, the TradingView photo: "the
   side you pull towards gets reduced whilst dragging the other") — every
   gutter two cards share is a live sash. Drag it and one pane gives up the
   columns (or rows) the other takes, grid-snapped, clamped by each card's
   min and max. RGL's own edge handles stay for free-form resizing; this is
   the between-the-panes door the reference drives with. */
const GRID_COLS = 12;
const GRID_ROW_H = 88;
const GRID_MARGIN = 10;

interface Sash {
  key: string;
  dir: 'v' | 'h';
  aId: string;
  bId: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

const SashLayer = ({
  layout,
  width,
  onLayout,
}: {
  layout: Layout[];
  width: number;
  onLayout: (next: Layout[]) => void;
}) => {
  const [dragging, setDragging] = useState<string | null>(null);
  if (width <= 0) return null;

  const colW = (width - GRID_MARGIN * (GRID_COLS - 1)) / GRID_COLS;
  const unitX = colW + GRID_MARGIN;
  const unitY = GRID_ROW_H + GRID_MARGIN;

  /* A sash per adjacent PAIR: a's right edge on b's left column (vertical),
     or a's bottom edge on b's top row (horizontal), wherever they overlap.
     Pairs, not whole boundary lines — after a rearrange every gutter is
     still exactly the seam of two cards, so this is always right. */
  const sashes: Sash[] = [];
  for (const a of layout) {
    for (const b of layout) {
      if (a.i === b.i) continue;
      if (a.x + a.w === b.x) {
        const top = Math.max(a.y, b.y);
        const bot = Math.min(a.y + a.h, b.y + b.h);
        if (bot > top)
          sashes.push({
            key: `v:${a.i}:${b.i}`,
            dir: 'v',
            aId: a.i,
            bId: b.i,
            left: b.x * unitX - GRID_MARGIN,
            top: top * unitY,
            width: GRID_MARGIN,
            height: (bot - top) * unitY - GRID_MARGIN,
          });
      }
      if (a.y + a.h === b.y) {
        const l = Math.max(a.x, b.x);
        const r = Math.min(a.x + a.w, b.x + b.w);
        if (r > l)
          sashes.push({
            key: `h:${a.i}:${b.i}`,
            dir: 'h',
            aId: a.i,
            bId: b.i,
            left: l * unitX,
            top: b.y * unitY - GRID_MARGIN,
            width: (r - l) * unitX - GRID_MARGIN,
            height: GRID_MARGIN,
          });
      }
    }
  }

  const startDrag = (sash: Sash, e: React.PointerEvent) => {
    e.preventDefault();
    // Everything is computed against the layout AS IT WAS at pointer-down —
    // the drag is one gesture with one origin, never a feedback loop.
    const start = layout.map(l => ({ ...l }));
    const origin = sash.dir === 'v' ? e.clientX : e.clientY;
    const unit = sash.dir === 'v' ? unitX : unitY;
    setDragging(sash.key);
    /* The FIRST lane crosses at a third of a unit, not half. A column is
       ~165px wide, so Math.round demanded an ~83px pull before anything
       moved — every human-scale drag did nothing and the divider read as
       dead (Noah, 2026-08-27: "ive tried moving either left or right but
       nothing moves"). Early first step, standard rounding after. */
    const steps = (deltaPx: number) => {
      const mag = Math.abs(deltaPx) / unit;
      if (mag < 0.33) return 0;
      return Math.sign(deltaPx) * Math.max(1, Math.round(mag));
    };
    const move = (ev: PointerEvent) => {
      const a = start.find(l => l.i === sash.aId)!;
      const b = start.find(l => l.i === sash.bId)!;
      let d = steps((sash.dir === 'v' ? ev.clientX : ev.clientY) - origin);
      if (sash.dir === 'v') {
        d = Math.max(d, (a.minW ?? 1) - a.w);
        d = Math.min(d, b.w - (b.minW ?? 1));
        onLayout(start.map(l => (l.i === a.i ? { ...l, w: a.w + d } : l.i === b.i ? { ...l, x: b.x + d, w: b.w - d } : { ...l })));
      } else {
        d = Math.max(d, (a.minH ?? 1) - a.h);
        d = Math.max(d, -((b.maxH ?? Infinity) - b.h));
        d = Math.min(d, b.h - (b.minH ?? 1));
        d = Math.min(d, (a.maxH ?? Infinity) - a.h);
        onLayout(start.map(l => (l.i === a.i ? { ...l, h: a.h + d } : l.i === b.i ? { ...l, y: b.y + d, h: b.h - d } : { ...l })));
      }
    };
    const up = () => {
      setDragging(null);
      window.removeEventListener('pointermove', move);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      {sashes.map(s => (
        <div
          key={s.key}
          onPointerDown={e => startDrag(s, e)}
          title="Drag to trade space between the panes"
          className={`absolute pointer-events-auto group flex items-center justify-center ${
            s.dir === 'v' ? 'cursor-col-resize' : 'cursor-row-resize'
          }`}
          style={{ left: s.left, top: s.top, width: s.width, height: s.height }}
        >
          <span
            className={`rounded-full transition-opacity duration-150 ${
              dragging === s.key ? 'opacity-100 bg-white/40' : 'opacity-0 group-hover:opacity-100 bg-white/25'
            } ${s.dir === 'v' ? 'w-[3px] h-9' : 'h-[3px] w-9'}`}
          />
        </div>
      ))}
    </div>
  );
};

/* ---- the desk -------------------------------------------------------------- */
const WeigherDesk = ({ incomingTicker }: { incomingTicker?: string | null }) => {
  const { marketData } = useMarketData();
  /* TWO TIERS, the Pulse rule (Noah, 2026-08-27: "i dont ever have this
     problem with the pulse page"): the light tick runs every snapshot and
     feeds the cheap live readouts — prices, the mood, the charts' bar
     appends. The SCAN tick sweeps every few seconds and feeds the heavy
     rebuilds — the 301-strike chain and the scanner. And while a card is
     being dragged or resized, BOTH freeze: a desk re-render mid-drag is
     exactly the stutter that knocked the card out of its drop box. */
  const [tick, setTick] = useState(0);
  const [scanTick, setScanTick] = useState(0);
  const lastScanRef = useRef(0);
  const interactingRef = useRef(false);
  const pendingTickRef = useRef(false);
  useEffect(() => {
    if (interactingRef.current) {
      pendingTickRef.current = true;
      return;
    }
    setTick(t => t + 1);
    const now = Date.now();
    if (now - lastScanRef.current >= SCAN_MS) {
      lastScanRef.current = now;
      setScanTick(t => t + 1);
    }
  }, [marketData]);

  const beginInteract = useCallback(() => {
    interactingRef.current = true;
  }, []);
  const endInteract = useCallback((nextLayout: Layout[]) => {
    interactingRef.current = false;
    setDesk(d => ({ ...d, layout: nextLayout }));
    if (pendingTickRef.current) {
      pendingTickRef.current = false;
      setTick(t => t + 1);
    }
  }, []);

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

  const { ticker, dte, lens, right, preset, depth, cols, layout } = desk;
  const patch = (p: Partial<DeskState>) => setDesk(d => ({ ...d, ...p }));

  const mood = useMemo(() => marketMood(), [tick]);
  const session = useMemo(() => marketSession(), [tick]);
  const chain = useMemo(() => buildDeskChain(ticker, dte, depth), [ticker, dte, depth, scanTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const board = SCREENERS.find(b => b.key === preset) ?? SCREENERS[0];
  const scan = useMemo(() => runScreener(preset, 60), [preset, scanTick]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Gainers and losers ARE sorted by change, and the change column already
     shows it — so those two boards drop the metric column instead of
     printing the same number twice. */
  const showMetric = board.metricLabel !== 'Change';
  /* AN INLINE STYLE, NOT A TAILWIND CLASS. `grid-cols-[...]` built from a
     template string never reaches the stylesheet: Tailwind generates only
     the class names it can see LITERALLY in the source, so a runtime one
     resolves to nothing and the grid collapses to a single column. Caught
     on the rendered desk — the header stacked LAST over CHANGE down the
     right edge — and it typechecks perfectly either way, which is exactly
     why this note is here. */
  const scanCols = showMetric ? 'minmax(0,1.2fr) 1fr 1fr 1fr' : 'minmax(0,1.4fr) 1fr 1fr';
  const levels = useMemo(() => buildLevelsFor(ticker), [ticker, tick]);
  const changePct = useMemo(() => spotChangePct(ticker), [ticker, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const prints = useMemo(() => buildPrints(ticker, levels.spot), [ticker]); // eslint-disable-line react-hooks/exhaustive-deps
  const expiries = useMemo(() => deskExpiries(), []);
  const shownCols = useMemo(() => CHAIN_COLUMNS.filter(c => cols.includes(c.key)), [cols]);

  /* FULLSCREEN takeovers (Noah, 2026-08-27: "make the ability for the chart
     to be full screen.... same with the chain") — the pressure ladder's
     grammar: portal to <body>, Esc exits on a fade, page scroll locks
     underneath. One card at a time; its grid cell goes blank behind the
     takeover so no chart runs twice. */
  const [full, setFull] = useState<'chart' | 'chain' | null>(null);
  const { closing, close } = useFadeClose(() => setFull(null));
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [full, close]);

  const fullBtn = (card: 'chart' | 'chain') => (
    <button
      onClick={() => setFull(card)}
      title={card === 'chart' ? 'Fullscreen chart' : 'Fullscreen chain'}
      className="p-1 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.05] transition-colors"
    >
      <Maximize2 className="w-3 h-3" />
    </button>
  );

  /* The sash layer needs the grid's real pixel width to place its dividers —
     measured off the same wrapper WidthProvider measures, so they can never
     disagree. */
  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  const [gridW, setGridW] = useState(0);
  useEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return;
    setGridW(el.clientWidth);
    const ro = new ResizeObserver(() => setGridW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  /* A deep link arrives with a name (Trace's "Weigh it"). It repoints the
     desk once; after that the desk's own pickers own the ticker again, and
     the stored desk state carries it to the next visit. */
  useEffect(() => {
    if (!incomingTicker || incomingTicker === ticker) return;
    Simulator.ensureTicker(incomingTicker);
    setSel(null);
    patch({ ticker: incomingTicker, lens: 'stock' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingTicker]);

  /* ONE click weighs, TWO clicks chart (Noah, 2026-08-26: "a double click of
     the chain should change the live chart to the contract one and one click
     shows the strike info at the bottom"). The single click only moves the
     Strike card; the chart keeps whatever lens it had — except when the
     click CLEARS the selection, because a contract lens with no contract has
     nothing to show and falls back to the stock tape. */
  const pickStrike = useCallback((strike: number, clicks = 1) => {
    if (clicks >= 2) {
      // The second click of a double — the first already selected the row.
      setSel(strike);
      setDesk(d => ({ ...d, lens: 'contract' }));
      return;
    }
    setSel(cur => {
      const next = cur != null && Math.abs(cur - strike) < 1e-9 ? null : strike;
      if (next == null) setDesk(d => ({ ...d, lens: 'stock' }));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /* In the contract lens the strip speaks the CONTRACT (Noah, 2026-08-26:
     "it should say 'spy 507 call' with the price ticker being changed from
     the stock price to the contract changing price") \u2014 same capsule, same
     ticker door behind it, but the name is the whole contract and the tick
     is its mark against yesterday's modeled close, the reference's own
     "$0.38 \u25bc $0.07 (15.56%)" grammar. */
  /* The chain sweeps every few seconds, but the capsule's price must tick
     with the tape — one contract re-priced per second is cheap; 602 are
     not. Same estimator, same smile, so the sweep never disagrees with it. */
  const liveMark = useMemo(() => {
    if (sel == null || !selected) return null;
    const spotNow = Simulator.TICKERS[ticker]?.currentPrice ?? chain.spot;
    return Number(estimatePremium(spotNow, sel, right, contractIvFor(ticker, sel, right), tYears).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, right, ticker, selected, tick]);

  const shownMark = liveMark ?? selected?.mark ?? 0;
  const contractChg = selected ? shownMark - selected.prevClose : 0;
  const contractChgPct = selected && selected.prevClose > 0 ? (contractChg / selected.prevClose) * 100 : 0;
  const contractIdentity = selected != null && sel != null && (
    <span className="inline-flex items-center gap-2 select-none shrink-0">
      <StrikePick
        label={`${ticker} ${fmtStrike(sel)} ${right === 'C' ? 'Call' : 'Put'}`}
        contracts={chain.rows.map(r => (right === 'C' ? r.call : r.put))}
        sel={sel}
        onPick={strike => setSel(strike)}
      />
      <SpotPrice value={shownMark} />
      <span className={`font-mono text-[11px] font-semibold tnum ${contractChg >= 0 ? 'text-bull' : 'text-bear'}`}>
        {contractChg >= 0 ? '\u25b2' : '\u25bc'} ${Math.abs(contractChg).toFixed(2)} ({Math.abs(contractChgPct).toFixed(2)}%)
      </span>
    </span>
  );

  const chartActions = (
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
  );

  /* The card bodies live in consts so the SAME JSX serves the grid cell and
     the fullscreen takeover — one source, two frames, no drift. */
  const chartBody = (
    <div className="relative h-full">
            {lens === 'contract' && selected ? (
              <div className="h-full flex flex-col">
                {/* The contract keeps the reader's interval — same timeframe
                    state the stock lens uses, so flipping lenses never
                    changes the clock. */}
                <div className="shrink-0 px-2 py-1 flex items-center gap-2.5 flex-wrap">
                  {contractIdentity}
                  <span className="inline-flex items-center gap-0.5">
                  {TIMEFRAMES.map(t => (
                    <Chip key={t.value} active={timeframe === t.value} onClick={() => setTimeframe(t.value)} title={t.label}>
                      {t.label}
                    </Chip>
                  ))}
                  </span>
                </div>
                {/* Keyed remount: stepping strikes lands the new premium
                    tape on a soft fade instead of a hard cut. */}
                <div key={`${ticker}:${sel}:${right}:${dte}`} className="relative flex-1 min-h-0 animate-soft-in">
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
                  {/* PORTED ONTO THIS TREE'S TOOLBAR, which asks for two of
                      these differently and is the better side of both.

                      `alerts` was a boolean that just revealed the menu. Here
                      the control is wired instead of flagged — it takes the
                      symbol and the spot, so an alert it creates is bound to a
                      real name at a real price rather than to whatever the
                      menu happened to be looking at. It renders whenever those
                      are passed, minimal mode included, so the flag has
                      nothing left to do.

                      `collapsed` became `compact`, which is the same intent
                      with more of it: the seven timeframes fold into one
                      trigger AND every dropdown trades its word for its icon.
                      That is what "a desk card is Terrain-pane narrow" needs. */}
                  <ChartToolbar
                    minimal
                    candles
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
  );

  const chainActions = (
    <span className="flex items-center gap-1.5 flex-wrap">
      {/* The chain's own door to the desk ticker (Noah, 2026-08-25:
          "the chain should have its own ticker search") — same state as
          the chart's picker, so either one repoints both. */}
      {/* `squared`, not the `slim` this arrived with — Noah, 2026-08-25:
          "make the chain one more squared". Same trigger, square corners,
          and it keeps the 112px pill a name is actually readable in rather
          than shrinking to bare text. */}
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
      {/* How far the ladder reaches — the strike distance is a choice,
          not a cap (Noah, 2026-08-25) */}
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
      <span className="w-px h-3.5 bg-white/[0.08]" aria-hidden />
      <ColumnsDoor cols={cols} onChange={next => patch({ cols: next })} />
    </span>
  );

  const chainBody = (
    <ChainCard
      chain={chain}
      right={right}
      sel={sel}
      onSelect={pickStrike}
      cols={shownCols}
      centerKey={`${ticker}:${dte}:${depth}`}
    />
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

      <div className="relative" ref={gridWrapRef}>
      <Grid
        className="relative desk-grid"
        layout={layout}
        cols={12}
        rowHeight={88}
        margin={[10, 10]}
        containerPadding={[0, 0]}
        draggableHandle=".desk-drag"
        /* Every edge and corner resizes - the SE-only default read as "not
           fully movable" (Noah, 2026-08-25). */
        resizeHandles={['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne']}
        /* No state writes while a card is in hand — RGL animates the drag
           internally and hands us the final layout at drop. Re-rendering the
           desk on every placeholder step was the other half of the jank. */
        onDragStart={beginInteract}
        onResizeStart={beginInteract}
        onDragStop={(next: Layout[]) => endInteract(next)}
        onResizeStop={(next: Layout[]) => endInteract(next)}
        onLayoutChange={(next: Layout[]) => {
          if (!interactingRef.current) patch({ layout: next });
        }}
      >
        <div key="chart">
          <DeskCard
            actions={
              <>
                {chartActions}
                {fullBtn('chart')}
              </>
            }
          >
            {full === 'chart' ? <div className="h-full" /> : chartBody}
          </DeskCard>
        </div>

        <div key="chain">
          <DeskCard
            title="Chain"
            actions={
              <>
                {chainActions}
                {fullBtn('chain')}
              </>
            }
          >
            {full === 'chain' ? <div className="h-full" /> : chainBody}
          </DeskCard>
        </div>

        <div key="scan">
          <DeskCard
            title="Scanner"
            actions={
              /* NINE boards where there were three, so the row scrolls
                 rather than wrapping the card's header into two lines and
                 stealing a row of the table under it. Short labels here,
                 the full blurb on hover. */
              <span className="flex items-center gap-0.5 overflow-x-auto max-w-full">
                {SCREENERS.map(b => (
                  <Chip key={b.key} active={preset === b.key} onClick={() => patch({ preset: b.key })} title={b.blurb}>
                    {b.short}
                  </Chip>
                ))}
              </span>
            }
          >
            {/* The roster FILLS its card (Noah, 2026-08-26: "the columns
                should expand to fit the container and NOT have a whole bunch
                of empty space at the bottom") - a short list stretches its
                rows across the height, a long one keeps a readable row floor
                and scrolls. Divs, not a table: a table cannot hold its
                header tight while its body rows flex. */}
            <div className="h-full overflow-y-auto">
              <div className="min-h-full flex flex-col">
                <div
                  className="sticky top-0 z-10 grid border-b border-white/[0.06]"
                  style={{ background: 'rgba(13,14,17,0.92)', gridTemplateColumns: scanCols }}
                >
                  {(showMetric ? ['Ticker', 'Last', 'Change', board.metricLabel] : ['Ticker', 'Last', 'Change']).map((h, i) => (
                    <span
                      key={h}
                      className={`px-2.5 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-textSecondary ${
                        i === 0 ? 'text-left' : 'text-right'
                      }`}
                    >
                      {h}
                    </span>
                  ))}
                </div>
                {/* An empty board is a real answer — "nothing made a new
                    52-week low today" is information — so it says which
                    board came back empty rather than a generic blank. */}
                {scan.length === 0 && (
                  <div className="flex-1 flex items-center justify-center px-3 text-center font-mono text-[10px] uppercase tracking-widest text-textMuted">
                    Nothing on {board.short.toLowerCase()} today
                  </div>
                )}
                {scan.map(r => (
                  <div
                    key={r.ticker}
                    onClick={() => pickTicker(r.ticker)}
                    className={`flex-1 min-h-[30px] grid items-center cursor-pointer transition-colors ${
                      r.ticker === ticker ? 'bg-select/[0.06]' : 'hover:bg-white/[0.03]'
                    }`}
                    style={{ gridTemplateColumns: scanCols }}
                    title={`${r.name} — ${r.note}. Put ${r.ticker} on the desk`}
                  >
                    <span className={`px-2.5 font-mono text-[11px] font-semibold ${r.ticker === ticker ? 'text-select' : 'text-textPrimary'}`}>
                      {r.ticker}
                    </span>
                    <span className="px-2.5 text-right font-mono text-[11px] tnum text-textPrimary">${r.price.toFixed(2)}</span>
                    <span className={`px-2.5 text-right font-mono text-[11px] font-semibold tnum ${r.changePct >= 0 ? 'text-bull' : 'text-bear'}`}>
                      {r.changePct >= 0 ? '+' : ''}
                      {r.changePct.toFixed(2)}%
                    </span>
                    {showMetric && (
                      <span className="px-2.5 text-right font-mono text-[10px] tnum text-textSecondary truncate">{r.metric}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </DeskCard>
        </div>

        <div key="info">
          <DeskCard
            title="Strike"
            actions={
              selected && sel != null ? (
                <span className="font-mono text-[10px] font-semibold tnum text-textSecondary whitespace-nowrap">
                  {ticker} {fmtStrike(sel)}
                  {right} · {chain.expiry.dte}d
                </span>
              ) : undefined
            }
          >
            <StrikeCard c={selected} contractKey={`${ticker}-${sel ?? 'none'}-${right}-${chain.expiry.dte}`} />
          </DeskCard>
        </div>

      </Grid>
      <SashLayer layout={layout} width={gridW} onLayout={next => patch({ layout: next })} />
      </div>

      {/* Portal, not a plain fixed div: RGL positions cards with CSS
          transforms, and a transformed ancestor becomes the containing block
          for position:fixed — an in-place overlay would size itself to the
          card. Escaping to <body> is the only way out (the ladder widget
          learned this first). */}
      {full &&
        createPortal(
          <div
            className={`fixed inset-0 z-[80] bg-canvas p-3 flex flex-col animate-soft-in transition-opacity duration-200 ease-out ${
              closing ? 'opacity-0' : ''
            }`}
          >
            <div className="flex-1 min-h-0 border border-borderSubtle bg-panel rounded-lg overflow-hidden flex flex-col">
              <div className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 border-b border-white/[0.05]">
                <button
                  onClick={close}
                  className="group inline-flex items-center gap-1.5 border border-borderSubtle hover:border-borderMuted rounded-md px-2.5 py-1 font-mono text-[10px] text-textSecondary hover:text-textPrimary transition-colors"
                >
                  <ArrowLeft className="w-3 h-3 transition-transform duration-200 ease-out group-hover:-translate-x-0.5" /> Back
                </button>
                <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5 min-w-0">
                  {full === 'chart' ? chartActions : chainActions}
                </span>
                <button
                  onClick={close}
                  title="Exit fullscreen (Esc)"
                  className="p-1 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.05] transition-colors"
                >
                  <Minimize2 className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1 min-h-0">{full === 'chart' ? chartBody : chainBody}</div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default WeigherDesk;
