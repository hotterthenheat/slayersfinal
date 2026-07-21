import { useMemo } from 'react';
import { Gavel, Ticket, AlertTriangle, Clock } from 'lucide-react';
import { buildMocRead } from '../../core/fracture';
import { weighContracts, type WeighedContract } from '../../core/contractScore';
import type { MocRead } from '../../types/fracture';
import type { MarketSnapshot } from '../../types/market';
import Panel from '../ui/Panel';
import StatCard from '../ui/StatCard';
import MetricGrid from '../ui/MetricGrid';
import SignalBadge from '../ui/SignalBadge';
import type { Tone } from '../ui/tones';

const fmtUsd = (v: number): string => {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(0)}M`;
  return `${s}$${(a / 1e3).toFixed(0)}K`;
};

const mocToneOf = (moc: MocRead): Tone =>
  moc.classification === 'CONTINUATION'
    ? moc.side === 'BUY'
      ? 'bull'
      : 'bear'
    : moc.classification === 'ABSORPTION FADE'
      ? 'warn'
      : moc.classification === 'DISLOCATION REVERSAL'
        ? 'magenta'
        : 'neutral';

const verdictTone: Record<WeighedContract['verdict'], Tone> = {
  BUY: 'bull',
  WATCH: 'warn',
  FADE: 'bear',
};

/* ---- MOC score gauge: -100 (sell) … 0 … +100 (buy) ---- */
const ScoreGauge = ({ score }: { score: number }) => {
  const pct = (score + 100) / 2; // 0..100
  return (
    <div className="relative h-2 rounded-full bg-white/[0.06] overflow-hidden">
      <span className="absolute top-0 bottom-0 left-1/2 w-px bg-white/25" aria-hidden />
      <span
        className={`absolute top-0 bottom-0 ${score >= 0 ? 'left-1/2' : ''} ${score >= 0 ? 'bg-bull/80' : 'bg-bear/80'}`}
        style={
          score >= 0
            ? { width: `${(pct - 50).toFixed(1)}%` }
            : { left: `${pct.toFixed(1)}%`, width: `${(50 - pct).toFixed(1)}%` }
        }
      />
      <span
        className="absolute -top-0.5 h-3 w-[2px] bg-textPrimary rounded-full"
        style={{ left: `calc(${pct.toFixed(1)}% - 1px)` }}
        aria-hidden
      />
    </div>
  );
};

/* ---- imbalance-growth timeline: the 3:50 → 3:58 publications ---- */
const GrowthTimeline = ({ moc }: { moc: MocRead }) => {
  const pubs = ['3:50', '3:52', '3:54', '3:56', '3:58'];
  const growing = moc.growthZ >= 0;
  const finalZ = moc.normalizedZ;
  const maxAbs = Math.max(0.3, Math.abs(finalZ) * 1.15);
  const series = pubs.map((t, i) => {
    const frac = (i + 1) / pubs.length;
    const shape = growing ? Math.pow(frac, 1.5) : 1.15 - 0.35 * frac;
    return { t, z: finalZ * shape };
  });
  const side = finalZ >= 0 ? 'bull' : 'bear';
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Imbalance growth</span>
        <SignalBadge tone={growing ? (side as Tone) : 'neutral'}>
          {growing ? 'building into cross' : 'fading pre-cross'}
        </SignalBadge>
      </div>
      <div className="flex items-end gap-1.5 h-16">
        {series.map(pt => {
          const h = Math.max(6, (Math.abs(pt.z) / maxAbs) * 100);
          return (
            <div key={pt.t} className="flex-1 h-full flex flex-col justify-end">
              <span className={`w-full rounded-sm ${pt.z >= 0 ? 'bg-bull/70' : 'bg-bear/70'}`} style={{ height: `${h}%` }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-1">
        {series.map(pt => (
          <span key={pt.t} className="flex-1 text-center font-mono text-[8px] text-textMuted">
            {pt.t}
          </span>
        ))}
      </div>
    </div>
  );
};

/* ---- one 0DTE lotto contract row ---- */
const LottoRow = ({ c, best }: { c: WeighedContract; best: boolean }) => {
  const tone = verdictTone[c.verdict];
  const rightColor = c.right === 'C' ? 'text-bull' : 'text-bear';
  return (
    <div className={`px-3.5 py-2.5 flex items-center gap-3 ${best ? 'bg-white/[0.02]' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] font-semibold text-textPrimary tnum">
            {c.ticker} {c.strike}
            <span className={rightColor}>{c.right}</span>
          </span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-textMuted border border-borderSubtle rounded px-1 py-px">
            {c.dte === 0 ? '0DTE' : `${c.dte}DTE`}
          </span>
          {best && <SignalBadge tone="magenta">Top lotto</SignalBadge>}
        </div>
        <div className="mt-1 font-mono text-[10px] text-textMuted truncate">{c.edge}</div>
      </div>
      <div className="hidden sm:flex flex-col items-end shrink-0 w-14">
        <span className="font-mono text-[9px] uppercase tracking-wider text-textMuted">±1σ</span>
        <span className="font-mono text-[12px] text-textSecondary tnum">{c.expectedMovePct.toFixed(1)}%</span>
      </div>
      <div className="hidden md:flex flex-col items-end shrink-0 w-16">
        <span className="font-mono text-[9px] uppercase tracking-wider text-textMuted">θ/day</span>
        <span className="font-mono text-[12px] text-warn tnum">−{c.thetaPerDayPct.toFixed(0)}%</span>
      </div>
      <div className="flex flex-col items-end shrink-0 w-14">
        <span className="font-mono text-[9px] uppercase tracking-wider text-textMuted">mid</span>
        <span className="font-mono text-[12px] text-textPrimary tnum">${c.mid.toFixed(2)}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0 w-[92px] justify-end">
        <span className="font-mono text-lg font-bold tnum text-textPrimary">{c.composite}</span>
        <SignalBadge tone={tone}>{c.verdict}</SignalBadge>
      </div>
    </div>
  );
};

/**
 * Compass's third mode — the same-day / 0DTE desk. The board is
 * weighContracts(snapshot, 'LOTTO') (the same scoring engine as the setups and
 * the weigher, just the 0DTE horizon), and the closing-auction MOC engine rides
 * along as its context. Headerless — Compass owns the page header.
 */
const LottoBoard = ({ snapshot }: { snapshot: MarketSnapshot }) => {
  const moc = useMemo(() => buildMocRead(snapshot), [snapshot]);
  const lottos = useMemo(() => weighContracts(snapshot, 'LOTTO').slice(0, 6), [snapshot]);

  const mocTone = mocToneOf(moc);
  const best = lottos[0];
  const buyable = lottos.filter(c => c.verdict === 'BUY').length;

  return (
    <div className="flex flex-col gap-4">
      <MetricGrid min="170px">
        <StatCard label="Closing auction" value={moc.classification} sub="MOC engine read" tone={mocTone} emphasis />
        <StatCard
          label="MOC score"
          value={`${moc.score >= 0 ? '+' : ''}${moc.score}`}
          sub="−100 sell … +100 buy"
          tone={moc.score >= 0 ? 'bull' : 'bear'}
        />
        <StatCard
          label="Imbalance"
          value={`${moc.side} ${fmtUsd(Math.abs(moc.imbalanceUsd))}`}
          sub={`${moc.normalizedZ >= 0 ? '+' : ''}${moc.normalizedZ.toFixed(2)}σ normalized`}
          tone={moc.side === 'BUY' ? 'bull' : moc.side === 'SELL' ? 'bear' : 'neutral'}
        />
        <StatCard
          label="Top lotto"
          value={best ? `${best.strike}${best.right}` : '—'}
          sub={best ? `score ${best.composite} · ${best.verdict}` : 'no clean 0DTE'}
          tone={best ? verdictTone[best.verdict] : 'neutral'}
        />
        <StatCard label="0DTE buys" value={`${buyable}`} sub={`of ${lottos.length} candidates graded`} tone={buyable > 0 ? 'bull' : 'neutral'} />
      </MetricGrid>

      <Panel tone="warn" bodyClassName="py-2.5">
        <p className="flex items-start gap-2 text-[12px] text-textSecondary leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" />
          <span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-warn mr-2">Lotto risk</span>
            0DTE and closing-auction plays are all-or-nothing — theta is measured per hour, a contract can go to zero the same
            session, and the MOC imbalance you see at 3:50 is not the one that clears. Size for a total loss.
          </span>
        </p>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Gavel className="w-3.5 h-3.5" /> Closing auction · MOC engine
            </span>
          }
          subtitle="the day's biggest scheduled forced-flow event"
          className="xl:col-span-7"
          tone={mocTone}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`font-mono text-4xl font-bold tnum ${moc.score >= 0 ? 'text-bull' : 'text-bear'}`}>
                {moc.score >= 0 ? '+' : ''}
                {moc.score}
              </span>
              <div className="flex flex-col gap-1">
                <SignalBadge tone={mocTone}>{moc.classification}</SignalBadge>
                <span className="font-mono text-[11px] text-textMuted">
                  {moc.side} imbalance {fmtUsd(Math.abs(moc.imbalanceUsd))}
                </span>
              </div>
            </div>

            <ScoreGauge score={moc.score} />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { k: 'Norm. imbal', v: `${moc.normalizedZ >= 0 ? '+' : ''}${moc.normalizedZ.toFixed(2)}σ` },
                { k: 'Displacement', v: `${moc.displacementZ >= 0 ? '+' : ''}${moc.displacementZ.toFixed(2)}σ` },
                { k: 'Absorbed', v: `${moc.absorptionPct}%` },
                { k: 'Reversal risk', v: `${moc.reversalRisk}%` },
              ].map(x => (
                <div key={x.k} className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">{x.k}</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-textPrimary tnum">{x.v}</div>
                </div>
              ))}
            </div>

            <div className="border-t border-borderSubtle pt-3">
              <GrowthTimeline moc={moc} />
            </div>

            <p className="text-xs text-textSecondary leading-relaxed">{moc.note}</p>
            <p className="flex items-center gap-1.5 font-mono text-[10px] text-textMuted leading-relaxed border-t border-borderSubtle pt-2.5">
              <Clock className="w-3 h-3 shrink-0" />
              Trade the imbalance change, not the 3:50 headline — read growth, indicative displacement and absorption in the
              3:53–3:57 window before the cross.
            </p>
          </div>
        </Panel>

        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Ticket className="w-3.5 h-3.5" /> 0DTE lotto board
            </span>
          }
          subtitle="same-day contracts, graded by flow first"
          flush
          className="xl:col-span-5"
        >
          {lottos.length === 0 ? (
            <div className="py-12 text-center font-mono text-[11px] text-textMuted uppercase tracking-widest">
              No 0DTE candidates
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-borderSubtle">
              {lottos.map((c, i) => (
                <LottoRow key={c.id} c={c} best={i === 0} />
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel bodyClassName="py-3">
        <p className="text-xs text-textSecondary leading-relaxed">
          <span className="font-mono font-semibold uppercase tracking-wider mr-2 holo-text">The 0DTE desk</span>
          On 0DTE the math is nearly a coin flip, so the tape decides: the board weighs dealer flow and liquidity above the
          breakeven arithmetic, and the closing auction — the one scheduled, forced, size-on-size event of the session — gets a
          full engine instead of a single imbalance number. Modeled from the live chain and dealer read; swap in the exchange's
          own MOC feed behind the same contract.
        </p>
      </Panel>
    </div>
  );
};

export default LottoBoard;
