import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarketData } from '../../context/MarketDataContext';
import { buildOiHeat, rowWords } from '../../data/oiHeat';
import OiHeatPanel from '../../components/gex/OiHeatPanel';
import Panel from '../../components/ui/Panel';
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
  const navigate = useNavigate();

  const feed = useMemo(() => {
    if (!marketData) return null;
    const snaps = Simulator.getGexHistory(marketData.ticker) ?? [];
    const bars = Simulator.getCandles(marketData.ticker) ?? [];
    /*
      ONE buildOiHeat for the whole page. The grid and the rail lists both
      derive from THIS result — computed fresh each tick (marketData is a
      new object per tick) and handed to the panel, because two separate
      computations against in-place-mutated arrays can straddle a session
      roll: measured as a rail honestly saying "nothing yet this session"
      beside a grid still drawing the previous one.
    */
    const heat = buildOiHeat(snaps, bars, 10);
    const byNet = [...heat.rows].sort((a, b) => b.netToday - a.netToday);
    return {
      snaps,
      bars,
      heat,
      builders: byNet.filter(r => r.netToday > 0).slice(0, 5),
      bleeders: byNet.filter(r => r.netToday < 0).slice(-5).reverse(),
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

      <div className="flex-1 flex flex-col xl:flex-row gap-4 min-h-0">
        <div className="border border-borderSubtle bg-panel rounded-md p-2 flex-1 min-h-0 flex">
          <OiHeatPanel
            fill
            heat={feed.heat}
            snaps={feed.snaps}
            bars={feed.bars}
            buckets={10}
            maxRows={18}
            ticker={marketData.ticker}
            spot={marketData.spot}
            onSelectStrike={s => navigate('/pulse', { state: { focusPrice: s } })}
          />
        </div>

        {/* The verdict lists — the grid answers "what moved when", these
            answer "so which walls are growing and which are dying". */}
        <div className="xl:w-[320px] shrink-0 flex flex-col gap-4 min-h-0">
          {([
            ['Building', feed.builders, 'text-bull', '↑'],
            ['Bleeding', feed.bleeders, 'text-bear', '↓'],
          ] as const).map(([title, rows, ink, arrow]) => (
            <Panel key={title} title={title} subtitle={title === 'Building' ? 'the shelves being added to' : 'the shelves draining'} className="w-full flex-1" bodyClassName="flex flex-col gap-1.5">
              {rows.length === 0 ? (
                <span className="font-mono text-[10px] text-textMuted">Nothing yet this session.</span>
              ) : (
                rows.map(r => (
                  <div
                    key={r.strike}
                    title={rowWords(r)}
                    onClick={() => navigate('/pulse', { state: { focusPrice: r.strike } })}
                    className="flex items-baseline gap-2 cursor-pointer hover:bg-white/[0.02] transition-colors rounded-sm"
                  >
                    <span className="font-mono text-[11px] font-semibold tnum text-textPrimary">{r.strike}</span>
                    <span className={`font-mono text-[10px] font-semibold tnum ${ink}`}>
                      {arrow}{Math.abs(r.netToday).toLocaleString()}
                    </span>
                    <span className="ml-auto font-mono text-[9px] text-textMuted">contracts</span>
                  </div>
                ))
              )}
            </Panel>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OiHeatScreen;
