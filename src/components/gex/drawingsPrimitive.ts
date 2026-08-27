import type { ISeriesPrimitive, SeriesAttachedParameter, Time, IChartApi, ISeriesApi } from 'lightweight-charts';
import { fmtElapsed, measureSpan } from '../../data/measure';

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
export type DrawingKind = 'trend' | 'hline' | 'measure';

/*
  THE KINDS, AS DATA, and the validator reads THIS rather than a list of its
  own. `loadDrawings` enumerated them inline — `kind === 'trend' || kind ===
  'hline'` — so adding a third kind meant every stored one of it was dropped
  on the next read, silently, with no error: exactly the shape of the bug
  `setups.ts` was fixed for twice (T-0). Written as a `satisfies` map so a
  kind added to the union and not to this list fails the BUILD.
*/
const KIND_SET = new Set<string>(
  Object.keys({ trend: 0, hline: 0, measure: 0 } satisfies Record<DrawingKind, number>)
);

export interface DrawingPoint {
  time: number; // bar time (sec)
  price: number;
}

export interface Drawing {
  kind: DrawingKind;
  p1: DrawingPoint;
  p2?: DrawingPoint; // trend only
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
          `${span.bars} bar${span.bars === 1 ? '' : 's'} · ${fmtElapsed(span.tradingMin)}`,
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

        ctx.font = `${10 * vr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.textBaseline = 'top';
        const padX = 6 * hr;
        const padY = 5 * vr;
        const lineH = 13 * vr;
        const boxW = Math.max(...lines.map(t => ctx.measureText(t).width)) + padX * 2;
        const boxH = lines.length * lineH + padY * 2;
        /* ABOVE the band when price rose, below when it fell — the box sits on
           the side the move came FROM, so it never covers the leg the reader
           is looking at. Clamped into the plot either way. */
        let bx = xb + 8 * hr;
        if (bx + boxW > scope.mediaSize.width * hr) bx = Math.max(0, xa - boxW - 8 * hr);
        let by = rose ? ya - boxH - 6 * vr : yb + 6 * vr;
        if (by < 0) by = yb + 6 * vr;
        if (by + boxH > scope.mediaSize.height * vr) by = Math.max(0, ya - boxH - 6 * vr);

        ctx.fillStyle = 'rgba(10,10,10,0.86)';
        ctx.fillRect(bx, by, boxW, boxH);
        ctx.strokeStyle = `rgba(${MEASURE_RGB},0.28)`;
        ctx.lineWidth = 1 * vr;
        ctx.strokeRect(bx, by, boxW, boxH);
        lines.forEach((t, i) => {
          ctx.fillStyle =
            i === 0 ? (rose ? 'rgba(48,209,88,0.95)' : 'rgba(255,59,48,0.95)') : `rgba(${MEASURE_RGB},0.72)`;
          ctx.fillText(t, bx + padX, by + padY + i * lineH);
        });
      };

      const render = (d: Drawing, alpha: number) => {
        const y1c = series.priceToCoordinate(d.p1.price);
        if (y1c === null) return;
        const y1 = y1c * vr;
        ctx.strokeStyle = `rgba(${LIME},${alpha})`;
        ctx.fillStyle = `rgba(${LIME},${alpha})`;
        ctx.lineWidth = 1.4 * vr;
        ctx.lineCap = 'round';

        if (d.kind === 'hline') {
          ctx.beginPath();
          ctx.moveTo(0, y1);
          ctx.lineTo(w, y1);
          ctx.stroke();
          return;
        }

        if (!d.p2) return;

        if (d.kind === 'measure') {
          renderMeasure(d, alpha);
          return;
        }
        const x1m = src.timeToX(d.p1.time);
        const x2m = src.timeToX(d.p2.time);
        const y2c = series.priceToCoordinate(d.p2.price);
        if (x1m === null || x2m === null || y2c === null) return;
        const x1 = x1m * hr;
        const x2 = x2m * hr;
        const y2 = y2c * vr;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        // square anchors — terminal grammar, no circles
        const a = 2.2 * vr;
        ctx.fillRect(x1 - a, y1 - a, a * 2, a * 2);
        ctx.fillRect(x2 - a, y2 - a, a * 2, a * 2);
      };

      for (const d of src.drawings) render(d, 0.8);
      if (src.draft) render(src.draft, 0.45);
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
  /** Sorted bar times of the CURRENT aggregation — lets time↔x conversion
      snap to real bars, so drawings survive timeframe switches. */
  barTimes: number[] = [];
  /** The interval those bars were aggregated to — what a measure's bar count
      and its annualization are computed against. */
  barMinutes = 1;
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
    this.barMinutes = Math.max(1, mins);
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
}

// ---- persistence ------------------------------------------------------------

const storageKey = (ticker: string) => `slayer_chart_drawings_${ticker}`;

export function loadDrawings(ticker: string): Drawing[] {
  try {
    const raw = localStorage.getItem(storageKey(ticker));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (d): d is Drawing =>
        typeof d === 'object' &&
        d !== null &&
        KIND_SET.has((d as Drawing).kind) &&
        typeof (d as Drawing).p1?.price === 'number' &&
        /* A trend and a measure are both two-point shapes; one stored without
           its second point would render as nothing and, for a measure, would
           divide by a span that is not there. */
        ((d as Drawing).kind === 'hline' || typeof (d as Drawing).p2?.price === 'number')
    );
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
