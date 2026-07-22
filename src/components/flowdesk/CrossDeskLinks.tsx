import { useNavigate } from 'react-router-dom';
import { Crosshair, Compass, ScanLine } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';

interface CrossDeskLinksProps {
  ticker: string;
  strike: number;
  right: 'C' | 'P';
  /** Called before navigating so the host drawer can close itself. */
  onNavigate?: () => void;
}

/**
 * Connective tissue — jump from a contract drilldown straight to the desk that
 * explains the next question. Uses Compass's existing `monitor` / `weigh`
 * deep-link state and Pinpoint's shared active ticker, so the destination lands
 * pre-focused on this exact name and strike.
 */
const CrossDeskLinks = ({ ticker, strike, right, onNavigate }: CrossDeskLinksProps) => {
  const navigate = useNavigate();
  const { changeTicker } = useMarketData();

  const go = (fn: () => void) => {
    onNavigate?.();
    fn();
  };

  const btn =
    'inline-flex items-center justify-center gap-1.5 flex-1 min-w-[92px] px-2.5 py-2 rounded border border-borderSubtle bg-white/[0.02] font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors';

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-widest text-textSecondary">Open in</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() =>
            go(() => {
              changeTicker(ticker);
              navigate('/pinpoint/exposure-profile');
            })
          }
          className={btn}
        >
          <Crosshair className="w-3.5 h-3.5" /> Dealer map
        </button>
        <button
          type="button"
          onClick={() =>
            go(() =>
              navigate('/compass', {
                state: { monitor: { ticker, strike, right, scanner: 'top-setups' } },
              })
            )
          }
          className={btn}
        >
          <ScanLine className="w-3.5 h-3.5" /> Monitor strike
        </button>
        <button
          type="button"
          onClick={() => go(() => navigate('/compass', { state: { weigh: { ticker } } }))}
          className={btn}
        >
          <Compass className="w-3.5 h-3.5" /> Weigh
        </button>
      </div>
    </div>
  );
};

export default CrossDeskLinks;
