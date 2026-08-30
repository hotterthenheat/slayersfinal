/*
==================================================
  SLAYER TERMINAL - STRIKE PRESSURE LADDER
  The heatmap's replacement (Mo, 2026-08-19: "I
  don't think we should keep a generic orange/gray
  heatmap just because every other options platform
  has one"). Every strike is a ROW; the put and call
  gamma at it are TICKS counted out from the centre
  line — one tick is a fixed sum, so $1.2B against
  $300M is counted, not estimated. Beside the rows:
  net, distance from spot, open interest, volume,
  and the part the strike plays. Spot and the flip
  run THROUGH the ladder as rules; walls, pin and
  supreme are named on their rows.

  THE SPINE (Noah, 2026-08-22): a contour drawn over
  the bars — at every row it leans toward the side
  that dominates, by that strike's net, and the rows
  join into one curve. It crosses centre at the flip
  and bulges hardest at the walls. A dashed ghost is
  the same curve at the session open; the gap between
  them, row by row, is the strike building or
  bleeding. The bars never move — they are anchored
  at centre so the legs stay comparable down the
  ladder (the first cut grew them from the bent spine
  and every row looked shoved sideways).
==================================================
*/

import React, { Fragment, useLayoutEffect, useRef, useState } from 'react';

/** A smooth open spline through points (Catmull-Rom, rendered as cubic
    Béziers). One curve for the whole ladder — the per-row quadratics met at
    corners and doubled back wherever neighbours pulled opposite ways (Noah,
    2026-08-22: "the curve is glitching"). Control x is clamped to the lane. */
const splinePath = (pts: { x: number; y: number }[], xMin: number, xMax: number): string => {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const cx = (v: number) => Math.max(xMin, Math.min(xMax, v));
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = cx(p1.x + (p2.x - p0.x) / 6);
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = cx(p2.x - (p3.x - p1.x) / 6);
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
};
import { fmtUsd } from '../../data/gex';
import HoverReadout from '../ui/HoverReadout';
import SpotRule from '../ui/SpotRule';
import Term from '../ui/Term';
import { CALL_WALL, FLIP, SUPREME, PUT_WALL } from './palette';
import type { ExposureProfileData, StrikeExposure } from '../../types/gex';
import { heatInk, heatPoleRgb } from './heatmap';

interface StrikePressureLadderProps {
  data: ExposureProfileData;
  /** Strike column in another instrument's terms (SPX / ES on index names) */
  strikeFormat?: (strike: number) => string;
  /** Rows stretch to fill the host's height instead of taking a fixed row height */
  fill?: boolean;
  /** Per strike, net gamma at the open as a ratio of now — draws the ghost spine */
  openRatio?: Map<number, number> | null;
}

// The legs' inks — the chart's steel-gold, so the ladder and the trails it
// sits beside on the desk say the same thing in the same colours (Noah,
// 2026-08-22): gold = put side, amplifies; steel = call side, absorbs. The
// ALPHA carries the same number the length does — double encoding, on
// purpose: brightness is what the eye catches scanning the column, length
// is what it reads when it stops. A floor keeps the quiet rows from vanishing.
/* DERIVED FROM THE ACTIVE RAMP, not copied out of it. These were literals —
   the gold and platinum of `steel-gold` — and heatmap.ts's own rule says
   legends must derive from its poles and never hardcode. This surface was
   the exception, and it is the one surface whose colours carry EXACTLY the
   heatmap's meaning, so a ramp change used to leave the ladder drawing the
   old palette while every other surface moved. */
const PUT_RGB = heatPoleRgb.pos;
const CALL_RGB = heatPoleRgb.neg;
/** The cool side as TEXT — a darker step of the same ramp; the full pole is
    near-white at 11px and stops reading as the call side at all. */
const PUT_INK = heatInk.pos;
const CALL_INK = heatInk.neg;
const INK_FLOOR = 0.3;
const legInk = (rgb: string, strength: number) => `rgba(${rgb},${(INK_FLOOR + (1 - INK_FLOOR) * Math.pow(strength, 0.7)).toFixed(3)})`;
const PUT_KEY = legInk(PUT_RGB, 1);
const CALL_KEY = legInk(CALL_RGB, 1);

/** Below this width the OI / volume / role columns fold away — the bars are
    the point, and they must never shrink to slivers to keep a caption. */
const COMPACT_BELOW = 820;
/** The spine may lean this far from centre, in % of the bars lane, either way */
const MAX_LEAN = 22;
/** Room kept at each lane end for the leg's figure (11px mono, up to "$999.9M") */
const FIGURE_W = 60;

const fmtStrikeDefault = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));
const fmtDist = (pct: number) => {
  const d = Math.abs(pct) < 0.005 ? 0 : pct;
  return `${d > 0 ? '+' : ''}${d.toFixed(2)}%`;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Role = { label: string; color: string };

/** One legend entry: a swatch, the NAME bright, the meaning in plain words —
    the strip has to be readable at a glance, not decoded (Noah, 2026-08-22:
    "I need more visibility"). */
const LegendItem = ({ glyph, name, text, compact }: { glyph: React.ReactNode; name: React.ReactNode; text: string; compact: boolean }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={compact ? text : undefined}>
    {glyph}
    <span className="font-semibold uppercase tracking-wide text-textPrimary">{name}</span>
    {/* Narrow panels keep the name and carry the meaning on hover — a key
        that wraps to three lines eats the ladder it explains */}
    {!compact && <span className="text-textSecondary">{text}</span>}
  </span>
);

/** The tail's ink — the house attention colour; neither side's market colour */
const TAIL = '#FF9500';
/** A strike this far from spot is "far" — the day's fight is inside it */
const TAIL_DIST_PCT = 3;

/** The part a strike plays, in the order that matters if it plays several. */
const rolesOf = (row: StrikeExposure, levels: ExposureProfileData['levels'], tails: Set<number>): Role[] => {
  const out: Role[] = [];
  if (row.strike === levels.supreme) out.push({ label: 'SUPREME', color: SUPREME });
  if (row.strike === levels.callWall) out.push({ label: 'CALL WALL', color: CALL_WALL });
  if (row.strike === levels.putWall) out.push({ label: 'PUT WALL', color: PUT_WALL });
  if (tails.has(row.strike)) out.push({ label: 'TAIL', color: TAIL });
  if (row.pin) out.push({ label: 'PIN', color: '#ededed' });
  return out;
};

/** TAIL strikes (Skylit's "hedge node", in our words): far from spot, and
    carrying outsized gamma against their own neighbourhood — protective
    positioning that only matters if the tape gets there, or when it builds
    fast on a news day. Named only when it actually exists. */
const findTails = (strikes: StrikeExposure[], spot: number, maxNet: number): Set<number> => {
  const out = new Set<number>();
  strikes.forEach((s, i) => {
    const dist = Math.abs((s.strike - spot) / spot) * 100;
    if (dist < TAIL_DIST_PCT) return;
    const mag = Math.abs(s.gex.net);
    if (mag < 0.2 * maxNet) return;
    const neighbours = [i - 2, i - 1, i + 1, i + 2].map(j => strikes[j]).filter(Boolean);
    if (neighbours.length === 0) return;
    const around = neighbours.reduce((a, n) => a + Math.abs(n.gex.net), 0) / neighbours.length;
    if (mag >= 2 * Math.max(around, 1)) out.add(s.strike);
  });
  return out;
};

const FlipRule = ({ price }: { price: number }) => (
  <span className="flex items-center gap-1.5 select-none" aria-label={`gamma flip ${price.toFixed(2)}`}>
    <span className="h-px flex-grow border-t border-dashed" style={{ borderColor: `${FLIP}99` }} />
    <span className="font-mono text-[9px] uppercase tracking-wider whitespace-nowrap" style={{ color: FLIP }}>
      flip
    </span>
    <span
      className="inline-flex items-center rounded-[3px] px-1.5 py-px font-mono text-[10px] font-bold tnum text-[#0a0a0a] whitespace-nowrap"
      style={{ background: FLIP }}
    >
      {price.toFixed(2)}
    </span>
    <span className="h-px w-3 shrink-0 border-t border-dashed" style={{ borderColor: `${FLIP}99` }} />
  </span>
);

/** A leg: a solid bar from the centre line, length AND brightness carrying the
    amount. `side` is the direction it grows. */
const LegBar = ({ px, strength, side, rgb }: { px: number; strength: number; side: 'put' | 'call'; rgb: string }) => (
  <span
    aria-hidden="true"
    data-leg={side}
    className={`absolute top-1/2 -translate-y-1/2 h-[9px] transition-[width,background-color] duration-700 ${side === 'put' ? 'rounded-l-[2px]' : 'rounded-r-[2px]'}`}
    style={{
      ...(side === 'put' ? { right: '50%' } : { left: '50%' }),
      width: px,
      background: legInk(rgb, strength),
      transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
    }}
  />
);

const StrikePressureLadder = ({ data, strikeFormat = fmtStrikeDefault, fill = false, openRatio = null }: StrikePressureLadderProps) => {
  const { ticker, strikes, levels, spotAfterIndex } = data;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const laneRef = useRef<HTMLSpanElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rowLaneRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [compact, setCompact] = useState(false);
  const [laneW, setLaneW] = useState(320);
  /* The list's inner height, so fill-mode rows can be given EXPLICIT heights
     — flex-sized rows re-flow in one frame; a px height can glide (Noah,
     2026-08-22: "make the transition between 10, 15, 20 smooth"). */
  const [listH, setListH] = useState(0);
  /* The hover read-out — the house floating card, not the browser's title
     tooltip (Noah, 2026-08-22: "looks like old school html"). Follows the
     pointer; pointer events pass through it. */
  const [hover, setHover] = useState<{ row: StrikeExposure; x: number; y: number } | null>(null);
  /* The contour's geometry: each row's lane centre (y) and the lane's x
     range, measured in the list's own coordinates (scroll included) so one
     SVG over the list can draw the whole curve. */
  const [geom, setGeom] = useState<{ ys: number[]; laneLeft: number; laneWidth: number; width: number; height: number } | null>(null);

  // The column set and the lane's tick capacity follow the host's REAL width,
  // not the viewport's — a panel on a desk can be narrow on a wide screen.
  // Measured NOW for the first paint (observer notifications arrive in the
  // render step, which a background tab may not run), then tracked.
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const read = () => {
      setCompact(el.clientWidth < COMPACT_BELOW);
      if (laneRef.current) setLaneW(laneRef.current.clientWidth);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Measure the rows for the contour — synchronously after layout, again
  // whenever the list resizes, and EVERY FRAME while a window change is
  // gliding the rows to their new heights, so the spine rides the rows
  // instead of snapping ahead of them.
  const ROW_GLIDE_MS = 500;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      setListH(list.clientHeight);
      const lr = list.getBoundingClientRect();
      const lanes = rowLaneRefs.current.slice(0, strikes.length);
      const first = lanes.find(Boolean);
      if (!first) return;
      const fr = first.getBoundingClientRect();
      const ys = lanes.map(el => {
        if (!el) return 0;
        const r = el.getBoundingClientRect();
        return r.top - lr.top + list.scrollTop + r.height / 2;
      });
      setGeom({ ys, laneLeft: fr.left - lr.left, laneWidth: fr.width, width: list.clientWidth, height: list.scrollHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    // Follow the glide: re-measure each frame until the height transition is
    // done — and once more when any row's transition actually ends, so the
    // final shape is exact even where frames don't run.
    const started = performance.now();
    let raf = 0;
    const follow = () => {
      measure();
      if (performance.now() - started < ROW_GLIDE_MS + 50) raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);
    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName === 'height') measure();
    };
    list.addEventListener('transitionend', onEnd);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      list.removeEventListener('transitionend', onEnd);
    };
  }, [strikes, compact, laneW, fill, spotAfterIndex]);

  // One scale for BOTH legs — the bars are comparable across the centre line.
  // The biggest leg reaches the lane's end minus its figure; the rest scale.
  const maxLeg = strikes.reduce((m, s) => Math.max(m, Math.abs(s.gex.put), Math.abs(s.gex.call)), 1);
  const maxNet = strikes.reduce((m, s) => Math.max(m, Math.abs(s.gex.net)), 1);
  const reach = Math.max(24, laneW / 2 - FIGURE_W - 6);
  const strengthOf = (v: number) => Math.abs(v) / maxLeg;
  const tails = findTails(strikes, levels.spot, maxNet);

  // Spine x per row, in % of the lane. Negative net = call-dominant = the
  // book leans toward the call side (right); positive leans left.
  const spineX = strikes.map(s => 50 - (s.gex.net / maxNet) * MAX_LEAN);
  // The ghost: the same row's net at the open, as the strike's own ratio
  // applied to its current lean — absent rows sit on the live spine.
  const ghostX = strikes.map((s, i) => {
    const r = openRatio?.get(s.strike);
    if (r == null) return spineX[i];
    return 50 - clamp(r, -1.6, 1.6) * ((s.gex.net / maxNet) * MAX_LEAN);
  });
  const hasGhost = !!openRatio && strikes.some(s => openRatio.has(s.strike));
  // The contour in list pixels: x from the row's lean, y from the measured row centre
  const toPts = (xs: number[]) =>
    geom ? xs.map((x, i) => ({ x: geom.laneLeft + (x / 100) * geom.laneWidth, y: geom.ys[i] ?? 0 })).filter(p => p.y > 0) : [];
  const spinePath = geom ? splinePath(toPts(spineX), geom.laneLeft, geom.laneLeft + geom.laneWidth) : '';
  const ghostPath = geom && hasGhost ? splinePath(toPts(ghostX), geom.laneLeft, geom.laneLeft + geom.laneWidth) : '';

  // The flip is a midpoint — it sits BETWEEN two rows (strikes descending)
  const flipDegenerate = Math.abs(levels.flip - levels.spot) < 1e-9;
  let flipAfterIndex = -2;
  if (!flipDegenerate) {
    flipAfterIndex = strikes.findIndex(
      (row, i) => row.strike >= levels.flip && (strikes[i + 1]?.strike ?? -Infinity) < levels.flip
    );
  }

  // The bars lane carries a floor in both sets — the bars are the number
  const cols = compact
    ? 'grid-cols-[52px_50px_minmax(160px,1fr)_68px]'
    : 'grid-cols-[56px_52px_minmax(260px,1fr)_76px_60px_60px_80px]';
  const cell = 'font-mono text-[10px] tnum whitespace-nowrap';
  const head = 'font-mono text-[9px] uppercase tracking-widest text-textSecondary whitespace-nowrap';
  /* Row height as a NUMBER: in fill mode the rows share the list's height
     (the rules take their own), floored at 16px so the tail scrolls; the
     height glides between window sizes. No glide until the first real
     measurement, or every mount would grow from the floor. */
  const RULE_PX = 22;
  const ruleCount = (spotAfterIndex >= -0.5 ? 1 : 0) + (flipAfterIndex >= 0 ? 1 : 0);
  const rowPx = fill ? Math.max(16, Math.floor((listH - ruleCount * RULE_PX - 2) / Math.max(1, strikes.length))) : 24;
  const rowGlide = listH > 0 ? 'transition-[height,background-color] duration-500' : 'transition-colors';

  return (
    <div ref={hostRef} className="h-full min-h-0 flex flex-col">
      {/* HOW TO READ IT — at the top, where the eye lands first (Noah,
          2026-08-22: "this should be explained at the top"). */}
      {/* One line at full width (Noah, 2026-08-22) — 9px, short meanings;
          the long form lives on the term explainers. */}
      <div className="shrink-0 flex items-center gap-x-5 gap-y-1 flex-wrap px-3 py-1.5 border-b border-borderSubtle/60 font-mono text-[9px] select-none">
        <LegendItem
          glyph={
            <span className="inline-flex items-center" aria-hidden="true">
              <span className="inline-block w-4 h-[7px] rounded-l-[2px]" style={{ background: `linear-gradient(to left, ${PUT_KEY}, ${legInk(PUT_RGB, 0)})` }} />
              <span className="inline-block w-4 h-[7px] rounded-r-[2px]" style={{ background: `linear-gradient(to right, ${legInk(CALL_RGB, 0)}, ${CALL_KEY})` }} />
            </span>
          }
          name={
            <>
              <Term k="Puts">Puts</Term> · <Term k="Calls">Calls</Term>
            </>
          }
          text="gold amplifies, steel absorbs · longer and brighter is heavier"
          compact={compact}
        />
        <LegendItem
          glyph={<span aria-hidden="true" className="inline-block w-5 h-[2px] rounded-full" style={{ background: 'rgba(237,237,237,0.9)' }} />}
          name="Solid"
          text="where the book leans now"
          compact={compact}
        />
        {hasGhost && (
          <LegendItem
            glyph={<span aria-hidden="true" className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: 'rgba(237,237,237,0.55)' }} />}
            name="Dashed"
            text="the same curve at the open"
            compact={compact}
          />
        )}
        <LegendItem
          glyph={<span aria-hidden="true" className="inline-block w-[9px] h-[9px] rounded-[2px]" style={{ background: SUPREME }} />}
          name={<span style={{ color: SUPREME }}>Supreme</span>}
          text="heaviest strike, washed across its row"
          compact={compact}
        />
        {tails.size > 0 && (
          <LegendItem
            glyph={<span aria-hidden="true" className="inline-block w-[9px] h-[9px] rounded-[2px]" style={{ background: TAIL }} />}
            name={
              <span style={{ color: TAIL }}>
                <Term k="Tail">Tail</Term>
              </span>
            }
            text="heavy gamma far from price"
            compact={compact}
          />
        )}
      </div>

      {/* Captions — one whisper row */}
      <div className={`shrink-0 grid ${cols} items-center gap-x-2 px-2 h-6 border-b border-borderSubtle bg-[#0c0c0c] select-none`}>
        <span className={head}>Strike</span>
        <span className={`${head} text-right`}>
          <Term k="From spot">Δ spot</Term>
        </span>
        <span ref={laneRef} className={`${head} text-center text-textMuted block min-w-0`}>
          <span style={{ color: PUT_INK }}>◂ puts</span>
          <span className="mx-2 text-textMuted">·</span>
          <span style={{ color: CALL_INK }}>calls ▸</span>
        </span>
        <span className={`${head} text-right`}>
          <Term k="Net GEX">Net</Term>
        </span>
        {!compact && (
          <>
            <span className={`${head} text-right`}>
              <Term k="Open interest">OI</Term>
            </span>
            <span className={`${head} text-right`}>
              <Term k="Volume">Vol</Term>
            </span>
            <span className={`${head} text-right`}>Role</span>
          </>
        )}
      </div>

      {/* The ladder — strikes descending, spot and flip as rules between rows.
          ONE contour (and its ghost) is drawn over the whole list, so it runs
          smoothly through the rules instead of breaking at them. */}
      {/* Always scrollable: fill rows stretch when there is room and stop at
          their floor when there isn't — the tail must scroll, not vanish
          (Noah, 2026-08-22: "it cuts off after 485"). */}
      <div ref={listRef} className="relative flex-1 min-h-0 flex flex-col overflow-y-auto">
        {geom && (
          <svg
            aria-hidden="true"
            className="absolute left-0 top-0 pointer-events-none z-[1]"
            width={geom.width}
            height={geom.height}
            viewBox={`0 0 ${geom.width} ${geom.height}`}
          >
            {ghostPath && (
              <path data-ghost d={ghostPath} fill="none" stroke="rgba(237,237,237,0.35)" strokeWidth={1} strokeDasharray="3 3" />
            )}
            {spinePath && <path data-spine d={spinePath} fill="none" stroke="rgba(237,237,237,0.85)" strokeWidth={1.5} />}
          </svg>
        )}
        {spotAfterIndex === -0.5 && (
          <div className="shrink-0 px-2 py-0.5">
            <SpotRule ticker={ticker} price={levels.spot} />
          </div>
        )}
        {strikes.map((row, i) => {
          const v = row.gex.net;
          const putStrength = strengthOf(row.gex.put);
          const callStrength = strengthOf(row.gex.call);
          const putEnd = reach * putStrength;
          const callEnd = reach * callStrength;
          const distPct = ((row.strike - levels.spot) / levels.spot) * 100;
          const roles = rolesOf(row, levels, tails);
          const edge = roles[0]?.color;
          const isKing = row.strike === levels.supreme;
          return (
            <Fragment key={row.strike}>
              <div
                data-supreme={isKing || undefined}
                /* The supreme's row wears a constant magenta wash end to end (Noah,
                   2026-08-22) — the book's heaviest strike is findable from
                   across the room, not just by its tag. */
                /* Keyed by strike: a window change keeps the rows that stay
                   (they glide), and only the new strikes soft-fade in. */
                className={`relative shrink-0 grid ${cols} items-center gap-x-2 px-2 border-b border-borderSubtle/30 animate-soft-in ${rowGlide} hover:bg-white/[0.03] ${
                  isKing ? 'bg-[#EA00FF]/[0.1]' : row.pin ? 'bg-white/[0.02]' : ''
                }`}
                /* Unmeasured (first paint): flex-sized like before, so the
                   first explicit height lands where the row already is — no
                   grow-from-the-floor on mount */
                style={{ height: listH > 0 ? rowPx : undefined, flex: listH > 0 ? undefined : '1 1 0%', minHeight: 16, transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
                data-strike={row.strike}
                onMouseEnter={e => setHover({ row, x: e.clientX, y: e.clientY })}
                onMouseMove={e => setHover({ row, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(null)}
              >
                {/* The part it plays, as a left edge — readable even when the
                    role column has folded away */}
                {edge && <span aria-hidden="true" className="absolute left-0 inset-y-0 w-[2px]" style={{ background: edge }} />}
                {/* Strike, distance and the leg figures wear the PRIMARY ink at
                    11px (Noah, 2026-08-22: "really muted") — the numbers a
                    trader reads must never sit in the whisper register. */}
                <span className="font-mono text-[11px] font-semibold tnum whitespace-nowrap text-textPrimary">{strikeFormat(row.strike)}</span>
                <span className="font-mono text-[10px] tnum whitespace-nowrap text-right text-textPrimary">{fmtDist(distPct)}</span>

                {/* THE LANE: the legs from the centre line, the leg's figure
                    riding each bar's end, and the spine contour drawn over it */}
                <span
                  ref={el => {
                    rowLaneRefs.current[i] = el;
                  }}
                  className="relative block self-stretch min-h-[14px] min-w-0"
                >
                  <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-white/[0.08]" />
                  <LegBar px={putEnd} strength={putStrength} side="put" rgb={PUT_RGB} />
                  <LegBar px={callEnd} strength={callStrength} side="call" rgb={CALL_RGB} />
                  {/* figures at the bar ends — axis labels on the bars themselves */}
                  <span
                    className="absolute top-1/2 -translate-y-1/2 text-right font-mono text-[11px] font-medium tnum whitespace-nowrap text-textPrimary transition-[right] duration-700"
                    style={{ right: `calc(50% + ${putEnd + 6}px)`, transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
                  >
                    {fmtUsd(Math.abs(row.gex.put))}
                  </span>
                  <span
                    className="absolute top-1/2 -translate-y-1/2 font-mono text-[11px] font-medium tnum whitespace-nowrap text-textPrimary transition-[left] duration-700"
                    style={{ left: `calc(50% + ${callEnd + 6}px)`, transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
                  >
                    {fmtUsd(Math.abs(row.gex.call))}
                  </span>
                </span>

                {/* Sim side-coding: negative = call-dominant = absorbs (steel), positive = amplifies (gold) */}
                <span className={`${cell} text-right font-semibold`} style={{ color: v < 0 ? CALL_INK : v > 0 ? PUT_INK : undefined }}>
                  {fmtUsd(v)}
                </span>
                {!compact && (
                  <>
                    <span className={`${cell} text-right text-textPrimary`}>{row.oi.toLocaleString()}</span>
                    <span className={`${cell} text-right text-textPrimary`}>{row.volume.toLocaleString()}</span>
                    <span className="flex items-center justify-end gap-1.5 min-w-0">
                      {roles.slice(0, 2).map(r => (
                        <span key={r.label} className="font-mono text-[8px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: r.color }}>
                          {r.label}
                        </span>
                      ))}
                    </span>
                  </>
                )}
              </div>
              {i === spotAfterIndex && (
                <div className="shrink-0 px-2 py-0.5">
                  <SpotRule ticker={ticker} price={levels.spot} />
                </div>
              )}
              {i === flipAfterIndex && (
                <div className="shrink-0 px-2 py-0.5">
                  <FlipRule price={levels.flip} />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      {hover && (
        <HoverReadout x={hover.x} y={hover.y}>
          <StrikeCard row={hover.row} data={data} strikeFormat={strikeFormat} maxLeg={maxLeg} openRatio={openRatio} tails={tails} />
        </HoverReadout>
      )}
    </div>
  );
};

/** The read-out's body: the strike and the parts it plays, both legs with
    their share of the book's heaviest leg, net, distance, OI, volume, and
    how the strike has moved since the open. Numbers in the card, never a
    sentence — this is a reading, not a read. */
const StrikeCard = ({
  row,
  data,
  strikeFormat,
  maxLeg,
  openRatio,
  tails,
}: {
  row: StrikeExposure;
  data: ExposureProfileData;
  strikeFormat: (s: number) => string;
  maxLeg: number;
  openRatio: Map<number, number> | null;
  tails: Set<number>;
}) => {
  const { levels, ticker } = data;
  const roles = rolesOf(row, levels, tails);
  const v = row.gex.net;
  const distPct = ((row.strike - levels.spot) / levels.spot) * 100;
  const ratio = openRatio?.get(row.strike);
  /* Since the open, as |net| now against |net| at the open — the same
     measure the chart's focus chip uses. A negative ratio means the strike
     changed SIDES, where a percent is nonsense (the first cut printed
     "−1291%"); a near-zero open means the gamma is new today. */
  const sinceOpen: { pct: number | null; text: string } | null =
    ratio == null
      ? null
      : ratio < 0
        ? { pct: null, text: 'flipped sides since the open' }
        : Math.abs(ratio) < 0.05
          ? { pct: null, text: 'new since the open' }
          : (() => {
              const pct = Math.max(-99, Math.min(999, (1 / Math.abs(ratio) - 1) * 100));
              return { pct, text: Math.abs(pct) < 15 ? 'about where it opened' : pct > 0 ? 'gamma building' : 'gamma bleeding' };
            })();
  const leg = (label: string, amt: number, rgb: string) => (
    <div className="flex items-center gap-2">
      <span className="w-9 font-mono text-[9px] uppercase tracking-wider text-textSecondary">{label}</span>
      <span className="relative flex-1 h-[5px] rounded-full bg-white/[0.06] overflow-hidden">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(Math.abs(amt) / maxLeg) * 100}%`, background: legInk(rgb, Math.abs(amt) / maxLeg) }} />
      </span>
      <span className="w-16 text-right font-mono text-[11px] font-semibold tnum text-textPrimary">{fmtUsd(Math.abs(amt))}</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-2 min-w-[236px]">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[13px] font-bold tnum text-textPrimary">
          {ticker} {strikeFormat(row.strike)}
        </span>
        <span className={`font-mono text-[10px] tnum ${distPct > 0 ? 'text-textSecondary' : 'text-textSecondary'}`}>{fmtDist(distPct)} from spot</span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          {roles.map(r => (
            <span key={r.label} className="font-mono text-[8px] font-bold uppercase tracking-wider" style={{ color: r.color }}>
              {r.label}
            </span>
          ))}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {leg('puts', row.gex.put, PUT_RGB)}
        {leg('calls', row.gex.call, CALL_RGB)}
      </div>
      <div className="grid grid-cols-3 gap-x-3 pt-1.5 border-t border-borderSubtle/60">
        <span className="flex flex-col">
          <span className="font-mono text-[8px] uppercase tracking-widest text-textMuted">Net</span>
          <span className="font-mono text-[11px] font-semibold tnum" style={{ color: v < 0 ? CALL_INK : v > 0 ? PUT_INK : undefined }}>
            {fmtUsd(v)}
          </span>
        </span>
        <span className="flex flex-col">
          <span className="font-mono text-[8px] uppercase tracking-widest text-textMuted">Open int</span>
          <span className="font-mono text-[11px] tnum text-textPrimary">{row.oi.toLocaleString()}</span>
        </span>
        <span className="flex flex-col">
          <span className="font-mono text-[8px] uppercase tracking-widest text-textMuted">Volume</span>
          <span className="font-mono text-[11px] tnum text-textPrimary">{row.volume.toLocaleString()}</span>
        </span>
      </div>
      {sinceOpen && (
        <div className="flex items-center gap-2 pt-1.5 border-t border-borderSubtle/60">
          <span className="font-mono text-[8px] uppercase tracking-widest text-textMuted">Since open</span>
          {sinceOpen.pct != null && (
            <span className="font-mono text-[11px] tnum text-textPrimary">
              {sinceOpen.pct > 0 ? '+' : ''}
              {sinceOpen.pct.toFixed(0)}%
            </span>
          )}
          <span className="font-mono text-[9px] text-textSecondary">{sinceOpen.text}</span>
        </div>
      )}
    </div>
  );
};

export default StrikePressureLadder;
