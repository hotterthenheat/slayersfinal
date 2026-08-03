/*
  Scene 7 — Pinpoint, levels / greeks / stress.

  Three reads, one frame, because they answer one question: is the level a line
  or a state? Ranked levels give it a distance and a confidence, the exposure
  greeks give it a direction of drift, and the stress column runs the controlled
  experiment — shock spot, shock IV, advance time — until it finds the case where
  the level stops surviving.
*/

import React from 'react';
import { useTrailer, at, clamp01, ease } from '../useTrailerState';
import { Bar, Caveat, SceneHead, SceneStatement, SignedBar, Verdict } from '../parts';
import { prob, px, usd } from '../format';

const LevelsStressScene: React.FC = () => {
  const { story, thread, progress: p, reduced, compact } = useTrailer();

  /*
    Role and distance against the live spot, nearest first.

    Both were baked into the story at the session close, so a level the price had
    since dropped under still read SUPPORT with a negative distance while the HUD
    two rows down showed price below it. They are facts about now, so they are
    computed now — the level's reaction, confidence and sensitivity are properties
    of the book and stay where they were built.
  */
  const board = story.rankedLevels
    .map(l => ({
      ...l,
      role: l.isFlip ? 'PIVOT' : l.price < thread.spot ? 'SUPPORT' : 'RESISTANCE',
      distancePct: ((l.price - thread.spot) / thread.spot) * 100,
    }))
    .sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct));

  const levelsT = ease(at(p, 0.06, 0.34));
  const greeksT = ease(at(p, 0.26, 0.56));
  // The stress cases run one after another — an experiment, not a table.
  const caseIndex = Math.min(story.stress.length - 1, Math.floor(at(p, 0.42, 0.94) * story.stress.length));

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <SceneHead
        product="Pinpoint · Levels, Greeks, Stress"
        line="A level is not a line. It is a state that can survive or fail."
        p={p}
        reduced={reduced}
      />

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* levels */}
        <div className="inst-surface rounded-md p-2.5 flex flex-col min-h-0">
          <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1.5">Ranked levels</div>
          <div className="flex-1 min-h-0 flex flex-col justify-evenly gap-1.5">
            {board.map((l, i) => {
              const e = clamp01((levelsT - i * 0.12) / 0.6);
              if (e <= 0) return null;
              return (
                <div key={l.price} style={{ opacity: e }} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2 font-mono text-micro tnum">
                    <span className="text-textPrimary">{px(l.price)}</span>
                    <span
                      className={
                        l.role === 'SUPPORT' ? 'text-bull' : l.role === 'RESISTANCE' ? 'text-bear' : 'text-flip'
                      }
                    >
                      {l.role}
                    </span>
                    <span className="text-textMuted ml-auto">
                      {l.distancePct >= 0 ? '+' : ''}
                      {l.distancePct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="mt-0.5 grid grid-cols-[1fr_1fr] gap-1.5">
                    <div>
                      <div className="font-mono text-micro text-textMuted">conf {prob(l.confidence)}</div>
                      <Bar value={l.confidence} grow={e} tone="select" height={3} />
                    </div>
                    <div>
                      <div className="font-mono text-micro text-textMuted">sens {prob(l.sensitivity)}</div>
                      <Bar value={l.sensitivity} grow={e} tone="warn" height={3} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* greeks */}
        <div className="inst-surface rounded-md p-2.5 flex flex-col min-h-0">
          <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1.5">
            Exposure greeks · drift to close
          </div>
          <div className="flex-1 min-h-0 flex flex-col justify-evenly gap-1.5">
            {story.greeks.map((g, i) => {
              const e = clamp01((greeksT - i * 0.08) / 0.6);
              if (e <= 0) return null;
              const norm = clamp01(Math.abs(g.now) / 2e9 + 0.18);
              return (
                <div key={g.key} style={{ opacity: e }}>
                  <div className="flex items-baseline justify-between gap-2 font-mono text-micro tnum">
                    <span className="text-textSecondary uppercase tracking-wider">{g.label}</span>
                    <span className="text-textPrimary">{usd(g.now)}</span>
                    <span className="text-textMuted w-10 text-right">{g.unit}</span>
                  </div>
                  <SignedBar value={g.now >= 0 ? norm : -norm} grow={e} height={5} />
                </div>
              );
            })}
          </div>
        </div>

        {/* stress */}
        <div className="inst-surface rounded-md p-2.5 flex flex-col min-h-0">
          <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1.5">
            Stress · does {px(story.level)} hold?
          </div>
          <div className="flex-1 min-h-0 flex flex-col justify-evenly gap-1.5">
            {story.stress.map((s, i) => {
              const active = i === caseIndex;
              const seen = i <= caseIndex;
              return (
                <div
                  key={s.label}
                  className={`rounded px-2 py-1.5 border transition-colors ${
                    active
                      ? s.levelSurvives
                        ? 'border-bull/30 bg-bull/[0.06]'
                        : 'border-bear/35 bg-bear/[0.07]'
                      : 'border-borderSubtle/60'
                  }`}
                  style={{ opacity: seen ? 1 : 0.32 }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-micro uppercase tracking-wider text-textPrimary">{s.label}</span>
                    {/* The level's own words. SELECTED/REJECTED belong to a
                        decision; a shock case is a state the level either
                        survives or does not, and borrowing the decision lexicon
                        for it read as though the desk had chosen the shock. */}
                    {seen && <Verdict>{s.levelSurvives ? 'HOLDS' : 'BREAKS'}</Verdict>}
                  </div>
                  {seen && (
                    <>
                      <div className="mt-0.5 font-mono text-micro tnum text-textSecondary">
                        hedge flow {usd(s.hedgeFlow)}
                      </div>
                      {active && !compact && (
                        <p className="mt-0.5 font-mono text-micro text-textMuted leading-snug">{s.note}</p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <SceneStatement p={p} from={0.7} reduced={reduced}>
          It survives a half-percent shock and an IV bump. It stops surviving below the flip, where the same hedge flow
          changes sign.
        </SceneStatement>
        <Caveat>
          Modelled shocks against the simulated book · hedge flow is an estimate of dealer response, not a measured
          order
        </Caveat>
      </div>
    </div>
  );
};

export default LevelsStressScene;
