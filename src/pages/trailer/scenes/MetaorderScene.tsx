/*
  Scene 4 — Trace, metaorder reconstruction.

  Forensics, staged in three beats: separate prints, faint links between the ones
  that share geometry and aggressor side, then a cluster with a probability on it.
  The output is a distribution over explanations — "single parent order" is the
  most likely of four, not a verdict, and "institutional" is not a word the tape
  can earn.
*/

import React from 'react';
import { useTrailer, at, clamp01, ease } from '../useTrailerState';
import { Beat, Caveat, KeyValue, SceneHead, SceneStatement } from '../parts';
import { prob } from '../format';

const MetaorderScene: React.FC = () => {
  const { story, progress: p, reduced, compact } = useTrailer();
  const meta = story.metaorder;
  const children = story.prints.filter(pr => pr.child);
  const noise = story.prints.filter(pr => !pr.child);

  const linkT = ease(at(p, 0.2, 0.46));
  const clusterT = ease(at(p, 0.42, 0.68));
  const probT = ease(at(p, 0.56, 0.8));

  const W = 1000;
  const H = compact ? 130 : 168;
  const span = Math.max(...story.prints.map(pr => pr.at)) || 1;
  const x = (t: number) => 40 + (t / span) * (W - 80);
  // Children converge onto one row as the cluster forms; noise stays scattered.
  const childY = (i: number) => {
    const scattered = 34 + ((i * 37) % 96);
    return scattered + (H * 0.5 - scattered) * clusterT;
  };

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <SceneHead
        product="Trace · Reconstruction"
        line="The tape shows fragments. Trace reconstructs the probable parent."
        p={p}
        reduced={reduced}
      />

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-3">
        <div className="inst-surface rounded-md p-3 flex flex-col min-h-0">
          <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1">
            {meta.sharedStrike}C {meta.sharedExpiry} · {meta.windowSec}s window
          </div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="w-full"
            style={{ height: H }}
            role="img"
            /* Counted, not asserted. It said six while the reconstruction ran on
               nine, so a screen-reader user was given a different evidence count
               from the one the parent-order probability was computed from. */
            aria-label={`${meta.childIds.length} child prints at strike ${meta.sharedStrike} converging into one probable parent sequence over ${meta.windowSec} seconds`}
          >
            <line x1={30} x2={W - 30} y1={H - 12} y2={H - 12} stroke="#1c1c1c" strokeWidth={1} />
            {/* links between children — drawn before the marks so marks sit on top */}
            {children.slice(0, -1).map((c, i) => {
              const x1 = x(c.at);
              const y1 = childY(i);
              const x2 = x(children[i + 1].at);
              const y2 = childY(i + 1);
              return (
                <line
                  key={`l${c.id}`}
                  x1={x1}
                  y1={y1}
                  x2={x1 + (x2 - x1) * linkT}
                  y2={y1 + (y2 - y1) * linkT}
                  stroke="#E4E8F4"
                  strokeWidth={0.75}
                  opacity={0.42 * linkT}
                />
              );
            })}
            {/* cluster envelope */}
            {clusterT > 0.02 && (
              <rect
                x={x(children[0].at) - 14}
                y={H * 0.5 - 16}
                width={x(children[children.length - 1].at) - x(children[0].at) + 28}
                height={32}
                rx={4}
                fill="rgba(228,232,244,0.05)"
                stroke="#E4E8F4"
                strokeOpacity={0.32 * clusterT}
                strokeWidth={1}
              />
            )}
            {noise.map(n => (
              <circle key={n.id} cx={x(n.at)} cy={H - 26} r={2.5} fill="#7d7d7d" opacity={0.5} />
            ))}
            {children.map((c, i) => (
              <circle
                key={c.id}
                cx={x(c.at)}
                cy={childY(i)}
                r={3 + Math.min(5, c.size / 320)}
                fill="#E4E8F4"
                opacity={0.9}
              />
            ))}
            <text x={30} y={H - 2} fill="#7d7d7d" fontSize={10} fontFamily="ui-monospace, monospace">
              0s
            </text>
            <text x={W - 62} y={H - 2} fill="#7d7d7d" fontSize={10} fontFamily="ui-monospace, monospace">
              {Math.round(span)}s
            </text>
          </svg>

          <Beat p={p} from={0.5} reduced={reduced} className="mt-auto pt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ['Children', String(meta.childIds.length)],
              ['Aggressor side', prob(meta.aggressorConsistency)],
              ['Est. total', `${meta.estimatedTotal.toLocaleString()} lots`],
              ['Est. remaining', `~${meta.minutesRemaining} min`],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <div className="font-mono text-micro uppercase tracking-widest text-textMuted truncate">{k}</div>
                <div className="font-mono text-caption tnum text-textPrimary truncate">{v}</div>
              </div>
            ))}
          </Beat>
        </div>

        <div className="flex flex-col gap-2">
          <Beat p={p} from={0.54} reduced={reduced}>
            <div className="inst-surface rounded-md p-2.5">
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1.5">
                Explanations, weighted
              </div>
              <div className="space-y-1.5">
                {/*
                  The four explanations are mutually exhaustive, so the numbers
                  are a distribution and have to read as one at every frame.
                  Scaling each by the reveal made them sum to the reveal — four
                  probabilities totalling 50% halfway through, and the film can be
                  paused there and left. Only the bar grows now; the number is the
                  number.
                */}
                {meta.hypotheses.map((h, i) => (
                  <div key={h.label} style={{ opacity: probT }}>
                    <div className="flex items-baseline justify-between gap-2 font-mono text-micro">
                      <span className={i === 0 ? 'text-textPrimary' : 'text-textSecondary'}>{h.label}</span>
                      <span className="tnum text-textPrimary">{prob(h.probability)}</span>
                    </div>
                    <div className="h-[3px] rounded-full bg-white/[0.06] overflow-hidden mt-0.5">
                      <div
                        className={i === 0 ? 'h-full bg-select' : 'h-full bg-white/25'}
                        style={{ width: `${clamp01(h.probability * probT) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Beat>

          <Beat p={p} from={0.68} reduced={reduced}>
            <div className="inst-surface rounded-md p-2.5">
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1">Invalidation</div>
              <p className="font-mono text-micro text-textSecondary leading-relaxed">{meta.invalidation}</p>
              <div className="mt-1.5">
                <KeyValue k="Completed" v={prob(meta.completedPct)} />
              </div>
            </div>
          </Beat>
        </div>
      </div>

      <div className="space-y-1">
        <SceneStatement p={p} from={0.72} reduced={reduced}>
          Nine fills, one strike, one side — most likely one parent order, and three other explanations that still fit.
        </SceneStatement>
        <Caveat>
          Modelled reconstruction · grouping is inferred from timing, geometry and aggressor side · no order identity is
          observable
        </Caveat>
      </div>
    </div>
  );
};

export default MetaorderScene;
