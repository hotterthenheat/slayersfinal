import type { ISeriesPrimitive, SeriesAttachedParameter, Time, IChartApi, ISeriesApi } from 'lightweight-charts';

/*
  User drawings layer — trendlines and horizontal levels, sketched directly on
  the big chart in draw mode. Anchored in (time, price) space so they survive
  pan/zoom AND timeframe switches; persisted per ticker in localStorage.
  Interface color (lime) — these are the USER's marks, not engine data.
*/

export type DrawingKind = 'trend' | 'hline';

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
        ((d as Drawing).kind === 'trend' || (d as Drawing).kind === 'hline') &&
        typeof (d as Drawing).p1?.price === 'number'
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
