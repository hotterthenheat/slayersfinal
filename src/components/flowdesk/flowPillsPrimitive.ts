import type { ISeriesPrimitive, SeriesAttachedParameter, Time, IChartApi, ISeriesApi } from 'lightweight-charts';
import type { FlowSweep } from '../../data/flowSweeps';

/*
  Lightweight Charts custom series primitive that pins big options-sweep prints
  to the candles as labelled pills — "$1.5M Call Sweep" (green, above the bar) /
  "$995K Put Sweep" (red, below). Anchored via timeToCoordinate + priceToCoordinate
  so they track pan/zoom. zOrder 'top' keeps them above price and the heat field.
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

const CALL: [number, number, number] = [48, 209, 88];
const PUT: [number, number, number] = [255, 59, 48];

const fmtPrem = (n: number): string =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`;

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

class PillPaneRenderer {
  constructor(private source: FlowPillsPrimitive) {}

  draw(target: DrawTarget): void {
    const src = this.source;
    if (!src.enabled || !src.chart || !src.series || src.sweeps.length === 0) return;
    const series = src.series;
    const ts = src.chart.timeScale();

    target.useBitmapCoordinateSpace(scope => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const s = Math.min(hr, vr);
      const wCss = scope.mediaSize.width;
      const hCss = scope.mediaSize.height;

      const fontPx = Math.round(10 * vr);
      ctx.font = `600 ${fontPx}px "JetBrains Mono", monospace`;
      ctx.textBaseline = 'middle';

      const padX = 6 * s;
      const pillH = 17 * vr;
      const gap = 9 * vr; // dot → pill offset
      const radius = 4 * s;

      // draw strongest last so their pills sit on top
      const ordered = [...src.sweeps].sort((a, b) => a.premium - b.premium);
      for (const sw of ordered) {
        const xC = ts.timeToCoordinate(sw.time as Time);
        const yC = series.priceToCoordinate(sw.price);
        if (xC === null || yC === null) continue;
        if (xC < -40 || xC > wCss + 40) continue;

        const call = sw.side === 'C';
        const [r, g, b] = call ? CALL : PUT;
        const label = `${fmtPrem(sw.premium)} ${call ? 'Call' : 'Put'} Sweep`;
        const tw = ctx.measureText(label).width;
        const pillW = tw + padX * 2;

        const dotX = xC * hr;
        const dotY = yC * vr;

        // pill above for calls, below for puts; clamp horizontally on-screen
        let px = dotX - pillW / 2;
        px = Math.max(4 * hr, Math.min(wCss * hr - pillW - 4 * hr, px));
        let py = call ? dotY - gap - pillH : dotY + gap;
        py = Math.max(2 * vr, Math.min(hCss * vr - pillH - 2 * vr, py));

        // connector
        ctx.strokeStyle = `rgba(${r},${g},${b},0.55)`;
        ctx.lineWidth = Math.max(1, 1 * s);
        ctx.beginPath();
        ctx.moveTo(dotX, dotY);
        ctx.lineTo(dotX, call ? py + pillH : py);
        ctx.stroke();

        // anchor dot
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 2.2 * s, 0, Math.PI * 2);
        ctx.fill();

        // pill body — dark glass with a coloured hairline border
        roundRect(ctx, px, py, pillW, pillH, radius);
        ctx.fillStyle = 'rgba(10,12,18,0.92)';
        ctx.fill();
        roundRect(ctx, px + 0.5 * s, py + 0.5 * s, pillW - s, pillH - s, radius);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.85)`;
        ctx.lineWidth = Math.max(1, 1 * s);
        ctx.stroke();

        // label
        ctx.fillStyle = call ? '#8ff0b4' : '#ff9a90';
        ctx.textAlign = 'left';
        ctx.fillText(label, px + padX, py + pillH / 2 + 0.5 * vr);
      }
    });
  }
}

class PillPaneView {
  private _renderer: PillPaneRenderer;
  constructor(source: FlowPillsPrimitive) {
    this._renderer = new PillPaneRenderer(source);
  }
  zOrder(): 'top' {
    return 'top';
  }
  renderer(): PillPaneRenderer {
    return this._renderer;
  }
}

export class FlowPillsPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<'Candlestick'> | null = null;
  requestUpdate?: () => void;
  sweeps: FlowSweep[] = [];
  enabled = true;
  private _paneViews: PillPaneView[];

  constructor() {
    this._paneViews = [new PillPaneView(this)];
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

  paneViews(): PillPaneView[] {
    return this._paneViews;
  }

  setData(sweeps: FlowSweep[], enabled: boolean): void {
    this.sweeps = sweeps;
    this.enabled = enabled;
    this.requestUpdate?.();
  }
}
