import { useMemo } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { buildVolComplex } from '../../data/volComplex';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import type { Tone } from '../../components/ui/tones';
import { FOCUS, MUTED_INK } from '../../components/gex/palette';

/*
  THE VOLATILITY COMPLEX — the four numbers a vol trader reads first, per name.
  Data in data/volComplex.ts: term-structure regime, implied vs realized (the
  vol risk premium), the vol of the vol, IV rank (the one shared rank, P2.1) and
  skew — one synthesized verdict off measures that usually live on four screens.
*/

const regimeTone: Record<string, Tone> = { CONTANGO: 'neutral', FLAT: 'neutral', BACKWARDATION: 'warn' };
const rcTone: Record<string, Tone> = { RICH: 'warn', CHEAP: 'select', FAIR: 'neutral' };

const VolComplex = () => {
  const { activeTicker, marketData } = useMarketData();
  const iv = Simulator.TICKERS[activeTicker]?.iv ?? 0.25;

  const view = useMemo(
    () => (marketData ? buildVolComplex(activeTicker, marketData.spot, iv, Simulator.getCandles(activeTicker)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTicker, marketData?.spot && Math.round(marketData.spot * 4), iv]
  );

  if (!view) {
    return (
      <Panel className="h-64" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-label text-textMuted uppercase tracking-widest">Reading the vol complex…</span>
      </Panel>
    );
  }

  const { termCurve, frontIv, backIv, slope, termRegime, realizedVol, vrp, volOfVol, ivRank, skew, richCheap, read } = view;

  // Term curve chart — iv vs evenly-spaced expiry, front and back marked.
  const ivs = termCurve.map(p => p.iv);
  const lo = Math.min(...ivs);
  const hi = Math.max(...ivs);
  const span = hi - lo || 1;
  const n = termCurve.length;
  const xAt = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);
  const yAt = (v: number) => 90 - ((v - lo) / span) * 80;
  const path = termCurve.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(2)},${yAt(p.iv).toFixed(2)}`).join(' ');
  const frontIdx = termCurve.findIndex(p => p.dte >= 30);
  const backIdx = termCurve.findIndex(p => p.dte >= 90);

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Volatility complex" subtitle={`${activeTicker} · term structure, vol risk premium, vol-of-vol and skew`}>
        <div className="flex flex-col gap-4">
          <p className="text-caption leading-relaxed text-textSecondary">{read}</p>

          <MetricGrid min="170px">
            <StatCard label="Term structure" value={termRegime} sub={`${slope >= 0 ? '+' : ''}${slope.toFixed(1)} pt front→back`} tone={regimeTone[termRegime]} emphasis />
            <StatCard label="Implied vs realized" value={richCheap} sub={`${vrp >= 0 ? '+' : ''}${vrp.toFixed(1)} pt VRP`} tone={rcTone[richCheap]} />
            <StatCard label="Front / back IV" value={`${frontIv.toFixed(1)} / ${backIv.toFixed(1)}`} sub="30d vs 90d ATM, %" />
            <StatCard label="Realized vol" value={`${realizedVol.toFixed(1)}%`} sub="annualized, off the tape" />
            <StatCard label="IV rank" value={`${ivRank}`} sub="percentile of its own year" />
            <StatCard label="Vol-of-vol" value={`${volOfVol.toFixed(1)}`} sub={`skew RR ${skew.toFixed(1)}`} />
          </MetricGrid>

          {/* The term structure itself. Above-flat and rising = contango. */}
          <div className="inst-surface rounded-md p-3">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <span className="font-mono text-micro font-semibold uppercase tracking-widest text-textSecondary">ATM term structure</span>
              <span className="font-mono text-micro uppercase tracking-wider text-textMuted tnum">7d → 360d · Modeled</span>
            </div>
            <div className="relative h-[150px]">
              <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="none" role="img" aria-label={`${activeTicker} ATM implied-vol term structure from ${frontIv.toFixed(1)}% at 30 days to ${backIv.toFixed(1)}% at 90 days, ${termRegime.toLowerCase()}.`}>
                <path d={path} fill="none" stroke={FOCUS} strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                {frontIdx >= 0 && <circle cx={xAt(frontIdx)} cy={yAt(termCurve[frontIdx].iv)} r={1.6} fill={FOCUS} vectorEffect="non-scaling-stroke" />}
                {backIdx >= 0 && <circle cx={xAt(backIdx)} cy={yAt(termCurve[backIdx].iv)} r={1.6} fill={MUTED_INK} vectorEffect="non-scaling-stroke" />}
              </svg>
              <span className="pointer-events-none absolute font-mono text-micro tnum text-textMuted" style={{ left: `${xAt(Math.max(0, frontIdx))}%`, top: '2%', transform: 'translateX(-50%)' }}>30d</span>
              <span className="pointer-events-none absolute font-mono text-micro tnum text-textMuted" style={{ left: `${xAt(Math.max(0, backIdx))}%`, bottom: '2%', transform: 'translateX(-50%)' }}>90d</span>
            </div>
            <div className="flex justify-between font-mono text-micro uppercase tracking-wider text-textMuted mt-1">
              <span>Front</span>
              <span>Back</span>
            </div>
          </div>

          <p className="text-micro leading-relaxed text-textMuted">
            The vol risk premium is implied minus REALIZED — what options charged for vol against what the tape actually
            delivered. Positive is the normal state; a negative premium means the market underpriced the move. Modeled from
            the seeded surface, not a live quote.
          </p>
        </div>
      </Panel>
    </div>
  );
};

export default VolComplex;
