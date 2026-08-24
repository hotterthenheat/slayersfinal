import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Filter } from 'lucide-react';
import { useMarketData } from '../context/MarketDataContext';
import type { MarketSnapshot } from '../types/market';
import Simulator from '../core/simulator';
import { buildCompassView, buildImpact, makeSetup } from '../data/compass';
import {
  SCANNERS,
  SLEEVES,
  isScannerEligible,
  type ImpactRow,
  type OptionRight,
  type ScannerKey,
  type Setup,
  type SleeveKey,
} from '../types/compass';
import { expiryFor } from '../core/calendar';
import PageHeader from '../components/ui/PageHeader';
import TickerSearch from '../components/ui/TickerSearch';
import Panel from '../components/ui/Panel';
import type { DossierVariant } from '../components/compass/DossierFeed';
import CampaignAnalysis from '../components/compass/CampaignAnalysis';
import ImpactLeaderboard from '../components/compass/ImpactLeaderboard';
import ContractWeigher from '../components/compass/ContractWeigher';
import SetupScanBoard from '../components/compass/SetupScanBoard';
import SegmentedControl from '../components/ui/SegmentedControl';

type CompassMode = 'setups' | 'weigher';

const MODE_OPTIONS = [
  { value: 'setups', label: 'Setups' },
  { value: 'weigher', label: 'Weigher' },
] as const;

/** Each mode names itself in the header — no nested ternaries. */
const MODE_META: Record<CompassMode, { crumb: string; title: string; subtitle: string }> = {
  setups: {
    crumb: 'Setups',
    title: 'Trade Setups',
    subtitle: 'Setups graded on structure — ACTIVE while the thesis works, WATCH while it proves itself',
  },
  weigher: {
    crumb: 'Weigher',
    title: 'Contract Weigher',
    subtitle:
      'The whole chain on the scale — pick any strike and expiry and the desk weighs it: math, flow, dark pool and news',
  },
};

interface MonitorTarget {
  ticker: string;
  strike: number;
  right: 'C' | 'P';
  /** Provenance: which sweep surfaced this row. The monitor reads live. */
  gradedAt?: string;
}

/** The scanner sweeps on its own cadence — the feed must not vibrate with every price tick. */
const SCAN_INTERVAL_MS = 10_000;

const Compass = () => {
  const { activeTicker, marketData, changeTicker } = useMarketData();
  const location = useLocation();

  // Bumps every simulator tick — drives incremental candle updates on the
  // campaign chart without resetting it.
  const revRef = useRef(0);
  const revision = useMemo(() => ++revRef.current, [marketData]);
  const [scanner, setScanner] = useState<ScannerKey>('top-setups');
  /** The tenor axis — every scanner runs on every sleeve. */
  const [sleeve, setSleeve] = useState<SleeveKey>('odte');
  const [mode, setMode] = useState<CompassMode>('setups');

  // Phase 1 (browse): the full-width board — the preview card moved to the
  // campaign page (Noah, 2026-08-17), so a click goes straight to review.
  // Phase 2 (review): monitorTarget drives the CampaignAnalysis page
  /* The TRAIL (Noah, 2026-08-19): opening a contract from the analysis
     page's driver list pushes onto it, Back pops one level, and Board clears
     it. The page shows the trail's last entry. */
  const [trail, setTrail] = useState<MonitorTarget[]>([]);
  const monitorTarget = trail.length ? trail[trail.length - 1] : null;

  /* Board SELECTION (Noah, 2026-08-19: "click a con without taking them to
     the analysis page"): one click selects a card — white border — and the
     rail becomes that name's book; a second click on the selected card, or
     ANALYSIS at any time, opens it. Selection is a look, never a pin: it
     does not repoint the desk. */
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Ticker filter for browse mode — null means show all tickers
  const [tickerFilter, setTickerFilter] = useState<string | null>(null);
  const [showTickerDropdown, setShowTickerDropdown] = useState(false);
  const tickerMenuRef = useRef<HTMLDivElement | null>(null);

  /* Click-away closes the filter menu (Noah, 2026-08-09: having to hit
     "Filter by Ticker" again to get out is not how a dropdown behaves).
     Same contract as ChartToolbar's Dropdown — mousedown so the menu is gone
     before the click lands, plus Esc. */
  useEffect(() => {
    if (!showTickerDropdown) return;
    const onDown = (e: MouseEvent) => {
      if (tickerMenuRef.current && !tickerMenuRef.current.contains(e.target as Node)) {
        setShowTickerDropdown(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowTickerDropdown(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [showTickerDropdown]);

  const inReviewMode = monitorTarget !== null;

  /* The analysis page GREETS the user at the SLEEVE STRIP (Noah, 2026-08-09:
     opening a setup from a scrolled board dropped him into the middle of the
     chart — "top but not all the way top", and his screenshot shows the strip
     tucked under the nav with the page header scrolled away). So we anchor,
     not zero: scrollTop 0 would put "Trade Setups" and its subtitle back in
     the frame and push the chart down.
     The scroll container is AppShell's <main> (the TopBar lives outside it).
     Layout effect, not effect: the scroll lands in the same frame as the view
     swap, so nothing flashes mid-page.

     BOTH directions anchor to the same strip, and that is deliberate. The
     first cut restored the board to a remembered scrollTop on Back, and it
     was flaky (measured landing on the analysis page's offset instead of the
     board's): swapping a tall view for a short one triggers the browser's
     own scroll anchoring, which then argues with an absolute scrollTop.
     Measuring a live element and scrolling it to the top agrees with that
     mechanism rather than fighting it — which is why the entry direction was
     stable across every trial. Predictable beats clever; the board's whole
     scroll range is under a viewport, so nobody loses much of their place. */
  const analysisTopRef = useRef<HTMLDivElement | null>(null);
  const didMountRef = useRef(false);
  const ANALYSIS_TOP_GAP = 12;
  useLayoutEffect(() => {
    // Arriving at Compass is not a transition — the page keeps its header on
    // first paint. Only opening an analysis (or coming back) re-anchors.
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const scroller = document.querySelector<HTMLElement>('main');
    const anchor = analysisTopRef.current;
    if (!scroller || !anchor) return;
    const delta = anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTop = Math.max(0, scroller.scrollTop + delta - ANALYSIS_TOP_GAP);
  }, [inReviewMode, monitorTarget?.ticker, monitorTarget?.strike, monitorTarget?.right]);

  // Deep links in: from Tracker (land in review mode on the tracked setup) or
  // from a Trace print drilldown (land on the scale with that name loaded).
  useEffect(() => {
    const state = location.state as {
      monitor?: { ticker: string; strike: number; right: 'C' | 'P'; scanner: ScannerKey };
      weigh?: { ticker: string };
    } | null;
    if (state?.monitor) {
      const incoming = state.monitor;
      // Legacy deep links can carry pre-sleeve scanner keys ('weeklies',
      // 'swings') — those were tenors, so they land on the matching sleeve.
      const known = SCANNERS.some(s => s.key === incoming.scanner);
      setScanner(known ? incoming.scanner : 'top-setups');
      if (!known) {
        setSleeve((incoming.scanner as string) === 'swings' ? 'swing' : 'weekly');
      }
      changeTicker(incoming.ticker);
      setTrail([{ ticker: incoming.ticker, strike: incoming.strike, right: incoming.right }]);
      window.history.replaceState({}, ''); // consume so refresh doesn't re-enter
    } else if (state?.weigh) {
      changeTicker(state.weigh.ticker);
      setMode('weigher');
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

  // The live harness's market state for the whole board — the engine takes it
  // as an argument (never reads the simulator itself), so replay and live run
  // identical code. Scan-tier cadence: quotes refresh with the sweep.
  const universe = useMemo(
    () => (scanSnapshot ? Simulator.universeQuotes(scanSnapshot.ticker) : []),
    [scanSnapshot]
  );

  // Scan tier: feed groups, counts, impact — stable between sweeps
  const data = useMemo(
    () => (scanSnapshot ? buildCompassView(scanSnapshot, scanner, universe, sleeve) : null),
    [scanSnapshot, scanner, universe, sleeve]
  );

  // Rebuild the monitored setup live each tick from its identity so it stays current.
  // marketData is the tick dependency — without it the "LIVE" readouts freeze at click-time.
  const monitoredSetup = useMemo(() => {
    if (!monitorTarget) return null;
    Simulator.ensureTicker(monitorTarget.ticker);
    const cfg = Simulator.TICKERS[monitorTarget.ticker];
    return makeSetup(monitorTarget.ticker, cfg.currentPrice, monitorTarget.strike, monitorTarget.right, scanner, cfg.iv, sleeve);
  }, [monitorTarget, scanner, sleeve, marketData]);

  // The monitored underlying's live spot — the facts strip speaks in it
  const monitorSpot = useMemo(() => {
    if (!monitorTarget) return 0;
    return Simulator.TICKERS[monitorTarget.ticker]?.currentPrice ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitorTarget, marketData]);

  // Filtered groups for browse mode
  const filteredGroups = useMemo(() => {
    if (!data) return [];
    if (!tickerFilter) return data.groups;
    return data.groups.filter(g => g.ticker === tickerFilter);
  }, [data, tickerFilter]);

  // Compute counts per scanner tab (scan tier — stable between sweeps).
  // Counts follow the ACTIVE SLEEVE and only its ELIGIBLE lenses — a tenor's
  // "All" sums exactly the tabs it shows, nothing hidden.
  // SETUPS-ONLY: this is five full board builds — running them while the
  // Weigher is up stalled every ticker switch there for nothing (the tabs
  // they feed aren't even mounted). Noah felt it as "a buffer".
  const scannerCounts = useMemo(() => {
    if (!scanSnapshot || mode !== 'setups') return {} as Record<ScannerKey, number>;
    const counts: Record<string, number> = {};
    let allCount = 0;
    for (const s of SCANNERS) {
      if (s.key === 'all' || !isScannerEligible(s.key, sleeve)) continue;
      const built = buildCompassView(scanSnapshot, s.key, universe, sleeve);
      const count = built.groups.reduce((acc, g) => acc + g.found, 0);
      counts[s.key] = count;
      allCount += count;
    }
    counts['all'] = allCount;
    return counts as Record<ScannerKey, number>;
  }, [scanSnapshot, universe, sleeve, mode]);

  // Real expiry per sleeve, through the clock-aware calendar — recomputed with
  // each sweep so a session rollover moves the chips.
  const sleeveDates = useMemo(() => {
    void scanSnapshot; // sweep dependency — the calendar reads the engine clock
    return Object.fromEntries(SLEEVES.map(s => [s.key, expiryFor(s.dte)])) as Record<
      SleeveKey,
      ReturnType<typeof expiryFor>
    >;
  }, [scanSnapshot]);


  // Collect unique tickers across the feed for the filter dropdown
  const feedTickers = useMemo(() => {
    if (!data) return [];
    return data.groups.map(g => g.ticker);
  }, [data]);

  // The flat, globally-ranked board — rank is the organizing principle now
  // (grouping by ticker retired with the dossiers, 2026-08-04).
  const rankedSetups = useMemo(
    () => filteredGroups.flatMap(g => g.setups).sort((a, b) => b.score - a.score),
    [filteredGroups]
  );

  /* Nothing selected → #1 is. The rail always follows a selection, so it
     never belongs to nothing; a sweep, filter or lens change that drops the
     selected card falls back to the first one visible. */
  useEffect(() => {
    if (!rankedSetups.length) return;
    if (!selectedId || !rankedSetups.some(s => s.id === selectedId)) setSelectedId(rankedSetups[0].id);
  }, [rankedSetups, selectedId]);
  const selectedSetup = useMemo(
    () => rankedSetups.find(s => s.id === selectedId) ?? rankedSetups[0] ?? null,
    [rankedSetups, selectedId]
  );

  /* The rail's book (Noah, 2026-08-19: a single name's contracts beside a
     16-name board meant nothing — and the name of the contract you last
     backed out of is irrelevant once you're home): the SELECTED card's
     name. Scan-tier cadence — the read lands on the same sweep as the board
     it sits beside. The first selection of an unseeded roster name seeds it
     (the card-click precedent), never a hidden cost on the sweep. */
  const railTicker = selectedSetup?.ticker ?? scanSnapshot?.ticker ?? null;
  const railSnapshot = useMemo(() => {
    if (!scanSnapshot || !railTicker) return null;
    if (railTicker === scanSnapshot.ticker) return scanSnapshot;
    try {
      return Simulator.snapshotFor(railTicker);
    } catch {
      return scanSnapshot;
    }
  }, [scanSnapshot, railTicker]);
  const railRows = useMemo(() => (railSnapshot ? buildImpact(railSnapshot, sleeve) : []), [railSnapshot, sleeve]);
  const railNote = selectedSetup
    ? `#${rankedSetups.indexOf(selectedSetup) + 1} ${selectedSetup.contract} selected`
    : undefined;

  const activeScanner = SCANNERS.find(s => s.key === scanner)!;
  const activeSleeveExp = sleeveDates[sleeve];

  const handleScanner = (next: ScannerKey) => {
    setScanner(next);
    setTrail([]);
    setSelectedId(null);
    setTickerFilter(null);
  };

  const handleSleeve = (next: SleeveKey) => {
    setSleeve(next);
    // A lens the new tenor doesn't sell falls back to the ranking — landing
    // on a Quick Scalp tab that LEAPS doesn't have would strand the board.
    if (!isScannerEligible(scanner, next)) setScanner('top-setups');
    setTrail([]);
    setSelectedId(null);
  };

  // Phase 1 → Phase 2: enter full review. The desk REPOINTS to the contract's
  // underlying — a QQQ setup over an SPY chain was the monitor pricing the
  // wrong market (Noah's screenshot caught it live). The card stays selected
  // underneath, so coming Back lands on it with the rail on its name.
  const handleReviewSetup = (setup: Setup) => {
    if (setup.ticker !== activeTicker) changeTicker(setup.ticker);
    setSelectedId(setup.id);
    setTrail([
      {
        ticker: setup.ticker,
        strike: setup.strike,
        right: setup.right,
        gradedAt: lastScanAt || undefined,
      },
    ]);
  };

  // One click selects; a second click on the selected card opens it.
  const handleSelect = (setup: Setup) => {
    if (setup.id === selectedId) handleReviewSetup(setup);
    else setSelectedId(setup.id);
  };

  // A contract from the rail opens its OWN analysis page (Mo, 2026-08-19:
  // "clicking the contract should open the exact analysis page") — the same
  // door the setup cards use, pinned to that strike and side on the rail's
  // book. The desk repoints to that name, as it does for a card.
  const handleOpenContract = (row: ImpactRow) => {
    const ticker = railSnapshot?.ticker ?? activeTicker;
    if (ticker !== activeTicker) changeTicker(ticker);
    setTrail([{ ticker, strike: row.strike, right: row.right, gradedAt: lastScanAt || undefined }]);
  };

  // A driver row on the analysis page PUSHES another contract on the same
  // book onto the trail — a new campaign, on the same sweep's provenance.
  const handleRetarget = (strike: number, right: OptionRight) => {
    setTrail(prev => {
      const last = prev[prev.length - 1];
      return last ? [...prev, { ...last, strike, right, gradedAt: lastScanAt || undefined }] : prev;
    });
  };

  // Back walks the trail one step; at its root it is the board.
  const handleBack = () => setTrail(prev => prev.slice(0, -1));
  // Board is always the board.
  const handleBoard = () => setTrail([]);

  const contractLabel = (t: MonitorTarget) =>
    `${t.ticker} ${t.strike % 1 === 0 ? t.strike.toFixed(0) : t.strike.toFixed(2)}${t.right}`;
  const backLabel = trail.length > 1 ? contractLabel(trail[trail.length - 2]) : 'Board';

  const modeSwitch = (
    <SegmentedControl
      ariaLabel="Compass mode"
      options={MODE_OPTIONS}
      value={mode}
      onChange={v => setMode(v as CompassMode)}
    />
  );

  /* ONE header for Setups, browse and review alike (Noah, 2026-08-09: the
     review page's ticker search "serves no purpose"). It never did: the
     analysis page is pinned to the CONTRACT that was opened — repointing the
     desk underneath it only risked pricing one name's setup against another's
     book. The Weigher keeps its search; that mode really is ticker-driven. */
  const meta = MODE_META[mode];
  const browseHeader = (
    <PageHeader
      breadcrumb={['Terminal', 'Compass', meta.crumb]}
      title={meta.title}
      subtitle={meta.subtitle}
      actions={
        mode === 'setups' ? (
          modeSwitch
        ) : (
          <span className="inline-flex items-center gap-2">
            {modeSwitch}
            <TickerSearch value={activeTicker} onChange={changeTicker} />
          </span>
        )
      }
    />
  );

  if (!data || !marketData) {
    return (
      <>
        {browseHeader}
        <Panel className="h-64" bodyClassName="flex items-center justify-center">
          <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">
            Awaiting feed initialization…
          </span>
        </Panel>
      </>
    );
  }


  return (
    <>
      {browseHeader}

      {/* Mode swap fades the new view in rather than snapping to it. Keyed CSS
          animation, NOT AnimatePresence: an exit animation would hold the old
          view mounted until it finishes, and anything that stalls the tick
          (a backgrounded tab) leaves the page wedged on the old body under the
          new header — the same trap that broke the print modal. No exit means
          nothing to stall. It also lands faster, which a tab click wants.
          The wrapper re-states the page's flex-col gap-4, since it now sits
          between the shell and the children that were relying on it. */}
      <div key={mode} className="flex flex-col gap-4 animate-soft-in">
      {mode === 'weigher' ? (
        <ContractWeigher snapshot={marketData} />
      ) : (
        <>

      {/* Tenor axis — the sleeve strip. UNIFORM boxes (an equal-width grid,
          not content-sized buttons) and ONE voice: tenor is terminal hardware,
          so the active sleeve wears the flat holo silver — the same chip
          language as the process pills — and the DATE is the differentiator.
          The old hot→cool four-hue rainbow read as four flavored buttons
          (Noah, 2026-08-07). */}
      <div
        ref={analysisTopRef}
        role="tablist"
        aria-label="Contract horizon"
        className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 w-full max-w-3xl"
      >
        {SLEEVES.map(sl => {
          const isActive = sleeve === sl.key;
          const exp = sleeveDates[sl.key];
          return (
            <button
              key={sl.key}
              role="tab"
              aria-selected={isActive}
              title={sl.blurb}
              onClick={() => handleSleeve(sl.key)}
              className={`relative flex flex-col items-start gap-0.5 px-3.5 py-2 rounded-md border transition-colors ${
                isActive
                  ? 'border-[#C7D3E8]/40 bg-[#C7D3E8]/[0.08]'
                  : 'border-borderSubtle bg-white/[0.015] hover:border-borderMuted hover:bg-white/[0.03]'
              }`}
            >
              <span
                className={`font-mono text-[11px] font-semibold uppercase tracking-wider ${
                  isActive ? 'text-[#C7D3E8]' : 'text-textSecondary'
                }`}
              >
                {sl.label}
              </span>
              <span className={`font-mono text-[9px] tnum ${isActive ? 'text-[#C7D3E8]/60' : 'text-textMuted'}`}>
                {exp.dte === 0 ? '0DTE' : `${exp.dte}DTE`} · {exp.label}
              </span>
              {isActive && <span className="absolute left-2 right-2 -bottom-px h-px bg-[#C7D3E8]/70" />}
            </button>
          );
        })}
      </div>

      {/* Scanner tabs with counts — only the lenses this tenor sells */}
      <div className="flex items-center gap-1 flex-wrap">
        {SCANNERS.filter(s => isScannerEligible(s.key, sleeve)).map(s => {
          const isActive = scanner === s.key;
          const count = scannerCounts[s.key] ?? 0;
          return (
            <button
              key={s.key}
              onClick={() => handleScanner(s.key)}
              className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-mono text-[11px] uppercase tracking-wider transition-colors ${
                isActive
                  ? 'text-[#0a0a0a] font-semibold'
                  : 'text-textMuted font-medium hover:text-textSecondary hover:bg-white/[0.03]'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="compass-scanner-pill"
                  className="absolute inset-0 rounded-md holo-bg"
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              <span className="relative z-10">{s.label}</span>
              <span className={`relative z-10 font-mono text-[10px] tnum ${isActive ? 'text-[#0a0a0a]/70' : 'text-textMuted/60'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Ticker filter + blurb row (browse mode only) */}
      {!inReviewMode && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-[10px] text-textMuted uppercase tracking-wider">{activeScanner.blurb}</span>
          {/* The honesty line: how many the board shows against how many the
              sweep found — the bar itself is engine-internal (Noah, 2026-08-16). */}
          <span className="ml-auto font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">
            Showing {rankedSetups.length} of {data.totalFound} that cleared the bar
          </span>
          <div className="relative" ref={tickerMenuRef}>
            <button
              onClick={() => setShowTickerDropdown(prev => !prev)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border font-mono text-[10px] uppercase tracking-wider transition-colors ${
                tickerFilter
                  ? 'border-select/40 bg-select/[0.06] text-select'
                  : 'border-borderSubtle bg-white/[0.02] text-textMuted hover:text-textSecondary'
              }`}
            >
              <Filter className="w-3 h-3" />
              {tickerFilter ?? 'Filter by Ticker'}
            </button>
            {showTickerDropdown && (
              <div className="absolute right-0 top-full mt-1 z-20 min-w-[140px] border border-borderSubtle bg-panel rounded-md shadow-lg overflow-hidden animate-slide-in">
                <button
                  onClick={() => { setTickerFilter(null); setShowTickerDropdown(false); }}
                  className={`w-full text-left px-3 py-2 font-mono text-[11px] transition-colors ${
                    !tickerFilter ? 'text-select bg-select/[0.06]' : 'text-textSecondary hover:bg-white/[0.03]'
                  }`}
                >
                  All Tickers
                </button>
                {feedTickers.map(t => (
                  <button
                    key={t}
                    onClick={() => { setTickerFilter(t); setShowTickerDropdown(false); }}
                    className={`w-full text-left px-3 py-2 font-mono text-[11px] transition-colors ${
                      tickerFilter === t ? 'text-select bg-select/[0.06]' : 'text-textSecondary hover:bg-white/[0.03]'
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
          <span className="font-mono text-[10px] text-textMuted uppercase tracking-wider">{activeScanner.blurb}</span>
        </div>
      )}

      {/* One board for every sleeve (dossiers retired, D1 2026-08-04). ONE
          analysis page for every open (Noah + partner, 2026-08-09): the
          campaign map is the default full analysis on EVERY scanner and
          sleeve — it carries the most information, and it now carries the
          contract facts + premium track too. The old hold-based split
          (SignalMonitor for scalps/0DTE) is retired. */}
      {inReviewMode && monitoredSetup ? (
        // Keyed CSS soft-in (no exit-wait) — swaps stay smooth and can never
        // wedge behind an unfinished exit animation. Slow clock: this is a
        // view-level swap (Noah, 2026-08-08).
        <div
          key={`campaign-${monitorTarget?.ticker}-${monitorTarget?.strike}-${monitorTarget?.right}`}
          className="animate-soft-in-slow"
        >
          <CampaignAnalysis
            setup={monitoredSetup}
            revision={revision}
            spot={monitorSpot}
            scanner={scanner}
            sleeve={sleeve}
            gradedAt={monitorTarget?.gradedAt}
            onBack={handleBack}
            backLabel={backLabel}
            home={trail.length > 1 ? { label: 'Board', onClick: handleBoard } : undefined}
            onOpenContract={handleRetarget}
          />
        </div>
      ) : (
        // Board + impact rail (Noah, 2026-08-17: the page-wide leaderboard
        // was "taking up too much space" — it's a side section now, clearly
        // narrower than the setups). The BOARD is keyed CSS soft-in, NOT
        // AnimatePresence: an exit-wait here wedges behind a frozen tick and
        // strands the old view under the new header (house rule since the
        // print-modal incident). The preview rail is GONE (2026-08-17): the
        // card moved to the campaign page, a click on a setup goes straight
        // there.
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <div className="xl:col-span-8 min-w-0">
          <div
            key={`feed-${scanner}-${sleeve}`}
            /* Slow variant: a whole BOARD arriving in 0.2s reads as a snap —
               view-level swaps get the longer clock (Noah, 2026-08-10). */
            className="animate-soft-in-slow"
          >
            <SetupScanBoard
              setups={rankedSetups}
              title={`${activeScanner.label} · ${SLEEVES.find(s => s.key === sleeve)?.label ?? ''}`}
              sweepAt={lastScanAt || null}
              selectedId={selectedId}
              onSelect={handleSelect}
              onAnalysis={handleReviewSetup}
              expiryChip={activeSleeveExp.label}
            />
          </div>
        </div>

        {/* The rail sits OUTSIDE the feed's keyed swap on purpose — it holds
            still while the board fades through scanner switches. It ADOPTS
            the board's height (absolute-inset, the preview-rail pattern) so
            both columns end on the same line, rows scrolling inside. */}
        <div className="xl:col-span-4 min-w-0 flex flex-col">
          <div className="flex-1 flex flex-col xl:relative">
            <div className="xl:absolute xl:inset-0 flex flex-col min-h-0">
              <ImpactLeaderboard
                ticker={railSnapshot?.ticker ?? data.chain.ticker}
                note={railNote}
                rows={railRows}
                onOpen={handleOpenContract}
              />
            </div>
          </div>
        </div>
      </div>
      )}
        </>
      )}
      </div>
    </>
  );
};

export default Compass;
