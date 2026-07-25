import type { ISeriesPrimitive, SeriesAttachedParameter, Time, IChartApi, ISeriesApi } from 'lightweight-charts';
import type { LiquidityBook } from '../../data/liquidityField';

/*
  Lightweight Charts custom series primitive that paints the TIME x PRICE
  liquidity book behind the candles — the Bookmap read: horizontal shelves that
  brighten, dim, get pulled and get eaten as the session moves. The whole book
  is baked once per data revision into a cols x rows RGBA canvas (one pixel per
  heat cell), and each frame the visible sub-rect is stretched onto the pane.

  Mapping: the book's columns are uniform in BAR INDEX, and lightweight-charts
  lays bars out uniformly in logical space, so x is affine in logical index —
  anchor it on getVisibleLogicalRange() (from → x=0, to → x=width). Price is on
  a linear scale, so y is anchored with priceToCoordinate at the book's price
  extents. zOrder 'bottom' keeps it under the candles.
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
    const book = src.book;
    const baked = src.baked;
    if (!src.enabled || !src.series || !src.chart || !book || !baked || book.rows < 2 || book.cols < 1) return;
    const series = src.series;

    const yLo = series.priceToCoordinate(book.priceMin); // low price → large y (bottom)
    const yHi = series.priceToCoordinate(book.priceMax); // high price → small y (top)
    if (yLo === null || yHi === null) return;

    const range = src.chart.timeScale().getVisibleLogicalRange();
    if (!range || !(range.to > range.from)) return;

    target.useBitmapCoordinateSpace(scope => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const width = scope.mediaSize.width;
      const top = yHi * vr;
      const height = (yLo - yHi) * vr;
      if (height <= 0) return;

      // logical → media-x: the visible logical range spans the pane exactly
      const perLogical = width / (range.to - range.from);
      const xOf = (logical: number) => (logical - range.from) * perLogical;

      // visible column window (half a bar of slack keeps edges seamless)
      const colOfLogical = (l: number) => (l - (book.firstBar - 0.5)) / book.barsPerCol;
      let c0 = Math.floor(colOfLogical(range.from)) - 1;
      let c1 = Math.ceil(colOfLogical(range.to)) + 1;
      if (c1 < 0 || c0 > book.cols - 1) return;
      c0 = Math.max(0, c0);
      c1 = Math.min(book.cols - 1, c1);

      const x0 = xOf(book.firstBar - 0.5 + c0 * book.barsPerCol) * hr;
      const x1 = xOf(book.firstBar - 0.5 + (c1 + 1) * book.barsPerCol) * hr;
      if (!(x1 > x0)) return;

      const prev = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(baked, c0, 0, c1 - c0 + 1, book.rows, x0, top, x1 - x0, height);
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
  book: LiquidityBook | null = null;
  enabled = true;
  /** cols x rows RGBA canvas — one pixel per heat cell, row 0 = high price */
  baked: HTMLCanvasElement | null = null;
  private _lut: Uint8ClampedArray;
  private _bctx: CanvasRenderingContext2D | null = null;
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

  private bake(book: LiquidityBook): void {
    const { rows, cols } = book;
    if (!this.baked || this.baked.width !== cols || this.baked.height !== rows) {
      this.baked = document.createElement('canvas');
      this.baked.width = cols;
      this.baked.height = rows;
      this._bctx = this.baked.getContext('2d');
      this._img = this._bctx ? this._bctx.createImageData(cols, rows) : null;
    }
    if (!this._bctx || !this._img) return;
    const lut = this._lut;
    const d = this._img.data;
    for (let c = 0; c < cols; c++) {
      const base = c * rows;
      for (let r = 0; r < rows; r++) {
        const t = book.intensity[base + r];
        // Glow only where liquidity actually rests — near-zero cells contribute
        // nothing, so shelves read as bold bands over a dark tape, and the
        // pulled/eaten stretches genuinely go dark.
        const a = t <= 0.04 ? 0 : Math.min(1, Math.pow(t, 0.9) * 0.8);
        const li = Math.min(255, (t * 255) | 0) * 3;
        const p = ((rows - 1 - r) * cols + c) * 4; // image row 0 = top = high price
        d[p] = lut[li];
        d[p + 1] = lut[li + 1];
        d[p + 2] = lut[li + 2];
        d[p + 3] = (a * 255) | 0;
      }
    }
    this._bctx.putImageData(this._img, 0, 0);
  }

  setData(book: LiquidityBook | null, enabled: boolean): void {
    this.book = book;
    this.enabled = enabled;
    if (book) this.bake(book);
    this.requestUpdate?.();
  }
}
