import { useEffect, useMemo, useState } from 'react';
import { Gavel, Ticket, AlertTriangle, Clock, ShieldAlert } from 'lucide-react';
import { buildMocRead } from '../../core/fracture';
import { weighContracts, type WeighedContract } from '../../core/contractScore';
import type { MocRead } from '../../types/fracture';
import type { MarketSnapshot } from '../../types/market';
import Panel from '../ui/Panel';
import EmptyState from '../ui/EmptyState';
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

// On the lotto desk a contract does not get a "BUY" — it either clears the
// flow/liquidity filter or it does not. Map the shared scorer's verdict to a
// qualification state so a score never reads as an instruction to buy.
const LOTTO_LABEL: Record<WeighedContract['verdict'], string> = {
  BUY: 'QUALIFIES',
  WATCH: 'CONDITIONAL',
  FADE: 'REJECTED',
};
const lottoTone: Record<WeighedContract['verdict'], Tone> = {
  BUY: 'select',
  WATCH: 'warn',
  FADE: 'bear',
};

/* ---- ET market clock: countdown to the 16:00 cross + MOC window status ---- */
const fmtDur = (secs: number): string => {
  const s = Math.max(0, secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

interface MocClock {
  marketOpen: boolean;
  mocOpen: boolean;
  toClose: string;
  label: string;
}

const computeClock = (ms: number): MocClock => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const wd = get('weekday');
  let hh = parseInt(get('hour'), 10);
  if (hh === 24) hh = 0;
  const mm = parseInt(get('minute'), 10);
  const ss = parseInt(get('second'), 10);
  const isWeekday = !['Sat', 'Sun'].includes(wd);
  const mins = hh * 60 + mm;
  const marketOpen = isWeekday && mins >= 570 && mins < 960; // 9:30–16:00 ET
  const mocOpen = isWeekday && mins >= 945 && mins < 960; // 15:45–16:00 ET
  const secsToClose = 960 * 60 - (mins * 60 + ss);
  const label = marketOpen
    ? mocOpen
      ? 'MOC window open'
      : 'market open'
    : isWeekday
      ? mins < 570
        ? 'pre-market'
        : 'after hours — closed'
      : 'weekend — closed';
  return { marketOpen, mocOpen, toClose: marketOpen ? fmtDur(secsToClose) : '—', label };
};

/* ---- MOC score gauge: -100 (sell) … 0 … +100 (buy) ---- */
const ScoreGauge = ({ score }: { score: number }) => {
  const pct = (score + 100) / 2; // 0..100
  return (
    <div className="relative h-2 rounded-full bg-white/[0.06] overflow-hidden">
      <span className="absolute top-0 bottom-0 left-1/2 w-px bg-white/25" aria-hidden />
      <span
        className={`absolute top-0 bottom-0 ${score >= 0 ? 'left-1/2' : ''} ${score >= 0 ? 'bg-bull/80' : 'bg-bear/80'}`}
        style={score >= 0 ? { width: `${(pct - 50).toFixed(1)}%` } : { left: `${pct.toFixed(1)}%`, width: `${(50 - pct).toFixed(1)}%` }}
      />
      <span className="absolute -top-0.5 h-3 w-[2px] bg-textPrimary rounded-full" style={{ left: `calc(${pct.toFixed(1)}% - 1px)` }} aria-hidden />
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
        <span className="font-mono text-micro uppercase tracking-widest text-textMuted">Imbalance growth</span>
        <SignalBadge tone={growing ? (side as Tone) : 'neutral'}>{growing ? 'building into cross' : 'fading pre-cross'}</SignalBadge>
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
          <span key={pt.t} className="flex-1 text-center font-mono text-micro text-textMuted">
            {pt.t}
          </span>
        ))}
      </div>
    </div>
  );
};

/* ---- one 0DTE lotto contract row ---- */
const LottoRow = ({ c, best }: { c: WeighedContract; best: boolean }) => {
  const rightColor = c.right === 'C' ? 'text-bull' : 'text-bear';
  return (
    <div className={`px-3.5 py-2.5 flex items-center gap-3 ${best ? 'bg-white/[0.02]' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-data font-semibold text-textPrimary tnum">
            {c.ticker} {c.strike}
            <span className={rightColor}>{c.right}</span>
          </span>
          <span className="font-mono text-micro uppercase tracking-wider text-textMuted border border-borderSubtle rounded px-1 py-px">
            {c.dte === 0 ? '0DTE' : `${c.dte}DTE`}
          </span>
          {best && <SignalBadge tone="magenta">Top lotto</SignalBadge>}
        </div>
        <div className="mt-1 font-mono text-label text-textMuted truncate">{c.edge}</div>
      </div>
      <div className="hidden sm:flex flex-col items-end shrink-0 w-14">
        <span className="font-mono text-micro uppercase tracking-wider text-textMuted">±1σ</span>
        <span className="font-mono text-caption text-textSecondary tnum">{c.expectedMovePct.toFixed(1)}%</span>
      </div>
      <div className="hidden md:flex flex-col items-end shrink-0 w-16">
        <span className="font-mono text-micro uppercase tracking-wider text-textMuted">θ/day</span>
        <span className="font-mono text-caption text-warn tnum">−{c.thetaPerDayPct.toFixed(0)}%</span>
      </div>
      <div className="flex flex-col items-end shrink-0 w-14">
        <span className="font-mono text-micro uppercase tracking-wider text-textMuted">mid</span>
        <span className="font-mono text-caption text-textPrimary tnum">${c.mid.toFixed(2)}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0 w-[124px] justify-end">
        <span className="font-mono text-lg font-bold tnum text-textPrimary">{c.composite}</span>
        <SignalBadge tone={lottoTone[c.verdict]}>{LOTTO_LABEL[c.verdict]}</SignalBadge>
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

  const [acked, setAcked] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const clock = useMemo(() => computeClock(nowTick), [nowTick]);

  const mocTone = mocToneOf(moc);
  const qualifies = lottos.filter(c => c.verdict === 'BUY').length;

  return (
    <div className="flex flex-col gap-4">
      <MetricGrid min="170px">
        <StatCard label="Closing auction" value={moc.classification} sub="MOC engine read" tone={mocTone} emphasis />
        <StatCard label="MOC score" value={`${moc.score >= 0 ? '+' : ''}${moc.score}`} sub="−100 sell … +100 buy" tone={moc.score >= 0 ? 'bull' : 'bear'} />
        <StatCard
          label="Imbalance"
          value={`${moc.side} ${fmtUsd(Math.abs(moc.imbalanceUsd))}`}
          sub={`${moc.normalizedZ >= 0 ? '+' : ''}${moc.normalizedZ.toFixed(2)}σ normalized`}
          tone={moc.side === 'BUY' ? 'bull' : moc.side === 'SELL' ? 'bear' : 'neutral'}
        />
        <StatCard
          label="Time to close"
          value={clock.marketOpen ? clock.toClose : 'closed'}
          sub={clock.label}
          tone={clock.mocOpen ? 'warn' : clock.marketOpen ? 'select' : 'neutral'}
        />
        <StatCard label="0DTE qualifies" value={`${qualifies}`} sub={`of ${lottos.length} candidates graded`} tone={qualifies > 0 ? 'select' : 'neutral'} />
      </MetricGrid>

      <Panel tone="warn" bodyClassName="py-2.5">
        <p className="flex items-start gap-2 text-caption text-textSecondary leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" />
          <span>
            <span className="font-mono text-micro font-semibold uppercase tracking-widest text-warn mr-2">Lotto risk</span>
            0DTE and closing-auction plays are all-or-nothing — theta is measured per hour, a contract can go to zero the same
            session, and the imbalance you see at 3:50 is not the one that clears. Size for a total loss.
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
            {!clock.mocOpen && (
              <p className="flex items-center gap-2 font-mono text-micro uppercase tracking-widest text-textMuted border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
                <Clock className="w-3 h-3 shrink-0" />
                MOC window inactive · publishes 3:45–4:00pm ET — {clock.label}
              </p>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`font-mono text-4xl font-bold tnum ${moc.score >= 0 ? 'text-bull' : 'text-bear'}`}>
                {moc.score >= 0 ? '+' : ''}
                {moc.score}
              </span>
              <div className="flex flex-col gap-1">
                <SignalBadge tone={mocTone}>{moc.classification}</SignalBadge>
                <span className="font-mono text-label text-textMuted">
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
                  <div className="font-mono text-micro uppercase tracking-widest text-textMuted">{x.k}</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-textPrimary tnum">{x.v}</div>
                </div>
              ))}
            </div>

            <div className="border-t border-borderSubtle pt-3">
              <GrowthTimeline moc={moc} />
            </div>

            <p className="text-xs text-textSecondary leading-relaxed">{moc.note}</p>
            <p className="flex items-center gap-1.5 font-mono text-micro text-textMuted leading-relaxed border-t border-borderSubtle pt-2.5">
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
          subtitle="same-day contracts — QUALIFIES / CONDITIONAL / REJECTED by flow"
          flush
          className="xl:col-span-5"
        >
          {!acked ? (
            <div className="px-4 py-8 flex flex-col items-center text-center gap-3">
              <ShieldAlert className="w-6 h-6 text-warn" />
              <p className="text-caption text-textSecondary leading-relaxed max-w-[34ch]">
                These are 0DTE lotto tickets. Most expire worthless. Only view the board if you accept that a full loss of the
                premium is the expected outcome.
              </p>
              <button
                onClick={() => setAcked(true)}
                className="mt-1 inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-warn/40 bg-warn/10 hover:bg-warn/15 font-mono text-label font-semibold uppercase tracking-wider text-warn transition-colors"
              >
                I accept a total loss — show the board
              </button>
            </div>
          ) : lottos.length === 0 ? (
            <EmptyState size="lg" title="No 0DTE candidates" />
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
          full engine instead of a single imbalance number. Built from the live chain and the dealer read.
        </p>
      </Panel>
    </div>
  );
};

export default LottoBoard;
