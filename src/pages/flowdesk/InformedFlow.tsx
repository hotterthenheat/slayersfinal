import { useMemo } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildSessionTape } from '../../data/flowtape';
import { buildInformedFlow, type ClassifiedPrint, type FlowClass } from '../../data/informedFlow';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import EmptyState from '../../components/ui/EmptyState';
import { BULL, BEAR, FOCUS, MUTED_INK } from '../../components/gex/palette';

/*
  INFORMED vs UNINFORMED FLOW — which prints are bets somebody made because they
  think they know something, and which are noise.

  Engine in data/informedFlow.ts. Class is not a direction, so it takes the
  chrome language (holo for informed, grey for noise) — only the SMART-MONEY
  TILT, read off the informed slice, borrows the market's bull/bear. Scoped to
  the active name because the tilt is directional.
*/

const HOW_FAR_BACK = 600;
const MAX_ROWS = 120;

const signed = (v: number): string => (v > 0 ? `+${fmtUsd(v)}` : fmtUsd(v));

/** Class is a confidence, not a direction — holo for informed, grey for noise. */
const classInk: Record<FlowClass, string> = { INFORMED: FOCUS, MIXED: '#9aa0aa', UNINFORMED: MUTED_INK };
const classLabel: Record<FlowClass, string> = { INFORMED: 'INFORMED', MIXED: 'MIXED', UNINFORMED: 'NOISE' };

const InformedFlow = () => {
  const { activeTicker } = useMarketData();

  const view = useMemo(
    () => buildInformedFlow(buildSessionTape(HOW_FAR_BACK), activeTicker),
    [activeTicker]
  );

  const { prints, informedPremium, uninformedPremium, mixedPremium, informedShare, smartNet, smartBullish, topInformed, informedCount, uninformedCount } = view;

  if (prints.length === 0) {
    return (
      <Panel title="Informed flow" subtitle="Which prints carry information">
        <EmptyState title="No prints yet" body="The session tape for this name has not filled. Switch symbols or wait for the tape." />
      </Panel>
    );
  }

  const total = informedPremium + mixedPremium + uninformedPremium || 1;
  const tilt = Math.abs(smartNet);
  const read = informedCount === 0
    ? `No clearly informed prints on ${activeTicker} this session — the tape is retail and mid-market noise.`
    : `Smart money is ${smartBullish ? 'net long' : 'net short'} ${activeTicker}: informed flow's ${smartBullish ? 'call buyers and put sellers' : 'put buyers and call sellers'} lead by ${fmtUsd(tilt)}. Informed prints are ${Math.round(informedShare * 100)}% of session premium — the rest is mixed or noise.`;

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Informed flow" subtitle={`Smart money vs noise on ${activeTicker}, scored from the exchange tape`}>
        <div className="flex flex-col gap-4">
          <p className="text-caption leading-relaxed text-textSecondary">{read}</p>

          <MetricGrid min="170px">
            <StatCard label="Informed share" value={`${Math.round(informedShare * 100)}%`} sub={`${fmtUsd(informedPremium)} of ${fmtUsd(total)}`} emphasis />
            <StatCard
              label="Smart-money tilt"
              value={smartNet === 0 ? 'FLAT' : smartBullish ? 'BULL' : 'BEAR'}
              sub={`${signed(smartNet)} informed net`}
              tone={smartNet === 0 ? 'neutral' : smartBullish ? 'bull' : 'bear'}
            />
            <StatCard label="Informed / noise" value={`${informedCount} / ${uninformedCount}`} sub="prints classified">
              <span className="flex w-full h-[3px] rounded-full overflow-hidden bg-white/[0.06] mt-1.5">
                <span className="h-full" style={{ width: `${(informedPremium / total) * 100}%`, background: FOCUS }} />
                <span className="h-full bg-white/20" style={{ width: `${(mixedPremium / total) * 100}%` }} />
                <span className="h-full" style={{ width: `${(uninformedPremium / total) * 100}%`, background: MUTED_INK }} />
              </span>
            </StatCard>
            <StatCard
              label="Top informed print"
              value={topInformed ? `${topInformed.score}` : '—'}
              sub={topInformed ? `${topInformed.print.strike}${topInformed.print.right} · ${fmtUsd(topInformed.print.premium)}` : 'awaiting tape'}
            />
          </MetricGrid>

          <div className="flex items-center gap-4 font-mono text-micro uppercase tracking-wider text-textMuted">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: FOCUS }} /> Informed</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-white/25" /> Mixed</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: MUTED_INK }} /> Noise</span>
            <span className="ml-auto normal-case tracking-normal">Smart-money bull/bear uses the market's colors; class does not.</span>
          </div>
        </div>
      </Panel>

      <Panel title="Classified prints" subtitle="Each print, its information score, and why">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-borderSubtle text-textMuted">
                <th className="px-2 py-2 text-left font-mono text-label font-semibold uppercase tracking-wider">Time</th>
                <th className="px-2 py-2 text-left font-mono text-label font-semibold uppercase tracking-wider">Contract</th>
                <th className="px-2 py-2 text-center font-mono text-label font-semibold uppercase tracking-wider">Class</th>
                <th className="px-2 py-2 text-right font-mono text-label font-semibold uppercase tracking-wider">Score</th>
                <th className="px-2 py-2 text-right font-mono text-label font-semibold uppercase tracking-wider">Premium</th>
                <th className="px-2 py-2 text-left font-mono text-label font-semibold uppercase tracking-wider">Why</th>
              </tr>
            </thead>
            <tbody>
              {prints.slice(0, MAX_ROWS).map((r: ClassifiedPrint) => (
                <tr key={r.print.id} className="border-b border-borderSubtle/40 hover:bg-rowHover">
                  <td className="px-2 py-1.5 font-mono text-caption tnum text-textMuted whitespace-nowrap">{r.print.time}</td>
                  <td className="px-2 py-1.5 font-mono text-caption tnum text-textPrimary whitespace-nowrap">{r.print.strike}{r.print.right}</td>
                  <td className="px-2 py-1.5 text-center font-mono text-micro font-bold uppercase tracking-wider" style={{ color: classInk[r.klass] }}>
                    {classLabel[r.klass]}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-caption font-semibold tnum" style={{ color: classInk[r.klass] }}>{r.score}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-caption tnum" style={{ color: r.sentiment === 'BULLISH' ? BULL : r.sentiment === 'BEARISH' ? BEAR : MUTED_INK }}>
                    {fmtUsd(r.print.premium)}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-micro text-textMuted truncate max-w-[220px]" title={r.reasons.join(' · ')}>
                    {r.reasons.slice(0, 2).join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {prints.length > MAX_ROWS && (
          <p className="mt-2 font-mono text-micro uppercase tracking-wider text-textMuted">
            Showing the {MAX_ROWS} newest of {prints.length} · the read above is the whole session
          </p>
        )}
      </Panel>
    </div>
  );
};

export default InformedFlow;
