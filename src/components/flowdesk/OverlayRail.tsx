import type { LiqChartType, LiqOverlays } from './LiquidityMap';
import SegmentedControl from '../ui/SegmentedControl';

/**
 * The overlay control rail — a row of mini switches that flip each overlay on
 * the shared order-flow heatmap, plus the price-rendering selector.
 * Presentational only; state lives in the host.
 */
const OVERLAY_DEFS: { key: keyof LiqOverlays; label: string }[] = [
  { key: 'flow', label: 'Flow' },
  { key: 'volume', label: 'Volume' },
  { key: 'delta', label: 'Delta' },
  { key: 'darkpool', label: 'Dark Pool' },
  { key: 'crosshair', label: 'Crosshair' },
];

const CHART_OPTIONS = [
  { value: 'candle', label: 'Candles' },
  { value: 'line', label: 'Line' },
  { value: 'bubbles', label: 'Bubbles' },
] as const;

interface OverlayRailProps {
  overlays: LiqOverlays;
  onToggle: (key: keyof LiqOverlays) => void;
  chartType: LiqChartType;
  onChartType: (t: LiqChartType) => void;
  dense?: boolean;
}

const Switch = ({ on }: { on: boolean }) => (
  <span className={`relative inline-block w-6 h-3 rounded-full transition-colors ${on ? 'bg-select/40' : 'bg-white/10'}`}>
    <span
      className={`absolute top-0.5 h-2 w-2 rounded-full transition-all ${on ? 'left-3 bg-select' : 'left-0.5 bg-textMuted'}`}
    />
  </span>
);

const OverlayRail = ({ overlays, onToggle, chartType, onChartType, dense }: OverlayRailProps) => (
  <div className={`flex items-center gap-x-1 gap-y-1.5 flex-wrap ${dense ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
    {OVERLAY_DEFS.map(def => {
      const on = overlays[def.key];
      return (
        <button
          key={def.key}
          onClick={() => onToggle(def.key)}
          aria-pressed={on}
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md font-mono text-[10px] uppercase tracking-wider transition-colors ${
            on ? 'text-textPrimary bg-white/[0.03]' : 'text-textMuted hover:text-textSecondary'
          }`}
        >
          <Switch on={on} />
          {def.label}
        </button>
      );
    })}
    <div className="ml-auto">
      <SegmentedControl options={CHART_OPTIONS} value={chartType} onChange={onChartType} ariaLabel="Price rendering" />
    </div>
  </div>
);

export default OverlayRail;
