import { useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import LiquidityMap, { type LiqChartType } from '../../components/flowdesk/LiquidityMap';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { Flame, Info } from 'lucide-react';

/** The thermal legend — the exact ramp the heatmap uses. */
const THERMAL_CSS =
  'linear-gradient(90deg, #000000, #03081f 6%, #08144a 14%, #102880 24%, #1246ac 34%, #146ec8 44%, #2ea8e0 53%, #68dcee 61%, #bef0f8 68%, #f8fcf0 73%, #ffe258 80%, #fa962c 90%, #ea2c2c 100%)';

const CHART_OPTIONS = [
  { value: 'candle', label: 'Candles' },
  { value: 'line', label: 'Line' },
  { value: 'bubbles', label: 'Bubbles' },
] as const;

/** Compact inline legend — lives in the hero header strip, not its own band. */
const Legend = () => (
  <div className="hidden md:flex items-center gap-x-4 font-mono text-[10px] uppercase tracking-wider text-textMuted">
    <span className="inline-flex items-center gap-1.5">
      Depth
      <span className="w-24 h-2 rounded-sm border border-borderSubtle" style={{ background: THERMAL_CSS }} />
    </span>
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full bg-bull/70" /> Buy
    </span>
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full bg-bear/70" /> Sell
    </span>
  </div>
);

const LiquidityDesk = () => {
  const { activeTicker, marketData } = useMarketData();
  const spot = marketData?.spot ?? 500;
  const [chartType, setChartType] = useState<LiqChartType>('candle');

  return (
    <div className="flex flex-col gap-2.5">
      {/* Hero frame — the map is the product, so it owns the viewport. A single
          slim header strip carries context + controls; everything else is chart. */}
      <div className="inst-surface rounded-md overflow-hidden flex flex-col h-[calc(100dvh-15.5rem)] min-h-[460px]">
        <div className="flex items-center gap-3 px-3 h-9 border-b border-borderSubtle shrink-0">
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-textPrimary">
            <Flame className="w-3.5 h-3.5 text-select" /> Order-Book Heatmap
            <span className="text-textMuted">· {activeTicker}</span>
          </span>
          <Legend />
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden sm:inline font-mono text-[9px] uppercase tracking-wider text-textMuted">streaming ~11/s</span>
            <SegmentedControl
              options={CHART_OPTIONS}
              value={chartType}
              onChange={setChartType}
              ariaLabel="Price rendering"
            />
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <LiquidityMap ticker={activeTicker} spot={spot} fill chartType={chartType} />
        </div>
      </div>

      {/* One-line read — compact, sits under the fold instead of stealing height */}
      <p className="flex items-start gap-2 text-[11px] text-textSecondary leading-relaxed px-1">
        <Info className="w-3.5 h-3.5 text-textMuted mt-px shrink-0" />
        <span>
          <span className="font-mono font-semibold uppercase tracking-wider mr-1.5 holo-text">Reading the book</span>
          Bright horizontal bands are thick resting liquidity — walls price pauses at. It either absorbs (the band thins and
          holds) or breaks (the band pulls and price passes through). Bubbles mark executed size at the aggressor; the ladder
          on the right is the live book — green bids below spot, red asks above. The field streams right to left inside a fixed
          frame, and swaps for a real depth-of-book feed behind the same view.
        </span>
      </p>
    </div>
  );
};

export default LiquidityDesk;
