/*
  Scene 14 — News.

  A catalyst arriving is not a sentiment score. The four items cluster (one story
  syndicated six ways is one story), the catalyst is typed, novelty is measured
  against what was already priced, and the visible output is a distribution that
  gets wider and drifts slightly — repricing, not a direction call. The last item
  contradicts the first, and confidence falls rather than the direction flipping.
*/

import React from 'react';
import { useTrailer, clamp01, ease, lerp } from '../useTrailerState';
import { Beat, Caveat, SceneHead, SceneStatement } from '../parts';
import { prob } from '../format';
import { STORY_SECONDS } from '../trailerStory';
import { storyUAtSceneStart } from '../useTrailerTimeline';

const Repricing: React.FC<{ t: number; before: { drift: number; width: number }; after: { drift: number; width: number }; height: number }> = ({
  t,
  before,
  after,
  height,
}) => {
  const W = 1000;
  const H = height;
  const drift = lerp(before.drift, after.drift, t);
  const width = lerp(before.width, after.width, t);
  const curve = (d: number, w: number, scale: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 60; i++) {
      const u = i / 60;
      const xz = (u - 0.5) * 0.09;
      const z = (xz - d) / w;
      const v = Math.exp(-0.5 * z * z);
      pts.push(`${(u * W).toFixed(1)},${(H - v * (H - 14) * scale).toFixed(1)}`);
    }
    return pts.join(' ');
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: H }} role="img" aria-label="Forecast distribution before and after the catalyst: wider, with a small drift">
      <polyline points={curve(before.drift, before.width, 1)} fill="none" stroke="#7d7d7d" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <polyline points={curve(drift, width, 1)} fill="none" stroke="#E4E8F4" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      <line x1={W / 2} x2={W / 2} y1={0} y2={H} stroke="#2a2a2a" strokeWidth={1} />
    </svg>
  );
};

const NewsScene: React.FC = () => {
  const { story, progress: p, storyU, reduced, compact } = useTrailer();
  const n = story.news;

  /*
    Items arrive when the session reaches their timestamp.

    Staged on scene progress they marched in evenly regardless of what the clock
    said — and because the feed was stamped across 158 seconds while the scene
    only advances the session by 48, the contradiction that drives the repricing
    appeared a third of the way in, at a moment the HUD would never reach. The
    timestamps are now laid out inside this scene's own window (`buildNews`), and
    the reveal — and the repricing it causes — follow the same clock.
  */
  const elapsed = (storyU - storyUAtSceneStart('news')) * STORY_SECONDS;
  const arrived = n.items.filter(item => item.at <= elapsed).length;
  const last = n.items[n.items.length - 1];
  // The distribution reprices as the evidence lands, finishing when the
  // contradicting check does.
  // The repricing resolves just after the last item, not exactly on it.
  const t = ease(clamp01(elapsed / Math.max(1, last.at * 1.25)));

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <SceneHead product="News" line="Not sentiment. Distributional repricing." p={p} reduced={reduced} />

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_270px] gap-3">
        <div className="inst-surface rounded-md p-3 flex flex-col min-h-0">
          <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1.5">Arriving</div>
          <div className="flex-1 min-h-0 flex flex-col justify-evenly gap-1.5">
            {n.items.map((item, i) => {
              if (i >= arrived) return null;
              // A short settle as each one lands, measured in story seconds so a
              // paused film holds it rather than finishing the animation alone.
              const e = ease(clamp01((elapsed - item.at) / 6));
              if (e <= 0.01) return null;
              const dup = item.duplicates > 0;
              return (
                <div
                  key={item.headline}
                  style={{ opacity: e, transform: reduced ? undefined : `translate3d(${(1 - e) * -10}px,0,0)` }}
                  className={`rounded px-2 py-1.5 border ${item.contradiction ? 'border-warn/30 bg-warn/[0.05]' : dup ? 'border-borderSubtle/60 opacity-70' : 'border-borderSubtle'}`}
                >
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-mono text-micro tnum text-textMuted">+{item.at}s</span>
                    <span className="font-mono text-micro uppercase tracking-wider text-textMuted">{item.source}</span>
                    <span className="font-mono text-micro uppercase tracking-wider text-flip">{item.catalyst}</span>
                    {dup && (
                      <span className="font-mono text-micro uppercase tracking-wider text-textMuted">
                        clustered ×{item.duplicates}
                      </span>
                    )}
                    {item.contradiction && (
                      <span className="font-mono text-micro uppercase tracking-wider text-warn">contradicts</span>
                    )}
                    <span className="ml-auto font-mono text-micro tnum text-textSecondary">
                      novelty {prob(item.novelty)}
                    </span>
                  </div>
                  <div className={`mt-0.5 font-mono text-micro ${dup ? 'text-textMuted' : 'text-textPrimary'} truncate`}>
                    {item.headline}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Beat p={p} from={0.36} reduced={reduced}>
            <div className="inst-surface rounded-md p-2.5">
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1">
                Forecast distribution
              </div>
              <Repricing
                t={t}
                before={{ drift: n.driftBefore, width: n.widthBefore }}
                after={{ drift: n.driftAfter, width: n.widthAfter }}
                height={compact ? 74 : 96}
              />
              <div className="mt-1 grid grid-cols-2 gap-2 font-mono text-micro tnum">
                <div>
                  <div className="text-textMuted uppercase tracking-wider">Width</div>
                  <div className="text-textPrimary">
                    {(n.widthBefore * 100).toFixed(1)}% → {(n.widthAfter * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-textMuted uppercase tracking-wider">Drift</div>
                  <div className="text-textPrimary">
                    {(n.driftBefore * 100).toFixed(2)}% → {(n.driftAfter * 100).toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>
          </Beat>

          <Beat p={p} from={0.56} reduced={reduced}>
            <div className="inst-surface rounded-md p-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-micro uppercase tracking-widest text-textMuted">Confidence</span>
                <span className="font-mono text-caption tnum text-warn">{prob(n.confidence)}</span>
              </div>
              <p className="mt-1 font-mono text-micro text-textMuted leading-relaxed">
                Direction and confidence move separately. The contradicting check widened the distribution and lowered
                confidence; it did not flip the sign.
              </p>
            </div>
          </Beat>
        </div>
      </div>

      <div className="space-y-1">
        <SceneStatement p={p} from={0.68} reduced={reduced}>
          Six syndications of one filing are one piece of information. The distribution widened; nothing about it became
          more certain.
        </SceneStatement>
        <Caveat>
          Modelled feed · sources are described by type, never named · novelty is measured against what was already
          priced
        </Caveat>
      </div>
    </div>
  );
};

export default NewsScene;
