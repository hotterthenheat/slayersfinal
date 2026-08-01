import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Filter } from 'lucide-react';
import { useMarketData } from '../context/MarketDataContext';
import type { MarketSnapshot } from '../types/market';
import Simulator from '../core/simulator';
import { buildSkyVision, makeSetup } from '../data/skyvision';
import { SCANNERS, type ScannerKey, type Setup } from '../types/skyvision';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import ContractChain, { type ChainSelection } from '../components/skyvision/ContractChain';
import SignalMonitor from '../components/skyvision/SignalMonitor';
import ImpactLeaderboard from '../components/skyvision/ImpactLeaderboard';
import ContractWeigher from '../components/compass/ContractWeigher';
import LottoBoard from '../components/compass/LottoBoard';
import SetupScanBoard, { type ScanLayout } from '../components/compass/SetupScanBoard';
import SetupCompare from '../components/compass/SetupCompare';
import { expiryRangeLabel } from '../components/compass/setupHorizon';
import type { Horizon } from '../core/contractScore';
import SegmentedControl from '../components/ui/SegmentedControl';
import { SkeletonRows } from '../components/ui/Skeleton';
import { DUR, EASE, PILL } from '../lib/motion';

type CompassMode = 'setups' | 'weigher' | 'lotto';

const SETUPS_SUBTITLE = 'Setups ranked by trend + dealer-flow conviction. A read, never an order.';

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

const SCANNER_KEYS = new Set<string>(SCANNERS.map(s => s.key));

/**
 * `?view=` is this whole surface in one param.
 *
 * /compass is a single route and the pane used to live in component state, so
 * nothing here could be bookmarked, shared or reached with the back button. One
 * param covers all of it: the three panes, and the six scanner presets, since a
 * preset IS a view of the setups pane rather than a setting inside it.
 *
 * Backward compatible on purpose. No param means exactly what it meant before
 * (Setups / Top Setups), an unreadable value falls back the same way, and the
 * URL is only written once the user actually moves — so an existing /compass
 * bookmark is left alone until it is used.
 */
interface ViewRead {
  mode: CompassMode;
  scanner?: ScannerKey;
}

function readView(raw: string | null): ViewRead | null {
  if (!raw) return null;
  if (raw === 'setups' || raw === 'weigher' || raw === 'lotto') return { mode: raw };
  if (SCANNER_KEYS.has(raw)) return { mode: 'setups', scanner: raw as ScannerKey };
  return null;
}

const Compass = () => {
  const { marketData, changeTicker } = useMarketData();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const landedOn = readView(params.get('view'));
  const [scanner, setScanner] = useState<ScannerKey>(landedOn?.scanner ?? 'top-setups');
  const [mode, setMode] = useState<CompassMode>(landedOn?.mode ?? 'setups');
  const [weigherHorizon, setWeigherHorizon] = useState<Horizon | undefined>(undefined);

  // Phase 1 (browse): selectedSetup drives the compare card
  // Phase 2 (review): monitorTarget drives the SignalMonitor + ContractChain
  const [selectedSetup, setSelectedSetup] = useState<Setup | null>(null);
  const [monitorTarget, setMonitorTarget] = useState<MonitorTarget | null>(null);
  const [chainSel, setChainSel] = useState<ChainSelection | null>(null);

  // Ticker filter for browse mode — null means show all tickers
  const [tickerFilter, setTickerFilter] = useState<string | null>(null);
  const [showTickerDropdown, setShowTickerDropdown] = useState(false);

  // Scan presentation: card grid vs sortable table. Two densities of one list.
  const [scanLayout, setScanLayout] = useState<ScanLayout>('cards');

  const inReviewMode = monitorTarget !== null;

  const writeView = (value: string) => {
    const next = new URLSearchParams(params);
    next.set('view', value);
    setParams(next, { replace: true });
  };

  // The URL is the source of truth once it carries a view, so the back button
  // and a pasted link both land where they say they will.
  useEffect(() => {
    const view = readView(params.get('view'));
    if (!view) return;
    setMode(view.mode);
    if (view.scanner) setScanner(view.scanner);
  }, [params]);

  // Deep links: from Tracker (land in review mode on the tracked setup) or
  // from Earnings/Stocks/News ("weigh this name's contracts"). Router state
  // still wins over the param — /lotto redirects through it.
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
      writeView(incoming.scanner);
    } else if (state?.weigh) {
      changeTicker(state.weigh.ticker);
      setMode('weigher');
      if (state.weigh.horizon) setWeigherHorizon(state.weigh.horizon);
      window.history.replaceState({}, '');
      writeView('weigher');
    } else if (state?.compassMode) {
      // Landed from the /lotto redirect (or a palette deep-link). Publishing the
      // mode to the URL is what makes that landing bookmarkable in turn.
      setMode(state.compassMode);
      window.history.replaceState({}, '');
      writeView(state.compassMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- two-tier cadence -----------------------------------------------------
  // Live tier (every tick): prices, monitor, compare card, contract chain.
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
    // marketData is a re-tick trigger — the body reads live prices from Simulator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitorTarget, scanner, marketData]);

  // Also rebuild the selected setup live so the compare card stays current
  const liveSelectedSetup = useMemo(() => {
    if (!selectedSetup) return null;
    Simulator.ensureTicker(selectedSetup.ticker);
    const cfg = Simulator.TICKERS[selectedSetup.ticker];
    return makeSetup(selectedSetup.ticker, cfg.currentPrice, selectedSetup.strike, selectedSetup.right, scanner, cfg.iv);
    // marketData is a re-tick trigger — the body reads live prices from Simulator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSetup, scanner, marketData]);

  // Filtered groups for browse mode — ticker universe only. (The lifecycle-state
  // filter was removed: it segmented the feed by triggered/invalidated with
  // colours that collided with market direction, and added little over the rank.)
  const filteredGroups = useMemo(() => {
    if (!data) return [];
    return tickerFilter ? data.groups.filter(g => g.ticker === tickerFilter) : data.groups;
  }, [data, tickerFilter]);

  /* One flat, globally ranked list feeds both densities. The engine groups by
     ticker, which meant the #3 setup on the strongest name rendered below the
     #1 of a weaker one; "the best setups in the market" has to mean the best
     regardless of whose ticker they belong to. */
  const rankedSetups = useMemo(
    () => filteredGroups.flatMap(g => g.setups).sort((a, b) => b.score - a.score),
    [filteredGroups]
  );

  /* Per-tab count AND the expiry the preset actually selects.
     "Quick Scalp for what — 0DTE, 1DTE?" is a fair question and the tab strip
     had no answer, because the horizon lived in the engine profile and no type
     carried it out. Rather than keep a second copy of that table here, each
     preset is asked directly: one throwaway build reports the expiry it stamps.
     A screen that reads the engine cannot drift from it.

     The counts read `shown` — what the pane will actually render. The All tab
     used to print the sum of the other five and then render its own, smaller,
     result set. Neither number touches `groups`, so five of the six sweeps stay
     unmaterialised the way the engine intends. */
  const scannerMeta = useMemo(() => {
    const meta = {} as Record<ScannerKey, { count: number; expiry: string }>;
    if (!scanSnapshot) return meta;
    Simulator.ensureTicker(scanSnapshot.ticker);
    const cfg = Simulator.TICKERS[scanSnapshot.ticker];
    for (const s of SCANNERS) {
      const built = s.key === scanner && data ? data : buildSkyVision(scanSnapshot, s.key);
      meta[s.key] = {
        count: built.shown,
        expiry: makeSetup(scanSnapshot.ticker, cfg.currentPrice, Math.round(cfg.currentPrice), 'C', s.key, cfg.iv).expiry,
      };
    }
    return meta;
  }, [scanSnapshot, scanner, data]);

  // Collect unique tickers across the feed for the filter dropdown
  const feedTickers = useMemo(() => {
    if (!data) return [];
    return data.groups.map(g => g.ticker);
  }, [data]);

  const activeScanner = SCANNERS.find(s => s.key === scanner)!;
  /* The open pane labels itself from the contracts on screen — free, since they
     are already built — and falls back to the preset's own stamp. If a preset
     ever spans two expiries, the pane the user is looking at says so. */
  const activeExpiry = useMemo(
    () => expiryRangeLabel(rankedSetups.map(s => s.expiry)) || scannerMeta[scanner]?.expiry || '',
    [rankedSetups, scannerMeta, scanner]
  );

  const handleScanner = (next: ScannerKey) => {
    setScanner(next);
    setMonitorTarget(null);
    setSelectedSetup(null);
    setChainSel(null);
    setTickerFilter(null);
    writeView(next);
  };

  const handleMode = (next: CompassMode) => {
    setMode(next);
    // Setups publishes its preset, so a shared link opens the pane the sender saw.
    writeView(next === 'setups' ? scanner : next);
  };

  /* Phase 1 → Phase 2: enter full review.
     Stable identities so the memoised scan board sits out the 1.5s price tick.
     The board can be holding 240 rows; reconciling them to redraw a price that
     is not in any of them is work nobody asked for. */
  const handleReviewSetup = useCallback(
    (setup: Setup) => {
      /* Follow the contract's underlying. The chain beside the monitor is built
         from the ACTIVE ticker's snapshot, so studying a setup on a name the
         desk was not pointed at used to put SPY's ladder next to it. Harmless
         when the scan was four names; a straight lie now the field is five
         hundred. The Tracker deep-link has always switched the ticker on the
         way in — this is the in-page path doing the same thing. */
      changeTicker(setup.ticker);
      setMonitorTarget({ ticker: setup.ticker, strike: setup.strike, right: setup.right });
      setChainSel(null);
    },
    [changeTicker]
  );

  // Phase 2 → Phase 1: exit review, go back to browse
  const handleBackToBrowse = () => {
    setMonitorTarget(null);
    setChainSel(null);
  };

  const handleChainSelect = (sel: ChainSelection) => {
    setChainSel(sel);
    setMonitorTarget({ ticker: sel.ticker, strike: sel.strike, right: sel.right });
  };

  // When user clicks a setup in the scan, show it in the compare card
  const handleSelectSetup = useCallback((setup: Setup) => {
    setSelectedSetup(setup);
  }, []);

  const modeSwitch = (
    <SegmentedControl
      ariaLabel="Compass mode"
      options={MODE_OPTIONS}
      value={mode}
      onChange={v => handleMode(v as CompassMode)}
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
      subtitle: 'Search any contract you have. Weighed on the same scale as the top setups, with a better-R/R suggestion.',
    },
    lotto: {
      crumb: 'Lotto',
      title: 'Lotto · 0DTE Desk',
      subtitle: 'Same-day speculation. 0DTE contracts and the closing-auction (MOC) engine. High variance by design.',
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

  /*
    Review mode header — mode switch top-right (ticker lives in the top bar).

    This existed as its own code path and then rendered the browse header
    verbatim: breadcrumb "… / Setups", title "Trade Setups", the browse
    subtitle. So arriving here from "Monitor strike" on the Trace drawer, or
    from Review in the Tracker, put the signal monitor on screen under a header
    still claiming you were browsing the setups feed. The destination was right
    and the wayfinding was wrong. It now names the contract being watched.
  */
  const reviewHeader = (
    <PageHeader
      breadcrumb={['Terminal', 'Compass', 'Monitor']}
      title={
        monitorTarget
          ? `Monitoring ${monitorTarget.ticker} ${monitorTarget.strike}${monitorTarget.right}`
          : 'Signal Monitor'
      }
      subtitle="Watching one setup as it moves. The card that graded it now tracks whether the structure under it holds."
      actions={modeSwitch}
    />
  );

  if (!data || !marketData) {
    return (
      <>
        {browseHeader}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start animate-view-in">
          <Panel flush className="xl:col-span-7" bodyClassName="p-4">
            <SkeletonRows rows={6} />
          </Panel>
          <Panel flush className="xl:col-span-5" bodyClassName="p-4">
            <SkeletonRows rows={4} />
          </Panel>
        </div>
      </>
    );
  }

  // Auto-select the strongest setup so the compare card always has a subject
  const effectiveSelected = liveSelectedSetup ?? rankedSetups[0] ?? null;

  return (
    <>
      {inReviewMode && mode === 'setups' ? reviewHeader : browseHeader}

      {mode === 'weigher' ? (
        <ContractWeigher snapshot={marketData} initialHorizon={weigherHorizon} />
      ) : mode === 'lotto' ? (
        <LottoBoard snapshot={marketData} />
      ) : (
        <>

      {/* Scanner tabs — each one states the expiry it selects, because "Quick
          Scalp" is a style and a trader needs the horizon. */}
      <div className="flex items-center gap-1 flex-wrap">
        {SCANNERS.map(s => {
          const isActive = scanner === s.key;
          const meta = scannerMeta[s.key];
          return (
            <button
              key={s.key}
              onClick={() => handleScanner(s.key)}
              aria-pressed={isActive}
              title={s.blurb}
              className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-mono text-label uppercase tracking-wider transition-colors ${
                isActive
                  ? 'text-ink font-semibold'
                  : 'text-textMuted font-medium hover:text-textSecondary hover:bg-rowHover'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="skyvision-scanner-pill"
                  className="absolute inset-0 rounded-md holo-bg"
                  transition={PILL}
                />
              )}
              <span className="relative z-10">{s.label}</span>
              <span className={`relative z-10 font-mono text-micro tnum ${isActive ? 'text-ink/70' : 'text-textMuted'}`}>
                {meta?.expiry ? `${meta.expiry} · ` : ''}
                {meta?.count ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Controls (browse mode only) — what this scan is, how much it found, and
          the one filter that acts on it. The Cards/Table switch used to sit out
          here too, three columns away from the panel it re-renders; it now lives
          in that panel's own header. */}
      {!inReviewMode && (
        <div className="flex items-center gap-x-3 gap-y-2 flex-wrap">
          <span className="font-mono text-label text-textMuted uppercase tracking-wider">
            {activeExpiry ? `${activeExpiry} · ` : ''}
            {activeScanner.blurb}
          </span>
          <span className="ml-auto font-mono text-label text-textMuted uppercase tracking-widest tnum">
            Showing {rankedSetups.length} of {data.totalFound} setups · scan {lastScanAt} · 10s
          </span>
          <div className="relative">
            <button
              onClick={() => setShowTickerDropdown(prev => !prev)}
              aria-label="Filter setups by ticker"
              aria-expanded={showTickerDropdown}
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
              /* Scrolls: the scan spans up to forty names now, so this list is
                 no longer four items long. */
              <div className="absolute right-0 top-full mt-1 z-20 min-w-[140px] max-h-72 overflow-y-auto border border-borderSubtle bg-panel rounded-md shadow-overlay animate-slide-in">
                <button
                  onClick={() => { setTickerFilter(null); setShowTickerDropdown(false); }}
                  className={`w-full text-left px-3 py-2 font-mono text-label transition-colors ${
                    !tickerFilter ? 'text-select bg-select/[0.06]' : 'text-textSecondary hover:bg-rowHover'
                  }`}
                >
                  All Tickers
                </button>
                {feedTickers.map(t => (
                  <button
                    key={t}
                    onClick={() => { setTickerFilter(t); setShowTickerDropdown(false); }}
                    className={`w-full text-left px-3 py-2 font-mono text-label transition-colors ${
                      tickerFilter === t ? 'text-select bg-select/[0.06]' : 'text-textSecondary hover:bg-rowHover'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scanner blurb (review mode) */}
      {inReviewMode && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-label text-textMuted uppercase tracking-wider">
            {activeExpiry ? `${activeExpiry} · ` : ''}
            {activeScanner.blurb}
          </span>
        </div>
      )}

      {/* Scan / monitor + compare / chain.
          items-start in both modes: review mode used to stretch the row and then
          hand the right column an only-absolute child, which collapsed the
          chain to a zero-height box at xl and left a dead panel beside the
          monitor. */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN */}
        <div className="xl:col-span-7 min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={inReviewMode ? 'monitor' : `feed-${scanner}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: DUR.base, ease: EASE }}
            >
              {inReviewMode && monitoredSetup ? (
                <SignalMonitor setup={monitoredSetup} onBack={handleBackToBrowse} />
              ) : (
                <SetupScanBoard
                  setups={rankedSetups}
                  totalFound={data.totalFound}
                  scannerLabel={activeScanner.label}
                  expiryLabel={activeExpiry}
                  layout={scanLayout}
                  onLayoutChange={setScanLayout}
                  selectedId={effectiveSelected?.id ?? null}
                  onSelect={handleSelectSetup}
                  onStudy={handleReviewSetup}
                  resetKey={`${scanner}|${tickerFilter ?? 'all'}`}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* RIGHT COLUMN */}
        <div className="xl:col-span-5 min-w-0 flex flex-col xl:sticky xl:top-4 xl:self-start">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={inReviewMode ? 'chain' : 'compare'}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: DUR.base, ease: EASE }}
              className="flex-1 flex flex-col"
            >
              {inReviewMode && liveChain ? (
                <ContractChain data={liveChain} selected={chainSel} onSelect={handleChainSelect} />
              ) : effectiveSelected ? (
                <SetupCompare
                  setup={effectiveSelected}
                  peers={rankedSetups}
                  scanner={scanner}
                  onSelectPeer={handleSelectSetup}
                  onStudy={() => handleReviewSetup(effectiveSelected)}
                />
              ) : (
                <Panel className="h-64" bodyClassName="flex items-center justify-center">
                  <span className="font-mono text-label text-textMuted uppercase tracking-widest">
                    Select a setup to compare
                  </span>
                </Panel>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Largest impact contracts — one home, full width, under both modes.
          It used to be tucked into the feed column as ballast against a short
          scan, which is how a leaderboard ends up reading as padding under the
          setups rather than as the desk-level context it is. */}
      <ImpactLeaderboard rows={data.impact} />
        </>
      )}
    </>
  );
};

export default Compass;
