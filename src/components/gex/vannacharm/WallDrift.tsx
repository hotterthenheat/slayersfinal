import { useState, type MouseEvent } from 'react';
import { motion } from 'framer-motion';
import { CALL_WALL, PUT_WALL, FLIP, SPOT } from '../palette';
import ChartLegend from '../../ui/ChartLegend';
import HoverReadout from '../../ui/HoverReadout';
import { svgHoverIndex } from '../../ui/svgHover';
import { DUR, EASE } from '../../../lib/motion';
import type { IvShift, LevelShift, ShiftMode, WallDriftPoint } from '../../../types/gex';

interface WallDriftProps {
  drift: WallDriftPoint[];
  /**
   * The projection column, opt-in. A surface that does not expose the scenario
   * controls must not draw a projection: the Pulse tile is hard-wired to one
   * charm scenario its viewer never picked, and a forward line nobody asked for
   * is indistinguishable from a forecast.
   */
  scenario?: { shifts: LevelShift[]; mode: ShiftMode; ivShift: IvShift };
}

/** viewBox units for both plots — geometry only, every label is HTML. */
const V = 100;

/** Vertical breathing room inside the plot so a level sitting at the domain
    edge still draws a full stroke instead of a half-clipped one. */
const PAD = 3;

/** Where the scenario column anchors "now". Held off the divider so the slope
    reads as its own projection rather than as the measured series continuing. */
const NOW_X = 8;

type Kind = 'call-wall' | 'put-wall' | 'flip';

const LEVEL_INK: Record<Kind, string> = {
  'call-wall': CALL_WALL,
  'put-wall': PUT_WALL,
  flip: FLIP,
};

interface WallStep {
  i: number;
  kind: 'call-wall' | 'put-wall';
  from: number;
  to: number;
}

const timeLabel = (t: number) =>
  new Date(t * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const price = (v: number) => `$${v.toFixed(2)}`;

/**
 * Value holds until the next sample, so the walls draw as a staircase. They are
 * strike-quantized: a linear join between two samples paints the wall at prices
 * that are not strikes and cannot hold a wall, and across a session that is most
 * of the ink on the chart.
 */
function stepPath(points: WallDriftPoint[], pick: (p: WallDriftPoint) => number, X: (i: number) => number, Y: (v: number) => number) {
  let d = `M${X(0).toFixed(2)},${Y(pick(points[0])).toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L${X(i).toFixed(2)},${Y(pick(points[i - 1])).toFixed(2)} L${X(i).toFixed(2)},${Y(pick(points[i])).toFixed(2)}`;
  }
  return d;
}

/** The bracket itself: call-wall staircase out, put-wall staircase back. */
function bandPath(points: WallDriftPoint[], X: (i: number) => number, Y: (v: number) => number) {
  const last = points.length - 1;
  let d = stepPath(points, p => p.callWall, X, Y);
  d += ` L${X(last).toFixed(2)},${Y(points[last].putWall).toFixed(2)}`;
  for (let i = last - 1; i >= 0; i--) {
    d += ` L${X(i + 1).toFixed(2)},${Y(points[i].putWall).toFixed(2)} L${X(i).toFixed(2)},${Y(points[i].putWall).toFixed(2)}`;
  }
  return `${d} Z`;
}

/** Keep stacked right-rail tags legible when two levels land within a hair of
    each other; positions are nudged, the values they carry are not. */
function deOverlap(rows: { y: number }[], gap: number): number[] {
  const order = rows.map((r, i) => ({ i, y: r.y })).sort((a, b) => a.y - b.y);
  const out = new Array<number>(rows.length);
  let prev = -Infinity;
  for (const r of order) {
    const y = Math.min(100 - PAD, Math.max(PAD, Math.max(r.y, prev + gap)));
    out[r.i] = y;
    prev = y;
  }
  return out;
}

/**
 * Wall Drift.
 *
 * The desk's other panels answer "how much exposure moves"; this one answers
 * "where the structure moves to", so price is the primary object and both halves
 * of the panel share one price axis.
 *
 * Left: the session as measured — the call-wall/put-wall pair drawn as one filled
 * BRACKET rather than two competing lines, because the width of the bracket and
 * the moments it snaps are the read, and spot's line means nothing except in
 * relation to it. Four auto-scaled lines could not say that: the walls pinned the
 * domain to its extremes and spot was left using a fifth of the height.
 *
 * Right: the same three levels under the selected scenario, as a slope from now
 * to where charm decay or the vol shift lands them. Separated by a gutter, never
 * welded onto the measured series — one is recorded, the other is projected, and
 * the whole point of putting them on one axis is to see whether the projected
 * move is bigger than the drift the session has already produced.
 */
const WallDrift = ({ drift, scenario }: WallDriftProps) => {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const [scenarioHover, setScenarioHover] = useState<{ x: number; y: number } | null>(null);

  const level = (kind: Kind): LevelShift | undefined => scenario?.shifts.find(s => s.kind === kind);
  const call = level('call-wall');
  const put = level('put-wall');
  const flip = level('flip');
  const proj = call && put && flip ? { call, put, flip } : null;

  if (drift.length < 2) {
    return (
      <div className="h-full min-h-[8rem] flex items-center justify-center font-mono text-label text-textMuted uppercase tracking-widest">
        No session history recorded yet
      </div>
    );
  }

  const scenarioLabel = !scenario
    ? ''
    : scenario.mode === 'CHARM'
      ? 'into close'
      : `iv ${scenario.ivShift > 0 ? '+' : '−'}${Math.abs(scenario.ivShift)}`;

  // Domain spans the measured session AND the projection, so the scenario can
  // never land off-plot and quietly clip.
  let min = Infinity;
  let max = -Infinity;
  const see = (v: number) => {
    if (v < min) min = v;
    if (v > max) max = v;
  };
  for (const p of drift) {
    see(p.spot);
    see(p.callWall);
    see(p.putWall);
    see(p.flip);
  }
  if (proj) {
    for (const s of [proj.call, proj.put, proj.flip]) {
      see(s.current);
      see(s.projected);
    }
  }
  const pad = (max - min) * 0.06 || 1;
  min -= pad;
  max += pad;
  const span = max - min;

  const X = (i: number) => (i / (drift.length - 1)) * V;
  const Y = (v: number) => PAD + (1 - (v - min) / span) * (V - PAD * 2);

  // Enough precision to separate two adjacent strikes; the old two corner
  // labels rounded to the dollar, which on a $4 range named neither gridline.
  const dec = span < 2 ? 2 : span < 20 ? 1 : 0;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => min + f * span);

  // A wall that never moves is the session's answer, not missing data — so the
  // moments it does move are marked and counted rather than left to the eye.
  const steps: WallStep[] = [];
  for (let i = 1; i < drift.length; i++) {
    if (drift[i].callWall !== drift[i - 1].callWall)
      steps.push({ i, kind: 'call-wall', from: drift[i - 1].callWall, to: drift[i].callWall });
    if (drift[i].putWall !== drift[i - 1].putWall)
      steps.push({ i, kind: 'put-wall', from: drift[i - 1].putWall, to: drift[i].putWall });
  }
  const stepAt = (i: number) => steps.filter(s => s.i === i);

  const bracketNow = proj ? proj.call.current - proj.put.current : 0;
  const bracketProj = proj ? proj.call.projected - proj.put.projected : 0;
  const bracketDelta = bracketProj - bracketNow;

  const projRows: { kind: Kind; s: LevelShift }[] = proj
    ? [
        { kind: 'call-wall', s: proj.call },
        { kind: 'put-wall', s: proj.put },
        { kind: 'flip', s: proj.flip },
      ]
    : [];
  const tagY = deOverlap(projRows.map(r => ({ y: Y(r.s.projected) })), 9);

  const timeTicks = [0, 0.25, 0.5, 0.75, 1].map(f => drift[Math.round(f * (drift.length - 1))]);

  // Index-guarded: a scan can hand back a shorter series while a crosshair is parked.
  const hovered = hover && hover.i < drift.length ? drift[hover.i] : null;
  const hoverBracket = hovered ? hovered.callWall - hovered.putWall : 0;
  const inBracket = hovered && hoverBracket > 0 ? ((hovered.spot - hovered.putWall) / hoverBracket) * 100 : 0;

  const onMeasuredMove = (e: MouseEvent<SVGSVGElement>) =>
    setHover({ i: svgHoverIndex(e, drift.length), x: e.clientX, y: e.clientY });

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* Header: what the shapes mean, then the number the panel exists to give */}
      <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap">
        <ChartLegend
          variant="line"
          items={[
            { label: 'Call wall', color: CALL_WALL },
            { label: 'Put wall', color: PUT_WALL },
            { label: 'Flip', color: FLIP, kind: 'dashed' },
            { label: 'Spot', color: SPOT },
          ]}
        />
        <span className="ml-auto flex items-center gap-x-3 gap-y-1 flex-wrap font-mono text-micro uppercase tracking-wider text-textMuted tnum">
          {proj && (
            <span>
              bracket{' '}
              <span className="text-textSecondary">{bracketNow.toFixed(2)}</span>
              <span className="px-1">→</span>
              <span
                className={
                  bracketDelta > 0 ? 'text-bull' : bracketDelta < 0 ? 'text-bear' : 'text-textSecondary'
                }
              >
                {bracketProj.toFixed(2)}
              </span>
            </span>
          )}
          <span>
            {steps.length === 0 ? 'walls held all session' : `${steps.length} wall step${steps.length > 1 ? 's' : ''}`}
          </span>
        </span>
      </div>

      {/* One price axis, two columns: measured session, then the scenario. The
          shared grid template keeps the tick row locked to the plots. */}
      {/* grid-rows-1 (a single 1fr track) is load-bearing: an auto row lets the
          w-full SVGs fall back to their 1:1 viewBox aspect and grow to a
          thousand pixels tall, and the plot then overflows the panel. */}
      <div
        className={`grid grid-rows-1 flex-grow min-h-0 ${
          proj
            ? 'grid-cols-[2.5rem_58fr_42fr_3rem] sm:grid-cols-[2.75rem_74fr_26fr_3.5rem]'
            : 'grid-cols-[2.5rem_1fr] sm:grid-cols-[2.75rem_1fr]'
        }`}
      >
        <div className="relative">
          {ticks.map(t => (
            <span
              key={t}
              className="absolute right-1.5 -translate-y-1/2 font-mono text-micro tnum text-textMuted select-none"
              style={{ top: `${Y(t)}%` }}
            >
              {t.toFixed(dec)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0">
          <svg
            viewBox={`0 0 ${V} ${V}`}
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full cursor-crosshair"
            role="img"
            aria-label="Session bracket: the call wall and put wall dealers defended, with the gamma flip and spot inside it"
            onMouseMove={onMeasuredMove}
            onMouseLeave={() => setHover(null)}
          >
            {ticks.map(t => (
              <line key={t} x1={0} x2={V} y1={Y(t)} y2={Y(t)} stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
            ))}

            <path d={bandPath(drift, X, Y)} fill="rgba(255,255,255,0.065)" stroke="none" />

            {steps.map(s => (
              <line
                key={`${s.i}-${s.kind}`}
                x1={X(s.i)}
                x2={X(s.i)}
                y1={0}
                y2={V}
                stroke={LEVEL_INK[s.kind]}
                strokeOpacity={0.22}
                strokeWidth={1}
                strokeDasharray="2 4"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <path d={stepPath(drift, p => p.callWall, X, Y)} fill="none" stroke={CALL_WALL} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
            <path d={stepPath(drift, p => p.putWall, X, Y)} fill="none" stroke={PUT_WALL} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
            <path d={stepPath(drift, p => p.flip, X, Y)} fill="none" stroke={FLIP} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <path
              d={drift.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(2)},${Y(p.spot).toFixed(2)}`).join(' ')}
              fill="none"
              stroke={SPOT}
              strokeWidth={1.4}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />

            {hover && hovered && (
              <line x1={X(hover.i)} x2={X(hover.i)} y1={0} y2={V} stroke="#fff" strokeOpacity={0.28} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          {/* Point markers are HTML: under preserveAspectRatio="none" an SVG
              circle stretches with the viewBox and paints a flat ellipse. */}
          {hover && hovered && (
            <span
              className="pointer-events-none absolute w-[7px] h-[7px] rounded-full border border-canvas -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${X(hover.i)}%`, top: `${Y(hovered.spot)}%`, background: SPOT }}
            />
          )}
        </div>

        {proj && scenario && (
          <>
            <div
              className="relative min-w-0 border-l border-borderMuted bg-white/[0.015]"
              onMouseMove={e => setScenarioHover({ x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setScenarioHover(null)}
            >
              <span className="absolute right-1.5 top-1 font-mono text-micro uppercase tracking-widest text-textMuted select-none pointer-events-none whitespace-nowrap">
                {scenarioLabel}
              </span>
              {/* Keyed on the scenario so switching CHARM/VANNA or the vol dial
                  re-reads rather than silently repainting under the cursor. */}
              <motion.svg
                key={`${scenario.mode}-${scenario.ivShift}`}
                viewBox={`0 0 ${V} ${V}`}
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full cursor-crosshair"
                role="img"
                aria-label={`Projected call wall, put wall and gamma flip ${scenario.mode === 'CHARM' ? 'at the close' : 'under the vol shift'}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: DUR.base, ease: EASE }}
              >
                {ticks.map(t => (
                  <line key={t} x1={0} x2={V} y1={Y(t)} y2={Y(t)} stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                ))}

                <path
                  d={`M${NOW_X},${Y(proj.call.current)} L${V},${Y(proj.call.projected)} L${V},${Y(proj.put.projected)} L${NOW_X},${Y(proj.put.current)} Z`}
                  fill="rgba(255,255,255,0.035)"
                  stroke="none"
                />

                {projRows.map(({ kind, s }) => (
                  <line
                    key={kind}
                    x1={NOW_X}
                    x2={V}
                    y1={Y(s.current)}
                    y2={Y(s.projected)}
                    stroke={LEVEL_INK[kind]}
                    strokeOpacity={s.projected === s.current ? 0.4 : 0.95}
                    strokeWidth={kind === 'flip' ? 1 : 1.25}
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </motion.svg>
              {projRows.map(({ kind, s }) => (
                <span
                  key={`now-${kind}`}
                  className="pointer-events-none absolute w-[7px] h-[7px] rounded-full -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${NOW_X}%`, top: `${Y(s.current)}%`, background: LEVEL_INK[kind] }}
                />
              ))}
            </div>

            <div className="relative">
              {projRows.map(({ kind, s }, i) => (
                <span
                  key={kind}
                  className="absolute left-0.5 -translate-y-1/2 font-mono text-micro tnum select-none whitespace-nowrap"
                  style={{ top: `${tagY[i]}%`, color: LEVEL_INK[kind], opacity: s.projected === s.current ? 0.5 : 1 }}
                >
                  {s.projected.toFixed(2)}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Tick row shares the plot's grid template, so every label sits under its column */}
      <div
        className={`grid font-mono text-micro tnum text-textMuted select-none ${
          proj
            ? 'grid-cols-[2.5rem_58fr_42fr_3rem] sm:grid-cols-[2.75rem_74fr_26fr_3.5rem]'
            : 'grid-cols-[2.5rem_1fr] sm:grid-cols-[2.75rem_1fr]'
        }`}
      >
        <span />
        {/* Five ticks need ~170px of label; on a phone column that is wider than
            the plot, so the quarter marks drop and first/middle/last survive. */}
        <span className="flex justify-between min-w-0 pr-1.5">
          {timeTicks.map((p, i) => (
            <span key={`${p.time}-${i}`} className={i % 2 === 1 ? 'hidden sm:inline' : undefined}>
              {timeLabel(p.time)}
            </span>
          ))}
        </span>
        {proj && scenario && (
          <>
            <span className="flex justify-between min-w-0 pl-1.5">
              <span>now</span>
              <span className="uppercase tracking-wider">{scenario.mode === 'CHARM' ? 'close' : 'shift'}</span>
            </span>
            <span />
          </>
        )}
      </div>

      {hover && hovered && (
        <HoverReadout x={hover.x} y={hover.y}>
          <div className="w-48">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-caption font-bold text-textPrimary tnum">{timeLabel(hovered.time)}</span>
              <span className="font-mono text-micro text-textMuted tnum">spot {price(hovered.spot)}</span>
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
              {(
                [
                  { label: 'Call wall', ink: CALL_WALL, v: hovered.callWall },
                  { label: 'Flip', ink: FLIP, v: hovered.flip },
                  { label: 'Put wall', ink: PUT_WALL, v: hovered.putWall },
                ] as const
              ).map(r => (
                <div key={r.label} className="flex items-center justify-between gap-4 font-mono text-micro">
                  <span className="flex items-center gap-1.5 text-textSecondary">
                    <span className="inline-block w-2 h-0.5 rounded-full" style={{ background: r.ink }} />
                    {r.label}
                  </span>
                  <span className="tnum text-textPrimary">{price(r.v)}</span>
                </div>
              ))}
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-borderSubtle/60 flex items-center justify-between gap-3 font-mono text-micro">
              <span className="text-textSecondary">Bracket</span>
              <span className="tnum text-textPrimary">
                {hoverBracket.toFixed(2)}{' '}
                <span className="text-textMuted">({((hoverBracket / hovered.spot) * 100).toFixed(2)}%)</span>
              </span>
            </div>
            <div className="mt-0.5 font-mono text-micro text-textMuted">
              {hovered.spot > hovered.callWall
                ? 'Spot above the call wall'
                : hovered.spot < hovered.putWall
                  ? 'Spot below the put wall'
                  : `Spot ${inBracket.toFixed(0)}% up the bracket`}
            </div>
            {stepAt(hover.i).map(s => (
              <div key={s.kind} className="mt-1 font-mono text-micro tnum" style={{ color: LEVEL_INK[s.kind] }}>
                {s.kind === 'call-wall' ? 'Call wall' : 'Put wall'} stepped {s.from.toFixed(2)} → {s.to.toFixed(2)}
              </div>
            ))}
          </div>
        </HoverReadout>
      )}

      {scenarioHover && proj && (
        <HoverReadout x={scenarioHover.x} y={scenarioHover.y}>
          <div className="w-52">
            <div className="font-mono text-micro uppercase tracking-widest text-textMuted">
              projected · {scenarioLabel}
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
              {projRows.map(({ kind, s }) => {
                const d = s.projected - s.current;
                return (
                  <div key={kind} className="flex items-center justify-between gap-3 font-mono text-micro">
                    <span className="flex items-center gap-1.5 text-textSecondary">
                      <span className="inline-block w-2 h-0.5 rounded-full" style={{ background: LEVEL_INK[kind] }} />
                      {s.label}
                    </span>
                    <span className="tnum text-textPrimary">
                      {s.current.toFixed(2)} <span className="text-textMuted">→</span> {s.projected.toFixed(2)}
                      <span className={`ml-1.5 ${d > 0 ? 'text-bull' : d < 0 ? 'text-bear' : 'text-textMuted'}`}>
                        {d === 0 ? 'holds' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}`}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-borderSubtle/60 flex items-center justify-between gap-3 font-mono text-micro">
              <span className="text-textSecondary">Bracket</span>
              <span className="tnum text-textPrimary">
                {bracketNow.toFixed(2)} <span className="text-textMuted">→</span> {bracketProj.toFixed(2)}
                <span className={`ml-1.5 ${bracketDelta > 0 ? 'text-bull' : bracketDelta < 0 ? 'text-bear' : 'text-textMuted'}`}>
                  {bracketDelta === 0 ? 'holds' : `${bracketDelta > 0 ? '+' : '−'}${Math.abs(bracketDelta).toFixed(2)}`}
                </span>
              </span>
            </div>
            <p className="mt-1.5 font-mono text-micro text-textMuted leading-relaxed">
              {bracketDelta < 0
                ? 'The defended range narrows: dealers hedge a tighter box.'
                : bracketDelta > 0
                  ? 'The defended range widens: less structure holding price in.'
                  : 'The defended range is unchanged under this scenario.'}
            </p>
          </div>
        </HoverReadout>
      )}
    </div>
  );
};

export default WallDrift;
