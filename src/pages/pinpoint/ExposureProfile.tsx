import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, X } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildExposureProfile } from '../../data/exposure';
import { buildGexPercentile, buildNetGexSeries, ordinal } from '../../data/gexSeries';
import { buildPins } from '../../data/pins';
import { buildExpiryFlips } from '../../data/flipGauge';
import { FLIP } from '../../components/gex/palette';
import { fmtUsd } from '../../data/gex';
import type { MarketSnapshot } from '../../types/market';
import type { ExposureExpiry } from '../../types/gex';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import AnimatedNumber from '../../components/ui/AnimatedNumber';
import Fact from '../../components/ui/Fact';
import Term from '../../components/ui/Term';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import SpotScenarioPanel from '../../components/gex/SpotScenarioPanel';
import OiHeatPanel from '../../components/gex/OiHeatPanel';
import StrikeAttributionPanel from '../../components/gex/StrikeAttributionPanel';
import Simulator from '../../core/simulator';
import { LONG_GAMMA, SHORT_GAMMA } from '../../components/gex/palette';
import { buildWallConviction, convictionGrade, convictionWords } from '../../data/wallConviction';
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
  const { marketData, flowTape } = useMarketData();
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

  /*
    P-7 — today's total against its own history, AND ITS OWN BASIS.

    Deliberately NOT a rank of `data.netGex`: that figure is the ±10/±15
    window under the expiry lens's decay weighting, while the history store
    holds full-book per-bar sums — ranking one against the other would print
    a plausible number comparing two different quantities. So the rank is of
    the WHOLE BOOK's current total (the same series the history is made of),
    and the label says so. Keyed on the scan snapshot like everything else on
    this page.
  */
  /* P-6: both sides' conviction, off the same stores the map reads. Keyed
     on the scan snapshot like the percentile beside it — the facts move on
     the scan tier, not on every tick. */
  const conviction = useMemo(() => {
    if (!scanSnapshot) return { call: null, put: null };
    const snaps = Simulator.getGexHistory(scanSnapshot.ticker) ?? [];
    const bars = Simulator.getCandles(scanSnapshot.ticker) ?? [];
    return {
      call: buildWallConviction(snaps, bars, scanSnapshot.spot, 'call'),
      put: buildWallConviction(snaps, bars, scanSnapshot.spot, 'put'),
    };
  }, [scanSnapshot]);

  const pctile = useMemo(() => {
    if (!scanSnapshot) return null;
    const series = buildNetGexSeries(scanSnapshot.ticker);
    const now = series.points[series.points.length - 1];
    return now ? buildGexPercentile(scanSnapshot.ticker, now.netGex) : null;
  }, [scanSnapshot]);

  /* P-10 — both pins, off the WHOLE chain rather than the ±10/±15 window:
     max pain is a settlement question and settlement does not care which
     strikes the panel happens to be drawing. Same scan tier as the page. */
  const pins = useMemo(
    () => (scanSnapshot ? buildPins(scanSnapshot.chain, scanSnapshot.spot) : null),
    [scanSnapshot]
  );

  /* P-9 — the flip through three expiry lenses, off the same seam the map
     and matrix read those lenses through. Same scan tier as everything. */
  const expiryFlips = useMemo(() => (scanSnapshot ? buildExpiryFlips(scanSnapshot) : null), [scanSnapshot]);

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
  /* The grid step sets P-19's match tolerance — a print lands on a contract,
     a map row on the profile's own grid, and half a step is the gap between
     them. Read off the rendered rows so it cannot drift from what is drawn. */
  const strikeStep =
    data.strikes.length > 1 ? Math.abs(data.strikes[0].strike - data.strikes[1].strike) : 1;

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
        {/* P-1: what this page is standing on. Everything here is computed
            from the chain, so the chip reads the weakest of the two — and
            when the exposure feed lands it changes by itself. */}
        <ProvenanceChip sources={['chain', 'exposure']} className="ml-auto" />
        <span className="font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">
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
            className="flex flex-col gap-2 border border-white/20 bg-white/[0.03] rounded-md px-3 py-2"
          >
            <div className="flex items-center gap-4 flex-wrap">
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
            </div>
            {/* P-19. The wall stops being a number and becomes a list of
                trades — off the same flowTape the tape desk reads, so the two
                desks cannot disagree about what traded. */}
            <div className="border-t border-borderSubtle/60 pt-2">
              <StrikeAttributionPanel prints={flowTape} strike={selectedRow.strike} step={strikeStep} />
            </div>
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
          <div className="shrink-0 border-t border-borderSubtle px-3 py-2 grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-x-6 gap-y-1">
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
            {/* P-7. Null while the store is too thin for a rank to mean
                anything — the fact is absent then, not a dash pretending. */}
            {pctile && (
              <Fact
                label={<Term k="GEX percentile" />}
                value={
                  <>
                    {ordinal(pctile.pctile)}
                    <span className="ml-1.5 font-normal text-[10px] text-textSecondary">
                      whole book · {pctile.sessions} sessions
                    </span>
                  </>
                }
              />
            )}
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
        {/*
          P-10 — BOTH PINS, and the gap. The desk carried ONE `pin` (max
          total OI) silently standing in for two definitions that routinely
          disagree; showing both named, with the gap, is the honest form —
          and the gap is itself a read: a book whose OI mass and gamma mass
          sit apart is a book where "the pin" is not one place.

          This slot was empty: the insight card spans 5 of the second row's
          12 and nothing claimed the other 7.
        */}
        <div className="xl:col-span-7 min-w-0 flex flex-col gap-4">
        {/* P-17 / P-18. Vanna & Charm already do time and vol; nobody does
            SPOT, and it is the scenario a trader runs in their head all day.
            The forced-flow sentence under it is the translation layer that
            makes the page legible without greek. */}
        {scanSnapshot && (
          <Panel
            title="Spot Scenario"
            subtitle="Drag spot — the levels re-pick, and the flow that move forces"
            className="w-full"
          >
            <SpotScenarioPanel snapshot={scanSnapshot} />
          </Panel>
        )}
        {/* P-8. The flow behind the snapshot: which strikes are being built
            and unwound right now. Reads the same GEX history the percentile
            and the conviction panel do — the OI rides on those snapshots, so
            a ΔOI reading can never be timestamped away from the gamma it
            explains. */}
        {scanSnapshot && (
          <Panel
            title="ΔOI Through The Session"
            subtitle="Is that wall growing or dying — change, not level"
            className="w-full"
          >
            <OiHeatPanel
              snaps={Simulator.getGexHistory(scanSnapshot.ticker) ?? []}
              bars={Simulator.getCandles(scanSnapshot.ticker) ?? []}
            />
          </Panel>
        )}
        {/* P-6. A wall at 5,880 that is 2.4× its runner-up and unbroken for
            four sessions is a different object from a marginal winner that
            flips at the next tick — and the map draws them identically. This
            panel is the difference, in the four facts that carry it. */}
        {(conviction.call || conviction.put) && (
          <Panel
            title="Wall Conviction"
            subtitle="A level, or a guess — margin, persistence, and today's record"
            className="w-full"
            bodyClassName="flex flex-col justify-center gap-2"
          >
            {([conviction.call, conviction.put].filter(Boolean) as NonNullable<typeof conviction.call>[]).map(c => (
              <div key={c.side} className="flex items-baseline gap-2 flex-wrap">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: c.side === 'call' ? SHORT_GAMMA : LONG_GAMMA }}>
                  {c.side === 'call' ? 'Call wall' : 'Put wall'}
                </span>
                <span className="font-mono text-[13px] font-bold tnum text-textPrimary">{c.strike}</span>
                <span
                  className="font-mono text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-borderSubtle text-textSecondary"
                  title="STRONG needs both dominance over the runner-up and an unbroken record today"
                >
                  {convictionGrade(c)}
                </span>
                <span className="font-mono text-[10px] text-textSecondary">{convictionWords(c)}</span>
              </div>
            ))}
          </Panel>
        )}
        {pins && (
          <Panel
            title="Both Pins"
            subtitle="OI-weighted vs gamma-weighted — whole book"
            className="w-full"
            bodyClassName="flex flex-col justify-center gap-2"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1">
              <Fact
                label={<Term k="Max pain" />}
                value={pins.maxPain !== null ? (pins.maxPain % 1 === 0 ? pins.maxPain.toFixed(0) : pins.maxPain.toFixed(2)) : '—'}
              />
              <Fact
                label={<Term k="Gamma pin" />}
                value={pins.gammaPin !== null ? pins.gammaPin.toFixed(2) : '—'}
              />
              <Fact
                label="Gap"
                value={
                  pins.gap !== null ? (
                    <>
                      {Math.abs(pins.gap).toFixed(2)}
                      <span className="ml-1.5 font-normal text-[10px] text-textSecondary">
                        gamma mass {pins.gap > 0 ? 'above' : pins.gap < 0 ? 'below' : 'on'} the OI mass
                      </span>
                    </>
                  ) : (
                    '—'
                  )
                }
              />
            </div>
            <p className="pt-2 border-t border-borderSubtle/60 font-mono text-[10px] leading-relaxed text-textMuted">
              Two defensible answers to “where does the book pin”, shown together because they disagree —
              a wide gap says the OI is parked at strikes the hedging flow is not.
            </p>
          </Panel>
        )}
        {/* P-9 — three books, three flips. The 0DTE line evaporates at the
            bell; the whole book is the structure underneath it; the weekly is
            the trade being carried between them. When they split, the split
            IS the read. */}
        {expiryFlips && (
          <Panel
            title="The Flip, By Expiry"
            subtitle="today's artifact vs the structure underneath it"
            className="w-full flex-1"
            bodyClassName="flex flex-col justify-center gap-2"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1">
              {(
                [
                  { label: '0DTE', v: expiryFlips.d0, hint: 'gone at the bell' },
                  { label: 'Weekly', v: expiryFlips.weekly, hint: 'the carried trade' },
                  { label: 'Whole book', v: expiryFlips.book, hint: 'the structure' },
                ] as const
              ).map(row => (
                <Fact
                  key={row.label}
                  label={row.label}
                  value={
                    row.v !== null ? (
                      <>
                        <span style={{ color: FLIP }}>{row.v % 1 === 0 ? row.v.toFixed(0) : row.v.toFixed(2)}</span>
                        <span className="ml-1.5 font-normal text-[10px] text-textSecondary">{row.hint}</span>
                      </>
                    ) : (
                      /* A one-sided lens has no flip, and says so. */
                      'no flip'
                    )
                  }
                />
              ))}
            </div>
            <p className="pt-2 border-t border-borderSubtle/60 font-mono text-[10px] leading-relaxed text-textMuted tnum">
              {expiryFlips.spread === null
                ? 'No spread — at least one lens holds a single sign across its window.'
                : expiryFlips.spread === 0
                  ? 'The lenses agree — today’s flip is the structural one.'
                  : `Spread ${Math.abs(expiryFlips.spread).toFixed(2)}: the structural flip sits ${
                      expiryFlips.spread > 0 ? 'above' : 'below'
                    } today’s — what pins this morning is not what governs after the bell.`}
            </p>
          </Panel>
        )}
        </div>
        <div className="xl:col-span-5 min-w-0">
          <ExposureInsight bias={data.bias} biasNote={data.biasNote} insights={data.insights} />
        </div>
      </div>
    </>
  );
};

export default ExposureProfile;
