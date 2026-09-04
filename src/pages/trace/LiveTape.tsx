import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, Bookmark, Check, ChevronDown, Filter, SlidersHorizontal } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { LiveHold, useHold } from '../../components/trace/LiveHold';
import { enrichPrint, rankNotable, sentimentOf, summarizeTape } from '../../data/tape';
import { buildGexView, fmtUsd } from '../../data/gex';
import Chip from '../../components/ui/Chip';
import Panel from '../../components/ui/Panel';
import Term from '../../components/ui/Term';
import type { TermKey } from '../../data/terms';
import RichRead from '../../components/ui/RichRead';
import PrintDrilldown from '../../components/trace/PrintDrilldown';
import InkKey from '../../components/trace/InkKey';
import ReadDoor from '../../components/trace/ReadDoor';
import FlowSearch from '../../components/trace/FlowSearch';
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
        className={`border-b border-borderSubtle/30 last:border-0 animate-fade-in cursor-pointer transition-colors ${
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

/** One stretch of the read — a plain sentence piece, or a contract door. */
type ReadSeg = string | { print: FlowPrint; label: string };

/** The terminal's read of the tape — same voice as market notes. The largest
    print travels as a DOOR segment: the sentence names a contract, so it
    opens that contract's card (Noah, 2026-08-30). */
function tapeRead(rows: FlowPrint[], summary: TapeSummary): ReadSeg[] {
  if (rows.length === 0) return ['Awaiting prints…'];
  const zdte = rows.filter(r => r.dte === 0).length;
  const segs: ReadSeg[] = [
    `${summary.bullish ? 'Bullish' : 'Bearish'} tape — ${
      summary.bullish ? 'aggressive call buying leads' : 'put premium leads'
    } by ${fmtUsd(Math.abs(summary.netPremium))}`,
  ];
  if (summary.largest) {
    const L = summary.largest;
    const hit = rows.find(r => r.ticker === L.ticker && r.strike === L.strike && r.right === L.right && r.premium === L.premium);
    segs.push(' · largest print ');
    if (hit) segs.push({ print: hit, label: `${L.ticker} ${L.strike}${L.right}` });
    else segs.push(`${L.ticker} ${L.strike}${L.right}`);
    segs.push(` at [[${fmtUsd(L.premium)}]]`);
  }
  if (summary.sweeps > 2) segs.push(` · ${summary.sweeps} sweeps on the tape`);
  if (rows.length >= 20 && zdte / rows.length > 0.25) segs.push(` · 0DTE is ${Math.round((zdte / rows.length) * 100)}% of flow`);
  segs.push('.');
  return segs;
}

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
        {/* White, not lime (Noah, 2026-08-30): a leg count is a fact, not a status. */}
        {r.legs > 1 && <span className="ml-1.5 font-mono text-[9px] text-textPrimary">×{r.legs}</span>}
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

/* TapeSearch moved to components/trace/FlowSearch (2026-08-30) — every flow
   page can now carry the same ticker/contract search. */

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
                            checked ? 'bg-[#C7D3E8] border-[#C7D3E8]' : 'border-borderMuted'
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

/* One door for every tape filter (Noah, 2026-08-23: "all apart of the same
   button dropdown... like the column button") — the ColumnChooser's grammar
   over the three filter axes. Each axis stays SINGLE-select (a sweep-only
   tape can't also be block-only); checking one side of an axis releases the
   other, checking it again releases the axis. */
const FilterChooser = ({
  flowFilter,
  onFlow,
  sentFilter,
  onSent,
  minPremKey,
  onMinPrem,
}: {
  flowFilter: FlowFilter;
  onFlow: (v: FlowFilter) => void;
  sentFilter: SentFilter;
  onSent: (v: SentFilter) => void;
  minPremKey: PremKey;
  onMinPrem: (v: PremKey) => void;
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

  const activeCount = (flowFilter !== 'ALL' ? 1 : 0) + (sentFilter !== 'ALL' ? 1 : 0) + (minPremKey !== '0' ? 1 : 0);
  const clear = () => {
    onFlow('ALL');
    onSent('ALL');
    onMinPrem('0');
  };

  const Row = ({ checked, label, title, onClick }: { checked: boolean; label: string; title: string; onClick: () => void }) => (
    <button
      onClick={onClick}
      title={title}
      className="w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded hover:bg-white/[0.03] transition-colors"
    >
      <span
        className={`inline-flex w-3.5 h-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
          checked ? 'bg-[#C7D3E8] border-[#C7D3E8]' : 'border-borderMuted'
        }`}
      >
        {checked && <Check className="w-2.5 h-2.5 text-[#0a0a0a]" />}
      </span>
      <span className={`font-mono text-[11px] ${checked ? 'text-textPrimary' : 'text-textSecondary'}`}>{label}</span>
    </button>
  );

  const Header = ({ children }: { children: React.ReactNode }) => (
    <span className="block px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-textMuted">{children}</span>
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border font-mono text-[10px] uppercase tracking-wider transition-colors ${
          open ? 'border-borderMuted bg-white/[0.05] text-textPrimary' : 'border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary'
        }`}
      >
        <Filter className="w-3 h-3" />
        Filters
        {activeCount > 0 && <span className="tnum text-select">{activeCount}</span>}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-40 w-[210px] border border-borderMuted bg-panel rounded-md shadow-2xl shadow-black/60 overflow-hidden animate-slide-in">
          <div className="flex items-center justify-between px-3 py-2 border-b border-borderSubtle">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-textPrimary">Tape filters</span>
            <button
              onClick={clear}
              className="font-mono text-[9px] uppercase tracking-wider text-textSecondary hover:text-select transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="py-1 px-1">
            <Header>Order flow</Header>
            <Row
              checked={flowFilter === 'SWEEP'}
              label="Sweeps"
              title="Only sweeps — aggressive orders"
              onClick={() => onFlow(flowFilter === 'SWEEP' ? 'ALL' : 'SWEEP')}
            />
            <Row
              checked={flowFilter === 'BLOCK'}
              label="Blocks"
              title="Only blocks — negotiated size"
              onClick={() => onFlow(flowFilter === 'BLOCK' ? 'ALL' : 'BLOCK')}
            />
            <Header>Sentiment</Header>
            <Row
              checked={sentFilter === 'BULLISH'}
              label="Bullish"
              title="Only bullish prints"
              onClick={() => onSent(sentFilter === 'BULLISH' ? 'ALL' : 'BULLISH')}
            />
            <Row
              checked={sentFilter === 'BEARISH'}
              label="Bearish"
              title="Only bearish prints"
              onClick={() => onSent(sentFilter === 'BEARISH' ? 'ALL' : 'BEARISH')}
            />
            <Header>Premium floor</Header>
            {PREM_CHIPS.map(c => (
              <Row
                key={c.value}
                checked={minPremKey === c.value}
                label={c.label}
                title={`Only prints ${c.label}`}
                onClick={() => onMinPrem(minPremKey === c.value ? '0' : c.value)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Grouped two-tier header — same grammar as the exposure / pressure matrices
/** Streaming rich options prints in the house grammar — session strip, filters, multi-ticker. */
const LiveTape = () => {
  const { marketData, flowTape } = useMarketData();
  /* SEEDED, not empty (Noah, 2026-08-30, the open-time hop). The tape used to
     mount with no rows — one frame of "Awaiting first prints…", a 1200px
     table and a pill-less strip — then fill 34ms later at 1314px with 42px
     rows, and keep growing tick by tick for forty seconds. The provider
     already keeps a rolling buffer of enriched prints for exactly this; the
     first paint now shows it. */
  const [rows, setRows] = useState<FlowPrint[]>(() => flowTape.slice(0, MAX_ROWS));
  // The same hold every Trace page wears now (see LiveHold); the tape's own
  // effect below is what actually stops the prints.
  const hold = useHold(marketData);
  const paused = hold.paused;
  const [marked, setMarked] = useState<Set<number>>(new Set());
  // The read is seeded from the same buffer, so the strip is its real height
  // on the first frame instead of a one-line placeholder that grows.
  const [read, setRead] = useState<ReadSeg[]>(() => {
    const seed = flowTape.slice(0, MAX_ROWS);
    return seed.length ? tapeRead(seed, summarizeTape(seed)) : ['Awaiting prints…'];
  });
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
  // Continue the seed's ids, never restart at 0 under them (row keys).
  const idRef = useRef(flowTape.reduce((m, p) => Math.max(m, p.id), 0));
  // The tick already folded into the seed — the effect must not append it twice.
  const seededTickRef = useRef(marketData);
  const lastReadRef = useRef(0);

  /* Back to the top (Noah, 2026-08-23): the tape page grows without a cap
     now, so a floating door home appears once the reader is a screen or so
     deep. The app scrolls in AppShell's <main>, not the window — listen and
     scroll THERE. Native smooth scroll, compositor-driven, no jitter;
     reduced-motion gets an instant jump. */
  const [showTop, setShowTop] = useState(false);
  const scrollerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;
    scrollerRef.current = main;
    const onScroll = () => setShowTop(main.scrollTop > 600);
    main.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => main.removeEventListener('scroll', onScroll);
  }, []);
  /* NOT native smooth scroll: the tape PREPENDS a row per second, and scroll
     anchoring shoves scrollTop mid-animation — Chrome's untunable ~2s glide
     visibly fought it (the exact "lag or jitters" Noah banned). A 450ms
     house-curve tween writes ABSOLUTE positions each frame, so prepends
     can't move it, and a timer finishes the jump even if frames never come
     (background tab). */
  const scrollToTop = () => {
    const el = scrollerRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.scrollTop = 0;
      return;
    }
    const start = el.scrollTop;
    const t0 = performance.now();
    const DUR = 450;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.scrollTop = 0;
    };
    const step = (now: number) => {
      if (done) return;
      const t = Math.min(1, (now - t0) / DUR);
      const e = 1 - Math.pow(1 - t, 3); // easeOutCubic, the house curve
      el.scrollTop = Math.round(start * (1 - e));
      if (t < 1) requestAnimationFrame(step);
      else finish();
    };
    requestAnimationFrame(step);
    window.setTimeout(finish, DUR + 150);
  };

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
    if (!marketData || paused || marketData === seededTickRef.current) return;
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

  /* The beam is GONE (Noah + partner, 2026-08-23: "my partner doesnt like
     the idea of session flow") — but the tape read still speaks the active
     SCOPE, so the scoped rows/summary survive it. */
  const scopeActive =
    searchQuery.trim() !== '' || flowFilter !== 'ALL' || sentFilter !== 'ALL' || minPremKey !== '0';
  const beamRows = scopeActive ? filtered : rows;
  const beamSummary = useMemo(
    () => (scopeActive ? summarizeTape(filtered) : summary),
    [scopeActive, filtered, summary]
  );

  /* The whale doors (Noah kept these when the beam went, 2026-08-23):
     largest bullish, largest bearish, and the overall largest — which only
     earns its own chip when it traded mid and is neither of those two. */
  const whales = useMemo(() => {
    let all: FlowPrint | null = null;
    let bull: FlowPrint | null = null;
    let bear: FlowPrint | null = null;
    for (const p of beamRows) {
      if (!all || p.premium > all.premium) all = p;
      const s = sentimentOf(p);
      if (s === 'BULLISH' && (!bull || p.premium > bull.premium)) bull = p;
      if (s === 'BEARISH' && (!bear || p.premium > bear.premium)) bear = p;
    }
    return { all, bull, bear };
  }, [beamRows]);

  // 0DTE share of the active view — same-day contracts as a slice of the flow
  const zdteShare = useMemo(() => {
    if (beamRows.length === 0) return 0;
    return beamRows.filter(r => r.dte === 0).length / beamRows.length;
  }, [beamRows]);

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

  /* FROZEN COLUMNS (Noah, 2026-08-30: "some sort of buffer... tables shrink
     then go back to normal spacing"). Measured: an auto-layout table re-spaces
     every column whenever a wider print lands or scrolls off — three times in
     twenty seconds, columns shifting up to 11px — and the whole tape breathes
     sideways under the reader. So the table measures itself ONCE per column
     set (auto layout, the first body row's cells, plus a little slack), then
     freezes those widths into a colgroup under fixed layout. Prints no longer
     move columns. A value that genuinely would not fit releases the freeze
     for one re-measure — checked on the newest rows only, where prints
     arrive. The column set or a remount (filter/view key) releases it too. */
  const tableRef = useRef<HTMLTableElement | null>(null);
  const [colWidths, setColWidths] = useState<number[] | null>(null);
  const colSig = `${sentFilter}-${view}-${shownColumns.map(c => c.key).join('|')}`;
  useLayoutEffect(() => setColWidths(null), [colSig]);
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    if (!colWidths) {
      if (displayRows.length === 0) return;
      const tds = table.querySelector('tbody tr')?.querySelectorAll('td');
      if (!tds || tds.length !== colCount) return;
      setColWidths([...tds].map(td => Math.ceil(td.getBoundingClientRect().width) + 6));
      return;
    }
    const fresh = table.querySelectorAll('tbody tr:nth-child(-n+8) td');
    for (const td of fresh) {
      if (td.scrollWidth > td.clientWidth) {
        setColWidths(null);
        return;
      }
    }
  });

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
  /*
    GOING FROM EMPTY TO NOT-EMPTY BYPASSES THE THROTTLE, exactly as a scope
    change does.

    The tape mounts with no prints, so the read is set to "No prints in this
    view" and the 8s throttle is stamped. The first prints then arrive inside
    that window and the guard returns early — leaving the sentence "No prints
    in this view" sitting above fifteen rendered rows for the rest of the
    throttle. Measured on his build: the header contradicted the table
    directly on load.

    The throttle exists to stop the sentence churning as prints tick past.
    An emptiness FLIP is not churn — it is the read becoming false — and it
    is a bigger lie than the scope change already exempted here.
  */
  const lastEmptyRef = useRef(true);
  useEffect(() => {
    const now = Date.now();
    const scopeChanged = scopeKey !== lastScopeRef.current;
    const isEmpty = beamRows.length === 0;
    const emptinessFlipped = isEmpty !== lastEmptyRef.current;
    if (!scopeChanged && !emptinessFlipped && now - lastReadRef.current < READ_INTERVAL_MS && beamRows.length > 3) return;
    lastScopeRef.current = scopeKey;
    lastEmptyRef.current = isEmpty;
    lastReadRef.current = now;
    setRead(isEmpty ? ['No prints in this view.'] : tapeRead(beamRows, beamSummary));
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

  const WhaleChip = ({
    print,
    label,
    ink,
  }: {
    print: FlowPrint;
    label: string;
    ink: 'supreme' | 'bull' | 'bear';
  }) => {
    const tone =
      ink === 'supreme'
        ? 'border-supreme/40 bg-supreme/[0.06] hover:bg-supreme/[0.12]'
        : ink === 'bull'
          ? 'border-bull/40 bg-bull/[0.05] hover:bg-bull/[0.1]'
          : 'border-bear/40 bg-bear/[0.05] hover:bg-bear/[0.1]';
    const labelInk = ink === 'supreme' ? 'text-supreme' : ink === 'bull' ? 'text-bull' : 'text-bear';
    return (
      <button
        onClick={() => setOpenPrint(print)}
        title="Open this print's drilldown"
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border font-mono transition-colors ${tone}`}
      >
        <span className={`text-[8px] font-bold uppercase tracking-widest ${labelInk}`}>{label}</span>
        <span className="text-[11px] font-semibold tnum text-textPrimary whitespace-nowrap">
          {print.ticker} {print.strike}
          {print.right} · {fmtUsd(print.premium)}
        </span>
      </button>
    );
  };

  return (
    <>
      {/* Composition strip (Noah, 2026-08-23: "i still wanted these
          sections") — the beam's FACTS without the beam's verdict: what the
          flow is MADE of, plus the whale doors. Speaks the active scope,
          like the read and the counter. */}
      <div className="flex items-center gap-x-5 gap-y-2 flex-wrap border border-borderSubtle bg-panel rounded-md px-3.5 py-2 select-none">
        <span className="font-mono text-[11px] tnum whitespace-nowrap">
          <span className="text-bull font-semibold">{beamSummary.callCount}C</span>{' '}
          <span className="text-textPrimary font-bold">{fmtUsd(beamSummary.callPremium)}</span>
          <span className="text-textMuted"> / </span>
          <span className="text-bear font-semibold">{beamSummary.putCount}P</span>{' '}
          <span className="text-textPrimary font-bold">{fmtUsd(beamSummary.putPremium)}</span>
        </span>
        <span className="font-mono text-[10px] tnum whitespace-nowrap text-textSecondary">
          <span className="text-textPrimary font-semibold">{beamSummary.sweeps}</span> sweeps
          <span className="text-textMuted"> · </span>
          <span className="text-textPrimary font-semibold">{beamSummary.blocks}</span> blocks
        </span>
        <span
          className="font-mono text-[10px] tnum whitespace-nowrap text-textSecondary"
          title="Put premium against call premium in this view"
        >
          P/C <span className="text-textPrimary font-semibold">{beamSummary.pcRatio.toFixed(2)}</span>
        </span>
        <span
          className={`font-mono text-[10px] tnum whitespace-nowrap ${zdteShare >= 0.25 ? 'text-warn' : 'text-textSecondary'}`}
          title="Share of this view's prints expiring today"
        >
          0DTE <span className="font-semibold">{Math.round(zdteShare * 100)}%</span> of flow
        </span>
        {/* The magenta whale anchors the right edge — the bull/bear whales
            join it when they are different prints */}
        <span className="ml-auto flex items-center gap-2 flex-wrap">
          {whales.bull && whales.bull !== whales.all && <WhaleChip print={whales.bull} label="Top bull" ink="bull" />}
          {whales.bear && whales.bear !== whales.all && <WhaleChip print={whales.bear} label="Top bear" ink="bear" />}
          {whales.all && <WhaleChip print={whales.all} label="Largest print" ink="supreme" />}
        </span>
      </div>

      {/* Controls + filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <LiveHold paused={paused} onToggle={hold.toggle} heldAt={hold.heldAt} />
        <FlowSearch value={searchQuery} onChange={setSearchQuery} rows={rows} />
        {/* Every filter axis behind ONE door (Noah, 2026-08-23) — the chip
            row is gone; the ColumnChooser grammar carries flow, sentiment
            and the premium floor. */}
        <FilterChooser
          flowFilter={flowFilter}
          onFlow={setFlowFilter}
          sentFilter={sentFilter}
          onSent={setSentFilter}
          minPremKey={minPremKey}
          onMinPrem={setMinPremKey}
        />
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
        <p className="text-[11px] text-textSecondary leading-snug tnum min-h-[30px] line-clamp-2 flex-1 min-w-0">
          {read.map((seg, i) =>
            typeof seg === 'string' ? (
              <RichRead key={i} text={seg} />
            ) : (
              <ReadDoor key={i} onOpen={() => setOpenPrint(seg.print)}>
                {seg.label}
              </ReadDoor>
            )
          )}
        </p>
        {/* The colour code, far right (Noah, 2026-08-30) — words in their own ink. */}
        <InkKey className="pt-px" />
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
          {/* NO cap (Noah, 2026-08-23, reversing 2026-08-18's fixed height):
              every print renders and the PAGE grows — the buffer's MAX_ROWS
              bounds it. Only horizontal overflow stays contained (wide
              column sets scroll inside the panel, never the page). Keyed by
              the sentiment filter only, so filter clicks soft-in the swapped
              view without remounting 120 rows per search keystroke. */}
          <div key={`${sentFilter}-${view}`} className="overflow-x-auto animate-fade-in">
            <table
              ref={tableRef}
              className={`w-full border-collapse ${shownColumns.length >= 8 ? 'min-w-[1200px]' : ''} ${colWidths ? 'table-fixed' : ''}`}
            >
              {colWidths && (
                <colgroup>
                  {colWidths.map((w, i) => (
                    <col key={i} style={{ width: w }} />
                  ))}
                </colgroup>
              )}
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

        {/* Right rail: concentration summary on top, dark-pool feed below.
            STICKY (Noah, 2026-08-23): the tape column now grows without a
            cap, and the rail keeps pace with the reader instead of being
            left at the top of a mile-long page. */}
        <div className="xl:col-span-3 min-w-0 flex flex-col gap-4 xl:sticky xl:top-4">
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
                      searchQuery === t.ticker ? 'text-select' : i === 0 ? 'text-supreme' : 'text-textPrimary'
                    } group-hover:text-select`}
                  >
                    {t.ticker}
                  </span>
                  <span className="relative flex-1 h-[5px] rounded-full bg-white/[0.05]">
                    <span
                      className={`absolute inset-y-0 left-0 rounded-full ${
                        searchQuery === t.ticker ? 'bg-select/70' : i === 0 ? 'bg-supreme/70' : 'bg-white/25'
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

          <Panel title="Dark Pool" subtitle="off-exchange crosses, recent sessions · by notional" flush className="w-full flex-1 min-h-0">
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
                          {fmtUsd(p.notional * 1e9)}
                        </td>
                        {/* THE DATE, NOT JUST A CLOCK. These crosses are drawn
                            from the last dozen sessions, and a bare "12:38"
                            beside today's tape reads as today — which is how I
                            first misread a 15:02 print on a desk whose clock
                            said 00:32. */}
                        <td className="px-2 py-2 text-right font-mono text-[10px] tnum text-textSecondary whitespace-nowrap">
                          <span className="text-textMuted">{p.date}</span> {p.time.slice(0, 5)}
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

      {/* The door home — portaled to body so no animated ancestor can trap
          its fixed positioning (the campaign-chart lesson) */}
      {showTop &&
        createPortal(
          <button
            onClick={scrollToTop}
            title="Back to top"
            aria-label="Scroll back to the top"
            className="fixed bottom-6 right-6 z-40 inline-flex items-center justify-center w-9 h-9 rounded-full border border-borderMuted bg-panel/90 backdrop-blur-sm text-textSecondary hover:text-textPrimary hover:border-borderMuted hover:bg-panelHover shadow-lg shadow-black/40 transition-colors animate-soft-in"
          >
            <ArrowUp className="w-4 h-4" />
          </button>,
          document.body
        )}
    </>
  );
};

export default LiveTape;
