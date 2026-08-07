import { useMemo } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildSessionTape } from '../../data/flowtape';
import { buildGammaTape, type GammaPrint } from '../../data/gammatape';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import EmptyState from '../../components/ui/EmptyState';
import { BULL, BEAR, MUTED_INK } from '../../components/gex/palette';
import type { Tone } from '../../components/ui/tones';

/*
  THE GAMMA TAPE — dealer positioning read off the print, not inferred from OI.

  Every panel in Pinpoint estimates where the dealer book sits from open
  interest, a once-a-day snapshot. This reads it straight from the tape: each
  print carries a greek vector and an exchange aggressor, and those two facts say
  exactly how much gamma the dealer just took on or shed. Sum it and the book
  builds in front of you. The sign convention and the math live in
  data/gammatape.ts; this is the read.

  Scoped to the active name, because a gamma book is per underlying — the
  cumulative is one dealer's inventory in one symbol, never a cross-name sum.
*/

const HOW_FAR_BACK = 600;
const MAX_TAPE_ROWS = 120;

/** Signed dollars with an explicit + so a positive add reads as an add. */
function signed(v: number): string {
  return v > 0 ? `+${fmtUsd(v)}` : fmtUsd(v);
}

/** Dealer ADDING gamma (positive) is the stabilising side, so it takes green;
    shedding gamma (short-building) takes red — the standard gamma reading. */
const gammaInk = (v: number): string => (v > 0 ? BULL : v < 0 ? BEAR : MUTED_INK);

const GammaTape = () => {
  const { activeTicker } = useMarketData();

  const view = useMemo(
    () => buildGammaTape(buildSessionTape(HOW_FAR_BACK), activeTicker),
    [activeTicker]
  );

  const { prints, netGamma, longGamma, addedLong, addedShort, netDelta, troughGamma, peakGamma, biggest, flips, directed } = view;

  if (prints.length === 0) {
    return (
      <Panel title="Gamma Tape" subtitle={`Dealer gamma inventory built from ${activeTicker} prints`}>
        <EmptyState title="No directed prints yet" body="The session tape for this name has not printed with an exchange aggressor. Switch symbols or wait for the tape to fill." />
      </Panel>
    );
  }

  // Chronological for the path (view.prints is newest-first).
  const chrono = [...prints].reverse();
  const n = chrono.length;
  const lo = Math.min(troughGamma, 0);
  const hi = Math.max(peakGamma, 0);
  const span = hi - lo || 1;
  const xPct = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);
  const yPct = (v: number) => 92 - ((v - lo) / span) * 84;
  const zeroY = yPct(0);
  const linePath = chrono
    .map((r, i) => `${i === 0 ? 'M' : 'L'}${xPct(i).toFixed(2)},${yPct(r.cumGamma).toFixed(2)}`)
    .join(' ');
  // Area to the zero baseline, tinted by the net regime (the headline says which).
  const areaPath = `${linePath} L${xPct(n - 1).toFixed(2)},${zeroY.toFixed(2)} L${xPct(0).toFixed(2)},${zeroY.toFixed(2)} Z`;
  const regimeInk = longGamma ? BULL : BEAR;

  const netTone: Tone = longGamma ? 'bull' : 'bear';
  const hedgeBuys = netDelta < 0; // dealer short delta -> buys the underlying to flatten

  const read = longGamma
    ? `Dealers are net long ${fmtUsd(Math.abs(netGamma))} of gamma on ${activeTicker} — hedging leans against price, so pushes off the edges get faded and realized range stays inside the implied one.`
    : `Dealers are net short ${fmtUsd(Math.abs(netGamma))} of gamma on ${activeTicker} — hedging chases price, so breaks tend to extend and range expansion is the base case.`;
  const hedgeRead = Math.abs(netDelta) < 1
    ? 'Delta hedge is flat.'
    : `Net delta hedge is ${fmtUsd(Math.abs(netDelta))} ${hedgeBuys ? 'to buy — a standing bid under price' : 'to sell — supply into strength'}.`;

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Gamma Tape"
        subtitle={`How ${directed} directed ${activeTicker} prints moved the dealer's gamma book this session`}
      >
        <div className="flex flex-col gap-4">
          <p className="text-caption leading-relaxed text-textSecondary">
            {read} {hedgeRead}
          </p>

          <MetricGrid min="170px">
            <StatCard
              label="Net dealer gamma"
              value={signed(netGamma)}
              sub={longGamma ? 'long — dampening' : 'short — amplifying'}
              tone={netTone}
              emphasis
            />
            <StatCard
              label="Added long / shed short"
              value={`${fmtUsd(addedLong)} / ${fmtUsd(addedShort)}`}
              sub="gamma bought vs sold to dealers"
            >
              <span className="flex w-full h-[3px] rounded-full overflow-hidden bg-white/[0.06] mt-1.5">
                <span className="h-full bg-bull/90" style={{ width: `${(addedLong / (addedLong + addedShort || 1)) * 100}%` }} />
                <span className="h-full bg-bear/80" style={{ width: `${(addedShort / (addedLong + addedShort || 1)) * 100}%` }} />
              </span>
            </StatCard>
            <StatCard
              label="Net delta hedge"
              value={signed(netDelta)}
              sub={Math.abs(netDelta) < 1 ? 'flat' : hedgeBuys ? 'dealers must buy' : 'dealers must sell'}
              tone={Math.abs(netDelta) < 1 ? 'neutral' : hedgeBuys ? 'bull' : 'bear'}
            />
            <StatCard
              label="Biggest inventory print"
              value={biggest ? signed(biggest.dGamma) : '—'}
              sub={biggest ? `${biggest.print.strike}${biggest.print.right} · ${biggest.print.size.toLocaleString()} lots` : 'awaiting tape'}
              tone={biggest ? (biggest.dGamma > 0 ? 'bull' : 'bear') : 'neutral'}
            />
            <StatCard label="Gamma flips" value={String(flips)} sub="times the book crossed flat" tone="warn" />
            <StatCard label="Deepest short" value={fmtUsd(troughGamma)} sub="lowest the book reached" />
          </MetricGrid>

          {/* The book building through the session. Above the line dealers are
              long gamma (stabilising); below it, short (amplifying). */}
          <div className="inst-surface rounded-md p-3">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <span className="font-mono text-micro font-semibold uppercase tracking-widest text-textSecondary">
                Dealer gamma, cumulative
              </span>
              <span className="font-mono text-micro uppercase tracking-wider text-textMuted tnum">
                {n} prints · Modeled
              </span>
            </div>
            <div className="relative h-[180px]">
              <svg
                viewBox="0 0 100 100"
                width="100%"
                height="100%"
                preserveAspectRatio="none"
                role="img"
                aria-label={`Cumulative dealer gamma for ${activeTicker} across ${n} prints, closing net ${longGamma ? 'long' : 'short'} ${fmtUsd(Math.abs(netGamma))}. Peak long ${fmtUsd(peakGamma)}, deepest short ${fmtUsd(troughGamma)}.`}
              >
                <path d={areaPath} fill={regimeInk} fillOpacity={0.12} />
                {/* Flat line — the regime boundary. */}
                <line x1={0} x2={100} y1={zeroY} y2={zeroY} stroke={MUTED_INK} strokeOpacity={0.6} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                <path d={linePath} fill="none" stroke={regimeInk} strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
              <span className="pointer-events-none absolute left-1 font-mono text-micro uppercase tracking-wider text-bull/80" style={{ top: '2%' }}>
                Long γ · dampening
              </span>
              <span className="pointer-events-none absolute left-1 font-mono text-micro uppercase tracking-wider text-bear/80" style={{ bottom: '2%' }}>
                Short γ · amplifying
              </span>
            </div>
            <div className="flex justify-between font-mono text-micro uppercase tracking-wider text-textMuted mt-1">
              <span>Session open</span>
              <span>Now</span>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Per-print inventory change" subtitle="Each directed print, and the dealer gamma it added or shed">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-borderSubtle text-textMuted">
                <th className="px-2 py-2 text-left font-mono text-label font-semibold uppercase tracking-wider">Time</th>
                <th className="px-2 py-2 text-left font-mono text-label font-semibold uppercase tracking-wider">Contract</th>
                <th className="px-2 py-2 text-center font-mono text-label font-semibold uppercase tracking-wider">Side</th>
                <th className="px-2 py-2 text-right font-mono text-label font-semibold uppercase tracking-wider">Lots</th>
                <th className="px-2 py-2 text-right font-mono text-label font-semibold uppercase tracking-wider">Δ Dealer γ</th>
                <th className="px-2 py-2 text-right font-mono text-label font-semibold uppercase tracking-wider">Book after</th>
              </tr>
            </thead>
            <tbody>
              {prints.slice(0, MAX_TAPE_ROWS).map((r: GammaPrint) => (
                <tr key={r.print.id} className="border-b border-borderSubtle/40 hover:bg-rowHover">
                  <td className="px-2 py-1.5 font-mono text-caption tnum text-textMuted whitespace-nowrap">{r.print.time}</td>
                  <td className="px-2 py-1.5 font-mono text-caption tnum text-textPrimary whitespace-nowrap">
                    {r.print.strike}{r.print.right}
                  </td>
                  <td className="px-2 py-1.5 text-center font-mono text-caption font-semibold" style={{ color: r.print.side === 'ASK' ? BULL : r.print.side === 'BID' ? BEAR : MUTED_INK }}>
                    {r.print.side === 'ASK' ? 'BUY' : r.print.side === 'BID' ? 'SELL' : 'MID'}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-caption tnum text-textSecondary">{r.print.size.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-caption font-semibold tnum" style={{ color: gammaInk(r.dGamma) }}>
                    {r.dealerSign === 0 ? '—' : signed(r.dGamma)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-caption tnum" style={{ color: gammaInk(r.cumGamma) }}>
                    {signed(r.cumGamma)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {prints.length > MAX_TAPE_ROWS && (
          <p className="mt-2 font-mono text-micro uppercase tracking-wider text-textMuted">
            Showing the {MAX_TAPE_ROWS} newest of {prints.length} prints · the book above is the whole session
          </p>
        )}
      </Panel>
    </div>
  );
};

export default GammaTape;
