import type { ISeriesPrimitive, SeriesAttachedParameter, Time, IChartApi, ISeriesApi } from 'lightweight-charts';
import type { LiquidityField } from '../../data/liquidityField';

/*
  Lightweight Charts custom series primitive that paints the resting-liquidity
  FIELD as a horizontal heat gradient behind the candles. The field is a function
  of PRICE only (a liquidity profile), so every row spans the full chart width at
  its price — anchored via series.priceToCoordinate, recomputed every draw so it
  tracks pan/zoom/autoscale. zOrder 'bottom' keeps it under price.

  The price scale is linear, so row→y is affine: we anchor the two ends and
  interpolate, which keeps the bands seamless without 240 priceToCoordinate calls.
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

class HeatPaneRenderer {
  constructor(private source: LiquidityHeatmapPrimitive) {}

  draw(target: DrawTarget): void {
    const src = this.source;
    const field = src.field;
    if (!src.enabled || !src.series || !field || field.rows < 2) return;
    const series = src.series;
    const lut = src.lut;

    // Anchor the field's price extent to screen coordinates. Linear scale ⇒ the
    // row→y map is affine between these two ends.
    const yLo = series.priceToCoordinate(field.priceMin); // low price → large y
    const yHi = series.priceToCoordinate(field.priceMax); // high price → small y
    if (yLo === null || yHi === null) return;

    const rows = field.rows;
    const intensity = field.intensity;

    target.useBitmapCoordinateSpace(scope => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const wPx = scope.mediaSize.width * hr;

      // css-px y for a given row (row 0 = priceMin = yLo, row rows-1 = yHi)
      const yOf = (r: number) => yLo + (yHi - yLo) * (r / (rows - 1));
      const rowHcss = Math.abs((yHi - yLo) / (rows - 1));
      const hPx = rowHcss * vr + 1; // +1 device-px overlap so bands never seam

      for (let r = 0; r < rows; r++) {
        const t = intensity[r];
        if (t <= 0.008) continue; // skip near-empty rows — let the inset show
        const li = (Math.min(255, (t * 255) | 0)) * 3;
        // colour rises silver-steel; alpha rises with density so shelves glow and
        // faint rows stay a whisper over the grid
        const a = 0.05 + t * 0.6;
        ctx.fillStyle = `rgba(${lut[li]},${lut[li + 1]},${lut[li + 2]},${a.toFixed(3)})`;
        ctx.fillRect(0, (yOf(r) - rowHcss / 2) * vr, wPx, hPx);
      }
    });
  }
}

class HeatPaneView {
  private _renderer: HeatPaneRenderer;
  constructor(source: LiquidityHeatmapPrimitive) {
    this._renderer = new HeatPaneRenderer(source);
  }
  zOrder(): 'bottom' {
    return 'bottom';
  }
  renderer(): HeatPaneRenderer {
    return this._renderer;
  }
}

export class LiquidityHeatmapPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<'Candlestick'> | null = null;
  requestUpdate?: () => void;
  field: LiquidityField | null = null;
  lut: Uint8ClampedArray;
  enabled = true;
  private _paneViews: HeatPaneView[];

  constructor(lut: Uint8ClampedArray) {
    this.lut = lut;
    this._paneViews = [new HeatPaneView(this)];
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

  paneViews(): HeatPaneView[] {
    return this._paneViews;
  }

  setData(field: LiquidityField | null, enabled: boolean): void {
    this.field = field;
    this.enabled = enabled;
    this.requestUpdate?.();
  }
}
