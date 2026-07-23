import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Grid3x3, Info } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildExposureProfile } from '../../data/exposure';
import { buildGexView, fmtUsd, pulseMatrix } from '../../data/gex';
import { buildCommandView } from '../../data/command';
import type { MarketSnapshot } from '../../types/market';
import Panel from '../../components/ui/Panel';
import GexMatrix from '../../components/gex/GexMatrix';

/** The heatmap sweeps on its own cadence (10s) so cells don't vibrate every
    tick; the live glyph pulse still folds in per tick via `revision`. */
const SCAN_INTERVAL_MS = 10_000;

const LevelChip = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
  <span className="inline-flex flex-col leading-tight">
    <span className="font-mono text-micro uppercase tracking-widest text-textMuted">{label}</span>
    <span className={`font-mono text-caption font-semibold tnum ${tone}`}>${value.toFixed(2)}</span>
  </span>
);

const GammaChart = () => {
  const { activeTicker, marketData } = useMarketData();
  const revRef = useRef(0);
  const revision = useMemo(() => ++revRef.current, [marketData]);

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

  const exposure = useMemo(() => (scan ? buildExposureProfile(scan, '0DTE', 10) : null), [scan]);
  const gexView = useMemo(() => (scan ? buildGexView(scan, 'GEX', 10) : null), [scan]);
  const gexLevels = gexView?.levels ?? null;
  // Pulse the matrix glyphs each tick for a live read (geometry stays fixed).
  const matrix = useMemo(() => (gexView ? pulseMatrix(gexView.matrix, revision) : null), [gexView, revision]);
  const vwap = useMemo(() => (scan ? buildCommandView(scan).orderFlow.vwap : null), [scan]);

  if (!scan || !exposure || !gexLevels || !matrix) {
    return (
      <Panel>
        <div className="h-64 flex items-center justify-center font-mono text-label uppercase tracking-widest text-textMuted">
          loading…
        </div>
      </Panel>
    );
  }

  const longGamma = exposure.netGex >= 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Regime banner + key levels — the read, no candles (charts live in Pulse) */}
      <Panel flush>
        <div className="flex items-center gap-x-6 gap-y-3 flex-wrap px-3.5 py-3">
          <div className="min-w-0">
            <div className="font-mono text-micro uppercase tracking-widest text-textMuted">Dealer gamma @ spot</div>
            <div className="flex items-baseline gap-2.5">
              <span className={`font-mono text-lg font-bold tnum ${longGamma ? 'text-bull' : 'text-bear'}`}>
                {longGamma ? '+' : '−'}
                {fmtUsd(Math.abs(exposure.netGex))}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-micro font-bold uppercase tracking-wider ${
                  longGamma ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'
                }`}
              >
                <Activity className="w-3 h-3" />
                {longGamma ? 'Long gamma' : 'Short gamma'}
              </span>
            </div>
            <div className="mt-0.5 font-mono text-micro text-textSecondary">
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

      {/* GEX heatmap — net dealer gamma across every strike × expiry */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Grid3x3 className="w-3.5 h-3.5 text-select" /> Gamma Heatmap
            <span className="rounded border border-borderMuted px-1.5 py-px text-micro tracking-normal text-textSecondary">
              {activeTicker}
            </span>
          </span>
        }
        subtitle="net GEX by strike × expiry"
        flush
        focusable
        bodyClassName="h-[calc(100dvh-27rem)] min-h-[340px] max-h-[520px] p-2"
      >
        <GexMatrix data={matrix} spot={scan.spot} />
      </Panel>

      {/* Read */}
      <p className="flex items-start gap-2 text-caption text-textSecondary leading-relaxed px-1">
        <Info className="w-3.5 h-3.5 text-textMuted mt-px shrink-0" />
        <span>
          <span className="font-mono font-semibold uppercase tracking-wider mr-1.5 holo-text">Reading the gamma</span>
          Each cell is net dealer gamma at that strike and expiry — <span className="text-bull">green</span> is dealer support
          (long γ, dips get bought toward the walls); <span className="text-bear">red</span> is where hedging amplifies the move.
          The nearest expiries carry the most gamma; the flip is the price where the sign turns. Candlesticks live on Pulse — this
          is the positioning read.
        </span>
      </p>
    </div>
  );
};

export default GammaChart;
