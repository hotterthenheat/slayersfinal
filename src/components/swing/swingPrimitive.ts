import type { ISeriesPrimitive, SeriesAttachedParameter, Time, IChartApi, ISeriesApi } from 'lightweight-charts';
import type { SwingModel } from '../../data/swingModel';

/*
  Custom series primitive for the Swing Map: draws the swing read a trader marks
  by hand — support / resistance ZONES behind the candles (zOrder 'bottom'), and
  over the top (zOrder 'top') the trend rail and a measured-move projection arrow
  with its percent target. All anchored via time/price coordinates so they track
  pan / zoom.
*/

interface BitmapScope {
  context: CanvasRenderingContext2D;
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
  mediaSize: { width: number; height: number };
}
interface DrawTarget {
  useBitmapCoordinateSpace(cb: (scope: BitmapScope) => void): void;
}

const SUPPORT = '48,209,88'; // green
const RESIST = '255,59,48'; // red
const TREND = '#E0B84E'; // gold rail
const ARROW = '#7DD3FC'; // baby-blue measured move (house flip colour)

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const fmtPct = (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;

/** Zones — translucent price bands behind the candles, each with a mid line. */
class ZonesRenderer {
  constructor(private source: SwingPrimitive) {}
  draw(target: DrawTarget): void {
    const src = this.source;
    const m = src.model;
    if (!src.enabled || !src.series || !m) return;
    const series = src.series;
    target.useBitmapCoordinateSpace(scope => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const wPx = scope.mediaSize.width * hr;
      for (const z of [m.support, m.resistance]) {
        const yHi = series.priceToCoordinate(z.hi);
        const yLo = series.priceToCoordinate(z.lo);
        const yMid = series.priceToCoordinate(z.mid);
        if (yHi === null || yLo === null) continue;
        const rgb = z.kind === 'support' ? SUPPORT : RESIST;
        ctx.fillStyle = `rgba(${rgb},0.09)`;
        ctx.fillRect(0, yHi * vr, wPx, (yLo - yHi) * vr);
        if (yMid !== null) {
          ctx.strokeStyle = `rgba(${rgb},0.85)`;
          ctx.lineWidth = Math.max(1, 1 * Math.min(hr, vr));
          ctx.beginPath();
          ctx.moveTo(0, yMid * vr);
          ctx.lineTo(wPx, yMid * vr);
          ctx.stroke();
        }
      }
    });
  }
}

/** Overlay — trend rail, projection arrow and the percent pills, over the candles. */
class OverlayRenderer {
  constructor(private source: SwingPrimitive) {}
  draw(target: DrawTarget): void {
    const src = this.source;
    const m = src.model;
    if (!src.enabled || !src.chart || !src.series || !m) return;
    const series = src.series;
    const ts = src.chart.timeScale();
    target.useBitmapCoordinateSpace(scope => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const s = Math.min(hr, vr);

      // ---- trend rail (extended to the right edge) ----
      const x1 = ts.timeToCoordinate(m.trend.t1 as Time);
      const x2 = ts.timeToCoordinate(m.trend.t2 as Time);
      const y1 = series.priceToCoordinate(m.trend.p1);
      const y2 = series.priceToCoordinate(m.trend.p2);
      if (x1 !== null && x2 !== null && y1 !== null && y2 !== null && x2 !== x1) {
        const slope = (y2 - y1) / (x2 - x1);
        const xEndCss = scope.mediaSize.width;
        const yEndCss = y2 + slope * (xEndCss - x2);
        ctx.strokeStyle = TREND;
        ctx.lineWidth = Math.max(1, 1.4 * s);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x1 * hr, y1 * vr);
        ctx.lineTo(xEndCss * hr, yEndCss * vr);
        ctx.stroke();
      }

      // ---- measured-move projection arrow ----
      const px = ts.timeToCoordinate(m.projection.time as Time);
      const yFrom = series.priceToCoordinate(m.projection.from);
      const yTo = series.priceToCoordinate(m.projection.to);
      if (px !== null && yFrom !== null && yTo !== null) {
        const x = px * hr;
        const yf = yFrom * vr;
        const yt = yTo * vr;
        ctx.strokeStyle = ARROW;
        ctx.fillStyle = ARROW;
        ctx.lineWidth = Math.max(1, 1.6 * s);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x, yf);
        ctx.lineTo(x, yt);
        ctx.stroke();
        // arrowhead at the target end
        const dir = yt >= yf ? 1 : -1;
        const head = 6 * s;
        ctx.beginPath();
        ctx.moveTo(x, yt);
        ctx.lineTo(x - head, yt - dir * head * 1.4);
        ctx.lineTo(x + head, yt - dir * head * 1.4);
        ctx.closePath();
        ctx.fill();
        // percent pill at the arrow midpoint
        const label = `${fmtPct(m.projection.pct)}`;
        const fontPx = Math.round(10 * vr);
        ctx.font = `600 ${fontPx}px "JetBrains Mono", monospace`;
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(label).width;
        const padX = 6 * s;
        const pillW = tw + padX * 2;
        const pillH = 17 * vr;
        const my = (yf + yt) / 2 - pillH / 2;
        const mx = x + 8 * s;
        roundRect(ctx, mx, my, pillW, pillH, 4 * s);
        ctx.fillStyle = 'rgba(10,14,22,0.92)';
        ctx.fill();
        roundRect(ctx, mx + 0.5 * s, my + 0.5 * s, pillW - s, pillH - s, 4 * s);
        ctx.strokeStyle = ARROW;
        ctx.lineWidth = Math.max(1, s);
        ctx.stroke();
        ctx.fillStyle = ARROW;
        ctx.textAlign = 'left';
        ctx.fillText(label, mx + padX, my + pillH / 2 + 0.5 * vr);
      }

      // ---- zone percent pills, pinned at the left edge ----
      const fontPx = Math.round(10 * vr);
      ctx.font = `600 ${fontPx}px "JetBrains Mono", monospace`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      for (const z of [m.support, m.resistance]) {
        const y = series.priceToCoordinate(z.mid);
        if (y === null) continue;
        const rgb = z.kind === 'support' ? SUPPORT : RESIST;
        const label = fmtPct(z.pct);
        const tw = ctx.measureText(label).width;
        const padX = 5 * s;
        const pillW = tw + padX * 2;
        const pillH = 16 * vr;
        const x = 6 * hr;
        const py = y * vr - pillH / 2;
        roundRect(ctx, x, py, pillW, pillH, 3 * s);
        ctx.fillStyle = `rgba(${rgb},0.16)`;
        ctx.fill();
        ctx.fillStyle = `rgb(${rgb})`;
        ctx.fillText(label, x + padX, py + pillH / 2 + 0.5 * vr);
      }
    });
  }
}

class ZonesView {
  private _r: ZonesRenderer;
  constructor(source: SwingPrimitive) {
    this._r = new ZonesRenderer(source);
  }
  zOrder(): 'bottom' {
    return 'bottom';
  }
  renderer(): ZonesRenderer {
    return this._r;
  }
}
class OverlayView {
  private _r: OverlayRenderer;
  constructor(source: SwingPrimitive) {
    this._r = new OverlayRenderer(source);
  }
  zOrder(): 'top' {
    return 'top';
  }
  renderer(): OverlayRenderer {
    return this._r;
  }
}

export class SwingPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<'Candlestick'> | null = null;
  requestUpdate?: () => void;
  model: SwingModel | null = null;
  enabled = true;
  private _views: (ZonesView | OverlayView)[];

  constructor() {
    this._views = [new ZonesView(this), new OverlayView(this)];
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

  paneViews(): (ZonesView | OverlayView)[] {
    return this._views;
  }

  setData(model: SwingModel | null, enabled: boolean): void {
    this.model = model;
    this.enabled = enabled;
    this.requestUpdate?.();
  }
}
