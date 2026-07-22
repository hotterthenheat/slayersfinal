import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, X } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildExposureProfile } from '../../data/exposure';
import { fmtUsd } from '../../data/gex';
import type { MarketSnapshot } from '../../types/market';
import type { ExposureExpiry } from '../../types/gex';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import AnimatedNumber from '../../components/ui/AnimatedNumber';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import type { Tone } from '../../components/ui/tones';
import ExposureMatrix from '../../components/gex/ExposureMatrix';
import PositioningMap from '../../components/gex/PositioningMap';
import ExposureInsight from '../../components/gex/ExposureInsight';
import ExposureLedger from './ExposureLedger';

/** Exposure sweeps on its own cadence — bars must not vibrate with every tick. */
const SCAN_INTERVAL_MS = 10_000;

const EXPIRY_OPTIONS = [
  { value: '0DTE', label: '0DTE' },
  { value: '1D', label: '1D' },
  { value: '2D', label: '2D' },
  { value: '5D', label: '5D' },
  { value: '7D', label: '7D' },
  { value: 'OPEX', label: 'OPEX' },
  { value: 'ALL', label: 'All' },
] as const;

const WINDOW_OPTIONS = [
  { value: '10', label: '±10' },
  { value: '15', label: '±15' },
] as const;

const ExposureProfile = () => {
  const { marketData } = useMarketData();
  const navigate = useNavigate();
  const [expiry, setExpiry] = useState<ExposureExpiry>('0DTE');
  const [windowHalf, setWindowHalf] = useState<'10' | '15'>('10');

  // Strike sync across matrix + map: hover mirrors, click pins (cyan)
  const [hoverStrike, setHoverStrike] = useState<number | null>(null);
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const toggleStrike = (s: number) => setSelectedStrike(prev => (prev === s ? null : s));

  // Scan-tier snapshot: the profile sweeps every SCAN_INTERVAL_MS (ticker switch is immediate)
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

  const data = useMemo(
    () => (scanSnapshot ? buildExposureProfile(scanSnapshot, expiry, Number(windowHalf) as 10 | 15) : null),
    [scanSnapshot, expiry, windowHalf]
  );

  if (!data) {
    return (
      <Panel className="h-64" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">
          Awaiting feed initialization…
        </span>
      </Panel>
    );
  }

  const { levels } = data;
  const selectedRow = selectedStrike != null ? data.strikes.find(s => s.strike === selectedStrike) : undefined;
  const wallDist = (wall: number) => {
    const pct = ((wall - levels.spot) / levels.spot) * 100;
    return `${Math.abs(pct).toFixed(2)}% ${pct >= 0 ? 'above' : 'below'}`;
  };
  const biasTok: Tone = data.bias === 'BULLISH' ? 'bull' : data.bias === 'BEARISH' ? 'bear' : 'neutral';
  const strikeFmt = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));

  return (
    <>
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <SegmentedControl
          ariaLabel="Expiry"
          options={EXPIRY_OPTIONS}
          value={expiry}
          onChange={v => setExpiry(v as ExposureExpiry)}
        />
        <SegmentedControl
          ariaLabel="Strike window"
          options={WINDOW_OPTIONS}
          value={windowHalf}
          onChange={v => setWindowHalf(v as '10' | '15')}
        />
        <span className="ml-auto font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">
          scan {lastScanAt} · 10s
        </span>
      </div>

      {/* Header note — dealer-sign convention + units (read the same way across every panel) */}
      <p className="font-mono text-[11px] leading-relaxed text-textMuted">
        <span className="text-textSecondary font-semibold uppercase tracking-wider">Sign</span> positive net = dealer short
        gamma <span className="text-textSecondary">(upside supply)</span> · negative = dealer long gamma{' '}
        <span className="text-textSecondary">(downside support)</span>.{' '}
        <span className="text-textSecondary font-semibold uppercase tracking-wider">Units</span> signed $ — GEX per 1%
        move, DEX per 1σ move, VEX per 1% vol.
      </p>

      {/* Selected-strike detail bar */}
      <AnimatePresence initial={false}>
        {selectedRow && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-4 flex-wrap border border-select/30 bg-select/[0.04] rounded-md px-3 py-2"
          >
            <span className="inline-flex items-center rounded-full border border-select/40 bg-select/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-select tnum">
              {data.ticker} {selectedRow.strike % 1 === 0 ? selectedRow.strike.toFixed(0) : selectedRow.strike.toFixed(2)}
            </span>
            {(['gex', 'dex', 'vex'] as const).map(k => (
              <span key={k} className="font-mono text-[10px] uppercase tracking-wider text-textMuted tnum">
                {k}{' '}
                <span className="text-bear">{fmtUsd(selectedRow[k].put)}</span>
                {' / '}
                <span className="text-bull">{fmtUsd(selectedRow[k].call)}</span>
                {' / '}
                <span className="text-textPrimary font-semibold">{fmtUsd(selectedRow[k].net)}</span>
              </span>
            ))}
            <span className="ml-auto flex items-center gap-2">
              <button
                onClick={() => navigate('/pulse', { state: { focusPrice: selectedRow.strike } })}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-borderSubtle bg-white/[0.03] hover:bg-white/[0.06] font-mono text-[10px] font-semibold uppercase tracking-wider text-textPrimary transition-colors"
              >
                View on chart <ArrowUpRight className="w-3 h-3" />
              </button>
              <button
                onClick={() => setSelectedStrike(null)}
                aria-label="Clear selection"
                className="text-textMuted hover:text-textPrimary transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Matrix + map */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <Panel
          title="Exposure Matrix"
          subtitle="inventory & sensitivity by strike"
          flush
          focusable
          className="xl:col-span-7 min-w-0"
          bodyClassName="flex flex-col max-h-[640px]"
        >
          <ExposureMatrix
            data={data}
            hoverStrike={hoverStrike}
            selectedStrike={selectedStrike}
            onHoverStrike={setHoverStrike}
            onSelectStrike={toggleStrike}
          />
        </Panel>
        <Panel
          title="Dealer Positioning Map"
          subtitle="net dealer pressure by strike"
          flush
          focusable
          className="xl:col-span-5 min-w-0"
          bodyClassName="flex flex-col max-h-[640px]"
        >
          <PositioningMap
            data={data}
            hoverStrike={hoverStrike}
            selectedStrike={selectedStrike}
            onHoverStrike={setHoverStrike}
            onSelectStrike={toggleStrike}
          />
        </Panel>
      </div>

      {/* Stat rail + insight */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <div className="xl:col-span-8">
          <MetricGrid min="170px">
            <StatCard label="Net GEX" value={<AnimatedNumber value={data.netGex} format={fmtUsd} />} tone={data.netGex >= 0 ? 'bull' : 'bear'} sub={data.netGex >= 0 ? 'Net supportive' : 'Net negative'} />
            <StatCard label="Net DEX" value={<AnimatedNumber value={data.netDex} format={fmtUsd} />} sub="Delta exposure" />
            <StatCard label="Net VEX" value={<AnimatedNumber value={data.netVex} format={fmtUsd} />} sub="Vega exposure" />
            <StatCard label="Spot" value={<AnimatedNumber value={levels.spot} format={v => `$${v.toFixed(2)}`} />} sub="Live underlying" />
            <div className="h-full" onMouseEnter={() => setHoverStrike(levels.putWall)} onMouseLeave={() => setHoverStrike(null)}>
              <StatCard className="h-full" label="Put Wall" value={<AnimatedNumber value={levels.putWall} format={strikeFmt} />} tone="bear" sub={wallDist(levels.putWall)} />
            </div>
            <div className="h-full" onMouseEnter={() => setHoverStrike(levels.pin)} onMouseLeave={() => setHoverStrike(null)}>
              <StatCard className="h-full" label="Pin Level" value={<AnimatedNumber value={levels.pin} format={strikeFmt} />} sub="Max OI magnet" />
            </div>
            <div className="h-full" onMouseEnter={() => setHoverStrike(levels.callWall)} onMouseLeave={() => setHoverStrike(null)}>
              <StatCard className="h-full" label="Call Wall" value={<AnimatedNumber value={levels.callWall} format={strikeFmt} />} tone="bull" sub={wallDist(levels.callWall)} />
            </div>
            <StatCard label="Dealer Bias" value={data.bias} tone={biasTok} sub={data.biasNote} />
          </MetricGrid>
        </div>
        <div className="xl:col-span-4 min-w-0">
          <ExposureInsight bias={data.bias} biasNote={data.biasNote} insights={data.insights} />
        </div>
      </div>

      {/* Exposure ledger — filterable single-leg drill-down + CSV export */}
      <ExposureLedger
        data={data}
        hoverStrike={hoverStrike}
        selectedStrike={selectedStrike}
        onHoverStrike={setHoverStrike}
        onSelectStrike={toggleStrike}
      />
    </>
  );
};

export default ExposureProfile;
