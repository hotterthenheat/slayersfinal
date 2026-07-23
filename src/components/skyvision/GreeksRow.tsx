import type { ReactNode } from 'react';
import Stat from '../ui/Stat';
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
  return (
    <div className="grid grid-cols-4 gap-2">
      <Stat label="Delta" value={withArrow(greeks.delta.toFixed(2), greeks.delta >= 0 ? 'up' : 'down')} />
      <Stat label="Gamma" value={greeks.gamma.toFixed(4)} />
      <Stat label="Theta" value={greeks.theta.toFixed(2)} tone="warn" />
      {fourth === 'vega' ? (
        <Stat label="Vega" value={withArrow(greeks.vega.toFixed(2), 'up')} tone="select" />
      ) : (
        <Stat label="IV" value={`${greeks.iv.toFixed(1)}%`} />
      )}
    </div>
  );
};

export default GreeksRow;
