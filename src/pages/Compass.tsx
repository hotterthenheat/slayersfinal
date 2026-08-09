import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Filter, History } from 'lucide-react';
import { useMarketData } from '../context/MarketDataContext';
import type { MarketSnapshot } from '../types/market';
import Simulator from '../core/simulator';
import { buildCompass, makeSetup, scannerFloor, sleeveExpiry } from '../data/compass';
import {
  SCANNERS,
  SLEEVES,
  type OptionRight,
  type ScannerKey,
  type Setup,
  type SleeveKey,
} from '../types/compass';
import {
  COMPASS_MODES,
  MODE_OPTIONS,
  SCANNER_KEYS,
  type CompassMode,
} from './compassViews';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import ContractChain, { type ChainSelection } from '../components/compass/ContractChain';
import SignalMonitor from '../components/compass/SignalMonitor';
import ImpactLeaderboard from '../components/compass/ImpactLeaderboard';
import ContractWeigher from '../components/compass/ContractWeigher';
import LottoBoard from '../components/compass/LottoBoard';
import SetupScanBoard, { type ScanLayout } from '../components/compass/SetupScanBoard';
import SetupCompare from '../components/compass/SetupCompare';
import Freshness from '../components/compass/Freshness';
import { SLEEVE_INK } from '../components/compass/sleeveInk';
import { sweepClock } from '../components/compass/sweepClock';
import { expiryRangeLabel, expiryRead } from '../components/compass/setupHorizon';
import type { Horizon } from '../core/contractScore';
import SegmentedControl from '../components/ui/SegmentedControl';
import { SkeletonRows } from '../components/ui/Skeleton';
import { DUR, EASE, PILL } from '../lib/motion';


const SETUPS_SUBTITLE = 'Setups ranked by trend + dealer-flow conviction. A read, never an order.';


/** The scanner sweeps on its own cadence — the feed must not vibrate with every price tick. */
const SCAN_INTERVAL_MS = 10_000;

/* One membership test per vocabulary, used by every entry into this page. */
const SLEEVE_KEYS = new Set<string>(SLEEVES.map(s => s.key));

const isScannerKey = (v: unknown): v is ScannerKey => typeof v === 'string' && SCANNER_KEYS.has(v);
const isCompassMode = (v: unknown): v is CompassMode => typeof v === 'string' && COMPASS_MODES.has(v);
const isSleeveKey = (v: unknown): v is SleeveKey => typeof v === 'string' && SLEEVE_KEYS.has(v);

/**
 * A contract the pane is pointed at, carrying the row it was opened FROM.
 *
 * The identity alone is not enough, and that is the whole of a defect that read
 * as an engine bug. The board grades a scanned name off the scan universe's
 * price; makeSetup grades off the simulator's, and the click itself is what
 * registers the name — ensureTicker seeds it at its flat base, which is a
 * different number. Rebuilding the setup from ticker+strike+right on the far
 * side of that registration had one row print 97/ENTER on the board and
 * 51/EXIT in the panel a click later, with nothing but the click in between.
 * So the graded row travels with the click, dated by the sweep that produced
 * it. `setup` is null only for a contract that never had a board row at all.
 */
interface MonitorTarget {
  ticker: string;
  strike: number;
  right: OptionRight;
  setup: Setup | null;
  /** ms of the sweep that graded it; 0 when it did not come off a sweep. */
  sweptAt: number;
}

/** A board row, carried with its grade and the sweep that produced it. */
const targetOf = (setup: Setup, sweptAt: number): MonitorTarget => ({
  ticker: setup.ticker,
  strike: setup.strike,
  right: setup.right,
  setup,
  sweptAt,
});

/** What a pane renders, and whether the latest sweep still ranks it. */
interface OpenRow {
  setup: Setup;
  /** The sweep it was carried in from, set only once the board has dropped it. */
  heldFrom: number | null;
}

/**
 * A row the latest sweep no longer carries.
 *
 * Opening a scanned name registers it with the simulator, and the next sweep
 * ranks it at the desk's price rather than the scan walk's — six names opened
 * in a row cost five of them their seats. Holding the row the user opened is
 * the right call, because the alternative is the pane re-grading itself
 * underneath them, but a held grade must never read as this sweep's.
 */
const HeldFromSweep = ({ from, now }: { from: number; now: string }) => (
  <div className="flex items-start gap-2 border-l-2 border-warn/60 pl-3 py-1">
    <History className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" />
    <p className="font-mono text-label text-textSecondary leading-relaxed">
      <span className="text-warn font-semibold uppercase tracking-wider">Held </span>
      from the {sweepClock(from)} sweep{now ? `. The ${now} sweep does not rank this contract` : ''}, so the grade here
      is the one it was opened with rather than a fresh read.
    </p>
  </div>
);

/**
 * `?view=` is this whole surface in one param.
 *
 * /compass is a single route and the pane used to live in component state, so
 * nothing here could be bookmarked or shared. One param covers all of it: the
 * three panes, and the six scanner presets, since a preset IS a view of the
 * setups pane rather than a setting inside it.
 *
 * A view switch REPLACES the history entry rather than pushing one, so Back
 * does not walk back through the panes — it leaves /compass for wherever the
 * user came from. That is the intent rather than a shortfall: changing pane is
 * a change of view on one screen, and pushing an entry per tab click would
 * stack six of them between a user and the page they arrived from. What the
 * param buys is a URL that survives a reload, a paste, and a Back that returns
 * to /compass from somewhere else.
 *
 * Backward compatible on purpose. No param means exactly what it meant before
 * (Setups / Top Setups), an unreadable value falls back the same way, and the
 * URL is only written once the user actually moves — so an existing /compass
 * bookmark is left alone until it is used.
 *
 * The HORIZON is a second param rather than a second vocabulary in the first
 * one. `?view=` names the pane or the style exactly as it always did, and
 * `?sleeve=` names the clock; a link written before sleeves existed still opens
 * the style it names, on the same-session sleeve it was written against. Folding
 * both axes into one param would have meant either thirty new values or breaking
 * every link already in the wild.
 */
interface ViewRead {
  mode: CompassMode;
  scanner?: ScannerKey;
}

function readView(raw: string | null): ViewRead | null {
  if (!raw) return null;
  if (isCompassMode(raw)) return { mode: raw };
  if (isScannerKey(raw)) return { mode: 'setups', scanner: raw };
  return null;
}

const Compass = () => {
  const { marketData, changeTicker } = useMarketData();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const landedOn = readView(params.get('view'));
  const landedSleeve = params.get('sleeve');
  const [scanner, setScanner] = useState<ScannerKey>(landedOn?.scanner ?? 'top-setups');
  const [sleeve, setSleeve] = useState<SleeveKey>(isSleeveKey(landedSleeve) ? landedSleeve : 'odte');
  const [mode, setMode] = useState<CompassMode>(landedOn?.mode ?? 'setups');
  const [weigherHorizon, setWeigherHorizon] = useState<Horizon | undefined>(undefined);

  // Phase 1 (browse): selected drives the compare card
  // Phase 2 (review): monitorTarget drives the SignalMonitor + ContractChain
  const [selected, setSelected] = useState<MonitorTarget | null>(null);
  const [monitorTarget, setMonitorTarget] = useState<MonitorTarget | null>(null);
  const [chainSel, setChainSel] = useState<ChainSelection | null>(null);

  // Ticker filter for browse mode — null means show all tickers
  const [tickerFilter, setTickerFilter] = useState<string | null>(null);
  const [showTickerDropdown, setShowTickerDropdown] = useState(false);

  // Scan presentation: card grid vs sortable table. Two densities of one list.
  const [scanLayout, setScanLayout] = useState<ScanLayout>('cards');
  /* Which page of the card grid. It lives here rather than in the board because
     review mode unmounts the board — see the note on SetupScanBoardProps.page. */
  const [scanPage, setScanPage] = useState(0);

  const inReviewMode = monitorTarget !== null;

  const writeView = (value: string, nextSleeve?: SleeveKey) => {
    const next = new URLSearchParams(params);
    next.set('view', value);
    const s = nextSleeve ?? sleeve;
    // Same-session is the default, so it stays out of the URL — a shared link
    // only carries the horizon when it is not the one you would have got anyway.
    if (s === 'odte') next.delete('sleeve');
    else next.set('sleeve', s);
    setParams(next, { replace: true });
  };

  // The URL is the source of truth once it carries a view, so a reload and a
  // pasted link both land where they say they will.
  useEffect(() => {
    const raw = params.get('sleeve');
    setSleeve(isSleeveKey(raw) ? raw : 'odte');
    const view = readView(params.get('view'));
    if (!view) return;
    setMode(view.mode);
    if (view.scanner) setScanner(view.scanner);
  }, [params]);

  /* Deep links: from Tracker (land in review mode on the tracked setup) or
     from Stocks ("weigh this name's contracts"). Router state
     still wins over the param — /lotto redirects through it.

     Every value is read through the same membership tests the ?view= path
     uses. Router state is typed at the sender and was unchecked here, so one
     vocabulary had two behaviours depending on which door it came through: a
     retired preset in the URL fell back to Top Setups, while the same string in
     state was passed straight into the tab strip, and an unknown mode reached
     modeMeta as an undefined lookup and took the page down with it. */
  useEffect(() => {
    const state = location.state as {
      monitor?: { ticker?: string; strike?: number; right?: string; scanner?: string };
      weigh?: { ticker?: string; horizon?: Horizon };
      compassMode?: string;
    } | null;
    const incoming = state?.monitor;
    const weigh = state?.weigh;
    const landing = state?.compassMode;
    if (incoming?.ticker && typeof incoming.strike === 'number' && (incoming.right === 'C' || incoming.right === 'P')) {
      const preset = isScannerKey(incoming.scanner) ? incoming.scanner : 'top-setups';
      setScanner(preset);
      changeTicker(incoming.ticker);
      // A deep-linked contract never had a board row, so it carries no grade.
      setMonitorTarget({
        ticker: incoming.ticker,
        strike: incoming.strike,
        right: incoming.right,
        setup: null,
        sweptAt: 0,
      });
      window.history.replaceState({}, ''); // consume so refresh doesn't re-enter
      writeView(preset);
    } else if (weigh?.ticker) {
      changeTicker(weigh.ticker);
      setMode('weigher');
      if (weigh.horizon) setWeigherHorizon(weigh.horizon);
      window.history.replaceState({}, '');
      writeView('weigher');
    } else if (isCompassMode(landing)) {
      // Landed from the /lotto redirect (or a palette deep-link). Publishing the
      // mode to the URL is what makes that landing bookmarkable in turn.
      setMode(landing);
      window.history.replaceState({}, '');
      writeView(landing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- two-tier cadence -----------------------------------------------------
  // Live tier (every tick): prices, monitor, contract chain.
  // Scan tier (every SCAN_INTERVAL_MS): setups feed, counts, impact leaderboard.
  // The scanner "sweeps" on its own clock so the feed doesn't churn with noise.
  const [scanSnapshot, setScanSnapshot] = useState<MarketSnapshot | null>(null);
  const [scanAt, setScanAt] = useState(0);
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
      setScanAt(now);
    }
  }, [marketData]);

  const scanClock = scanAt ? sweepClock(scanAt) : '';

  /*
    Stable identities for the two props that were undoing SetupScanBoard's memo.

    The board is wrapped in React.memo precisely so the scan tier does not
    re-render on the live tier's 1.5s tick. An inline arrow and an inline
    <Freshness/> element are both new objects on every one of those ticks, and
    memo's shallow compare sees two changed props — so up to 240 rows
    reconciled every 1.5 seconds to display data that only changes every 10.
    The boundary this whole two-clock design rests on was being defeated by two
    lines of JSX inside it.
  */
  const handleScanLayout = useCallback((next: ScanLayout) => {
    setScanLayout(next);
    setScanPage(0);
  }, []);
  const scanFreshness = useMemo(() => <Freshness kind="sweep" at={scanAt} />, [scanAt]);

  // Scan tier: feed groups, counts, impact — stable between sweeps
  const data = useMemo(
    () => (scanSnapshot ? buildCompass(scanSnapshot, scanner, { sleeve }) : null),
    [scanSnapshot, scanner, sleeve]
  );

  // Live tier: the contract chain tracks every tick (prices should breathe)
  const liveChain = useMemo(
    () => (marketData ? buildCompass(marketData, scanner, { sleeve }).chain : null),
    [marketData, scanner, sleeve]
  );

  /**
   * The sweep's own row for a contract, or null when this sweep does not carry
   * it. Keyed on ticker+strike+right rather than on the setup id, so a target
   * that arrived without a row can still find one. Touching a single group's
   * `setups` materialises that group and no other, which is why the engine
   * builds them on read.
   */
  const sweptRow = useCallback(
    (ticker: string, strike: number, right: OptionRight): Setup | null => {
      const group = data?.groups.find(g => g.ticker === ticker);
      return group?.setups.find(s => s.strike === strike && s.right === right) ?? null;
    },
    [data]
  );

  /**
   * What a target reads as, in order of authority.
   *
   * The sweep's own row first: it is the number the user clicked, and reading
   * it back out is what stops the panel disagreeing with the board it was
   * opened from. Then the row the click carried in, held and dated, for the
   * case where registering the name cost it its seat on the next sweep. Only a
   * contract that was never on the board at all is graded here — the Tracker
   * deep-link and a strike picked off the contract chain, both of which are
   * evaluations of a contract the user already has rather than a rank.
   */
  const openRow = useCallback(
    (target: MonitorTarget): OpenRow => {
      const onBoard = sweptRow(target.ticker, target.strike, target.right);
      if (onBoard) return { setup: onBoard, heldFrom: null };
      if (target.setup) return { setup: target.setup, heldFrom: target.sweptAt || null };
      Simulator.ensureTicker(target.ticker);
      const cfg = Simulator.TICKERS[target.ticker];
      return {
        // The SLEEVE has to travel here too. This branch grades a contract that
        // was never on the board — a Tracker deep-link, or a strike picked off
        // the chain — and without it that contract would be priced on the
        // default same-session clock while the chain beside it quotes the
        // sleeve the user is actually on. Exactly the disagreement this pass
        // exists to remove, one call site further down.
        setup: makeSetup(
          target.ticker,
          cfg.currentPrice,
          target.strike,
          target.right,
          scanner,
          cfg.iv,
          undefined,
          sleeve
        ),
        heldFrom: null,
      };
    },
    [sweptRow, scanner, sleeve]
  );

  const monitored = useMemo(
    () => (monitorTarget ? openRow(monitorTarget) : null),
    // marketData is a re-tick trigger for the graded-here branch, which reads
    // the desk's own price from Simulator; the two board branches move on the
    // sweep and sit out the tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monitorTarget, openRow, marketData]
  );

  // The compare card resolves the same way. Its subject is always a board row,
  // so it never reaches the graded-here branch and never needs the tick.
  const selectedRow = useMemo(() => (selected ? openRow(selected) : null), [selected, openRow]);

  // Filtered groups for browse mode — ticker universe only. (The lifecycle-state
  // filter was removed: it segmented the feed by triggered/invalidated with
  // colours that collided with market direction, and added little over the rank.)
  const filteredGroups = useMemo(() => {
    if (!data) return [];
    return tickerFilter ? data.groups.filter(g => g.ticker === tickerFilter) : data.groups;
  }, [data, tickerFilter]);

  /* One flat, globally ranked list feeds both densities. A group is a
     contiguous run in the engine's output, so left alone the #3 contract on a
     strong name renders above the #1 of a weaker one, and "the best setups in
     the market" has to mean the best regardless of whose ticker they belong to.
     Measured on the shipped field, the raw grouped order inverts 18.5% of pairs
     against the sweep's own ranking.

     The key is `rank`, the continuous quantity the sweep itself sorts on, and
     that is the only key that works. It used to be `score`, which is a display
     rounding of that same rank (rankOf and displayScore, data/compass.ts) —
     sixteen values above a floor of 84, ten of them actually occupied, doing the
     work of 240 rows. Everything inside a bucket was a tie the comparator could
     not break, so the order fell to whatever arrived first: measured, 230 of the
     239 adjacent pairs on a full board share a score.
     Two explicit tiebreaks were tried in its place and both measured
     WORSE against the rank recovered from prescreenRank: moneyness took pairwise
     inversions from 2.1% to 4.4%, distance of |delta| from the money to 3.9%.
     The jitter separating two candidates inside one score bucket is ±1.5 points,
     wider than the bucket itself, so inside a bucket nothing short of the rank
     predicts the rank. Sorting on it is a total order that does not depend on
     arrival at all, which setupRank.test.ts pins by shuffling the input. */
  const rankedSetups = useMemo(
    () => filteredGroups.flatMap(g => g.setups).sort((a, b) => b.rank - a.rank),
    [filteredGroups]
  );

  /* Per-tab count AND the expiry the preset actually selects.
     "Quick Scalp for what — 0DTE, 1DTE?" is a fair question and the tab strip
     had no answer, because the horizon lived in the engine profile and no type
     carried it out. Four of the six presets are same-day and two are next-day,
     so a user who assumes the strip is uniform is wrong about a third of it.
     The engine answers directly through scannerExpiry, rather than a second copy
     of that table living here where it could drift.

     The count is `totalFound` — what the preset's score bar actually admits
     across the whole field. It used to be `shown`, which is a row cap: against
     a field of nine thousand candidates every preset but the thinnest saturates
     at it, so six tabs advertised one number and the strip discriminated
     nothing. `shown` is still worth knowing and is now on the tab's hover, said
     next to the bar that produced the count. Neither number touches `groups`,
     so five of the six sweeps stay unmaterialised the way the engine intends. */
  const scannerMeta = useMemo(() => {
    const meta = {} as Record<ScannerKey, { found: number; shown: number; expiry: string }>;
    if (!scanSnapshot) return meta;
    const expiry = sleeveExpiry(sleeve);
    for (const s of SCANNERS) {
      const built = s.key === scanner && data ? data : buildCompass(scanSnapshot, s.key, { sleeve });
      meta[s.key] = { found: built.totalFound, shown: built.shown, expiry };
    }
    return meta;
  }, [scanSnapshot, scanner, sleeve, data]);

  // Collect unique tickers across the feed for the filter dropdown
  const feedTickers = useMemo(() => {
    if (!data) return [];
    return data.groups.map(g => g.ticker);
  }, [data]);

  const activeScanner = SCANNERS.find(s => s.key === scanner)!;
  const activeFloor = scannerFloor(scanner);
  /* The open pane labels itself from the contracts on screen — free, since they
     are already built — and falls back to the preset's own stamp. If a preset
     ever spans two expiries, the pane the user is looking at says so. */
  const activeExpiry = useMemo(
    () => expiryRangeLabel(rankedSetups.map(s => s.expiry)) || scannerMeta[scanner]?.expiry || '',
    [rankedSetups, scannerMeta, scanner]
  );

  const handleSleeve = (next: SleeveKey) => {
    setSleeve(next);
    setScanPage(0);
    setMonitorTarget(null);
    setSelected(null);
    setChainSel(null);
    setTickerFilter(null);
    writeView(scanner, next);
  };

  const handleScanner = (next: ScannerKey) => {
    setScanner(next);
    setScanPage(0);
    setMonitorTarget(null);
    setSelected(null);
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
     is not in any of them is work nobody asked for. The sweep time comes off a
     ref for the same reason — it moves every 10s and this callback must not. */
  const handleReviewSetup = useCallback(
    (setup: Setup) => {
      /* Follow the contract's underlying. The chain beside the monitor is built
         from the ACTIVE ticker's snapshot, so studying a setup on a name the
         desk was not pointed at used to put SPY's ladder next to it. Harmless
         when the scan was four names; a straight lie now the field is five
         hundred. The Tracker deep-link has always switched the ticker on the
         way in — this is the in-page path doing the same thing.

         Switching is also what registers the name, which is exactly why the
         graded row goes with it rather than being rebuilt on the other side. */
      changeTicker(setup.ticker);
      setMonitorTarget(targetOf(setup, lastScanTimeRef.current));
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
    // A strike picked off the chain was never ranked, so there is no graded row
    // to carry and the panel builds one for it.
    setMonitorTarget({ ticker: sel.ticker, strike: sel.strike, right: sel.right, setup: null, sweptAt: 0 });
  };

  // When user clicks a setup in the scan, show it in the compare card
  const handleSelectSetup = useCallback((setup: Setup) => {
    setSelected(targetOf(setup, lastScanTimeRef.current));
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
      subtitle: 'Same-day speculation. Far-OTM contracts graded on whether a one-sigma move covers the breakeven. High variance by design.',
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
      subtitle={
        monitorTarget
          ? /* Opening a setup calls changeTicker so the chain beside the monitor
               prices the right underlying — correct, and previously invisible: a
               global, cross-desk state change happened as a silent side effect of
               an in-page click, and did not unwind on the way back. Saying so is
               cheaper and less surprising than reverting it. */
            `Watching one setup as it moves. The desk is pointed at ${monitorTarget.ticker} so the chain prices this contract's underlying.`
          : 'Watching one setup as it moves. The card that graded it now tracks whether the structure under it holds.'
      }
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
  const effectiveSelected: OpenRow | null =
    selectedRow ?? (rankedSetups[0] ? { setup: rankedSetups[0], heldFrom: null } : null);

  return (
    <>
      {inReviewMode && mode === 'setups' ? reviewHeader : browseHeader}

      {mode === 'weigher' ? (
        <ContractWeigher snapshot={marketData} initialHorizon={weigherHorizon} />
      ) : mode === 'lotto' ? (
        <LottoBoard snapshot={marketData} />
      ) : (
        <>

      {/*
        HORIZON first. This is the question a trader answers before any other,
        and until now the desk never asked it: every preset in the strip was
        same-session or next-day, so "where are the weeklies, the swings, the
        LEAPS" had no answer on the page. Five sleeves, each carrying its own
        colour and the expiry it resolves to.

        The strip scrolls rather than wraps below sm. Wrapping put three rows of
        chrome above the first card on a phone and pushed the board under the
        fold; a horizontal rail keeps the sleeve you are on visible and the rest
        one swipe away.
      */}
      <div
        role="tablist"
        aria-label="Contract horizon"
        className="flex items-stretch gap-1 overflow-x-auto sm:flex-wrap -mx-3 px-3 sm:mx-0 sm:px-0"
      >
        {SLEEVES.map(sl => {
          const isActive = sleeve === sl.key;
          const c = SLEEVE_INK[sl.key];
          return (
            <button
              key={sl.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => handleSleeve(sl.key)}
              title={sl.blurb}
              className={`relative shrink-0 text-left px-3 py-2 rounded-md transition-colors ${
                isActive ? c.activeBg : 'hover:bg-rowHover'
              }`}
            >
              <span
                className={`block font-mono text-label font-semibold uppercase tracking-wider ${
                  isActive ? c.text : 'text-textSecondary'
                }`}
              >
                {sl.label}
              </span>
              {/* textSecondary, not textMuted: #7d7d7d at 10px over the tab's
                  own colour wash measured under 4.5:1, and the expiry is the
                  half of the tab a user actually reads. */}
              <span className="block font-mono text-micro text-textSecondary tnum">
                {expiryRead(sleeveExpiry(sl.key)).chip}
              </span>
              {isActive && <span className={`absolute left-3 right-3 -bottom-px h-px ${c.rule}`} />}
            </button>
          );
        })}
      </div>

      {/* Style second — a LENS on the sleeve above, not a horizon of its own.
          Each states what its own bar admits, because six presets printing one
          capped number told a trader nothing about which is worth opening. */}
      {/* One scrolling row on a phone, the same treatment the sleeve strip
          above it gets. Wrapped, six presets took three rows at 390px, and with
          the sleeve strip added the first card began 555px into an 844px
          viewport — five stacked control rows before any data. */}
      <div className="flex items-center gap-1 overflow-x-auto sm:flex-wrap -mx-3 px-3 sm:mx-0 sm:px-0">
        {SCANNERS.map(s => {
          const isActive = scanner === s.key;
          const meta = scannerMeta[s.key];
          const floor = scannerFloor(s.key);
          return (
            <button
              key={s.key}
              onClick={() => handleScanner(s.key)}
              aria-pressed={isActive}
              title={
                meta
                  ? `${expiryRead(meta.expiry).sentence}. ${s.blurb}. ${meta.found.toLocaleString()} contracts scored ${floor}+ on the last sweep; the board shows the top ${meta.shown}.`
                  : s.blurb
              }
              /* shrink-0 and nowrap: in a scrolling row a flex child still
                 shrinks, so without them the labels wrapped inside their own
                 pills and the strip was three lines tall again by another
                 route. */
              className={`relative shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-mono text-label uppercase tracking-wider transition-colors ${
                isActive
                  ? 'text-ink font-semibold'
                  : 'text-textMuted font-medium hover:text-textSecondary hover:bg-rowHover'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="compass-scanner-pill"
                  className="absolute inset-0 rounded-md holo-bg"
                  transition={PILL}
                />
              )}
              <span className="relative z-10">{s.label}</span>
              <span className={`relative z-10 font-mono text-micro tnum ${isActive ? 'text-ink/70' : 'text-textMuted'}`}>
                {meta?.expiry ? `${meta.expiry} · ` : ''}
                {(meta?.found ?? 0).toLocaleString()}
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
          {/* Hidden on a phone: the sleeve tab above already prints the expiry
              and the active style already prints its own name, so on the
              narrowest screen this is two wrapped lines restating the two rows
              directly above it. Each style button's title keeps the full
              sentence one press away. */}
          <span className="hidden sm:inline font-mono text-label text-textMuted uppercase tracking-wider">
            {activeExpiry ? `${activeExpiry} · ` : ''}
            {activeScanner.blurb}
          </span>
          {/* The denominator names its own bar. Without it the All preset reads
              as broken: its floor is 8, the bottom of the 8 to 99 scale, so
              every contract the sweep prices clears it and the number never
              moves. That is the preset doing what its blurb promises, and it
              only looks like a stuck counter while the bar is unstated. */}
          <span
            className="ml-auto font-mono text-label text-textMuted uppercase tracking-widest tnum"
            title={`${activeScanner.label} admits any contract scoring ${activeFloor} or better on an 8 to 99 scale. ${data.totalFound.toLocaleString()} cleared it across the whole field this sweep; the board shows the top ${data.shown}.`}
          >
            Showing {rankedSetups.length} of {data.totalFound.toLocaleString()} scoring {activeFloor}+
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
                  onClick={() => { setTickerFilter(null); setScanPage(0); setShowTickerDropdown(false); }}
                  className={`w-full text-left px-3 py-2 font-mono text-label transition-colors ${
                    !tickerFilter ? 'text-select bg-select/[0.06]' : 'text-textSecondary hover:bg-rowHover'
                  }`}
                >
                  All Tickers
                </button>
                {feedTickers.map(t => (
                  <button
                    key={t}
                    onClick={() => { setTickerFilter(t); setScanPage(0); setShowTickerDropdown(false); }}
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
          {/* The grade on the monitor came off a sweep; the chain beside it is
              live. Both say so rather than leaving the reader to infer that two
              panels updating at different rates is a fault. */}
          <Freshness kind="sweep" at={scanAt} className="ml-auto" />
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
              {inReviewMode && monitored ? (
                <div className="flex flex-col gap-4">
                  {monitored.heldFrom !== null && <HeldFromSweep from={monitored.heldFrom} now={scanClock} />}
                  <SignalMonitor
                    setup={monitored.setup}
                    /* The sweep's spot for this name — the one the setup was
                       priced and invalidated against, same source the compare
                       pane takes. The chart below keeps the live buffer; it is
                       a price chart and belongs on the live tier. */
                    sweepSpot={data?.groups.find(g => g.ticker === monitored.setup.ticker)?.spot ?? 0}
                    onBack={handleBackToBrowse}
                  />
                </div>
              ) : (
                <SetupScanBoard
                  setups={rankedSetups}
                  totalFound={data.totalFound}
                  scannerLabel={activeScanner.label}
                  expiryLabel={activeExpiry}
                  layout={scanLayout}
                  onLayoutChange={handleScanLayout}
                  page={scanPage}
                  onPageChange={setScanPage}
                  freshness={scanFreshness}
                  selectedId={effectiveSelected?.setup.id ?? null}
                  onSelect={handleSelectSetup}
                  onStudy={handleReviewSetup}
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
                <ContractChain
                  data={liveChain}
                  selected={chainSel}
                  onSelect={handleChainSelect}
                  freshness={<Freshness kind="live" />}
                />
              ) : effectiveSelected ? (
                <div className="flex flex-col gap-3">
                  {effectiveSelected.heldFrom !== null && (
                    <HeldFromSweep from={effectiveSelected.heldFrom} now={scanClock} />
                  )}
                  <SetupCompare
                    setup={effectiveSelected.setup}
                    peers={rankedSetups}
                    /* The sweep's own spot for this name, not a fresher one:
                       it is what the setup beside it was priced against. */
                    spot={data?.groups.find(g => g.ticker === effectiveSelected.setup.ticker)?.spot ?? 0}
                    scanner={scanner}
                    onSelectPeer={handleSelectSetup}
                    onStudy={() => handleReviewSetup(effectiveSelected.setup)}
                  />
                </div>
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
