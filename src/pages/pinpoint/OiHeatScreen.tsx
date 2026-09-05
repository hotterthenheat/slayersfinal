import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarketData } from '../../context/MarketDataContext';
import { buildOiHeat, rowWords } from '../../data/oiHeat';
import OiHeatPanel from '../../components/gex/OiHeatPanel';
import Panel from '../../components/ui/Panel';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import Term from '../../components/ui/Term';
import Simulator from '../../core/simulator';
import OvernightOiPanel from '../../components/gex/OvernightOiPanel';
import { OiAsOf, estimatedInk } from '../../components/ui/AsOf';

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

/* 5.7's explainer, in one place so the hatched panels, the chip and the
   paragraph under them can never drift apart. */
const INTRADAY_OI_NOTE =
  'Intraday open interest is an ESTIMATE. Exchanges publish OI once a day, after the close — everything above is this session\'s change inferred by comparing snapshots of the book, and it will be revised when the settled file lands tomorrow morning. The overnight panel is that settled file: a published fact, not an inference. Hatched means estimated; solid means settled.';

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
        <span className="ml-auto flex items-center gap-2.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">
            Is that wall growing or dying — change, not level
          </span>
          {/* THIS page is the one that most needs the date: a same-session ΔOI
              is an ESTIMATE against a settled baseline, and the two numbers
              come from different days. */}
          <OiAsOf />
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
            /* 5.7 — ESTIMATED, AND IT LOOKS IT.

               These two lists are same-session ΔOI: snapshot against
               snapshot, an INFERENCE about a number the OCC will not
               publish until tomorrow morning. The overnight panel below is
               the settled file. Both are open interest, both are printed in
               contracts, and before this they looked identical — so a
               reader had no way to tell the guess from the fact except by
               reading a caption.

               The hatch is `estimatedInk`, the shared treatment: hatched
               while it is an estimate, solid once the settlement it is
               guessing at has landed. Same rule everywhere it appears. */
            <Panel
              key={title}
              title={title}
              subtitle={title === 'Building' ? 'the shelves being added to — estimated' : 'the shelves draining — estimated'}
              className={`w-full flex-1 ${estimatedInk(false)}`}
              bodyClassName="flex flex-col gap-1.5"
              actions={
                <span
                  className="font-mono text-[9px] uppercase tracking-wider text-warn/80 whitespace-nowrap"
                  title={INTRADAY_OI_NOTE}
                >
                  estimated
                </span>
              }
            >
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

      {/* THE OTHER VINTAGE. Everything above is the SESSION — snapshot
          against snapshot, which strikes are being built right now. Open
          interest itself is only published once a day, after the close, so
          the overnight change is the one version of this number that is a
          published fact rather than an inference. Two surfaces, two
          vintages, and they sit together because a reader comparing "being
          built now" with "settled last night" is doing the actual work. */}
      <OvernightOiPanel ticker={marketData.ticker} className="w-full" />

      {/* 5.7's explainer, once, under both vintages — the reader who has
          just seen a hatched panel and a solid one beside it is exactly the
          reader with the question. */}
      <p className="px-1 pb-1 text-[11px] leading-snug text-textMuted">
        {INTRADAY_OI_NOTE}
      </p>
    </div>
  );
};

export default OiHeatScreen;
