import { useMemo } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import OiHeatPanel from '../../components/gex/OiHeatPanel';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import Term from '../../components/ui/Term';
import Simulator from '../../core/simulator';

/*
==================================================
  SLAYER TERMINAL - ΔOI THROUGH THE SESSION — P-8
  (pages/pinpoint/OiHeatScreen.tsx)
==================================================

  The directive's own words: "Screen. Rows = strikes, columns = time."
  This started life as a side panel on Exposure Profile — against the
  spec's assignment — where twelve rows and a caption were all the room it
  had. As a screen it earns the full grid, the matrix chrome, and the spot
  rule between its rows.

  Every other exposure surface is a snapshot of a stock. This is the flow:
  is that wall growing or dying, which the static map cannot answer.
*/

const OiHeatScreen = () => {
  const { marketData } = useMarketData();

  const feed = useMemo(() => {
    if (!marketData) return null;
    return {
      snaps: Simulator.getGexHistory(marketData.ticker) ?? [],
      bars: Simulator.getCandles(marketData.ticker) ?? [],
    };
  }, [marketData]);

  if (!feed || !marketData) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-[11px] uppercase tracking-widest text-textMuted">
        Awaiting the book…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 flex-grow min-h-0">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-mono text-[12px] font-bold uppercase tracking-widest text-textPrimary">
          <Term k="ΔOI heat">ΔOI Through The Session</Term>
        </h2>
        <ProvenanceChip sources={['chain', 'exposure']} />
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-textMuted">
          Is that wall growing or dying — change, not level
        </span>
      </div>

      <div className="border border-borderSubtle bg-panel rounded-md p-2 flex-1 min-h-0 flex">
        <OiHeatPanel
          fill
          snaps={feed.snaps}
          bars={feed.bars}
          buckets={10}
          maxRows={18}
          ticker={marketData.ticker}
          spot={marketData.spot}
        />
      </div>
    </div>
  );
};

export default OiHeatScreen;
