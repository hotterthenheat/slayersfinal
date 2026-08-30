import { useMemo } from 'react';
import Panel from '../ui/Panel';
import DataState from '../ui/DataState';
import ProvenanceChip from '../ui/ProvenanceChip';
import { exposureFor, exposureRead, coverageOf } from '../../data/etfExposure';
import { fmtUsd } from '../../data/gex';

/*
==================================================
  SLAYER TERMINAL - ETF EXPOSURE PANEL
  (components/gex/EtfExposurePanel.tsx)
==================================================

  How much of this name is being traded by people who are not trading it.

  THE HEADLINE IS THE SHARE, NOT THE DOLLARS. "$41m bought through funds"
  means nothing without the name's own volume beside it — the same figure
  is noise in a mega cap and the whole tape in a small one. The passive
  percentage leads, and it is what changes how a reader should treat
  everything else on the page: a name that is a quarter basket-driven does
  not respond to its own earnings the way a name that is 3% does.

  SHARES, NOT DOLLARS, IN THE IMPACT COLUMN. A creation basket buys SHARES;
  the dollar figure is an artefact of where price happened to be, and a
  reader comparing against average volume needs the share count to do it.

  THE COVERAGE NOTE IS NOT A DISCLAIMER, IT IS A READING. A sector fund
  whose shelf this desk holds three names of is a different object from a
  broad fund holding five hundred, and the percentage says which you are
  looking at rather than letting the weights imply a complete book.
*/

const fmtShares = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${n}`;
};

interface EtfExposurePanelProps {
  ticker: string;
  className?: string;
}

const EtfExposurePanel = ({ ticker, className }: EtfExposurePanelProps) => {
  const e = useMemo(() => exposureFor(ticker), [ticker]);

  return (
    <Panel
      title="Passive ownership"
      subtitle="which funds hold it, and how many of its shares their flow moved today"
      className={className}
      actions={
        <ProvenanceChip
          sources={['chain']}
          note="Fund weights are modelled from each fund's mandate and the name's size, stable within a session. Flow is the fund's net creation or redemption for the day, allocated at weight. The coverage figure beside each fund says how much of its book this desk can account for."
        />
      }
    >
      {e.holdings.length === 0 ? (
        <DataState
          kind="empty"
          title="No fund here holds it"
          body={`None of the funds this desk tracks carries ${ticker}.`}
        />
      ) : (
        <>
          {/* The share leads, because it is the number that changes how the
              rest of the page should be read. */}
          <div className="px-1 pb-3 flex items-end gap-4 flex-wrap">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Passive share of volume</div>
              <div
                className={`mt-0.5 font-mono text-2xl font-semibold tnum ${
                  e.passivePct >= 25 ? 'text-warn' : e.passivePct < 5 ? 'text-textSecondary' : 'text-textPrimary'
                }`}
              >
                {e.passivePct}%
              </div>
            </div>
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Net through funds</div>
              <div
                className={`mt-0.5 font-mono text-lg font-semibold tnum ${e.netShares >= 0 ? 'text-bull' : 'text-bear'}`}
              >
                {e.netShares >= 0 ? '+' : ''}
                {fmtShares(e.netShares)} sh
              </div>
            </div>
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Held across funds</div>
              <div className="mt-0.5 font-mono text-lg font-semibold tnum text-textSecondary">{fmtUsd(e.heldUsd)}</div>
            </div>
          </div>

          <p className="px-1 pb-3 text-[12px] text-textSecondary leading-snug">{exposureRead(e)}</p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] border-collapse">
              <thead>
                <tr className="border-b border-borderSubtle">
                  {['Fund', 'Weight', 'Position', 'Fund flow', 'Shares moved'].map((h, i) => (
                    <th
                      key={h}
                      className={`py-1.5 px-2 font-mono text-[9px] font-semibold uppercase tracking-widest text-textMuted ${
                        i === 0 ? 'text-left' : 'text-right'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {e.holdings.map(h => (
                  <tr key={h.fund.ticker} className="border-b border-borderSubtle/60 hover:bg-white/[0.03] transition-colors">
                    <td className="py-1.5 px-2">
                      <span className="font-mono text-[11px] font-semibold text-textPrimary">{h.fund.ticker}</span>
                      <span className="ml-2 font-mono text-[10px] text-textMuted">{h.fund.name}</span>
                      <span
                        className="ml-2 font-mono text-[9px] text-textMuted/70"
                        title={`This desk accounts for about ${coverageOf(h.fund)}% of ${h.fund.ticker}'s book — the rest is names it does not track.`}
                      >
                        {coverageOf(h.fund)}% covered
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-[11px] tnum text-textPrimary font-semibold">
                      {h.weightPct}%
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-[11px] tnum text-textSecondary">
                      {fmtUsd(h.positionUsd)}
                    </td>
                    <td
                      className={`py-1.5 px-2 text-right font-mono text-[11px] tnum ${
                        h.fundFlowUsd >= 0 ? 'text-bull/80' : 'text-bear/80'
                      }`}
                    >
                      {h.fundFlowUsd >= 0 ? '+' : '−'}
                      {fmtUsd(Math.abs(h.fundFlowUsd))}
                    </td>
                    <td
                      className={`py-1.5 px-2 text-right font-mono text-[11px] tnum font-semibold ${
                        h.sharesMoved >= 0 ? 'text-bull' : 'text-bear'
                      }`}
                    >
                      {h.sharesMoved >= 0 ? '+' : ''}
                      {h.sharesMoved.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
};

export default EtfExposurePanel;
