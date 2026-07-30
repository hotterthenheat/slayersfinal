import { useState, type ReactNode } from 'react';
import Stat from '../ui/Stat';
import HoverReadout from '../ui/HoverReadout';
import type { SetupGreeks } from '../../types/skyvision';

interface GreeksRowProps {
  greeks: SetupGreeks;
  /** show vega (monitor) vs iv (compact card) in the 4th slot */
  fourth?: 'vega' | 'iv';
}

/** Prefix a directional arrow onto a value — ▲ bull / ▼ bear, colour independent of the value's tone. */
const withArrow = (value: string, arrow?: 'up' | 'down'): ReactNode =>
  arrow ? (
    <span className="flex items-center gap-1">
      <span className={arrow === 'up' ? 'text-bull' : 'text-bear'}>{arrow === 'up' ? '▲' : '▼'}</span>
      {value}
    </span>
  ) : (
    value
  );

const GreeksRow = ({ greeks, fourth = 'vega' }: GreeksRowProps) => {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  return (
    <div
      onMouseEnter={e => setHover({ x: e.clientX, y: e.clientY })}
      onMouseMove={e => setHover({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setHover(null)}
      className="grid grid-cols-4 gap-2 cursor-crosshair rounded-md hover:bg-rowHover"
    >
      <Stat label="Delta" value={withArrow(greeks.delta.toFixed(2), greeks.delta >= 0 ? 'up' : 'down')} />
      <Stat label="Gamma" value={greeks.gamma.toFixed(4)} />
      <Stat label="Theta" value={greeks.theta.toFixed(2)} tone="warn" />
      {fourth === 'vega' ? (
        <Stat label="Vega" value={withArrow(greeks.vega.toFixed(2), 'up')} tone="select" />
      ) : (
        <Stat label="IV" value={`${greeks.iv.toFixed(1)}%`} />
      )}
      {/* Full set on hover — the visible row only fits four, so vega/iv never both show */}
      {hover && (
        <HoverReadout x={hover.x} y={hover.y}>
          <div className="font-mono text-micro uppercase tracking-wider text-textMuted">Greeks · full set</div>
          <div className="mt-1 flex flex-col gap-0.5">
            {(
              [
                ['Delta', greeks.delta.toFixed(2), greeks.delta >= 0 ? 'text-bull' : 'text-bear'],
                ['Gamma', greeks.gamma.toFixed(4), 'text-textPrimary'],
                ['Theta', greeks.theta.toFixed(2), 'text-warn'],
                ['Vega', greeks.vega.toFixed(2), 'text-textPrimary'],
                ['IV', `${greeks.iv.toFixed(1)}%`, 'text-textPrimary'],
              ] as const
            ).map(([label, value, cls]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 font-mono">
                <span className="text-micro uppercase tracking-wider text-textMuted">{label}</span>
                <span className={`text-caption font-bold tnum ${cls}`}>{value}</span>
              </div>
            ))}
          </div>
        </HoverReadout>
      )}
    </div>
  );
};

export default GreeksRow;
