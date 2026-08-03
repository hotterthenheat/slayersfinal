import { useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type TouchEvent } from 'react';
import Simulator from '../../core/simulator';
import useMediaQuery from '../../hooks/useMediaQuery';
import { BEAR, BULL, FOCUS } from '../gex/palette';
import EmptyState from '../ui/EmptyState';
import HoverReadout from '../ui/HoverReadout';
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
  type TrackRung,
} from './contractTrackModel';
import type { Candle } from '../../types/market';

/*
  CONTRACT TRACK — one contract's own premium, on one lane.

  What changed and why. This was two stacked lanes: the premium above, the
  underlying below, with every target inverted into a spot level and projected
  down into 64px of second chart. Everything in it was true, and it read as an
  engineering diagram — the price line squashed into the bottom quarter because
  the y-axis had to reach a +275% target, four label stacks competing at the top
  right, and the number a holder actually looks at (what is this worth right now,
  and am I up or down) nowhere on the screen.

  The frame is now the one a position chart uses. The premium is the hero and it
  is stated once, large, with the move from reference beside it in dollars and
  percent, coloured by its sign — that IS market direction on this instrument, so
  green and red are the correct language rather than a borrowed one. The scale
  fits the path rather than the furthest target, so the line has room to be read;
  a target the scale cannot hold is not dropped but docked to the top edge with
  the move it needs, which is more honest than compressing the chart until every
  level fits and none of them is legible.

  Left of NOW time is the variable and spot moves — that is what happened. Right
  of NOW spot is HELD and only time runs — that is what standing still costs, and
  it is why a 0DTE reads the way it does. The two halves are drawn differently
  for that reason and the divider is labelled.

  The reference, the stop and every target are horizontal rules with a tag on the
  right gutter, which is where a position chart puts a level. The table beneath
  carries what a tag cannot: what each level is worth, how far it is from
  reference, and the underlying price that gets you there.

  Hand-rolled SVG, no recharts: recharts lives in exactly one file repo-wide and
  importing it here would pull it into the main Compass chunk for one path, one
  dashed curve and a handful of rules. The plot uses preserveAspectRatio="none",
  so there is no <text> inside it — non-uniform scaling distorts glyphs. Every
  label is HTML positioned in percent over the plot, which also puts it in the
  accessibility tree for free.
*/

const VB_W = 1000;
const VB_H = 220;
/**
 * Right gutter, in viewBox units, reserved for level tags.
 *
 * Zero on a phone. 13% of 348px is 46px, which cannot hold "TP2 $13.46" — the
 * tags clipped mid-number and the docked ones overprinted each other, so the
 * chart carried four truncated labels and gave up an eighth of its width to do
 * it. Below `sm` the tags stand down and the plot takes the whole frame; the
 * table underneath already carries every level in full, so nothing is lost.
 */
const GUTTER = 132;
const PAD_TOP = 10;
const PAD_BOT = 8;

/** Share of the visible premium range kept as breathing room above and below. */
const Y_PAD = 0.12;

const GRID_INK = 'rgba(255,255,255,0.16)';

/** Vertical gap between stacked docked tags, in viewBox units. */
const DOCK_STEP = 15;

/** Where a docked level sits in the stack — its index among the docked ones. */
const dockSlot = (level: LevelMark, all: LevelMark[]): number =>
  all.filter(l => l.docked).indexOf(level);

interface LevelMark {
  key: string;
  label: string;
  premium: number;
  ink: string;
  /** Underlying price that puts the contract here, when the model can invert it. */
  needs: number | null;
  /** Docked levels sit above the scale — tagged at the ceiling, never dropped. */
  docked: boolean;
  /** Reached, on the path the chart actually drew. */
  hit: boolean;
  /** One line the columns cannot carry. */
  note?: string;
}

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
  const compact = useMediaQuery('(max-width: 639px)');
  const [cursor, setCursor] = useState<Cursor | null>(null);
  // useId returns ':r0:', which url(#...) can't parse.
  const uid = `ct-${useId().replace(/:/g, '')}`;

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

  if (n === 0 || !Number.isFinite(t.spotNow) || t.past.length === 0) {
    return (
      <div className={`inst-surface rounded-md ${className}`}>
        <EmptyState size="sm" title="No bars for this ticker" />
      </div>
    );
  }

  const now = t.past[t.past.length - 1].premium;
  /*
    The headline change is over the WINDOW DRAWN, not against the reference.

    Nobody entered anything — `entry` is the premium the engine quotes right now,
    at the current spot, so `now - entry` is zero by construction and the header
    read "+$0.00 (+0.0%)" on every contract while the line above it visibly fell
    a third. A change of nothing, printed in green, over a chart of a decline.

    What moved is the session: the contract repriced along real bars from the
    left edge of the frame to here. That is the number a position chart shows and
    the only one this series can honestly put in the hero slot. The reference
    keeps its own line below, because it is what the ladder is measured from.
  */
  const windowOpen = t.past[0].premium;
  const move = now - windowOpen;
  const movePct = pctFrom(windowOpen, now);
  const up = move >= 0;
  const ink = up ? BULL : BEAR;

  /*
    The stop is the invalidation level expressed in the contract's own currency.

    `plan.invalidation` is a SPOT — the price at which the reason for the trade
    stops being true — and a holder reading a premium chart cannot convert that
    in their head. The model already reprices the contract along that spot
    (invalidationCurve), so its value at NOW is what the position is worth if the
    thesis breaks today. That is the number a stop means here.
  */
  const stopPremium = plan.invalidation
    ? plan.priceAt(plan.invalidation.spot, plan.sessionsLeft)
    : null;
  /*
    The LEVEL and the CURVE are separate decisions, and conflating them lost the
    stop on about half of setups.

    buildTrack nulls `invalidationCurve` when it would lie flat on the model
    floor for most of the span — correct, a dotted line along the axis is noise.
    The old chart could afford that because lane B carried the stop as a spot
    rule regardless. With lane B gone, reading the level off the curve meant the
    stop simply vanished whenever the curve was suppressed, which is the one
    thing on this chart a holder cannot be allowed to lose. The level is priced
    directly; the curve is drawn only when the model says it is worth drawing.
  */
  const stopAtFloor = stopPremium != null && stopPremium <= plan.floor + 1e-6;

  /*
    Scale to the PATH, not to the furthest target.

    The old ceiling was whatever the highest rung needed, so a +275% target
    pinned the line into the bottom quarter of the frame and the movement a
    reader came for was unreadable. The scale now fits what actually happened
    plus the levels close enough to matter; anything above is docked.
  */
  const pathVals = [...t.past.map(p => p.premium), ...t.forward.map(p => p.premium), t.entry];
  if (stopPremium != null) pathVals.push(stopPremium);
  const rawLo = Math.min(...pathVals);
  const rawHi = Math.max(...pathVals);
  // Admit a target only while it stays within half a frame of the path — beyond
  // that it costs more legibility than it buys.
  const headroom = (rawHi - rawLo || rawHi || 1) * 0.5;
  const reachable = t.rungs.filter(r => r.premium <= rawHi + headroom);
  const hiWith = Math.max(rawHi, ...reachable.map(r => r.premium));
  const pad = (hiWith - rawLo || hiWith || 1) * Y_PAD;
  const yLo = Math.max(0, rawLo - pad);
  // `pathVals` already carries the stop, so the floor of the scale is at or below
  // it — the stop rule is always inside the frame rather than docked off it.

  const yHi = hiWith + pad;

  const plotW = compact ? VB_W : VB_W - GUTTER;
  const span = t.xMax - t.xMin || 1;
  const X = (bar: number) => ((bar - t.xMin) / span) * plotW;
  const Y = (v: number) => {
    const f = Math.max(0, Math.min(1, (v - yLo) / (yHi - yLo || 1)));
    return VB_H - PAD_BOT - f * (VB_H - PAD_TOP - PAD_BOT);
  };
  const pctX = (bar: number) => (X(bar) / VB_W) * 100;
  const pctY = (v: number) => (Y(v) / VB_H) * 100;

  const line = (pts: { bar: number; premium: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.bar).toFixed(2)},${Y(p.premium).toFixed(2)}`).join(' ');

  const pastLine = line(t.past);
  const pastFill = t.past.length
    ? `${pastLine} L${X(t.past[t.past.length - 1].bar).toFixed(2)},${(VB_H - PAD_BOT).toFixed(2)} L${X(
        t.past[0].bar
      ).toFixed(2)},${(VB_H - PAD_BOT).toFixed(2)} Z`
    : '';

  const rungMark = (r: TrackRung, docked: boolean): LevelMark => ({
    key: r.label,
    label: r.label,
    premium: r.premium,
    ink: RUNG_INK[r.status],
    needs: r.spotNeeded,
    docked,
    hit: r.status === 'HIT',
  });

  const levels: LevelMark[] = [
    {
      key: 'ref',
      label: plan.entryLabel,
      premium: t.entry,
      ink: FOCUS,
      needs: null,
      docked: false,
      hit: false,
    },
    ...(stopPremium != null && plan.invalidation
      ? [
          {
            key: 'stop',
            label: 'Stop',
            premium: stopPremium,
            ink: WARN_INK,
            needs: plan.invalidation.spot,
            docked: false,
            hit: false,
            note: stopAtFloor
              ? `${plan.invalidation.note} — at that price the model prices this contract on its $${plan.floor.toFixed(2)} floor, so treat it as a total loss rather than a quote.`
              : plan.invalidation.note,
          },
        ]
      : []),
    ...reachable.map(r => rungMark(r, false)),
    ...t.rungs.filter(r => !reachable.includes(r)).map(r => rungMark(r, true)),
  ];

  const forwardOnly = t.past.length < 2;
  const cur = cursor ? cursorPts[cursor.i] : null;

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
      className={`inst-surface rounded-md p-3 flex flex-col gap-2.5 ${className}`}
      role="group"
      aria-label={`Contract track for ${name}`}
    >
      {/*
        The header a holder reads first: what it is, what it is worth, and
        whether that is up or down on the reference. One large number, one
        signed move, nothing competing with them.
      */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-mono text-micro uppercase tracking-widest text-textMuted">
            {name} · {plan.expiryLabel}
          </div>
          <div className="flex items-baseline gap-2.5 mt-0.5">
            <span className="font-mono text-2xl font-bold text-textPrimary tnum leading-none">
              ${now.toFixed(2)}
            </span>
            <span className="font-mono text-caption font-semibold tnum leading-none" style={{ color: ink }}>
              {move >= 0 ? '+' : '−'}${Math.abs(move).toFixed(2)} ({signedPct(movePct, 1)})
            </span>
          </div>
          <div className="font-mono text-micro text-textMuted tnum mt-1">
            over {barsToSpan(t.pastMinutes)} · {plan.entryLabel.toLowerCase()} ${t.entry.toFixed(2)} ·{' '}
            {barsToSpan(t.forwardMinutes)} left
          </div>
        </div>
        {/* MODELED, never "live" — this series is derived, and the label is the
            only thing standing between a model and a claim about the tape. */}
        <span className="font-mono text-micro uppercase tracking-widest text-textMuted shrink-0">Modeled</span>
      </div>

      {/* ---- the plot ---- */}
      <div
        ref={plotRef}
        className="relative w-full select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60 rounded"
        style={{ height: 220 }}
        tabIndex={0}
        role="application"
        aria-label={trackSummary(plan, t)}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setCursor(null)}
        onTouchStart={onTouchMove}
        onTouchMove={onTouchMove}
        onTouchEnd={() => setCursor(null)}
        onKeyDown={onKeyDown}
        onBlur={() => setCursor(null)}
      >
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ink} stopOpacity={0.24} />
              <stop offset="100%" stopColor={ink} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Level rules. Drawn under the path so the price is never crossed out. */}
          {levels
            .filter(l => !l.docked)
            .map(l => (
              <line
                key={l.key}
                x1={0}
                x2={plotW}
                y1={Y(l.premium)}
                y2={Y(l.premium)}
                stroke={l.ink}
                strokeOpacity={l.key === 'ref' ? 0.5 : 0.34}
                strokeWidth={1}
                strokeDasharray={l.key === 'ref' ? '2 3' : '5 4'}
                vectorEffect="non-scaling-stroke"
              />
            ))}

          {/* NOW — the boundary between what happened and what waiting costs. */}
          <line
            x1={X(0)}
            x2={X(0)}
            y1={0}
            y2={VB_H}
            stroke={GRID_INK}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />

          {/* What waiting costs: spot held, only time running. Dashed and dimmed
              so it can never be mistaken for something that happened. */}
          {t.forward.length > 1 && (
            <path
              d={line(t.forward)}
              fill="none"
              stroke={ink}
              strokeOpacity={0.42}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* If the thesis breaks today. */}
          {t.invalidationCurve && t.invalidationCurve.length > 1 && (
            <path
              d={line(t.invalidationCurve)}
              fill="none"
              stroke={WARN_INK}
              strokeOpacity={0.5}
              strokeWidth={1.25}
              strokeDasharray="2 4"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* What happened. */}
          {!forwardOnly && (
            <>
              <path d={pastFill} fill={`url(#${uid}-fill)`} stroke="none" />
              <path
                d={pastLine}
                fill="none"
                stroke={ink}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}

          {/* Where it is now. */}
          <circle cx={X(0)} cy={Y(now)} r={3.5} fill={ink} stroke="#000" strokeWidth={1} />

          {cur && (
            <>
              <line
                x1={X(cur.bar)}
                x2={X(cur.bar)}
                y1={0}
                y2={VB_H}
                stroke={FOCUS}
                strokeOpacity={0.45}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={X(cur.bar)} cy={Y(cur.premium)} r={3} fill={FOCUS} />
            </>
          )}
        </svg>

        {/* Level tags, in the gutter. HTML rather than <text>: the plot scales
            non-uniformly and glyphs inside it would shear. */}
        <div className="absolute inset-0 pointer-events-none">
          {!compact && levels.map(l => (
            <span
              key={l.key}
              className="absolute -translate-y-1/2 whitespace-nowrap font-mono text-micro font-semibold tnum px-1 rounded-sm"
              style={{
                left: `${(plotW / VB_W) * 100 + 0.8}%`,
                /* Docked tags STACK. Pinning them all to the ceiling overprinted
                   them into an unreadable smear — two levels the chart could not
                   hold became one glyph pile, which is worse than dropping them. */
                top: l.docked
                  ? `${((PAD_TOP + dockSlot(l, levels) * DOCK_STEP) / VB_H) * 100}%`
                  : `${pctY(l.premium)}%`,
                color: l.ink,
                opacity: l.docked ? 0.7 : 1,
              }}
            >
              {l.label} ${l.premium.toFixed(2)}
              {l.docked && ' ↑'}
            </span>
          ))}
          <span
            className="absolute font-mono text-micro uppercase tracking-widest text-textMuted"
            style={{ left: `${pctX(0)}%`, bottom: 2, transform: 'translateX(-50%)' }}
          >
            Now
          </span>
          <span className="absolute left-0 bottom-0.5 font-mono text-micro text-textMuted tnum">
            {barsToSpan(t.pastMinutes)} ago
          </span>
        </div>

        {readout && cursor?.pointer && (
          <HoverReadout x={cursor.x} y={cursor.y}>
            <div className="font-mono text-micro tnum leading-relaxed">
              <div className="text-textPrimary font-semibold">{readout.px}</div>
              <div className="text-textSecondary">{readout.delta}</div>
              <div className="text-textMuted">
                {readout.when} · {readout.spot}
              </div>
            </div>
          </HoverReadout>
        )}
      </div>

      {/* Keyboard cursors read here rather than through a floating card. */}
      <p className="sr-only" aria-live="polite">
        {readout ? `${readout.px}, ${readout.delta}, ${readout.when}, ${readout.spot}` : ''}
      </p>

      {/*
        The levels as a table.

        A tag on the axis can carry a price and nothing else. What a holder needs
        beside it is how far the level is from where they started and what the
        UNDERLYING has to do to get there — the second one being the question the
        old lane B existed to answer, asked in words instead of a second chart.
      */}
      <div className="border-t border-borderSubtle pt-2">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 font-mono text-micro tnum">
          <span className="uppercase tracking-widest text-textMuted">Level</span>
          <span className="uppercase tracking-widest text-textMuted text-right">Premium</span>
          <span className="uppercase tracking-widest text-textMuted text-right">From {plan.entryLabel.toLowerCase()}</span>
          <span className="uppercase tracking-widest text-textMuted text-right">{plan.ticker} needs</span>
          {levels.map(l => (
            <Row key={l.key} level={l} entry={t.entry} />
          ))}
        </div>
      </div>

      <p className="font-mono text-micro text-textMuted leading-relaxed">{plan.modelNote}</p>
    </div>
  );
};

/** One level. Split out so the grid stays four columns of one row each. */
const Row = ({ level, entry }: { level: LevelMark; entry: number }) => {
  const pct = pctFrom(entry, level.premium);
  return (
    <>
      <span className="truncate" style={{ color: level.ink }}>
        {level.label}
        {level.hit && <span className="ml-1.5 text-textMuted uppercase tracking-wider">reached</span>}
        {level.docked && <span className="ml-1.5 text-textMuted uppercase tracking-wider">off scale</span>}
      </span>
      <span className="text-right text-textPrimary">${level.premium.toFixed(2)}</span>
      <span className="text-right text-textSecondary">{level.key === 'ref' ? '—' : signedPct(pct, 0)}</span>
      <span className="text-right text-textSecondary">{level.needs != null ? level.needs.toFixed(2) : '—'}</span>
      {level.note && (
        <span className="col-span-4 -mt-0.5 text-textMuted leading-snug">{level.note}</span>
      )}
    </>
  );
};

export default ContractTrack;
