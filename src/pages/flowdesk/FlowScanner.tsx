import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Check, Grid3x3, Plus, RotateCcw, ScanLine, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildScannerRows, summarizeScanner, type FlowSentiment, type ScannerRow } from '../../data/flowscan';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import SignalBadge from '../../components/ui/SignalBadge';
import SegmentedControl from '../../components/ui/SegmentedControl';
import DataTable, { type Column } from '../../components/ui/DataTable';
import ScannerRowDrawer from './ScannerRowDrawer';
import { useToast } from '../../components/ui/Toast';
import type { Tone } from '../../components/ui/tones';

const COLS_KEY = 'slayer.flowscanner.cols.v1';
const TPL_KEY = 'slayer.flowscanner.templates.v1';

// ---- filter model --------------------------------------------------------------
type Universe = 'ALL' | 'C' | 'P';
type SentFilter = 'ALL' | FlowSentiment;
type DteBucket = 'ALL' | 'D0' | 'W1' | 'M1' | 'FAR';
type MoneyZone = 'ALL' | 'ITM' | 'ATM' | 'OTM';
type PremKey = '0' | '50000' | '250000' | '1000000';
type OiKey = '0' | '100' | '500' | '1000' | '5000';
type UnusualKey = 'OFF' | 'P50' | 'P75' | 'P90';

interface ScanFilters {
  universe: Universe;
  sent: SentFilter;
  dte: DteBucket;
  money: MoneyZone;
  prem: PremKey;
  minOi: OiKey;
  unusual: UnusualKey;
  sweepsOnly: boolean;
}

const DEFAULTS: ScanFilters = {
  universe: 'ALL',
  sent: 'ALL',
  dte: 'ALL',
  money: 'ALL',
  prem: '0',
  minOi: '0',
  unusual: 'OFF',
  sweepsOnly: false,
};

const UNIVERSE_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'C', label: 'Calls' },
  { value: 'P', label: 'Puts' },
] as const;

const SENT_OPTIONS = [
  { value: 'ALL', label: 'Any' },
  { value: 'BULLISH', label: 'Bullish' },
  { value: 'BEARISH', label: 'Bearish' },
] as const;

const DTE_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'D0', label: '0DTE' },
  { value: 'W1', label: '≤7d' },
  { value: 'M1', label: '≤30d' },
  { value: 'FAR', label: '30d+' },
] as const;

const MONEY_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'ITM', label: 'ITM' },
  { value: 'ATM', label: 'ATM' },
  { value: 'OTM', label: 'OTM' },
] as const;

const PREM_OPTIONS = [
  { value: '0', label: 'Any' },
  { value: '50000', label: '≥50K' },
  { value: '250000', label: '≥250K' },
  { value: '1000000', label: '≥1M' },
] as const;

const OI_OPTIONS = [
  { value: '0', label: 'Any' },
  { value: '100', label: '≥100' },
  { value: '500', label: '≥500' },
  { value: '1000', label: '≥1K' },
  { value: '5000', label: '≥5K' },
] as const;

const UNUSUAL_OPTIONS = [
  { value: 'OFF', label: 'Off' },
  { value: 'P50', label: 'P50' },
  { value: 'P75', label: 'P75' },
  { value: 'P90', label: 'P90' },
] as const;

// Preset scan recipes — each is a full reset over DEFAULTS plus the named patch.
// Every threshold is a user-facing filter cut, wired only to values each row
// already carries (premium, OI, DTE, moneyness, vol/OI, sweeps).
const PRESETS: { name: string; patch: Partial<ScanFilters> }[] = [
  { name: 'Whale premium', patch: { prem: '1000000' } },
  { name: 'Unusual sweeps', patch: { unusual: 'P75', sweepsOnly: true, prem: '250000' } },
  { name: 'Near-money calls', patch: { universe: 'C', money: 'ATM', dte: 'M1' } },
  { name: 'OTM lottos', patch: { universe: 'C', money: 'OTM', dte: 'W1', prem: '50000' } },
  { name: 'Liquid names', patch: { minOi: '1000' } },
];

interface SavedTemplate {
  name: string;
  filters: ScanFilters;
}

const resolve = (patch: Partial<ScanFilters>): ScanFilters => ({ ...DEFAULTS, ...patch });

const sameFilters = (a: ScanFilters, b: ScanFilters): boolean =>
  a.universe === b.universe &&
  a.sent === b.sent &&
  a.dte === b.dte &&
  a.money === b.money &&
  a.prem === b.prem &&
  a.minOi === b.minOi &&
  a.unusual === b.unusual &&
  a.sweepsOnly === b.sweepsOnly;

const sentTone: Record<FlowSentiment, Tone> = {
  BULLISH: 'bull',
  BEARISH: 'bear',
  NEUTRAL: 'neutral',
};

/** Diverging conviction bar centered at 0 — bullish right (holo), bearish left (red). */
const ScoreBar = ({ score }: { score: number }) => (
  <span className="flex items-center gap-1.5 w-full">
    <span className="relative flex-1 h-[6px] rounded-full bg-white/[0.05] overflow-hidden">
      <span className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20" />
      {score >= 0 ? (
        <span className="absolute top-0 bottom-0 left-1/2 holo-bar rounded-r-full" style={{ width: `${(score / 100) * 50}%` }} />
      ) : (
        <span className="absolute top-0 bottom-0 right-1/2 bg-bear/80 rounded-l-full" style={{ width: `${(-score / 100) * 50}%` }} />
      )}
    </span>
    <span className={`w-8 text-right font-mono text-[11px] tnum ${score >= 0 ? 'text-bull' : 'text-bear'}`}>
      {score >= 0 ? '+' : ''}
      {score}
    </span>
  </span>
);

// ---- column model --------------------------------------------------------------
const COL_META: { key: string; label: string; locked?: boolean }[] = [
  { key: 'contract', label: 'Contract', locked: true },
  { key: 'last', label: 'Last time' },
  { key: 'volume', label: 'Volume' },
  { key: 'oi', label: 'Open interest' },
  { key: 'doi', label: 'Est ΔOI / day' },
  { key: 'voi', label: 'Vol / OI' },
  { key: 'premium', label: 'Premium' },
  { key: 'iv', label: 'IV' },
  { key: 'score', label: 'Conviction' },
  { key: 'sent', label: 'Read' },
];

const ALL_COLUMNS: Column<ScannerRow>[] = [
  {
    key: 'contract',
    header: 'Contract',
    sortValue: r => r.strike,
    render: r => (
      <span className="flex flex-col">
        <span className="font-mono text-xs font-bold text-textPrimary">
          {r.ticker} {r.strike}
          <span className={r.right === 'C' ? 'text-bull' : 'text-bear'}>{r.right}</span>
        </span>
        <span className="font-mono text-[11px] text-textMuted">
          {r.expiry} · {r.dte}d · {r.otmPct >= 0 ? '+' : ''}
          {r.otmPct.toFixed(1)}%
        </span>
      </span>
    ),
  },
  { key: 'last', header: 'Last', render: r => <span className="font-mono text-xs text-textSecondary tnum">{r.last}</span> },
  { key: 'volume', header: 'Vol', align: 'right', sortValue: r => r.volume, render: r => <span className="font-mono text-xs text-textPrimary tnum">{r.volume.toLocaleString()}</span> },
  { key: 'oi', header: 'OI', align: 'right', sortValue: r => r.oi, render: r => <span className="font-mono text-xs text-textSecondary tnum">{r.oi.toLocaleString()}</span> },
  {
    key: 'doi',
    header: 'Est ΔOI/d',
    align: 'right',
    sortValue: r => r.deltaOi,
    render: r => (
      <span className={`font-mono text-xs tnum ${r.deltaOi >= 0 ? 'text-bull' : 'text-bear'}`}>
        {r.deltaOi >= 0 ? '+' : ''}
        {r.deltaOi.toLocaleString()}
      </span>
    ),
  },
  {
    key: 'voi',
    header: 'Vol/OI',
    align: 'right',
    sortValue: r => r.volOverOi,
    render: r => <span className={`font-mono text-xs tnum ${r.volOverOi > 1 ? 'text-warn' : 'text-textSecondary'}`}>{r.volOverOi.toFixed(2)}</span>,
  },
  { key: 'premium', header: 'Premium', align: 'right', sortValue: r => r.premium, render: r => <span className="font-mono text-xs font-semibold text-textPrimary tnum">{fmtUsd(r.premium)}</span> },
  { key: 'iv', header: 'IV', align: 'right', sortValue: r => r.iv, render: r => <span className="font-mono text-xs text-textSecondary tnum">{r.iv.toFixed(0)}%</span> },
  { key: 'score', header: 'Conviction', width: '150px', sortValue: r => r.bullScore, render: r => <ScoreBar score={r.bullScore} /> },
  { key: 'sent', header: 'Read', sortValue: r => r.sentiment, render: r => <SignalBadge tone={sentTone[r.sentiment]}>{r.sentiment}</SignalBadge> },
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

const triggerCls =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-borderSubtle hover:border-borderMuted bg-panel font-mono text-[11px] font-semibold uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors';

// ---- filter menu ---------------------------------------------------------------
const FilterRow = <V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) => (
  <div className="px-3 py-2">
    <div className="mb-1.5 font-mono text-[11px] uppercase tracking-widest text-textMuted">{label}</div>
    <div className="overflow-x-auto">
      <SegmentedControl ariaLabel={label} options={options} value={value} onChange={onChange} />
    </div>
  </div>
);

const FilterMenu = ({
  filters,
  patch,
  onReset,
  activeCount,
}: {
  filters: ScanFilters;
  patch: (p: Partial<ScanFilters>) => void;
  onReset: () => void;
  activeCount: number;
}) => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss<HTMLDivElement>(open, close);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className={triggerCls}>
        <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
        {activeCount > 0 && <span className="font-mono text-[11px] text-select tnum">{activeCount}</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-40 w-[340px] border border-borderMuted bg-panel rounded-lg shadow-2xl shadow-black overflow-hidden animate-slide-in">
          <div className="flex items-center justify-between px-3 py-2 border-b border-borderSubtle">
            <span className="font-mono text-[11px] uppercase tracking-widest text-textSecondary">Scan filters</span>
            <button
              onClick={onReset}
              className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-textMuted hover:text-textPrimary transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto divide-y divide-borderSubtle/60">
            <FilterRow label="DTE" options={DTE_OPTIONS} value={filters.dte} onChange={v => patch({ dte: v })} />
            <FilterRow label="Moneyness" options={MONEY_OPTIONS} value={filters.money} onChange={v => patch({ money: v })} />
            <FilterRow label="Min premium" options={PREM_OPTIONS} value={filters.prem} onChange={v => patch({ prem: v })} />
            <FilterRow label="Min liquidity (OI)" options={OI_OPTIONS} value={filters.minOi} onChange={v => patch({ minOi: v })} />
            <FilterRow label="Unusualness (vol/OI pct)" options={UNUSUAL_OPTIONS} value={filters.unusual} onChange={v => patch({ unusual: v })} />
            <button
              onClick={() => patch({ sweepsOnly: !filters.sweepsOnly })}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
            >
              <span
                className={`inline-flex items-center justify-center w-4 h-4 rounded border ${
                  filters.sweepsOnly ? 'border-select/50 bg-select/15 text-select' : 'border-borderMuted text-transparent'
                }`}
              >
                <Check className="w-3 h-3" />
              </span>
              <span className={`font-mono text-[12px] ${filters.sweepsOnly ? 'text-textPrimary' : 'text-textMuted'}`}>Sweeps only</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ---- saved templates -----------------------------------------------------------
const TemplatesMenu = ({
  custom,
  onApply,
  onSave,
  onDelete,
  activeName,
}: {
  custom: SavedTemplate[];
  onApply: (f: ScanFilters) => void;
  onSave: (name: string) => void;
  onDelete: (name: string) => void;
  activeName: string | null;
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

  const apply = (f: ScanFilters) => {
    onApply(f);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className={triggerCls}>
        <Bookmark className="w-3.5 h-3.5" /> {activeName ?? 'Templates'}
        {custom.length > 0 && <span className="font-mono text-[11px] text-select tnum">{custom.length}</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-40 w-64 border border-borderMuted bg-panel rounded-lg shadow-2xl shadow-black overflow-hidden animate-slide-in">
          <div className="max-h-72 overflow-y-auto py-1">
            <div className="px-3 pt-2 pb-1 font-mono text-[11px] uppercase tracking-widest text-textMuted">Presets</div>
            {PRESETS.map(p => {
              const f = resolve(p.patch);
              const on = activeName === p.name;
              return (
                <button
                  key={p.name}
                  onClick={() => apply(f)}
                  className={`w-full text-left px-3 py-1.5 font-mono text-[12px] transition-colors ${
                    on ? 'text-select bg-select/[0.06]' : 'text-textPrimary hover:text-select hover:bg-white/[0.03]'
                  }`}
                >
                  {p.name}
                </button>
              );
            })}

            <div className="px-3 pt-2 pb-1 mt-1 border-t border-borderSubtle font-mono text-[11px] uppercase tracking-widest text-textMuted">
              Saved
            </div>
            {custom.length === 0 ? (
              <div className="px-3 py-2 font-mono text-[11px] text-textMuted">No saved templates yet</div>
            ) : (
              custom.map(t => (
                <div key={t.name} className={`flex items-center gap-2 pl-3 pr-2 py-1 ${activeName === t.name ? 'bg-select/[0.06]' : ''}`}>
                  <button
                    onClick={() => apply(t.filters)}
                    className={`flex-1 min-w-0 text-left font-mono text-[12px] truncate transition-colors ${
                      activeName === t.name ? 'text-select' : 'text-textPrimary hover:text-select'
                    }`}
                  >
                    {t.name}
                  </button>
                  <button
                    onClick={() => onDelete(t.name)}
                    aria-label={`Delete template ${t.name}`}
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
              placeholder="Save current filters…"
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

// ---- column chooser ------------------------------------------------------------
const ColumnChooser = ({
  visible,
  onToggle,
  onReset,
}: {
  visible: Set<string>;
  onToggle: (key: string) => void;
  onReset: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss<HTMLDivElement>(open, close);
  const hiddenCount = COL_META.length - COL_META.filter(c => visible.has(c.key)).length;

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className={triggerCls}>
        <Grid3x3 className="w-3.5 h-3.5" /> Columns
        {hiddenCount > 0 && <span className="font-mono text-[11px] text-select tnum">−{hiddenCount}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-40 w-56 border border-borderMuted bg-panel rounded-lg shadow-2xl shadow-black overflow-hidden animate-slide-in">
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
            {COL_META.map(c => {
              const on = visible.has(c.key);
              return (
                <button
                  key={c.key}
                  onClick={() => !c.locked && onToggle(c.key)}
                  disabled={c.locked}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                    c.locked ? 'cursor-default' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <span
                    className={`inline-flex items-center justify-center w-4 h-4 rounded border ${
                      on ? 'border-select/50 bg-select/15 text-select' : 'border-borderMuted text-transparent'
                    }`}
                  >
                    <Check className="w-3 h-3" />
                  </span>
                  <span className={`font-mono text-[12px] ${on ? 'text-textPrimary' : 'text-textMuted'}`}>{c.label}</span>
                  {c.locked && <span className="ml-auto font-mono text-[11px] uppercase tracking-wider text-textMuted">pinned</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ---- page ----------------------------------------------------------------------
const FlowScanner = () => {
  const { marketData } = useMarketData();
  const toast = useToast();
  const rows = useMemo(() => (marketData ? buildScannerRows(marketData) : []), [marketData]);
  const summary = useMemo(() => summarizeScanner(rows), [rows]);
  const [filters, setFilters] = useState<ScanFilters>(DEFAULTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const patch = useCallback((p: Partial<ScanFilters>) => setFilters(f => ({ ...f, ...p })), []);

  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(COLS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return new Set(arr.filter((k: unknown) => typeof k === 'string'));
      }
    } catch {
      /* ignore */
    }
    return new Set(COL_META.map(c => c.key));
  });
  const [templates, setTemplates] = useState<SavedTemplate[]>(() => {
    try {
      const raw = localStorage.getItem(TPL_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr as SavedTemplate[];
      }
    } catch {
      /* ignore */
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLS_KEY, JSON.stringify([...visibleCols]));
    } catch {
      /* ignore */
    }
  }, [visibleCols]);
  useEffect(() => {
    try {
      localStorage.setItem(TPL_KEY, JSON.stringify(templates));
    } catch {
      /* ignore */
    }
  }, [templates]);

  // Unusualness cut — the vol/OI value at the chosen percentile of the full scan.
  // Pure ranking of an existing per-row metric, same category as sorting the table.
  const unusualCut = useMemo(() => {
    if (filters.unusual === 'OFF' || rows.length === 0) return -Infinity;
    const pct = filters.unusual === 'P50' ? 50 : filters.unusual === 'P75' ? 75 : 90;
    const sorted = rows.map(r => r.volOverOi).sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((pct / 100) * sorted.length));
    return sorted[idx];
  }, [rows, filters.unusual]);

  const filtered = useMemo(() => {
    const minPrem = Number(filters.prem);
    const minOi = Number(filters.minOi);
    const band = 2; // ATM tolerance, |otm%|
    return rows.filter(r => {
      if (filters.universe !== 'ALL' && r.right !== filters.universe) return false;
      if (filters.sent !== 'ALL' && r.sentiment !== filters.sent) return false;
      if (filters.dte === 'D0' && r.dte !== 0) return false;
      if (filters.dte === 'W1' && r.dte > 7) return false;
      if (filters.dte === 'M1' && r.dte > 30) return false;
      if (filters.dte === 'FAR' && r.dte <= 30) return false;
      if (filters.money !== 'ALL') {
        const abs = Math.abs(r.otmPct);
        if (filters.money === 'ATM' && abs > band) return false;
        if (filters.money === 'ITM') {
          const itm = r.right === 'C' ? r.otmPct < -band : r.otmPct > band;
          if (!itm) return false;
        }
        if (filters.money === 'OTM') {
          const otm = r.right === 'C' ? r.otmPct > band : r.otmPct < -band;
          if (!otm) return false;
        }
      }
      if (r.premium < minPrem) return false;
      if (r.oi < minOi) return false;
      if (filters.sweepsOnly && r.sweeps <= 0) return false;
      if (r.volOverOi < unusualCut) return false;
      return true;
    });
  }, [rows, filters, unusualCut]);

  const selected = rows.find(r => r.id === selectedId) ?? null;
  const columns = useMemo(() => ALL_COLUMNS.filter(c => visibleCols.has(c.key)), [visibleCols]);

  // Count of active cuts inside the Filters popover (universe / sentiment shown inline).
  const activeCount =
    (filters.dte !== 'ALL' ? 1 : 0) +
    (filters.money !== 'ALL' ? 1 : 0) +
    (filters.prem !== '0' ? 1 : 0) +
    (filters.minOi !== '0' ? 1 : 0) +
    (filters.unusual !== 'OFF' ? 1 : 0) +
    (filters.sweepsOnly ? 1 : 0);

  const activeTemplate = useMemo(() => {
    const preset = PRESETS.find(p => sameFilters(resolve(p.patch), filters));
    if (preset) return preset.name;
    const saved = templates.find(t => sameFilters(t.filters, filters));
    return saved?.name ?? null;
  }, [filters, templates]);

  const saveTemplate = (name: string) => {
    setTemplates(prev => [...prev.filter(t => t.name !== name), { name, filters }]);
    toast.success(`Saved template “${name}”`);
  };
  const deleteTemplate = (name: string) => {
    setTemplates(prev => prev.filter(t => t.name !== name));
    toast.info(`Deleted template “${name}”`);
  };

  const toggleCol = (key: string) =>
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const resetCols = () => setVisibleCols(new Set(COL_META.map(c => c.key)));

  const resetFilterMenu = () =>
    patch({ dte: 'ALL', money: 'ALL', prem: '0', minOi: '0', unusual: 'OFF', sweepsOnly: false });

  return (
    <>
      <MetricGrid min="170px">
        <StatCard label="Contracts scanned" value={summary.contracts} sub={`${filtered.length} shown`} />
        <StatCard label="Total premium" value={fmtUsd(summary.totalPremium)} sub={`${fmtUsd(summary.callPremium)} calls / ${fmtUsd(summary.putPremium)} puts`} />
        <StatCard
          label="Net directional"
          value={`${summary.bullish ? '+' : '−'}${fmtUsd(Math.abs(summary.netPremium))}`}
          sub={summary.bullish ? 'bullish premium leads' : 'bearish premium leads'}
          tone={summary.bullish ? 'bull' : 'bear'}
        />
        <StatCard
          label="Top bull"
          value={summary.topBull ? `${summary.topBull.strike}${summary.topBull.right}` : '--'}
          sub={summary.topBull ? `+${summary.topBull.bullScore} · ${fmtUsd(summary.topBull.premium)}` : ''}
          tone="bull"
        />
        <StatCard
          label="Est ΔOI leader"
          value={summary.deltaOiLeader ? `${summary.deltaOiLeader.strike}${summary.deltaOiLeader.right}` : '--'}
          sub={summary.deltaOiLeader ? `${summary.deltaOiLeader.deltaOi >= 0 ? '+' : ''}${summary.deltaOiLeader.deltaOi.toLocaleString()} · daily est.` : ''}
          tone="select"
        />
      </MetricGrid>

      <div className="flex items-center gap-2.5 flex-wrap">
        <SegmentedControl ariaLabel="Universe" options={UNIVERSE_OPTIONS} value={filters.universe} onChange={v => patch({ universe: v })} />
        <SegmentedControl ariaLabel="Sentiment filter" options={SENT_OPTIONS} value={filters.sent} onChange={v => patch({ sent: v })} />
        <FilterMenu filters={filters} patch={patch} onReset={resetFilterMenu} activeCount={activeCount} />
        <TemplatesMenu
          custom={templates}
          onApply={setFilters}
          onSave={saveTemplate}
          onDelete={deleteTemplate}
          activeName={activeTemplate}
        />
        <ColumnChooser visible={visibleCols} onToggle={toggleCol} onReset={resetCols} />
        <span className="ml-auto font-mono text-[11px] text-textMuted uppercase tracking-widest tnum">
          {filtered.length} of {summary.contracts} · {summary.sweeps} sweeps · per-contract · 10s
        </span>
      </div>

      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <ScanLine className="w-3.5 h-3.5" /> Contract aggregation
          </span>
        }
        subtitle="volume · estimated daily ΔOI · premium · bull/bear conviction"
        flush
      >
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={r => r.id}
          onRowClick={r => setSelectedId(r.id)}
          selectedKey={selectedId}
          initialSort={{ key: 'premium', dir: 'desc' }}
          maxHeight="560px"
          emptyText="No contracts match these filters"
        />
      </Panel>

      <ScannerRowDrawer row={selected} spot={marketData?.spot ?? 0} onClose={() => setSelectedId(null)} />
    </>
  );
};

export default FlowScanner;
