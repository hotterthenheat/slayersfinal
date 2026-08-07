import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { useMarketData } from '../../context/MarketDataContext';
import { buildSessionTape } from '../../data/flowtape';
import { buildGammaTape, type GammaPrint } from '../../data/gammatape';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import EmptyState from '../../components/ui/EmptyState';
import ChartFrame, { Swatch } from '../../components/charts/ChartFrame';
import { ChartTip, TipHead, TipRow, TipNote } from '../../components/charts/ChartTip';
import { splitBySign, type SignSplitRow } from '../../components/charts/signSplit';
import { GRID, CURSOR, chartMargin, valueAxis, categoryAxis, axisUsd, zeroAnchoredDomain, niceTicks, REF_LINE } from '../../components/charts/chartTheme';
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
  // Each half of the path is coloured by the regime it is IN, not by the regime
  // the session happened to close in — see components/charts/signSplit.
  const series = splitBySign(chrono, r => r.cumGamma);
  // Zero-anchored, not symmetric: the flat line has to be on the plot (it is the
  // regime boundary the whole panel turns on), but a book that spent the window
  // long should not give half its height to a short range it never reached.
  const yDomain = zeroAnchoredDomain([troughGamma, peakGamma]);
  const yTicks = niceTicks(yDomain[0], yDomain[1]);
  // Four evenly spaced time ticks across the session.
  const xTicks = n > 1 ? [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1] : [0];
  const timeAt = (x: number): string => chrono[Math.round(x)]?.print.time.slice(0, 5) ?? '';

  const netTone: Tone = longGamma ? 'bull' : 'bear';
  const hedgeBuys = netDelta < 0; // dealer short delta -> buys the underlying to flatten

  // The window is what the tape actually covers, read off the tape itself. The
  // backfill is a walk-back of ~600 provider ticks (data/tapeSeed), which is
  // roughly the last quarter hour — NOT the session. Calling it "this session"
  // told the reader the book was built from the open when it was not, and
  // hard-coding "15 min" would go stale the moment the backfill depth changes.
  const windowFrom = chrono[0]?.print.time.slice(0, 5) ?? '';
  const windowTo = chrono[n - 1]?.print.time.slice(0, 5) ?? '';
  const windowLabel = windowFrom && windowTo ? `${windowFrom}–${windowTo} ET` : 'recent tape';

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
        subtitle={`How ${directed} directed ${activeTicker} prints moved the dealer's gamma book · ${windowLabel}`}
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
              long gamma (stabilising); below it, short (amplifying) — and the
              path is coloured by which side it is ON at each point, so the
              picture and the legend can never disagree. */}
          <ChartFrame
            title="Dealer gamma, cumulative"
            meta={`${directed} of ${n} prints directed · Modeled`}
            height={210}
            legend={
              <>
                <Swatch color={BULL} label="Long γ · dampening" dash />
                <Swatch color={BEAR} label="Short γ · amplifying" dash />
                {flips > 0 && (
                  <span className="font-mono text-micro uppercase tracking-wider text-warn/80">
                    {flips} flip{flips === 1 ? '' : 's'}
                  </span>
                )}
              </>
            }
            ariaLabel={`Cumulative dealer gamma for ${activeTicker} across ${n} prints, closing net ${longGamma ? 'long' : 'short'} ${fmtUsd(Math.abs(netGamma))}. Peak long ${fmtUsd(peakGamma)}, deepest short ${fmtUsd(troughGamma)}, crossing flat ${flips} time${flips === 1 ? '' : 's'}.`}
          >
            <AreaChart data={series} margin={chartMargin}>
              <CartesianGrid stroke={GRID} />
              <XAxis
                {...categoryAxis}
                type="number"
                dataKey="x"
                domain={[0, Math.max(n - 1, 1)]}
                ticks={xTicks}
                tickFormatter={timeAt}
              />
              <YAxis {...valueAxis} domain={yDomain} ticks={yTicks} tickFormatter={axisUsd} width={56} />
              <ReferenceLine y={0} stroke={REF_LINE} strokeDasharray="3 3" />
              <Tooltip
                cursor={CURSOR}
                content={
                  <ChartTip<SignSplitRow<GammaPrint>>
                    render={r => {
                      // A synthetic point: the interpolated instant the book
                      // crossed flat. It has no print behind it, and saying so
                      // is more useful than showing a blank card.
                      if (!r.src) {
                        return (
                          <>
                            <TipHead>Gamma flip</TipHead>
                            <TipRow label="Book" value="$0 — flat" />
                            <TipNote>The cumulative crossed the line here: the dealer regime changed sign between two prints.</TipNote>
                          </>
                        );
                      }
                      const h = r.src;
                      const mute = h.dealerSign === 0;
                      return (
                        <>
                          <TipHead sub={h.print.time}>
                            {h.print.strike}
                            {h.print.right}
                          </TipHead>
                          <TipRow
                            label={mute ? 'Midpoint' : h.dealerSign === -1 ? 'Customer bought' : 'Customer sold'}
                            value={`${h.print.size.toLocaleString()} lots`}
                            tone={mute ? 'text-textMuted' : h.dealerSign === -1 ? 'text-bull' : 'text-bear'}
                          />
                          <TipRow
                            label="Δ dealer γ"
                            value={mute ? 'no change' : signed(h.dGamma)}
                            tone={mute ? 'text-textMuted' : h.dGamma > 0 ? 'text-bull' : 'text-bear'}
                          />
                          <TipRow
                            label="Book after"
                            value={signed(h.cumGamma)}
                            tone={h.cumGamma >= 0 ? 'text-bull' : 'text-bear'}
                          />
                          {!mute && <TipRow label="Forced hedge" value={`${signed(h.dDelta)} Δ`} tone="text-textSecondary" />}
                          <TipNote>
                            {mute
                              ? 'A midpoint print names no initiator, so it moves size without moving the dealer book.'
                              : `${h.dealerSign === -1 ? 'The dealer sold the option and is shorter gamma' : 'The dealer bought the option and is longer gamma'}; the book sits ${h.cumGamma >= 0 ? 'long' : 'short'} here, so hedging ${h.cumGamma >= 0 ? 'leans against price' : 'chases price'}. Flattening this print alone means ${h.dDelta < 0 ? 'buying' : 'selling'} the underlying.`}
                          </TipNote>
                        </>
                      );
                    }}
                  />
                }
              />
              <Area
                type="linear"
                dataKey="pos"
                stroke={BULL}
                strokeWidth={1.6}
                fill={BULL}
                fillOpacity={0.14}
                baseValue={0}
                connectNulls={false}
                dot={false}
                activeDot={{ r: 3, fill: BULL, stroke: 'none' }}
                isAnimationActive={false}
              />
              <Area
                type="linear"
                dataKey="neg"
                stroke={BEAR}
                strokeWidth={1.6}
                fill={BEAR}
                fillOpacity={0.14}
                baseValue={0}
                connectNulls={false}
                dot={false}
                activeDot={{ r: 3, fill: BEAR, stroke: 'none' }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartFrame>
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
            Showing the {MAX_TAPE_ROWS} newest of {prints.length} prints · the book above spans all of them ({windowLabel})
          </p>
        )}
      </Panel>
    </div>
  );
};

export default GammaTape;
