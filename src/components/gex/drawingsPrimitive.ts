import type { ISeriesPrimitive, SeriesAttachedParameter, Time, IChartApi, ISeriesApi } from 'lightweight-charts';
import { fmtElapsed, measureSpan } from '../../data/measure';
import { fmtDistance, type DistanceScales } from '../../data/atr';
import { getDistanceUnit } from '../../data/distanceUnits';

/*
  User drawings layer — trendlines and horizontal levels, sketched directly on
  the big chart in draw mode. Anchored in (time, price) space so they survive
  pan/zoom AND timeframe switches; persisted per ticker in localStorage.
  Interface color (lime) — these are the USER's marks, not engine data.
*/

/*
  THE MEASURE IS A THIRD KIND — T-1, and a third kind is all it is.

  It carries the same two anchor points a trend does and lives in the same
  per-ticker store, so it survives a pan, a zoom, a timeframe switch and a
  reload exactly as the other two do, and the eraser clears it with them.

  WHAT THE DIRECTIVE ASKED FOR AND WHAT THIS DOES. The sketch was "release to
  dismiss, or click to pin it as a drawing" — a transient by default. This
  commits on release like the other two instead, deliberately: drawings here
  have ONE lifecycle (drawn, stored per ticker, cleared by the eraser), and
  making measures the single kind that does not persist means a second
  lifecycle in a store that has one, plus a pin affordance and a dismissal
  rule that nothing else on this chart needs. The transient half is live
  DURING the drag, which is where a measure is read.
*/
/*
  T-2 GROWS THE UNION FROM THREE TO EIGHT. The five newcomers, and what each
  is for:

    ray      a trend that extends forward only — the line you draw once and
             trade against for the rest of the day
    rect     a marked consolidation or value area
    channel  two parallel rays; the third anchor sets the width
    fib      the one drawing that carries its own levels, labelled at the
             right edge where a reader meets them
    note     words anchored to a bar, so the reason for a level survives the
             session the way the level does

  AND THE PARTNER'S ROUND TAKES IT TO THIRTEEN (2026-08-27, "we should have
  an entire toolbar … curves, squares etc"):

    vline    a moment marked on the clock — news hit here, the break started
             here. One click, like the level it is the vertical twin of
    extend   the trend through BOTH edges — structure that was in force
             before the leg the anchors sit on
    arrow    a trend that says which way — the head is the claim
    curve    three anchors, a bend through the third — rounded structure a
             straight line misstates
    ellipse  a circled area; the soft twin of the box for "around here",
             where the box says "exactly this range"
*/
export type DrawingKind =
  | 'trend' | 'hline' | 'measure' | 'ray' | 'rect' | 'channel' | 'fib' | 'note'
  | 'vline' | 'extend' | 'arrow' | 'curve' | 'ellipse' | 'long' | 'short';

/*
  THE KINDS' SHAPES, AS DATA, and the validator reads THIS rather than a list
  of its own. `loadDrawings` enumerated kinds inline — `kind === 'trend' ||
  kind === 'hline'` — so adding a third kind meant every stored one of it was
  dropped on the next read, silently, with no error: exactly the shape of the
  bug `setups.ts` was fixed for twice (T-0). A `satisfies` map, so a kind
  added to the union and not described here fails the BUILD — and now it
  carries the whole shape, because with eight kinds "which fields must a
  stored one have" is no longer one boolean:

    p2    the second anchor. A trend without one renders as nothing; a
          measure DIVIDES by the span between them.
    p3    the channel's width anchor. A channel without it is a zero-width
          channel, which is a trend wearing the wrong name.
    text  the note's words. A note without words is an anchor pointing at
          nothing, and it would render as a bare square nobody can read.
*/
const KIND_SHAPE = {
  trend: { p2: true, p3: false, text: false },
  hline: { p2: false, p3: false, text: false },
  measure: { p2: true, p3: false, text: false },
  ray: { p2: true, p3: false, text: false },
  rect: { p2: true, p3: false, text: false },
  channel: { p2: true, p3: true, text: false },
  fib: { p2: true, p3: false, text: false },
  note: { p2: false, p3: false, text: true },
  /* vline anchors to a TIME; the point's price rides along unused so the
     store keeps one point shape for every kind. */
  vline: { p2: false, p3: false, text: false },
  extend: { p2: true, p3: false, text: false },
  arrow: { p2: true, p3: false, text: false },
  curve: { p2: true, p3: true, text: false },
  ellipse: { p2: true, p3: false, text: false },
  /*
    THE POSITION PAIR carries THREE prices, which is why it is a p3 kind: an
    entry, a stop and a target. Two of them are not a trade — a line from
    entry to stop is a risk with nothing to earn, and the reader would be
    reading an R:R off a number the drawing does not have.

    `p2` holds the stop AND the span's right edge; `p3` holds the target at
    that same edge. One time for both, because a trade's two outcomes end at
    the same moment: the thing being drawn is a horizon, not two of them.
  */
  long: { p2: true, p3: true, text: false },
  short: { p2: true, p3: true, text: false },
} as const satisfies Record<DrawingKind, { p2: boolean; p3: boolean; text: boolean }>;

/**
 * Whether a kind's gesture owes a THIRD anchor after release — the channel's
 * width, the curve's bend. The GESTURE reads the same table the validator
 * does, so a three-anchor kind added there is automatically drawn in two
 * phases instead of committing half-made on release.
 */
export const needsThirdAnchor = (kind: DrawingKind): boolean => KIND_SHAPE[kind].p3;

export interface DrawingPoint {
  time: number; // bar time (sec)
  price: number;
}

export interface Drawing {
  kind: DrawingKind;
  p1: DrawingPoint;
  /** Second anchor — every two-point kind (see KIND_SHAPE). */
  p2?: DrawingPoint;
  /** The channel's width anchor. */
  p3?: DrawingPoint;
  /** The note's words. */
  text?: string;
}

const LIME = '210,255,0';

/*
  The measure's own band. Steel rather than lime: lime marks the reader's
  DECISIONS — a level they drew, a strike they picked — and a measure is a
  question rather than a mark. It also has to sit under a readout that must
  stay legible over candles.
*/
const MEASURE_RGB = '226,234,244';
const MEASURE_FILL = 'rgba(226,234,244,0.07)';

/*
  ONE TYPE VOICE FOR EVERY LABEL THE LAYER PRINTS (partner, 2026-08-27:
  "improve typography"). Before this, each renderer typed its own font
  string — the fib ran 9px, the note and the measure 10px, all at regular
  weight, and the fib's labels sat BARE on the field where a candle behind
  them made the price unreadable. Now: one face at one size, medium weight
  because thin monospace at 10px smears on non-retina panes, and every
  label sits on its own wash.
*/
const LABEL_PX = 10;
const labelFont = (vr: number, px = LABEL_PX) => `500 ${px * vr}px ui-monospace, SFMono-Regular, Menlo, monospace`;

/** A rounded dark wash behind a printed label — the reason every number this
    layer writes stays readable over a candle. Falls back to square corners
    where the canvas has no roundRect. */
const wash = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke?: string
) => {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
};

interface BitmapScope {
  context: CanvasRenderingContext2D;
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
  mediaSize: { width: number; height: number };
}
interface DrawTarget {
  useBitmapCoordinateSpace(cb: (scope: BitmapScope) => void): void;
}

class DrawingsPaneRenderer {
  constructor(private source: DrawingsPrimitive) {}

  draw(target: DrawTarget): void {
    const src = this.source;
    if (!src.chart || !src.series) return;
    if (src.drawings.length === 0 && !src.draft) return;
    const series = src.series;

    target.useBitmapCoordinateSpace(scope => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const w = scope.mediaSize.width * hr;
      const h = scope.mediaSize.height * vr;

      /*
        THE MEASURE — a band across the span, and what it says.

        The readout is drawn HERE rather than as floating DOM for the same
        reason the session levels are (sessionLevelsPrimitive.ts): it has to
        follow the band across a pan and a zoom, and a DOM chip would need its
        own frame loop to keep up with a canvas that already has one.

        The figures come from data/measure.ts, so the box and a proof cannot
        disagree about what a span is worth.
      */
      const renderMeasure = (d: Drawing, alpha: number) => {
        if (!d.p2) return;
        const x1m = src.timeToX(d.p1.time);
        const x2m = src.timeToX(d.p2.time);
        const y2c = series.priceToCoordinate(d.p2.price);
        const y1c2 = series.priceToCoordinate(d.p1.price);
        if (x1m === null || x2m === null || y2c === null || y1c2 === null) return;
        const xa = Math.min(x1m, x2m) * hr;
        const xb = Math.max(x1m, x2m) * hr;
        const ya = Math.min(y1c2, y2c) * vr;
        const yb = Math.max(y1c2, y2c) * vr;

        const span = measureSpan(d.p1.time, d.p1.price, d.p2.time, d.p2.price, src.barMinutes);
        /* Direction is the market's — the band is tinted by whether price
           ROSE across the span, which is the one place red and green belong
           (they are price direction, and nothing else here is). */
        const rose = span.deltaAbs >= 0;
        ctx.fillStyle = rose ? 'rgba(48,209,88,0.10)' : 'rgba(255,59,48,0.10)';
        ctx.fillRect(xa, ya, Math.max(1, xb - xa), Math.max(1, yb - ya));
        ctx.strokeStyle = `rgba(${MEASURE_RGB},${alpha * 0.8})`;
        ctx.lineWidth = 1 * vr;
        ctx.strokeRect(xa, ya, Math.max(1, xb - xa), Math.max(1, yb - ya));
        /* The two anchors, so a reader can see which corners were taken. */
        ctx.fillStyle = `rgba(${MEASURE_RGB},${alpha})`;
        const a = 2.2 * vr;
        ctx.fillRect(x1m * hr - a, y1c2 * vr - a, a * 2, a * 2);
        ctx.fillRect(x2m * hr - a, y2c * vr - a, a * 2, a * 2);

        const sign = span.deltaAbs >= 0 ? '+' : '−';
        const abs = Math.abs(span.deltaAbs);
        const lines = [
          `${sign}${abs.toFixed(2)}  ${sign}${Math.abs(span.deltaPct).toFixed(2)}%`,
          /* On a rule clock (barMinutes 0) there is no bar count worth
             claiming — the elapsed time off the stamps is the true part. */
          src.barMinutes > 0
            ? `${span.bars} bar${span.bars === 1 ? '' : 's'} · ${fmtElapsed(span.tradingMin)}`
            : fmtElapsed(span.tradingMin),
          /* Null while the drag has not left its bar — "not yet" rather than a
             rate off time that has not passed (data/measure.ts). */
          /* One decimal under 10, none above: a quiet multi-day span
             annualizes to single digits where "3%" and "3.2%" are different
             readings, and a ten-minute 0DTE move annualizes into the hundreds
             where a decimal is noise. */
          span.annualizedPct === null
            ? 'annualized —'
            : `annualized ${span.annualizedPct < 10 ? span.annualizedPct.toFixed(1) : span.annualizedPct.toFixed(0)}%`,
        ];
        /* T-19: when the desk's ruler is ATR or σ, the measure reads in it
           too — the headline's $ and % are the measure's identity and stay,
           the chosen ruler joins as its own line. An unmeasurable ruler
           prints its em-dash rather than hiding the line: the reader chose
           the unit, and silence would read as the tool ignoring them. */
        const unit = getDistanceUnit();
        if (unit === 'ATR' || unit === 'σ') {
          lines.splice(1, 0, fmtDistance(span.deltaAbs, d.p1.price, unit, src.distanceScales));
        }

        /* The headline (the move itself) a step larger than its context
           lines — the reader takes the delta first and the tenor after. */
        ctx.font = labelFont(vr, 11);
        const headW = ctx.measureText(lines[0]).width;
        ctx.font = labelFont(vr);
        ctx.textBaseline = 'top';
        const padX = 7 * hr;
        const padY = 6 * vr;
        const lineH = 14 * vr;
        const boxW = Math.max(headW, ...lines.slice(1).map(t => ctx.measureText(t).width)) + padX * 2;
        const boxH = lines.length * lineH + padY * 2;
        /* ABOVE the band when price rose, below when it fell — the box sits on
           the side the move came FROM, so it never covers the leg the reader
           is looking at. Clamped into the plot either way. */
        let bx = xb + 8 * hr;
        if (bx + boxW > scope.mediaSize.width * hr) bx = Math.max(0, xa - boxW - 8 * hr);
        let by = rose ? ya - boxH - 6 * vr : yb + 6 * vr;
        if (by < 0) by = yb + 6 * vr;
        if (by + boxH > scope.mediaSize.height * vr) by = Math.max(0, ya - boxH - 6 * vr);

        wash(ctx, bx, by, boxW, boxH, 4 * vr, 'rgba(10,10,10,0.88)', `rgba(${MEASURE_RGB},0.28)`);
        lines.forEach((t, i) => {
          ctx.font = labelFont(vr, i === 0 ? 11 : LABEL_PX);
          ctx.fillStyle =
            i === 0 ? (rose ? 'rgba(48,209,88,0.95)' : 'rgba(255,59,48,0.95)') : `rgba(${MEASURE_RGB},0.66)`;
          ctx.fillText(t, bx + padX, by + padY + i * lineH);
        });
      };

      /*
        ══ THE POSITION TOOL ════════════════════════════════════════════════

        Every charting package has this and it is the one drawing that is
        arithmetic rather than geometry: a reader is not marking a shape, they
        are asking "what does this trade pay, against what it risks".

        SO THE NUMBERS ARE THE TOOL and the box is the frame. The wash reads
        at a glance — reward green above, risk red below, or inverted for a
        short — and the panel carries what a reader would otherwise work out
        on paper: both legs in dollars and in percent, and the ratio.

        A CONTRADICTION IS NAMED, NOT DRAWN. A long whose stop sits above its
        entry is not a long with a small risk, it is a mistake — and printing
        an R:R for it would dress the mistake as a plan. The box says which
        way round it went instead.

        POSITION SIZE IS DELIBERATELY ABSENT. It needs an account and a risk
        budget, and this desk already has a surface that owns both with the
        probabilities attached (the Weigher). A second, worse copy inside a
        drawing tool is exactly the duplication this codebase keeps removing.
      */
      const renderPosition = (d: Drawing, alpha: number) => {
        if (!d.p2) return;
        const isLong = d.kind === 'long';
        const entry = d.p1.price;
        const stop = d.p2.price;
        /*
          THE FIRST HALF OF THE GESTURE HAS TO BE VISIBLE. The drag sets the
          entry and the stop; the target arrives on the click after it. With
          no target yet an earlier version returned and drew nothing, so a
          reader dragged across the tape watching the chart stay empty — a
          tool that looks broken for the whole first half of using it.
        */
        const drafting = !d.p3;
        const target = d.p3 ? d.p3.price : entry;
        const x1m = src.timeToX(d.p1.time);
        const x2m = src.timeToX(d.p2.time);
        const ye = series.priceToCoordinate(entry);
        const ys = series.priceToCoordinate(stop);
        const yt = series.priceToCoordinate(target);
        if (x1m === null || x2m === null || ye === null || ys === null || yt === null) return;

        const xa = Math.min(x1m, x2m) * hr;
        const xb = Math.max(x1m, x2m) * hr;
        const w = Math.max(1, xb - xa);
        const yeP = ye * vr, ysP = ys * vr, ytP = yt * vr;

        const REWARD = '48,209,88';
        const RISK = '255,59,48';

        /*
          ══ THE NUMBERS LIVE IN THE ZONES ════════════════════════════════════

          The first version put them in a floating box beside the drawing, and
          it read as a tooltip that had lost its anchor: the reader's eye had
          to travel from the red block to a panel somewhere off to the side and
          carry the meaning back. Every charting package worth copying puts the
          stop's price ON the stop's band and the target's ON the target's,
          because the band already IS the label's subject.

          So: two zones, a price plate at the outer edge of each, the entry on
          its own line, and the ratio at the line's right end. Nothing floats.
        */
        const band = (yFrom: number, yTo: number, rgb: string) => {
          const top = Math.min(yFrom, yTo);
          const h = Math.max(1, Math.abs(yTo - yFrom));
          ctx.fillStyle = `rgba(${rgb},0.13)`;
          ctx.fillRect(xa, top, w, h);
          /* The outer edge only. A full border boxes each zone separately and
             the pair stops reading as one trade split at the entry. */
          ctx.strokeStyle = `rgba(${rgb},${alpha * 0.5})`;
          ctx.lineWidth = 1 * vr;
          ctx.beginPath();
          const outer = yFrom === yeP ? yTo : yFrom;
          ctx.moveTo(xa, outer);
          ctx.lineTo(xb, outer);
          ctx.moveTo(xa, top);
          ctx.lineTo(xa, top + h);
          ctx.moveTo(xb, top);
          ctx.lineTo(xb, top + h);
          ctx.stroke();
        };
        if (!drafting) band(yeP, ytP, REWARD);
        band(yeP, ysP, RISK);

        /* The entry: the one price the reader actually controls. */
        ctx.save();
        ctx.setLineDash([4 * hr, 3 * hr]);
        ctx.strokeStyle = `rgba(${LIME},${alpha})`;
        ctx.lineWidth = 1.4 * vr;
        ctx.beginPath();
        ctx.moveTo(xa, yeP);
        ctx.lineTo(xb, yeP);
        ctx.stroke();
        ctx.restore();

        const riskOk = isLong ? stop < entry : stop > entry;
        const rewardOk = isLong ? target > entry : target < entry;
        const risk = Math.abs(entry - stop);
        const reward = Math.abs(target - entry);
        const pct = (v: number) => (entry === 0 ? 0 : (v / entry) * 100);
        const rr = risk > 1e-9 ? reward / risk : null;
        const ok = drafting || (riskOk && rewardOk);
        const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`;

        /*
          A PLATE, not floating text. The zone washes are faint by design — a
          reader has to see the candles through them — which means bare words
          laid on one compete with whatever wick is behind them. Each label
          gets the smallest possible dark ground and its own hairline.
        */
        const plate = (
          text: string,
          x: number,
          cy: number,
          align: 'left' | 'right',
          rgb: string,
          big = false,
        ) => {
          const size = big ? 12 : LABEL_PX;
          ctx.font = labelFont(vr, size);
          const tw = ctx.measureText(text).width;
          const padX = 5 * hr;
          const h = (big ? 18 : 15) * vr;
          const bw = tw + padX * 2;
          let bx = align === 'left' ? x : x - bw;
          /* Never off the plot, and never under the tool rail — the host says
             how much of the left edge its chrome has taken. */
          const leftBound = src.insetLeft * hr;
          bx = Math.max(leftBound, Math.min(bx, scope.mediaSize.width * hr - bw - 2 * hr));
          const by = Math.max(0, Math.min(cy - h / 2, scope.mediaSize.height * vr - h));
          wash(ctx, bx, by, bw, h, 3 * vr, 'rgba(10,10,10,0.88)', `rgba(${rgb},0.34)`);
          ctx.font = labelFont(vr, size);
          ctx.textBaseline = 'middle';
          ctx.fillStyle = `rgba(${rgb},0.96)`;
          ctx.fillText(text, bx + padX, by + h / 2);
        };

        const inset = 5 * hr;
        /* Pushed INTO its own zone, so a plate never straddles the entry line
           and the two never collide however thin the bands get. */
        const nudge = 10 * vr;

        if (!drafting) {
          plate(
            `Target  ${target.toFixed(2)}  ${signed(pct(target - entry))}`,
            xa + inset,
            ytP + (ytP < yeP ? nudge : -nudge),
            'left',
            rewardOk ? REWARD : RISK,
          );
        }
        plate(
          `Stop  ${stop.toFixed(2)}  ${signed(pct(stop - entry))}`,
          xa + inset,
          ysP + (ysP < yeP ? nudge : -nudge),
          'left',
          RISK,
        );
        plate(`${isLong ? 'Long' : 'Short'}  ${entry.toFixed(2)}`, xa + inset, yeP, 'left', LIME);

        /* THE RATIO IS THE ANSWER, so it sits alone at the line's other end
           in the largest type this drawing uses. A contradiction takes the
           same plate and says what is wrong instead of printing a number that
           would describe a trade nobody drew. */
        const verdict = drafting
          ? 'drag, then click the target'
          : !riskOk
            ? (isLong ? 'stop above entry' : 'stop below entry')
            : !rewardOk
              ? (isLong ? 'target below entry' : 'target above entry')
              : rr === null
                ? 'no risk to divide by'
                : `${rr.toFixed(2)} R`;
        plate(verdict, xb - inset, yeP, 'right', ok ? REWARD : RISK, ok && !drafting);

        /* The anchors: square for the stop, triangle for the target, so which
           half is the risk survives a reader who cannot separate the hues. */
        const a = 2.2 * vr;
        ctx.fillStyle = `rgba(${LIME},${alpha})`;
        ctx.fillRect(x1m * hr - a, yeP - a, a * 2, a * 2);
        ctx.fillStyle = `rgba(${RISK},${alpha})`;
        ctx.fillRect(xb - a, ysP - a, a * 2, a * 2);
        if (!drafting) {
          const t = 3.2 * vr;
          ctx.fillStyle = `rgba(${REWARD},${alpha})`;
          ctx.beginPath();
          ctx.moveTo(xb, ytP - (isLong ? t : -t));
          ctx.lineTo(xb - t, ytP + (isLong ? t : -t));
          ctx.lineTo(xb + t, ytP + (isLong ? t : -t));
          ctx.closePath();
          ctx.fill();
        }

        /*
          AND WHERE THE BOOK STANDS — the half no other charting package can
          put on this drawing. A target on the far side of the dealer's call
          wall is not the same trade as one short of it, and the shape alone
          cannot say so. Under the whole drawing, in the desk's cyan, because
          it is context rather than one of the three prices.
        */
        const lv = drafting ? null : src.levels;
        if (lv) {
          const notes: string[] = [];
          const ahead = isLong ? lv.callWall : lv.putWall;
          const wallName = isLong ? 'call wall' : 'put wall';
          if (ahead !== null && rewardOk) {
            notes.push(
              (isLong ? target > ahead : target < ahead)
                ? `target past the ${wallName} ${ahead.toFixed(2)}`
                : `${wallName} ${ahead.toFixed(2)} beyond it`,
            );
          }
          if (lv.flip !== null && (entry - lv.flip) * (target - lv.flip) < 0) {
            notes.push(`crosses the flip ${lv.flip.toFixed(2)}`);
          }
          if (notes.length) {
            const lowest = Math.max(yeP, ysP, drafting ? yeP : ytP);
            plate(notes.join('  ·  '), xa + inset, lowest + 13 * vr, 'left', '125,227,255');
          }
        }
      };

      const render = (d: Drawing, alpha: number) => {
        ctx.strokeStyle = `rgba(${LIME},${alpha})`;
        ctx.fillStyle = `rgba(${LIME},${alpha})`;
        ctx.lineWidth = 1.4 * vr;
        ctx.lineCap = 'round';

        /* The moment-marker anchors to TIME alone — the one kind with no
           price in its geometry, drawn before the price lookup the rest
           need. */
        if (d.kind === 'vline') {
          const xv = src.timeToX(d.p1.time);
          if (xv === null) return;
          ctx.beginPath();
          ctx.moveTo(xv * hr, 0);
          ctx.lineTo(xv * hr, h);
          ctx.stroke();
          return;
        }

        const y1c = series.priceToCoordinate(d.p1.price);
        if (y1c === null) return;
        const y1 = y1c * vr;

        if (d.kind === 'hline') {
          ctx.beginPath();
          ctx.moveTo(0, y1);
          ctx.lineTo(w, y1);
          ctx.stroke();
          return;
        }

        if (d.kind === 'note') {
          const xn = src.timeToX(d.p1.time);
          if (xn === null) return;
          const x1 = xn * hr;
          /* The anchor first — the note POINTS at a bar, and the square is
             the pointing. Words to the right of it, on a wash so they stay
             readable over candles; the wash is sized to the text, so a short
             note costs a short strip of tape. */
          const a = 2.2 * vr;
          ctx.fillRect(x1 - a, y1 - a, a * 2, a * 2);
          const label = d.text ?? '';
          ctx.font = labelFont(vr);
          ctx.textBaseline = 'middle';
          const tw = ctx.measureText(label).width;
          const pad = 5 * hr;
          /* A hairline in the note's own ink around its wash — of all the
             marks this is the one that is WORDS, and the frame is what says
             "annotation" rather than "stray print". */
          wash(ctx, x1 + a + 2 * hr, y1 - 9 * vr, tw + pad * 2, 18 * vr, 4 * vr, 'rgba(10,10,10,0.82)', `rgba(${LIME},0.35)`);
          ctx.fillStyle = `rgba(${LIME},${Math.min(1, alpha + 0.15)})`;
          ctx.fillText(label, x1 + a + 2 * hr + pad, y1);
          return;
        }

        if (!d.p2) return;

        if (d.kind === 'measure') {
          renderMeasure(d, alpha);
          return;
        }
        if (d.kind === 'long' || d.kind === 'short') {
          renderPosition(d, alpha);
          return;
        }
        const x1m = src.timeToX(d.p1.time);
        const x2m = src.timeToX(d.p2.time);
        const y2c = series.priceToCoordinate(d.p2.price);
        if (x1m === null || x2m === null || y2c === null) return;
        const x1 = x1m * hr;
        const x2 = x2m * hr;
        const y2 = y2c * vr;
        // square anchors — terminal grammar, no circles
        const a = 2.2 * vr;

        if (d.kind === 'rect') {
          const xa = Math.min(x1, x2);
          const ya = Math.min(y1, y2);
          const bw = Math.max(1, Math.abs(x2 - x1));
          const bh = Math.max(1, Math.abs(y2 - y1));
          /* A marked AREA, so it carries a wash — faint enough that candles
             through it stay candles. The user's own ink, not a market one:
             a rectangle is a claim about a region, not about direction. */
          ctx.fillStyle = `rgba(${LIME},0.055)`;
          ctx.fillRect(xa, ya, bw, bh);
          ctx.strokeRect(xa, ya, bw, bh);
          ctx.fillStyle = `rgba(${LIME},${alpha})`;
          ctx.fillRect(x1 - a, y1 - a, a * 2, a * 2);
          ctx.fillRect(x2 - a, y2 - a, a * 2, a * 2);
          return;
        }

        if (d.kind === 'ellipse') {
          /* The soft twin of the box — "around here" where the box says
             "exactly this range". Same faint wash, same two corner anchors,
             so the pair reads as one family. */
          const cx = (x1 + x2) / 2;
          const cy = (y1 + y2) / 2;
          const rx = Math.max(1, Math.abs(x2 - x1) / 2);
          const ry = Math.max(1, Math.abs(y2 - y1) / 2);
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${LIME},0.055)`;
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = `rgba(${LIME},${alpha})`;
          ctx.fillRect(x1 - a, y1 - a, a * 2, a * 2);
          ctx.fillRect(x2 - a, y2 - a, a * 2, a * 2);
          return;
        }

        if (d.kind === 'extend') {
          /* Through both plot edges — structure that was in force before the
             leg the anchors sit on. A vertical pair is a moment, and the
             vline owns moments: it degenerates to its segment. */
          ctx.beginPath();
          if (x2 !== x1) {
            const slope = (y2 - y1) / (x2 - x1);
            ctx.moveTo(0, y1 + slope * (0 - x1));
            ctx.lineTo(w, y1 + slope * (w - x1));
          } else {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
          }
          ctx.stroke();
          ctx.fillRect(x1 - a, y1 - a, a * 2, a * 2);
          ctx.fillRect(x2 - a, y2 - a, a * 2, a * 2);
          return;
        }

        if (d.kind === 'arrow') {
          /* A trend that says which way — the head is the claim, drawn as a
             filled wedge at p2 along the segment's own angle. */
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          const ang = Math.atan2(y2 - y1, x2 - x1);
          const head = 9 * vr;
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - head * Math.cos(ang - 0.42), y2 - head * Math.sin(ang - 0.42));
          ctx.lineTo(x2 - head * Math.cos(ang + 0.42), y2 - head * Math.sin(ang + 0.42));
          ctx.closePath();
          ctx.fill();
          ctx.fillRect(x1 - a, y1 - a, a * 2, a * 2);
          return;
        }

        if (d.kind === 'curve') {
          /* Three anchors, a bend through the third: a quadratic whose
             control point is chosen so the curve PASSES THROUGH p3 at its
             midpoint (c = 2·P3 − (P1+P2)/2) — the reader drags the bend
             itself, never an abstract control handle. Before the bend is
             placed (the draft's first phase) the base segment draws, which
             is what is being placed. */
          const p3x = d.p3 ? src.timeToX(d.p3.time) : null;
          const p3yc = d.p3 ? series.priceToCoordinate(d.p3.price) : null;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          if (d.p3 && p3x !== null && p3yc !== null) {
            const x3 = p3x * hr;
            const y3 = p3yc * vr;
            ctx.quadraticCurveTo(2 * x3 - (x1 + x2) / 2, 2 * y3 - (y1 + y2) / 2, x2, y2);
            ctx.stroke();
            ctx.fillRect(x3 - a, y3 - a, a * 2, a * 2);
          } else {
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
          ctx.fillRect(x1 - a, y1 - a, a * 2, a * 2);
          ctx.fillRect(x2 - a, y2 - a, a * 2, a * 2);
          return;
        }

        if (d.kind === 'ray') {
          /* Through the two anchors and on to the RIGHT edge only — the line
             a reader draws once and trades against for the rest of the
             session. A vertical pair degenerates to its segment rather than
             inventing a direction. */
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          if (x2 !== x1) {
            const slope = (y2 - y1) / (x2 - x1);
            const xe = x2 >= x1 ? w : 0;
            ctx.lineTo(xe, y1 + slope * (xe - x1));
          } else {
            ctx.lineTo(x2, y2);
          }
          ctx.stroke();
          ctx.fillRect(x1 - a, y1 - a, a * 2, a * 2);
          ctx.fillRect(x2 - a, y2 - a, a * 2, a * 2);
          return;
        }

        if (d.kind === 'channel') {
          /* Two rays, one vertical offset. The offset is p3's distance from
             the BASE LINE at p3's own x — drag the third anchor and the
             width follows it. Without p3 (the draft's first phase) only the
             base draws, which is what the reader is still placing. */
          const drawRay = (sx: number, sy: number) => {
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            if (x2 !== x1) {
              const slope = (y2 - y1) / (x2 - x1);
              const xe = x2 >= x1 ? w : 0;
              ctx.lineTo(xe, sy + slope * (xe - sx));
            } else {
              ctx.lineTo(x2, sy + (y2 - y1));
            }
            ctx.stroke();
          };
          drawRay(x1, y1);
          const p3x = d.p3 ? src.timeToX(d.p3.time) : null;
          const p3yc = d.p3 ? series.priceToCoordinate(d.p3.price) : null;
          if (d.p3 && p3x !== null && p3yc !== null) {
            const x3 = p3x * hr;
            const y3 = p3yc * vr;
            const baseYat = (x: number) => (x2 !== x1 ? y1 + ((y2 - y1) / (x2 - x1)) * (x - x1) : y1);
            const off = y3 - baseYat(x3);
            /* The wash between the rails, drawn as the quad the two rays
               bound — the channel IS the space, not the lines. */
            const xe = x2 >= x1 ? w : 0;
            const yeBase = baseYat(xe);
            ctx.fillStyle = `rgba(${LIME},0.045)`;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(xe, yeBase);
            ctx.lineTo(xe, yeBase + off);
            ctx.lineTo(x1, y1 + off);
            ctx.closePath();
            ctx.fill();
            drawRay(x1, y1 + off);
            ctx.fillStyle = `rgba(${LIME},${alpha})`;
            ctx.fillRect(x3 - a, y3 - a, a * 2, a * 2);
          }
          ctx.fillStyle = `rgba(${LIME},${alpha})`;
          ctx.fillRect(x1 - a, y1 - a, a * 2, a * 2);
          ctx.fillRect(x2 - a, y2 - a, a * 2, a * 2);
          return;
        }

        if (d.kind === 'fib') {
          /*
            THE ONE DRAWING THAT CARRIES ITS OWN LEVELS. Ratios of the leg
            from p1 to p2, drawn from the leg's start to the RIGHT edge —
            retracements are traded after the leg, not inside it — and each
            labelled at the right edge with the ratio AND the price, because
            a rule with no number sends the reader's eye to the axis this
            chart deliberately keeps unlabelled.

            0, ½ and 1 draw a step brighter: the endpoints anchor the eye and
            the half is the one every reader checks first.
          */
          const RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
          const xa = Math.min(x1, x2);
          /* Labels sit ON A WASH now — bare 9px text over candles was the
             partner's screenshot's least readable element — and the ratio
             and the price get different weights of the same ink: the ratio
             places the rule in the family, the PRICE is what gets traded. */
          ctx.font = labelFont(vr);
          ctx.textBaseline = 'middle';
          for (const r of RATIOS) {
            const price = d.p1.price + (d.p2.price - d.p1.price) * r;
            const yc = series.priceToCoordinate(price);
            if (yc === null) continue;
            const y = yc * vr;
            const major = r === 0 || r === 0.5 || r === 1;
            ctx.strokeStyle = `rgba(${LIME},${major ? alpha * 0.8 : alpha * 0.45})`;
            ctx.lineWidth = 1 * vr;
            ctx.beginPath();
            ctx.moveTo(xa, y);
            ctx.lineTo(w, y);
            ctx.stroke();
            const ratio = String(r);
            const priceTxt = ` ${price.toFixed(2)}`;
            const rw = ctx.measureText(ratio).width;
            const pw = ctx.measureText(priceTxt).width;
            const pad = 4 * hr;
            const bw = rw + pw + pad * 2;
            const bx = w - bw - 3 * hr;
            wash(ctx, bx, y - 8 * vr, bw, 16 * vr, 3 * vr, 'rgba(10,10,10,0.78)');
            ctx.fillStyle = `rgba(${LIME},${(major ? alpha : alpha * 0.75) * 0.6})`;
            ctx.fillText(ratio, bx + pad, y);
            ctx.fillStyle = `rgba(${LIME},${major ? alpha : alpha * 0.75})`;
            ctx.fillText(priceTxt, bx + pad + rw, y);
          }
          ctx.strokeStyle = `rgba(${LIME},${alpha})`;
          ctx.fillStyle = `rgba(${LIME},${alpha})`;
          ctx.lineWidth = 1.4 * vr;
          ctx.fillRect(x1 - a, y1 - a, a * 2, a * 2);
          ctx.fillRect(x2 - a, y2 - a, a * 2, a * 2);
          return;
        }

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.fillRect(x1 - a, y1 - a, a * 2, a * 2);
        ctx.fillRect(x2 - a, y2 - a, a * 2, a * 2);
      };

      for (let i = 0; i < src.drawings.length; i++) render(src.drawings[i], i === src.selected ? 1 : 0.8);
      if (src.draft) render(src.draft, 0.45);

      /* The selected mark wears hollow handles over its anchors — the same
         squares it always had, enlarged and outlined, so "selected" reads as
         "these corners are now yours to drag" rather than as a glow. */
      if (src.selected !== null && src.drawings[src.selected]) {
        const d = src.drawings[src.selected];
        ctx.strokeStyle = `rgba(${LIME},1)`;
        ctx.lineWidth = 1.4 * vr;
        const handle = (pt?: DrawingPoint) => {
          if (!pt) return;
          const hx = src.timeToX(pt.time);
          const hy = series.priceToCoordinate(pt.price);
          if (hx === null || hy === null) return;
          const r = 4.5 * vr;
          ctx.strokeRect(hx * hr - r, hy * vr - r, r * 2, r * 2);
        };
        handle(d.p1);
        handle(d.p2);
        handle(d.p3);
      }
    });
  }
}

class DrawingsPaneView {
  private _renderer: DrawingsPaneRenderer;
  constructor(source: DrawingsPrimitive) {
    this._renderer = new DrawingsPaneRenderer(source);
  }
  zOrder(): 'top' {
    return 'top';
  }
  renderer(): DrawingsPaneRenderer {
    return this._renderer;
  }
}

export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<'Candlestick'> | null = null;
  requestUpdate?: () => void;
  drawings: Drawing[] = [];
  draft: Drawing | null = null;
  /** Index of the mark the reader has selected with the Select tool. */
  selected: number | null = null;
  /** Sorted bar times of the CURRENT aggregation — lets time↔x conversion
      snap to real bars, so drawings survive timeframe switches. */
  barTimes: number[] = [];
  /** The interval those bars were aggregated to — what a measure's bar count
      and its annualization are computed against. */
  barMinutes = 1;
  /** T-19's rulers for the measure's ATR/σ line — set by the host per
      ticker, null until measurable. */
  distanceScales: DistanceScales = { atr: null, sigma: null };
  /*
    THE BOOK'S STRUCTURAL PRICES, for the position tool's last line.

    Null throughout is the honest resting state and the one every reader
    starts in: no chain, no claim. A wall that does not qualify is null too,
    which is a real answer here — "nothing in the way" and "we cannot see"
    would otherwise print the same, and they are opposite readings.
  */
  levels: { callWall: number | null; putWall: number | null; flip: number | null } | null = null;
  /*
    HOW MUCH OF THE PLOT'S LEFT EDGE IS COVERED BY CHROME, in CSS px.

    The tool rail is docked centre-left and opaque, and the canvas underneath
    it does not know that — so a readout box with nowhere else to go landed
    behind it and lost its first three characters per line. The primitive
    cannot see the rail; the host can, and says so.
  */
  insetLeft = 0;
  private _paneViews: DrawingsPaneView[];

  constructor() {
    this._paneViews = [new DrawingsPaneView(this)];
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<'Candlestick'>;
    this.requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = undefined;
  }

  updateAllViews(): void {}

  paneViews(): DrawingsPaneView[] {
    return this._paneViews;
  }

  /** Nearest-bar logical index for a time (binary search). */
  private timeToLogical(time: number): number | null {
    const ts = this.barTimes;
    if (ts.length === 0) return null;
    let lo = 0;
    let hi = ts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ts[mid] < time) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(ts[lo - 1] - time) < Math.abs(ts[lo] - time)) lo -= 1;
    return lo;
  }

  /** time → CSS x, via logical coords (works after pan/zoom, any timeframe). */
  timeToX(time: number): number | null {
    const chart = this.chart;
    const logical = this.timeToLogical(time);
    if (chart === null || logical === null) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return chart.timeScale().logicalToCoordinate(logical as any);
  }

  /** CSS x → nearest bar time (for pointer input). */
  xToTime(x: number): number | null {
    const chart = this.chart;
    if (!chart || this.barTimes.length === 0) return null;
    const logical = chart.timeScale().coordinateToLogical(x);
    if (logical === null) return null;
    const idx = Math.max(0, Math.min(this.barTimes.length - 1, Math.round(logical)));
    return this.barTimes[idx];
  }

  setBarMinutes(mins: number): void {
    /* 0 is a STATEMENT, not a missing value: the host is on a rule clock
       (T-15) and there is no fixed bar worth — the measure reads elapsed
       time off the stamps instead of counting steps. Fractions are real
       too: 0.25 is the 15s tape (clamping it to 1 quadrupled the measure's
       bar maths there). */
    this.barMinutes = Math.max(0, mins);
  }

  setInsetLeft(px: number): void {
    if (this.insetLeft === px) return;
    this.insetLeft = px;
    this.requestUpdate?.();
  }

  setLevels(levels: { callWall: number | null; putWall: number | null; flip: number | null } | null): void {
    this.levels = levels;
    this.requestUpdate?.();
  }

  setDistanceScales(scales: DistanceScales): void {
    this.distanceScales = scales;
  }

  setBarTimes(times: number[]): void {
    this.barTimes = times;
    this.requestUpdate?.();
  }

  setDrawings(drawings: Drawing[]): void {
    this.drawings = drawings;
    this.requestUpdate?.();
  }

  setDraft(draft: Drawing | null): void {
    this.draft = draft;
    this.requestUpdate?.();
  }

  setSelected(index: number | null): void {
    if (this.selected === index) return;
    this.selected = index;
    this.requestUpdate?.();
  }

  /** Bar index of a time on the CURRENT grid — the unit body-drags move in. */
  barIndexOf(time: number): number | null {
    return this.timeToLogical(time);
  }

  /** The grid's time at an index, clamped to the grid. */
  timeAtBarIndex(idx: number): number | null {
    if (this.barTimes.length === 0) return null;
    return this.barTimes[Math.max(0, Math.min(this.barTimes.length - 1, idx))];
  }

  /*
    WHICH MARK IS UNDER THE POINTER, in CSS px — the Select tool's question.

    Anchors are tested FIRST and win over bodies: a press on a corner means
    "move this corner", and only a press on the ink between corners means
    "move the whole mark". Iteration runs newest-first so overlapping marks
    resolve to the one drawn on top, which is the one the reader can see.

    Tolerances: 7px around an anchor, 5px along a line — 8px for the two
    axis-parallel kinds (hline, vline), because the tape's autoscale moves a
    level a few px between the frame the reader aimed at and the frame the
    press lands in.
  */
  hitTestAt(x: number, y: number): { index: number; anchor: 0 | 1 | 2 | null } | null {
    const series = this.series;
    if (!series) return null;
    const ANCHOR = 7;
    const BODY = 5;
    const AXIS = 8;

    const pt = (p?: DrawingPoint): [number, number] | null => {
      if (!p) return null;
      const px = this.timeToX(p.time);
      const py = series.priceToCoordinate(p.price);
      return px === null || py === null ? null : [px, py];
    };
    const distSeg = (ax: number, ay: number, bx: number, by: number): number => {
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
      const cx = ax + t * dx;
      const cy = ay + t * dy;
      return Math.hypot(x - cx, y - cy);
    };
    const chart = this.chart;
    const wCss = chart ? chart.timeScale().width() : 4000;

    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i];
      const a1 = pt(d.p1);
      const a2 = pt(d.p2);
      const a3 = pt(d.p3);

      /* Anchors first — but only the kinds that RENDER anchors offer them. */
      if (d.kind !== 'hline' && d.kind !== 'vline') {
        if (a3 && Math.hypot(x - a3[0], y - a3[1]) <= ANCHOR) return { index: i, anchor: 2 };
        if (a2 && Math.hypot(x - a2[0], y - a2[1]) <= ANCHOR) return { index: i, anchor: 1 };
        if (a1 && Math.hypot(x - a1[0], y - a1[1]) <= ANCHOR) return { index: i, anchor: 0 };
      }

      if (d.kind === 'hline') {
        const py = series.priceToCoordinate(d.p1.price);
        if (py !== null && Math.abs(y - py) <= AXIS) return { index: i, anchor: null };
        continue;
      }
      if (d.kind === 'vline') {
        const px = this.timeToX(d.p1.time);
        if (px !== null && Math.abs(x - px) <= AXIS) return { index: i, anchor: null };
        continue;
      }
      if (!a1) continue;

      if (d.kind === 'note') {
        /* The anchor square plus the words' wash. No canvas context here, so
           the wash width is estimated at the mono face's ~6px per character —
           a hit area, not a layout. */
        const tw = (d.text?.length ?? 0) * 6 + 14;
        if (x >= a1[0] - 5 && x <= a1[0] + 5 + tw && Math.abs(y - a1[1]) <= 10) return { index: i, anchor: null };
        continue;
      }
      const p2v = d.p2;
      if (!a2 || !p2v) continue;
      const [x1, y1] = a1;
      const [x2, y2] = a2;

      let hit = false;
      if (d.kind === 'long' || d.kind === 'short') {
        /* The band's own rectangle, from the higher of stop/target to the
           lower — a position is grabbed anywhere on the box it draws. */
        const a3 = d.p3 ? pt(d.p3) : null;
        const ys = [y1, y2, ...(a3 ? [a3[1]] : [])];
        const xa = Math.min(x1, x2), xb = Math.max(x1, x2);
        const ya = Math.min(...ys), yb = Math.max(...ys);
        hit =
          distSeg(xa, ya, xb, ya) <= BODY || distSeg(xa, yb, xb, yb) <= BODY ||
          distSeg(xa, ya, xa, yb) <= BODY || distSeg(xb, ya, xb, yb) <= BODY ||
          distSeg(xa, y1, xb, y1) <= BODY;
      } else if (d.kind === 'rect' || d.kind === 'measure') {
        const xa = Math.min(x1, x2), xb = Math.max(x1, x2);
        const ya = Math.min(y1, y2), yb = Math.max(y1, y2);
        hit =
          distSeg(xa, ya, xb, ya) <= BODY || distSeg(xa, yb, xb, yb) <= BODY ||
          distSeg(xa, ya, xa, yb) <= BODY || distSeg(xb, ya, xb, yb) <= BODY;
      } else if (d.kind === 'ellipse') {
        const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
        const rx = Math.max(1, Math.abs(x2 - x1) / 2), ry = Math.max(1, Math.abs(y2 - y1) / 2);
        const rn = Math.hypot((x - cx) / rx, (y - cy) / ry);
        hit = Math.abs(rn - 1) * Math.min(rx, ry) <= BODY;
      } else if (d.kind === 'ray') {
        const xe = x2 >= x1 ? wCss : 0;
        const ye = x2 !== x1 ? y1 + ((y2 - y1) / (x2 - x1)) * (xe - x1) : y2;
        hit = x2 !== x1 ? distSeg(x1, y1, xe, ye) <= BODY : distSeg(x1, y1, x2, y2) <= BODY;
      } else if (d.kind === 'extend') {
        if (x2 !== x1) {
          const slope = (y2 - y1) / (x2 - x1);
          hit = distSeg(0, y1 - slope * x1, wCss, y1 + slope * (wCss - x1)) <= BODY;
        } else {
          hit = Math.abs(x - x1) <= BODY;
        }
      } else if (d.kind === 'channel') {
        const rayHit = (sy: number): boolean => {
          const xe = x2 >= x1 ? wCss : 0;
          return x2 !== x1
            ? distSeg(x1, sy, xe, sy + ((y2 - y1) / (x2 - x1)) * (xe - x1)) <= BODY
            : distSeg(x1, sy, x2, sy + (y2 - y1)) <= BODY;
        };
        hit = rayHit(y1);
        if (!hit && a3) {
          const baseY = x2 !== x1 ? y1 + ((y2 - y1) / (x2 - x1)) * (a3[0] - x1) : y1;
          hit = rayHit(y1 + (a3[1] - baseY));
        }
      } else if (d.kind === 'curve') {
        if (a3) {
          const cx = 2 * a3[0] - (x1 + x2) / 2;
          const cy = 2 * a3[1] - (y1 + y2) / 2;
          let px = x1, py = y1;
          for (let t = 1; t <= 24 && !hit; t++) {
            const u = t / 24;
            const qx = (1 - u) * (1 - u) * x1 + 2 * (1 - u) * u * cx + u * u * x2;
            const qy = (1 - u) * (1 - u) * y1 + 2 * (1 - u) * u * cy + u * u * y2;
            hit = distSeg(px, py, qx, qy) <= BODY;
            px = qx; py = qy;
          }
        } else {
          hit = distSeg(x1, y1, x2, y2) <= BODY;
        }
      } else if (d.kind === 'fib') {
        const xa = Math.min(x1, x2);
        for (const r of [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]) {
          const py = series.priceToCoordinate(d.p1.price + (p2v.price - d.p1.price) * r);
          if (py !== null && x >= xa - BODY && Math.abs(y - py) <= BODY) { hit = true; break; }
        }
      } else {
        hit = distSeg(x1, y1, x2, y2) <= BODY;
      }
      if (hit) return { index: i, anchor: null };
    }
    return null;
  }
}

// ---- persistence ------------------------------------------------------------

const storageKey = (ticker: string) => `slayer_chart_drawings_${ticker}`;

export function loadDrawings(ticker: string): Drawing[] {
  try {
    const raw = localStorage.getItem(storageKey(ticker));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((d): d is Drawing => {
      if (typeof d !== 'object' || d === null) return false;
      const x = d as Drawing;
      const shape = (KIND_SHAPE as Record<string, { p2: boolean; p3: boolean; text: boolean }>)[x.kind];
      if (!shape) return false;
      if (typeof x.p1?.price !== 'number' || typeof x.p1?.time !== 'number') return false;
      if (shape.p2 && (typeof x.p2?.price !== 'number' || typeof x.p2?.time !== 'number')) return false;
      if (shape.p3 && (typeof x.p3?.price !== 'number' || typeof x.p3?.time !== 'number')) return false;
      /* Trimmed, because a note of pure whitespace is the empty note wearing
         a length. */
      if (shape.text && !(typeof x.text === 'string' && x.text.trim().length > 0)) return false;
      return true;
    });
  } catch {
    return [];
  }
}

export function saveDrawings(ticker: string, drawings: Drawing[]): void {
  try {
    if (drawings.length === 0) localStorage.removeItem(storageKey(ticker));
    else localStorage.setItem(storageKey(ticker), JSON.stringify(drawings));
  } catch {
    /* storage full/blocked — drawings just won't persist */
  }
}
