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
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight, Check, ChevronDown, ChevronRight, Columns3, GripHorizontal, Maximize2, Minimize2, Moon, RotateCcw, Sun } from 'lucide-react';
import Simulator from '../../core/simulator';
import { useMarketData } from '../../context/MarketDataContext';
import { buildLevelsFor, buildPrints, fmtUsd, spotChangePct } from '../../data/gex';
import { buildCompassView, estimatePremium, makeSetup, sleeveForDte } from '../../data/compass';
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
import { useAnchoredMenu } from '../../components/ui/useAnchoredMenu';
import StrikeChart, {
  DEFAULT_INDICATORS,
  DEFAULT_OVERLAYS,
  type ChartIndicators,
  type ChartOverlays,
  type ChartStyle,
} from '../../components/gex/StrikeChart';
import ChartToolbar from '../../components/gex/ChartToolbar';
import { weighContract, type WeighYourOwn, type ContractVerdict } from '../../core/contractScore';
import RichRead from '../../components/ui/RichRead';
import SignalBadge from '../../components/ui/SignalBadge';
import TickerQuickPick from '../../components/gex/TickerQuickPick';
import SpotPrice from '../../components/gex/SpotPrice';
import ContractPremiumPane from '../../components/gex/ContractPremiumPane';
import Chip from '../../components/ui/Chip';
import { useFadeClose } from '../../components/ui/useFadeClose';
import Term from '../../components/ui/Term';
import { TIMEFRAMES, type Timeframe } from '../../data/timeframe';
import VerdictBadge from '../../components/compass/VerdictBadge';
import type { OptionRight, Setup } from '../../types/compass';

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
/* HALF-ROW UNITS (Noah, 2026-08-29: 480px max was "too much", 382 wanted
   "a bit taller" — the 88px row was too coarse to say ~430). Row height
   halved to 39 so two new rows equal one old row to the pixel
   (2×39+10 = 88); every stored layout doubles its h/y once on load
   (rowsV 2). The scanner and the strike read cap at 9 half-rows ≈ 431px —
   the whole read with a breath of air, nothing past it. Width stays free. */
/* An EVEN 2×2 from the first render (Noah, 2026-08-29: "reset this whole
   page to be even sizes") — four equal quadrants at 9 half-rows (~431px);
   the chart and chain may still be pulled taller, the scanner and the
   strike read stay capped at their comfortable height. */
const DEFAULT_LAYOUT: Layout[] = [
  { i: 'chart', x: 0, y: 0, w: 24, h: 9, minW: 16, minH: 6, maxH: 16 },
  { i: 'chain', x: 24, y: 0, w: 24, h: 9, minW: 16, minH: 6, maxH: 20 },
  { i: 'scan', x: 0, y: 9, w: 24, h: 9, minW: 12, minH: 4, maxH: 9 },
  { i: 'info', x: 24, y: 9, w: 24, h: 9, minW: 12, minH: 4, maxH: 9 },
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
  /** Layout row-unit version — 2 = the 39px half-rows (2026-08-29). Absent
      means the old 88px rows; loadDesk doubles h/y once to migrate. */
  rowsV?: number;
  /** Layout column-unit version — 4 = the 48-column grid (2026-08-29).
      Absent means the old 12; loadDesk quadruples x/w once. */
  colsV?: number;
}

const CARD_KEYS = new Set<string>(['chart', 'chain', 'scan', 'info']);

function loadDesk(): DeskState {
  const def: DeskState = { ticker: 'SPY', dte: 2, lens: 'stock', right: 'C', preset: 'gainers', depth: 150, cols: DEFAULT_COLS, layout: DEFAULT_LAYOUT, rowsV: 2, colsV: 4 };
  try {
    const raw = localStorage.getItem(DESK_KEY);
    if (!raw) return def;
    const c = JSON.parse(raw) as Partial<DeskState>;
    /* Old 88px-row layouts double into the 39px half-row units — the same
       pixels, finer grid. */
    const unit = c.rowsV === 2 ? 1 : 2;
    const cunit = c.colsV === 4 ? 1 : 4;
    const layout = Array.isArray(c.layout)
      ? DEFAULT_LAYOUT.map(d => {
          const hit = (c.layout as Layout[]).find(l => l && l.i === d.i);
          return hit && CARD_KEYS.has(hit.i)
            ? {
                ...d,
                x: (hit.x ?? d.x / cunit) * cunit,
                y: (hit.y ?? d.y / unit) * unit,
                w: (hit.w ?? d.w / cunit) * cunit,
                h: Math.min((hit.h ?? d.h / unit) * unit, d.maxH ?? Number.POSITIVE_INFINITY),
              }
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
      /* A stored preset is a ScreenerKey now. 'voliv' was the old desk-only
         board (options volume x IV); its nearest survivor is the volume
         board, so a reader who left the desk on it lands where they meant. */
      preset:
        (c.preset as string) === 'voliv'
          ? 'optionsVolume'
          : SCREENERS.some(x => x.key === c.preset)
            ? (c.preset as ScreenerKey)
            : 'gainers',
      depth: typeof c.depth === 'number' && (DESK_DEPTHS as readonly number[]).includes(c.depth) ? c.depth : def.depth,
      cols: cols.length ? cols : [...def.cols],
      layout,
      rowsV: 2,
      colsV: 4,
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
  /* top-0, not top-14 (Noah, 2026-08-29: "even this top section should be
     translucent with the red being in the background") — the wash runs
     under the now-glassy top bar. */
  <div className="fixed left-0 right-0 top-0 bottom-0 overflow-hidden pointer-events-none" aria-hidden>
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
    {/* overflow-anchor OFF (Noah, 2026-08-29: "stop shifting the active
        card up... it should drop everything under it DOWN") — when the
        drill unfolds, Chrome's scroll anchoring grabs a row BELOW the
        growth and adjusts the scroll to hold it still, which shoves the
        clicked row upward instead. Unanchored, the clicked row stays put
        and the rows beneath give way. */}
    <div ref={scrollRef} onScroll={locate} className="h-full overflow-auto [overflow-anchor:none]">
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

/* States, never orders (the Compass ruling): BUY/WATCH/FADE are internal
   loop vocabulary; the reader sees the state. */
/* Conviction word from the Compass CONFIDENCE — the one sanctioned number,
   from the one state engine (2026-08-30: the local BUY/WATCH/FADE vocabulary
   died here; see contractScore.ts's header for the ruling). */
const CONVICTION = (confidence: number) => (confidence >= 70 ? 'High conviction' : confidence >= 45 ? 'Medium conviction' : 'Low conviction');
const SLEEVE_WORD: Record<string, string> = { odte: 'same-day', weekly: 'weekly', swing: 'swing', leaps: 'long-dated' };
const DOOR_CLS =
  'inline-flex items-center gap-1 px-2 py-1 rounded-md border border-borderSubtle bg-white/[0.03] hover:bg-white/[0.06] font-mono text-[9px] uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors';
/* TRANSFORM, never width (Noah, 2026-08-29: "the confidence bars are moving
   very laggy") — width is a LAYOUT property, and a layout animation under
   this desk's per-second churn drops frames; scaleX rides the compositor
   (the Trace live-meter law, applied here). Geometry takes the raw float. */
const METER_GLIDE = 'transition-[transform,background-color] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]';

/* The strike's weigh-up gets its OWN quadrant instead of unfolding inside
   the chain (Noah, 2026-08-26: "to differ from robinhood legend... the empty
   section in the bottom right be the information for the strike you click").
   Every pick lands on a soft fade - keyed remount, the Compass mode-swap
   recipe - and the content spreads to FILL the card rather than huddling at
   the top. Facts only; the greeks stay magnitudes with no direction ink. */
export const StrikeCard = ({
  c,
  contractKey,
  weigh,
  grade,
  boardRank,
  onOpenSetup,
  onSeeBoard,
}: {
  c: DeskContract | null;
  contractKey: string;
  weigh: WeighYourOwn | null;
  /** THE state — from makeSetup, the same engine that grades the board. */
  grade: Setup | null;
  /** This contract's place on today's board for its sleeve; null = not on it. */
  boardRank: number | null;
  onOpenSetup: () => void;
  onSeeBoard: () => void;
}) => {
  if (!c || !weigh || !grade) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-1.5 select-none animate-soft-in">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-textMuted">
          Nothing on the scale
        </span>
        <span className="font-mono text-[9px] text-textMuted">
          Click a strike in the chain — its facts drop under the row, and the desk's read lands here
        </span>
      </div>
    );
  }
  /*
    THE DESK'S OWN TWO CENTS (Noah, 2026-08-29), regraded 2026-08-30 after
    Noah caught the contradiction ("active high conviction on the weigher
    chain but that same con is NOT found on compass"): the STATE up top —
    badge, conviction word, confidence — now comes from makeSetup, the SAME
    engine that grades the Compass board, so the two pages cannot disagree
    by construction. The six factor meters below are the OTHER lens, framed
    as what they are: the contract's own build quality. And the board line
    at the bottom answers the absence question outright — on today's board
    with a rank, or plainly not, with doors either way. No raw scores
    anywhere — meters and words (the 2026-08-16 ruling).
  */
  /* NO key on the container (Noah, 2026-08-29: "transition between
     different cons should have the confidence bars be a smooth
     transition") — a keyed remount starts every meter at its new width
     with no journey. The DOM persists across contract switches so the
     bars GLIDE (METER_GLIDE), and only the PROSE crossfades, keyed by the
     contract. The ContractWeigher's own doctrine, applied here. */
  return (
    <div className="h-full overflow-y-auto animate-soft-in">
      {/* justify-evenly: a taller card spreads the read across its height
          (Noah, 2026-08-29: "this should grow to fit the card when
          extended") instead of huddling at the top over empty felt. */}
      <div className="min-h-full flex flex-col justify-evenly gap-2 px-3.5 py-2.5">
        <div key={contractKey} className="flex items-center gap-2 flex-wrap animate-soft-in">
          <VerdictBadge verdict={grade.verdict} dot />
          <span className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${
            grade.verdict === 'ENTER' ? 'text-bull' : grade.verdict === 'EXIT' ? 'text-bear' : 'text-warn'
          }`}>
            {CONVICTION(grade.confidence)}
          </span>
          <span className="font-mono text-[10px] tnum text-textSecondary">{grade.confidence}%</span>
          <span className="ml-auto font-mono text-[9px] text-textMuted whitespace-nowrap">
            graded on the {SLEEVE_WORD[grade.sleeve] ?? grade.sleeve} lens
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">The contract itself</span>
          {weigh.contract.factors.map(f => (
            <div key={f.key} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="w-28 shrink-0 font-mono text-[9px] uppercase tracking-wider text-textSecondary">{f.label}</span>
                <span className="flex-1 h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
                  <span
                    className={`block h-full w-full rounded-full origin-left ${METER_GLIDE} ${
                      f.score >= 60 ? 'bg-bull/85' : f.score >= 40 ? 'bg-white/30' : 'bg-bear/75'
                    }`}
                    style={{ transform: `scaleX(${f.score / 100})` }}
                  />
                </span>
              </div>
              <p key={contractKey} className="pl-28 text-[11px] text-textPrimary leading-snug animate-soft-in">
                <RichRead text={f.detail} />
              </p>
            </div>
          ))}
        </div>
        {/* Edge speaks for the trade, risk against it — the labels wear
            their sides (Noah, 2026-08-29: "edge and risk should be color
            coded"). Crossfades with the prose; the sentences stay bright. */}
        <div key={`er-${contractKey}`} className="grid grid-cols-1 gap-1.5 pt-1.5 border-t border-borderSubtle/60 animate-soft-in">
          <p className="text-[11px] leading-snug">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-bull mr-2">Edge</span>
            <span className="text-textPrimary"><RichRead text={weigh.contract.edge} /></span>
          </p>
          <p className="text-[11px] leading-snug">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-bear mr-2">Risk</span>
            <span className="text-textPrimary"><RichRead text={weigh.contract.risk} /></span>
          </p>
        </div>
        {/* The absence answered — the very question that exposed the two
            engines. On the board: say where. Off it: say why plainly. */}
        <div key={`bd-${contractKey}`} className="pt-1.5 border-t border-borderSubtle/60 flex items-center gap-2 flex-wrap animate-soft-in">
          {boardRank != null ? (
            <span className="font-mono text-[10px] text-textPrimary">
              On today's Compass board · <span className="font-semibold tnum">#{boardRank}</span>
            </span>
          ) : (
            <span className="font-mono text-[10px] text-textMuted">
              Not on today's board — the scan lists only the strongest few
            </span>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            <button onClick={onOpenSetup} className={DOOR_CLS}>
              <ArrowUpRight className="w-3 h-3" />
              Setup page
            </button>
            <button onClick={onSeeBoard} className={DOOR_CLS}>
              <ArrowUpRight className="w-3 h-3" />
              The board
            </button>
          </span>
        </div>
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
      title="Click: facts drop down, the desk\u2019s read lands below · double-click: chart it"
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
    {/* CSS unfold, NOT framer (2026-08-29, the scroll-jump hunt): the
        motion.tr height animation had framer's layout projection measuring
        and compensating the chain's scroll — the container jumped by
        exactly the drill's height on every open, shoving the clicked row.
        A grid-rows keyframe animates the same 240ms unfold with zero
        scroll math; close is an instant unmount (the house law). */}
    {inlineDrill && active && (
      <tr className="bg-select/[0.04]">
        <td colSpan={cols.length + 1} className="p-0">
          <div className="animate-drill-open">
            <div className="min-h-0 overflow-hidden">
              <div className="px-3 py-2.5 border-b border-white/[0.05] flex flex-col gap-3">
                <WeighGrids c={c} />
              </div>
            </div>
          </div>
        </td>
      </tr>
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
/* 48 columns since 2026-08-29 (Noah: the sash "doesnt even notice if you
   want to slide just a tad bit"). At 12 a column was ~127px, so the nearest
   step was half a pane away and the divider read as dead until a long pull.
   Quartered, a step is ~32px — fine enough that the sash tracks the hand.
   Stored layouts multiply x/w once on load (colsV 4). */
const GRID_COLS = 48;
const GRID_ROW_H = 39; // half-rows since 2026-08-29 (2×39+10 = the old 88)
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
  onDragStart,
  onDragEnd,
}: {
  layout: Layout[];
  width: number;
  onLayout: (next: Layout[]) => void;
  /** The desk freezes its market tick while a sash is held — the same
      contract RGL's own drags get. Without it the 1s tick re-rendered the
      whole desk mid-gesture, which is half of what read as lag. */
  onDragStart?: () => void;
  onDragEnd?: () => void;
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
    /* Plain rounding now that a unit is ~32px rather than ~127 — the early
       first step existed to paper over a grid too coarse to feel, and it
       made the first move a jump. */
    const steps = (deltaPx: number) => Math.round(deltaPx / unit);
    /* THE LAST STEP COMMITTED, so an unchanged one writes nothing.
       `onLayout` fired on EVERY pointermove — dozens of identical layouts a
       second, each re-rendering four cards and re-serialising the desk into
       storage. That was the lag; the grid's coarseness was the dead zone.
       Two faults, two fixes. */
    let lastD: number | null = null;
    onDragStart?.();
    const move = (ev: PointerEvent) => {
      const a = start.find(l => l.i === sash.aId)!;
      const b = start.find(l => l.i === sash.bId)!;
      let d = steps((sash.dir === 'v' ? ev.clientX : ev.clientY) - origin);
      if (sash.dir === 'v') {
        d = Math.max(d, (a.minW ?? 1) - a.w);
        d = Math.min(d, b.w - (b.minW ?? 1));
        if (d === lastD) return;
        lastD = d;
        onLayout(start.map(l => (l.i === a.i ? { ...l, w: a.w + d } : l.i === b.i ? { ...l, x: b.x + d, w: b.w - d } : { ...l })));
      } else {
        d = Math.max(d, (a.minH ?? 1) - a.h);
        d = Math.max(d, -((b.maxH ?? Infinity) - b.h));
        d = Math.min(d, b.h - (b.minH ?? 1));
        d = Math.min(d, (a.maxH ?? Infinity) - a.h);
        if (d === lastD) return;
        lastD = d;
        onLayout(start.map(l => (l.i === a.i ? { ...l, h: a.h + d } : l.i === b.i ? { ...l, y: b.y + d, h: b.h - d } : { ...l })));
      }
    };
    const up = () => {
      setDragging(null);
      window.removeEventListener('pointermove', move);
      onDragEnd?.();
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
  /* `nextLayout` is OPTIONAL, and that is the sash's fix: RGL hands us the
     final layout at drop, but the sash has been committing its own steps all
     through the gesture — passing it the layout captured at pointer-DOWN
     (the closure the drag handler holds) overwrote the whole drag on release
     and the divider snapped home. Called bare, this only unfreezes. */
  const endInteract = useCallback((nextLayout?: Layout[]) => {
    interactingRef.current = false;
    if (nextLayout) setDesk(d => ({ ...d, layout: nextLayout }));
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
  const [boardOpen, setBoardOpen] = useState(false);
  const { anchorRef: boardBtnRef, placed: boardPlaced, menuRef: boardMenuRef } =
    useAnchoredMenu<HTMLButtonElement>(boardOpen, 'bottom');
  /* Gainers and losers ARE sorted by change and the change column already
     shows it, so those two drop the metric column instead of printing the
     same number twice. An inline gridTemplateColumns, never a Tailwind class
     built from a template string — those only reach the stylesheet when
     Tailwind can see them literally in the source. */
  const showMetric = board.metricLabel !== 'Change';
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
      {/* THE SPOT, marked so 15's coherence claim is checkable. The
          contract capsule below shows a MARK, not a spot, and is
          deliberately unmarked. */}
      <SpotPrice value={Simulator.TICKERS[ticker]?.currentPrice ?? chain.spot} spotOf={ticker} />
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
  /*
    THE PULSE GRAMMAR, applied here (Noah, 2026-08-29: "the weigher chart is
    currently having the same problem as we prev did with the pulse charts.
    i clearly see padding on all 4 sides. the bar up top is not translucent
    ... basically 2 rows of top sections instead of one"):

    - the tape is EDGE TO EDGE — absolute inset-0, no header rows in flow;
    - ONE strip, fused to the top, translucent over the tape (the card's own
      surface at its own alpha + blur, so there is no second black);
    - everything that lived on the old two rows rides that strip: the drag
      grip, the identity, the toolbar, the Stock/Contract lens chips, and
      the fullscreen door — which becomes the minimize door IN fullscreen,
      because the takeover shows this same body and a Back row over it was
      the second row Noah counted.
  */
  const chartStrip = (
    <div
      /* NO band (Noah, 2026-08-29, after two alpha attempts: "i beg to
         differ" — a dark wash over a dark tape IS a solid box; there is
         nothing behind it for translucency to reveal). The Terrain floating
         chrome grammar instead: the strip is transparent and each control
         carries its own pill, so the tape runs untouched to the card's top
         edge. */
      className="absolute top-0 inset-x-0 z-20 flex flex-wrap items-center gap-x-2.5 gap-y-1 px-2 py-1 select-none"
    >
      {full !== 'chart' && (
        <div className="desk-drag cursor-grab active:cursor-grabbing flex items-center self-stretch shrink-0">
          <GripHorizontal className="w-3.5 h-3.5 text-textMuted" />
        </div>
      )}
      {lens === 'contract' && selected != null && sel != null ? (
        <>
          {contractIdentity}
          <span className="inline-flex items-center gap-0.5">
            {TIMEFRAMES.map(t => (
              <Chip key={t.value} active={timeframe === t.value} onClick={() => setTimeframe(t.value)} title={t.label}>
                {t.label}
              </Chip>
            ))}
          </span>
        </>
      ) : (
        <>
          {identity}
          <ChartToolbar
            minimal
            candles
            alertTicker={ticker}
            alertSpot={levels.spot}
            compact
            timeframe={timeframe}
            onTimeframe={setTimeframe}
            overlays={overlays}
            onOverlays={setOverlays}
            chartStyle={chartStyle}
            onChartStyle={setChartStyle}
            indicators={indicators}
            onIndicators={setIndicators}
          />
        </>
      )}
      <span className="ml-auto flex items-center gap-1.5">
        {chartActions}
        {full === 'chart' ? (
          <button
            onClick={close}
            title="Exit fullscreen (Esc)"
            className="p-1 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.05] transition-colors"
          >
            <Minimize2 className="w-3 h-3" />
          </button>
        ) : (
          fullBtn('chart')
        )}
      </span>
    </div>
  );

  const chartBody = (
    <div className="relative h-full">
      <div className="absolute inset-0">
        {lens === 'contract' && selected ? (
          /* Keyed remount: stepping strikes lands the new premium tape on a
             soft fade instead of a hard cut. */
          <div key={`${ticker}:${sel}:${right}:${dte}`} className="h-full animate-soft-in">
            <ContractPremiumPane
              ticker={ticker}
              strike={selected.strike}
              right={right}
              tYears={tYears}
              timeframe={timeframe}
              revision={tick}
            />
          </div>
        ) : (
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
        )}
      </div>
      {chartStrip}
    </div>
  );

  const chainActions = (
    <span className="flex items-center gap-1.5 flex-wrap">
      {/* The chain's own door to the desk ticker (Noah, 2026-08-25:
          "the chain should have its own ticker search") — same state as
          the chart's picker, so either one repoints both. */}
      <TickerQuickPick ticker={ticker} onPick={pickTicker} slim />
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

  /* The desk's judgment for the strike on the scale — the same scorer the
     Compass runs. Recomputed when the pick or the chain's sweep changes. */
  /* THE STATE — the board's own engine grading this exact contract (the
     dteOverride path makeSetup grew for user-named cons). Same cadence as
     the quality weigh: re-graded when the chain sweeps or the pick moves. */
  const compassGrade = useMemo(() => {
    if (sel == null) return null;
    const cfg = Simulator.TICKERS[ticker];
    if (!cfg) return null;
    return makeSetup(ticker, cfg.currentPrice, sel, right, 'top-setups', cfg.iv, sleeveForDte(chain.expiry.dte), chain.expiry.dte);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, right, ticker, chain]);

  /* Is this con on today's board? The SAME sweep Compass runs for this
     sleeve, checked at pick time — a snapshot answer for a snapshot
     question ("why isn't it there?"). */
  const boardRank = useMemo(() => {
    if (sel == null) return null;
    const view = buildCompassView(
      Simulator.snapshotFor(ticker),
      'top-setups',
      Simulator.universeQuotes(ticker),
      sleeveForDte(chain.expiry.dte)
    );
    const flat = view.groups.flatMap(g => g.setups);
    const i = flat.findIndex(x => x.ticker === ticker && x.right === right && Math.abs(x.strike - sel) < 1e-9);
    return i >= 0 ? i + 1 : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, right, ticker, chain]);

  const navigate = useNavigate();
  const openSetupPage = useCallback(() => {
    if (sel == null) return;
    navigate('/compass', {
      state: { monitor: { ticker, strike: sel, right, scanner: 'top-setups', sleeve: sleeveForDte(chain.expiry.dte) } },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, ticker, sel, right, chain]);
  const seeBoard = useCallback(
    () => navigate('/compass', { state: { tickerFilter: ticker } }),
    [navigate, ticker]
  );

  const weighed = useMemo(
    () => (sel != null ? weighContract(Simulator.snapshotFor(ticker), right, sel, chain.expiry.dte) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sel, right, ticker, chain]
  );

  const chainBody = (
    <ChainCard
      inlineDrill
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
        {/* Always present (Noah, 2026-08-29: "there should also be a reset
            button at all times. im having trouble dragging the live chart
            and the chain back up") — one click puts every card back on the
            even 2×2; tickers, columns and every other choice survive. */}
        <button
          onClick={() => setDesk(d => ({ ...d, layout: DEFAULT_LAYOUT.map(l => ({ ...l })) }))}
          title="Put the four cards back to the even layout"
          className="absolute right-0 inline-flex items-center gap-1.5 rounded-md border border-borderSubtle px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-textMuted hover:text-textPrimary hover:border-borderMuted transition-colors"
        >
          <RotateCcw className="w-3 h-3" /> Reset layout
        </button>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold tnum select-none ${
            session === 'overnight'
              ? 'border-moon/30 bg-moon/[0.13] text-moon'
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
        cols={48}
        rowHeight={39}
        margin={[10, 10]}
        containerPadding={[0, 0]}
        draggableHandle=".desk-drag"
        /* Every edge and corner resizes - the SE-only default read as "not
           fully movable" (Noah, 2026-08-25). */
        /* No top-side handles ('n'/'ne'/'nw') since the chart card's strip
           reached the top edge (2026-08-29): the invisible 20px corner
           handles sat OVER the strip's buttons and ate their clicks — the
           card's backdrop-blur makes a stacking context, so no z-index
           inside it can win. Bottom/side handles + the sashes cover every
           resize. */
        resizeHandles={['s', 'w', 'e', 'sw', 'se']}
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
          {/* NOT a DeskCard: the chart card has no header row — the strip
              inside chartBody is its whole chrome (Noah, 2026-08-29: one
              row, translucent, tape edge to edge). */}
          <div
            className="h-full relative overflow-hidden rounded-md border border-white/[0.07] backdrop-blur-[2px]"
            style={{ background: 'rgba(13,14,17,0.55)' }}
          >
            {full === 'chart' ? <div className="h-full" /> : chartBody}
          </div>
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
              /*
                NINE BOARDS BEHIND ONE TRIGGER, not nine chips.

                Three chips fit this header; nine never will. Laid out flat
                they overflowed at 1024 and the sweep said so exactly —
                "TRUNC x by 59px (box 375, content 434)" — because the desk's
                rule is that content fits the box it is drawn in, and a strip
                that scrolls sideways hides boards behind a gesture nobody is
                told about. The caption names the current board and opens the
                rest, the same shape the Terrain rail uses.
              */
              <span className="relative">
                <button
                  ref={boardBtnRef}
                  onClick={() => setBoardOpen(o => !o)}
                  aria-haspopup="menu"
                  aria-expanded={boardOpen}
                  title={board.blurb}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                    boardOpen ? 'bg-white/[0.12] text-textPrimary' : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.06]'
                  }`}
                >
                  {board.short}
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </button>
                {boardOpen && boardPlaced && (
                  <div
                    role="menu"
                    ref={boardMenuRef}
                    className="fixed z-50 rounded-md border border-borderSubtle bg-panel shadow-xl py-1"
                    style={{ left: boardPlaced.box.left, top: boardPlaced.box.top, minWidth: 232 }}
                  >
                    {SCREENERS.map(b => (
                      <button
                        key={b.key}
                        role="menuitemradio"
                        aria-checked={b.key === preset}
                        onClick={() => {
                          patch({ preset: b.key });
                          setBoardOpen(false);
                        }}
                        className={`block w-full text-left px-2.5 py-1 transition-colors ${
                          b.key === preset ? 'bg-white/[0.06] text-textPrimary' : 'text-textSecondary hover:bg-white/[0.04]'
                        }`}
                      >
                        <span className="font-mono text-[10px] font-semibold">{b.label}</span>
                        <span className="block text-[9px] leading-tight text-textMuted">{b.blurb}</span>
                      </button>
                    ))}
                  </div>
                )}
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
                  /* No tint — over the card's own surface any wash reads as
                     a darker slab (Noah, 2026-08-29). The blur alone earns
                     the sticky header's keep: at rest it is invisible, and
                     rows scrolling beneath smear into legibility. */
                  className="sticky top-0 z-10 grid border-b border-white/[0.06] backdrop-blur-md"
                  style={{ gridTemplateColumns: scanCols }}
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
                    52-week low today" is information — so it names which
                    board came back empty rather than going blank. */}
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
            <StrikeCard
              c={selected}
              weigh={weighed}
              grade={compassGrade}
              boardRank={boardRank}
              onOpenSetup={openSetupPage}
              onSeeBoard={seeBoard}
              contractKey={`${ticker}-${sel ?? 'none'}-${right}-${chain.expiry.dte}`}
            />
          </DeskCard>
        </div>

      </Grid>
      <SashLayer
        layout={layout}
        width={gridW}
        onLayout={next => patch({ layout: next })}
        onDragStart={beginInteract}
        onDragEnd={() => endInteract()}
      />
      </div>

      {/* Portal, not a plain fixed div: RGL positions cards with CSS
          transforms, and a transformed ancestor becomes the containing block
          for position:fixed — an in-place overlay would size itself to the
          card. Escaping to <body> is the only way out (the ladder widget
          learned this first). */}
      {full === 'chart' &&
        createPortal(
          /* The Pulse takeover's grammar: the chart IS the screen — no
             padding frame, no Back row; the strip inside chartBody carries
             every control plus the minimize door, and Esc still works. */
          <div
            className={`fixed inset-0 z-[80] bg-canvas flex flex-col animate-soft-in transition-opacity duration-200 ease-out ${
              closing ? 'opacity-0' : ''
            }`}
          >
            <div className="flex-1 min-h-0">{chartBody}</div>
          </div>,
          document.body
        )}
      {full === 'chain' &&
        createPortal(
          <div
            className={`fixed inset-0 z-[80] bg-canvas p-3 flex flex-col animate-soft-in transition-opacity duration-200 ease-out ${
              closing ? 'opacity-0' : ''
            }`}
          >
            <div className="flex-1 min-h-0 border border-borderSubtle bg-panel rounded-lg overflow-hidden flex flex-col">
              {/* ONE row (Noah, 2026-08-29: the Back button was the second
                  one) — the chain's own controls, and the minimize door. */}
              <div className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 border-b border-white/[0.05]">
                <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5 min-w-0">{chainActions}</span>
                <button
                  onClick={close}
                  title="Exit fullscreen (Esc)"
                  className="p-1 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.05] transition-colors"
                >
                  <Minimize2 className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1 min-h-0">{chainBody}</div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default WeigherDesk;
