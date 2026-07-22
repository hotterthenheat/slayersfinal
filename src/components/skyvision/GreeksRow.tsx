import type { SetupGreeks } from '../../types/skyvision';

interface GreeksRowProps {
  greeks: SetupGreeks;
  /** show vega (monitor) vs iv (compact card) in the 4th slot */
  fourth?: 'vega' | 'iv';
}

interface CellProps {
  label: string;
  value: string;
  arrow?: 'up' | 'down' | null;
  tone?: string;
}

const Cell = ({ label, value, arrow = null, tone = 'text-textPrimary' }: CellProps) => (
  <div className="flex flex-col gap-1 px-3 py-2">
    <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">{label}</span>
    <span className={`font-mono text-xs font-semibold tnum flex items-center gap-1 ${tone}`}>
      {arrow === 'up' && <span className="text-bull">▲</span>}
      {arrow === 'down' && <span className="text-bear">▼</span>}
      {value}
    </span>
  </div>
);

const GreeksRow = ({ greeks, fourth = 'vega' }: GreeksRowProps) => {
  return (
    <div className="grid grid-cols-4 border border-borderSubtle bg-inset rounded-md divide-x divide-borderSubtle">
      <Cell label="Delta" value={greeks.delta.toFixed(2)} arrow={greeks.delta >= 0 ? 'up' : 'down'} />
      <Cell label="Gamma" value={greeks.gamma.toFixed(4)} />
      <Cell label="Theta" value={greeks.theta.toFixed(2)} tone="text-warn" />
      {fourth === 'vega' ? (
        <Cell label="Vega" value={greeks.vega.toFixed(2)} arrow="up" tone="text-select" />
      ) : (
        <Cell label="IV" value={`${greeks.iv.toFixed(1)}%`} />
      )}
    </div>
  );
};

export default GreeksRow;
