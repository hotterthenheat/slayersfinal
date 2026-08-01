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
import { SkeletonRows } from '../../components/ui/Skeleton';
import AnimatedNumber from '../../components/ui/AnimatedNumber';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import type { Tone } from '../../components/ui/tones';
import ExposureMatrix from '../../components/gex/ExposureMatrix';
import PositioningMap from '../../components/gex/PositioningMap';
import ExposureInsight from '../../components/gex/ExposureInsight';
import ExposureLedger from './ExposureLedger';
import { DUR, EASE } from '../../lib/motion';

/** Exposure sweeps on its own cadence — bars must not vibrate with every tick. */
const SCAN_INTERVAL_MS = 10_000;

const EXPIRY_OPTIONS = [
  { value: '0DTE', label: '0DTE' },
  { value: '1D', label: '1D' },
  { value: '2D', label: '2D' },
  { value: '5D', label: '5D' },
  { value: '7D', label: '7D' },
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

  // Strike sync across matrix + map: hover mirrors, click pins (silver)
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
      <Panel className="h-64" bodyClassName="overflow-hidden">
        <SkeletonRows rows={5} />
      </Panel>
    );
  }

  const selectedRow = selectedStrike != null ? data.strikes.find(s => s.strike === selectedStrike) : undefined;
  const biasTok: Tone = data.bias === 'BULLISH' ? 'bull' : data.bias === 'BEARISH' ? 'bear' : 'neutral';
  // The three nets are sums over the RENDERED window at the SELECTED expiry, and
  // the bias is the whole chain (exposure.ts:86-92 vs :105-108). Two different
  // Net GEX figures print on this desk — the rail's and the insight panel's — so
  // each card states which one it is rather than leaving the reader to guess.
  const scope = `${expiry} · ±${windowHalf} strikes`;

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
        <span className="ml-auto font-mono text-micro text-textMuted uppercase tracking-widest tnum">
          scan {lastScanAt} · 10s
        </span>
      </div>

      {/* Header note — dealer-sign convention + units (read the same way across every panel) */}
      <p className="font-mono text-label leading-relaxed text-textMuted">
        <span className="text-textSecondary font-semibold uppercase tracking-wider">Sign</span> positive net = dealer long
        gamma <span className="text-textSecondary">(dips absorbed)</span> · negative = dealer short gamma{' '}
        <span className="text-textSecondary">(moves amplified)</span>.{' '}
        <span className="text-textSecondary font-semibold uppercase tracking-wider">Units</span> signed $ · GEX per 1%
        move, DEX delta notional, VEX per 1% vol.
      </p>

      {/* Stat rail — on top, the same grammar every other Pinpoint desk uses.
          Spot, both walls and the pin used to sit here too; all four are labelled
          on the positioning map directly below, and the distance-to-spot they
          carried now lives in the matrix read-out where a strike is being read. */}
      <MetricGrid min="170px">
        <StatCard
          label="Net GEX"
          value={<AnimatedNumber value={data.netGex} format={fmtUsd} />}
          tone={data.netGex >= 0 ? 'bull' : 'bear'}
          sub={scope}
        />
        <StatCard label="Net DEX" value={<AnimatedNumber value={data.netDex} format={fmtUsd} />} sub={scope} />
        <StatCard label="Net VEX" value={<AnimatedNumber value={data.netVex} format={fmtUsd} />} sub={scope} />
        <StatCard label="Dealer Bias" value={data.bias} tone={biasTok} sub="full chain, all expiries" />
      </MetricGrid>

      {/* Selected-strike detail bar */}
      <AnimatePresence initial={false}>
        {selectedRow && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: DUR.quick, ease: EASE }}
            className="flex items-center gap-4 flex-wrap border border-select/30 bg-select/[0.04] rounded-md px-3 py-2"
          >
            <span className="inline-flex items-center rounded-full border border-select/40 bg-select/10 px-2 py-0.5 font-mono text-label font-semibold text-select tnum">
              {data.ticker} {selectedRow.strike % 1 === 0 ? selectedRow.strike.toFixed(0) : selectedRow.strike.toFixed(2)}
            </span>
            {(['gex', 'dex', 'vex'] as const).map(k => (
              <span key={k} className="font-mono text-micro uppercase tracking-wider text-textMuted tnum">
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
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-borderSubtle bg-white/[0.03] hover:bg-rowHover font-mono text-micro font-semibold uppercase tracking-wider text-textPrimary transition-colors"
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

      {/* Positioning narrative — the read the instruments above earned */}
      <ExposureInsight bias={data.bias} biasNote={data.biasNote} insights={data.insights} />

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
