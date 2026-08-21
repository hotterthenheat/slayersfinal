import { useMemo, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildExpiryDependency, type ExpiryContribution } from '../../data/expiryDependency';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import EmptyState from '../../components/ui/EmptyState';
import Stat from '../../components/ui/Stat';

/*
  EXPIRY DEPENDENCY — which expiry is holding the structure up.

  Arithmetic in data/expiryDependency.ts; this is the read. Take one expiry out
  of the book, fold what is left, read the levels again. Everything on this page
  is the difference between those two readings.

  WHY IT CAN SAY THIS AT ALL. The per-expiry surface used to be a projection of
  the aggregate chain, so removing an expiry returned a rescaled copy of the same
  curve and any "dependency" it reported was a property of the decay function.
  The books are primary now (core/chainAggregate.ts) and the chain is their fold,
  so the subtraction is real.

  NO SCORES. Every figure here is the quantity it actually is — a share of gross
  gamma, a dollar move of a level, a contract count. This codebase removed the
  0-100 contract grade for compressing hand-weighted factors into an unlabelled
  number, and a structural measure does the same thing under a new name.
  `expiryDependency.test.ts` fails if a score-shaped field appears on either the
  row or the view.

  COLOUR. Regime inversion is the one directional fact here — long gamma and
  short gamma are opposite states — so the sign of net gamma keeps green/red.
  Share of gross gamma is a MAGNITUDE and takes holo-silver; the OPEX rungs take
  the same amber the roll-off calendar uses, because a concentration on the
  monthly is a caveat about the distribution, not a direction.

  HORIZON. Every share is a share of the LISTED HORIZON the calendar returns
  (core/expiryCalendar caps at six rungs), never of the root's whole open
  interest. The panel subtitle says so; the copy must not let a reader forget it.
*/

const OPEX_INK = 'text-warn';
/* A share that rounds to zero still is not zero, and printing "0.0%" beside a
   non-zero gamma in the very next column reads as a contradiction the reader has
   to resolve. `<0.1%` says the same thing and stays true. */
const pct = (v: number): string => (v > 0 && v < 0.001 ? '<0.1%' : `${(v * 100).toFixed(1)}%`);
const signedPct = (v: number): string => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`;
const money = (v: number): string => `${v >= 0 ? '+' : '−'}${fmtUsd(Math.abs(v))}`;

/** A level and where it lands with the selected expiry gone. */
const LevelShift = ({ label, from, to }: { label: string; from: number; to: number }) => {
  const moved = Math.abs(to - from) > 1e-9;
  return (
    <Stat
      label={label}
      value={moved ? to.toFixed(2) : from.toFixed(2)}
      sub={
        moved ? (
          <span className="text-select">
            from {from.toFixed(2)} · {to > from ? '↑' : '↓'} {Math.abs(to - from).toFixed(2)}
          </span>
        ) : (
          <span className="text-textMuted">unmoved</span>
        )
      }
    />
  );
};

const ExpiryDependency = () => {
  const { marketData } = useMarketData();
  const view = useMemo(() => (marketData ? buildExpiryDependency(marketData) : null), [marketData]);
  const [removedDte, setRemovedDte] = useState<number | null>(null);

  // Selection is held by DTE, not by index: the calendar re-derives every tick
  // and an index would silently re-point at a different expiry as rungs roll off.
  const removed: ExpiryContribution | null =
    view?.contributions.find(c => c.dte === removedDte) ?? null;

  if (!view || !marketData) {
    return <EmptyState title="No chain" body="The book has not loaded yet." />;
  }

  const { full, contributions, loadBearing, heaviest, grossGex } = view;
  const maxShare = Math.max(...contributions.map(c => c.grossShare), 0.0001);

  return (
    <div className="flex flex-col gap-4">
      <MetricGrid min="240px">
        <StatCard
          emphasis
          label="Net dealer gamma"
          value={money(full.netGex)}
          sub={full.netGex >= 0 ? 'long — dips absorbed' : 'short — hedging amplifies'}
          tone={full.netGex >= 0 ? 'bull' : 'bear'}
        />
        <StatCard
          label="Regime depends on"
          value={loadBearing ? loadBearing.label : 'No single expiry'}
          sub={
            loadBearing
              ? `remove it and net gamma turns ${full.netGex >= 0 ? 'short' : 'long'}`
              : 'the sign survives losing any one expiry'
          }
          tone={loadBearing ? 'warn' : undefined}
        />
        <StatCard
          label="Heaviest expiry"
          value={heaviest.label}
          sub={`${pct(heaviest.grossShare)} of gross gamma · ${heaviest.openInterest.toLocaleString()} contracts`}
        />
      </MetricGrid>

      <Panel
        title="Remove an expiry"
        subtitle="The book folded without it, and the levels read again — across the six expiries the calendar lists, not the whole root"
      >
        <div className="flex flex-wrap gap-1.5">
          {contributions.map(c => {
            const on = c.dte === removedDte;
            return (
              <button
                key={c.dte}
                type="button"
                onClick={() => setRemovedDte(on ? null : c.dte)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-caption leading-4 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select/60 ${
                  on
                    ? 'border-select bg-select text-ink font-semibold'
                    : 'border-borderSubtle bg-panel text-textSecondary hover:border-borderMuted hover:text-textPrimary'
                }`}
              >
                {c.label}
                <span className={on ? 'text-ink/60' : 'text-textMuted'}>{c.dte}d</span>
                {c.isMonthly && <span className={on ? 'text-ink/60' : OPEX_INK}>OPEX</span>}
              </button>
            );
          })}
        </div>

        {removed ? (
          <div className="mt-4 border-t border-borderSubtle pt-4">
            <div className="font-mono text-label uppercase tracking-wider text-textMuted">
              Without {removed.label}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat
                label="Net gamma"
                value={money(removed.without.netGex)}
                sub={`${signedPct(removed.gexRemaining)} of today's`}
                tone={removed.without.netGex >= 0 ? 'bull' : 'bear'}
              />
              <LevelShift label="Flip" from={full.flip} to={removed.without.flip} />
              <LevelShift label="Call wall" from={full.callWall} to={removed.without.callWall} />
              <LevelShift label="Put wall" from={full.putWall} to={removed.without.putWall} />
              <LevelShift label="Gamma centre" from={full.gammaCenter} to={removed.without.gammaCenter} />
            </div>
            {removed.regimeCritical && (
              <p className="mt-3 font-mono text-caption leading-5 text-warn">
                Net gamma changes sign without this expiry. The pin-vs-trend regime on every
                Pinpoint surface is resting on it.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-4 border-t border-borderSubtle pt-4 text-caption leading-5 text-textSecondary">
            Pick an expiry to fold the book without it. Nothing is re-modelled — the remaining
            books are summed again and the same reader derives the levels, so any difference is a
            difference in the book rather than in the arithmetic.
          </p>
        )}
      </Panel>

      <Panel
        flush
        title="What each expiry carries"
        subtitle={`Share of ${fmtUsd(grossGex)} gross gamma across the listed horizon`}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-y border-borderSubtle bg-panelRaised">
                {['Expiry', 'DTE', 'Open interest', 'Share of gross Γ', 'Own net Γ', 'Net Γ without it'].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-2 font-mono text-label font-medium uppercase tracking-wider text-textMuted ${
                        i === 0 ? 'text-left' : 'text-right'
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {contributions.map(c => (
                <tr
                  key={c.dte}
                  className={`border-b border-borderSubtle/50 transition-colors ${
                    c.dte === removedDte ? 'bg-select/10' : 'hover:bg-rowHover'
                  }`}
                >
                  <td className="px-4 py-2.5 font-mono text-caption">
                    <span className="font-semibold text-textPrimary">{c.label}</span>
                    {c.isMonthly && <span className={`ml-2 text-micro ${OPEX_INK}`}>OPEX</span>}
                    {c.regimeCritical && (
                      <span className="ml-2 text-micro text-warn" title="net gamma changes sign without it">
                        REGIME
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-caption tnum text-textSecondary">
                    {c.dte}d
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-caption tnum text-textSecondary">
                    {c.openInterest.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-caption tnum">
                    <span className="inline-flex items-center gap-2">
                      {/* A magnitude, so the bar is holo-silver — never a
                          direction hue. Scaled to the largest share so the
                          shortest bar is still visible. */}
                      <span className="hidden h-1 w-20 overflow-hidden rounded-full bg-white/[0.06] sm:inline-block">
                        <span
                          className="block h-full rounded-full bg-select/70"
                          style={{ width: `${(c.grossShare / maxShare) * 100}%` }}
                        />
                      </span>
                      <span className="w-12 text-right text-textPrimary">{pct(c.grossShare)}</span>
                    </span>
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono text-caption tnum ${
                      c.ownGex >= 0 ? 'text-bull' : 'text-bear'
                    }`}
                  >
                    {money(c.ownGex)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono text-caption tnum ${
                      c.without.netGex >= 0 ? 'text-bull' : 'text-bear'
                    }`}
                  >
                    {money(c.without.netGex)}
                    <span className="ml-2 text-micro text-textMuted">{signedPct(c.gexRemaining)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};

export default ExpiryDependency;
