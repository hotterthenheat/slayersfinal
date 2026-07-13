import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMarketData } from '../context/MarketDataContext';
import { buildGexView, pulseMatrix } from '../data/gex';
import { buildCommandView, makeAutoNote } from '../data/command';
import PageHeader from '../components/ui/PageHeader';
import TickerSearch from '../components/ui/TickerSearch';
import SegmentedControl from '../components/ui/SegmentedControl';
import Panel from '../components/ui/Panel';
import StrikeChart from '../components/gex/StrikeChart';
import GexMatrix from '../components/gex/GexMatrix';
import MiniPane from '../components/gex/MiniPane';
import StrikeLadder from '../components/gex/StrikeLadder';
import PressureMatrix from '../components/gex/PressureMatrix';
import KeyLevelsRail from '../components/gex/KeyLevelsRail';
import MarketNotes from '../components/gex/MarketNotes';
import { TIMEFRAMES, type Timeframe } from '../data/timeframe';
import type { MarketSnapshot } from '../types/market';
import type { GexMetric, MarketNote, OverlayMode, StrikeRange } from '../types/gex';

/** Pressure / order-flow / notes sweep on the scan tier; chart + stats stay live. */
const SCAN_INTERVAL_MS = 10_000;
const MAX_NOTES = 12;

const METRIC_OPTIONS = [
  { value: 'GEX', label: 'GEX' },
  { value: 'VEX', label: 'VEX' },
  { value: 'GEX+VEX', label: 'GEX+VEX' },
] as const;

const OVERLAY_OPTIONS = [
  { value: 'NODES', label: 'Nodes' },
  { value: 'LEVELS', label: 'Levels' },
  { value: 'BOTH', label: 'Both' },
] as const;

const RANGE_OPTIONS = [
  { value: '10', label: '±10' },
  { value: '20', label: '±20' },
] as const;

const TIMEFRAME_OPTIONS = TIMEFRAMES.map(t => ({ value: t.value, label: t.label }));

/** How long a clicked level stays flashed on the chart */
const FOCUS_MS = 6_000;

/** The daily driver — the synthesis surface every engine's output points at. */
const Pulse = () => {
  const { activeTicker, marketData, changeTicker } = useMarketData();
  const location = useLocation();
  const [metric, setMetric] = useState<GexMetric>('GEX');
  const [overlay, setOverlay] = useState<OverlayMode>('BOTH');
  const [rangeKey, setRangeKey] = useState<'10' | '20'>('10');
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');
  const [notes, setNotes] = useState<MarketNote[]>([]);

  // Transient chart focus — set by level/strike clicks here or arriving via
  // "view on chart" navigation from other GEX pages
  const [focusPrice, setFocusPrice] = useState<number | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashFocus = useCallback((price: number) => {
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    setFocusPrice(price);
    focusTimerRef.current = setTimeout(() => setFocusPrice(null), FOCUS_MS);
  }, []);

  useEffect(() => {
    const incoming = (location.state as { focusPrice?: number } | null)?.focusPrice;
    if (typeof incoming === 'number') {
      flashFocus(incoming);
      window.history.replaceState({}, ''); // consume so refresh doesn't re-flash
    }
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const revRef = useRef(0);
  const revision = useMemo(() => ++revRef.current, [marketData]);

  // Scan tier: levels, heatmap, flow board, pressure matrix, order flow, notes.
  // Candles stay live via `revision`; structural levels move every 10s and the
  // chart tweens them, so nothing on screen trembles per tick.
  const [scanSnapshot, setScanSnapshot] = useState<MarketSnapshot | null>(null);
  const [lastScanAt, setLastScanAt] = useState('');
  const scanRef = useRef<MarketSnapshot | null>(null);
  const lastScanTimeRef = useRef(0);

  useEffect(() => {
    if (!marketData) return;
    const now = Date.now();
    const due =
      !scanRef.current ||
      now - lastScanTimeRef.current >= SCAN_INTERVAL_MS ||
      scanRef.current.ticker !== marketData.ticker;
    if (due) {
      scanRef.current = marketData;
      lastScanTimeRef.current = now;
      setScanSnapshot(marketData);
      setLastScanAt(new Date(now).toLocaleTimeString('en-GB'));
    }
  }, [marketData]);

  const view = useMemo(
    () => (scanSnapshot ? buildGexView(scanSnapshot, metric, Number(rangeKey) as StrikeRange) : null),
    [scanSnapshot, metric, rangeKey]
  );

  const cmd = useMemo(() => (scanSnapshot ? buildCommandView(scanSnapshot) : null), [scanSnapshot]);

  // 1s heatmap pulse — values breathe between scans; window + scale stay put
  const [pulseTick, setPulseTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPulseTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const liveMatrix = useMemo(() => (view ? pulseMatrix(view.matrix, pulseTick) : null), [view, pulseTick]);

  // One engine observation per scan; skip repeats of the latest auto note
  useEffect(() => {
    if (!scanSnapshot || !cmd) return;
    const price = (kind: string) => cmd.keyLevels.find(l => l.kind === kind)?.price ?? scanSnapshot.spot;
    const text = makeAutoNote(
      scanSnapshot,
      {
        spot: scanSnapshot.spot,
        callWall: price('call-wall'),
        putWall: price('put-wall'),
        flip: price('flip'),
        king: price('king'),
      },
      cmd.bias
    );
    if (!text) return;
    setNotes(prev => {
      const lastAuto = prev.find(n => !n.manual);
      if (lastAuto?.text === text) return prev;
      return [{ time: new Date().toLocaleTimeString('en-GB'), text }, ...prev].slice(0, MAX_NOTES);
    });
  }, [cmd, scanSnapshot]);

  const addManualNote = (text: string) =>
    setNotes(prev => [{ time: new Date().toLocaleTimeString('en-GB'), text, manual: true }, ...prev].slice(0, MAX_NOTES));

  if (!view || !marketData || !cmd) {
    return (
      <Panel className="h-64" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">
          Awaiting feed initialization…
        </span>
      </Panel>
    );
  }

  const { levels, matrix, board } = view;
  const maxLevelPressure = cmd.keyLevels.reduce((a, l) => Math.max(a, l.pressure), 1);

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Pulse']}
        title="Pulse"
        subtitle="Chart, dealer pressure, order flow & key levels"
        actions={<TickerSearch value={activeTicker} onChange={changeTicker} />}
      />

      {/* Page-level controls — metric + range drive the matrix and board too;
          overlay + timeframe are chart-scoped. One wrapping toolbar so nothing
          clips on narrow screens. */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <SegmentedControl ariaLabel="Metric" options={METRIC_OPTIONS} value={metric} onChange={setMetric} />
        <SegmentedControl ariaLabel="Strike range" options={RANGE_OPTIONS} value={rangeKey} onChange={setRangeKey} />
        <span className="w-px h-5 bg-borderSubtle hidden sm:block" aria-hidden />
        <SegmentedControl ariaLabel="Overlay" options={OVERLAY_OPTIONS} value={overlay} onChange={setOverlay} />
        <SegmentedControl ariaLabel="Timeframe" options={TIMEFRAME_OPTIONS} value={timeframe} onChange={setTimeframe} />
        <span className="ml-auto font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">
          scan {lastScanAt} · 10s
        </span>
      </div>

      {/* Chart + strike×expiry matrix */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <Panel
          title={`${activeTicker} — ${metric} nodes + levels`}
          subtitle="live tick feed"
          className="xl:col-span-7 w-full"
          bodyClassName="flex flex-col"
        >
          <StrikeChart
            ticker={activeTicker}
            revision={revision}
            levels={levels}
            overlay={overlay}
            timeframe={timeframe}
            height={470}
            focusPrice={focusPrice}
          />
        </Panel>

        <Panel
          title="Strike × Expiry"
          subtitle={`${metric} per strike per expiration · live 1s`}
          flush
          className="xl:col-span-5 w-full"
          bodyClassName="p-2 h-[530px]"
        >
          <GexMatrix data={liveMatrix ?? matrix} spot={levels.spot} />
        </Panel>
      </div>

      {/* Pressure matrix + levels/notes rail (order flow lives on as a Workspace widget) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <Panel
          title="Dealer Pressure Matrix"
          subtitle="pressure · ΔOI · volume by strike"
          flush
          className="xl:col-span-8 min-w-0"
          bodyClassName="flex flex-col h-[440px]"
        >
          <PressureMatrix
            ticker={activeTicker}
            spot={cmd.keyLevels.find(l => l.kind === 'spot')?.price ?? levels.spot}
            rows={cmd.pressure}
            maxAbs={cmd.pressureMaxAbs}
            onSelectStrike={flashFocus}
          />
        </Panel>

        <div className="xl:col-span-4 min-w-0 flex flex-col gap-4">
          <Panel title="Key Levels" subtitle="distance · pressure · click to flash" flush className="w-full">
            <KeyLevelsRail rows={cmd.keyLevels} maxPressure={maxLevelPressure} onSelect={flashFocus} />
          </Panel>
          <Panel title="Market Notes" subtitle="scan observations" className="w-full flex-1 min-h-0" bodyClassName="h-full min-h-0">
            <MarketNotes notes={notes} onAddNote={addManualNote} />
          </Panel>
        </div>
      </div>

      {/* Multi-ticker flow board */}
      <Panel
        title="Multi-Ticker Flow Board"
        subtitle="dark pool prints · king nodes · net gex ladders"
        flush
        className="w-full"
        bodyClassName="p-3"
      >
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch">
          <div className="xl:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-3 content-start">
            {board.map(item => (
              <MiniPane
                key={item.ticker}
                ticker={item.ticker}
                spot={item.spot}
                changePercent={item.changePercent}
                prints={item.prints}
                revision={revision}
              />
            ))}
          </div>
          <div className="xl:col-span-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            {board.map(item => (
              <StrikeLadder key={item.ticker} board={item} />
            ))}
          </div>
        </div>
      </Panel>
    </>
  );
};

export default Pulse;
