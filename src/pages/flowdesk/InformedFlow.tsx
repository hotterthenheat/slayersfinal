import { useMemo } from 'react';
import { BarChart, Bar, AreaChart, Area, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { useMarketData } from '../../context/MarketDataContext';
import { buildSessionTape } from '../../data/flowtape';
import { buildInformedFlow, type ClassifiedPrint, type FlowClass, type ScoreBucket, type TiltPoint } from '../../data/informedFlow';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import EmptyState from '../../components/ui/EmptyState';
import ChartFrame, { Swatch } from '../../components/charts/ChartFrame';
import { ChartTip, TipHead, TipRow, TipNote } from '../../components/charts/ChartTip';
import { splitBySign, type SignSplitRow } from '../../components/charts/signSplit';
import { GRID, CURSOR, BAR_CURSOR, chartMargin, valueAxis, valueAxisLeft, categoryAxis, axisUsd, zeroAnchoredDomain, niceTicks, REF_LINE } from '../../components/charts/chartTheme';
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

/*
  Chart FILLS for the three classes, deliberately separate from `classInk`.

  classInk colours TEXT, so its darkest member is pinned at the readability floor
  (#7d7d7d) — which leaves MIXED and UNINFORMED only 0x1d apart in luminance. On
  a histogram that read as one grey: the render pass showed three classes and one
  visible tone. A fill has no contrast floor to clear, only its neighbours to be
  told apart from, so these are spread across the range the text inks cannot use.

  Still a single neutral family, because class is a confidence and not a
  direction — green and red stay the market's.
*/
const classFill: Record<FlowClass, { color: string; opacity: number }> = {
  INFORMED: { color: FOCUS, opacity: 1 },
  MIXED: { color: '#8e949e', opacity: 0.75 },
  UNINFORMED: { color: '#4a4f57', opacity: 1 },
};

const InformedFlow = () => {
  const { activeTicker } = useMarketData();

  const view = useMemo(
    () => buildInformedFlow(buildSessionTape(HOW_FAR_BACK), activeTicker),
    [activeTicker]
  );

  const { prints, informedPremium, uninformedPremium, mixedPremium, informedShare, smartNet, smartBullish, topInformed, informedCount, uninformedCount, thresholds, scoreBuckets, tilt } = view;

  // The tilt path, coloured by which side of flat it is on at each point rather
  // than by where it closed — see components/charts/signSplit.
  const tiltSeries = splitBySign(tilt, p => p.net);
  // Zero-anchored, not symmetric — a tape that leaned one way all window should
  // not reserve half the plot for a side it never visited.
  const tiltDomain = zeroAnchoredDomain(tilt.map(p => p.net));
  const tiltTicks = niceTicks(tiltDomain[0], tiltDomain[1]);

  if (prints.length === 0) {
    return (
      <Panel title="Informed flow" subtitle="Which prints carry information">
        <EmptyState title="No prints yet" body="The session tape for this name has not filled. Switch symbols or wait for the tape." />
      </Panel>
    );
  }

  const total = informedPremium + mixedPremium + uninformedPremium || 1;
  const lead = Math.abs(smartNet);
  // The window the tape actually covers, read off the tape rather than asserted.
  // The backfill is ~600 provider ticks (data/tapeSeed), which is roughly the
  // last quarter hour — calling it "this session" told the reader it ran from
  // the open, and it does not.
  const windowFrom = tilt[0]?.time.slice(0, 5) ?? '';
  const windowTo = tilt[tilt.length - 1]?.time.slice(0, 5) ?? '';
  const windowLabel = windowFrom && windowTo ? `${windowFrom}–${windowTo} ET` : 'the recent tape';
  const read = informedCount === 0
    ? `No clearly informed prints on ${activeTicker} across ${windowLabel} — the tape is retail and mid-market noise.`
    : `Smart money is ${smartBullish ? 'net long' : 'net short'} ${activeTicker}: informed flow's ${smartBullish ? 'call buyers and put sellers' : 'put buyers and call sellers'} lead by ${fmtUsd(lead)}. Informed prints are ${Math.round(informedShare * 100)}% of premium across ${windowLabel} — the rest is mixed or noise.`;

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

          {/* The classification itself. Every print lands in a bar; the two
              rules drawn on the axis are the exact cut-points the scorer used,
              so the reader can see how close the tape sits to each boundary
              instead of taking the counts on trust. */}
          <ChartFrame
            title="Information score distribution"
            meta={`${prints.length} prints · cut-points at ${thresholds.uninformed} / ${thresholds.informed}`}
            height={176}
            legend={
              <>
                <Swatch color={classFill.INFORMED.color} label="Informed" />
                <Swatch color={classFill.MIXED.color} label="Mixed" />
                <Swatch color={classFill.UNINFORMED.color} label="Noise" />
              </>
            }
            ariaLabel={`Distribution of information scores across ${prints.length} ${activeTicker} prints. ${informedCount} score at or above ${thresholds.informed} and are classed informed; ${uninformedCount} score at or below ${thresholds.uninformed} and are classed noise.`}
          >
            <BarChart data={scoreBuckets} margin={chartMargin}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                {...categoryAxis}
                type="number"
                dataKey="lo"
                domain={[0, 100]}
                ticks={[0, 20, 38, 64, 80, 100]}
              />
              <YAxis {...valueAxisLeft} width={34} allowDecimals={false} />
              <ReferenceLine x={thresholds.uninformed} stroke={REF_LINE} strokeDasharray="3 3" />
              <ReferenceLine x={thresholds.informed} stroke={REF_LINE} strokeDasharray="3 3" />
              <Tooltip
                cursor={BAR_CURSOR}
                content={
                  <ChartTip<ScoreBucket>
                    render={b => (
                      <>
                        <TipHead sub={classLabel[b.klass]}>Score {b.lo}</TipHead>
                        <TipRow label="Prints" value={b.count.toLocaleString()} tone={b.count === 0 ? 'text-textMuted' : 'text-textPrimary'} />
                        <TipRow label="Premium" value={b.premium === 0 ? '—' : fmtUsd(b.premium)} tone="text-textSecondary" />
                        <TipRow
                          label={b.klass === 'INFORMED' ? `Above cut ${thresholds.informed}` : b.klass === 'UNINFORMED' ? `At/below cut ${thresholds.uninformed}` : 'Between the cuts'}
                          value={b.klass === 'INFORMED' ? `+${b.lo - thresholds.informed}` : b.klass === 'UNINFORMED' ? `−${thresholds.uninformed - b.lo}` : `${b.lo - thresholds.uninformed}/${thresholds.informed - b.lo}`}
                          tone="text-textMuted"
                        />
                        <TipNote>
                          {b.klass === 'INFORMED'
                            ? 'Prints here cleared the informed bar: a paid spread, urgency and size stacked up. Only these feed the smart-money tilt.'
                            : b.klass === 'UNINFORMED'
                              ? 'Prints here are noise: crossed at the mid, small, closing risk, or a structure leg with no directional view.'
                              : 'Prints here carry some information but not enough to lean on — they sit between the two cut-points and feed neither the tilt nor the noise bucket.'}
                        </TipNote>
                      </>
                    )}
                  />
                }
              />
              <Bar dataKey="count" isAnimationActive={false} maxBarSize={10}>
                {scoreBuckets.map(b => (
                  <Cell key={b.lo} fill={classFill[b.klass].color} fillOpacity={classFill[b.klass].opacity} />
                ))}
              </Bar>
            </BarChart>
          </ChartFrame>

          {/* Where the tilt came from. The headline stat is one number; this is
              the path that produced it, so a late reversal cannot hide inside
              a net figure that happens to close flat. */}
          <ChartFrame
            title="Smart-money tilt, cumulative"
            meta={`${informedCount} informed prints · Modeled`}
            height={176}
            legend={
              <>
                <Swatch color={BULL} label="Net long" dash />
                <Swatch color={BEAR} label="Net short" dash />
                <span className="font-mono text-micro uppercase tracking-wider text-textMuted">Informed slice only</span>
              </>
            }
            ariaLabel={`Running net premium of informed ${activeTicker} prints, bullish minus bearish, closing ${smartNet >= 0 ? 'long' : 'short'} ${fmtUsd(Math.abs(smartNet))}.`}
          >
            <AreaChart data={tiltSeries} margin={chartMargin}>
              <CartesianGrid stroke={GRID} />
              <XAxis
                {...categoryAxis}
                type="number"
                dataKey="x"
                domain={[0, Math.max(tilt.length - 1, 1)]}
                ticks={tilt.length > 1 ? [0, Math.round((tilt.length - 1) / 2), tilt.length - 1] : [0]}
                tickFormatter={(x: number) => tilt[Math.round(x)]?.time.slice(0, 5) ?? ''}
              />
              <YAxis {...valueAxis} domain={tiltDomain} ticks={tiltTicks} tickFormatter={axisUsd} width={56} />
              <ReferenceLine y={0} stroke={REF_LINE} strokeDasharray="3 3" />
              <Tooltip
                cursor={CURSOR}
                content={
                  <ChartTip<SignSplitRow<TiltPoint>>
                    render={r => {
                      if (!r.src) {
                        return (
                          <>
                            <TipHead>Tilt crossed flat</TipHead>
                            <TipRow label="Net" value="$0" />
                            <TipNote>Informed bullish and bearish premium balanced exactly here before the lean changed sides.</TipNote>
                          </>
                        );
                      }
                      const p = r.src;
                      const done = p.i + 1;
                      return (
                        <>
                          <TipHead sub={p.time}>Informed net</TipHead>
                          <TipRow
                            label={p.net >= 0 ? 'Net long' : 'Net short'}
                            value={fmtUsd(Math.abs(p.net))}
                            tone={p.net >= 0 ? 'text-bull' : 'text-bear'}
                          />
                          <TipRow label="Prints elapsed" value={`${done} of ${tilt.length}`} tone="text-textSecondary" />
                          <TipRow label="Share of final tilt" value={smartNet === 0 ? '—' : `${Math.round((p.net / smartNet) * 100)}%`} tone="text-textMuted" />
                          <TipNote>
                            {Math.abs(p.net) < 1
                              ? 'Informed flow is balanced at this point — bullish and bearish premium cancel.'
                              : `By this print, informed ${p.net >= 0 ? 'call buyers and put sellers' : 'put buyers and call sellers'} led by ${fmtUsd(Math.abs(p.net))}. Only prints scoring ${thresholds.informed} or better move this line.`}
                          </TipNote>
                        </>
                      );
                    }}
                  />
                }
              />
              <Area type="linear" dataKey="pos" stroke={BULL} strokeWidth={1.6} fill={BULL} fillOpacity={0.14} baseValue={0} connectNulls={false} dot={false} activeDot={{ r: 3, fill: BULL, stroke: 'none' }} isAnimationActive={false} />
              <Area type="linear" dataKey="neg" stroke={BEAR} strokeWidth={1.6} fill={BEAR} fillOpacity={0.14} baseValue={0} connectNulls={false} dot={false} activeDot={{ r: 3, fill: BEAR, stroke: 'none' }} isAnimationActive={false} />
            </AreaChart>
          </ChartFrame>

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
            Showing the {MAX_ROWS} newest of {prints.length} · the read above spans all of them ({windowLabel})
          </p>
        )}
      </Panel>
    </div>
  );
};

export default InformedFlow;
