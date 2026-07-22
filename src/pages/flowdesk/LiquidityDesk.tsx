import { useMarketData } from '../../context/MarketDataContext';
import Panel from '../../components/ui/Panel';
import LiquidityMap from '../../components/flowdesk/LiquidityMap';
import { Flame } from 'lucide-react';

/** The thermal legend — the exact ramp the heatmap uses. */
const THERMAL_CSS =
  'linear-gradient(90deg, #000000, #081240 13%, #143694 29%, #0a82c8 43%, #46d2eb 55%, #ebf5fa 65%, #fae05a 76%, #f68c28 88%, #e82828 100%)';

const Legend = () => (
  <div className="flex items-center gap-x-5 gap-y-2 flex-wrap font-mono text-[10px] uppercase tracking-wider text-textMuted">
    <span className="inline-flex items-center gap-2">
      Resting liquidity
      <span className="w-40 h-2 rounded-sm border border-borderSubtle" style={{ background: THERMAL_CSS }} />
      <span className="text-textSecondary">thin → thick</span>
    </span>
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full bg-bull/60 border border-bull/70" /> Buy trade
    </span>
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full bg-bear/60 border border-bear/70" /> Sell trade
    </span>
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3 h-[3px] bg-bull" /> / <span className="w-3 h-[3px] bg-bear" /> Candles
    </span>
    <span className="ml-auto text-textMuted">DOM ladder → · streaming 10/s</span>
  </div>
);

const LiquidityDesk = () => {
  const { activeTicker, marketData } = useMarketData();
  const spot = marketData?.spot ?? 500;

  return (
    <>
      <Legend />
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5" /> Order-Book Heatmap · {activeTicker}
          </span>
        }
        subtitle="resting bid/ask liquidity over time — candles trace price, bubbles are executed trades, the ladder is the live book"
        flush
      >
        <LiquidityMap ticker={activeTicker} spot={spot} height={560} />
      </Panel>
      <Panel bodyClassName="py-3">
        <p className="text-xs text-textSecondary leading-relaxed">
          <span className="font-mono font-semibold uppercase tracking-wider mr-2 holo-text">Reading the book</span>
          Bright horizontal bands are thick resting liquidity — walls that price tends to pause at. As price approaches a
          wall it either absorbs (the band thins and holds) or breaks (the band pulls and price passes through). Bubbles
          mark executed size at the aggressor; the ladder on the right is the current book, green bids below spot and red
          asks above. The field streams right to left inside a fixed frame — the chain drives the levels and it swaps for a
          real depth-of-book feed behind the same view.
        </p>
      </Panel>
    </>
  );
};

export default LiquidityDesk;
