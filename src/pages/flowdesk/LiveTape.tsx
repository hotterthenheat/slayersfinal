import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Check, Pause, Play, Plus, Save, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { enrichPrint, sentimentOf, summarizeTape } from '../../data/flowtape';
import { buildGexView, fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { useToast } from '../../components/ui/Toast';
import TapeRowDrawer from './TapeRowDrawer';
import type { FlowPrint, PrintSentiment, TapeSummary } from '../../types/flowdesk';

const MAX_ROWS = 400;
const READ_INTERVAL_MS = 8_000;

// Windowed rendering — only the visible slice of rows mounts. Rows are
// structurally identical so a single measured height drives the scroll math.
const ROW_H_ESTIMATE = 40;
const OVERSCAN = 8;

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
    ? 'shadow-[inset_2px_0_0_0_rgba(234,0,255,0.75)]'
    : premium >= 250_000
      ? 'shadow-[inset_2px_0_0_0_rgba(255,149,0,0.5)]'
      : '';

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

const SessionCard = ({
  label,
  value,
  sub,
  tone = 'text-textPrimary',
  children,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  children?: React.ReactNode;
}) => (
  <div className="border border-borderSubtle bg-panel rounded-md px-3 py-2 min-w-0">
    <div className="font-mono text-[11px] uppercase tracking-widest text-textSecondary truncate">{label}</div>
    <div className={`mt-0.5 font-mono text-base font-bold tnum ${tone}`}>{value}</div>
    {sub && <div className="font-mono text-[11px] text-textSecondary truncate">{sub}</div>}
    {children}
  </div>
);

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
          className={`inline-flex w-9 justify-center rounded border px-1 py-px font-mono text-[10px] font-semibold ${
            print.side === 'ASK'
              ? 'border-bull/30 bg-bull/[0.07] text-bull'
              : print.side === 'BID'
                ? 'border-bear/30 bg-bear/[0.07] text-bear'
                : 'border-borderSubtle text-textMuted'
          }`}
        >
          {sideLabel}
        </span>
        <span className={`w-7 text-right font-mono text-[11px] tnum font-semibold ${tone}`}>
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
      <span className={`font-mono text-[10px] font-semibold uppercase tracking-wide tnum leading-[14px] ${tone}`}>
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
          className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold ${
            r.right === 'C' ? 'border-bull/30 bg-bull/10 text-bull' : 'border-bear/30 bg-bear/10 text-bear'
          }`}
        >
          {r.ticker} {r.strike}
          {r.right}
        </span>
        {r.legs > 1 && <span className="ml-1.5 font-mono text-[10px] text-select">×{r.legs}</span>}
      </>
    ),
  },
  {
    id: 'expdte',
    group: 'Contract',
    label: 'Exp · DTE',
    align: 'right',
    cls: 'text-[11px] tnum text-textSecondary',
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
    align: 'right',
    cls: 'text-[11px] tnum',
    dyn: r => (r.otmPct >= 0 ? 'text-bull' : 'text-bear'),
    cell: r => `${r.otmPct >= 0 ? '+' : ''}${r.otmPct.toFixed(1)}%`,
  },
  {
    id: 'spot',
    group: 'Contract',
    label: 'Spot',
    align: 'right',
    cls: 'text-[11px] tnum text-textSecondary',
    cell: r => `$${r.spot.toFixed(2)}`,
  },
  // Execution
  {
    id: 'fill',
    group: 'Execution',
    label: 'Fill',
    align: 'right',
    cls: 'text-[11px] tnum font-semibold text-textPrimary',
    cell: r => `$${r.fill.toFixed(2)}`,
  },
  { id: 'spread', group: 'Execution', label: 'Spread', cls: '', cell: r => <SpreadCell print={r} /> },
  {
    id: 'size',
    group: 'Execution',
    label: 'Size',
    align: 'right',
    cls: 'text-[11px] tnum text-textPrimary',
    cell: r => r.size.toLocaleString(),
  },
  {
    id: 'prem',
    group: 'Execution',
    label: 'Prem',
    align: 'right',
    cls: 'text-[11px] tnum',
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
    cls: 'text-[11px] font-semibold',
    dyn: r => SENT_TEXT[sentimentOf(r)],
    cell: r => sentimentOf(r),
  },
  // Activity
  {
    id: 'vol',
    group: 'Activity',
    label: 'Vol',
    align: 'right',
    cls: 'text-[11px] tnum text-textSecondary',
    cell: r => r.volume.toLocaleString(),
  },
  {
    id: 'oi',
    group: 'Activity',
    label: 'OI',
    align: 'right',
    cls: 'text-[11px] tnum text-textSecondary',
    cell: r => r.oi.toLocaleString(),
  },
  {
    id: 'doi',
    group: 'Activity',
    label: 'ΔOI',
    align: 'right',
    cls: 'text-[11px] tnum',
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
    align: 'right',
    cls: 'text-[11px] tnum',
    dyn: r => (r.volOverOI >= 5 ? 'text-warn font-semibold' : 'text-textSecondary'),
    cell: r => `${r.volOverOI.toFixed(2)}x`,
  },
  {
    id: 'iv',
    group: 'Activity',
    label: 'IV',
    align: 'right',
    cls: 'text-[11px] tnum text-textSecondary',
    cell: r => `${r.iv.toFixed(1)}%`,
  },
  {
    id: 'tag',
    group: 'Activity',
    label: 'Tag',
    cls: 'text-[10px] text-textMuted',
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
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-borderSubtle hover:border-borderMuted bg-panel font-mono text-[11px] font-semibold uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" /> Columns
        {hiddenCount > 0 && <span className="font-mono text-[11px] text-select tnum">−{hiddenCount}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-40 w-64 border border-borderMuted bg-panel rounded-lg shadow-2xl shadow-black overflow-hidden animate-slide-in">
          <div className="flex items-center justify-between px-3 py-2 border-b border-borderSubtle">
            <span className="font-mono text-[11px] uppercase tracking-widest text-textSecondary">Columns</span>
            <button
              onClick={onReset}
              className="font-mono text-[11px] uppercase tracking-wider text-textMuted hover:text-textPrimary transition-colors"
            >
              Show all
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {GROUP_ORDER.map(g => (
              <div key={g}>
                <div className="px-3 pt-2 pb-1 font-mono text-[11px] uppercase tracking-widest text-textMuted">{g}</div>
                {ALL_COLS.filter(c => c.group === g).map(c => {
                  const on = visible.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => onToggle(c.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-white/[0.03] transition-colors"
                    >
                      <span
                        className={`inline-flex items-center justify-center w-4 h-4 rounded border ${
                          on ? 'border-select/50 bg-select/15 text-select' : 'border-borderMuted text-transparent'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                      </span>
                      <span className={`font-mono text-[12px] ${on ? 'text-textPrimary' : 'text-textMuted'}`}>{c.label}</span>
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
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-borderSubtle hover:border-borderMuted bg-panel font-mono text-[11px] font-semibold uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
      >
        <Save className="w-3.5 h-3.5" /> Views
        {views.length > 0 && <span className="font-mono text-[11px] text-select tnum">{views.length}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-40 w-64 border border-borderMuted bg-panel rounded-lg shadow-2xl shadow-black overflow-hidden animate-slide-in">
          <div className="px-3 py-2 border-b border-borderSubtle">
            <span className="font-mono text-[11px] uppercase tracking-widest text-textSecondary">Saved filter views</span>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {views.length === 0 ? (
              <div className="px-3 py-4 text-center font-mono text-[11px] text-textMuted">No saved views yet</div>
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
                    className={`flex-1 min-w-0 text-left font-mono text-[12px] truncate transition-colors ${
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
              className="flex-1 min-w-0 bg-inset border border-borderSubtle rounded px-2 py-1 font-mono text-[12px] text-textPrimary placeholder:text-textMuted focus:outline-none focus:border-borderMuted"
            />
            <button
              onClick={commit}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded border border-borderSubtle hover:border-borderMuted font-mono text-[11px] text-textSecondary hover:text-textPrimary transition-colors"
            >
              <Plus className="w-3 h-3" /> Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/** Streaming rich options prints in the house grammar — session strip, filters, multi-ticker. */
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

  // Collection never stops — the tape keeps ingesting prints even while paused.
  useEffect(() => {
    if (!marketData) return;
    const fresh = marketData.tape.map(o => enrichPrint(o, ++idRef.current));
    if (fresh.length === 0) return;
    setRows(prev => [...fresh, ...prev].slice(0, MAX_ROWS));
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

  useEffect(() => {
    const now = Date.now();
    if (now - lastReadRef.current < READ_INTERVAL_MS && rows.length > 3) return;
    lastReadRef.current = now;
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
  const firstRowRef = useRef<HTMLTableRowElement>(null);
  const rafRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(640);
  const [rowH, setRowH] = useState(ROW_H_ESTIMATE);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Self-correct the row height from the first mounted row so the padding math
  // matches real layout regardless of borders, fonts, or content. Only re-measures
  // when the first row appears or the column set changes — not on every scroll/tick,
  // which would force a layout read each render.
  useEffect(() => {
    const h = firstRowRef.current?.getBoundingClientRect().height;
    if (h && h > 0 && Math.abs(h - rowH) > 0.5) setRowH(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colCount, view.length > 0]);

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
      if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
    });
  };

  // On resume, jump back to the freshest prints so the caught-up rows are in view.
  useEffect(() => {
    if (!paused) {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      setScrollTop(0);
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
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
        <SessionCard label="Session Premium" value={fmtUsd(summary.totalPremium)} sub={`${rows.length} prints on tape`} />
        <SessionCard label="Call / Put Premium" value={`${summary.callCount} / ${summary.putCount}`} sub={`${fmtUsd(summary.callPremium)} vs ${fmtUsd(summary.putPremium)}`}>
          <RatioBar left={summary.callPremium} right={summary.putPremium} />
        </SessionCard>
        <SessionCard
          label="Bullish vs Bearish"
          value={bearPct >= 50 ? `${bearPct}% BEAR` : `${100 - bearPct}% BULL`}
          tone={bearPct >= 50 ? 'text-bear' : 'text-bull'}
        >
          <RatioBar left={summary.bullPremium} right={summary.bearPremium} />
        </SessionCard>
        <SessionCard label="Sweeps" value={String(summary.sweeps)} sub="aggressive orders" tone="text-warn" />
        <SessionCard label="Blocks" value={String(summary.blocks)} sub="negotiated size" />
        <SessionCard
          label="Largest Print"
          value={summary.largest ? fmtUsd(summary.largest.premium) : '—'}
          sub={summary.largest ? `${summary.largest.ticker} ${summary.largest.strike}${summary.largest.right}` : 'awaiting tape'}
          tone={summary.largest && summary.largest.premium >= 1_000_000 ? 'text-king' : 'text-textPrimary'}
        />
      </div>

      {/* Controls + filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={togglePause}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors ${
            paused
              ? 'border-warn/40 bg-warn/[0.06] text-warn hover:bg-warn/[0.1]'
              : 'border-bull/40 bg-bull/[0.06] text-bull hover:bg-bull/[0.1]'
          }`}
        >
          {paused ? (
            <>
              <Play className="w-3 h-3" /> Resume
            </>
          ) : (
            <>
              <Pause className="w-3 h-3" /> Live
            </>
          )}
        </button>

        {paused && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-warn/40 bg-warn/[0.06] font-mono text-[11px] font-semibold uppercase tracking-wider text-warn">
            <span className="w-1.5 h-1.5 rounded-full bg-warn custom-pulse" />
            Paused · {pending} new print{pending === 1 ? '' : 's'} buffered — resume to catch up
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
            className="w-44 bg-panel border border-borderSubtle hover:border-borderMuted focus:border-borderMuted rounded-md pl-8 pr-7 py-1.5 font-mono text-[11px] text-textPrimary placeholder:text-textMuted focus:outline-none transition-colors"
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

        <span className="ml-auto font-mono text-[11px] text-textMuted uppercase tracking-wider tnum">
          {view.length} of {base.length} prints · {marked.size} marked
        </span>
      </div>

      {/* The terminal's read of the tape — fixed height so a changing sentence
          length never reflows the tape below it (no layout shift under live data). */}
      <div className={`flex items-start gap-2.5 border-l-2 pl-3 min-h-[34px] ${summary.bullish ? 'border-bull/70' : 'border-bear/70'}`}>
        <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-textMuted pt-1.5 shrink-0">
          Tape read
        </span>
        <p className="text-[11px] text-textSecondary leading-snug tnum self-center line-clamp-2">{read}</p>
      </div>

      {/* Tape + concentration */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <Panel title="Options Tape" subtitle={paused ? 'rendering paused — tape still collecting' : 'streaming prints — newest first'} flush className="xl:col-span-9 min-w-0">
          {/* FIXED height (not max-h) — the tape never grows or shrinks as prints
              arrive; it always scrolls inside a stable 640px viewport. */}
          <div ref={scrollRef} onScroll={onScroll} className="overflow-auto h-[640px]">
            <table className="w-full border-collapse min-w-[640px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#0c0c0c]">
                  <th rowSpan={2} className="px-2 py-1.5 text-left font-mono text-[11px] font-semibold uppercase tracking-widest text-textSecondary border-b border-borderSubtle w-24">
                    Time
                  </th>
                  {GROUP_ORDER.map(g => {
                    const gc = visibleDataCols.filter(c => c.group === g);
                    if (gc.length === 0) return null;
                    return (
                      <th
                        key={g}
                        colSpan={gc.length}
                        className="px-2 py-1.5 text-center font-mono text-[11px] font-bold uppercase tracking-widest text-textPrimary border-b border-l border-borderSubtle"
                      >
                        {g}
                      </th>
                    );
                  })}
                </tr>
                <tr className="bg-[#0c0c0c]">
                  {visibleDataCols.map((c, i) => {
                    const groupStart = i === 0 || visibleDataCols[i - 1].group !== c.group;
                    return (
                      <th
                        key={c.id}
                        className={`px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest text-textSecondary border-b border-borderSubtle whitespace-nowrap ${
                          groupStart ? 'border-l' : ''
                        } ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                      >
                        {c.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {total === 0 && (
                  <tr>
                    <td colSpan={colCount} className="py-10 text-center font-mono text-[11px] text-textMuted uppercase tracking-widest">
                      {base.length === 0 ? 'Awaiting first prints…' : 'No prints match the filters'}
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
                    className={`cursor-pointer border-b border-borderSubtle/30 last:border-0 ${
                      selected?.id === r.id ? 'bg-select/[0.08]' : 'hover:bg-white/[0.02]'
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
                          className={`transition-colors ${marked.has(r.id) ? 'text-select' : 'text-textMuted/40 hover:text-textSecondary'}`}
                          aria-label="Track print"
                        >
                          <Bookmark className="w-3 h-3" fill={marked.has(r.id) ? 'currentColor' : 'none'} />
                        </button>
                        <span className="font-mono text-[11px] tnum text-textMuted">{r.time}</span>
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
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Right rail: concentration summary on top, dark-pool feed below */}
        <div className="xl:col-span-3 min-w-0 flex flex-col gap-4">
          <Panel title="Top Tickers" subtitle="session premium concentration" className="w-full">
            <div className="flex flex-col gap-2.5">
              {topTickers.length === 0 && (
                <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest py-6 text-center">
                  Awaiting tape…
                </span>
              )}
              {topTickers.map((t, i) => (
                <div key={t.ticker} className="flex items-center gap-2">
                  <span className={`w-12 shrink-0 font-mono text-[11px] font-semibold ${i === 0 ? 'text-king' : 'text-textPrimary'}`}>
                    {t.ticker}
                  </span>
                  <span className="relative flex-1 h-[5px] rounded-full bg-white/[0.05]">
                    <span
                      className={`absolute inset-y-0 left-0 rounded-full ${i === 0 ? 'bg-king/70' : 'bg-white/25'}`}
                      style={{ width: `${(t.premium / topMax) * 100}%` }}
                    />
                  </span>
                  <span className="w-14 shrink-0 text-right font-mono text-[11px] tnum text-textSecondary">
                    {fmtUsd(t.premium)}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Dark Pool" subtitle="off-exchange crosses · by notional" flush className="w-full flex-1 min-h-0">
            <div className="overflow-y-auto max-h-[360px]">
              {darkPrints.length === 0 ? (
                <span className="block font-mono text-[11px] text-textMuted uppercase tracking-widest py-6 text-center">
                  Awaiting prints…
                </span>
              ) : (
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[#0c0c0c]">
                      {['Ticker', 'Size', 'Price', 'Notional', 'Time'].map((h, i) => (
                        <th
                          key={h}
                          className={`px-2 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-textSecondary border-b border-borderSubtle ${
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
                        <td className="px-2 py-2 text-right font-mono text-[11px] tnum text-textSecondary whitespace-nowrap">
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
