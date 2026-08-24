import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Check, ChevronDown, Pause, Play, Search, SlidersHorizontal, X } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { enrichPrint, rankNotable, sentimentOf, summarizeTape } from '../../data/tape';
import { buildGexView, fmtUsd } from '../../data/gex';
import Chip from '../../components/ui/Chip';
import Panel from '../../components/ui/Panel';
import Term from '../../components/ui/Term';
import type { TermKey } from '../../data/terms';
import RichRead from '../../components/ui/RichRead';
import PrintDrilldown from '../../components/trace/PrintDrilldown';
import type { FlowPrint, PrintSentiment, TapeSummary } from '../../types/trace';

const MAX_ROWS = 120;
const READ_INTERVAL_MS = 8_000;
const COLS_KEY = 'slayer_tape_cols';

type FlowFilter = 'ALL' | 'SWEEP' | 'BLOCK';
/** The tape's ordering lens (Noah, 2026-08-19: "quickly switch between newest
    prints, largest premium, largest size, bullish flow, and bearish flow").
    Ordering is this axis; bullish/bearish is the DIRECTION axis (beam sides /
    sentiment control), so the two compose — largest bullish premium is
    Premium + a green beam click, not a fifth preset. */
type TapeView = 'STREAM' | 'NOTABLE' | 'PREMIUM' | 'SIZE';

const VIEW_META: Record<TapeView, { label: string; subtitle: string; hint: string }> = {
  STREAM: { label: 'Stream', subtitle: 'streaming prints — newest first', hint: "The clock's order, newest first" },
  NOTABLE: {
    label: 'Notable',
    subtitle: 'notable flow — ranked by premium, size, OTM distance and aggression',
    hint: 'Conviction-ranked — the prints that matter most first',
  },
  PREMIUM: { label: 'Premium', subtitle: 'largest premium first', hint: 'Biggest dollars first' },
  SIZE: { label: 'Size', subtitle: 'largest size first', hint: 'Most contracts first' },
};
type SentFilter = 'ALL' | PrintSentiment;
type PremKey = '0' | '100000' | '500000' | '1000000';

const PREM_CHIPS: { value: Exclude<PremKey, '0'>; label: string }[] = [
  { value: '100000', label: '≥$100K' },
  { value: '500000', label: '≥$500K' },
  { value: '1000000', label: '≥$1M' },
];

/** Column-header jargon → its Term key (the ColumnChooser keeps plain
    strings; only the rendered <th> wears the dotted explainer). */
const HEADER_TERM: Record<string, TermKey | undefined> = {
  expDte: 'Exp · DTE',
  otm: 'OTM',
  spread: 'Spread',
  prem: 'Prem',
  flow: 'Flow',
  dayRatio: 'Day ratio',
  sentiment: 'Sentiment',
  deltaOi: 'ΔOI',
  volOverOi: 'V/OI',
  iv: 'IV',
  tag: 'Tag',
};

/** Whale prints get an edge accent (row-level structure, not rainbow text). */
const rowAccent = (premium: number): string =>
  premium >= 1_000_000
    ? 'shadow-[inset_2px_0_0_0_rgba(234,0,255,0.75)]'
    : premium >= 250_000
      ? 'shadow-[inset_2px_0_0_0_rgba(255,149,0,0.5)]'
      : '';

/* One tape row, MEMOIZED — the desk cadence law applied to the tape (Noah,
   2026-08-18: the page was "buffering and resizing itself"). The context
   ticks every second, and reconciling 120 rows × 17 cells each tick was the
   stutter. A print never changes after it lands, so a row's props only move
   when it mounts, gets marked, or is the open drilldown — everything else
   bails out shallow. Declared below rowAccent; the parent hands it stable
   callbacks (useCallback) and memoized column arrays or the bail-out is
   defeated. */
const TapeRow = memo(
  ({
    r,
    rank,
    isOpen,
    isMarked,
    shownColumns,
    firstInGroup,
    onOpen,
    onMark,
  }: {
    r: FlowPrint;
    /** Set only in the Notable view — the conviction rank (score stays internal) */
    rank?: number;
    isOpen: boolean;
    isMarked: boolean;
    shownColumns: TapeColumn[];
    firstInGroup: Set<string>;
    onOpen: (p: FlowPrint) => void;
    onMark: (id: number) => void;
  }) => {
    const sent = sentimentOf(r);
    return (
      <tr
        onClick={() => onOpen(r)}
        title="Open the print drilldown"
        className={`border-b border-borderSubtle/30 last:border-0 animate-slide-in cursor-pointer transition-colors ${
          isOpen ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'
        } ${rowAccent(r.premium)}`}
      >
        {/* Time rail — always on */}
        <td className="px-2 py-1.5 bg-inset border-r border-borderSubtle/40 whitespace-nowrap">
          <span className="flex items-center gap-1.5">
            <button
              onClick={e => {
                // The star is its own control — bookmarking must
                // not also open the drilldown.
                e.stopPropagation();
                onMark(r.id);
              }}
              className={`transition-colors ${isMarked ? 'text-select' : 'text-textMuted/40 hover:text-textSecondary'}`}
              aria-label="Track print"
            >
              <Bookmark className="w-3 h-3" fill={isMarked ? 'currentColor' : 'none'} />
            </button>
            {rank !== undefined && (
              <span className="w-7 shrink-0 font-mono text-[10px] font-bold tnum text-textPrimary">#{rank}</span>
            )}
            <span className="font-mono text-[10px] tnum text-textMuted">{r.time}</span>
          </span>
        </td>

        {shownColumns.map(c => (
          <td
            key={c.key}
            className={`px-2 py-1.5 whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'} ${
              firstInGroup.has(c.key) ? 'border-l border-borderSubtle/30' : ''
            }`}
          >
            {c.cell(r, sent)}
          </td>
        ))}
      </tr>
    );
  }
);
TapeRow.displayName = 'TapeRow';

/** The terminal's read of the tape — same voice as market notes. */
function tapeRead(rows: FlowPrint[], summary: TapeSummary): string {
  if (rows.length === 0) return 'Awaiting prints…';
  const zdte = rows.filter(r => r.dte === 0).length;
  const parts = [
    `${summary.bullish ? 'Bullish' : 'Bearish'} tape — ${
      summary.bullish ? 'aggressive call buying leads' : 'put premium leads'
    } by ${fmtUsd(Math.abs(summary.netPremium))}`,
  ];
  if (summary.largest)
    parts.push(
      `largest print ${summary.largest.ticker} ${summary.largest.strike}${summary.largest.right} at ${fmtUsd(summary.largest.premium)}`
    );
  if (summary.sweeps > 2) parts.push(`${summary.sweeps} sweeps on the tape`);
  if (rows.length >= 20 && zdte / rows.length > 0.25) parts.push(`0DTE is ${Math.round((zdte / rows.length) * 100)}% of flow`);
  return `${parts.join(' · ')}.`;
}

// ---- session beam ---------------------------------------------------------------
/*
  The tape's aggregates as ONE instrument — replaces the six-stat-card wall
  (Noah, 2026-08-18: "ai slob that every single website has"), and deliberately
  does NOT re-draw the stream: the table below already owns per-print detail
  (his follow-up: "that didnt mean make the same thing twice"). The beam is a
  tug-of-war over directional premium — bull dollars fill from the left, bear
  dollars from the right, and the SEAM'S POSITION is the session verdict, so
  the label rides it instead of sitting in a labeled box. Composition (call/put
  premium, sweeps vs blocks) is spoken beside it, and the whale chip is the one
  door up here: the largest print, click for its drilldown. Aggregates above,
  prints below — nothing rendered twice.
*/
/** The house glide for the beam's geometry — compositor-only (transform), so
    it stays silky while the table below re-renders every streaming tick.
    Width/left transitions ran on layout and stuttered (Noah, 2026-08-18:
    "so laggy and slow"). */
const BEAM_GLIDE = 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1)';

const SessionBeam = ({
  rows,
  summary,
  label,
  sub,
  empty,
  sentFilter,
  onSentFilter,
  onOpen,
}: {
  /** The prints in the beam's SCOPE — the active view, not always the session */
  rows: FlowPrint[];
  summary: TapeSummary;
  /** Scope name: "Session flow", "NVDA flow", "Filtered flow" */
  label: string;
  sub: string;
  empty: string;
  /** The beam's sides are filter doors (Noah, 2026-08-19): click a side to
      isolate that sentiment on the tape, click again to let go. */
  sentFilter: SentFilter;
  onSentFilter: (v: SentFilter) => void;
  onOpen: (p: FlowPrint) => void;
}) => {
  // The whales, split by direction (Noah, 2026-08-19: "way more useful for
  // reading direction") — largest bullish, largest bearish, and the overall
  // largest, which is usually one of those two and only earns its own row
  // when it traded mid.
  const whales = useMemo(() => {
    let all: FlowPrint | null = null;
    let bull: FlowPrint | null = null;
    let bear: FlowPrint | null = null;
    for (const p of rows) {
      if (!all || p.premium > all.premium) all = p;
      const s = sentimentOf(p);
      if (s === 'BULLISH' && (!bull || p.premium > bull.premium)) bull = p;
      if (s === 'BEARISH' && (!bear || p.premium > bear.premium)) bear = p;
    }
    return { all, bull, bear };
  }, [rows]);

  // UNROUNDED for geometry: rounding first made the seam sit frozen and then
  // hop a whole percent — sub-percent drift is exactly what should glide.
  const dirTotal = summary.bullPremium + summary.bearPremium;
  const bullPct = dirTotal > 0 ? (summary.bullPremium / dirTotal) * 100 : 50;
  const bearish = bullPct < 50;
  const shownPct = Math.round(bearish ? 100 - bullPct : bullPct);
  // The verdict label rides the seam; clamped so it never clips an edge.
  const seam = Math.min(90, Math.max(10, bullPct));

  return (
    <div className="border border-borderSubtle bg-panel rounded-md px-3.5 py-2.5 flex items-center gap-6">
      {/* The scope's weight — the label IS the scope, so a filtered strip can
          never be misread as the market. min-w so a digit-count change
          ($9.9M -> $10.1M) doesn't nudge the beam. */}
      <div className="shrink-0 select-none min-w-[104px]">
        <div className="font-mono text-[9px] uppercase tracking-widest text-textSecondary">{label}</div>
        <div className="font-mono text-[17px] leading-6 font-bold tnum text-textPrimary">{fmtUsd(summary.totalPremium)}</div>
        <div className="font-mono text-[9px] text-textMuted tnum">{sub}</div>
      </div>

      {/* The beam — directional premium as a tug-of-war; the seam is the verdict */}
      {rows.length === 0 ? (
        <div className="flex-1 min-w-0 h-[38px] flex items-center justify-center border border-dashed border-borderSubtle rounded font-mono text-[10px] text-textMuted uppercase tracking-widest select-none">
          {empty}
        </div>
      ) : (
        <div className="flex-1 min-w-0 select-none">
          {/* The label rides the seam on the same glide as the bar — a
              full-width rail translated by the seam %, label hanging at its
              left edge (translateX % is compositor-cheap; `left` is not). */}
          <div className="relative h-[16px]">
            <span className="absolute inset-x-0 top-0" style={{ transform: `translateX(${seam}%)`, transition: BEAM_GLIDE }}>
              <span
                className={`absolute left-0 -translate-x-1/2 font-mono text-[11px] font-bold tnum whitespace-nowrap ${
                  bearish ? 'text-bear' : 'text-bull'
                }`}
              >
                {shownPct}% {bearish ? 'BEAR' : 'BULL'}
              </span>
            </span>
          </div>
          {/* BOTH sides are composited scaleX layers — bull from the left,
              bear from the right — so they rasterize identically. Scaling
              green over a static red ground put the two on different
              pixel-snapping paths, and the green layer could land half a
              device pixel low, exposing a red sliver along the top edge
              (Noah, 2026-08-18: "red is on top a bit"). The tick rides the
              seam and covers the junction. */}
          <div className="relative h-[12px] rounded-sm overflow-hidden bg-white/[0.05]">
            <span
              className="absolute inset-0 origin-left bg-bull/90"
              style={{ transform: `scaleX(${bullPct / 100})`, transition: BEAM_GLIDE }}
            />
            <span
              className="absolute inset-0 origin-right bg-bear/80"
              style={{ transform: `scaleX(${(100 - bullPct) / 100})`, transition: BEAM_GLIDE }}
            />
            <span className="absolute inset-0 pointer-events-none" style={{ transform: `translateX(${bullPct}%)`, transition: BEAM_GLIDE }}>
              {/* Dark guards flank the white core (the heatmap king-ring trick):
                  at fractional positions the tick's antialiased edges blended
                  into green on one side and red on the other — two different
                  halo colors that read as asymmetry (Noah, 2026-08-18). With
                  guards, white always meets dark, identically on both sides,
                  and the fills' own seam edges hide underneath. */}
              <span className="absolute left-0 top-0 bottom-0 w-[6px] -translate-x-1/2 flex">
                <span className="w-[2px] h-full bg-[#0a0a0a]" />
                <span className="w-[2px] h-full bg-[#ededed]" />
                <span className="w-[2px] h-full bg-[#0a0a0a]" />
              </span>
            </span>
            {/* The sides are the filter. With a sentiment already isolated the
                beam is one color, so the whole bar becomes the way back out. */}
            {sentFilter === 'ALL' ? (
              <>
                <button
                  aria-label="Filter the tape to bullish prints"
                  title="Show only bullish prints"
                  onClick={() => onSentFilter('BULLISH')}
                  className="absolute inset-y-0 left-0 z-10 cursor-pointer hover:bg-white/[0.09] transition-colors"
                  style={{ width: `${bullPct}%` }}
                />
                <button
                  aria-label="Filter the tape to bearish prints"
                  title="Show only bearish prints"
                  onClick={() => onSentFilter('BEARISH')}
                  className="absolute inset-y-0 right-0 z-10 cursor-pointer hover:bg-white/[0.09] transition-colors"
                  style={{ width: `${100 - bullPct}%` }}
                />
              </>
            ) : (
              <button
                aria-label="Clear the sentiment filter"
                title="Back to the whole tape"
                onClick={() => onSentFilter('ALL')}
                className="absolute inset-0 z-10 cursor-pointer hover:bg-white/[0.09] transition-colors"
              />
            )}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[9px] tnum">
            <span className="text-bull">{fmtUsd(summary.bullPremium)} bull</span>
            <span className="text-bear">bear {fmtUsd(summary.bearPremium)}</span>
          </div>
        </div>
      )}

      {/* Composition — spoken, not boxed. min-w keeps the beam from breathing
          as the dollar strings change length. */}
      <div className="shrink-0 text-right select-none min-w-[190px]">
        <div className="font-mono text-[11px] tnum leading-5">
          <span className="text-bull font-semibold">{summary.callCount}C</span>
          <span className="text-textMuted tnum"> {fmtUsd(summary.callPremium)} </span>
          <span className="text-textMuted">/</span>
          <span className="text-bear font-semibold"> {summary.putCount}P</span>
          <span className="text-textMuted tnum"> {fmtUsd(summary.putPremium)}</span>
        </div>
        <div className="font-mono text-[10px] text-textMuted tnum leading-4">
          <span className="text-warn">{summary.sweeps} sweeps</span> · {summary.blocks} blocks
        </div>
      </div>

      {/* The whales, in the magenta frame (Noah, 2026-08-19: the plain list
          "looks generic. i liked the big magenta look"). The chip is the
          whale-family door it always was; inside it the OVERALL largest is
          the hero line and the other side's largest rides below in half
          voice — a mid-side hero gets both sides beneath it. Every line is
          a door to its drilldown; size × fill rides the title. min-h covers
          the two-secondary case per the never-resize law. */}
      {whales.all &&
        (() => {
          const hero = whales.all;
          const heroSent = sentimentOf(hero);
          const heroWord = heroSent === 'BULLISH' ? 'Bull' : heroSent === 'BEARISH' ? 'Bear' : 'Mid';
          const heroInk = heroSent === 'BULLISH' ? 'text-bull' : heroSent === 'BEARISH' ? 'text-bear' : 'text-textSecondary';
          const others = (
            [
              { key: 'bull', p: whales.bull, word: 'Bull', ink: 'text-bull' },
              { key: 'bear', p: whales.bear, word: 'Bear', ink: 'text-bear' },
            ] as { key: string; p: FlowPrint | null; word: string; ink: string }[]
          ).filter((o): o is { key: string; p: FlowPrint; word: string; ink: string } => !!o.p && o.p !== hero);
          const door = (p: FlowPrint) => `${p.size.toLocaleString()} × $${p.fill.toFixed(2)} · open the drilldown`;
          return (
            <div className="shrink-0 flex flex-col justify-center rounded-md border border-[#EA00FF]/40 bg-[#EA00FF]/[0.06] px-2.5 py-1.5 min-w-[236px] min-h-[64px] select-none">
              <span className="flex items-baseline gap-2">
                <span className="font-mono text-[8px] font-semibold uppercase tracking-widest text-[#EA00FF]">
                  Largest prints
                </span>
                <span className={`ml-auto font-mono text-[8px] font-semibold uppercase tracking-wider ${hero.sweep ? 'text-warn' : 'text-textMuted'}`}>
                  {hero.sweep ? 'Sweep' : 'Block'}
                </span>
              </span>
              <button
                onClick={() => onOpen(hero)}
                title={door(hero)}
                className="flex items-baseline gap-1.5 w-full text-left rounded font-mono tnum hover:bg-[#EA00FF]/[0.08] transition-colors"
              >
                <span className={`shrink-0 text-[8px] font-semibold uppercase tracking-wider ${heroInk}`}>{heroWord}</span>
                <span className="text-[11px] leading-4 font-bold text-textPrimary whitespace-nowrap">
                  {hero.ticker} {hero.strike}
                  {hero.right}
                  <span className={`font-normal ${hero.dte === 0 ? 'text-warn' : 'text-textSecondary'}`}> · {hero.dte}d</span>
                </span>
                <span className="text-[11px] leading-4 font-bold text-textPrimary">{fmtUsd(hero.premium)}</span>
                <span className="ml-auto text-[9px] text-textMuted whitespace-nowrap">{hero.time}</span>
              </button>
              {others.map(o => (
                <button
                  key={o.key}
                  onClick={() => onOpen(o.p)}
                  title={door(o.p)}
                  className="flex items-baseline gap-1.5 w-full text-left rounded font-mono tnum hover:bg-[#EA00FF]/[0.08] transition-colors"
                >
                  <span className={`shrink-0 text-[8px] font-semibold uppercase tracking-wider ${o.ink}`}>{o.word}</span>
                  <span className="text-[9px] leading-4 text-textSecondary whitespace-nowrap">
                    {o.p.ticker} {o.p.strike}
                    {o.p.right} · {o.p.dte}d · <span className="font-bold text-textPrimary">{fmtUsd(o.p.premium)}</span>
                    {o.p.sweep && <span className="text-warn font-semibold"> · sweep</span>}
                  </span>
                  <span className="ml-auto text-[9px] text-textMuted whitespace-nowrap">{o.p.time}</span>
                </button>
              ))}
            </div>
          );
        })()}
    </div>
  );
};

// ---- cells ----------------------------------------------------------------------
const SpreadCell = ({ print }: { print: FlowPrint }) => {
  const dot = print.side === 'ASK' ? 'bg-bull' : print.side === 'BID' ? 'bg-bear' : 'bg-white/50';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-[9px] tnum text-textMuted">{print.bid.toFixed(2)}</span>
      <span className="relative w-12 h-[3px] rounded-full bg-white/[0.07]">
        <span
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[6px] h-[6px] rounded-full ${dot}`}
          style={{ left: `${print.fillPos * 100}%` }}
        />
      </span>
      <span className="font-mono text-[9px] tnum text-textMuted">{print.ask.toFixed(2)}</span>
    </span>
  );
};

/** Side + conviction read. BUY = hit the ask, SELL = hit the bid. The flow
    grade itself is engine-internal (Noah, 2026-08-16) — the centered bar's
    reach and side carry the conviction. */
const FlowCell = ({ print }: { print: FlowPrint }) => {
  const score = print.flowScore;
  const bar = score > 15 ? 'bg-bull/90' : score < -15 ? 'bg-bear/80' : 'bg-white/25';
  const half = Math.abs(score) / 2;
  const sideLabel = print.side === 'ASK' ? 'BUY' : print.side === 'BID' ? 'SELL' : 'MID';
  return (
    <span className="inline-flex flex-col items-start gap-[3px] w-16">
      <span
        className={`inline-flex w-9 justify-center rounded border px-1 py-px font-mono text-[9px] font-semibold ${
          print.side === 'ASK'
            ? 'border-bull/30 bg-bull/[0.07] text-bull'
            : print.side === 'BID'
              ? 'border-bear/30 bg-bear/[0.07] text-bear'
              : 'border-borderSubtle text-textMuted'
        }`}
      >
        {sideLabel}
      </span>
      <span className="relative w-16 h-[3px] rounded-full bg-white/[0.07]">
        <span className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20" />
        <span
          className={`absolute top-0 bottom-0 rounded-full ${bar}`}
          style={score >= 0 ? { left: '50%', width: `${half}%` } : { right: '50%', width: `${half}%` }}
        />
      </span>
    </span>
  );
};

const RatioCell = ({ print }: { print: FlowPrint }) => {
  const tone = print.ratioLabel === 'MID' ? 'text-textMuted' : print.ratioBidPct >= 50 ? 'text-bear' : 'text-bull';
  return (
    <span className="inline-flex flex-col items-end gap-[3px] w-16">
      <span className={`font-mono text-[9px] font-semibold uppercase tracking-wide tnum leading-[14px] ${tone}`}>
        {print.ratioLabel}
      </span>
      <span className="flex w-16 h-[3px] rounded-full overflow-hidden bg-white/[0.06]">
        <span className="h-full bg-bear/80" style={{ width: `${print.ratioBidPct}%` }} />
        <span className="h-full bg-bull/90" style={{ width: `${100 - print.ratioBidPct}%` }} />
      </span>
    </span>
  );
};

const SENT_TEXT: Record<PrintSentiment, string> = {
  BULLISH: 'text-bull',
  BEARISH: 'text-bear',
  NEUTRAL: 'text-textMuted',
};

// ---- column model ---------------------------------------------------------------
// One definition per column, grouped like the exposure/pressure matrices. The
// row is rendered from whichever of these the user has left switched on, so the
// two-tier header and the cells never drift out of sync.
type TapeGroup = 'Contract' | 'Execution' | 'Conviction' | 'Activity';
const TAPE_GROUP_ORDER: TapeGroup[] = ['Contract', 'Execution', 'Conviction', 'Activity'];

interface TapeColumn {
  key: string;
  group: TapeGroup;
  label: string;
  align?: 'right';
  cell: (r: FlowPrint, sent: PrintSentiment) => React.ReactNode;
}

const TAPE_COLUMNS: TapeColumn[] = [
  {
    key: 'print',
    group: 'Contract',
    label: 'Print',
    cell: r => (
      <>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${
            r.right === 'C' ? 'border-bull/30 bg-bull/10 text-bull' : 'border-bear/30 bg-bear/10 text-bear'
          }`}
        >
          {r.ticker} {r.strike}
          {r.right}
        </span>
        {r.legs > 1 && <span className="ml-1.5 font-mono text-[9px] text-select">×{r.legs}</span>}
      </>
    ),
  },
  {
    key: 'expDte',
    group: 'Contract',
    label: 'Exp · DTE',
    align: 'right',
    cell: r => (
      <span className="font-mono text-[10px] tnum text-textSecondary">
        {r.expiry.slice(0, 5)} · <span className={r.dte === 0 ? 'text-warn font-semibold' : ''}>{r.dte}d</span>
      </span>
    ),
  },
  {
    key: 'otm',
    group: 'Contract',
    label: 'OTM',
    align: 'right',
    cell: r => (
      <span className={`font-mono text-[10px] tnum ${r.otmPct >= 0 ? 'text-bull' : 'text-bear'}`}>
        {r.otmPct >= 0 ? '+' : ''}
        {r.otmPct.toFixed(1)}%
      </span>
    ),
  },
  {
    key: 'spot',
    group: 'Contract',
    label: 'Spot',
    align: 'right',
    cell: r => <span className="font-mono text-[10px] tnum text-textSecondary">${r.spot.toFixed(2)}</span>,
  },
  {
    key: 'fill',
    group: 'Execution',
    label: 'Fill',
    align: 'right',
    cell: r => <span className="font-mono text-[11px] tnum font-semibold text-textPrimary">${r.fill.toFixed(2)}</span>,
  },
  {
    key: 'spread',
    group: 'Execution',
    label: 'Spread',
    cell: r => <SpreadCell print={r} />,
  },
  {
    key: 'size',
    group: 'Execution',
    label: 'Size',
    align: 'right',
    cell: r => <span className="font-mono text-[11px] tnum text-textPrimary">{r.size.toLocaleString()}</span>,
  },
  {
    key: 'prem',
    group: 'Execution',
    label: 'Prem',
    align: 'right',
    cell: r => (
      <span className={`font-mono text-[11px] tnum ${r.premium >= 250_000 ? 'font-bold text-textPrimary' : 'text-textSecondary'}`}>
        {fmtUsd(r.premium)}
      </span>
    ),
  },
  {
    key: 'flow',
    group: 'Conviction',
    label: 'Flow',
    cell: r => <FlowCell print={r} />,
  },
  {
    key: 'dayRatio',
    group: 'Conviction',
    label: 'Day Ratio',
    align: 'right',
    cell: r => <RatioCell print={r} />,
  },
  {
    key: 'sentiment',
    group: 'Conviction',
    label: 'Sentiment',
    align: 'right',
    cell: (_r, sent) => <span className={`font-mono text-[10px] font-semibold ${SENT_TEXT[sent]}`}>{sent}</span>,
  },
  {
    key: 'vol',
    group: 'Activity',
    label: 'Vol',
    align: 'right',
    cell: r => <span className="font-mono text-[10px] tnum text-textSecondary">{r.volume.toLocaleString()}</span>,
  },
  {
    key: 'oi',
    group: 'Activity',
    label: 'OI',
    align: 'right',
    cell: r => <span className="font-mono text-[10px] tnum text-textSecondary">{r.oi.toLocaleString()}</span>,
  },
  {
    key: 'deltaOi',
    group: 'Activity',
    label: 'ΔOI',
    align: 'right',
    cell: r =>
      r.deltaOI === 0 ? (
        <span className="font-mono text-[10px] tnum text-textMuted">—</span>
      ) : (
        <span className={`font-mono text-[10px] tnum ${r.deltaOI > 0 ? 'text-bull' : 'text-bear'}`}>
          {r.deltaOI > 0 ? '↑' : '↓'}
          {Math.abs(r.deltaOI).toLocaleString()}
        </span>
      ),
  },
  {
    key: 'volOverOi',
    group: 'Activity',
    label: 'V/OI',
    align: 'right',
    cell: r => (
      <span className={`font-mono text-[10px] tnum ${r.volOverOI >= 5 ? 'text-warn font-semibold' : 'text-textSecondary'}`}>
        {r.volOverOI.toFixed(2)}x
      </span>
    ),
  },
  {
    key: 'iv',
    group: 'Activity',
    label: 'IV',
    align: 'right',
    cell: r => <span className="font-mono text-[10px] tnum text-textSecondary">{r.iv.toFixed(1)}%</span>,
  },
  {
    key: 'tag',
    group: 'Activity',
    label: 'Tag',
    cell: r => (
      <span className="font-mono text-[9px] text-textMuted whitespace-nowrap">
        {r.sweep ? <span className="text-warn font-semibold">SWEEP</span> : r.strat}
      </span>
    ),
  },
];

const ALL_COL_KEYS = TAPE_COLUMNS.map(c => c.key);

function loadCols(): Set<string> {
  try {
    const raw = localStorage.getItem(COLS_KEY);
    if (raw) {
      const arr: unknown = JSON.parse(raw);
      if (Array.isArray(arr) && arr.every(x => typeof x === 'string')) {
        return new Set(arr.filter(k => ALL_COL_KEYS.includes(k)));
      }
    }
  } catch {
    /* fall through */
  }
  return new Set(ALL_COL_KEYS);
}

// ---- search (ticker OR contract, with suggestions) ------------------------------
/** One matcher for the field and the row filter: strip everything but letters
    and digits so "SPY 505C", "spy505c" and "505C" all hit SPY 505C. */
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const matchesTape = (r: FlowPrint, nq: string) =>
  nq === '' || norm(`${r.ticker}${r.strike}${r.right}`).includes(nq);

interface TapeSuggestion {
  key: string;
  kind: 'ticker' | 'contract';
  query: string; // what the field becomes when picked
  primary: string; // shown symbol
  right?: 'C' | 'P';
  sub: string; // print count · premium
}

/** A terminal-native combobox: search by ticker or by contract, with live
    suggestions the moment the field is focused — so the desk names what it sees
    on the tape instead of making you type it out. Lights lime when filtering,
    keyboard-driven, matching the button family (no generic search dropdown). */
const TapeSearch = ({ value, onChange, rows }: { value: string; onChange: (v: string) => void; rows: FlowPrint[] }) => {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const nq = norm(value);
  const active = value.length > 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const { tickers, contracts } = useMemo(() => {
    const tick = new Map<string, { count: number; prem: number }>();
    const con = new Map<string, { count: number; prem: number; right: 'C' | 'P' }>();
    for (const r of rows) {
      const t = tick.get(r.ticker) ?? { count: 0, prem: 0 };
      t.count += 1;
      t.prem += r.premium;
      tick.set(r.ticker, t);
      const ck = `${r.ticker} ${r.strike}${r.right}`;
      const c = con.get(ck) ?? { count: 0, prem: 0, right: r.right };
      c.count += 1;
      c.prem += r.premium;
      con.set(ck, c);
    }
    const tickers: TapeSuggestion[] = [...tick.entries()]
      .filter(([tk]) => nq === '' || norm(tk).includes(nq))
      .sort((a, b) => b[1].prem - a[1].prem)
      .slice(0, nq === '' ? 5 : 4)
      .map(([tk, v]) => ({ key: `t-${tk}`, kind: 'ticker', query: tk, primary: tk, sub: `${v.count} prints · ${fmtUsd(v.prem)}` }));
    const contracts: TapeSuggestion[] = [...con.entries()]
      .filter(([ck]) => nq === '' || norm(ck).includes(nq))
      .sort((a, b) => b[1].prem - a[1].prem)
      .slice(0, nq === '' ? 4 : 6)
      .map(([ck, v]) => ({ key: `c-${ck}`, kind: 'contract', query: ck, primary: ck, right: v.right, sub: `${v.count}× · ${fmtUsd(v.prem)}` }));
    return { tickers, contracts };
  }, [rows, nq]);

  const flat = [...tickers, ...contracts];
  const clampedHi = Math.min(hi, Math.max(0, flat.length - 1));

  const pick = (s: TapeSuggestion) => {
    onChange(s.query);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setHi(h => Math.min(h + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && flat[clampedHi]) {
        e.preventDefault();
        pick(flat[clampedHi]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const renderRow = (s: TapeSuggestion, idx: number) => (
    <button
      key={s.key}
      onMouseEnter={() => setHi(idx)}
      onMouseDown={e => {
        e.preventDefault(); // keep focus; select before the field blurs
        pick(s);
      }}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors ${
        idx === clampedHi ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
      }`}
    >
      {s.kind === 'contract' ? (
        <span className={`inline-flex w-3.5 justify-center font-mono text-[9px] font-bold ${s.right === 'C' ? 'text-bull' : 'text-bear'}`}>
          {s.right}
        </span>
      ) : (
        <span className="inline-flex w-3.5 justify-center font-mono text-[9px] text-textMuted">/</span>
      )}
      <span className="font-mono text-[11px] font-semibold text-textPrimary">{s.primary}</span>
      <span className="ml-auto font-mono text-[9px] tnum text-textMuted">{s.sub}</span>
    </button>
  );

  return (
    <div ref={rootRef} className="relative">
      <div
        className={`inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-md border transition-colors ${
          active ? 'border-select/60 bg-select/10' : 'border-borderSubtle bg-white/[0.02] focus-within:border-borderMuted'
        }`}
      >
        <Search className={`w-3 h-3 shrink-0 ${active ? 'text-select' : 'text-textMuted'}`} />
        <input
          value={value}
          onChange={e => {
            onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9 .]/g, '').slice(0, 12));
            setOpen(true);
            setHi(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="TICKER / CONTRACT"
          aria-label="Search tape by ticker or contract"
          className="w-[132px] bg-transparent font-mono text-[11px] font-semibold uppercase tracking-wider text-textPrimary placeholder:text-textMuted placeholder:font-normal focus:outline-none"
        />
        {active && (
          <button
            onMouseDown={e => {
              e.preventDefault();
              onChange('');
            }}
            aria-label="Clear search"
            className="text-select/70 hover:text-select transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {open && flat.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-40 w-[236px] border border-borderMuted bg-panel rounded-md shadow-2xl shadow-black/60 overflow-hidden animate-slide-in">
          {tickers.length > 0 && (
            <>
              <div className="px-2.5 pt-1.5 pb-1 font-mono text-[9px] font-bold uppercase tracking-widest text-textMuted">Tickers</div>
              {tickers.map((s, i) => renderRow(s, i))}
            </>
          )}
          {contracts.length > 0 && (
            <>
              <div className="px-2.5 pt-1.5 pb-1 font-mono text-[9px] font-bold uppercase tracking-widest text-textMuted border-t border-borderSubtle">
                Contracts
              </div>
              {contracts.map((s, i) => renderRow(s, tickers.length + i))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ---- column chooser --------------------------------------------------------------
const ColumnChooser = ({
  visible,
  onToggleColumn,
  onToggleGroup,
  onAll,
  onNone,
}: {
  visible: Set<string>;
  onToggleColumn: (key: string) => void;
  onToggleGroup: (group: TapeGroup) => void;
  onAll: () => void;
  onNone: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const shownCount = TAPE_COLUMNS.filter(c => visible.has(c.key)).length;

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border font-mono text-[10px] uppercase tracking-wider transition-colors ${
          open ? 'border-borderMuted bg-white/[0.05] text-textPrimary' : 'border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary'
        }`}
      >
        <SlidersHorizontal className="w-3 h-3" />
        Columns
        <span className="tnum text-textMuted">
          {shownCount}/{TAPE_COLUMNS.length}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 w-[236px] border border-borderMuted bg-panel rounded-md shadow-2xl shadow-black/60 overflow-hidden animate-slide-in">
          <div className="flex items-center justify-between px-3 py-2 border-b border-borderSubtle">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-textPrimary">Row columns</span>
            <div className="flex items-center gap-2">
              <button onClick={onAll} className="font-mono text-[9px] uppercase tracking-wider text-textSecondary hover:text-select transition-colors">
                All
              </button>
              <span className="text-borderMuted">·</span>
              <button onClick={onNone} className="font-mono text-[9px] uppercase tracking-wider text-textSecondary hover:text-select transition-colors">
                None
              </button>
            </div>
          </div>
          <div className="max-h-[340px] overflow-y-auto py-1">
            {TAPE_GROUP_ORDER.map(group => {
              const cols = TAPE_COLUMNS.filter(c => c.group === group);
              const on = cols.filter(c => visible.has(c.key)).length;
              return (
                <div key={group} className="px-1 py-0.5">
                  {/* Group header doubles as a show/hide-all-in-group toggle */}
                  <button
                    onClick={() => onToggleGroup(group)}
                    className="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-white/[0.03] transition-colors group/hdr"
                  >
                    <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-textMuted group-hover/hdr:text-textSecondary transition-colors">
                      {group}
                    </span>
                    <span className="font-mono text-[9px] tnum text-textMuted">
                      {on}/{cols.length}
                    </span>
                  </button>
                  {cols.map(c => {
                    const checked = visible.has(c.key);
                    return (
                      <button
                        key={c.key}
                        onClick={() => onToggleColumn(c.key)}
                        className="w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded hover:bg-white/[0.03] transition-colors"
                      >
                        <span
                          className={`inline-flex w-3.5 h-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
                            checked ? 'bg-select border-select' : 'border-borderMuted'
                          }`}
                        >
                          {checked && <Check className="w-2.5 h-2.5 text-[#0a0a0a]" />}
                        </span>
                        <span className={`font-mono text-[11px] ${checked ? 'text-textPrimary' : 'text-textSecondary'}`}>{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// Grouped two-tier header — same grammar as the exposure / pressure matrices
/** Streaming rich options prints in the house grammar — session strip, filters, multi-ticker. */
const LiveTape = () => {
  const { marketData } = useMarketData();
  const [rows, setRows] = useState<FlowPrint[]>([]);
  const [paused, setPaused] = useState(false);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [read, setRead] = useState('Awaiting prints…');
  const [flowFilter, setFlowFilter] = useState<FlowFilter>('ALL');
  const [sentFilter, setSentFilter] = useState<SentFilter>('ALL');
  const [minPremKey, setMinPremKey] = useState<PremKey>('0');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCols, setVisibleCols] = useState<Set<string>>(loadCols);
  const [view, setView] = useState<TapeView>('STREAM');
  /** The print open in the drilldown. Held as the OBJECT, not an id: the tape
      buffer is capped, so a print the user is reading eventually scrolls out of
      it — looking it up by id would silently close the drilldown mid-read. */
  const [openPrint, setOpenPrint] = useState<FlowPrint | null>(null);
  const idRef = useRef(0);
  const lastReadRef = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(COLS_KEY, JSON.stringify([...visibleCols]));
    } catch {
      /* non-fatal */
    }
  }, [visibleCols]);

  const toggleColumn = (key: string) =>
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleGroup = (group: TapeGroup) =>
    setVisibleCols(prev => {
      const keys = TAPE_COLUMNS.filter(c => c.group === group).map(c => c.key);
      const allOn = keys.every(k => prev.has(k));
      const next = new Set(prev);
      keys.forEach(k => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });

  useEffect(() => {
    if (!marketData || paused) return;
    const fresh = marketData.tape.map(o => enrichPrint(o, ++idRef.current));
    if (fresh.length === 0) return;
    setRows(prev => [...fresh, ...prev].slice(0, MAX_ROWS));
  }, [marketData, paused]);

  const summary = useMemo(() => summarizeTape(rows), [rows]);

  const filtered = useMemo(() => {
    const minPrem = Number(minPremKey);
    const nq = norm(searchQuery);
    return rows.filter(
      r =>
        (flowFilter === 'ALL' || (flowFilter === 'SWEEP' ? r.sweep : !r.sweep)) &&
        (sentFilter === 'ALL' || sentimentOf(r) === sentFilter) &&
        r.premium >= minPrem &&
        matchesTape(r, nq)
    );
  }, [rows, flowFilter, sentFilter, minPremKey, searchQuery]);

  // The beam and the tape read FOLLOW THE ACTIVE VIEW (Noah, 2026-08-18): an
  // NVDA-filtered table under a market-wide verdict and an SPY whale silently
  // answered two different questions. The strip renames itself to its scope so
  // it can never be misread; clearing filters restores the session's truth.
  // What the table actually shows: the filtered view, in the view's order.
  // Ranked views re-sort per tick, but big prints hold their ranks — only the
  // tail churns, and keyed reorders are DOM moves, not re-renders.
  const displayRows = useMemo(() => {
    switch (view) {
      case 'NOTABLE':
        return rankNotable(filtered);
      case 'PREMIUM':
        return [...filtered].sort((a, b) => b.premium - a.premium);
      case 'SIZE':
        return [...filtered].sort((a, b) => b.size - a.size);
      default:
        return filtered;
    }
  }, [view, filtered]);

  const scopeActive =
    searchQuery.trim() !== '' || flowFilter !== 'ALL' || sentFilter !== 'ALL' || minPremKey !== '0';
  const beamRows = scopeActive ? filtered : rows;
  const beamSummary = useMemo(
    () => (scopeActive ? summarizeTape(filtered) : summary),
    [scopeActive, filtered, summary]
  );
  const searchOnly =
    searchQuery.trim() !== '' && flowFilter === 'ALL' && sentFilter === 'ALL' && minPremKey === '0';
  const beamLabel = !scopeActive ? 'Session flow' : searchOnly ? `${searchQuery.trim().toUpperCase()} flow` : 'Filtered flow';
  const beamSub = scopeActive ? `${filtered.length} of ${rows.length} prints` : `${rows.length} prints on tape`;
  const beamEmpty = scopeActive ? 'No prints match this view' : 'Awaiting tape';

  // Which columns are on, in order, and which one leads each group (border-l)
  const shownColumns = useMemo(() => TAPE_COLUMNS.filter(c => visibleCols.has(c.key)), [visibleCols]);
  const firstInGroup = useMemo(() => {
    const first = new Set<string>();
    const seen = new Set<TapeGroup>();
    for (const c of shownColumns) {
      if (!seen.has(c.group)) {
        seen.add(c.group);
        first.add(c.key);
      }
    }
    return first;
  }, [shownColumns]);
  const shownGroups = useMemo(
    () =>
      TAPE_GROUP_ORDER.map(group => ({ group, count: shownColumns.filter(c => c.group === group).length })).filter(g => g.count > 0),
    [shownColumns]
  );
  const colCount = 1 + shownColumns.length;

  const topTickers = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.ticker, (m.get(r.ticker) ?? 0) + r.premium);
    return [...m.entries()]
      .map(([ticker, premium]) => ({ ticker, premium }))
      .sort((a, b) => b.premium - a.premium)
      .slice(0, 6);
  }, [rows]);
  const topMax = topTickers[0]?.premium ?? 1;

  // Dark-pool crosses for the rail — deterministic per ticker, so keyed on the
  // active symbol rather than every tick
  const activeTicker = marketData?.ticker;
  const darkPrints = useMemo(() => {
    if (!marketData) return [];
    return buildGexView(marketData, 'GEX', 10)
      .board.flatMap(t =>
        t.prints.map((p, i) => ({
          key: `${t.ticker}-${i}`,
          ticker: t.ticker,
          size: p.size,
          price: p.price,
          notional: p.notional,
          time: p.time,
          date: p.date,
        }))
      )
      .sort((a, b) => b.notional - a.notional)
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicker]);

  // The read speaks the same scope as the beam. A scope CHANGE bypasses the
  // 8s throttle — switching to NVDA and reading a market-wide sentence for
  // eight more seconds would be the same lie the beam just stopped telling.
  const scopeKey = `${searchQuery}|${flowFilter}|${sentFilter}|${minPremKey}`;
  const lastScopeRef = useRef(scopeKey);
  const emptyReadRef = useRef(true);
  useEffect(() => {
    const now = Date.now();
    const scopeChanged = scopeKey !== lastScopeRef.current;

    /*
      A STALE EMPTY-STATE MUST NOT OUTLIVE THE ARRIVAL OF PRINTS.

      The desk mounts before the first tick delivers anything, so the read is
      set to "No prints in this view." with nothing on screen — correct at that
      instant — and the throttle is stamped. The old guard then held that
      sentence for the next eight seconds, and its `beamRows.length > 3` clause
      made it worse rather than better: the early return only engaged ONCE
      prints existed, so the throttle protected the empty message precisely
      when it had become false. Every visit to /trace/live-tape opened with
      "No prints in this view." sitting directly above a full, streaming table
      and a counter reading "17 OF 17 PRINTS".

      So the throttle is bypassed whenever the standing read is the empty one
      and rows now exist. It still throttles the expensive part — re-narrating
      a tape that is merely growing.
    */
    const staleEmpty = emptyReadRef.current && beamRows.length > 0;
    if (!scopeChanged && !staleEmpty && now - lastReadRef.current < READ_INTERVAL_MS) return;

    lastScopeRef.current = scopeKey;
    lastReadRef.current = now;
    const empty = beamRows.length === 0;
    emptyReadRef.current = empty;
    setRead(empty ? 'No prints in this view.' : tapeRead(beamRows, beamSummary));
  }, [beamRows, beamSummary, scopeKey]);

  // Stable identity — TapeRow is memoized, and a fresh callback per render
  // would defeat every row's bail-out.
  const toggleMark = useCallback(
    (id: number) =>
      setMarked(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    []
  );

  // Drilldown navigation — stepping moves through the FILTERED view, so ↑/↓
  // walks exactly the rows the user is looking at. Once the open print has aged
  // out of the buffer it is no longer steerable, but it stays open and readable.
  const openIdx = openPrint ? displayRows.findIndex(r => r.id === openPrint.id) : -1;
  const stepPrint = (dir: -1 | 1) => {
    if (openIdx < 0) return;
    const next = openIdx + dir;
    if (next >= 0 && next < displayRows.length) setOpenPrint(displayRows[next]);
  };

  // ↑/↓ step through prints while the drilldown is open
  useEffect(() => {
    if (openPrint === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      stepPrint(e.key === 'ArrowUp' ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPrint, openIdx, displayRows]);

  return (
    <>
      {/* Session beam — the active view's aggregates in one instrument */}
      <SessionBeam
        rows={beamRows}
        summary={beamSummary}
        label={beamLabel}
        sub={beamSub}
        empty={beamEmpty}
        sentFilter={sentFilter}
        onSentFilter={setSentFilter}
        onOpen={setOpenPrint}
      />

      {/* Controls + filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setPaused(p => !p)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors ${
            paused
              ? 'border-warn/40 bg-warn/[0.06] text-warn hover:bg-warn/[0.1]'
              : 'border-bull/40 bg-bull/[0.06] text-bull hover:bg-bull/[0.1]'
          }`}
        >
          {paused ? (
            <>
              <Play className="w-3 h-3" /> Paused
            </>
          ) : (
            <>
              <Pause className="w-3 h-3" /> Live
            </>
          )}
        </button>
        <TapeSearch value={searchQuery} onChange={setSearchQuery} rows={rows} />
        {/* Toggle chips, not three boxed rails each spending a segment on
            "All" — the row was mostly chrome (Noah, 2026-08-19). Unlit = the
            axis is off; clicking a lit chip clears it — the beam sides'
            toggle grammar, and the sentiment chips share the beam's state. */}
        <span className="flex items-center gap-0.5">
          <Chip
            active={flowFilter === 'SWEEP'}
            onClick={() => setFlowFilter(f => (f === 'SWEEP' ? 'ALL' : 'SWEEP'))}
            title="Only sweeps — aggressive orders"
          >
            Sweeps
          </Chip>
          <Chip
            active={flowFilter === 'BLOCK'}
            onClick={() => setFlowFilter(f => (f === 'BLOCK' ? 'ALL' : 'BLOCK'))}
            title="Only blocks — negotiated size"
          >
            Blocks
          </Chip>
        </span>
        <span className="w-px h-3.5 bg-borderSubtle" aria-hidden="true" />
        <span className="flex items-center gap-0.5">
          <Chip
            active={sentFilter === 'BULLISH'}
            onClick={() => setSentFilter(s => (s === 'BULLISH' ? 'ALL' : 'BULLISH'))}
            title="Only bullish prints"
          >
            Bullish
          </Chip>
          <Chip
            active={sentFilter === 'BEARISH'}
            onClick={() => setSentFilter(s => (s === 'BEARISH' ? 'ALL' : 'BEARISH'))}
            title="Only bearish prints"
          >
            Bearish
          </Chip>
        </span>
        <span className="w-px h-3.5 bg-borderSubtle" aria-hidden="true" />
        <span className="flex items-center gap-0.5">
          {PREM_CHIPS.map(c => (
            <Chip
              key={c.value}
              active={minPremKey === c.value}
              onClick={() => setMinPremKey(m => (m === c.value ? '0' : c.value))}
              title={`Only prints ${c.label}`}
            >
              {c.label}
            </Chip>
          ))}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <ColumnChooser
            visible={visibleCols}
            onToggleColumn={toggleColumn}
            onToggleGroup={toggleGroup}
            onAll={() => setVisibleCols(new Set(ALL_COL_KEYS))}
            onNone={() => setVisibleCols(new Set())}
          />
          <span className="font-mono text-[10px] text-textMuted uppercase tracking-wider tnum whitespace-nowrap">
            {filtered.length} of {rows.length} prints · {marked.size} marked
          </span>
        </div>
      </div>

      {/* The terminal's read of the tape */}
      <div className={`flex items-start gap-2.5 border-l-2 pl-3 py-0.5 ${summary.bullish ? 'border-bull/70' : 'border-bear/70'}`}>
        <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-textMuted pt-px shrink-0">
          Tape read
        </span>
        {/* Two lines reserved, never more: the read re-speaks every 8s, and a
            sentence that wraps one line longer than the last shoved everything
            below it (Noah, 2026-08-18: "resizing itself"). */}
        <p className="text-[11px] text-textSecondary leading-snug tnum min-h-[30px] line-clamp-2">
          <RichRead text={read} />
        </p>
      </div>

      {/* Tape + concentration */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <Panel
          title="Options Tape"
          subtitle={VIEW_META[view].subtitle}
          flush
          className="xl:col-span-9 min-w-0"
          actions={
            <span className="flex items-center gap-0.5">
              {(Object.keys(VIEW_META) as TapeView[]).map(v => (
                <Chip key={v} active={view === v} onClick={() => setView(v)} title={VIEW_META[v].hint}>
                  {VIEW_META[v].label}
                </Chip>
              ))}
            </span>
          }
        >
          {/* FIXED height, not max-h: while the buffer warms up the table grew
              a row at a time and the whole page crawled taller with it —
              half of the "resizing itself" (Noah, 2026-08-18). Keyed by the
              SENTIMENT filter only, so beam-side clicks soft-in the swapped
              view both directions (the house filtered-table rule) without
              remounting 120 rows per search keystroke. */}
          <div key={`${sentFilter}-${view}`} className="h-[640px] overflow-auto animate-soft-in">
            <table className={`w-full border-collapse ${shownColumns.length >= 8 ? 'min-w-[1200px]' : ''}`}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#0c0c0c]">
                  <th rowSpan={2} className="px-2 py-1.5 text-left font-mono text-[9px] font-semibold uppercase tracking-widest text-textSecondary border-b border-borderSubtle w-24">
                    Time
                  </th>
                  {shownGroups.map(g => (
                    <th
                      key={g.group}
                      colSpan={g.count}
                      className="px-2 py-1.5 text-center font-mono text-[10px] font-bold uppercase tracking-widest text-textPrimary border-b border-l border-borderSubtle"
                    >
                      {g.group}
                    </th>
                  ))}
                </tr>
                <tr className="bg-[#0c0c0c]">
                  {shownColumns.map(c => (
                    <th
                      key={c.key}
                      className={`px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-widest text-textSecondary border-b border-borderSubtle whitespace-nowrap ${
                        firstInGroup.has(c.key) ? 'border-l' : ''
                      } ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      {HEADER_TERM[c.key] ? <Term k={HEADER_TERM[c.key] as TermKey}>{c.label}</Term> : c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(filtered.length === 0 || shownColumns.length === 0) && (
                  <tr>
                    <td colSpan={colCount} className="py-10 text-center font-mono text-[11px] text-textMuted uppercase tracking-widest">
                      {shownColumns.length === 0
                        ? 'All columns hidden — add one from Columns'
                        : rows.length === 0
                          ? 'Awaiting first prints…'
                          : 'No prints match the filters'}
                    </td>
                  </tr>
                )}
                {shownColumns.length > 0 &&
                  displayRows.map((r, i) => (
                    <TapeRow
                      key={r.id}
                      r={r}
                      rank={view === 'STREAM' ? undefined : i + 1}
                      isOpen={r.id === openPrint?.id}
                      isMarked={marked.has(r.id)}
                      shownColumns={shownColumns}
                      firstInGroup={firstInGroup}
                      onOpen={setOpenPrint}
                      onMark={toggleMark}
                    />
                  ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Right rail: concentration summary on top, dark-pool feed below */}
        <div className="xl:col-span-3 min-w-0 flex flex-col gap-4">
          <Panel title="Top Tickers" subtitle="session premium concentration" className="w-full">
            {/* ALWAYS six slots: the rolling buffer's ticker mix breathes, and
                a list that gains or loses a row reflows the whole right rail —
                the other half of the "resizing itself" (Noah, 2026-08-18).
                Ghost rows hold the height until the tape fills them. */}
            <div className="flex flex-col gap-2.5">
              {topTickers.map((t, i) => (
                <button
                  key={t.ticker}
                  onClick={() => setSearchQuery(q => (q === t.ticker ? '' : t.ticker))}
                  title={searchQuery === t.ticker ? 'Clear filter' : `Filter tape to ${t.ticker}`}
                  className="flex items-center gap-2 group text-left"
                >
                  <span
                    className={`w-12 shrink-0 font-mono text-[11px] font-semibold transition-colors ${
                      searchQuery === t.ticker ? 'text-select' : i === 0 ? 'text-king' : 'text-textPrimary'
                    } group-hover:text-select`}
                  >
                    {t.ticker}
                  </span>
                  <span className="relative flex-1 h-[5px] rounded-full bg-white/[0.05]">
                    <span
                      className={`absolute inset-y-0 left-0 rounded-full ${
                        searchQuery === t.ticker ? 'bg-select/70' : i === 0 ? 'bg-[#EA00FF]/70' : 'bg-white/25'
                      }`}
                      style={{ width: `${(t.premium / topMax) * 100}%` }}
                    />
                  </span>
                  <span className="w-14 shrink-0 text-right font-mono text-[10px] tnum text-textSecondary">
                    {fmtUsd(t.premium)}
                  </span>
                </button>
              ))}
              {Array.from({ length: Math.max(0, 6 - topTickers.length) }, (_, i) => (
                <div key={`ghost-${i}`} aria-hidden="true" className="flex items-center gap-2 select-none">
                  <span className="w-12 shrink-0 font-mono text-[11px] text-textMuted/40">—</span>
                  <span className="flex-1 h-[5px] rounded-full bg-white/[0.03]" />
                  <span className="w-14 shrink-0 text-right font-mono text-[10px] text-textMuted/40">—</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Dark Pool" subtitle="off-exchange crosses · by notional" flush className="w-full flex-1 min-h-0">
            <div className="overflow-y-auto max-h-[360px]">
              {darkPrints.length === 0 ? (
                <span className="block font-mono text-[10px] text-textMuted uppercase tracking-widest py-6 text-center">
                  Awaiting prints…
                </span>
              ) : (
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[#0c0c0c]">
                      {['Ticker', 'Size', 'Price', 'Notional', 'Time'].map((h, i) => (
                        <th
                          key={h}
                          className={`px-2 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-textSecondary border-b border-borderSubtle ${
                            i === 0 ? 'text-left' : 'text-right'
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {darkPrints.map(p => (
                      <tr
                        key={p.key}
                        title={`${p.date} · ${p.time}`}
                        className="border-b border-borderSubtle/30 last:border-0 hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-2 py-2 whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-darkpool" />
                            <span className="font-mono text-[11px] font-semibold text-textPrimary">{p.ticker}</span>
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-[11px] tnum text-textSecondary">
                          {p.size.toLocaleString()}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-[11px] tnum text-textSecondary">
                          ${p.price.toFixed(2)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-[11px] font-bold tnum text-textPrimary">
                          ${p.notional.toFixed(2)}B
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-[10px] tnum text-textSecondary whitespace-nowrap">
                          {p.time.slice(0, 5)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* Print drilldown — a centred card over the tape, so the rows you are
          comparing against stay visible behind it */}
      <PrintDrilldown
        print={openPrint}
        snapshot={marketData}
        onClose={() => setOpenPrint(null)}
        isMarked={openPrint ? marked.has(openPrint.id) : false}
        onToggleMark={toggleMark}
        onStep={stepPrint}
        hasPrev={openIdx > 0}
        hasNext={openIdx >= 0 && openIdx < displayRows.length - 1}
        tapeRows={rows}
        onOpenPrint={setOpenPrint}
      />
    </>
  );
};

export default LiveTape;
