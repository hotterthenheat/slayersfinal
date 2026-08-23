import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, X } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildExposureProfile, EXPOSURE_EXPIRIES } from '../../data/exposure';
import { fmtUsd } from '../../data/gex';
import type { MarketSnapshot } from '../../types/market';
import { DEALER_BIAS_LABEL, type ExposureExpiry } from '../../types/gex';
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
import { etTime } from '../../core/calendar';
import { DEALER_BOOK, oiProxyNote } from '../../core/dealerBook';
import { INVERTED_BOOK, netGammaOf, withConvention } from '../../core/exposureConvention';
import KnowabilityChip from '../../components/ui/KnowabilityChip';

/** Exposure sweeps on its own cadence — bars must not vibrate with every tick. */
const SCAN_INTERVAL_MS = 10_000;

const WINDOW_OPTIONS = [
  { value: '10', label: '±10' },
  { value: '15', label: '±15' },
] as const;

const ExposureProfile = () => {
  const { marketData } = useMarketData();
  const navigate = useNavigate();
  const [expiry, setExpiry] = useState<ExposureExpiry>('0DTE');
  const [windowHalf, setWindowHalf] = useState<'10' | '15'>('10');
  /*
    Which dealer book the surface is drawn under.

    Not a display preference. Gamma is identical and positive for a call and a
    put at the same strike, so the call-versus-put sign here is an assumption
    about who holds which side — and nothing in the entitled data names a holder.
    A reader cannot see that in the output, because flipping it inverts the whole
    regime while every magnitude stays exactly where it was. Letting them flip it
    and watch the conclusion turn over is the only version of that sentence
    anybody believes.
  */
  const [inverted, setInverted] = useState(false);

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
      setLastScanAt(etTime(now));
    }
  }, [marketData]);

  /* Re-convention the CHAIN, then hand it to the same builder. Everything
     downstream — the map, the levels, the bias, the king strike — restates
     itself coherently, and there is no second copy of the arithmetic. */
  const book = inverted ? INVERTED_BOOK : DEALER_BOOK;
  const conventioned = useMemo(
    () => (scanSnapshot ? withConvention(scanSnapshot, book) : null),
    [scanSnapshot, book]
  );

  const data = useMemo(
    () => (conventioned ? buildExposureProfile(conventioned, expiry, Number(windowHalf) as 10 | 15) : null),
    [conventioned, expiry, windowHalf]
  );

  /* Both readings of the same book, so the pane can state the inversion as a
     fact rather than asking the reader to compare two screens from memory. */
  const netUnderBook = useMemo(
    () => (scanSnapshot ? netGammaOf(withConvention(scanSnapshot, book).chain) : 0),
    [scanSnapshot, book]
  );
  const netUnderOther = useMemo(
    () => (scanSnapshot ? netGammaOf(withConvention(scanSnapshot, inverted ? DEALER_BOOK : INVERTED_BOOK).chain) : 0),
    [scanSnapshot, inverted]
  );

  if (!data) {
    return (
      <Panel className="h-64" bodyClassName="overflow-hidden">
        <SkeletonRows rows={5} />
      </Panel>
    );
  }

  const selectedRow = selectedStrike != null ? data.strikes.find(s => s.strike === selectedStrike) : undefined;
  const biasTok: Tone =
    data.bias === 'LONG_GAMMA' ? 'longGamma' : data.bias === 'SHORT_GAMMA' ? 'shortGamma' : 'neutral';
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
          options={EXPOSURE_EXPIRIES}
          value={expiry}
          onChange={v => setExpiry(v as ExposureExpiry)}
        />
        <SegmentedControl
          ariaLabel="Strike window"
          options={WINDOW_OPTIONS}
          value={windowHalf}
          onChange={v => setWindowHalf(v as '10' | '15')}
        />
        <SegmentedControl
          ariaLabel="Dealer book convention"
          options={[
            { value: 'std', label: 'Long calls' },
            { value: 'inv', label: 'Short calls' },
          ]}
          value={inverted ? 'inv' : 'std'}
          onChange={v => setInverted(v === 'inv')}
        />
        <span className="ml-auto font-mono text-micro text-textMuted uppercase tracking-widest tnum">
          scan {lastScanAt} · 10s
        </span>
      </div>

      {/* The assumption, stated as an assumption, with what it costs.

          Every figure below is built on the book selected above. This says which
          one, what the other one would read, and — the part that matters — that
          the strikes did not move between them. A reader who sees the same
          magnitudes carry opposite conclusions understands the epistemic status
          of this desk in a way no disclaimer achieves. */}
      <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap border border-borderSubtle rounded-md px-3 py-2">
        <KnowabilityChip
          tier="assumed"
          basis="open interest names no holder — the call/put sign is a convention, not an observation"
        />
        <span className="font-mono text-label text-textSecondary">{book.label}</span>
        <span className="font-mono text-label text-textMuted tnum">
          net {netUnderBook >= 0 ? '+' : ''}
          {fmtUsd(netUnderBook)} · {netUnderBook >= 0 ? 'long gamma' : 'short gamma'}
        </span>
        <span className="font-mono text-label text-textMuted">
          the other book reads{' '}
          <span className="text-textSecondary tnum">
            {netUnderOther >= 0 ? '+' : ''}
            {fmtUsd(netUnderOther)}
          </span>{' '}
          — same strikes, same open interest, opposite regime
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
        <StatCard
          label="Dealer regime"
          value={DEALER_BIAS_LABEL[data.bias]}
          tone={biasTok}
          sub="full chain, all expiries"
        />
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
          bodyClassName="flex flex-col"
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
          /* The subtitle read "net dealer pressure by strike", which states an
             observation this data cannot make. Open interest is a count of
             contracts outstanding with nobody's name on it, published once a day
             for the prior close; who is long which side is an ASSUMPTION, and
             flipping it inverts every regime below while leaving every magnitude
             looking identical. The convention it assumes is named here so the
             reader can see what they are being shown. */
          subtitle={oiProxyNote(book)}
          flush
          focusable
          className="xl:col-span-5 min-w-0"
          bodyClassName="flex flex-col"
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
