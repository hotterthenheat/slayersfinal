/*
==================================================
  SLAYER TERMINAL - DOSSIER FEED (Compass)
  The slow scanners (Weeklies / Swings) don't render
  as a radar feed — each setup is a campaign dossier:
  a trade-path rail from entry through the TP ladder,
  and a level-respect status instead of a flickering
  confidence bar. Weeklies race Friday (days ribbon);
  swings carry no clock and stay on the board only
  while price respects the calculated floor. Users
  see states (ACTIVE / WATCH), never orders.
==================================================
*/

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ShieldAlert } from 'lucide-react';
import RichRead from '../ui/RichRead';
import SignalBadge from '../ui/SignalBadge';
import { setupStage, STAGE_META } from './setupStage';
import { VERDICT_LABEL, type Setup, type SetupGroup } from '../../types/compass';

export type DossierVariant = 'weeklies' | 'swings';

interface DossierFeedProps {
  groups: SetupGroup[];
  variant: DossierVariant;
  onReview: (setup: Setup) => void;
}

type LevelState = 'RESPECTING' | 'TESTING' | 'BROKEN';

/** The kill switch: where price sits relative to the calculated floor. */
function levelState(s: Setup, spot: number): LevelState {
  const buffer = s.invalidationPrice * 0.004;
  if (s.right === 'C') {
    if (spot < s.invalidationPrice) return 'BROKEN';
    if (spot < s.invalidationPrice + buffer) return 'TESTING';
  } else {
    if (spot > s.invalidationPrice) return 'BROKEN';
    if (spot > s.invalidationPrice - buffer) return 'TESTING';
  }
  return 'RESPECTING';
}

const STATE_STYLE: Record<Exclude<LevelState, 'BROKEN'>, { label: string; cls: string; dot: string }> = {
  RESPECTING: { label: 'Respecting levels', cls: 'text-textPrimary', dot: 'bg-bull' },
  TESTING: { label: 'Testing the floor', cls: 'text-warn', dot: 'bg-warn' },
};

/** Deterministic "held for N days" — sim placeholder until real entry dates. */
function heldDays(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 34) + 2;
}

/** Every card gets its own read, composed from its own numbers — never the
    same sentence twice down the board. */
function thesisLine(s: Setup, spot: number, variant: DossierVariant): string {
  const cushionPct = (Math.abs(spot - s.invalidationPrice) / spot) * 100;
  const nextIdx = s.takeProfits.findIndex(tp => tp.status !== 'HIT');
  const milestone =
    nextIdx === -1
      ? 'every take-profit already hit'
      : `next milestone is TP${nextIdx + 1} at $${s.takeProfits[nextIdx].target.toFixed(2)}`;
  const side = s.right === 'C' ? 'above' : 'below';
  // A call is held up by a floor; a put is capped by a ceiling
  const level = s.right === 'C' ? 'floor' : 'ceiling';
  const tail =
    variant === 'weeklies'
      ? 'theta builds into Friday.'
      : `no clock — the ${level} is the only exit.`;
  return `${s.ticker} is holding ${cushionPct.toFixed(1)}% ${side} its ${level} (${s.invalidationReason.toLowerCase()}); ${milestone} — ${tail}`;
}

const WEEK = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

/** Weeklies race the calendar — elapsed days dim, theta heat builds into Friday. */
const DaysRibbon = () => {
  const todayIdx = Math.min(Math.max(new Date().getDay() - 1, 0), 4);
  return (
    <span className="inline-flex items-center gap-1">
      {WEEK.map((d, i) => {
        const past = i < todayIdx;
        const today = i === todayIdx;
        const thetaHeat = i > todayIdx ? (i - todayIdx) / Math.max(1, 4 - todayIdx) : 0;
        return (
          <span
            key={d}
            className={`px-1.5 py-0.5 rounded font-mono text-[9px] font-bold tracking-widest border ${
              today
                ? 'border-textPrimary/60 text-textPrimary bg-white/[0.06]'
                : past
                  ? 'border-transparent text-textMuted/50'
                  : 'border-borderSubtle text-textSecondary'
            }`}
            style={!today && !past ? { background: `rgba(255,149,0,${0.04 + thetaHeat * 0.12})` } : undefined}
          >
            {d}
          </span>
        );
      })}
    </span>
  );
};

/* Every moving part of the rail glides between scans — dossiers re-read each
   10s sweep by design, and a marker that TELEPORTS on refresh reads as a
   glitch (Noah: "smooth, not quick or glitchy"). House ease. */
const GLIDE = 'transition-[left,width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]';

/** The trade's map, in premium space: entry → NOW → the TP ladder — plus the
    campaign's MEMORY. The high-water segment records how far premium has
    actually been, so a banked TP with price now faded back reads as the true
    story ("hit, then retraced") instead of the rail contradicting the chips. */
const PathRail = ({ s }: { s: Setup }) => {
  const tps = s.takeProfits;
  const lastTarget = tps[tps.length - 1]?.target ?? s.mid;
  const lo = Math.min(s.mid, s.liveMid) * 0.93;
  const hi = Math.max(lastTarget, s.liveMid, s.highWater) * 1.04;
  const pct = (v: number) => Math.min(99, Math.max(1, ((v - lo) / (hi - lo || 1)) * 100));

  const entryPct = pct(s.mid);
  const nowPct = pct(s.liveMid);
  const highPct = pct(s.highWater);
  const inProfit = s.liveMid >= s.mid;
  const showMemory = s.highWater > Math.max(s.mid, s.liveMid) * 1.01;

  return (
    <div className="relative h-12 select-none" aria-label="Trade path">
      {/* Track */}
      <span className="absolute left-0 right-0 top-[22px] h-[3px] rounded-full bg-white/[0.06]" />
      {/* Memory — how far the premium has BEEN since entry. Faint on purpose:
          it is history, not position. */}
      {showMemory && (
        <span
          className={`absolute top-[22px] h-[3px] rounded-full bg-bull/25 ${GLIDE}`}
          style={{ left: `${entryPct}%`, width: `${Math.max(0, highPct - entryPct)}%` }}
          title={`High water $${s.highWater.toFixed(2)}`}
        />
      )}
      {/* Progress from entry to now — lime when working, red when underwater */}
      <span
        className={`absolute top-[22px] h-[3px] rounded-full ${inProfit ? 'bg-bull/90' : 'bg-bear/80'} ${GLIDE}`}
        style={{
          left: `${Math.min(entryPct, nowPct)}%`,
          width: `${Math.abs(nowPct - entryPct)}%`,
        }}
      />
      {/* Entry tick — its price lives as a chip in the ladder row below */}
      <span
        className={`absolute top-[16px] w-px h-[15px] bg-textSecondary ${GLIDE}`}
        style={{ left: `${entryPct}%` }}
        title={`Entry $${s.mid.toFixed(2)}`}
      />
      {/* TP ticks */}
      {tps.map((tp, i) => {
        const hit = tp.status === 'HIT';
        const live = tp.status === 'IN PROGRESS';
        return (
          <span key={tp.level}>
            <span
              className={`absolute top-[17px] w-[7px] h-[13px] -translate-x-1/2 rounded-[2px] border ${
                hit
                  ? 'bg-bull/90 border-bull'
                  : live
                    ? 'border-bull/80 bg-bull/20'
                    : 'border-borderMuted bg-transparent'
              }`}
              style={{ left: `${pct(tp.target)}%` }}
              title={`TP${i + 1} $${tp.target.toFixed(2)} (${tp.status.toLowerCase()})`}
            />
            <span
              className={`absolute top-[3px] -translate-x-1/2 font-mono text-[9px] font-semibold tracking-wider ${
                hit ? 'text-bull font-bold' : live ? 'text-bull/90' : 'text-textSecondary'
              }`}
              style={{ left: `${pct(tp.target)}%` }}
            >
              TP{i + 1}
            </span>
          </span>
        );
      })}
      {/* NOW marker — white = where you are */}
      <span
        className={`absolute top-[14px] w-[3px] h-[19px] -translate-x-1/2 rounded-full bg-textPrimary shadow-[0_0_8px_rgba(237,237,237,0.5)] ${GLIDE}`}
        style={{ left: `${nowPct}%` }}
      />
      <span
        className={`absolute top-[34px] -translate-x-1/2 font-mono text-[10px] font-bold tnum text-textPrimary whitespace-nowrap ${GLIDE}`}
        style={{ left: `${nowPct}%` }}
      >
        ${s.liveMid.toFixed(2)}
      </span>
    </div>
  );
};

const DossierCard = ({
  s,
  spot,
  state,
  variant,
  isTop,
  onReview,
}: {
  s: Setup;
  spot: number;
  state: Exclude<LevelState, 'BROKEN'>;
  variant: DossierVariant;
  /** Only the board's #1 wears TOP PICK — a badge on every card means nothing */
  isTop: boolean;
  onReview: () => void;
}) => {
  const st = STATE_STYLE[state];
  const hitCount = s.takeProfits.filter(tp => tp.status === 'HIT').length;
  const active = s.verdict === 'ENTER';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={`relative rounded-md border bg-inset overflow-hidden ${
        state === 'TESTING' ? 'border-warn/30' : 'border-borderSubtle'
      }`}
    >
      {/* Living-foil edge — the campaign identity */}
      <span className="absolute left-0 top-0 bottom-0 w-[3px] holo-bar" aria-hidden />

      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 pt-3.5 flex-wrap">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold ${
            s.right === 'C' ? 'border-bull/30 bg-bull/10 text-bull' : 'border-bear/30 bg-bear/10 text-bear'
          }`}
        >
          {s.contract}
        </span>
        {isTop && <SignalBadge tone="magenta">TOP PICK</SignalBadge>}
        <span className="font-mono text-[11px] text-textSecondary tnum">
          {s.ticker} ${spot.toFixed(2)}
        </span>
        <span className="ml-auto flex items-center gap-3">
          {variant === 'weeklies' ? (
            <DaysRibbon />
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-widest text-textSecondary tnum">
              Held {heldDays(s.id)}d
            </span>
          )}
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
              active ? 'text-[#0a0a0a]' : 'text-textPrimary bg-white/[0.08]'
            }`}
            style={active ? { background: 'rgba(48,209,88,0.92)' } : undefined}
          >
            {VERDICT_LABEL[s.verdict]}
          </span>
        </span>
      </div>

      {/* Trade path */}
      <div className="px-4 mt-2">
        <PathRail s={s} />
      </div>

      {/* Entry + TP ladder chips */}
      <div className="px-4 mt-1.5 flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center rounded border border-borderSubtle px-2 py-1 font-mono text-[10px] font-semibold tracking-wider text-textSecondary">
          ENTRY ${s.mid.toFixed(2)}
        </span>
        {s.takeProfits.map((tp, i) => (
          <span
            key={tp.level}
            className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10px] font-semibold tracking-wider ${
              tp.status === 'HIT'
                ? 'border-transparent bg-bull/90 text-[#0a0a0a]'
                : tp.status === 'IN PROGRESS'
                  ? 'border-bull/50 text-bull'
                  : 'border-borderSubtle text-textSecondary'
            }`}
          >
            TP{i + 1} +{tp.expectedPct}% · ${tp.target.toFixed(2)}
          </span>
        ))}
        <span className="font-mono text-[10px] text-textSecondary tnum">
          {hitCount}/{s.takeProfits.length} hit
        </span>
      </div>

      {/* Thesis + floor */}
      <div className="px-4 mt-3 pb-3.5 flex items-start gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest">
            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
            <span className={st.cls}>{st.label}</span>
          </span>
          <p className="mt-1 text-[12px] text-textSecondary leading-relaxed line-clamp-2">
            <RichRead text={thesisLine(s, spot, variant)} />
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="flex items-center justify-end gap-1 font-mono text-[10px] uppercase tracking-widest text-textSecondary">
            <ShieldAlert className="w-3 h-3 text-bear/80" /> Floor
          </span>
          <span className="block font-mono text-[13px] font-semibold tnum text-textPrimary">
            {s.right === 'C' ? 'below' : 'above'} ${s.invalidationPrice.toFixed(2)}
          </span>
          <span className="block font-mono text-[9px] uppercase tracking-wider text-textSecondary">
            retires on a close through it
          </span>
        </div>
        {/* Black plate, living silver border and lettering — holo-border keeps a
            #0a0a0a padding-box fill under the gradient border-box */}
        <button
          onClick={onReview}
          className="shrink-0 self-center inline-flex items-center gap-1.5 px-3 py-2 rounded-md holo-border hover:brightness-125 font-mono text-[10px] font-semibold uppercase tracking-wider transition-[filter]"
        >
          <span className="holo-text">Full analysis</span>
          <ArrowUpRight className="w-3 h-3 text-[#C7D3E8]" />
        </button>
      </div>
    </motion.div>
  );
};

/** Campaign board for the slow scanners — calm by design. */
const DossierFeed = ({ groups, variant, onReview }: DossierFeedProps) => {
  const { live, retired } = useMemo(() => {
    const flat = groups.flatMap(g => g.setups.map(s => ({ s, spot: g.spot, state: levelState(s, g.spot) })));
    // A campaign that is actually printing a target outranks a higher-scoring
    // one that is still only qualified; score breaks ties within a stage.
    flat.sort((a, b) => {
      const stageGap =
        STAGE_META[setupStage(b.s, b.state === 'BROKEN')].rank - STAGE_META[setupStage(a.s, a.state === 'BROKEN')].rank;
      return stageGap !== 0 ? stageGap : b.s.score - a.s.score;
    });
    // A broken floor or a degraded thesis both take a campaign off the board
    const alive = flat.filter(x => x.state !== 'BROKEN' && x.s.verdict !== 'EXIT');
    return {
      live: alive as { s: Setup; spot: number; state: Exclude<LevelState, 'BROKEN'> }[],
      retired: flat.length - alive.length,
    };
  }, [groups]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-textPrimary">
          {live.length} campaigns on the board
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-textSecondary">
          {variant === 'weeklies'
            ? 'these race friday — reviewed each scan, not each tick'
            : 'no clock — a swing stays listed while price respects its floor'}
        </span>
        {retired > 0 && (
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-bear/90">
            {retired} retired — floor broken or thesis dead
          </span>
        )}
      </div>
      {live.length === 0 ? (
        <div className="border border-borderSubtle bg-inset rounded-md py-12 text-center font-mono text-[11px] text-textMuted uppercase tracking-widest">
          No campaigns holding their levels right now
        </div>
      ) : (
        live.map(({ s, spot, state }, i) => (
          <DossierCard
            key={s.id}
            s={s}
            spot={spot}
            state={state}
            variant={variant}
            isTop={i === 0}
            onReview={() => onReview(s)}
          />
        ))
      )}
    </div>
  );
};

export default DossierFeed;
