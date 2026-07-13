import type { ISeriesPrimitive, SeriesAttachedParameter, Time, IChartApi, ISeriesApi } from 'lightweight-charts';
import type { GexSnapshot } from '../../types/market';
import { heatRgb } from './heatmap';

/*
  Lightweight Charts custom series primitive that renders the net-GEX-per-strike
  history as a heatmap on the candles: for every bar-aligned snapshot it draws a
  horizontal dash at each significant strike, sized/colored by |GEX| at that
  moment. Nodes are anchored to absolute price (y) and time (x) — priceToCoordinate
  + timeToCoordinate — so they stay pinned regardless of the candle timeframe.
*/

// Drawing scope from the fancy-canvas target LWC passes to draw()
interface BitmapScope {
  context: CanvasRenderingContext2D;
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
  mediaSize: { width: number; height: number };
}
interface DrawTarget {
  useBitmapCoordinateSpace(cb: (scope: BitmapScope) => void): void;
}

class NodesPaneRenderer {
  constructor(private source: GexNodesPrimitive) {}

  draw(target: DrawTarget): void {
    const src = this.source;
    if (!src.enabled || !src.chart || !src.series || src.snapshots.length === 0) return;
    const series = src.series;
    const ts = src.chart.timeScale();
    const barSpacing = ts.options().barSpacing ?? 6;
    const halfW = Math.max(1.6, barSpacing * 0.42);
    const threshold = src.maxAbs * 0.045;

    target.useBitmapCoordinateSpace(scope => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const wCss = scope.mediaSize.width;

      for (const snap of src.snapshots) {
        const x = ts.timeToCoordinate(snap.time as Time);
        if (x === null || x < -halfW || x > wCss + halfW) continue;
        const cx = x * hr;
        const rx = halfW * hr;

        for (const lvl of snap.levels) {
          const a = Math.abs(lvl.value);
          if (a < threshold) continue;
          const y = series.priceToCoordinate(lvl.strike);
          if (y === null) continue;

          // sqrt scale so mid-size nodes stay visible next to a dominant king
          const t = Math.sqrt(Math.min(1, a / src.maxAbs));
          const [r, g, b] = heatRgb(lvl.value, src.maxAbs);
          const ry = (1.0 + t * 3.8) * vr;
          ctx.fillStyle = `rgba(${r},${g},${b},${(0.22 + t * 0.6).toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(cx, y * vr, rx, ry, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }
}

class NodesPaneView {
  private _renderer: NodesPaneRenderer;
  constructor(source: GexNodesPrimitive) {
    this._renderer = new NodesPaneRenderer(source);
  }
  zOrder(): 'bottom' {
    return 'bottom';
  }
  renderer(): NodesPaneRenderer {
    return this._renderer;
  }
}

export class GexNodesPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<'Candlestick'> | null = null;
  requestUpdate?: () => void;
  snapshots: GexSnapshot[] = [];
  maxAbs = 1;
  enabled = true;
  private _paneViews: NodesPaneView[];

  constructor() {
    this._paneViews = [new NodesPaneView(this)];
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

  paneViews(): NodesPaneView[] {
    return this._paneViews;
  }

  setData(snapshots: GexSnapshot[], maxAbs: number, enabled: boolean): void {
    this.snapshots = snapshots;
    this.maxAbs = maxAbs;
    this.enabled = enabled;
    this.requestUpdate?.();
  }
}
