import { useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type TouchEvent } from 'react';
import { motion } from 'framer-motion';
import Simulator from '../../core/simulator';
import { DUR, EASE } from '../../lib/motion';
import { MUTED_INK, SPOT } from '../gex/palette';
import EmptyState from '../ui/EmptyState';
import HoverReadout from '../ui/HoverReadout';
import SpotRule from '../ui/SpotRule';
import { svgHoverIndex } from '../ui/svgHover';
import {
  RUNG_INK,
  WARN_INK,
  barsToOffset,
  barsToSpan,
  buildCursorPoints,
  buildTrack,
  contractLabel,
  pctFrom,
  signedPct,
  svgHoverStep,
  trackSummary,
  type ContractPlan,
  type TrackData,
} from './contractTrackModel';
import type { Candle } from '../../types/market';

/*
  CONTRACT TRACK — the contract's own premium, on two lanes sharing one x-axis.

  Lane A is the hero: the modeled mid in dollars on the left ruler and the
  identical series as % from reference on the right. Left of NOW, time is the
  variable and spot moves — that is what happened. Right of NOW, spot is HELD at
  today's close and only time runs — that is what standing still costs, and it is
  the reason a 0DTE reads the way it does.

  Lane B answers the question lane A can't: how close is the reason to being
  wrong, and what does the underlying actually have to do. Every premium target
  on lane A is inverted through the same pricer into a spot level here, which is
  what makes a rung the chart cannot fit still legible.

  Hand-rolled SVG, no recharts: recharts lives in exactly one file repo-wide and
  importing it here would pull it into the main Compass chunk for one path, one
  dashed curve and a handful of rules. Both lanes use preserveAspectRatio="none",
  so there is no <text> inside either SVG — non-uniform scaling distorts glyphs.
  Every label is HTML positioned in percent over the plot, which also puts it in
  the accessibility tree for free.
*/

const VB_W = 1000;
const A_H = 176;
const A_TOP = 8;
const A_BOT = 6;
const B_H = 64;
const B_PAD = 9;

/** Docked-rung carets park here so they never collide with the right gutter. */
const DOCK_X = 78;
/** Rung projections step across the forward half so four of them stay readable
    inside 64px of lane B. Percent of plot width. */
const rungX = (i: number) => 46 + i * 9;

const GRID_INK = 'rgba(255,255,255,0.30)';

/** A ruler tick. HTML, not <text> — both SVGs scale non-uniformly. */
const Tick = ({ top, text, strong = false }: { top: number; text: string; strong?: boolean }) => (
  <span
    className={`absolute right-1 -translate-y-1/2 whitespace-nowrap font-mono text-micro tnum ${
      strong ? 'font-semibold text-textPrimary' : 'text-textMuted'
    }`}
    style={{ top: `${top}%` }}
  >
    {text}
  </span>
);

export interface ContractTrackProps {
  plan: ContractPlan;
  /** Defaults to Simulator.getCandles(plan.ticker). Injectable for tests. */
  bars?: Candle[];
  /** Pre-built series. Pass it when the host also renders the ladder, so the
      rungs on the chart and the cards beside it are literally the same array. */
  track?: TrackData;
  className?: string;
}

interface Cursor {
  i: number;
  x: number;
  y: number;
  /** Pointer cursors get the floating card; keyboard ones read the live strip. */
  pointer: boolean;
}

const ContractTrack = ({ plan, bars, track, className = '' }: ContractTrackProps) => {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  // useId returns ':r0:', which url(#...) can't parse.
  const revealId = `ct-reveal-${useId().replace(/:/g, '')}`;

  const resolvedBars = bars ?? Simulator.getCandles(plan.ticker) ?? [];
  const n = resolvedBars.length;
  // getCandles hands back the live buffer, mutated in place — its identity is
  // stable while its contents are not, so memoising on the array itself freezes
  // the chart. Length plus a quantised spot is what actually changes.
  const spotQ = n > 0 ? Math.round(resolvedBars[n - 1].close * 100) : 0;

  const t = useMemo(
    () => track ?? buildTrack(plan, resolvedBars),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [track, plan.key, plan.sessionsLeft, plan.entry, n, spotQ]
  );

  const cursorPts = useMemo(() => buildCursorPoints(t), [t]);

  const name = contractLabel(plan);

  if (n === 0 || !Number.isFinite(t.spotNow)) {
    return (
      <div className={`inst-surface rounded-md ${className}`}>
        <EmptyState size="sm" title="No bars for this ticker" />
      </div>
    );
  }

  // ---- scales ---------------------------------------------------------------
  const span = t.xMax - t.xMin || 1;
  const X = (bar: number) => ((bar - t.xMin) / span) * VB_W;
  const YA = (v: number) => {
    const f = Math.max(0, Math.min(1, v / (t.yMax || 1)));
    return A_H - A_BOT - f * (A_H - A_TOP - A_BOT);
  };
  const sSpan = t.spotHi - t.spotLo || 1;
  const YB = (s: number) => {
    const f = Math.max(0, Math.min(1, (s - t.spotLo) / sSpan));
    return B_H - B_PAD - f * (B_H - B_PAD * 2);
  };
  const pctX = (bar: number) => (X(bar) / VB_W) * 100;
  const pctYA = (v: number) => (YA(v) / A_H) * 100;
  const pctYB = (s: number) => (YB(s) / B_H) * 100;

  const path = (pts: { bar: number; premium: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.bar).toFixed(2)},${YA(p.premium).toFixed(2)}`).join(' ');

  const forwardFill = t.forward.length
    ? `${path(t.forward)} L${X(t.forward[t.forward.length - 1].bar).toFixed(2)},${YA(0).toFixed(2)} L${X(t.forward[0].bar).toFixed(2)},${YA(0).toFixed(2)} Z`
    : '';

  const spotPath = t.past
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.bar).toFixed(2)},${YB(p.spot).toFixed(2)}`)
    .join(' ');

  // Complement of the docked set, not a second `<= yMax` test: yMax carries the
  // carets' headroom, so a threshold here would disagree with what docked.
  const docked = new Set(t.dockedRungs);
  const inFrame = t.rungs.filter(r => !docked.has(r));
  const forwardOnly = t.past.length < 2;
  const cur = cursor ? cursorPts[cursor.i] : null;

  // ---- stat strip -----------------------------------------------------------
  const reach = pctFrom(t.entry, t.pathMax);
  const nextRung = t.rungs.find(r => r.status !== 'HIT') ?? null;
  const breakevenMark = plan.spotMarks.find(m => m.label === 'BREAKEVEN') ?? null;
  const needLabel =
    nextRung && nextRung.spotNeeded != null
      ? { k: `${nextRung.label} needs`, v: nextRung.spotNeeded.toFixed(2) }
      : breakevenMark
        ? { k: 'Breakeven', v: breakevenMark.spot.toFixed(2) }
        : null;

  // ---- cursor ---------------------------------------------------------------
  const moveTo = (i: number, x: number, y: number, pointer: boolean) => setCursor({ i, x, y, pointer });

  const onMouseMove = (e: MouseEvent<HTMLDivElement>) =>
    moveTo(svgHoverIndex(e, cursorPts.length), e.clientX, e.clientY, true);

  const onTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (touch.clientX - rect.left) / (rect.width || 1);
    const i = Math.max(0, Math.min(cursorPts.length - 1, Math.round(frac * (cursorPts.length - 1))));
    moveTo(i, touch.clientX, touch.clientY, true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setCursor(null);
      return;
    }
    const next = svgHoverStep(e.key, cursor?.i ?? cursorPts.length - 1, cursorPts.length, e.shiftKey ? 10 : 1);
    if (next == null) return;
    e.preventDefault();
    const rect = plotRef.current?.getBoundingClientRect();
    const frac = next / (cursorPts.length - 1);
    moveTo(next, (rect?.left ?? 0) + frac * (rect?.width ?? 0), rect?.top ?? 0, false);
  };

  const readout = cur
    ? {
        when: barsToOffset(cur.bar),
        spot: cur.held ? `spot held at ${t.spotNow.toFixed(2)}` : `${plan.ticker} ${cur.spot.toFixed(2)}`,
        px: `$${cur.premium.toFixed(2)}`,
        delta: `${signedPct(pctFrom(t.entry, cur.premium), 1)} from ${plan.entryLabel.toLowerCase()}`,
      }
    : null;

  return (
    <div
      className={`inst-surface rounded-md p-2 flex flex-col gap-1.5 ${className}`}
      role="group"
      aria-label={`Contract track for ${name}`}
    >
      {/* Title + identity. MODELED, never "live" — this series is derived. */}
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="font-mono text-micro font-semibold uppercase tracking-widest text-textSecondary">
          Contract Track
        </span>
        <span className="font-mono text-micro uppercase tracking-wider text-textMuted tnum">
          {name} · {plan.expiryLabel} · Modeled
        </span>
      </div>

      {/* Stat strip */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-micro text-textMuted tnum">
        <span>
          {plan.entryLabel} <span className="font-semibold text-textPrimary">${t.entry.toFixed(2)}</span>
        </span>
        <span>
          Now <span className="font-semibold text-textPrimary">${t.past[t.past.length - 1].premium.toFixed(2)}</span>
        </span>
        <span>
          Reach <span className="font-semibold text-textPrimary">{signedPct(reach)}</span>
        </span>
        <span>
          Left <span className="font-semibold text-textPrimary">{barsToSpan(t.forwardMinutes)}</span>
        </span>
        {needLabel && (
          <span>
            {needLabel.k} <span className="font-semibold text-textPrimary">{needLabel.v}</span>
          </span>
        )}
      </div>

      {/* ---- plot: [$ gutter] [lanes] [% gutter] ---- */}
      <div className="flex items-stretch">
        {/* left ruler — dollars. Always present, at every width. */}
        <div className="w-10 sm:w-11 shrink-0 flex flex-col">
          <div className="relative h-[148px] sm:h-[176px]">
            <Tick top={pctYA(0)} text="0.00" />
            <Tick top={pctYA(t.entry)} text={t.entry.toFixed(2)} strong />
            {inFrame.map(r => (
              <Tick key={r.label} top={pctYA(r.premium)} text={r.premium.toFixed(2)} />
            ))}
          </div>
          <div className="h-1" />
          <div className="relative h-[52px] sm:h-[64px]">
            <Tick top={pctYB(t.spotHi)} text={t.spotHi.toFixed(2)} />
            <Tick top={pctYB(t.spotLo)} text={t.spotLo.toFixed(2)} />
          </div>
        </div>

        {/* the lanes */}
        <div
          ref={plotRef}
          tabIndex={0}
          onMouseMove={onMouseMove}
          onMouseLeave={() => setCursor(null)}
          onTouchMove={onTouchMove}
          onKeyDown={onKeyDown}
          className="relative flex-1 min-w-0 cursor-crosshair focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"
        >
          {/* ---------------- LANE A ---------------- */}
          <div className="relative h-[148px] sm:h-[176px]">
            <svg
              viewBox={`0 0 ${VB_W} ${A_H}`}
              width="100%"
              height="100%"
              preserveAspectRatio="none"
              role="img"
              aria-label={trackSummary(plan, t)}
            >
              {/* baseline */}
              <line
                x1={0}
                x2={VB_W}
                y1={YA(0)}
                y2={YA(0)}
                stroke="rgba(255,255,255,0.10)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />

              {/* rungs — in-frame only; higher ones dock to the top edge */}
              {inFrame.map(r => (
                <line
                  key={r.label}
                  x1={0}
                  x2={VB_W}
                  y1={YA(r.premium)}
                  y2={YA(r.premium)}
                  stroke={RUNG_INK[r.status]}
                  strokeOpacity={r.status === 'PENDING' ? 0.65 : 0.85}
                  strokeWidth={1}
                  strokeDasharray="5 4"
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {/* forward: spot held, only time elapses */}
              {t.forward.length > 1 && (
                <>
                  <path d={forwardFill} fill="rgba(255,255,255,0.045)" stroke="none" />
                  <path
                    d={path(t.forward)}
                    fill="none"
                    stroke={MUTED_INK}
                    strokeWidth={1.4}
                    strokeDasharray="4 3"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}

              {/* the same contract, repriced with spot pinned at invalidation */}
              {t.invalidationCurve && (
                <path
                  d={path(t.invalidationCurve)}
                  fill="none"
                  stroke={WARN_INK}
                  strokeOpacity={0.55}
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {/* reference — the heaviest horizontal on the chart */}
              <line
                x1={0}
                x2={VB_W}
                y1={YA(t.entry)}
                y2={YA(t.entry)}
                stroke={SPOT}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />

              {/* past — real bars, repriced. Sweeps in once per contract.
                  The reveal is a clip, not `pathLength`: framer implements
                  pathLength as a dash offset measured against the path's USER
                  space length, but `non-scaling-stroke` under this viewBox's
                  non-uniform scale makes the browser lay dashes out in device
                  space. The line then stopped ~20% short of NOW and just looked
                  like missing data. A clip sweep is immune to both. */}
              {!forwardOnly && (
                <>
                  <defs>
                    <clipPath id={revealId}>
                      <motion.rect
                        key={plan.key}
                        x={0}
                        y={0}
                        height={A_H}
                        initial={{ width: 0 }}
                        animate={{ width: Math.max(X(0), 1) }}
                        transition={{ duration: DUR.data, ease: EASE }}
                      />
                    </clipPath>
                  </defs>
                  <path
                    d={path(t.past)}
                    fill="none"
                    stroke={SPOT}
                    strokeWidth={1.6}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    clipPath={`url(#${revealId})`}
                  />
                </>
              )}

              {cur && (
                <circle
                  cx={X(cur.bar)}
                  cy={YA(cur.premium)}
                  r={2.5}
                  fill={cur.held ? MUTED_INK : SPOT}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>

            {/* reference tag, TradingView price-label idiom */}
            <span
              className="pointer-events-none absolute right-0.5 -translate-y-1/2 inline-flex items-center rounded-[3px] bg-textPrimary px-1 py-px font-mono text-micro font-bold tnum text-ink"
              style={{ top: `${pctYA(t.entry)}%` }}
            >
              {t.entry.toFixed(2)}
            </span>

            {/* rungs the ceiling can't hold — present, labelled, out of scale */}
            {t.dockedRungs.map((r, i) => (
              <span
                key={r.label}
                className="pointer-events-none absolute flex items-center gap-1 whitespace-nowrap font-mono text-micro tnum text-textMuted"
                style={{ left: `${DOCK_X}%`, top: `${4 + i * 12}px`, transform: 'translateX(-100%)' }}
              >
                <span className="hidden sm:inline">
                  {r.label} ${r.premium.toFixed(2)} · {signedPct(r.pct)}
                  {r.spotNeeded != null && ` · needs ${r.spotNeeded.toFixed(2)}`}
                </span>
                <span className="translate-x-1" style={{ color: RUNG_INK[r.status] }}>
                  ▲
                </span>
              </span>
            ))}

            {/* Sits just inside the forward half at the baseline — dead space in
                every profile, and right under the terminus it labels. */}
            {t.atFloor && (
              <span
                className="pointer-events-none absolute bottom-0 font-mono text-micro tnum text-textMuted"
                style={{ left: `${pctX(0)}%`, marginLeft: 6 }}
              >
                ${plan.floor.toFixed(2)} model floor
              </span>
            )}

            {forwardOnly && (
              <span className="pointer-events-none absolute left-1 top-1 font-mono text-micro uppercase tracking-wider text-textMuted">
                No prior bars for this contract yet
              </span>
            )}
          </div>

          <div className="h-1" />

          {/* ---------------- LANE B ---------------- */}
          <div className="relative h-[52px] sm:h-[64px]">
            <svg
              viewBox={`0 0 ${VB_W} ${B_H}`}
              width="100%"
              height="100%"
              preserveAspectRatio="none"
              role="img"
              aria-label={`${plan.ticker} underlying over the same window, ${t.spotLo.toFixed(2)} to ${t.spotHi.toFixed(2)}. Spot ${t.spotNow.toFixed(2)}.`}
            >
              {plan.invalidation && (
                <line
                  x1={0}
                  x2={VB_W}
                  y1={YB(plan.invalidation.spot)}
                  y2={YB(plan.invalidation.spot)}
                  stroke={WARN_INK}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {plan.spotMarks.map(m => (
                <line
                  key={m.label}
                  x1={0}
                  x2={VB_W}
                  y1={YB(m.spot)}
                  y2={YB(m.spot)}
                  stroke="rgba(255,255,255,0.18)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {/* Every rung, inverted into a level the user can actually watch.
                  Four of these do not fit a 300px lane, so below sm they drop
                  entirely rather than pile up: the stat strip still names the
                  live one and every ladder card carries its own level. */}
              <g className="hidden sm:inline">
                {t.rungs.map((r, i) =>
                  r.spotNeeded == null ? null : (
                    <line
                      key={r.label}
                      x1={(VB_W * rungX(i)) / 100}
                      x2={(VB_W * rungX(i)) / 100 + 22}
                      y1={YB(r.spotNeeded)}
                      y2={YB(r.spotNeeded)}
                      stroke={RUNG_INK[r.status]}
                      strokeOpacity={0.8}
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  )
                )}
              </g>

              {/* the SAME spot array lane A was priced from — the lanes cannot
                  contradict each other by construction */}
              {!forwardOnly && (
                <path
                  d={spotPath}
                  fill="none"
                  stroke={MUTED_INK}
                  strokeWidth={1}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {cur && !cur.held && (
                <circle cx={X(cur.bar)} cy={YB(cur.spot)} r={2} fill={MUTED_INK} vectorEffect="non-scaling-stroke" />
              )}
            </svg>

            {/* dead-thesis hatch on the wrong side of the invalidation level */}
            {plan.invalidation && (
              <span
                className="pointer-events-none absolute inset-x-0"
                style={{
                  top: plan.right === 'C' ? `${pctYB(plan.invalidation.spot)}%` : 0,
                  bottom: plan.right === 'C' ? 0 : `${100 - pctYB(plan.invalidation.spot)}%`,
                  backgroundImage:
                    'repeating-linear-gradient(45deg, rgba(255,149,0,0.10) 0 5px, rgba(255,149,0,0) 5px 10px)',
                }}
              />
            )}

            {plan.invalidation && (
              <span
                className="pointer-events-none absolute left-1 -translate-y-1/2 whitespace-nowrap font-mono text-micro tnum text-warn/90"
                style={{ top: `${pctYB(plan.invalidation.spot)}%` }}
              >
                {plan.invalidation.spot.toFixed(2)}
                <span className="hidden sm:inline">
                  {' '}
                  · {plan.invalidation.note} ·{' '}
                  {Math.abs((plan.invalidation.spot / t.spotNow - 1) * 100).toFixed(2)}% away
                </span>
              </span>
            )}

            {plan.spotMarks.map(m => (
              <span
                key={m.label}
                className="pointer-events-none absolute left-1 -translate-y-1/2 whitespace-nowrap font-mono text-micro tnum text-textMuted"
                style={{ top: `${pctYB(m.spot)}%` }}
              >
                {m.spot.toFixed(2)} <span className="hidden sm:inline">{m.label}</span>
              </span>
            ))}

            {t.rungs.map((r, i) =>
              r.spotNeeded == null ? null : (
                <span
                  key={r.label}
                  className="pointer-events-none absolute hidden sm:block -translate-y-1/2 whitespace-nowrap font-mono text-micro tnum"
                  style={{
                    left: `${rungX(i) + 2.4}%`,
                    top: `${pctYB(r.spotNeeded)}%`,
                    color: RUNG_INK[r.status],
                  }}
                >
                  ◂{r.label} {r.spotNeeded.toFixed(2)}
                </span>
              )
            )}

            {/* spot reads the same here as it does in the chain */}
            <span
              className="pointer-events-none absolute right-0.5 w-[104px] sm:w-[132px] -translate-y-1/2"
              style={{ top: `${pctYB(t.spotNow)}%` }}
            >
              <SpotRule ticker={plan.ticker} price={t.spotNow} />
            </span>
          </div>

          {/* NOW — fixed, never moves as bars append */}
          <span
            className="pointer-events-none absolute inset-y-0 w-px"
            style={{ left: `${pctX(0)}%`, backgroundColor: GRID_INK }}
          />

          {/* crosshair spans both lanes */}
          {cur && (
            <span
              className="pointer-events-none absolute inset-y-0 w-px bg-select/45"
              style={{ left: `${pctX(cur.bar)}%` }}
            />
          )}
        </div>

        {/* right ruler — the identical series as % from reference. Labels drop
            below sm and the gutter collapses; the dollar ruler always stays. */}
        <div className="w-2 sm:w-11 shrink-0 flex flex-col">
          <div className="relative h-[148px] sm:h-[176px]">
            <span
              className="absolute right-0 hidden sm:block -translate-y-1/2 font-mono text-micro font-semibold uppercase tracking-wider text-textPrimary"
              style={{ top: `${pctYA(t.entry)}%` }}
            >
              Ref
            </span>
            {inFrame.map(r => (
              <span
                key={r.label}
                className="absolute right-0 hidden sm:flex flex-col items-end leading-tight"
                style={{ top: `${pctYA(r.premium)}%`, transform: 'translateY(-50%)' }}
              >
                <span className="font-mono text-micro font-semibold tnum" style={{ color: RUNG_INK[r.status] }}>
                  {r.label}
                </span>
                <span className="font-mono text-micro tnum text-textMuted">{signedPct(r.pct)}</span>
              </span>
            ))}
          </div>
          <div className="h-1" />
          <div className="relative h-[52px] sm:h-[64px]" />
        </div>
      </div>

      {/* x labels — relative time only */}
      <div className="flex items-baseline font-mono text-micro uppercase tracking-wider text-textMuted">
        <span className="w-10 sm:w-11 shrink-0" />
        <span className="relative flex-1 min-w-0 h-3">
          {/* A long-dated contract puts NOW near the left edge, where this label
              would sit on top of it. The window is still spoken in the aria
              sentence and read out by the crosshair. */}
          <span className="absolute left-0">
            {t.pastMinutes >= 2 && pctX(0) >= 30 ? `−${barsToSpan(t.pastMinutes)}` : ''}
          </span>
          <span className="absolute -translate-x-1/2 text-textSecondary" style={{ left: `${pctX(0)}%` }}>
            Now
          </span>
          <span className="absolute right-0">Expiry</span>
        </span>
        <span className="w-2 sm:w-11 shrink-0" />
      </div>

      {/* keyboard traversal announces here; the pointer gets the floating card */}
      <p aria-live="polite" className="min-h-[13px] font-mono text-micro tnum text-textSecondary">
        {readout ? `${readout.when} · ${readout.spot} · ${readout.px} · ${readout.delta}` : ''}
      </p>

      <p className="text-micro leading-relaxed text-textMuted">
        {plan.modelNote}
        {plan.entryLabel === 'Reference' && ' Reference is the mid every take-profit rung is measured from.'}
      </p>

      {cursor?.pointer && readout && (
        <HoverReadout x={cursor.x} y={cursor.y}>
          <div className="font-mono text-micro uppercase tracking-wider text-textMuted">{readout.when}</div>
          <div className="font-mono text-caption font-bold text-textPrimary tnum">{readout.px}</div>
          <div className="mt-0.5 font-mono text-micro tnum text-textSecondary">{readout.delta}</div>
          <div className="font-mono text-micro tnum text-textMuted">{readout.spot}</div>
        </HoverReadout>
      )}
    </div>
  );
};

export default ContractTrack;
