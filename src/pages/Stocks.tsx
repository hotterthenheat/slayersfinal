import { useEffect, useMemo, useRef, useState } from 'react';
import { Layers3, TrendingUp, ChevronDown, Star, GitCompare, Info, X, SlidersHorizontal } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import StatCard from '../components/ui/StatCard';
import MetricGrid from '../components/ui/MetricGrid';
import SignalBadge from '../components/ui/SignalBadge';
import SegmentedControl from '../components/ui/SegmentedControl';
import DataTable, { type Column } from '../components/ui/DataTable';
import Sparkline from '../components/skyvision/Sparkline';
import StockDetailDrawer from './StockDetailDrawer';
import { FACTOR_GUIDE } from '../data/factorGuide';
import { buildSectorBoard, buildStockBoard, type SectorRow, type StockPick, type StockVerdict } from '../data/stocks';
import { lookup } from '../data/universe';
import type { Tone } from '../components/ui/tones';

type ViewFilter = 'ALL' | 'ACCUMULATE' | 'AVOID';
type PriceBand = 'ALL' | 'LOW' | 'MID' | 'HIGH';
type BetaBand = 'ALL' | 'DEF' | 'CYC';

const VIEW_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'ACCUMULATE', label: 'Buys' },
  { value: 'AVOID', label: 'Avoids' },
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

const verdictTone: Record<StockVerdict, Tone> = {
  ACCUMULATE: 'bull',
  HOLD: 'neutral',
  AVOID: 'bear',
};

const sectorTone: Record<SectorRow['verdict'], Tone> = {
  OVERWEIGHT: 'bull',
  NEUTRAL: 'neutral',
  UNDERWEIGHT: 'bear',
};

const phaseTone: Record<SectorRow['phase'], Tone> = {
  LEADING: 'bull',
  IMPROVING: 'select',
  WEAKENING: 'warn',
  LAGGING: 'bear',
};

const betaOf = (ticker: string) => lookup(ticker)?.beta ?? null;

/** Sleeve meter — one thin bar per scoring sleeve; the composite's anatomy. */
const SleeveBar = ({ label, value, title }: { label: string; value: number; title?: string }) => (
  <div className="flex items-center gap-2 min-w-0" title={title}>
    <span className="w-9 shrink-0 font-mono text-label uppercase tracking-wider text-textSecondary">{label}</span>
    <span className="flex-1 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
      <span
        className={`block h-full rounded-full ${value >= 60 ? 'bg-bull/90' : value >= 40 ? 'bg-white/30' : 'bg-bear/70'}`}
        style={{ width: `${value}%` }}
      />
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
                  active ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'
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
    className={`inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
      on ? 'text-select' : 'text-textMuted hover:text-textSecondary'
    }`}
  >
    <Star className={`w-3.5 h-3.5 ${on ? 'fill-current' : ''}`} />
  </button>
);

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

  const columns: Column<StockPick>[] = [
    {
      key: 'watch',
      header: '',
      width: '34px',
      render: p => <WatchStar on={watchlist.has(p.ticker)} onClick={() => toggleWatch(p.ticker)} />,
    },
    ...(compareMode
      ? [
          {
            key: 'compare',
            header: 'Cmp',
            width: '40px',
            render: (p: StockPick) => (
              <button
                onClick={e => {
                  e.stopPropagation();
                  toggleCompare(p.ticker);
                }}
                aria-pressed={compareSet.has(p.ticker)}
                aria-label={compareSet.has(p.ticker) ? 'Remove from compare' : 'Add to compare'}
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
          <span className="text-micro text-textMuted truncate">{p.name}</span>
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
      render: p => <Sparkline data={p.trend} up={p.trend[p.trend.length - 1] >= p.trend[0]} width={72} height={22} />,
    },
    {
      key: 'sleeves',
      header: 'Sleeves · Mom / Qual / Flow / News',
      width: '220px',
      render: p => (
        <span className="flex flex-col gap-1 py-0.5">
          <SleeveBar label="Mom" value={p.sleeves.momentum} title="Momentum — trend & RSI posture" />
          <SleeveBar label="Qual" value={p.sleeves.quality} title="Quality — margins, growth, balance sheet" />
          <SleeveBar label="Flow" value={p.sleeves.flow} title="Flow — options & dark-pool positioning" />
          <SleeveBar label="News" value={p.sleeves.news} title="News — headline sentiment tape" />
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
      render: p => <SignalBadge tone={verdictTone[p.verdict]}>{p.verdict}</SignalBadge>,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Stocks']}
        title="Stocks"
        subtitle="Common-stock board — what screens as ownable, and which sectors deserve the exposure"
        actions={<SegmentedControl ariaLabel="Verdict filter" options={VIEW_OPTIONS} value={view} onChange={setView} />}
      />

      <MetricGrid min="170px">
        <StatCard label="Accumulate list" value={buys.length} sub={`of ${picks.length} names screened`} tone="bull" />
        <StatCard label="Avoid list" value={avoids.length} sub="screens argue against owning" tone="bear" />
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
        subtitle="composite of member names · relative strength on two windows"
        flush
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-px bg-borderSubtle">
          {sectors.map(s => {
            const scoped = scope === s.sector;
            const scopeTo = () => setScope(prev => (prev === s.sector ? 'ALL' : s.sector));
            return (
              <div
                key={s.sector}
                role="button"
                tabIndex={0}
                onClick={scopeTo}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    scopeTo();
                  }
                }}
                aria-pressed={scoped}
                title={scoped ? 'Clear sector scope' : `Scope board to ${s.sector}`}
                className={`cursor-pointer text-left bg-panel px-3.5 py-3 flex flex-col gap-2 transition-colors hover:bg-panelHover focus:outline-none focus-visible:ring-1 focus-visible:ring-select/40 ${
                  scoped ? 'rail-silver bg-select/[0.05]' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-label font-semibold text-textPrimary truncate">{s.sector}</span>
                  <SignalBadge tone={phaseTone[s.phase]}>{s.phase}</SignalBadge>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={`font-mono text-xl font-bold tnum ${s.verdict === 'OVERWEIGHT' ? 'text-bull' : s.verdict === 'UNDERWEIGHT' ? 'text-bear' : 'text-textPrimary'}`}>
                    {s.score}
                  </span>
                  <span className={`font-mono text-micro uppercase tracking-wider ${sectorTone[s.verdict] === 'bull' ? 'text-bull' : sectorTone[s.verdict] === 'bear' ? 'text-bear' : 'text-textMuted'}`}>
                    {s.verdict}
                  </span>
                </div>
                <div className="h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
                  <span
                    className={`block h-full rounded-full ${s.verdict === 'OVERWEIGHT' ? 'bg-bull/90' : s.verdict === 'UNDERWEIGHT' ? 'bg-bear/70' : 'bg-white/30'}`}
                    style={{ width: `${s.score}%` }}
                  />
                </div>
                <div className="flex items-center justify-between font-mono text-micro tnum">
                  <span className={s.rs1w >= 0 ? 'text-bull' : 'text-bear'}>
                    1w {s.rs1w >= 0 ? '+' : ''}
                    {s.rs1w.toFixed(1)}%
                  </span>
                  <span className={s.rs1m >= 0 ? 'text-bull' : 'text-bear'}>
                    1m {s.rs1m >= 0 ? '+' : ''}
                    {s.rs1m.toFixed(1)}%
                  </span>
                  <span className="text-textMuted">br {s.breadthPct}%</span>
                </div>
                <p className="text-micro text-textMuted leading-snug">{s.note}</p>
              </div>
            );
          })}
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
                  <SignalBadge tone={verdictTone[p.verdict]}>{p.verdict}</SignalBadge>
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
                  <SleeveBar label="News" value={p.sleeves.news} />
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
                      The composite blends all four; ACCUMULATE / HOLD / AVOID follow from where a name's composite lands.
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
          <div className="flex items-center gap-1.5" title="Size / liquidity lens — share price stands in as the size proxy">
            <span className="font-mono text-label uppercase tracking-widest text-textMuted">Price</span>
            <SegmentedControl ariaLabel="Price band" options={PRICE_OPTIONS} value={priceBand} onChange={setPriceBand} />
          </div>
          <div className="flex items-center gap-1.5" title="Beta lens — defensive vs cyclical from the shared universe">
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

      <StockDetailDrawer
        pick={selected}
        onClose={() => setSelectedTicker(null)}
        isWatched={selected ? watchlist.has(selected.ticker) : false}
        onToggleWatch={toggleWatch}
        inCompare={selected ? compareSet.has(selected.ticker) : false}
        onToggleCompare={toggleCompare}
        beta={selected ? betaOf(selected.ticker) ?? undefined : undefined}
      />
    </>
  );
};

export default Stocks;
