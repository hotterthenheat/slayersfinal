import { useState } from 'react';
import LiquidityMap, { type LiqChartType } from './LiquidityMap';

/**
 * Pulse-tile wrapper around the LiquidityMap — the same order-book heatmap the
 * Trace desk runs, with its own compact price-rendering toggle so the map can
 * live on the workspace next to the other charts.
 */
const OPTIONS: { value: LiqChartType; label: string }[] = [
  { value: 'candle', label: 'Candles' },
  { value: 'line', label: 'Line' },
  { value: 'bubbles', label: 'Bubbles' },
];

const LiquidityPanel = ({ ticker, spot }: { ticker: string; spot: number }) => {
  const [type, setType] = useState<LiqChartType>('candle');
  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-borderSubtle shrink-0">
        {OPTIONS.map(o => (
          <button
            key={o.value}
            onClick={() => setType(o.value)}
            aria-pressed={type === o.value}
            className={`px-2 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider transition-colors ${
              type === o.value ? 'bg-white/[0.08] text-textPrimary' : 'text-textMuted hover:text-textSecondary'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        <LiquidityMap ticker={ticker} spot={spot} fill chartType={type} />
      </div>
    </div>
  );
};

export default LiquidityPanel;
