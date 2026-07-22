import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Info } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildExposureProfile } from '../../data/exposure';
import { buildGexView, fmtUsd } from '../../data/gex';
import { buildCommandView } from '../../data/command';
import type { MarketSnapshot } from '../../types/market';
import type { ExposureExpiry, OverlayMode } from '../../types/gex';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import StrikeChart from '../../components/gex/StrikeChart';
import DealerGammaRail from '../../components/gex/DealerGammaRail';

/** The profile sweeps on its own cadence so bars don't vibrate every tick;
    the candle chart still folds new bars every tick via `revision`. */
const SCAN_INTERVAL_MS = 10_000;

const EXPIRY_OPTIONS = [
  { value: '0DTE', label: '0DTE' },
  { value: '1D', label: '1D' },
  { value: '2D', label: '2D' },
  { value: '5D', label: '5D' },
  { value: 'ALL', label: 'All' },
] as const;

const OVERLAY_OPTIONS = [
  { value: 'LEVELS', label: 'Levels' },
  { value: 'NODES', label: 'Nodes' },
  { value: 'BOTH', label: 'Both' },
] as const;

const LevelChip = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
  <span className="inline-flex flex-col leading-tight">
    <span className="font-mono text-[8px] uppercase tracking-widest text-textMuted">{label}</span>
    <span className={`font-mono text-[11px] font-semibold tnum ${tone}`}>${value.toFixed(2)}</span>
  </span>
);

const GammaChart = () => {
  const { activeTicker, marketData } = useMarketData();
  const revRef = useRef(0);
  const revision = useMemo(() => ++revRef.current, [marketData]);
  const [expiry, setExpiry] = useState<ExposureExpiry>('0DTE');
  const [overlay, setOverlay] = useState<OverlayMode>('BOTH');

  // Scan-tier snapshot (10s; ticker switch is immediate).
  const [scan, setScan] = useState<MarketSnapshot | null>(null);
  const scanRef = useRef<MarketSnapshot | null>(null);
  const lastRef = useRef(0);
  useEffect(() => {
    if (!marketData) return;
    const now = Date.now();
    const due =
      !scanRef.current || now - lastRef.current >= SCAN_INTERVAL_MS || scanRef.current.ticker !== marketData.ticker;
    if (due) {
      scanRef.current = marketData;
      lastRef.current = now;
      setScan(marketData);
    }
  }, [marketData]);

  const exposure = useMemo(() => (scan ? buildExposureProfile(scan, expiry, 10) : null), [scan, expiry]);
  const gexLevels = useMemo(() => (scan ? buildGexView(scan, 'GEX', 10).levels : null), [scan]);
  const vwap = useMemo(() => (scan ? buildCommandView(scan).orderFlow.vwap : null), [scan]);

  if (!exposure || !gexLevels) {
    return (
      <Panel>
        <div className="h-64 flex items-center justify-center font-mono text-[11px] uppercase tracking-widest text-textMuted">
          loading…
        </div>
      </Panel>
    );
  }

  const longGamma = exposure.netGex >= 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Regime banner + key levels */}
      <Panel flush emphasis>
        <div className="flex items-center gap-x-6 gap-y-3 flex-wrap px-3.5 py-3">
          <div className="min-w-0">
            <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Dealer gamma @ spot</div>
            <div className="flex items-baseline gap-2.5">
              <span className={`font-mono text-2xl font-bold tnum ${longGamma ? 'text-bull' : 'text-bear'}`}>
                {longGamma ? '+' : '−'}
                {fmtUsd(Math.abs(exposure.netGex))}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
                  longGamma ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'
                }`}
              >
                <Activity className="w-3 h-3" />
                {longGamma ? 'Long Γ' : 'Short Γ'}
              </span>
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-textSecondary">
              {longGamma ? 'pinning — dealers dampen moves toward the walls' : 'trending — dealer hedging amplifies the move'}
            </div>
          </div>
          <div className="flex items-center gap-x-4 gap-y-2 flex-wrap ml-auto">
            <LevelChip label="Call Wall" value={gexLevels.callWall} tone="text-bull" />
            <LevelChip label="Flip" value={gexLevels.flip} tone="text-flip" />
            <LevelChip label="Put Wall" value={gexLevels.putWall} tone="text-bear" />
            <LevelChip label="King" value={gexLevels.king} tone="text-king" />
            <LevelChip label="Max Pain" value={exposure.levels.pin} tone="text-textSecondary" />
            {vwap != null && <LevelChip label="VWAP" value={vwap} tone="text-textSecondary" />}
          </div>
        </div>
      </Panel>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <SegmentedControl ariaLabel="Expiry" options={EXPIRY_OPTIONS} value={expiry} onChange={setExpiry} />
        <div className="ml-auto">
          <SegmentedControl ariaLabel="Chart overlay" options={OVERLAY_OPTIONS} value={overlay} onChange={setOverlay} />
        </div>
      </div>

      {/* Candle chart + dealer-gamma-by-price rail */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4 h-[calc(100dvh-26rem)] min-h-[460px]">
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-select" /> Gamma Chart · {activeTicker}
            </span>
          }
          flush
          bodyClassName="h-full p-2"
        >
          <StrikeChart ticker={activeTicker} revision={revision} levels={gexLevels} overlay={overlay} timeframe="1m" />
        </Panel>
        <Panel title="Dealer Gamma by Price" subtitle="net GEX per strike — where dealers are long vs short γ" flush bodyClassName="h-full py-2 pr-2 pl-1">
          <DealerGammaRail data={exposure} />
        </Panel>
      </div>

      {/* Read */}
      <p className="flex items-start gap-2 text-[11px] text-textSecondary leading-relaxed px-1">
        <Info className="w-3.5 h-3.5 text-textMuted mt-px shrink-0" />
        <span>
          <span className="font-mono font-semibold uppercase tracking-wider mr-1.5 holo-text">Reading the gamma</span>
          Net dealer gamma sets the regime: <span className="text-bull">long γ</span> means dealers buy dips and sell rips —
          price gets pinned toward the walls; <span className="text-bear">short γ</span> means they hedge with the move, so
          breaks run. The rail shows where that gamma sits by strike; the flip is the price where the sign turns. Levels are
          the live chain — swap in a dealer-positioning feed behind the same view.
        </span>
      </p>
    </div>
  );
};

export default GammaChart;
