import { useEffect, useMemo, useRef, useState } from 'react';
import { TrendingUp, ChevronDown, Star, GitCompare, Info, X, SlidersHorizontal } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import StatCard from '../components/ui/StatCard';
import MetricGrid from '../components/ui/MetricGrid';
import SignalBadge from '../components/ui/SignalBadge';
import SegmentedControl from '../components/ui/SegmentedControl';
import DataTable, { type Column } from '../components/ui/DataTable';
import Sparkline from '../components/compass/Sparkline';
import StockDetailModal from './StockDetailModal';
import { FACTOR_GUIDE } from '../data/factorGuide';
import {
  VERDICT_LABEL,
  VERDICT_TONE,
  buildStockBoard,
  scoreBand,
  type StockPick,
} from '../data/stocks';
import { lookup } from '../data/universe';
import { scoreBandFill, scoreBandText } from '../components/ui/tones';

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


/** Map/strip labels. Ten sector names do not fit a scatter marker; the codes
    are display shorthand only, never a key anything is stored under. */


const betaOf = (ticker: string) => lookup(ticker)?.beta ?? null;

// Same three fills the drawer's factor rows use, off the same engine band. A
// sleeve score is a MAGNITUDE: 74 on quality is not a bullish reading of
// anything, and dressing it in bull green had the densest column on the board
// arguing a direction the number never claimed. Direction stays where it
// belongs, on changePct and the two RS windows.

/** Sleeve meter — one thin bar per scoring sleeve; the composite's anatomy. */
const SleeveBar = ({ label, value, title }: { label: string; value: number; title?: string }) => (
  <div className="flex items-center gap-2 min-w-0" title={title}>
    <span className="w-9 shrink-0 font-mono text-label uppercase tracking-wider text-textSecondary">{label}</span>
    <span className="flex-1 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
      <span className={`block h-full rounded-full ${scoreBandFill[scoreBand(value)]}`} style={{ width: `${value}%` }} />
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
    /* 32px, the interactive floor. It was 24 — 192 of them measured at exactly
       24x24 inside 64px rows, so the row had the space and the button was not
       taking it. The star does not need to LOOK bigger, so the icon inside is
       unchanged; the hit box grew around it. */
    className={`inline-flex items-center justify-center w-8 h-8 rounded transition-colors ${
      on ? 'text-select' : 'text-textMuted hover:text-textSecondary'
    }`}
  >
    <Star className={`w-3.5 h-3.5 ${on ? 'fill-current' : ''}`} />
  </button>
);

const Stocks = () => {
  const picks = useMemo(() => buildStockBoard(), []);

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

  /*
    The name's standing inside its own group — picks are composite-ranked, so
    the position in the filtered list IS the rank; the drawer states it rather
    than re-scoring anything.

    This is what survives of the sector axis, and it is the part that was always
    honest: `sector` is a label a human typed onto each row of data/universe.ts,
    so counting and grouping by it claims nothing. The ROTATION board that used
    to sit here did claim something — relative strength and a LEADING/LAGGING
    phase per group — and that needs a real sector taxonomy, which no feed tier
    supplies.
  */
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
      // The header names exactly the bars that render. It has been wrong twice
      // — once when News went, once when Quality did — so it is worth saying:
      // this string is a list of the sleeves below it, not a label.
      header: 'Sleeves · Mom / Flow',
      width: '220px',
      render: p => (
        <span className="flex flex-col gap-1 py-0.5">
          <SleeveBar label="Mom" value={p.sleeves.momentum} title="Momentum: trend and RSI posture" />
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
        <span className={`font-mono text-body font-bold tnum ${scoreBandText[scoreBand(p.composite)]} leading-5`}>
          {p.composite}
        </span>
      ),
    },
    /*
      NO VERDICT COLUMN.

      `verdict` is `scoreBand(composite)` — it is the Score column put through a
      threshold, so it adds no ordering and no fact. The first three rows of the
      board read 91 STRONG, 89 STRONG, 88 STRONG: three different numbers, one
      word, a whole column spent saying nothing the number beside it had not
      already said. And the band is not lost with it — `Score` is already inked
      through `scoreBandText`, so the same three tiers are on screen in the same
      place they always were.

      The verdict FILTER above the board stays. Narrowing 192 names to the strong
      ones is a real thing to ask for; printing the answer next to every row it
      already sorted is not.
    */
  ];

  return (
    <>
      <PageHeader
        title="Stocks"
        subtitle="Common-stock board: what screens as ownable, and which groups deserve the exposure"
        actions={<SegmentedControl ariaLabel="Verdict filter" options={VIEW_OPTIONS} value={view} onChange={setView} />}
      />

      {/*
        This was the one desk of the four here with no provenance line at all.
        the board says "modeled" above
        implied move, the Tracker's ledger names its trades as modelled — and
        Stocks printed 192 rows of scores, relative strength and off-exchange
        share with nothing on the page saying where any of it came from. A
        screener is the surface where that omission costs the most, because
        every column on it looks like a measurement of a listed company.
      */}
      <p className="font-mono text-label text-textMuted leading-4">
        Every figure on this board is <span className="text-textSecondary">modeled</span> — scores, momentum, flow and
        breadth are generated by the simulator, not measured from a market feed. The tickers
        name real companies; the numbers beside them are not those companies&rsquo; market data.
      </p>

      <MetricGrid min="170px">
        <StatCard label="Strong names" value={buys.length} sub={`of ${picks.length} names screened`} tone="bull" />
        <StatCard label="Weak names" value={avoids.length} sub="screens read as supply, not a base" tone="bear" />
        <StatCard label="Breadth" value={`${breadth}%`} sub="names above trend" tone={breadth >= 55 ? 'bull' : breadth <= 40 ? 'bear' : 'neutral'} />
      </MetricGrid>

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
                  <span className={`font-mono text-lg font-bold tnum ${scoreBandText[scoreBand(p.composite)]}`}>
                    {p.composite}
                  </span>
                  <span className="font-mono text-micro uppercase tracking-wider text-textMuted">score</span>
                </div>
                <div className="flex flex-col gap-1 pt-0.5">
                  <SleeveBar label="Mom" value={p.sleeves.momentum} />
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
        sectorRank={selectedRank}
      />
    </>
  );
};

export default Stocks;
