/*
  Scene 6 — Pinpoint, gamma.

  The chart becomes a dealer-exposure field: strike down the left, expiry across,
  and every cell extruded by the exposure it carries. Sheared rather than
  rotated — a fixed reading angle keeps the axes legible, which a spinning
  surface never does, and the spec's warning about a generic 3D mountain is
  exactly what a rotation would have produced here.

  The State Thread crosses the field at spot. Where it passes the flip, the read
  changes sign, and the panel says how much of that read depends on the dealer-sign
  assumption rather than presenting it as observed.
*/

import React from 'react';
import { useTrailer, at, clamp01, ease } from '../useTrailerState';
import { Beat, Caveat, FillBox, KeyValue, SceneHead, SceneStatement } from '../parts';
import { prob, px, usd } from '../format';
import { CHART_FONT } from '../../../components/charts/chartTheme';

const PinpointScene: React.FC = () => {
  const { story, thread, progress: p, reduced, compact } = useTrailer();
  const g = story.gamma;

  const build = ease(at(p, 0.06, 0.5));
  const sweep = ease(at(p, 0.34, 0.78));

  const W = 1000;
  const left = compact ? 48 : 62;
  const right = 18;
  const top = 18;
  const bottom = 20;
  // Highest strike at the top, in ONE ordering. The row labels indexed the
  // ascending array while the level lines were positioned by value with the max
  // at the top, so the axis ran upside down against its own flip and spot marks.
  const strikesDesc = [...g.strikes].sort((a, b) => b - a);
  const rows = strikesDesc.length;
  const cols = g.expiries.length;
  const cw = (W - left - right) / cols;

  // Shear: each expiry column steps up slightly, so the plane reads as a surface
  // seen from an angle instead of a flat table.
  const shear = compact ? 3 : 5;

  const strikeMin = strikesDesc[rows - 1];
  const strikeMax = strikesDesc[0];
  const belowFlip = thread.spot < g.flip;
  // The field's own totals, not a second opinion about it.
  const netGex = g.cells.reduce((a, c) => a + c.netGex, 0);
  const kingAbs = g.cells.filter(c => c.strike === g.king).reduce((a, c) => a + Math.abs(c.netGex), 0);
  const kingShare = kingAbs / Math.max(1, g.cells.reduce((a, c) => a + Math.abs(c.netGex), 0));

  /** Geometry for a given measured height — one place, so nothing drifts. */
  const geom = (H: number) => {
    const rh = (H - top - bottom) / rows;
    // Row centres, so a level line lands on the band it belongs to rather than
    // between two of them.
    const yOf = (strike: number) =>
      top + ((strikeMax - strike) / (strikeMax - strikeMin || 1)) * (H - top - bottom - rh) + rh / 2;
    return { rh, yOf };
  };

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <SceneHead
        product="Pinpoint · Gamma"
        line="Where hedging pressure may bend the path."
        p={p}
        reduced={reduced}
      />

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_250px] gap-3">
        <div className="inst-surface rounded-md p-3 flex flex-col min-h-0">
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="font-mono text-micro uppercase tracking-widest text-textMuted">
              Net GEX by strike × expiry
            </span>
            <span className="font-mono text-micro uppercase tracking-wider">
              <span className="text-shortGamma">short gamma</span>
              <span className="text-textMuted"> / </span>
              <span className="text-longGamma">long gamma</span>
            </span>
          </div>

          <FillBox className="flex-1" min={150}>
            {H => {
              const { rh, yOf } = geom(H);
              const spotY = yOf(Math.min(strikeMax, Math.max(strikeMin, thread.spot)));
              const flipY = yOf(Math.min(strikeMax, Math.max(strikeMin, g.flip)));
              return (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="w-full"
            style={{ height: H }}
            role="img"
            aria-label={`Dealer gamma exposure across ${rows} strikes and ${cols} expiries. Spot ${px(thread.spot)} sits ${belowFlip ? 'below' : 'above'} the gamma flip at ${px(g.flip)}.`}
          >
            {g.expiries.map((e, ci) => (
              <text
                key={e}
                x={left + ci * cw + cw / 2}
                y={12}
                textAnchor="middle"
                fill="#7d7d7d"
                fontSize={10}
                fontFamily={CHART_FONT}
              >
                {e}
              </text>
            ))}

            {g.cells.map(c => {
              const ri = strikesDesc.indexOf(c.strike);
              if (ri < 0) return null;
              const mag = clamp01(Math.abs(c.netGex) / g.maxAbs);
              // Cells resolve outward from spot: the field builds where the
              // market is, not left-to-right like a table redraw.
              const delay = clamp01(Math.abs(ri - rows / 2) / rows) * 0.55;
              const local = clamp01((build - delay) / (1 - delay));
              if (local <= 0) return null;
              const h = Math.max(1.5, rh * 0.82 * (0.28 + mag * 0.72) * local);
              const y = top + ri * rh + (rh - h) / 2 - c.expiryIdx * shear;
              return (
                <rect
                  key={`${c.strike}-${c.expiryIdx}`}
                  x={left + c.expiryIdx * cw + 1.5}
                  y={y}
                  width={cw - 3}
                  height={h}
                  rx={1}
                  fill={c.netGex >= 0 ? '#5EA0EF' : '#E0B84E'}
                  opacity={0.18 + mag * 0.62}
                />
              );
            })}

            {/* strike gutter */}
            {strikesDesc.map((s, ri) =>
              ri % (compact ? 3 : 2) === 0 ? (
                <text
                  key={s}
                  x={left - 6}
                  y={top + ri * rh + rh / 2 + 3}
                  textAnchor="end"
                  fill="#7d7d7d"
                  fontSize={10}
                  fontFamily={CHART_FONT}
                >
                  {s}
                </text>
              ) : null,
            )}

            {/* the flip manifold — a transition, not a line on a chart */}
            <line x1={left - 4} x2={W - right} y1={flipY} y2={flipY - shear * (cols - 1)} stroke="#7DD3FC" strokeWidth={1.2} strokeDasharray="7 5" opacity={0.85} />
            <text x={left + 4} y={flipY - shear * (cols - 1) - 5} fill="#7DD3FC" fontSize={10} fontFamily={CHART_FONT}>
              FLIP {px(g.flip)}
            </text>

            {/* the State Thread crossing the field at spot */}
            <line
              x1={left - 10}
              x2={left - 10 + (W - left - right + 10) * sweep}
              y1={spotY}
              y2={spotY}
              stroke="#E4E8F4"
              strokeWidth={1.4}
              opacity={0.92}
            />
            <circle cx={left - 10 + (W - left - right + 10) * sweep} cy={spotY} r={3.4} fill="#E4E8F4" />
            <text x={left + 4} y={spotY + 13} fill="#E4E8F4" fontSize={10} fontFamily={CHART_FONT}>
              SPOT {px(thread.spot)}
            </text>
          </svg>
              );
            }}
          </FillBox>

          <Beat p={p} from={0.5} reduced={reduced} className="pt-2 grid grid-cols-3 gap-2">
            <div>
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted">Call wall</div>
              <div className="font-mono text-caption tnum text-bear">{px(g.callWall)}</div>
            </div>
            <div>
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted">King strike</div>
              <div className="font-mono text-caption tnum text-king">{px(g.king)}</div>
            </div>
            <div>
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted">Put wall</div>
              <div className="font-mono text-caption tnum text-bull">{px(g.putWall)}</div>
            </div>
          </Beat>
        </div>

        <div className="flex flex-col gap-2">
          <Beat p={p} from={0.4} reduced={reduced}>
            <div className="inst-surface rounded-md p-2.5">
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1">Regime at spot</div>
              <KeyValue k="Dealer state" v={thread.dealerState} tone={belowFlip ? 'warn' : 'info'} />
              <KeyValue k="Hedging" v={belowFlip ? 'AMPLIFIES THE MOVE' : 'ABSORBS THE MOVE'} tone={belowFlip ? 'warn' : 'info'} />
              {/* Summed from the very cells above it. This was a second
                  hard-coded −$412M — the one the story layer had already dropped —
                  sitting in the panel headed "regime at spot" beside a field that
                  disagreed with it. A number quoted next to the thing it is
                  supposedly a total of has to be that total. */}
              <KeyValue k="Net GEX" v={usd(netGex)} tone={netGex < 0 ? 'warn' : 'info'} />
              <KeyValue k="Concentration" v={`${px(g.king)} · ${prob(kingShare)} of book`} />
            </div>
          </Beat>

          <Beat p={p} from={0.56} reduced={reduced}>
            <div className="inst-surface rounded-md p-2.5">
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1">
                Sensitivity to the sign assumption
              </div>
              <div className="h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full bg-warn/80" style={{ width: `${g.signDependence * 100}%` }} />
              </div>
              <p className="mt-1.5 font-mono text-micro text-textMuted leading-relaxed">
                {prob(g.signDependence)} of this read flips if dealers are net long these strikes instead of short.
                Positioning is inferred from the book, never observed.
              </p>
            </div>
          </Beat>
        </div>
      </div>

      <div className="space-y-1">
        <SceneStatement p={p} from={0.66} reduced={reduced}>
          Spot is {belowFlip ? 'under' : 'above'} the flip at {px(g.flip)} — the same hedge that damps a move on one side
          of it feeds the move on the other.
        </SceneStatement>
        <Caveat>Modelled exposure · dealer sign inferred from open interest and trade side, not observed</Caveat>
      </div>
    </div>
  );
};

export default PinpointScene;
