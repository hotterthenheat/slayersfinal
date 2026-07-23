import { useEffect, useMemo, useRef, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { buildVolLab } from '../../data/vollab';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import IvSurface from '../../components/gex/vollab/IvSurface';
import TermStructure from '../../components/gex/vollab/TermStructure';
import RiskNeutralDist from '../../components/gex/vollab/RiskNeutralDist';
import RegimePanel from '../../components/gex/vollab/RegimePanel';
import VolSliceChart, { type SlicePoint } from './VolSliceChart';
import type { IvSurfaceData } from '../../types/gex';

/** Vol analytics recalibrate on the scan tier — surfaces must not flicker per tick. */
const SCAN_INTERVAL_MS = 10_000;

// ── Surface-explorer controls (all read the already-computed IV grid) ──────────
const VIEW_OPTIONS = [
  { value: 'SKEW', label: 'Skew' },
  { value: 'TERM', label: 'Term' },
  { value: 'SURFACE', label: 'Surface' },
] as const;
type SliceMode = (typeof VIEW_OPTIONS)[number]['value'];

const RANGE_OPTIONS = [
  { value: 'FULL', label: 'Full' },
  { value: 'W20', label: '±20%' },
  { value: 'W10', label: '±10%' },
  { value: 'W05', label: '±5%' },
] as const;
type RangeKey = (typeof RANGE_OPTIONS)[number]['value'];
const RANGE_BOUNDS: Record<RangeKey, [number, number]> = {
  FULL: [0, Infinity],
  W20: [0.8, 1.2],
  W10: [0.9, 1.1],
  W05: [0.95, 1.05],
};

/** Representative K/F columns offered for the term slice (all live in the grid). */
const TERM_MONEYNESS = [0.9, 0.95, 1.0, 1.05, 1.1];

const VolLab = () => {
  const { activeTicker, marketData } = useMarketData();

  const [scanKey, setScanKey] = useState<{ ticker: string; spot: number } | null>(null);
  const [calibratedAt, setCalibratedAt] = useState('');
  const lastScanTimeRef = useRef(0);

  // Surface-explorer view state
  const [sliceMode, setSliceMode] = useState<SliceMode>('SKEW');
  const [dteSel, setDteSel] = useState(30);
  const [moneySel, setMoneySel] = useState(1);
  const [rangeKey, setRangeKey] = useState<RangeKey>('FULL');

  useEffect(() => {
    if (!marketData) return;
    const now = Date.now();
    const due =
      !scanKey ||
      now - lastScanTimeRef.current >= SCAN_INTERVAL_MS ||
      scanKey.ticker !== marketData.ticker;
    if (due) {
      lastScanTimeRef.current = now;
      setScanKey({ ticker: marketData.ticker, spot: marketData.spot });
      setCalibratedAt(new Date(now).toLocaleTimeString('en-GB'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketData]);

  const data = useMemo(() => {
    if (!scanKey) return null;
    const iv = Simulator.TICKERS[scanKey.ticker]?.iv ?? 0.2;
    return buildVolLab(scanKey.ticker, scanKey.spot, iv);
  }, [scanKey]);

  if (!data) {
    return (
      <Panel className="h-64" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-label text-textMuted uppercase tracking-widest">
          Awaiting feed initialization…
        </span>
      </Panel>
    );
  }

  // ── Cross-sections of the existing IV grid (row = skew, column = term) ─────────
  const surface = data.surface;
  const dteIdx = Math.max(0, surface.dte.indexOf(dteSel));
  const colSel = surface.moneyness.reduce(
    (best, m, i) => (Math.abs(m - moneySel) < Math.abs(surface.moneyness[best] - moneySel) ? i : best),
    0
  );
  const atmCol = surface.moneyness.reduce(
    (best, m, i) => (Math.abs(m - 1) < Math.abs(surface.moneyness[best] - 1) ? i : best),
    0
  );
  const dte30Idx = surface.dte.reduce(
    (best, d, i) => (Math.abs(d - 30) < Math.abs(surface.dte[best] - 30) ? i : best),
    0
  );
  const [rangeLo, rangeHi] = RANGE_BOUNDS[rangeKey];

  // Skew: one DTE row across moneyness, windowed to the selected range.
  const skewCols = surface.moneyness
    .map((m, i) => ({ m, i }))
    .filter(o => o.m >= rangeLo - 1e-9 && o.m <= rangeHi + 1e-9);
  const skewPoints: SlicePoint[] = skewCols.map(o => ({
    x: o.m,
    y: surface.cells[dteIdx][o.i],
    label: o.m.toFixed(2),
  }));
  const skewRefIndex = Math.max(0, skewCols.findIndex(o => o.i === atmCol));

  // Term: one moneyness column across every tenor.
  const termPoints: SlicePoint[] = surface.dte.map((d, i) => ({
    x: d,
    y: surface.cells[i][colSel],
    label: `${d}d`,
  }));

  // Surface: the full heat grid, columns windowed to the selected range (global
  // min/max carried through so the color scale stays comparable).
  const windowedSurface: IvSurfaceData = {
    ...surface,
    moneyness: skewCols.map(o => o.m),
    cells: surface.cells.map(row => skewCols.map(o => row[o.i])),
  };

  const expiryOptions = surface.dte.map(d => ({ value: String(d), label: `${d}d` }));
  const termOptions = TERM_MONEYNESS.map(m => ({ value: String(m), label: m.toFixed(2) }));
  const selMoneyLabel = surface.moneyness[colSel].toFixed(2);

  const surfaceSubtitle =
    sliceMode === 'SKEW'
      ? `${activeTicker} · skew slice · ${dteSel}DTE`
      : sliceMode === 'TERM'
        ? `${activeTicker} · term slice · ${selMoneyLabel} K/F`
        : `${activeTicker} · surface · DTE × moneyness`;

  return (
    <>
      {/* Model header */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 border border-borderSubtle bg-panel rounded-md px-2.5 py-1.5 font-mono text-label uppercase tracking-wider text-textSecondary">
          Model <span className="text-textPrimary font-semibold">SLAYER-VOL v0.2</span>
        </span>
        <span className="font-mono text-micro text-textMuted uppercase tracking-widest tnum">
          calibrated {calibratedAt}
        </span>
        <span className="ml-auto font-mono text-micro text-textMuted uppercase tracking-widest tnum">
          scan {calibratedAt} · 10s
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
        <Panel
          title="IV Surface"
          subtitle={surfaceSubtitle}
          className="min-w-0"
          bodyClassName="h-[300px]"
          actions={
            <SegmentedControl ariaLabel="Surface slice" options={VIEW_OPTIONS} value={sliceMode} onChange={setSliceMode} />
          }
        >
          <div className="flex flex-col gap-2.5 h-full min-h-0">
            {/* Slice controls — wired to the existing grid axes */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 shrink-0">
              {sliceMode === 'SKEW' && (
                <>
                  <label className="flex items-center gap-2">
                    <span className="font-mono text-label uppercase tracking-widest text-textMuted">Expiry</span>
                    <SegmentedControl
                      ariaLabel="Skew expiry"
                      options={expiryOptions}
                      value={String(dteSel)}
                      onChange={v => setDteSel(Number(v))}
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="font-mono text-label uppercase tracking-widest text-textMuted">Window</span>
                    <SegmentedControl ariaLabel="Moneyness window" options={RANGE_OPTIONS} value={rangeKey} onChange={setRangeKey} />
                  </label>
                </>
              )}
              {sliceMode === 'TERM' && (
                <label className="flex items-center gap-2">
                  <span className="font-mono text-label uppercase tracking-widest text-textMuted">Moneyness K/F</span>
                  <SegmentedControl
                    ariaLabel="Term moneyness"
                    options={termOptions}
                    value={String(moneySel)}
                    onChange={v => setMoneySel(Number(v))}
                  />
                </label>
              )}
              {sliceMode === 'SURFACE' && (
                <label className="flex items-center gap-2">
                  <span className="font-mono text-label uppercase tracking-widest text-textMuted">Window</span>
                  <SegmentedControl ariaLabel="Moneyness window" options={RANGE_OPTIONS} value={rangeKey} onChange={setRangeKey} />
                </label>
              )}
            </div>

            <div className="flex-grow min-h-0">
              {sliceMode === 'SURFACE' ? (
                <IvSurface data={windowedSurface} />
              ) : sliceMode === 'TERM' ? (
                <VolSliceChart
                  key={`term-${colSel}`}
                  points={termPoints}
                  xCaption="Tenor"
                  xTitle="days to expiry"
                  refIndex={dte30Idx}
                  refLabel="30D"
                />
              ) : (
                <VolSliceChart
                  key={`skew-${dteIdx}-${rangeKey}`}
                  points={skewPoints}
                  xCaption="Moneyness"
                  xTitle="strike / forward · K/F"
                  refIndex={skewRefIndex}
                  refLabel="ATM"
                />
              )}
            </div>
          </div>
        </Panel>

        <Panel
          title="Volatility Term Structure"
          subtitle="ATM IV vs DTE — current & history"
          className="min-w-0"
          bodyClassName="h-[300px]"
        >
          <TermStructure data={data.term} />
        </Panel>

        <Panel
          title="Risk-Neutral Distribution"
          subtitle="29D options-implied price density"
          className="min-w-0"
          bodyClassName="h-[300px]"
        >
          <RiskNeutralDist data={data.rnd} />
        </Panel>

        <Panel
          title="Volatility State"
          subtitle="calm / normal / stormy odds · 2y lookback"
          className="min-w-0"
          bodyClassName="h-[300px]"
        >
          <RegimePanel data={data.regime} />
        </Panel>
      </div>
    </>
  );
};

export default VolLab;
