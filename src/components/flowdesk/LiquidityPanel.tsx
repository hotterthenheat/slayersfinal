import { useMemo, useState } from 'react';
import LiquidityHeatmapChart from './LiquidityHeatmapChart';
import OverlayRail from './OverlayRail';
import { DEFAULT_OVERLAYS, type LiqDPLevel, type LiqOverlays } from './liquidityTypes';
import { buildLiquidityField } from '../../data/liquidityField';
import type { KeyLevels, NodeLevel, DeltaByPrice } from '../../types/gex';

/**
 * Pulse-tile liquidity terminal. Owns the layer toggles and drives the
 * TradingView-style chart. Builds the resting-liquidity field from the real
 * dealer/flow inputs and memoizes it so a tick re-blends without churn; toggling
 * a layer never rebuilds the chart (the chart reads flags per effect).
 */
const LiquidityPanel = ({
  ticker,
  spot,
  revision,
  levels,
  darkPoolLevels,
  nodes,
  oiByStrike,
  deltaByPrice,
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
  deltaByPrice?: DeltaByPrice[];
  orderFlow?: { vwap: number; poc: number };
  focusPrice?: number | null;
}) => {
  const [overlays, setOverlays] = useState<LiqOverlays>(DEFAULT_OVERLAYS);
  const toggle = (key: keyof LiqOverlays) => setOverlays(o => ({ ...o, [key]: !o[key] }));

  const field = useMemo(
    () =>
      buildLiquidityField({
        spot,
        levels,
        darkPool: darkPoolLevels,
        oi: oiByStrike,
        nodes: nodes?.map(n => ({ strike: n.strike, value: n.value })),
        deltaByPrice: deltaByPrice?.map(d => ({ price: d.price, value: d.value })),
      }),
    // Re-blend when the session advances or the symbol changes; the inputs are
    // all derived from the same revision, so this keys cleanly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticker, revision]
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="border-b border-borderSubtle shrink-0">
        <OverlayRail overlays={overlays} onToggle={toggle} dense />
      </div>
      <div className="flex-1 min-h-0 p-2">
        <LiquidityHeatmapChart
          ticker={ticker}
          revision={revision}
          levels={levels}
          field={field}
          overlays={overlays}
          darkPoolLevels={darkPoolLevels}
          orderFlow={orderFlow}
          focusPrice={focusPrice}
        />
      </div>
    </div>
  );
};

export default LiquidityPanel;
