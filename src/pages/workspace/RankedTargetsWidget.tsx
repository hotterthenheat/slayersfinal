/*
==================================================
  SLAYER TERMINAL - WORKSPACE RANKED TARGETS
  The strikes that own the day, on the desk (Noah,
  2026-08-22). The same engine as the Ranked Targets
  page — priority split by reason, re-ranked through
  any one lens — as a dense ladder. A click focuses
  the strike on THIS desk's chart (the desk's own
  door, not a route away from it).
==================================================
*/

import { useMemo, useState } from 'react';
import SignalBadge from '../../components/ui/SignalBadge';
import { buildRankedTargets, FACTOR_LABEL, RANK_LENSES, rankBy } from '../../data/rankedtargets';
import { fmtUsd } from '../../data/gex';
import type { RankLens, RankedTarget, TargetTag } from '../../types/gex';
import type { Tone } from '../../components/ui/tones';
import type { WorkspaceCtx } from './registry';
import Strip from './Strip';

const TAG_TONE: Record<TargetTag, Tone> = {
  WALL: 'warn',
  PIN: 'neutral',
  KING: 'magenta',
  'SPOT TARGET': 'select',
};

/** The page's reason bar, in miniature: one alpha per reason, bar order fixed */
const SEGMENT_ALPHA = [0.92, 0.7, 0.52, 0.38, 0.26];
const ReasonBar = ({ t, primary }: { t: RankedTarget; primary: boolean }) => (
  <span className="flex w-full h-[3px] rounded-full bg-white/[0.06] overflow-hidden gap-px" title={t.reason}>
    {t.factors.map((f, i) => (
      <span
        key={f.key}
        title={FACTOR_LABEL[f.key]}
        className="h-full shrink-0 transition-[width] duration-700 ease-out"
        style={{ width: `${f.points}%`, background: primary ? `rgba(234,0,255,${SEGMENT_ALPHA[i]})` : `rgba(237,237,237,${SEGMENT_ALPHA[i] * 0.55})` }}
      />
    ))}
  </span>
);

const fmtStrike = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));

const RankedTargetsWidget = ({ ctx }: { ctx: WorkspaceCtx }) => {
  const [lens, setLens] = useState<RankLens>('priority');
  // Scan tier: ctx.snapshot is the desk's 10s reference — the ranking holds
  // still between sweeps, exactly like the page.
  const view = useMemo(() => buildRankedTargets(ctx.snapshot), [ctx.snapshot]);
  const ranked = useMemo(() => rankBy(view.targets, lens), [view, lens]);

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="shrink-0 px-2 py-1.5 border-b border-borderSubtle/60 flex items-center gap-2 flex-wrap">
        <Strip label="Ranked by" value={lens} options={RANK_LENSES} onChange={setLens} />
        <span className="ml-auto font-mono text-[9px] uppercase tracking-widest text-textMuted tnum">
          {ranked.length} strikes · click one to see it on the chart
        </span>
      </div>
      <div className="shrink-0 grid grid-cols-[28px_minmax(0,1fr)_64px_56px_76px] items-center gap-x-2 px-2.5 h-6 border-b border-borderSubtle bg-[#0c0c0c] select-none font-mono text-[9px] uppercase tracking-widest text-textSecondary">
        <span>Rank</span>
        <span>Strike</span>
        <span>Priority</span>
        <span className="text-right">BPS</span>
        <span className="text-right">Net GEX</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {ranked.map(t => {
          const primary = t.rank === 1;
          return (
            <button
              key={t.strike}
              onClick={() => ctx.focusStrike?.(t.strike)}
              title={`${t.reason} — click to see ${fmtStrike(t.strike)} on the chart`}
              className={`w-full grid grid-cols-[28px_minmax(0,1fr)_64px_56px_76px] items-center gap-x-2 px-2.5 h-8 border-b border-borderSubtle/30 text-left transition-colors hover:bg-white/[0.03] ${
                primary ? 'bg-king/[0.06]' : ''
              }`}
            >
              <span className="font-mono text-[10px] tnum text-textSecondary">#{t.rank}</span>
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="font-mono text-[12px] font-bold tnum text-textPrimary">{fmtStrike(t.strike)}</span>
                {t.tags.slice(0, 2).map(tag => (
                  <SignalBadge key={tag} tone={TAG_TONE[tag]}>
                    {tag}
                  </SignalBadge>
                ))}
              </span>
              <span className="flex items-center">
                <ReasonBar t={t} primary={primary} />
              </span>
              <span className="text-right font-mono text-[11px] tnum text-textPrimary">
                {t.bps >= 0 ? '+' : ''}
                {t.bps}
              </span>
              {/* Positive = put-dominant = short gamma = red (sim side-coding) */}
              <span className={`text-right font-mono text-[11px] font-semibold tnum ${t.netGex > 0 ? 'text-gold-ink' : 'text-steel-ink'}`}>{fmtUsd(t.netGex)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default RankedTargetsWidget;
