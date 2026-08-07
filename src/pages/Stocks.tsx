import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Layers3, TrendingUp, ChevronDown, Star, GitCompare, Info, X, SlidersHorizontal } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import StatCard from '../components/ui/StatCard';
import MetricGrid from '../components/ui/MetricGrid';
import SignalBadge from '../components/ui/SignalBadge';
import SegmentedControl from '../components/ui/SegmentedControl';
import DataTable, { type Column } from '../components/ui/DataTable';
import Sparkline from '../components/compass/Sparkline';
import HoverReadout from '../components/ui/HoverReadout';
import StockDetailModal from './StockDetailModal';
import { FACTOR_GUIDE } from '../data/factorGuide';
import { fmtUsd } from '../data/gex';
import {
  VERDICT_LABEL,
  VERDICT_TONE,
  buildSectorBoard,
  buildStockBoard,
  scoreBand,
  type RotationPhase,
  type ScoreBand,
  type SectorRow,
  type StockPick,
} from '../data/stocks';
import { lookup, type Sector } from '../data/universe';
import { toneDot, type Tone } from '../components/ui/tones';

type ViewFilter = 'ALL' | 'ACCUMULATE' | 'AVOID';
type PriceBand = 'ALL' | 'LOW' | 'MID' | 'HIGH';
type BetaBand = 'ALL' | 'DEF' | 'CYC';

const VIEW_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'ACCUMULATE', label: 'Strong' },
  { value: 'AVOID', label: 'Weak' },
] as const;

// Size / liquidity lens — filtered on the real share price the board carries.
// The universe does not ship share counts, so price stands in as the size proxy.
const PRICE_OPTIONS = [
  { value: 'ALL', label: 'Any' },
  { value: 'LOW', label: '<$150' },
  { value: 'MID', label: '$150–500' },
  { value: 'HIGH', label: '>$500' },
] as const;

const BETA_OPTIONS = [
  { value: 'ALL', label: 'Any β' },
  { value: 'DEF', label: 'Def β<1' },
  { value: 'CYC', label: 'Cyc β≥1' },
] as const;

const WATCHLIST_KEY = 'slayer.stocks.watchlist';

const phaseTone: Record<SectorRow['phase'], Tone> = {
  LEADING: 'bull',
  IMPROVING: 'select',
  WEAKENING: 'warn',
  LAGGING: 'bear',
};

/** Map/strip labels. Ten sector names do not fit a scatter marker; the codes
    are display shorthand only, never a key anything is stored under. */
const SECTOR_CODE: Record<Sector, string> = {
  Technology: 'TECH',
  Communication: 'COMM',
  'Consumer Discretionary': 'DISC',
  Financials: 'FINL',
  Energy: 'ENRG',
  'Health Care': 'HLTH',
  Industrials: 'INDU',
  'Consumer Staples': 'STPL',
  Utilities: 'UTIL',
  Materials: 'MATL',
};

const signed = (v: number, dp = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(dp)}%`;

const betaOf = (ticker: string) => lookup(ticker)?.beta ?? null;

// Same three fills the drawer's factor rows use, off the same engine band. A
// sleeve score is a MAGNITUDE: 74 on quality is not a bullish reading of
// anything, and dressing it in bull green had the densest column on the board
// arguing a direction the number never claimed. Direction stays where it
// belongs, on changePct and the two RS windows.
const BAND_FILL: Record<ScoreBand, string> = { strong: 'data-bar', mid: 'bg-white/30', weak: 'bg-bear/70' };

/** Sleeve meter — one thin bar per scoring sleeve; the composite's anatomy. */
const SleeveBar = ({ label, value, title }: { label: string; value: number; title?: string }) => (
  <div className="flex items-center gap-2 min-w-0" title={title}>
    <span className="w-9 shrink-0 font-mono text-label uppercase tracking-wider text-textSecondary">{label}</span>
    <span className="flex-1 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
      <span className={`block h-full rounded-full ${BAND_FILL[scoreBand(value)]}`} style={{ width: `${value}%` }} />
    </span>
    <span className="w-6 shrink-0 font-mono text-label text-textSecondary tnum text-right">{value}</span>
  </div>
);

/** Compact dark dropdown — scopes the board to a slice of the universe. */
const ScopeSelect = ({
  value,
  label,
  options,
  onChange,
}: {
  value: string;
  label: string;
  options: { value: string; label: string; count: number }[];
  onChange: (v: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 border border-borderSubtle hover:border-borderMuted bg-panel rounded-md pl-2.5 pr-2 py-1.5 font-mono text-caption transition-colors min-w-[160px] leading-4"
      >
        <span className="text-label uppercase tracking-widest text-textMuted">{label}</span>
        <span className="font-semibold text-textPrimary truncate">{value}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-textMuted ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-1.5 z-40 w-60 max-h-72 overflow-y-auto border border-borderMuted bg-panel rounded-lg shadow-overlay py-1 animate-slide-in"
        >
          {options.map(opt => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-1.5 text-left transition-colors ${
                  active ? 'bg-white/[0.05]' : 'hover:bg-rowHover'
                }`}
              >
                <span className={`font-mono text-caption truncate flex-1 ${active ? 'text-select' : 'text-textPrimary'} leading-4`}>
                  {opt.label}
                </span>
                <span className="font-mono text-label text-textMuted tnum">{opt.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** Tiny star toggle for the watchlist — sits in the leading table column. */
const WatchStar = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
  <button
    onClick={e => {
      e.stopPropagation();
      onClick();
    }}
    aria-pressed={on}
    aria-label={on ? 'Remove from watchlist' : 'Add to watchlist'}
    title={on ? 'Remove from watchlist' : 'Add to watchlist'}
    className={`inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
      on ? 'text-select' : 'text-textMuted hover:text-textSecondary'
    }`}
  >
    <Star className={`w-3.5 h-3.5 ${on ? 'fill-current' : ''}`} />
  </button>
);

/**
 * Rotation map. x is 1-month relative strength, y is 1-week, so the four
 * quadrants ARE the four phases `buildSectorBoard` already assigns and a group's
 * dot can never sit in a quadrant its own label disagrees with.
 *
 * It replaces ten equal tiles. Equal tiles answered "how does each group score",
 * which is a ranking question; rotation asks where a group is MOVING relative to
 * the others, and only a shared pair of axes shows that without the reader
 * diffing twenty numbers by eye.
 */
const QUADRANTS: { phase: RotationPhase; box: string; tint: string }[] = [
  { phase: 'IMPROVING', box: 'left-0 top-0 items-start justify-start', tint: 'bg-select/[0.04]' },
  { phase: 'LEADING', box: 'right-0 top-0 items-start justify-end', tint: 'bg-bull/[0.04]' },
  { phase: 'LAGGING', box: 'left-0 bottom-0 items-end justify-start', tint: 'bg-bear/[0.04]' },
  { phase: 'WEAKENING', box: 'right-0 bottom-0 items-end justify-end', tint: 'bg-warn/[0.035]' },
];

const ReadoutRow = ({ k, v }: { k: string; v: ReactNode }) => (
  <>
    <span className="text-textMuted">{k}</span>
    <span className="text-right text-textPrimary tnum">{v}</span>
  </>
);

const RotationMap = ({
  sectors,
  scope,
  onScope,
  onFocus,
}: {
  sectors: SectorRow[];
  scope: string;
  onScope: (s: Sector) => void;
  onFocus: (s: Sector | null) => void;
}) => {
  const [hover, setHover] = useState<{ row: SectorRow; x: number; y: number } | null>(null);
  // Symmetric domain so the crosshair is a true zero on both axes; the floor
  // keeps a quiet session from magnifying noise into apparent rotation.
  const dom = Math.max(0.8, ...sectors.flatMap(s => [Math.abs(s.rs1m), Math.abs(s.rs1w)])) * 1.18;
  const xOf = (v: number) => 50 + (v / dom) * 43;
  const yOf = (v: number) => 50 - (v / dom) * 43;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-[340px] rounded-md inst-surface overflow-hidden">
        {QUADRANTS.map(q => (
          <div key={q.phase} className={`absolute w-1/2 h-1/2 flex p-2 pointer-events-none ${q.box} ${q.tint}`}>
            <span className="font-mono text-micro uppercase tracking-widest text-textMuted/60">{q.phase}</span>
          </div>
        ))}
        <span className="absolute inset-x-0 top-1/2 h-px bg-borderMuted pointer-events-none" />
        <span className="absolute inset-y-0 left-1/2 w-px bg-borderMuted pointer-events-none" />
        {sectors.map(s => {
          const scoped = scope === s.sector;
          return (
            <button
              key={s.sector}
              type="button"
              onClick={() => onScope(s.sector)}
              onMouseEnter={e => {
                onFocus(s.sector);
                setHover({ row: s, x: e.clientX, y: e.clientY });
              }}
              onMouseMove={e => setHover({ row: s, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => {
                onFocus(null);
                setHover(null);
              }}
              onFocus={() => onFocus(s.sector)}
              onBlur={() => onFocus(null)}
              aria-pressed={scoped}
              aria-label={`${s.sector}: ${s.phase}, score ${s.score}, 1 week ${signed(s.rs1w)}, 1 month ${signed(s.rs1m)}`}
              style={{ left: `${xOf(s.rs1m)}%`, top: `${yOf(s.rs1w)}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 h-6 pl-1.5 pr-2 rounded border font-mono text-micro tracking-wider transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-select/60 ${
                scoped
                  ? 'z-20 border-select/50 bg-select/15 text-select'
                  : 'z-10 border-borderMuted bg-panelRaised text-textSecondary hover:z-20 hover:border-select/40 hover:text-textPrimary'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${toneDot[phaseTone[s.phase]]}`} />
              {SECTOR_CODE[s.sector]}
            </button>
          );
        })}
      </div>
      <p className="font-mono text-micro text-textMuted">x 1 month relative strength · y 1 week · crosshair is flat on both</p>
      {hover && (
        <HoverReadout x={hover.x} y={hover.y}>
          <div className="flex flex-col gap-1.5 min-w-[186px]">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-caption font-semibold text-textPrimary">{hover.row.sector}</span>
              <SignalBadge tone={phaseTone[hover.row.phase]}>{hover.row.phase}</SignalBadge>
            </div>
            <div className="grid grid-cols-2 gap-x-3 font-mono text-micro leading-relaxed">
              <ReadoutRow k="Composite" v={hover.row.score} />
              <ReadoutRow k="1w RS" v={signed(hover.row.rs1w)} />
              <ReadoutRow k="1m RS" v={signed(hover.row.rs1m)} />
              <ReadoutRow k="Above trend" v={`${hover.row.breadthPct}%`} />
              <ReadoutRow k="Names" v={hover.row.memberCount} />
              <ReadoutRow k="Off-exch" v={fmtUsd(hover.row.offExDollars)} />
            </div>
          </div>
        </HoverReadout>
      )}
    </div>
  );
};

/** The exact scores beside the map. Dollars ride here rather than on the map so
    a marker encodes only the two axes it is plotted on. */
const SectorStrip = ({
  sectors,
  scope,
  onScope,
  onFocus,
}: {
  sectors: SectorRow[];
  scope: string;
  onScope: (s: Sector) => void;
  onFocus: (s: Sector | null) => void;
}) => {
  const maxShare = Math.max(1, ...sectors.map(s => s.dollarSharePct));
  const cols = 'grid grid-cols-[16px_44px_minmax(28px,1fr)_24px_86px_minmax(28px,1fr)_38px] items-center gap-2';
  return (
    <div className="rounded-md inst-surface overflow-hidden">
      <div className={`${cols} px-2.5 py-1.5 bg-inset font-mono text-micro uppercase tracking-widest text-textMuted`}>
        <span>#</span>
        <span>Grp</span>
        <span className="col-span-2">Composite</span>
        <span>Phase</span>
        <span className="col-span-2">Off-exchange $</span>
      </div>
      {sectors.map((s, i) => {
        const scoped = scope === s.sector;
        return (
          <button
            key={s.sector}
            type="button"
            onClick={() => onScope(s.sector)}
            onMouseEnter={() => onFocus(s.sector)}
            onMouseLeave={() => onFocus(null)}
            onFocus={() => onFocus(s.sector)}
            onBlur={() => onFocus(null)}
            aria-pressed={scoped}
            aria-label={`${s.sector}: rank ${i + 1}, composite ${s.score}, ${s.phase}, ${s.dollarSharePct}% of off-exchange dollars`}
            className={`w-full ${cols} px-2.5 py-1.5 border-t border-borderSubtle text-left transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60 ${
              scoped ? 'rail-silver bg-select/[0.06]' : 'hover:bg-rowHover'
            }`}
          >
            <span className="font-mono text-micro text-textMuted tnum">{i + 1}</span>
            <span className="font-mono text-label font-semibold text-textPrimary">{SECTOR_CODE[s.sector]}</span>
            <span className="h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
              <span className="block h-full rounded-full data-bar" style={{ width: `${s.score}%` }} />
            </span>
            <span className="font-mono text-label text-textSecondary tnum text-right">{s.score}</span>
            <SignalBadge tone={phaseTone[s.phase]} className="justify-center">
              {s.phase}
            </SignalBadge>
            <span className="h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
              <span className="block h-full rounded-full bg-white/25" style={{ width: `${(s.dollarSharePct / maxShare) * 100}%` }} />
            </span>
            <span className="font-mono text-label text-textMuted tnum text-right">{s.dollarSharePct.toFixed(1)}%</span>
          </button>
        );
      })}
    </div>
  );
};

const Stocks = () => {
  const picks = useMemo(() => buildStockBoard(), []);
  const sectors = useMemo(() => buildSectorBoard(picks), [picks]);

  const [view, setView] = useState<ViewFilter>('ALL');
  const [scope, setScope] = useState<string>('ALL'); // 'ALL' | 'WATCHLIST' | Sector
  const [priceBand, setPriceBand] = useState<PriceBand>('ALL');
  const [betaBand, setBetaBand] = useState<BetaBand>('ALL');
  const [compareMode, setCompareMode] = useState(false);
  const [compareSet, setCompareSet] = useState<Set<string>>(new Set());
  const [factorsOpen, setFactorsOpen] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  // Which group the rotation caption is describing — hover/focus, falling back
  // to whatever the board is scoped to, then to the leader.
  const [focusSector, setFocusSector] = useState<Sector | null>(null);

  const [watchlist, setWatchlist] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(WATCHLIST_KEY);
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...watchlist]));
    } catch {
      /* storage unavailable — keep the session-only set */
    }
  }, [watchlist]);

  const toggleWatch = (ticker: string) =>
    setWatchlist(prev => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  const toggleCompare = (ticker: string) =>
    setCompareSet(prev => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });

  // Universe scope options with live counts.
  const scopeOptions = useMemo(() => {
    const bySectorCount = new Map<string, number>();
    picks.forEach(p => bySectorCount.set(p.sector, (bySectorCount.get(p.sector) ?? 0) + 1));
    const sectorList = [...bySectorCount.keys()].sort();
    return [
      { value: 'ALL', label: 'All names', count: picks.length },
      { value: 'WATCHLIST', label: 'Watchlist', count: watchlist.size },
      ...sectorList.map(s => ({ value: s, label: s, count: bySectorCount.get(s) ?? 0 })),
    ];
  }, [picks, watchlist]);
  const scopeLabel = scopeOptions.find(o => o.value === scope)?.label ?? 'All names';

  const inPriceBand = (p: StockPick) =>
    priceBand === 'ALL' ||
    (priceBand === 'LOW' && p.price < 150) ||
    (priceBand === 'MID' && p.price >= 150 && p.price <= 500) ||
    (priceBand === 'HIGH' && p.price > 500);
  const inBetaBand = (p: StockPick) => {
    if (betaBand === 'ALL') return true;
    const b = betaOf(p.ticker);
    if (b == null) return false;
    return betaBand === 'DEF' ? b < 1 : b >= 1;
  };

  const rows = useMemo(
    () =>
      picks.filter(p => {
        if (view !== 'ALL' && p.verdict !== view) return false;
        if (scope === 'WATCHLIST' && !watchlist.has(p.ticker)) return false;
        if (scope !== 'ALL' && scope !== 'WATCHLIST' && p.sector !== scope) return false;
        if (!inPriceBand(p)) return false;
        if (!inBetaBand(p)) return false;
        return true;
      }),
    // inPriceBand/inBetaBand close over priceBand/betaBand, which ARE listed —
    // the predicates are recreated each render, so the memo can't miss a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [picks, view, scope, watchlist, priceBand, betaBand]
  );

  const selected = picks.find(p => p.ticker === selectedTicker) ?? null;
  const compared = picks.filter(p => compareSet.has(p.ticker));
  const activeFilters = (scope !== 'ALL' ? 1 : 0) + (priceBand !== 'ALL' ? 1 : 0) + (betaBand !== 'ALL' ? 1 : 0);
  const clearFilters = () => {
    setScope('ALL');
    setPriceBand('ALL');
    setBetaBand('ALL');
  };

  const buys = picks.filter(p => p.verdict === 'ACCUMULATE');
  const avoids = picks.filter(p => p.verdict === 'AVOID');
  const breadth = Math.round((picks.filter(p => p.sleeves.momentum > 50).length / picks.length) * 100);
  const topSector = sectors[0];
  const bottomSector = sectors[sectors.length - 1];
  const captionRow = sectors.find(s => s.sector === focusSector) ?? sectors.find(s => s.sector === scope) ?? topSector;
  const scopeSector = (s: Sector) => setScope(prev => (prev === s ? 'ALL' : s));

  // The name's standing inside its own group — picks are composite-ranked, so
  // the position in the filtered list IS the rank; the drawer states it rather
  // than re-scoring anything.
  const selectedSector = selected ? sectors.find(s => s.sector === selected.sector) ?? null : null;
  const selectedRank = selected
    ? (() => {
        const members = picks.filter(p => p.sector === selected.sector);
        return { rank: members.findIndex(p => p.ticker === selected.ticker) + 1, of: members.length };
      })()
    : null;

  const columns: Column<StockPick>[] = [
    {
      key: 'watch',
      header: 'Watch',
      headerHidden: true,
      width: '34px',
      render: p => <WatchStar on={watchlist.has(p.ticker)} onClick={() => toggleWatch(p.ticker)} />,
    },
    ...(compareMode
      ? [
          {
            key: 'compare',
            header: 'Cmp',
            help: 'Cmp' as const,
            width: '40px',
            render: (p: StockPick) => (
              <button
                onClick={e => {
                  e.stopPropagation();
                  toggleCompare(p.ticker);
                }}
                aria-pressed={compareSet.has(p.ticker)}
                aria-label={compareSet.has(p.ticker) ? 'Remove from compare' : 'Add to compare'}
                title={compareSet.has(p.ticker) ? 'Remove from compare' : 'Add to compare'}
                className={`inline-flex items-center justify-center w-5 h-5 rounded border transition-colors ${
                  compareSet.has(p.ticker)
                    ? 'border-select/40 bg-select/15 text-select'
                    : 'border-borderMuted text-textMuted hover:text-textSecondary'
                }`}
              >
                {compareSet.has(p.ticker) ? '✓' : ''}
              </button>
            ),
          } as Column<StockPick>,
        ]
      : []),
    {
      key: 'ticker',
      header: 'Name',
      sortValue: p => p.ticker,
      render: p => (
        <span className="flex flex-col">
          <span className="font-mono text-caption font-bold text-textPrimary leading-4">{p.ticker}</span>
          <span title={p.name} className="text-micro text-textMuted truncate">{p.name}</span>
        </span>
      ),
    },
    {
      key: 'sector',
      header: 'Sector',
      sortValue: p => p.sector,
      render: p => <span className="font-mono text-label text-textSecondary">{p.sector}</span>,
    },
    {
      key: 'price',
      header: 'Last',
      align: 'right',
      sortValue: p => p.price,
      render: p => (
        <span className="flex flex-col items-end">
          <span className="font-mono text-caption text-textPrimary tnum leading-4">${p.price.toFixed(2)}</span>
          <span className={`font-mono text-micro tnum ${p.changePct >= 0 ? 'text-bull' : 'text-bear'}`}>
            {p.changePct >= 0 ? '+' : ''}
            {p.changePct.toFixed(2)}%
          </span>
        </span>
      ),
    },
    {
      key: 'beta',
      header: 'β',
      help: 'β',
      align: 'right',
      sortValue: p => betaOf(p.ticker) ?? 0,
      render: p => {
        const b = betaOf(p.ticker);
        return <span className="font-mono text-label text-textSecondary tnum">{b != null ? b.toFixed(2) : '—'}</span>;
      },
    },
    {
      key: 'trend',
      header: '30d RS',
      help: '30d RS',
      render: p => <Sparkline data={p.trend} up={p.trend[p.trend.length - 1] >= p.trend[0]} width={72} height={22} />,
    },
    {
      key: 'sleeves',
      header: 'Sleeves · Mom / Qual / Flow / News',
      width: '220px',
      render: p => (
        <span className="flex flex-col gap-1 py-0.5">
          <SleeveBar label="Mom" value={p.sleeves.momentum} title="Momentum: trend and RSI posture" />
          <SleeveBar label="Qual" value={p.sleeves.quality} title="Quality: margins, growth, balance sheet" />
          <SleeveBar label="Flow" value={p.sleeves.flow} title="Flow: options and dark-pool positioning" />
        </span>
      ),
    },
    {
      key: 'composite',
      header: 'Score',
      align: 'right',
      sortValue: p => p.composite,
      render: p => (
        <span className={`font-mono text-body font-bold tnum ${p.composite >= 68 ? 'text-bull' : p.composite <= 46 ? 'text-bear' : 'text-textPrimary'} leading-5`}>
          {p.composite}
        </span>
      ),
    },
    {
      key: 'verdict',
      header: 'Verdict',
      sortValue: p => p.verdict,
      render: p => <SignalBadge tone={VERDICT_TONE[p.verdict]}>{VERDICT_LABEL[p.verdict]}</SignalBadge>,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Stocks']}
        title="Stocks"
        subtitle="Common-stock board: what screens as ownable, and which groups deserve the exposure"
        actions={<SegmentedControl ariaLabel="Verdict filter" options={VIEW_OPTIONS} value={view} onChange={setView} />}
      />

      {/*
        This was the one desk of the four here with no provenance line at all.
        News tags every row MODELED, Earnings says "modeled avg" beside each
        implied move, the Tracker's ledger names its trades as modelled — and
        Stocks printed 192 rows of scores, relative strength and off-exchange
        share with nothing on the page saying where any of it came from. A
        screener is the surface where that omission costs the most, because
        every column on it looks like a measurement of a listed company.
      */}
      <p className="font-mono text-label text-textMuted leading-4">
        Every figure on this board is <span className="text-textSecondary">modeled</span> — scores, relative strength,
        breadth and off-exchange share are generated by the simulator, not measured from a market feed. The tickers
        name real companies; the numbers beside them are not those companies&rsquo; market data.
      </p>

      <MetricGrid min="170px">
        <StatCard label="Strong names" value={buys.length} sub={`of ${picks.length} names screened`} tone="bull" />
        <StatCard label="Weak names" value={avoids.length} sub="screens read as supply, not a base" tone="bear" />
        <StatCard label="Breadth" value={`${breadth}%`} sub="names above trend" tone={breadth >= 55 ? 'bull' : breadth <= 40 ? 'bear' : 'neutral'} />
        <StatCard label="Strongest sector" value={topSector.sector} sub={`score ${topSector.score} · ${topSector.phase}`} tone="bull" />
        <StatCard label="Weakest sector" value={bottomSector.sector} sub={`score ${bottomSector.score} · ${bottomSector.phase}`} tone="bear" />
      </MetricGrid>

      {/* Sector rotation board */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Layers3 className="w-3.5 h-3.5" /> Sector rotation
          </span>
        }
        subtitle="two relative-strength windows, and the share of off-exchange dollars each group took"
        actions={
          scope !== 'ALL' && scope !== 'WATCHLIST' ? (
            <button
              onClick={() => setScope('ALL')}
              aria-label={`Clear the ${scope} sector scope`}
              // -my-1 py-2: the hit box clears 24px, the header row does not grow.
              className="inline-flex items-center gap-1 px-2 py-2 -my-1 rounded border border-borderSubtle bg-white/[0.02] font-mono text-label uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors"
            >
              <X className="w-3 h-3" /> {SECTOR_CODE[scope as Sector] ?? scope}
            </button>
          ) : undefined
        }
      >
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] gap-3">
          <RotationMap sectors={sectors} scope={scope} onScope={scopeSector} onFocus={setFocusSector} />
          <SectorStrip sectors={sectors} scope={scope} onScope={scopeSector} onFocus={setFocusSector} />
        </div>
        {/* One caption, for the group under the cursor. Ten cards each carrying
            their own paragraph meant ten paragraphs nobody read. */}
        <div className="mt-3 pt-3 border-t border-borderSubtle flex items-start gap-2.5">
          <SignalBadge tone={phaseTone[captionRow.phase]}>{captionRow.phase}</SignalBadge>
          <div className="min-w-0">
            <span className="font-mono text-caption font-semibold text-textPrimary">{captionRow.sector}</span>
            <span className="ml-2 font-mono text-label text-textMuted tnum">
              {captionRow.memberCount} names · {captionRow.verdict}
            </span>
            <p className="mt-0.5 text-label text-textSecondary leading-snug">{captionRow.note}</p>
          </div>
        </div>
      </Panel>

      {/* Compare tray — side-by-side factor read of the picked names */}
      {compared.length > 0 && (
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <GitCompare className="w-3.5 h-3.5" /> Compare
            </span>
          }
          subtitle={`${compared.length} name${compared.length > 1 ? 's' : ''} side by side`}
          tone="select"
          actions={
            <button
              onClick={() => setCompareSet(new Set())}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-borderSubtle bg-white/[0.02] font-mono text-label uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          }
          flush
        >
          <div className="flex gap-px bg-borderSubtle overflow-x-auto">
            {compared.map(p => (
              <div key={p.ticker} className="bg-panel px-3.5 py-3 flex flex-col gap-2 min-w-[190px]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-body font-bold text-textPrimary leading-5">{p.ticker}</div>
                    <div className="text-micro text-textMuted truncate">{p.name}</div>
                  </div>
                  <button
                    onClick={() => toggleCompare(p.ticker)}
                    aria-label={`Remove ${p.ticker} from compare`}
                    className="shrink-0 text-textMuted hover:text-textSecondary transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-caption text-textPrimary tnum leading-4">${p.price.toFixed(2)}</span>
                  <span className={`font-mono text-label tnum ${p.changePct >= 0 ? 'text-bull' : 'text-bear'}`}>
                    {p.changePct >= 0 ? '+' : ''}
                    {p.changePct.toFixed(2)}%
                  </span>
                  <SignalBadge tone={VERDICT_TONE[p.verdict]}>{VERDICT_LABEL[p.verdict]}</SignalBadge>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={`font-mono text-lg font-bold tnum ${p.composite >= 68 ? 'text-bull' : p.composite <= 46 ? 'text-bear' : 'text-textPrimary'}`}>
                    {p.composite}
                  </span>
                  <span className="font-mono text-micro uppercase tracking-wider text-textMuted">score</span>
                </div>
                <div className="flex flex-col gap-1 pt-0.5">
                  <SleeveBar label="Mom" value={p.sleeves.momentum} />
                  <SleeveBar label="Qual" value={p.sleeves.quality} />
                  <SleeveBar label="Flow" value={p.sleeves.flow} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Ranked picks */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Ranked board
          </span>
        }
        subtitle="click a row for the thesis drawer"
        flush
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline font-mono text-label text-textMuted tnum">
              {rows.length}/{picks.length}
            </span>
            <div className="relative">
              <button
                onClick={() => setFactorsOpen(o => !o)}
                aria-expanded={factorsOpen}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-borderSubtle bg-white/[0.02] font-mono text-label uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors"
              >
                <Info className="w-3 h-3" /> Factors
              </button>
              {factorsOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setFactorsOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 z-40 w-72 border border-borderMuted bg-panel rounded-lg shadow-overlay p-3 animate-slide-in">
                    <div className="font-mono text-label uppercase tracking-widest text-textSecondary mb-2">
                      What the sleeves mean
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {FACTOR_GUIDE.map(f => (
                        <div key={f.key} className="flex flex-col gap-0.5">
                          <span className="font-mono text-caption font-semibold text-textPrimary">{f.name}</span>
                          <span className="text-label text-textMuted leading-snug">{f.desc}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2.5 pt-2.5 border-t border-borderSubtle text-label text-textMuted leading-snug">
                      The composite blends all four; STRONG / NEUTRAL / WEAK follow from where a name's composite lands.
                    </p>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => setCompareMode(m => !m)}
              aria-pressed={compareMode}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded border font-mono text-label uppercase tracking-wider transition-colors ${
                compareMode
                  ? 'border-select/40 bg-select/10 text-select'
                  : 'border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary hover:border-borderMuted'
              }`}
            >
              <GitCompare className="w-3 h-3" /> Compare
            </button>
          </div>
        }
      >
        {/* Filter toolbar — universe scope + size/liquidity + risk lens */}
        <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 border-b border-borderSubtle bg-inset">
          <SlidersHorizontal className="w-3.5 h-3.5 text-textMuted shrink-0" />
          <ScopeSelect value={scopeLabel} label="Universe" options={scopeOptions} onChange={setScope} />
          <div className="flex items-center gap-1.5" title="Size / liquidity lens: share price stands in as the size proxy">
            <span className="font-mono text-label uppercase tracking-widest text-textMuted">Price</span>
            <SegmentedControl ariaLabel="Price band" options={PRICE_OPTIONS} value={priceBand} onChange={setPriceBand} />
          </div>
          <div className="flex items-center gap-1.5" title="Beta lens: defensive vs cyclical from the shared universe">
            <span className="font-mono text-label uppercase tracking-widest text-textMuted">Risk</span>
            <SegmentedControl ariaLabel="Beta band" options={BETA_OPTIONS} value={betaBand} onChange={setBetaBand} />
          </div>
          {activeFilters > 0 && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-borderSubtle bg-white/[0.02] font-mono text-label uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors"
            >
              <X className="w-3 h-3" /> Clear {activeFilters}
            </button>
          )}
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={p => p.ticker}
          onRowClick={p => setSelectedTicker(prev => (prev === p.ticker ? null : p.ticker))}
          selectedKey={selectedTicker}
          initialSort={{ key: 'composite', dir: 'desc' }}
          maxHeight="640px"
          emptyText="No names match these filters"
        />
      </Panel>

      <StockDetailModal
        pick={selected}
        onClose={() => setSelectedTicker(null)}
        isWatched={selected ? watchlist.has(selected.ticker) : false}
        onToggleWatch={toggleWatch}
        inCompare={selected ? compareSet.has(selected.ticker) : false}
        onToggleCompare={toggleCompare}
        beta={selected ? betaOf(selected.ticker) ?? undefined : undefined}
        sectorRow={selectedSector}
        sectorRank={selectedRank}
      />
    </>
  );
};

export default Stocks;
