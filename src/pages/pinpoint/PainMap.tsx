import { Fragment, useMemo } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildStrikeBasis } from '../../data/costBasis';
import { fmtUsd } from '../../data/gex';
import PainMapPanel from '../../components/gex/PainMapPanel';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import SpotRule from '../../components/ui/SpotRule';
import Term from '../../components/ui/Term';
import Simulator from '../../core/simulator';

/*
==================================================
  SLAYER TERMINAL - THE PAIN MAP — P-16
  (pages/pinpoint/PainMap.tsx)
==================================================

  The directive calls this the highest-defensibility screen in the product
  and specifies its geometry: the strike ladder, with cost basis and
  unrealized P&L per row — strikes where holders sit deep underwater glow
  one way, deep in profit the other. It shipped first as a side panel
  carrying only the two bands; this is the screen the spec asked for.

  THE GLOW IS DIRECTION INK — bull green for holders in profit, bear red
  for holders underwater — because money up or down is the one thing
  red/green mean everywhere on this desk. Basis columns are plain figures:
  a price paid has no side and no direction.

  THE BANDS LEAD, because the flip level is the read a visitor came for;
  the ladder under them is where it lives strike by strike. Same engine,
  same tape, same tolerance as the bands — a ladder that disagreed with
  its own headline would be two products in a trench coat.
*/

const DTE_YEARS = 30 / 365;

const PainMap = () => {
  const { marketData, flowTape } = useMarketData();

  const ladder = useMemo(() => {
    if (!marketData || marketData.chain.length === 0) return null;
    const iv = Simulator.TICKERS[marketData.ticker]?.iv ?? 0.2;
    const step = marketData.chain.length > 1 ? Math.abs(marketData.chain[1].strike - marketData.chain[0].strike) : 1;
    /* The window the profile uses: nearest strikes both sides of spot. */
    const strikes = [...new Set(marketData.chain.map(n => n.strike))]
      .sort((a, b) => Math.abs(a - marketData.spot) - Math.abs(b - marketData.spot))
      .slice(0, 21)
      .sort((a, b) => b - a);
    const rows = strikes.map(strike => {
      const call = buildStrikeBasis(flowTape, strike, 'C', marketData.spot, DTE_YEARS, iv, step / 2);
      const put = buildStrikeBasis(flowTape, strike, 'P', marketData.spot, DTE_YEARS, iv, step / 2);
      const pnl = (call.unrealized ?? 0) + (put.unrealized ?? 0);
      const hasPnl = call.unrealized !== null || put.unrealized !== null;
      return { strike, call, put, pnl: hasPnl ? pnl : null };
    });
    const maxAbsPnl = Math.max(...rows.map(r => Math.abs(r.pnl ?? 0)), 1e-9);
    const spotAfter = rows.findIndex((r, i) => r.strike >= marketData.spot && (rows[i + 1]?.strike ?? -Infinity) < marketData.spot);
    return { rows, maxAbsPnl, spotAfter, iv };
  }, [marketData, flowTape]);

  if (!marketData || !ladder) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-[11px] uppercase tracking-widest text-textMuted">
        Awaiting the tape…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 flex-grow min-h-0">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-mono text-[12px] font-bold uppercase tracking-widest text-textPrimary">
          <Term k="Cost basis">Pain Map</Term>
        </h2>
        <ProvenanceChip sources={['prints', 'carry']} />
      </div>

      {/* The bands — where today's buyers collectively flip. */}
      <div className="border border-borderSubtle bg-panel rounded-md p-3">
        <PainMapPanel prints={flowTape} spot={marketData.spot} dteYears={DTE_YEARS} iv={ladder.iv} />
      </div>

      {/* The ladder — the same read, strike by strike. */}
      <div className="border border-borderSubtle bg-panel rounded-md p-2 overflow-auto flex-1 min-h-0">
        <table className="w-full h-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#0c0c0c]">
              {['Strike', 'Call basis', 'Put basis', 'Contracts', 'Unrealized P&L', ''].map((h, i) => (
                <th
                  key={h || i}
                  className={`px-2 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-textMuted border-b border-borderSubtle ${
                    i === 0 ? 'w-px text-left whitespace-nowrap' : 'text-right'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ladder.rows.map((r, i) => {
              const underwater = r.pnl !== null && r.pnl < 0;
              const green = r.pnl !== null && r.pnl > 0;
              const w = r.pnl === null ? 0 : (Math.abs(r.pnl) / ladder.maxAbsPnl) * 100;
              return (
                <Fragment key={r.strike}>
                  <tr className="border-b border-borderSubtle/40 last:border-0">
                    <td className="w-px px-2 py-1 font-mono text-[11px] font-semibold tnum text-textPrimary whitespace-nowrap">
                      {r.strike}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-[10px] tnum text-textSecondary">
                      {r.call.basis === null ? '—' : r.call.basis.toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-[10px] tnum text-textSecondary">
                      {r.put.basis === null ? '—' : r.put.basis.toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-[10px] tnum text-textMuted">
                      {r.call.contracts + r.put.contracts > 0 ? (r.call.contracts + r.put.contracts).toLocaleString() : '·'}
                    </td>
                    <td
                      className={`px-2 py-1 text-right font-mono text-[10px] font-semibold tnum ${
                        underwater ? 'text-bear' : green ? 'text-bull' : 'text-textMuted'
                      }`}
                    >
                      {r.pnl === null ? '—' : fmtUsd(r.pnl)}
                    </td>
                    <td className="px-2 py-1 w-[26%]">
                      <span className="block h-[3px] w-full rounded-full bg-white/[0.04]">
                        <span
                          className={`block h-full rounded-full ${underwater ? 'bg-bear/80' : 'bg-bull/80'}`}
                          style={{ width: `${w}%` }}
                        />
                      </span>
                    </td>
                  </tr>
                  {i === ladder.spotAfter && (
                    <tr>
                      <td colSpan={6} className="px-2 py-1">
                        <SpotRule ticker={marketData.ticker} price={marketData.spot} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-[9px] leading-relaxed text-textMuted">
        Basis is the volume-weighted fill of today's AGGRESSIVE LONGS at each strike — ask-side prints only, both
        rights. P&L is marked against the model at the current spot, green in profit and red underwater: when
        price crosses a row's basis, every holder in it flips at once.
      </p>
    </div>
  );
};

export default PainMap;
