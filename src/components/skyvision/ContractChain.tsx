import Panel from '../ui/Panel';
import SpotRule from '../ui/SpotRule';
import type { ChainAction, ChainSide, ContractChain as ContractChainData, Momentum, OptionRight } from '../../types/skyvision';

export interface ChainSelection {
  ticker: string;
  strike: number;
  right: OptionRight;
}

interface ContractChainProps {
  data: ContractChainData;
  selected: ChainSelection | null;
  onSelect: (sel: ChainSelection) => void;
}

// Neutral is deliberately the quietest tone — signals (green/red) should stand
// out against it, not compete with a bright neutral.
const momentumText: Record<Momentum, string> = {
  STRENGTHENING: 'text-bull',
  NEUTRAL: 'text-textMuted',
  WEAKENING: 'text-bear',
};

// Escalating severity: calm → amber → red. Only the genuinely-bad tier is red,
// so the panel reads as data instead of a wall of alerts.
const actionStyle: Record<ChainAction, string> = {
  HOLD: 'border-borderSubtle text-textSecondary bg-transparent',
  REDUCE: 'border-warn/30 text-warn bg-warn/5',
  SELL: 'border-bear/40 text-bear bg-bear/10 font-semibold',
};

const healthText = (h: number): string => (h >= 56 ? 'text-bull' : h >= 45 ? 'text-textSecondary' : 'text-bear');

interface CellProps {
  side: ChainSide;
  right: OptionRight;
  strike: number;
  ticker: string;
  isSelected: boolean;
  onSelect: () => void;
}

const ChainCell = ({ side, right, strike, ticker, isSelected, onSelect }: CellProps) => {
  const label = `${ticker} ${strike % 1 === 0 ? strike.toFixed(0) : strike.toFixed(2)}${right}`;
  // Premium is a price, not a signal — always neutral. Direction lives in the
  // change %, colored by its actual sign.
  const changeUp = side.changePct >= 0;

  return (
    <button
      onClick={onSelect}
      className={`text-left px-2.5 py-2 transition-colors ${
        isSelected ? 'bg-select/[0.07] shadow-[inset_0_0_0_1px_rgba(199,211,232,0.5)]' : 'hover:bg-white/[0.02]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-label font-semibold text-textPrimary">{label}</span>
        <span className="text-right leading-tight">
          <span className="block font-mono text-label font-semibold tnum text-textPrimary">${side.premium.toFixed(2)}</span>
          <span className={`block font-mono text-micro tnum ${changeUp ? 'text-bull' : 'text-bear'}`}>
            {changeUp ? '+' : ''}{side.changePct}%
          </span>
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="font-mono text-micro text-textMuted uppercase tracking-wide">
          Health <span className={healthText(side.health)}>{side.health}</span>
        </span>
        <span className={`font-mono text-micro uppercase tracking-wide ${momentumText[side.momentum]}`}>
          {side.momentum}
        </span>
        <span
          className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-micro font-semibold uppercase ${actionStyle[side.action]}`}
        >
          {side.action}
        </span>
      </div>
    </button>
  );
};

const ContractChain = ({ data, selected, onSelect }: ContractChainProps) => {
  const { ticker, spot, rows } = data;

  // Find where the live price sits so the marker embeds between strikes
  let spotRowIndex = rows.findIndex(r => r.strike > spot) - 1;
  if (spotRowIndex < -1) spotRowIndex = rows.length - 1; // spot above all strikes

  return (
    <Panel
      title="Contract Chain"
      subtitle="health · momentum · premium"
      flush
      className="w-full h-full"
      bodyClassName="flex flex-col"
    >
      {/* Column headers */}
      <div className="grid grid-cols-2 border-b border-borderSubtle">
        <div className="px-3 py-1.5 font-mono text-micro font-semibold uppercase tracking-widest text-bull border-r border-borderSubtle">
          Calls
        </div>
        <div className="px-3 py-1.5 font-mono text-micro font-semibold uppercase tracking-widest text-bear">Puts</div>
      </div>

      <div className="overflow-y-auto flex-1 min-h-0 max-h-[560px] xl:max-h-none">
        {rows.map((row, i) => (
          <div key={row.strike}>
            <div className="grid grid-cols-2 border-b border-borderSubtle/50 divide-x divide-borderSubtle">
              <ChainCell
                side={row.call}
                right="C"
                strike={row.strike}
                ticker={ticker}
                isSelected={selected?.strike === row.strike && selected?.right === 'C'}
                onSelect={() => onSelect({ ticker, strike: row.strike, right: 'C' })}
              />
              <ChainCell
                side={row.put}
                right="P"
                strike={row.strike}
                ticker={ticker}
                isSelected={selected?.strike === row.strike && selected?.right === 'P'}
                onSelect={() => onSelect({ ticker, strike: row.strike, right: 'P' })}
              />
            </div>

            {/* Embedded live-price marker — slides to sit under the strike it just crossed */}
            {i === spotRowIndex && (
              <div className="px-3 py-1">
                <SpotRule ticker={ticker} price={spot} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Selected footer */}
      <div className="px-3 py-2 border-t border-borderSubtle font-mono text-micro uppercase tracking-widest text-textMuted">
        Selected:{' '}
        <span className="text-textPrimary">
          {selected ? `${selected.ticker} ${selected.strike}${selected.right}` : '—'}
        </span>
      </div>
    </Panel>
  );
};

export default ContractChain;
