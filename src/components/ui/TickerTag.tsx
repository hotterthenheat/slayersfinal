import { useMarketData } from '../../context/MarketDataContext';
import { useToast } from './Toast';

interface TickerTagProps {
  symbol: string;
  /** Type/color classes for the symbol itself — TickerTag only adds the
      click affordance, so it inherits whatever the surrounding text uses. */
  className?: string;
}

/**
 * A ticker symbol you can click to load it everywhere. The active symbol is
 * global session state, so a tag on any desk jumps the whole terminal to that
 * name. Stops propagation so it still works inside an already-clickable row.
 */
const TickerTag = ({ symbol, className = '' }: TickerTagProps) => {
  const { activeTicker, changeTicker } = useMarketData();
  const toast = useToast();
  const active = symbol === activeTicker;

  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation();
        if (active) return;
        changeTicker(symbol);
        toast.info(`Now viewing ${symbol}`);
      }}
      title={active ? `${symbol} — active symbol` : `Switch the terminal to ${symbol}`}
      className={`rounded-[3px] -mx-0.5 px-0.5 cursor-pointer transition-colors hover:bg-select/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select/60 ${className}`}
    >
      {symbol}
    </button>
  );
};

export default TickerTag;
