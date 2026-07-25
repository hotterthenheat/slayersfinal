import { useState } from 'react';
import LiquidityHeatmapChart from './LiquidityHeatmapChart';
import OverlayRail from './OverlayRail';
import { DEFAULT_OVERLAYS, type LiqDPLevel, type LiqOverlays } from './liquidityTypes';
import type { KeyLevels, NodeLevel } from '../../types/gex';

/**
 * Pulse-tile liquidity terminal. Owns the layer toggles and drives the
 * TradingView-style chart. The chart builds the TIME x PRICE liquidity book
 * itself (it owns the bars); this panel just routes the dealer/flow inputs in.
 * Toggling a layer never rebuilds the chart (the chart reads flags per effect).
 */
const LiquidityPanel = ({
  ticker,
  spot,
  revision,
  levels,
  darkPoolLevels,
  nodes,
  oiByStrike,
  orderFlow,
  focusPrice,
}: {
  ticker: string;
  spot: number;
  revision: number;
  levels: KeyLevels;
  darkPoolLevels?: LiqDPLevel[];
  nodes?: NodeLevel[];
  oiByStrike?: { strike: number; oi: number }[];
  orderFlow?: { vwap: number; poc: number };
  focusPrice?: number | null;
}) => {
  const [overlays, setOverlays] = useState<LiqOverlays>(DEFAULT_OVERLAYS);
  const toggle = (key: keyof LiqOverlays) => setOverlays(o => ({ ...o, [key]: !o[key] }));

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="border-b border-borderSubtle shrink-0">
        <OverlayRail overlays={overlays} onToggle={toggle} dense />
      </div>
      <div className="flex-1 min-h-0 p-2">
        <LiquidityHeatmapChart
          ticker={ticker}
          revision={revision}
          spot={spot}
          levels={levels}
          overlays={overlays}
          darkPoolLevels={darkPoolLevels}
          oiByStrike={oiByStrike}
          nodes={nodes?.map(n => ({ strike: n.strike, value: n.value }))}
          orderFlow={orderFlow}
          focusPrice={focusPrice}
        />
      </div>
    </div>
  );
};

export default LiquidityPanel;
