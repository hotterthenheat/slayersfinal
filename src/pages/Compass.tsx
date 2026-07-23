import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Filter, AlertTriangle } from 'lucide-react';
import { useMarketData } from '../context/MarketDataContext';
import type { MarketSnapshot } from '../types/market';
import Simulator from '../core/simulator';
import { buildSkyVision, makeSetup } from '../data/skyvision';
import { SCANNERS, type ScannerKey, type Setup } from '../types/skyvision';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import DataTable, { type Column } from '../components/ui/DataTable';
import SetupsFeed from '../components/skyvision/SetupsFeed';
import ContractChain, { type ChainSelection } from '../components/skyvision/ContractChain';
import SignalMonitor from '../components/skyvision/SignalMonitor';
import SamplePreview from '../components/skyvision/SamplePreview';
import ImpactLeaderboard from '../components/skyvision/ImpactLeaderboard';
import ContractWeigher from '../components/compass/ContractWeigher';
import LottoBoard from '../components/compass/LottoBoard';
import type { Horizon } from '../core/contractScore';
import SegmentedControl from '../components/ui/SegmentedControl';
import { setupState, StateBadge, STATE_META } from '../components/skyvision/SetupState';

type CompassMode = 'setups' | 'weigher' | 'lotto';
type SetupsView = 'list' | 'table';

const SETUPS_VIEW_OPTIONS = [
  { value: 'list', label: 'List' },
  { value: 'table', label: 'Table' },
] as const;

const SETUPS_SUBTITLE = 'Setups ranked by trend + dealer-flow conviction — a read, never an order';

const MODE_OPTIONS = [
  { value: 'setups', label: 'Setups' },
  { value: 'weigher', label: 'Weigher' },
  { value: 'lotto', label: 'Lotto' },
] as const;

interface MonitorTarget {
  ticker: string;
  strike: number;
  right: 'C' | 'P';
}

/** The scanner sweeps on its own cadence — the feed must not vibrate with every price tick. */
const SCAN_INTERVAL_MS = 10_000;

const Compass = () => {
  const { marketData, changeTicker } = useMarketData();
  const location = useLocation();
  const [scanner, setScanner] = useState<ScannerKey>('top-setups');
  const [mode, setMode] = useState<CompassMode>('setups');
  const [weigherHorizon, setWeigherHorizon] = useState<Horizon | undefined>(undefined);

  // Phase 1 (browse): selectedSetup drives the SamplePreview card
  // Phase 2 (review): monitorTarget drives the SignalMonitor + ContractChain
  const [selectedSetup, setSelectedSetup] = useState<Setup | null>(null);
  const [monitorTarget, setMonitorTarget] = useState<MonitorTarget | null>(null);
  const [chainSel, setChainSel] = useState<ChainSelection | null>(null);

  // Ticker filter for browse mode — null means show all tickers
  const [tickerFilter, setTickerFilter] = useState<string | null>(null);
  const [showTickerDropdown, setShowTickerDropdown] = useState(false);

  // Feed presentation: card list vs sortable table
  const [setupsView, setSetupsView] = useState<SetupsView>('list');

  const inReviewMode = monitorTarget !== null;

  // Deep links: from Tracker (land in review mode on the tracked setup) or
  // from Earnings/Stocks/News ("weigh this name's contracts").
  useEffect(() => {
    const state = location.state as {
      monitor?: { ticker: string; strike: number; right: 'C' | 'P'; scanner: ScannerKey };
      weigh?: { ticker: string; horizon?: Horizon };
      compassMode?: CompassMode;
    } | null;
    const incoming = state?.monitor;
    if (incoming) {
      setScanner(incoming.scanner);
      changeTicker(incoming.ticker);
      setMonitorTarget({ ticker: incoming.ticker, strike: incoming.strike, right: incoming.right });
      window.history.replaceState({}, ''); // consume so refresh doesn't re-enter
    } else if (state?.weigh) {
      changeTicker(state.weigh.ticker);
      setMode('weigher');
      if (state.weigh.horizon) setWeigherHorizon(state.weigh.horizon);
      window.history.replaceState({}, '');
    } else if (state?.compassMode) {
      // Landed from the /lotto redirect (or a palette deep-link)
      setMode(state.compassMode);
      window.history.replaceState({}, '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- two-tier cadence -----------------------------------------------------
  // Live tier (every tick): prices, monitor, preview, contract chain.
  // Scan tier (every SCAN_INTERVAL_MS): setups feed, counts, impact leaderboard.
  // The scanner "sweeps" on its own clock so the feed doesn't churn with noise.
  const [scanSnapshot, setScanSnapshot] = useState<MarketSnapshot | null>(null);
  const [lastScanAt, setLastScanAt] = useState<string>('');
  const scanRef = useRef<MarketSnapshot | null>(null);
  const lastScanTimeRef = useRef(0);

  useEffect(() => {
    if (!marketData) return;
    const now = Date.now();
    const due =
      !scanRef.current ||
      now - lastScanTimeRef.current >= SCAN_INTERVAL_MS ||
      scanRef.current.ticker !== marketData.ticker; // ticker switch refreshes immediately
    if (due) {
      scanRef.current = marketData;
      lastScanTimeRef.current = now;
      setScanSnapshot(marketData);
      setLastScanAt(new Date(now).toLocaleTimeString('en-GB'));
    }
  }, [marketData]);

  // Scan tier: feed groups, counts, impact — stable between sweeps
  const data = useMemo(() => (scanSnapshot ? buildSkyVision(scanSnapshot, scanner) : null), [scanSnapshot, scanner]);

  // Live tier: the contract chain tracks every tick (prices should breathe)
  const liveChain = useMemo(
    () => (marketData ? buildSkyVision(marketData, scanner).chain : null),
    [marketData, scanner]
  );

  // Rebuild the monitored setup live each tick from its identity so it stays current.
  // marketData is the tick dependency — without it the "LIVE" readouts freeze at click-time.
  const monitoredSetup = useMemo(() => {
    if (!monitorTarget) return null;
    Simulator.ensureTicker(monitorTarget.ticker);
    const cfg = Simulator.TICKERS[monitorTarget.ticker];
    return makeSetup(monitorTarget.ticker, cfg.currentPrice, monitorTarget.strike, monitorTarget.right, scanner, cfg.iv);
  }, [monitorTarget, scanner, marketData]);

  // Also rebuild the selected preview setup live so metrics stay current
  const liveSelectedSetup = useMemo(() => {
    if (!selectedSetup) return null;
    Simulator.ensureTicker(selectedSetup.ticker);
    const cfg = Simulator.TICKERS[selectedSetup.ticker];
    return makeSetup(selectedSetup.ticker, cfg.currentPrice, selectedSetup.strike, selectedSetup.right, scanner, cfg.iv);
  }, [selectedSetup, scanner, marketData]);

  // Filtered groups for browse mode — ticker universe only. (The lifecycle-state
  // filter was removed: it segmented the feed by triggered/invalidated with
  // colours that collided with market direction, and added little over the rank.)
  const filteredGroups = useMemo(() => {
    if (!data) return [];
    return tickerFilter ? data.groups.filter(g => g.ticker === tickerFilter) : data.groups;
  }, [data, tickerFilter]);

  // Flat, one-row-per-setup projection for the sortable table view
  const flatSetups = useMemo(() => filteredGroups.flatMap(g => g.setups), [filteredGroups]);

  // Compute counts per scanner tab (scan tier — stable between sweeps)
  const scannerCounts = useMemo(() => {
    if (!scanSnapshot) return {} as Record<ScannerKey, number>;
    const counts: Record<string, number> = {};
    let allCount = 0;
    for (const s of SCANNERS) {
      if (s.key === 'all') continue;
      const built = buildSkyVision(scanSnapshot, s.key);
      const count = built.groups.reduce((acc, g) => acc + g.found, 0);
      counts[s.key] = count;
      allCount += count;
    }
    counts['all'] = allCount;
    return counts as Record<ScannerKey, number>;
  }, [scanSnapshot]);

  // Collect unique tickers across the feed for the filter dropdown
  const feedTickers = useMemo(() => {
    if (!data) return [];
    return data.groups.map(g => g.ticker);
  }, [data]);

  const filteredShown = filteredGroups.reduce((a, g) => a + g.found, 0);

  const activeScanner = SCANNERS.find(s => s.key === scanner)!;

  const handleScanner = (next: ScannerKey) => {
    setScanner(next);
    setMonitorTarget(null);
    setSelectedSetup(null);
    setChainSel(null);
    setTickerFilter(null);
  };

  // Sortable table columns — every value read straight off the setup the
  // engine already built (state is a relabel of verdict + take-profit ladder).
  const setupColumns: Column<Setup>[] = useMemo(
    () => [
      {
        key: 'contract',
        header: 'Contract',
        sortValue: s => s.contract,
        render: s => (
          <span className="inline-flex items-center gap-2">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.right === 'C' ? 'bg-bull' : 'bg-bear'}`} />
            <span className="text-textPrimary font-semibold">{s.contract}</span>
          </span>
        ),
      },
      {
        key: 'state',
        header: 'State',
        sortValue: s => STATE_META[setupState(s)].rank,
        render: s => <StateBadge state={setupState(s)} />,
      },
      {
        key: 'score',
        header: 'Score',
        align: 'right',
        sortValue: s => s.score,
        render: s => <span className="text-textPrimary font-semibold">{s.score}</span>,
      },
      {
        key: 'move',
        header: 'Exp Move',
        align: 'right',
        sortValue: s => s.expectedMovePct,
        render: s => (
          <span className={s.expectedMovePct >= 0 ? 'text-bull' : 'text-bear'}>
            {s.expectedMovePct >= 0 ? '+' : ''}
            {s.expectedMovePct}%
          </span>
        ),
      },
      {
        key: 'health',
        header: 'Health',
        align: 'right',
        sortValue: s => s.health,
        render: s => <span className="text-textSecondary">{s.health}</span>,
      },
      {
        key: 'conf',
        header: 'Conf',
        align: 'right',
        sortValue: s => s.confidence,
        render: s => <span className="text-textSecondary">{s.confidence}%</span>,
      },
      {
        key: 'evidence',
        header: 'Evidence',
        sortValue: s => s.whyChips.length,
        render: s => (
          <span className="inline-flex flex-wrap items-center gap-1">
            {s.whyChips.slice(0, 2).map(c => (
              <span
                key={c}
                className="inline-flex items-center rounded border border-bull/20 bg-bull/[0.06] px-1.5 py-0.5 text-label uppercase tracking-wider text-bull"
              >
                {c}
              </span>
            ))}
            {s.whyChips.length > 2 && <span className="text-textMuted text-label">+{s.whyChips.length - 2}</span>}
          </span>
        ),
      },
      {
        key: 'contradiction',
        header: 'Contradiction',
        sortValue: s => s.invalidationPrice,
        render: s => (
          <span className="inline-flex items-center gap-1.5 text-warn" title={s.invalidationReason}>
            <AlertTriangle className="w-3 h-3 shrink-0" />
            {s.right === 'C' ? 'below' : 'above'} ${s.invalidationPrice.toFixed(2)}
          </span>
        ),
      },
    ],
    []
  );

  // Phase 1 → Phase 2: enter full review
  const handleReviewSetup = (setup: Setup) => {
    setMonitorTarget({ ticker: setup.ticker, strike: setup.strike, right: setup.right });
    setChainSel(null);
  };

  // Phase 2 → Phase 1: exit review, go back to browse
  const handleBackToBrowse = () => {
    setMonitorTarget(null);
    setChainSel(null);
  };

  const handleChainSelect = (sel: ChainSelection) => {
    setChainSel(sel);
    setMonitorTarget({ ticker: sel.ticker, strike: sel.strike, right: sel.right });
  };

  // When user clicks a setup in the feed, show it in SamplePreview
  const handleSelectSetup = (setup: Setup) => {
    setSelectedSetup(setup);
  };

  const modeSwitch = (
    <SegmentedControl
      ariaLabel="Compass mode"
      options={MODE_OPTIONS}
      value={mode}
      onChange={v => setMode(v as CompassMode)}
    />
  );

  const modeMeta = {
    setups: {
      crumb: 'Setups',
      title: 'Trade Setups',
      subtitle: SETUPS_SUBTITLE,
    },
    weigher: {
      crumb: 'Weigher',
      title: 'Contract Weigher',
      subtitle: 'Search any contract you have — weighed on the same scale as the top setups, with a better-R/R suggestion',
    },
    lotto: {
      crumb: 'Lotto',
      title: 'Lotto · 0DTE Desk',
      subtitle: 'Same-day speculation — 0DTE contracts and the closing-auction (MOC) engine. High variance by design.',
    },
  }[mode];

  // Browse mode header — setups needs no ticker search; weigher & lotto do
  const browseHeader = (
    <PageHeader
      breadcrumb={['Terminal', 'Compass', modeMeta.crumb]}
      title={modeMeta.title}
      subtitle={modeMeta.subtitle}
      actions={modeSwitch}
    />
  );

  // Review mode header — mode switch top-right (ticker lives in the top bar)
  const reviewHeader = (
    <PageHeader
      breadcrumb={['Terminal', 'Compass', 'Setups']}
      title="Trade Setups"
      subtitle={SETUPS_SUBTITLE}
      actions={modeSwitch}
    />
  );

  if (!data || !marketData) {
    return (
      <>
        {browseHeader}
        <Panel className="h-64" bodyClassName="flex items-center justify-center">
          <span className="font-mono text-label text-textMuted uppercase tracking-widest">
            Awaiting feed initialization…
          </span>
        </Panel>
      </>
    );
  }

  // Auto-select the first setup if nothing is selected yet
  const effectiveSelected = liveSelectedSetup ?? (filteredGroups[0]?.setups[0] ?? null);

  return (
    <>
      {inReviewMode && mode === 'setups' ? reviewHeader : browseHeader}

      {mode === 'weigher' ? (
        <ContractWeigher snapshot={marketData} initialHorizon={weigherHorizon} />
      ) : mode === 'lotto' ? (
        <LottoBoard snapshot={marketData} />
      ) : (
        <>

      {/* Scanner tabs with counts */}
      <div className="flex items-center gap-1 flex-wrap">
        {SCANNERS.map(s => {
          const isActive = scanner === s.key;
          const count = scannerCounts[s.key] ?? 0;
          return (
            <button
              key={s.key}
              onClick={() => handleScanner(s.key)}
              className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-mono text-label uppercase tracking-wider transition-colors ${
                isActive
                  ? 'text-[#0a0a0a] font-semibold'
                  : 'text-textMuted font-medium hover:text-textSecondary hover:bg-white/[0.03]'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="skyvision-scanner-pill"
                  className="absolute inset-0 rounded-md holo-bg"
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              <span className="relative z-10">{s.label}</span>
              <span className={`relative z-10 font-mono text-micro tnum ${isActive ? 'text-[#0a0a0a]/70' : 'text-textMuted/60'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Controls (browse mode only) — blurb + count, then lifecycle-state
          filter, view toggle and ticker universe filter */}
      {!inReviewMode && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-label text-textMuted uppercase tracking-wider">{activeScanner.blurb}</span>
            <span className="ml-auto font-mono text-label text-textMuted uppercase tracking-widest tnum">
              Showing {filteredShown} of {data.totalFound} setups · scan {lastScanAt} · 10s
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="ml-auto inline-flex items-center gap-2">
              <SegmentedControl
                ariaLabel="Setups view"
                options={SETUPS_VIEW_OPTIONS}
                value={setupsView}
                onChange={v => setSetupsView(v as SetupsView)}
              />
              <div className="relative">
                <button
                  onClick={() => setShowTickerDropdown(prev => !prev)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border font-mono text-label uppercase tracking-wider transition-colors ${
                    tickerFilter
                      ? 'border-select/40 bg-select/[0.06] text-select'
                      : 'border-borderSubtle bg-white/[0.02] text-textMuted hover:text-textSecondary'
                  }`}
                >
                  <Filter className="w-3 h-3" />
                  {tickerFilter ?? 'All Tickers'}
                </button>
                {showTickerDropdown && (
                  <div className="absolute right-0 top-full mt-1 z-20 min-w-[140px] border border-borderSubtle bg-panel rounded-md shadow-lg overflow-hidden animate-slide-in">
                    <button
                      onClick={() => { setTickerFilter(null); setShowTickerDropdown(false); }}
                      className={`w-full text-left px-3 py-2 font-mono text-label transition-colors ${
                        !tickerFilter ? 'text-select bg-select/[0.06]' : 'text-textSecondary hover:bg-white/[0.03]'
                      }`}
                    >
                      All Tickers
                    </button>
                    {feedTickers.map(t => (
                      <button
                        key={t}
                        onClick={() => { setTickerFilter(t); setShowTickerDropdown(false); }}
                        className={`w-full text-left px-3 py-2 font-mono text-label transition-colors ${
                          tickerFilter === t ? 'text-select bg-select/[0.06]' : 'text-textSecondary hover:bg-white/[0.03]'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </span>
          </div>
        </div>
      )}

      {/* Scanner blurb (review mode) */}
      {inReviewMode && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-label text-textMuted uppercase tracking-wider">{activeScanner.blurb}</span>
        </div>
      )}

      {/* Feed / monitor + preview / chain */}
      <div className={`grid grid-cols-1 xl:grid-cols-12 gap-4 ${inReviewMode ? 'items-stretch' : 'items-start'}`}>
        {/* LEFT COLUMN */}
        <div className="xl:col-span-7 min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={inReviewMode ? 'monitor' : `feed-${scanner}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              {inReviewMode && monitoredSetup ? (
                <SignalMonitor setup={monitoredSetup} onBack={handleBackToBrowse} />
              ) : (
                <div className="flex flex-col gap-4">
                  {setupsView === 'table' ? (
                    <Panel flush title="Setups" subtitle={`${filteredShown} shown`}>
                      <DataTable
                        columns={setupColumns}
                        rows={flatSetups}
                        rowKey={s => s.id}
                        onRowClick={handleSelectSetup}
                        selectedKey={effectiveSelected?.id ?? null}
                        initialSort={{ key: 'state', dir: 'desc' }}
                        maxHeight="640px"
                        emptyText="No setups meet this scanner's threshold right now"
                      />
                    </Panel>
                  ) : (
                    <SetupsFeed
                      groups={filteredGroups}
                      selectedSetupId={effectiveSelected?.id ?? null}
                      onSelectSetup={handleSelectSetup}
                      onOpenAnalysis={setup => handleReviewSetup(setup)}
                    />
                  )}
                  {/* Lives in the feed column so short (filtered) feeds never
                      leave a void against the taller preview card */}
                  <ImpactLeaderboard rows={data.impact} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* RIGHT COLUMN */}
        <div className="xl:col-span-5 min-w-0 flex flex-col">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={inReviewMode ? 'chain' : 'preview'}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 flex flex-col xl:relative"
            >
              {inReviewMode && liveChain ? (
                // Absolute inset on xl so the chain adopts the left column's height
                // (scrolling internally) instead of stretching the row taller.
                <div className="xl:absolute xl:inset-0 flex flex-col min-h-0">
                  <ContractChain data={liveChain} selected={chainSel} onSelect={handleChainSelect} />
                </div>
              ) : effectiveSelected ? (
                <SamplePreview
                  setup={effectiveSelected}
                  scanner={scanner}
                  onReviewSetup={() => handleReviewSetup(effectiveSelected)}
                />
              ) : (
                <Panel className="h-64" bodyClassName="flex items-center justify-center">
                  <span className="font-mono text-label text-textMuted uppercase tracking-widest">
                    Select a setup to preview
                  </span>
                </Panel>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Largest impact leaderboard — full width in review mode only */}
      {inReviewMode && <ImpactLeaderboard rows={data.impact} />}
        </>
      )}
    </>
  );
};

export default Compass;
