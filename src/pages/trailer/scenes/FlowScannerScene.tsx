/*
  Scene 3 — Trace, flow scanner.

  The tape collapses into a market-wide scan. One row climbs as its evidence
  accumulates while the loud row above it decays — a search in progress, not a
  finished table. The live score is computed from what was knowable at the time;
  the confirmed column stays empty until an outcome exists to put in it.
*/

import React from 'react';
import { useTrailer, at, ease, lerp } from '../useTrailerState';
import { Bar, Beat, Caveat, FillBox, HeadRow, SceneHead, SceneStatement, Verdict } from '../parts';
import { usd } from '../format';

const GRID = '1fr 74px 54px 56px 48px 92px';
const GRID_SM = '1fr 62px 88px';

const FlowScannerScene: React.FC = () => {
  const { story, progress: p, reduced, compact } = useTrailer();

  const t = ease(at(p, 0.16, 0.82));
  const scored = story.scanner.map(r => ({ ...r, score: lerp(r.scoreFrom, r.scoreTo, t) }));
  const ranked = [...scored].sort((a, b) => b.score - a.score);

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <SceneHead
        product="Trace · Flow Scanner"
        line="One print is noise. A changing distribution is information."
        p={p}
        reduced={reduced}
      />

      <div className="flex-1 min-h-0 inst-surface rounded-md p-3 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <span className="font-mono text-micro uppercase tracking-widest text-textMuted">
            Scanning {compact ? '2,840' : '2,840 contracts'} · re-ranked continuously
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-micro uppercase tracking-wider text-flip">
            <span className="w-1.5 h-1.5 rounded-full bg-flip custom-pulse" />
            Live read
          </span>
        </div>

        <HeadRow
          cols={compact ? ['CONTRACT', 'SCORE', 'STATE'] : ['CONTRACT', 'PREMIUM', 'VOL/OI', 'MNY', 'DTE', 'SCORE']}
          grid={compact ? GRID_SM : GRID}
        />

        {/* Ranked, not re-mounted: rows keep their key so a climb reads as one
            row moving rather than the table redrawing. */}
        <FillBox className="mt-1 relative flex-1" min={140}>
          {H => {
            // Rows are absolutely positioned so a climb animates as one row
            // moving, not as the table redrawing — so the step has to be derived
            // from the height the board was actually given.
            const step = Math.min(46, H / ranked.length);
            return ranked.map((r, i) => (
            <div
              key={r.id}
              className={`absolute inset-x-0 grid gap-2 items-center py-1.5 font-mono text-micro sm:text-label tnum border-b border-borderSubtle/50 ${
                r.ours ? 'inst-selected pl-1.5 text-textPrimary' : 'text-textSecondary'
              }`}
              style={{
                gridTemplateColumns: compact ? GRID_SM : GRID,
                transform: `translate3d(0, ${i * step}px, 0)`,
                transition: reduced ? undefined : 'transform 480ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <span className="truncate">{r.label}</span>
              {!compact && <span>{usd(r.premium)}</span>}
              {!compact && <span>{r.volOi.toFixed(2)}</span>}
              {!compact && <span className={r.moneyness >= 0 ? 'text-textSecondary' : 'text-textMuted'}>{(r.moneyness * 100).toFixed(1)}%</span>}
              {!compact && <span className="text-textMuted">{r.dte}D</span>}
              <span className="flex items-center gap-2 min-w-0">
                <span className={r.ours ? 'text-select' : ''}>{Math.round(r.score)}</span>
                <Bar value={r.score / 100} tone={r.ours ? 'select' : 'neutral'} className="min-w-[28px]" />
              </span>
              {compact && <Verdict>{r.state}</Verdict>}
            </div>
            ));
          }}
        </FillBox>

        {!compact && (
          <Beat p={p} from={0.4} reduced={reduced} className="mt-auto pt-2 border-t border-borderSubtle">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-micro uppercase tracking-wider">
              <span className="text-textMuted">
                Live read <span className="text-textSecondary normal-case tracking-normal">what was knowable at the time</span>
              </span>
              <span className="text-textMuted">
                Confirmed outcome <span className="text-textSecondary normal-case tracking-normal">not available until the horizon closes</span>
              </span>
            </div>
          </Beat>
        )}
      </div>

      <div className="space-y-1">
        <SceneStatement p={p} from={0.56} reduced={reduced}>
          The loudest row is decaying. The one that climbed did it on corroboration, and it is still only a live read.
        </SceneStatement>
        <Caveat>
          Modelled universe · scores use information available at the timestamp shown · no outcome data enters a live
          score
        </Caveat>
      </div>
    </div>
  );
};

export default FlowScannerScene;
