import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot, ResponsiveContainer } from 'recharts';
import Panel from '../ui/Panel';
import SignalBadge from '../ui/SignalBadge';
import EmptyState from '../ui/EmptyState';
import { ROW_INTERACTIVE, interactiveRowProps } from '../ui/interactiveRow';
import { ChartTip, TipHead, TipRow, TipNote } from '../charts/ChartTip';
import { splitBySign } from '../charts/signSplit';
import { CURSOR, REF_LINE, paddedDomain } from '../charts/chartTheme';
import { BULL, BEAR, FOCUS } from '../gex/palette';
import { buildStructures, payoffCurve, type Structure } from '../../core/structures';
import { SLEEVE_INK } from './sleeveInk';
import { expiryRead } from './setupHorizon';
import type { MarketSnapshot } from '../../types/market';

/*
  STRUCTURES — the sleeve where the worst case is arithmetic.

  Every other board on Compass ranks one contract and asks how much of the
  premium the clock takes. That question does not apply here: the legs pay for
  each other, the loss is bounded before the trade rather than by an exit, and
  the number that decides it is what you can make against what you can lose.

  So there is no score out of 99 on this board and no verdict badge borrowed from
  the setup engine — grading a condor on a scale built for a naked long would be
  a number that looks like the others and means something else. What a structure
  has instead is a payoff diagram, and the four figures under it are read off the
  same array the diagram draws: max loss, max profit, the breakevens, and the
  share of the terminal distribution that finishes in profit.
*/

const CURVE_H = 96;

interface PayoffRow {
  /** Underlying price at expiry. Interpolated on a breakeven crossing. */
  spot: number;
  profit: number;
  pos: number | null;
  neg: number | null;
  /** True on an interpolated point — which, on a payoff curve, IS a breakeven. */
  isBreakeven: boolean;
}

/*
  The payoff at expiry — the shape that IS the instrument.

  On recharts, and on the shared zero-split (components/charts/signSplit) rather
  than the hand-rolled segment walker this used to carry. The split matters more
  here than anywhere else on the desk: the point where the curve crosses zero is
  the BREAKEVEN, so an interpolated crossing is not a drawing convenience — it is
  the number the card quotes, landing exactly where the colour changes.

  Green above / red below is correct here without borrowing: this axis is money
  made and money lost, which is the one thing those two colours are for.
*/
const Payoff = ({ st, spot }: { st: Structure; spot: number }) => {
  const rows: PayoffRow[] = useMemo(() => {
    const pts = payoffCurve(st, spot, 121);
    return splitBySign(pts, p => p.profit).map(r => {
      if (r.src) return { spot: r.src.spot, profit: r.v, pos: r.pos, neg: r.neg, isBreakeven: false };
      // Interpolate the price at the crossing with the same fraction the split
      // used for the profit, so the breakeven sits on the real underlying scale.
      const i = Math.floor(r.x);
      const u = r.x - i;
      const a = pts[i];
      const b = pts[Math.min(i + 1, pts.length - 1)];
      return { spot: a.spot + (b.spot - a.spot) * u, profit: 0, pos: 0, neg: 0, isBreakeven: true };
    });
  }, [st, spot]);

  const domain = paddedDomain(rows.map(r => r.profit), 0.15);
  const breakevens = rows.filter(r => r.isBreakeven);

  return (
    <div
      style={{ height: CURVE_H }}
      className="w-full"
      role="img"
      aria-label={`Profit at expiry across the underlying's range. Maximum loss $${st.maxLoss.toFixed(0)}, ${
        Number.isFinite(st.maxProfit) ? `maximum profit $${st.maxProfit.toFixed(0)}` : 'profit unbounded'
      }. ${st.breakevens.length === 1 ? `Breakeven at ${st.breakevens[0].toFixed(2)}` : `Breakevens at ${st.breakevens.map(b => b.toFixed(2)).join(' and ')}`}.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
          <XAxis type="number" dataKey="spot" domain={['dataMin', 'dataMax']} hide />
          <YAxis type="number" domain={domain} hide />
          <ReferenceLine y={0} stroke={REF_LINE} strokeWidth={1} />
          <ReferenceLine x={spot} stroke={FOCUS} strokeOpacity={0.32} strokeDasharray="2 3" />
          <Tooltip
            cursor={CURSOR}
            content={
              <ChartTip<PayoffRow>
                render={r => {
                  const move = ((r.spot - spot) / spot) * 100;
                  return (
                    <>
                      <TipHead sub={`${move >= 0 ? '+' : ''}${move.toFixed(1)}%`}>
                        {st.ticker} {r.spot.toFixed(2)}
                      </TipHead>
                      <TipRow
                        label={r.isBreakeven ? 'Breakeven' : r.profit >= 0 ? 'Profit' : 'Loss'}
                        value={r.isBreakeven ? '$0' : `${r.profit >= 0 ? '+' : '−'}$${Math.abs(r.profit).toFixed(0)}`}
                        tone={r.isBreakeven ? 'text-textPrimary' : r.profit >= 0 ? 'text-bull' : 'text-bear'}
                      />
                      <TipRow label="Paid" value={`${st.netDebit >= 0 ? '' : '+'}$${Math.abs(st.netDebit).toFixed(0)}`} tone="text-textSecondary" />
                      <TipRow label="Worst case" value={`−$${st.maxLoss.toFixed(0)}`} tone="text-textMuted" />
                      <TipNote>
                        {r.isBreakeven
                          ? `At ${r.spot.toFixed(2)} the structure returns exactly what it cost — this is the breakeven the card quotes.`
                          : r.profit >= 0
                            ? `${st.ticker} finishing here returns ${Math.abs(r.profit).toFixed(0)} dollars per contract against the ${st.maxLoss.toFixed(0)} at risk.`
                            : `${st.ticker} finishing here costs ${Math.abs(r.profit).toFixed(0)} of the ${st.maxLoss.toFixed(0)} at risk. The loss is capped at expiry regardless of how far it goes.`}
                      </TipNote>
                    </>
                  );
                }}
              />
            }
          />
          <Area type="linear" dataKey="neg" stroke={BEAR} strokeWidth={1.75} fill={BEAR} fillOpacity={0.1} baseValue={0} connectNulls={false} dot={false} activeDot={{ r: 3, fill: BEAR, stroke: 'none' }} isAnimationActive={false} />
          <Area type="linear" dataKey="pos" stroke={BULL} strokeWidth={1.75} fill={BULL} fillOpacity={0.1} baseValue={0} connectNulls={false} dot={false} activeDot={{ r: 3, fill: BULL, stroke: 'none' }} isAnimationActive={false} />
          {/* Each breakeven marked where the colour turns over. */}
          {breakevens.map(b => (
            <ReferenceDot key={b.spot} x={b.spot} y={0} r={2.6} fill={FOCUS} stroke="none" />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const money = (v: number): string => (Number.isFinite(v) ? `$${Math.round(v).toLocaleString()}` : 'Unbounded');

interface StructureBoardProps {
  snapshot: MarketSnapshot;
  dte: number;
}

const StructureBoard = ({ snapshot, dte }: StructureBoardProps) => {
  const structures = useMemo(() => buildStructures(snapshot, dte), [snapshot, dte]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const ink = SLEEVE_INK.structures;
  const exp = expiryRead(`${dte}DTE`);

  if (structures.length === 0) {
    return (
      <Panel title="Structures" className="w-full">
        <EmptyState size="lg" title="No structures on this expiry" body="The chain does not list enough strikes to build a defined-risk position here." />
      </Panel>
    );
  }

  /*
    Ranked on reward against risk, then on the odds of getting it.

    Not on a composite: a structure's whole appeal is that both halves of the
    trade are known numbers before it is placed, so the ratio between them IS
    the ranking and collapsing it into a score would hide the thing that makes
    this sleeve different from the other four.
  */
  const ranked = [...structures].sort(
    (a, b) => b.rewardRisk * b.probProfit - a.rewardRisk * a.probProfit
  );

  return (
    <Panel
      flush
      title="Defined-risk structures"
      subtitle={exp.chip}
      className="w-full"
      actions={
        <span className="font-mono text-micro uppercase tracking-widest text-textMuted">
          {ranked.length} on {snapshot.ticker}
        </span>
      }
    >
      <div role="list" aria-label="Defined-risk structures" className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-borderSubtle">
        {ranked.map(st => {
          const selected = selectedId === st.id;
          const credit = st.netDebit < 0;
          return (
            <div
              key={st.id}
              {...interactiveRowProps(() => setSelectedId(st.id), selected, 'listitem')}
              onClick={() => setSelectedId(st.id)}
              aria-label={`${st.label} on ${st.ticker}, risking ${money(st.maxLoss)} to make ${money(st.maxProfit)}`}
              className={`${ROW_INTERACTIVE} bg-panel p-3 flex flex-col gap-2 ${selected ? ink.wash : ''}`}
            >
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span className={`font-mono text-caption font-semibold ${ink.text}`}>{st.label}</span>
                <span className="font-mono text-micro uppercase tracking-widest text-textMuted tnum">
                  {credit ? 'Credit' : 'Debit'} {money(Math.abs(st.netDebit))}
                </span>
              </div>

              <Payoff st={st} spot={snapshot.spot} />

              {/* The four numbers the diagram is worth. Bull/bear here is money
                  made and lost, which is exactly what those colours are for. */}
              <div className="grid grid-cols-4 gap-2 font-mono text-micro tnum">
                {[
                  { k: 'Risk', v: money(st.maxLoss), c: 'text-bear' },
                  { k: 'Reward', v: money(st.maxProfit), c: 'text-bull' },
                  { k: 'R/R', v: Number.isFinite(st.rewardRisk) ? `${st.rewardRisk.toFixed(2)}x` : '—', c: 'text-textPrimary' },
                  { k: 'P(profit)', v: `${Math.round(st.probProfit * 100)}%`, c: 'text-textPrimary' },
                ].map(m => (
                  <div key={m.k} className="min-w-0">
                    <div className="uppercase tracking-widest text-textMuted truncate">{m.k}</div>
                    <div className={`font-semibold ${m.c}`}>{m.v}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {st.legs.map((l, i) => (
                  <SignalBadge key={i} tone={l.qty > 0 ? 'select' : 'neutral'}>
                    {l.qty > 0 ? 'Long' : 'Short'} {l.strike}
                    {l.right}
                  </SignalBadge>
                ))}
              </div>

              <p className="font-mono text-micro text-textSecondary leading-snug">{st.thesis}</p>
              <p className="font-mono text-micro text-textMuted leading-snug border-t border-borderSubtle pt-1.5">
                {st.cost}
                {st.breakevens.length > 0 && (
                  <> Breaks even at {st.breakevens.map(b => b.toFixed(2)).join(' and ')}.</>
                )}
              </p>
            </div>
          );
        })}
      </div>

      <p className="px-3 py-2 border-t border-borderSubtle font-mono text-micro text-textMuted leading-relaxed">
        Legs are listed strikes on this chain, priced at {snapshot.ticker}&apos;s own{' '}
        {(ranked[0].iv * 100).toFixed(0)}% volatility and on the same clock as the rest of the desk. Risk and reward are the payoff at expiry, read off the curve drawn above them; P(profit)
        is the modelled share of terminal prices that land where the curve is above zero — inside the breakevens for
        the spreads and condors, outside them for the straddle and the strangle, which is the whole difference between
        the two families. Assignment and early exercise are not modelled.
      </p>
    </Panel>
  );
};

export default StructureBoard;
