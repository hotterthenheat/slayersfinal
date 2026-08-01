import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ROW_INTERACTIVE, interactiveRowProps } from '../../components/ui/interactiveRow';
import { ArrowUp, Bookmark, Check, Pause, Play, Plus, Save, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { DUR, EASE, PILL } from '../../lib/motion';
import { useMarketData } from '../../context/MarketDataContext';
import { enrichPrint, sentimentOf, summarizeTape } from '../../data/flowtape';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import SegmentedControl from '../../components/ui/SegmentedControl';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import type { Tone } from '../../components/ui/tones';
import { useToast } from '../../components/ui/Toast';
import Term from '../../components/ui/Term';
import type { TermKey } from '../../data/terms';
import TapeRowDrawer from './TapeRowDrawer';
import type { FlowPrint, PrintSentiment, TapeSummary } from '../../types/flowdesk';

const MAX_ROWS = 400;
const READ_INTERVAL_MS = 8_000;

// Windowed rendering — only the visible slice of rows mounts. Rows are
// structurally identical so a single measured height drives the scroll math.
const ROW_H_ESTIMATE = 40;
const OVERSCAN = 8;
/** Close enough to the newest print to count as caught up — a couple of pixels
    of scroll drift shouldn't start hoarding an unread count. */
const TOP_EPSILON = 24;

const COLS_KEY = 'slayer.livetape.cols.v1';
const VIEWS_KEY = 'slayer.livetape.views.v1';

type FlowFilter = 'ALL' | 'SWEEP' | 'BLOCK';
type SentFilter = 'ALL' | PrintSentiment;
type PremKey = '0' | '100000' | '500000' | '1000000';

interface SavedView {
  name: string;
  flow: FlowFilter;
  sent: SentFilter;
  prem: PremKey;
  search: string;
}

const FLOW_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'SWEEP', label: 'Sweeps' },
  { value: 'BLOCK', label: 'Blocks' },
] as const;

const SENT_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'BULLISH', label: 'Bullish' },
  { value: 'BEARISH', label: 'Bearish' },
] as const;

const PREM_OPTIONS = [
  { value: '0', label: 'All' },
  { value: '100000', label: '≥$100K' },
  { value: '500000', label: '≥$500K' },
  { value: '1000000', label: '≥$1M' },
] as const;

/** Whale prints get an edge accent (row-level structure, not rainbow text). */
const rowAccent = (premium: number): string =>
  premium >= 1_000_000
    ? 'rail-king'
    : premium >= 250_000
      ? 'rail-warn'
      : '';

/** The terminal's read of the tape — same voice as market notes. */
function tapeRead(rows: FlowPrint[], summary: TapeSummary): string {
  if (rows.length === 0) return 'Awaiting prints…';
  const zdte = rows.filter(r => r.dte === 0).length;
  const parts = [
    `${summary.bullish ? 'Bullish' : 'Bearish'} tape: ${
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

// ---- session strip ------------------------------------------------------------
const RatioBar = ({ left, right }: { left: number; right: number }) => {
  const total = left + right || 1;
  return (
    <span className="flex w-full h-[3px] rounded-full overflow-hidden bg-white/[0.06] mt-1.5">
      <span className="h-full bg-bull/90" style={{ width: `${(left / total) * 100}%` }} />
      <span className="h-full bg-bear/80" style={{ width: `${(right / total) * 100}%` }} />
    </span>
  );
};

// ---- cells ----------------------------------------------------------------------
const SpreadCell = ({ print }: { print: FlowPrint }) => {
  const dot = print.side === 'ASK' ? 'bg-bull' : print.side === 'BID' ? 'bg-bear' : 'bg-white/50';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-micro tnum text-textMuted">{print.bid.toFixed(2)}</span>
      <span className="relative w-12 h-[3px] rounded-full bg-white/[0.07]">
        <span
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[6px] h-[6px] rounded-full ${dot}`}
          style={{ left: `${print.fillPos * 100}%` }}
        />
      </span>
      <span className="font-mono text-micro tnum text-textMuted">{print.ask.toFixed(2)}</span>
    </span>
  );
};

/** Side + conviction score. BUY = hit the ask, SELL = hit the bid. */
const FlowCell = ({ print }: { print: FlowPrint }) => {
  const score = print.flowScore;
  const tone = score > 15 ? 'text-bull' : score < -15 ? 'text-bear' : 'text-textMuted';
  const bar = score > 15 ? 'bg-bull/90' : score < -15 ? 'bg-bear/80' : 'bg-white/25';
  const half = Math.abs(score) / 2;
  const sideLabel = print.side === 'ASK' ? 'BUY' : print.side === 'BID' ? 'SELL' : 'MID';
  return (
    <span className="inline-flex flex-col items-start gap-[3px] w-16">
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`inline-flex w-9 justify-center rounded border px-1 py-px font-mono text-micro font-semibold ${
            print.side === 'ASK'
              ? 'border-bull/30 bg-bull/[0.07] text-bull'
              : print.side === 'BID'
                ? 'border-bear/30 bg-bear/[0.07] text-bear'
                : 'border-borderSubtle text-textMuted'
          }`}
        >
          {sideLabel}
        </span>
        <span className={`w-7 text-right font-mono text-label tnum font-semibold ${tone}`}>
          {score > 0 ? '+' : ''}
          {score}
        </span>
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
      <span className={`font-mono text-micro font-semibold uppercase tracking-wide tnum leading-[14px] ${tone}`}>
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

// ---- column model --------------------------------------------------------------
type GroupName = 'Contract' | 'Execution' | 'Conviction' | 'Activity';
const GROUP_ORDER: GroupName[] = ['Contract', 'Execution', 'Conviction', 'Activity'];

interface TapeCol {
  id: string;
  group: GroupName;
  label: string;
  align?: 'right';
  /** Dictionary key — wraps the header label in a <Term> jargon explainer */
  help?: TermKey;
  /** static td text/colour classes */
  cls: string;
  /** row-dependent tone classes */
  dyn?: (r: FlowPrint) => string;
  cell: (r: FlowPrint) => React.ReactNode;
}

const ALL_COLS: TapeCol[] = [
  // Contract
  {
    id: 'contract',
    group: 'Contract',
    label: 'Print',
    cls: '',
    cell: r => (
      <>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-label font-semibold ${
            r.right === 'C' ? 'border-bull/30 bg-bull/10 text-bull' : 'border-bear/30 bg-bear/10 text-bear'
          }`}
        >
          {r.ticker} {r.strike}
          {r.right}
        </span>
        {r.legs > 1 && <span className="ml-1.5 font-mono text-micro text-select">×{r.legs}</span>}
      </>
    ),
  },
  {
    id: 'expdte',
    group: 'Contract',
    label: 'Exp · DTE',
    help: 'DTE',
    align: 'right',
    cls: 'text-label tnum text-textSecondary',
    cell: r => (
      <>
        {r.expiry.slice(0, 5)} · <span className={r.dte === 0 ? 'text-warn font-semibold' : ''}>{r.dte}d</span>
      </>
    ),
  },
  {
    id: 'otm',
    group: 'Contract',
    label: 'OTM',
    help: 'OTM%',
    align: 'right',
    cls: 'text-label tnum',
    dyn: r => (r.otmPct >= 0 ? 'text-bull' : 'text-bear'),
    cell: r => `${r.otmPct >= 0 ? '+' : ''}${r.otmPct.toFixed(1)}%`,
  },
  {
    id: 'spot',
    group: 'Contract',
    label: 'Spot',
    align: 'right',
    cls: 'text-label tnum text-textSecondary',
    cell: r => `$${r.spot.toFixed(2)}`,
  },
  // Execution
  {
    id: 'fill',
    group: 'Execution',
    label: 'Fill',
    align: 'right',
    cls: 'text-label tnum font-semibold text-textPrimary',
    cell: r => `$${r.fill.toFixed(2)}`,
  },
  { id: 'spread', group: 'Execution', label: 'Spread', cls: '', cell: r => <SpreadCell print={r} /> },
  {
    id: 'size',
    group: 'Execution',
    label: 'Size',
    align: 'right',
    cls: 'text-label tnum text-textPrimary',
    cell: r => r.size.toLocaleString(),
  },
  {
    id: 'prem',
    group: 'Execution',
    label: 'Prem',
    align: 'right',
    cls: 'text-label tnum',
    dyn: r => (r.premium >= 250_000 ? 'font-bold text-textPrimary' : 'text-textSecondary'),
    cell: r => fmtUsd(r.premium),
  },
  // Conviction
  { id: 'flow', group: 'Conviction', label: 'Flow', cls: '', cell: r => <FlowCell print={r} /> },
  { id: 'ratio', group: 'Conviction', label: 'Day Ratio', align: 'right', cls: '', cell: r => <RatioCell print={r} /> },
  {
    id: 'sent',
    group: 'Conviction',
    label: 'Sentiment',
    align: 'right',
    cls: 'text-label font-semibold',
    dyn: r => SENT_TEXT[sentimentOf(r)],
    cell: r => sentimentOf(r),
  },
  // Activity
  {
    id: 'vol',
    group: 'Activity',
    label: 'Vol',
    align: 'right',
    cls: 'text-label tnum text-textSecondary',
    cell: r => r.volume.toLocaleString(),
  },
  {
    id: 'oi',
    group: 'Activity',
    label: 'OI',
    help: 'OI',
    align: 'right',
    cls: 'text-label tnum text-textSecondary',
    cell: r => r.oi.toLocaleString(),
  },
  {
    id: 'doi',
    group: 'Activity',
    label: 'ΔOI',
    help: 'ΔOI',
    align: 'right',
    cls: 'text-label tnum',
    cell: r =>
      r.deltaOI === 0 ? (
        <span className="text-textMuted">—</span>
      ) : (
        <span className={r.deltaOI > 0 ? 'text-bull' : 'text-bear'}>
          {r.deltaOI > 0 ? '↑' : '↓'}
          {Math.abs(r.deltaOI).toLocaleString()}
        </span>
      ),
  },
  {
    id: 'voi',
    group: 'Activity',
    label: 'V/OI',
    help: 'Vol/OI',
    align: 'right',
    cls: 'text-label tnum',
    dyn: r => (r.volOverOI >= 5 ? 'text-warn font-semibold' : 'text-textSecondary'),
    cell: r => `${r.volOverOI.toFixed(2)}x`,
  },
  {
    id: 'iv',
    group: 'Activity',
    label: 'IV',
    help: 'IV',
    align: 'right',
    cls: 'text-label tnum text-textSecondary',
    cell: r => `${r.iv.toFixed(1)}%`,
  },
  {
    id: 'tag',
    group: 'Activity',
    label: 'Tag',
    cls: 'text-micro text-textMuted',
    cell: r => (r.sweep ? <span className="text-warn font-semibold">SWEEP</span> : r.strat),
  },
];

// ---- shared dismiss hook -------------------------------------------------------
function useDismiss<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return ref;
}

// ---- column chooser ------------------------------------------------------------
const ColumnChooser = ({
  visible,
  onToggle,
  onReset,
}: {
  visible: Set<string>;
  onToggle: (id: string) => void;
  onReset: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss<HTMLDivElement>(open, close);
  const hiddenCount = ALL_COLS.length - ALL_COLS.filter(c => visible.has(c.id)).length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-borderSubtle hover:border-borderMuted bg-panel font-mono text-label font-semibold uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" /> Columns
        {hiddenCount > 0 && <span className="font-mono text-label text-select tnum">−{hiddenCount}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-40 w-64 border border-borderMuted bg-panel rounded-lg shadow-overlay overflow-hidden animate-slide-in">
          <div className="flex items-center justify-between px-3 py-2 border-b border-borderSubtle">
            <span className="font-mono text-label uppercase tracking-widest text-textSecondary">Columns</span>
            <button
              onClick={onReset}
              className="font-mono text-label uppercase tracking-wider text-textMuted hover:text-textPrimary transition-colors"
            >
              Show all
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {GROUP_ORDER.map(g => (
              <div key={g}>
                <div className="px-3 pt-2 pb-1 font-mono text-label uppercase tracking-widest text-textMuted">{g}</div>
                {ALL_COLS.filter(c => c.group === g).map(c => {
                  const on = visible.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => onToggle(c.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-rowHover transition-colors"
                    >
                      <span
                        className={`inline-flex items-center justify-center w-4 h-4 rounded border ${
                          on ? 'border-select/50 bg-select/15 text-select' : 'border-borderMuted text-transparent'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                      </span>
                      <span className={`font-mono text-caption ${on ? 'text-textPrimary' : 'text-textMuted'}`}>{c.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ---- saved filter views --------------------------------------------------------
const SavedViews = ({
  views,
  activeName,
  onApply,
  onSave,
  onDelete,
}: {
  views: SavedView[];
  activeName: string | null;
  onApply: (v: SavedView) => void;
  onSave: (name: string) => void;
  onDelete: (name: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss<HTMLDivElement>(open, close);

  const commit = () => {
    const n = name.trim();
    if (!n) return;
    onSave(n);
    setName('');
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-borderSubtle hover:border-borderMuted bg-panel font-mono text-label font-semibold uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
      >
        <Save className="w-3.5 h-3.5" /> Views
        {views.length > 0 && <span className="font-mono text-label text-select tnum">{views.length}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-40 w-64 border border-borderMuted bg-panel rounded-lg shadow-overlay overflow-hidden animate-slide-in">
          <div className="px-3 py-2 border-b border-borderSubtle">
            <span className="font-mono text-label uppercase tracking-widest text-textSecondary">Saved filter views</span>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {views.length === 0 ? (
              <div className="px-3 py-4 text-center font-mono text-label text-textMuted">No saved views yet</div>
            ) : (
              views.map(v => (
                <div
                  key={v.name}
                  className={`flex items-center gap-2 pl-3 pr-2 py-1 ${activeName === v.name ? 'bg-select/[0.06]' : ''}`}
                >
                  <button
                    onClick={() => {
                      onApply(v);
                      setOpen(false);
                    }}
                    className={`flex-1 min-w-0 text-left font-mono text-caption truncate transition-colors ${
                      activeName === v.name ? 'text-select' : 'text-textPrimary hover:text-select'
                    }`}
                  >
                    {v.name}
                  </button>
                  <button
                    onClick={() => onDelete(v.name)}
                    aria-label={`Delete view ${v.name}`}
                    className="shrink-0 text-textMuted hover:text-bear transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center gap-1.5 px-2 py-2 border-t border-borderSubtle">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commit();
              }}
              placeholder="Name this view…"
              className="flex-1 min-w-0 bg-inset border border-borderSubtle rounded px-2 py-1 font-mono text-caption text-textPrimary placeholder:text-textMuted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60 focus:border-borderMuted"
            />
            <button
              onClick={commit}
              // See FlowScanner: commit() early-returns on an empty name, so an
              // always-enabled Save looked clickable and did nothing.
              disabled={!name.trim()}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded border border-borderSubtle hover:border-borderMuted disabled:opacity-40 disabled:hover:border-borderSubtle font-mono text-label text-textSecondary hover:text-textPrimary transition-colors"
            >
              <Plus className="w-3 h-3" /> Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/** Rich options prints in the house grammar — session strip, filters, multi-ticker. */
const LiveTape = () => {
  const { marketData } = useMarketData();
  const toast = useToast();
  const [rows, setRows] = useState<FlowPrint[]>([]);
  const [paused, setPaused] = useState(false);
  // Snapshot captured at pause — data keeps collecting into `rows`, but the tape
  // renders this frozen slice until the user resumes.
  const [frozen, setFrozen] = useState<FlowPrint[] | null>(null);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [read, setRead] = useState('Awaiting prints…');
  const [flowFilter, setFlowFilter] = useState<FlowFilter>('ALL');
  const [sentFilter, setSentFilter] = useState<SentFilter>('ALL');
  const [minPremKey, setMinPremKey] = useState<PremKey>('0');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<FlowPrint | null>(null);

  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(COLS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return new Set(arr.filter((id: unknown) => typeof id === 'string'));
      }
    } catch {
      /* ignore */
    }
    return new Set(ALL_COLS.map(c => c.id));
  });
  const [views, setViews] = useState<SavedView[]>(() => {
    try {
      const raw = localStorage.getItem(VIEWS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr as SavedView[];
      }
    } catch {
      /* ignore */
    }
    return [];
  });

  const idRef = useRef(0);
  const lastReadRef = useRef(0);
  const rowsRef = useRef<FlowPrint[]>([]);
  rowsRef.current = rows;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Collection never stops — the tape keeps ingesting prints even while paused.
  useEffect(() => {
    if (!marketData) return;
    const fresh = marketData.tape.map(o => enrichPrint(o, ++idRef.current));
    if (fresh.length === 0) return;
    setRows(prev => [...fresh, ...prev].slice(0, MAX_ROWS));
    // Reading row 60 while the tape runs, the browser's scroll anchoring holds
    // your place — which is right, and also why prints pile up above you with
    // nothing to say so. Count them; the pill below is the way back.
    if (!atTopRef.current && !pausedRef.current) setUnread(n => n + fresh.length);
  }, [marketData]);

  // Persist chooser + saved views
  useEffect(() => {
    try {
      localStorage.setItem(COLS_KEY, JSON.stringify([...visibleCols]));
    } catch {
      /* ignore */
    }
  }, [visibleCols]);
  useEffect(() => {
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
    } catch {
      /* ignore */
    }
  }, [views]);

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    // Snapshot on pause so the tape freezes; clear on resume so it catches up.
    setFrozen(next ? rowsRef.current : null);
  };

  // Session truth is the full live tape; filters shape the view only
  const summary = useMemo(() => summarizeTape(rows), [rows]);

  // Rendered base — frozen slice while paused, live tape otherwise
  const base = paused && frozen ? frozen : rows;
  const view = useMemo(() => {
    const minPrem = Number(minPremKey);
    const q = search.trim().toLowerCase();
    return base.filter(
      r =>
        (flowFilter === 'ALL' || (flowFilter === 'SWEEP' ? r.sweep : !r.sweep)) &&
        (sentFilter === 'ALL' || sentimentOf(r) === sentFilter) &&
        r.premium >= minPrem &&
        (q === '' || `${r.ticker} ${r.strike}${r.right} ${r.expiry}`.toLowerCase().includes(q))
    );
  }, [base, flowFilter, sentFilter, minPremKey, search]);

  // Prints collected since the pause snapshot — still real, just not yet rendered
  const pending =
    paused && frozen ? (frozen.length === 0 ? rows.length : rows.filter(r => r.id > frozen[0].id).length) : 0;

  const visibleDataCols = useMemo(() => ALL_COLS.filter(c => visibleCols.has(c.id)), [visibleCols]);
  const colCount = 1 + visibleDataCols.length;

  useEffect(() => {
    const now = Date.now();
    // The empty first render must not arm the throttle. It used to: the mount
    // pass stamped `lastReadRef`, then the opening batch of prints arrived all at
    // once — so `rows.length > 3` was already true and the throttle swallowed the
    // first real read. "Awaiting prints…" then sat under a "7 of 7 prints" count
    // for a full 8s on every load. Only a read taken over real rows arms it.
    const armed = lastReadRef.current !== 0;
    if (armed && rows.length > 3 && now - lastReadRef.current < READ_INTERVAL_MS) return;
    if (rows.length > 0) lastReadRef.current = now;
    setRead(tapeRead(rows, summary));
  }, [rows, summary]);

  const toggleMark = (id: number) =>
    setMarked(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        toast.info('Removed from tracked prints');
      } else {
        next.add(id);
        toast.success('Tracking print');
      }
      return next;
    });

  const toggleCol = (id: string) =>
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const resetCols = () => setVisibleCols(new Set(ALL_COLS.map(c => c.id)));

  const applyView = (v: SavedView) => {
    setFlowFilter(v.flow);
    setSentFilter(v.sent);
    setMinPremKey(v.prem);
    setSearch(v.search);
  };
  const saveView = (name: string) =>
    setViews(prev => [
      ...prev.filter(x => x.name !== name),
      { name, flow: flowFilter, sent: sentFilter, prem: minPremKey, search },
    ]);
  const deleteView = (name: string) => setViews(prev => prev.filter(x => x.name !== name));
  const activeViewName = useMemo(
    () =>
      views.find(v => v.flow === flowFilter && v.sent === sentFilter && v.prem === minPremKey && v.search === search)
        ?.name ?? null,
    [views, flowFilter, sentFilter, minPremKey, search]
  );

  // ---- virtualization ----------------------------------------------------------
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const firstRowRef = useRef<HTMLTableRowElement>(null);
  const rafRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(640);
  const [rowH, setRowH] = useState(ROW_H_ESTIMATE);
  /** Columns whose right edge sits past the scroll box — silently amputated
      without this, since the h-scrollbar is 640px down at the foot of the tape. */
  const [clipped, setClipped] = useState(0);
  /** Prints that landed above the reader while they were scrolled into the tape. */
  const [unread, setUnread] = useState(0);
  const atTopRef = useRef(true);
  /** Header height, so the unread pill floats under the column names instead of
      over them — the header is two rows of variable content, never a fixed 47px. */
  const [headH, setHeadH] = useState(0);

  /** Rows this box holds — the honest denominator for "is the tape full yet". */
  const boxRows = Math.max(1, Math.ceil(viewportH / rowH));
  /** The tape only ever holds the prints of the ticks you were present for: it
      opens on whatever the first 1.5s tick emitted (3 on a cold load, measured)
      and needs ~4 ticks to cover one screen and ~25 to reach 100. So the first
      paint is a near-empty 640px box that then fills in under the reader. Until
      the box has been full once, the part that has no prints yet renders as
      placeholders with the count beside them, rather than as blank tape.
      Latched: after the first full screen an empty box is a filter result, not a
      cold start, and must keep saying so. */
  const [warmed, setWarmed] = useState(false);
  useEffect(() => {
    if (!warmed && (rows.length >= boxRows || paused)) setWarmed(true);
  }, [warmed, rows.length, boxRows, paused]);

  // One read of the scroll box serves both axes: the vertical size drives the
  // virtualization window, the horizontal drives the clipped-column count.
  const measureBox = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportH(el.clientHeight);
    setHeadH(el.querySelector('thead')?.getBoundingClientRect().height ?? 0);
    const right = el.getBoundingClientRect().right;
    let past = 0;
    el.querySelectorAll('thead tr:last-child th').forEach(th => {
      if (th.getBoundingClientRect().right > right + 1) past++;
    });
    setClipped(past);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    measureBox();
    // The TABLE has to be observed as well as the box. The box keeps its size
    // while the table's intrinsic width changes — a column set toggling, or the
    // first prints arriving and widening every cell — and the clipped count is a
    // fact about the table, not the box.
    const ro = new ResizeObserver(measureBox);
    ro.observe(el);
    if (tableRef.current) ro.observe(tableRef.current);
    return () => ro.disconnect();
  }, [measureBox]);

  useEffect(measureBox, [colCount, measureBox]);

  // Self-correct the row height from the first mounted row so the padding math
  // matches real layout regardless of borders, fonts, or content. Only re-measures
  // when the first row appears or the column set changes — not on every scroll/tick,
  // which would force a layout read each render.
  useEffect(() => {
    const h = firstRowRef.current?.getBoundingClientRect().height;
    if (h && h > 0 && Math.abs(h - rowH) > 0.5) setRowH(h);
    // `warmed` is a dep because it is the flip that first mounts a real row —
    // `view.length > 0` is already true behind the placeholders, so on its own
    // it never fires and the row height stays at the estimate for the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colCount, warmed, view.length > 0]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const onScroll = () => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (scrollRef.current) {
        setScrollTop(scrollRef.current.scrollTop);
        // Back at the newest print means caught up — nothing left unread.
        const top = scrollRef.current.scrollTop <= TOP_EPSILON;
        if (top !== atTopRef.current) {
          atTopRef.current = top;
          if (top) setUnread(0);
        }
      }
      measureBox();
    });
  };

  /** Scroll back to the newest print. Also how the unread count is cleared —
      arriving at the top is what "read" means here. */
  const jumpToNewest = () => {
    atTopRef.current = true;
    setUnread(0);
    scrollRef.current?.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  // On resume, jump back to the freshest prints so the caught-up rows are in view.
  useEffect(() => {
    if (!paused) {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      setScrollTop(0);
      atTopRef.current = true;
      setUnread(0);
    }
  }, [paused]);

  const total = view.length;
  const totalH = total * rowH;
  const clampedTop = Math.min(scrollTop, Math.max(0, totalH - viewportH));
  const start = Math.max(0, Math.floor(clampedTop / rowH) - OVERSCAN);
  const end = Math.min(total, Math.ceil((clampedTop + viewportH) / rowH) + OVERSCAN);
  const windowRows = view.slice(start, end);
  const padTop = start * rowH;
  const padBottom = Math.max(0, (total - end) * rowH);

  const dirTotal = summary.bullPremium + summary.bearPremium || 1;
  const bearPct = Math.round((summary.bearPremium / dirTotal) * 100);

  return (
    <>
      {/* Session strip */}
      <MetricGrid min="170px">
        <StatCard label="Session Premium" value={fmtUsd(summary.totalPremium)} sub={`${rows.length} prints on tape`} />
        <StatCard label="Call / Put Premium" value={`${summary.callCount} / ${summary.putCount}`} sub={`${fmtUsd(summary.callPremium)} vs ${fmtUsd(summary.putPremium)}`}>
          <RatioBar left={summary.callPremium} right={summary.putPremium} />
        </StatCard>
        <StatCard
          label="Bullish vs Bearish"
          value={bearPct >= 50 ? `${bearPct}% BEAR` : `${100 - bearPct}% BULL`}
          tone={bearPct >= 50 ? 'bear' : 'bull'}
        >
          <RatioBar left={summary.bullPremium} right={summary.bearPremium} />
        </StatCard>
        <StatCard label="Sweeps" value={String(summary.sweeps)} sub="aggressive orders" tone="warn" />
        <StatCard label="Blocks" value={String(summary.blocks)} sub="negotiated size" />
        <StatCard
          label="Largest Print"
          value={summary.largest ? fmtUsd(summary.largest.premium) : '—'}
          sub={summary.largest ? `${summary.largest.ticker} ${summary.largest.strike}${summary.largest.right}` : 'awaiting tape'}
          tone={(summary.largest && summary.largest.premium >= 1_000_000 ? 'magenta' : 'neutral') as Tone}
        />
      </MetricGrid>

      {/* Controls + filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={togglePause}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border font-mono text-label font-semibold uppercase tracking-wider transition-colors ${
            paused
              ? 'border-warn/40 bg-warn/[0.06] text-warn hover:bg-warn/[0.1]'
              : 'border-select/40 bg-select/[0.06] text-select hover:bg-select/[0.12]'
          }`}
        >
          {paused ? (
            <>
              <Play className="w-3 h-3" /> Resume
            </>
          ) : (
            <>
              <Pause className="w-3 h-3" /> Pause
            </>
          )}
        </button>

        {paused && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-warn/40 bg-warn/[0.06] font-mono text-label font-semibold uppercase tracking-wider text-warn">
            <span className="w-1.5 h-1.5 rounded-full bg-warn custom-pulse" />
            Paused · {pending} new print{pending === 1 ? '' : 's'} buffered · resume to catch up
          </span>
        )}

        {/* Ticker / contract search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textMuted pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Ticker / contract…"
            aria-label="Search ticker or contract"
            className="w-44 bg-panel border border-borderSubtle hover:border-borderMuted focus:border-borderMuted rounded-md pl-8 pr-7 py-1.5 font-mono text-label text-textPrimary placeholder:text-textMuted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-textMuted hover:text-textPrimary transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <SegmentedControl ariaLabel="Flow type" options={FLOW_OPTIONS} value={flowFilter} onChange={setFlowFilter} />
        <SegmentedControl ariaLabel="Sentiment" options={SENT_OPTIONS} value={sentFilter} onChange={setSentFilter} />
        <SegmentedControl ariaLabel="Min premium" options={PREM_OPTIONS} value={minPremKey} onChange={setMinPremKey} />

        <SavedViews
          views={views}
          activeName={activeViewName}
          onApply={applyView}
          onSave={saveView}
          onDelete={deleteView}
        />
        <ColumnChooser visible={visibleCols} onToggle={toggleCol} onReset={resetCols} />

        {/* Says out loud what the viewport is cutting off. Without it the only
            hint is a horizontal scrollbar at the foot of a 640px tape. */}
        {clipped > 0 && (
          <span className="font-mono text-label text-warn uppercase tracking-wider tnum">
            {clipped} {clipped === 1 ? 'column' : 'columns'} off-screen · scroll or hide some
          </span>
        )}

        <span className="ml-auto font-mono text-label text-textMuted uppercase tracking-wider tnum">
          {view.length} of {base.length} prints · {marked.size} marked
        </span>
      </div>

      {/* The terminal's read of the tape — fixed height so a changing sentence
          length never reflows the tape below it (no layout shift under live data). */}
      <div className={`flex items-center gap-2.5 border-l-2 pl-3 min-h-[34px] ${summary.bullish ? 'border-bull/70' : 'border-bear/70'}`}>
        <span className="font-mono text-label font-semibold uppercase tracking-widest text-textMuted shrink-0">
          Tape read
        </span>
        <p className="text-label text-textSecondary leading-snug tnum self-center line-clamp-2">{read}</p>
      </div>

      {/* The tape owns the row. It used to share it with a side rail behind a
          min-[1840px] split, and the split ran backwards: measured at 1839 the
          tape was 1765px wide with every column visible, and crossing to 1840
          cut it to 1319px and pushed a column off-screen — the handoff bought
          the rail 444px by amputating the table it sat next to. The rail is gone
          (Dark Pool has its own subtab, and six premium bars never earned a
          column), so the split and the width it cost go with it. The
          clipped-column counter still earns its keep: the table's intrinsic
          width settles near 1330px once prints have widened the cells, so a
          1280px viewport (1220px of content) still hides two columns. */}
      <Panel
        title="Options Tape"
        subtitle={
          paused ? 'rendering paused · tape still collecting' : warmed ? 'newest prints first' : 'first screen filling'
        }
        flush
      >
        {/* FIXED height (not max-h) — the tape never grows or shrinks as prints
            arrive; it always scrolls inside a stable 640px viewport. */}
        <div className="relative">
          {clipped > 0 && (
            <span
              aria-hidden
              className="pointer-events-none absolute top-0 bottom-3 right-0 w-12 z-20 bg-gradient-to-l from-panel to-transparent"
            />
          )}
          {/* Sits below the sticky header rather than over them — the column
              names are what you are reading the tape against. */}
          <AnimatePresence initial={false}>
            {unread > 0 && (
              <motion.div
                className="pointer-events-none absolute inset-x-0 z-30 flex justify-center"
                style={{ top: headH + 8 }}
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: DUR.fast, ease: EASE } }}
                transition={PILL}
              >
                <button
                  onClick={jumpToNewest}
                  // Holo, not another panel surface: this floats over live rows
                  // and has to read as an object above the tape rather than a
                  // smudge on it — and it is the one silver thing in a field of
                  // red and green, so it can't be mistaken for a print.
                  className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full holo-bg pl-2 pr-2.5 py-1 font-mono text-micro font-semibold uppercase tracking-wide text-ink shadow-[0_2px_12px_rgba(0,0,0,0.65)] ring-1 ring-black/40 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-select active:scale-[0.98]"
                >
                  <ArrowUp className="w-3 h-3" />
                  <span className="tabular-nums">
                    {unread > 99 ? '99+' : unread} new {unread === 1 ? 'print' : 'prints'}
                  </span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={scrollRef} onScroll={onScroll} className="overflow-auto h-[640px]">
            <table ref={tableRef} className="w-full border-collapse min-w-[640px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-panelRaised">
                  <th rowSpan={2} className="px-2 py-1.5 text-left font-mono text-label font-semibold uppercase tracking-widest text-textSecondary border-b border-borderSubtle w-24">
                    Time
                  </th>
                  {GROUP_ORDER.map(g => {
                    const gc = visibleDataCols.filter(c => c.group === g);
                    if (gc.length === 0) return null;
                    return (
                      <th
                        key={g}
                        colSpan={gc.length}
                        className="px-2 py-1.5 text-center font-mono text-label font-bold uppercase tracking-widest text-textPrimary border-b border-l border-borderSubtle"
                      >
                        {g}
                      </th>
                    );
                  })}
                </tr>
                <tr className="bg-panelRaised">
                  {visibleDataCols.map((c, i) => {
                    const groupStart = i === 0 || visibleDataCols[i - 1].group !== c.group;
                    return (
                      <th
                        key={c.id}
                        className={`px-2 py-1 font-mono text-label font-semibold uppercase tracking-widest text-textSecondary border-b border-borderSubtle whitespace-nowrap ${
                          groupStart ? 'border-l' : ''
                        } ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                      >
                        {c.help ? <Term k={c.help}>{c.label}</Term> : c.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {total === 0 && (warmed || base.length > 0) && (
                  <tr>
                    <td colSpan={colCount}>
                      <EmptyState size="lg" title={base.length === 0 ? 'Awaiting first prints…' : 'No prints match the filters'} />
                    </td>
                  </tr>
                )}
                {padTop > 0 && (
                  <tr aria-hidden style={{ height: padTop }}>
                    <td colSpan={colCount} className="p-0 border-0" />
                  </tr>
                )}
                {windowRows.map((r, idx) => (
                  <tr
                    key={r.id}
                    ref={idx === 0 ? firstRowRef : undefined}
                    onClick={() => setSelected(r)}
                    {...interactiveRowProps(() => setSelected(r), selected?.id === r.id)}
                    className={`${ROW_INTERACTIVE} border-b border-borderSubtle/30 last:border-0 ${
                      selected?.id === r.id ? 'inst-selected' : 'hover:bg-rowHover'
                    } ${rowAccent(r.premium)}`}
                  >
                    {/* Time rail */}
                    <td className="px-2 py-2 bg-inset border-r border-borderSubtle/40 whitespace-nowrap align-middle">
                      <span className="flex items-center gap-1.5">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            toggleMark(r.id);
                          }}
                          className={`-m-1.5 p-1.5 transition-colors ${marked.has(r.id) ? 'text-select' : 'text-textMuted hover:text-textPrimary'}`}
                          aria-label="Track print"
                        >
                          <Bookmark className="w-3 h-3" fill={marked.has(r.id) ? 'currentColor' : 'none'} />
                        </button>
                        <span className="font-mono text-label tnum text-textMuted">{r.time}</span>
                      </span>
                    </td>

                    {visibleDataCols.map((c, i) => {
                      const groupStart = i === 0 || visibleDataCols[i - 1].group !== c.group;
                      return (
                        <td
                          key={c.id}
                          className={`px-2 py-2 align-middle whitespace-nowrap font-mono ${c.align === 'right' ? 'text-right' : 'text-left'} ${
                            groupStart ? 'border-l border-borderSubtle/30' : ''
                          } ${c.cls} ${c.dyn?.(r) ?? ''}`}
                        >
                          {c.cell(r)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {padBottom > 0 && (
                  <tr aria-hidden style={{ height: padBottom }}>
                    <td colSpan={colCount} className="p-0 border-0" />
                  </tr>
                )}
                {!warmed && (
                  <tr>
                    <td colSpan={colCount} className="px-2 py-2 border-0">
                      <span className="block pb-1.5 font-mono text-label uppercase tracking-widest text-textMuted tnum">
                        First screen filling · {base.length} of {boxRows} prints
                      </span>
                      {/* Placeholders, not invented rows: the tape below this
                          line has not printed yet and the box says so. */}
                      {Array.from({ length: Math.max(0, boxRows - total) }).map((_, i) => (
                        <span key={i} className="block py-[3px]" style={{ height: rowH }}>
                          <Skeleton className="h-full w-full rounded-sm" />
                        </span>
                      ))}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      <TapeRowDrawer
        print={selected}
        onClose={() => setSelected(null)}
        isMarked={selected ? marked.has(selected.id) : false}
        onToggleMark={toggleMark}
      />
    </>
  );
};

export default LiveTape;
