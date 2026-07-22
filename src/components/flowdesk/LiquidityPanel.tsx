import { useState } from 'react';
import LiquidityMap, { DEFAULT_OVERLAYS, type LiqChartType, type LiqDPLevel, type LiqOverlays } from './LiquidityMap';
import HeatseekerRail from './HeatseekerRail';

/**
 * Pulse-tile order-flow terminal — the Heatseeker surface. Owns the overlay and
 * price-rendering state and drives the shared heatmap through the control rail.
 * Toggling an overlay never restarts the stream (the map reads state from refs).
 */
const LiquidityPanel = ({
  ticker,
  spot,
  darkPoolLevels,
}: {
  ticker: string;
  spot: number;
  darkPoolLevels?: LiqDPLevel[];
}) => {
  const [overlays, setOverlays] = useState<LiqOverlays>(DEFAULT_OVERLAYS);
  const [chartType, setChartType] = useState<LiqChartType>('candle');
  const toggle = (key: keyof LiqOverlays) => setOverlays(o => ({ ...o, [key]: !o[key] }));

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="border-b border-borderSubtle shrink-0">
        <HeatseekerRail overlays={overlays} onToggle={toggle} chartType={chartType} onChartType={setChartType} dense />
      </div>
      <div className="flex-1 min-h-0">
        <LiquidityMap ticker={ticker} spot={spot} fill chartType={chartType} overlays={overlays} darkPoolLevels={darkPoolLevels} />
      </div>
    </div>
  );
};

export default LiquidityPanel;
