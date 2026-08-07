import { useMemo } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildGammaRolloff } from '../../data/gammaRolloff';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import EmptyState from '../../components/ui/EmptyState';

/*
  GAMMA ROLL-OFF — the schedule of dealer gamma leaving the book by expiry.

  Data in data/gammaRolloff.ts; this is the read. The near rungs carry the most
  gamma (density scales ~1/sqrt(t)), with a bump on the standard monthlies where
  open interest concentrates. The pin holding price this week is on the calendar
  above, and so is the afternoon it disappears.
*/

const pct = (v: number): string => `${Math.round(v * 100)}%`;

const GammaRolloff = () => {
  const { marketData } = useMarketData();
  const view = useMemo(() => (marketData ? buildGammaRolloff(marketData) : null), [marketData]);

  if (!view || view.expiries.length === 0) {
    return (
      <Panel title="Gamma roll-off" subtitle="When dealer gamma expires">
        <EmptyState title="No listed expiries" body="This root has no upcoming expiries to schedule." />
      </Panel>
    );
  }

  const { ticker, convention, expiries, totalGamma, biggest, halfLifeSessions } = view;
  const maxG = Math.max(...expiries.map(e => e.gamma), 1);
  const front = expiries[0];

  const read = biggest
    ? `${pct(biggest.share)} of ${ticker}'s dealer gamma rolls off on ${biggest.label}${biggest.opex ? ' (monthly OPEX)' : ''} — the largest single expiry on the board. Half the book is gone within ${halfLifeSessions} session${halfLifeSessions === 1 ? '' : 's'}, and the pin holding price today expires with the front rung.`
    : '';

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Gamma roll-off" subtitle={`When ${ticker}'s dealer gamma expires · ${convention} listing`}>
        <div className="flex flex-col gap-4">
          <p className="text-caption leading-relaxed text-textSecondary">{read}</p>

          <MetricGrid min="170px">
            <StatCard label="Horizon gamma" value={fmtUsd(totalGamma)} sub="across listed expiries" emphasis />
            <StatCard
              label="Biggest roll-off"
              value={biggest ? pct(biggest.share) : '—'}
              sub={biggest ? `${biggest.label} · ${fmtUsd(biggest.gamma)}` : 'awaiting chain'}
              tone="warn"
            />
            <StatCard label="Front expiry" value={pct(front.share)} sub={`${front.label} · ${front.dte}DTE`} />
            <StatCard label="Gamma half-life" value={`${halfLifeSessions} sess`} sub="half the book gone by" />
          </MetricGrid>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr className="border-b border-borderSubtle text-textMuted">
                  <th className="px-2 py-2 text-left font-mono text-label font-semibold uppercase tracking-wider">Expiry</th>
                  <th className="px-2 py-2 text-right font-mono text-label font-semibold uppercase tracking-wider">DTE</th>
                  <th className="px-2 py-2 text-left font-mono text-label font-semibold uppercase tracking-wider">Gamma rolling off</th>
                  <th className="px-2 py-2 text-right font-mono text-label font-semibold uppercase tracking-wider">Share</th>
                  <th className="px-2 py-2 text-right font-mono text-label font-semibold uppercase tracking-wider">Cum.</th>
                </tr>
              </thead>
              <tbody>
                {expiries.map(e => (
                  <tr key={e.date.getTime()} className="border-b border-borderSubtle/40 hover:bg-rowHover">
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span className="font-mono text-caption font-semibold text-textPrimary">{e.label}</span>
                      {e.opex && (
                        <span className="ml-1.5 font-mono text-micro font-bold uppercase tracking-wider text-warn">opex</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-caption tnum text-textMuted">{e.dte}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="relative h-[6px] flex-1 min-w-[60px] rounded-full bg-white/[0.06] overflow-hidden">
                          <span
                            className="absolute inset-y-0 left-0 rounded-full bg-select/80"
                            style={{ width: `${(e.gamma / maxG) * 100}%` }}
                          />
                        </span>
                        <span className="w-16 shrink-0 text-right font-mono text-caption tnum text-textSecondary">{fmtUsd(e.gamma)}</span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-caption tnum text-textPrimary">{pct(e.share)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-caption tnum text-textMuted">{pct(e.cumShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="font-mono text-micro uppercase tracking-wider text-textMuted">
            Modeled from the book's gross gamma and the {convention} expiry ladder · not a traded schedule
          </p>
        </div>
      </Panel>
    </div>
  );
};

export default GammaRolloff;
