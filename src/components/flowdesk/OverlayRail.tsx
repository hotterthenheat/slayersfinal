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

const OverlayRail = ({ overlays, onToggle, chartType, onChartType, dense }: OverlayRailProps) => (
  <div className={`flex items-center gap-3 flex-wrap ${dense ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
    {/* Overlays are independent toggles, but rendered as one segmented group so
        the control matches the house SegmentedControl used everywhere else
        (active = filled) instead of an off-pattern row of sliding switches. */}
    <div
      role="group"
      aria-label="Chart overlays"
      className="inline-flex items-center inst-surface rounded-md overflow-hidden max-w-full overflow-x-auto no-scrollbar"
    >
      {OVERLAY_DEFS.map((def, i) => {
        const on = overlays[def.key];
        return (
          <button
            key={def.key}
            onClick={() => onToggle(def.key)}
            aria-pressed={on}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 font-mono text-caption font-medium transition-colors ${
              i > 0 ? 'border-l border-borderSubtle' : ''
            } ${on ? 'bg-white/[0.08] text-textPrimary' : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.03]'} leading-4`}
          >
            {def.label}
          </button>
        );
      })}
    </div>
    <div className="ml-auto">
      <SegmentedControl options={CHART_OPTIONS} value={chartType} onChange={onChartType} ariaLabel="Price rendering" />
    </div>
  </div>
);

export default OverlayRail;
