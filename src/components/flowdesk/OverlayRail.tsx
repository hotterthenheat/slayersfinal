import type { LiqOverlays } from './liquidityTypes';

/**
 * The overlay control rail — a segmented group of toggles that flip each layer on
 * the liquidity chart. Presentational only; state lives in the host. Matches the
 * house SegmentedControl look (active = filled) so it reads as one control family.
 */
const OVERLAY_DEFS: { key: keyof LiqOverlays; label: string }[] = [
  { key: 'liquidity', label: 'Liquidity' },
  { key: 'flow', label: 'Flow' },
  { key: 'walls', label: 'Walls' },
  { key: 'volume', label: 'Volume' },
  { key: 'darkpool', label: 'Dark Pool' },
  { key: 'vwap', label: 'VWAP' },
];

interface OverlayRailProps {
  overlays: LiqOverlays;
  onToggle: (key: keyof LiqOverlays) => void;
  dense?: boolean;
}

const OverlayRail = ({ overlays, onToggle, dense }: OverlayRailProps) => (
  <div className={`flex items-center gap-3 flex-wrap ${dense ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
    <div
      role="group"
      aria-label="Chart layers"
      className="inline-flex items-center inst-surface rounded-md overflow-hidden max-w-full overflow-x-auto no-scrollbar"
    >
      {OVERLAY_DEFS.map((def, i) => {
        const on = overlays[def.key];
        return (
          <button
            key={def.key}
            onClick={() => onToggle(def.key)}
            aria-pressed={on}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 font-mono text-caption font-medium transition-colors leading-4 ${
              i > 0 ? 'border-l border-borderSubtle' : ''
            } ${on ? 'bg-white/[0.08] text-textPrimary' : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.03]'}`}
          >
            {def.label}
          </button>
        );
      })}
    </div>
  </div>
);

export default OverlayRail;
