import type { ISeriesPrimitive, SeriesAttachedParameter, Time, IChartApi, ISeriesApi } from 'lightweight-charts';
import type { LiquidityField } from '../../data/liquidityField';

/*
  Lightweight Charts custom series primitive that paints the resting-liquidity
  FIELD as a soft horizontal glow behind the candles. The field is a function of
  PRICE only (a liquidity profile), so it's baked once into a 1×rows RGBA strip
  (colour + alpha per price row) and, each frame, stretched vertically to the
  field's on-screen price extent with smoothing on — buttery bands, no per-row
  seams, no time-axis shear. zOrder 'bottom' keeps it under price.

  The price scale is linear, so the row→y map is affine: anchor the two ends via
  priceToCoordinate and stretch between them.
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
    const strip = src.strip;
    if (!src.enabled || !src.series || !field || !strip || field.rows < 2) return;
    const series = src.series;

    const yLo = series.priceToCoordinate(field.priceMin); // low price → large y (bottom)
    const yHi = series.priceToCoordinate(field.priceMax); // high price → small y (top)
    if (yLo === null || yHi === null) return;

    target.useBitmapCoordinateSpace(scope => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const wPx = scope.mediaSize.width * hr;
      const top = yHi * vr;
      const height = (yLo - yHi) * vr;
      if (height <= 0) return;
      const prev = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(strip, 0, 0, 1, field.rows, 0, top, wPx, height);
      ctx.imageSmoothingEnabled = prev;
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
  enabled = true;
  /** 1×rows RGBA strip: colour + alpha per price row, top = high price */
  strip: HTMLCanvasElement | null = null;
  private _lut: Uint8ClampedArray;
  private _sctx: CanvasRenderingContext2D | null = null;
  private _img: ImageData | null = null;
  private _paneViews: HeatPaneView[];

  constructor(lut: Uint8ClampedArray) {
    this._lut = lut;
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

  private bakeStrip(field: LiquidityField): void {
    const rows = field.rows;
    if (!this.strip || this.strip.height !== rows) {
      this.strip = document.createElement('canvas');
      this.strip.width = 1;
      this.strip.height = rows;
      this._sctx = this.strip.getContext('2d');
      this._img = this._sctx ? this._sctx.createImageData(1, rows) : null;
    }
    if (!this._sctx || !this._img) return;
    const lut = this._lut;
    const d = this._img.data;
    for (let r = 0; r < rows; r++) {
      const t = field.intensity[r];
      // Glow only at real shelves — near-zero rows contribute nothing, so the
      // field reads as bold, distinct bands instead of a wash. Peak alpha is high
      // so the strongest shelves read as solid translucent zones, like a
      // dark-pool liquidity heatmap.
      const a = t <= 0.05 ? 0 : Math.min(1, Math.pow(t, 0.85) * 0.82);
      const li = Math.min(255, (t * 255) | 0) * 3;
      const p = (rows - 1 - r) * 4; // image row 0 = top = high price
      d[p] = lut[li];
      d[p + 1] = lut[li + 1];
      d[p + 2] = lut[li + 2];
      d[p + 3] = (a * 255) | 0;
    }
    this._sctx.putImageData(this._img, 0, 0);
  }

  setData(field: LiquidityField | null, enabled: boolean): void {
    this.field = field;
    this.enabled = enabled;
    if (field) this.bakeStrip(field);
    this.requestUpdate?.();
  }
}
