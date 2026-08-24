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
import Fact from '../../components/ui/Fact';
import Term from '../../components/ui/Term';
import ExposureMatrix from '../../components/gex/ExposureMatrix';
import PositioningMap from '../../components/gex/PositioningMap';
import ExposureInsight from '../../components/gex/ExposureInsight';

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

  // Strike sync across matrix + map: hover mirrors, click pins (white)
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

  const selectedRow = selectedStrike != null ? data.strikes.find(s => s.strike === selectedStrike) : undefined;

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

      {/* Selected-strike detail bar */}
      <AnimatePresence initial={false}>
        {selectedRow && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-4 flex-wrap border border-white/20 bg-white/[0.03] rounded-md px-3 py-2"
          >
            <span className="inline-flex items-center rounded-full border border-white/40 bg-white/[0.08] px-2 py-0.5 font-mono text-[11px] font-semibold text-textPrimary tnum">
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

      {/* THE MAP LEADS (Mo, 2026-08-19: "make the dealer positioning chart the
          main visual and let the matrix support it"). The map takes the wide
          column and BOTH rows; the matrix and the read stack beside it. One
          strike state runs through all of it: hover mirrors, a click in
          either panel pins the same strike in both and the map centres on
          it. The eight stat boxes are gone (Noah, 2026-08-22: "generic...
          sloppy") — the walls, pin, flip and spot are already drawn ON the
          map, the bias lives in the read, and the book's three totals ride
          as facts under the map. */}
      <div className="grid grid-cols-1 xl:grid-cols-12 xl:grid-rows-[minmax(0,1fr)_auto] gap-4 items-stretch">
        <Panel
          title="Dealer Positioning Map"
          subtitle="net dealer pressure by strike — click a strike to pin it in both panels"
          flush
          className="xl:col-span-7 xl:row-span-2 min-w-0"
          bodyClassName="flex flex-col"
        >
          <div className="flex-1 min-h-0 flex flex-col max-h-[720px]">
            <PositioningMap
              data={data}
              hoverStrike={hoverStrike}
              selectedStrike={selectedStrike}
              onHoverStrike={setHoverStrike}
              onSelectStrike={toggleStrike}
            />
          </div>
          {/* The book's totals, as facts — not boxes. Positive net GEX =
              put-dominant = short gamma = amplifying (sim side-coding,
              unified 2026-08-18). */}
          <div className="shrink-0 border-t border-borderSubtle px-3 py-2 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1">
            <Fact
              label={<Term k="Net GEX" />}
              value={
                <>
                  <AnimatedNumber value={data.netGex} format={fmtUsd} />
                  <span className="ml-1.5 font-normal text-[10px] text-textSecondary">
                    {data.netGex > 0 ? 'moves amplified' : 'dips absorbed'}
                  </span>
                </>
              }
              valueCls={data.netGex > 0 ? 'text-bear' : 'text-bull'}
            />
            <Fact label={<Term k="Net DEX" />} value={<AnimatedNumber value={data.netDex} format={fmtUsd} />} />
            <Fact label={<Term k="Net VEX" />} value={<AnimatedNumber value={data.netVex} format={fmtUsd} />} />
          </div>
        </Panel>
        <Panel
          title="Exposure Matrix"
          subtitle="inventory & sensitivity by strike"
          flush
          className="xl:col-span-5 min-w-0"
          bodyClassName="flex flex-col max-h-[480px]"
        >
          <ExposureMatrix
            data={data}
            hoverStrike={hoverStrike}
            selectedStrike={selectedStrike}
            onHoverStrike={setHoverStrike}
            onSelectStrike={toggleStrike}
          />
        </Panel>
        <div className="xl:col-span-5 min-w-0">
          <ExposureInsight bias={data.bias} biasNote={data.biasNote} insights={data.insights} />
        </div>
      </div>
    </>
  );
};

export default ExposureProfile;
