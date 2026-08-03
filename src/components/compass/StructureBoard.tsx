import { useMemo, useState } from 'react';
import Panel from '../ui/Panel';
import SignalBadge from '../ui/SignalBadge';
import EmptyState from '../ui/EmptyState';
import { ROW_INTERACTIVE, interactiveRowProps } from '../ui/interactiveRow';
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

const CURVE_W = 320;
const CURVE_H = 84;

/** The payoff at expiry — the shape that IS the instrument. */
const Payoff = ({ st, spot }: { st: Structure; spot: number }) => {
  const pts = useMemo(() => payoffCurve(st, spot, 121), [st, spot]);
  const lo = Math.min(...pts.map(p => p.profit));
  const hi = Math.max(...pts.map(p => p.profit));
  const pad = (hi - lo || 1) * 0.15;
  const yLo = lo - pad;
  const yHi = hi + pad;
  const X = (i: number) => (i / (pts.length - 1)) * CURVE_W;
  const Y = (v: number) => CURVE_H - ((v - yLo) / (yHi - yLo || 1)) * CURVE_H;
  const zeroY = Y(0);
  const spotX = X(pts.findIndex(p => p.spot >= spot));

  // Split at the zero line so profit and loss carry the market's own colours —
  // this is money made or lost, which is the one thing green and red are for.
  const seg = (want: 'up' | 'down') =>
    pts
      .map((p, i) => {
        const inSeg = want === 'up' ? p.profit >= 0 : p.profit <= 0;
        return inSeg ? `${X(i).toFixed(1)},${Y(p.profit).toFixed(1)}` : null;
      })
      .reduce<string[]>((acc, cur) => {
        if (cur) acc.push(acc.length && acc[acc.length - 1] !== 'GAP' ? `L${cur}` : `M${cur}`);
        else if (acc.length && acc[acc.length - 1] !== 'GAP') acc.push('GAP');
        return acc;
      }, [])
      .filter(v => v !== 'GAP')
      .join(' ');

  return (
    <svg
      viewBox={`0 0 ${CURVE_W} ${CURVE_H}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: CURVE_H }}
      role="img"
      aria-label={`Profit at expiry across the underlying's range. Maximum loss $${st.maxLoss.toFixed(0)}, ${
        Number.isFinite(st.maxProfit) ? `maximum profit $${st.maxProfit.toFixed(0)}` : 'profit unbounded'
      }.`}
    >
      <line x1={0} x2={CURVE_W} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.22)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {spotX >= 0 && (
        <line x1={spotX} x2={spotX} y1={0} y2={CURVE_H} stroke={FOCUS} strokeOpacity={0.3} strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      )}
      <path d={seg('down')} fill="none" stroke={BEAR} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
      <path d={seg('up')} fill="none" stroke={BULL} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
    </svg>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-borderSubtle">
        {ranked.map(st => {
          const selected = selectedId === st.id;
          const credit = st.netDebit < 0;
          return (
            <div
              key={st.id}
              {...interactiveRowProps(() => setSelectedId(st.id), selected)}
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
        Legs priced on the same clock as the rest of the desk. Risk and reward are the payoff at expiry, read off the
        curve drawn above them; P(profit) is the modelled share of terminal prices that finish between the breakevens.
        Assignment and early exercise are not modelled.
      </p>
    </Panel>
  );
};

export default StructureBoard;
