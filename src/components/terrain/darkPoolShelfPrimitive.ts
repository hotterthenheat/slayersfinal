import type { ISeriesPrimitive, SeriesAttachedParameter, Time, IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import type { DarkPoolLevel, DarkPoolPrint } from '../../types/darkpool';
import { DARK_POOL } from '../gex/palette';
import { CHART_FONT } from '../charts/chartTheme';

/*
==================================================
  SLAYER TERMINAL - OFF-EXCHANGE SHELVES ON THE CANDLES
  (terrain/darkPoolShelfPrimitive.ts)

  A lightweight-charts series primitive that draws each
  session shelf as a horizontal run across the chart at the
  price the size actually crossed.

  Why a primitive and not `createPriceLine`. A price line is
  one fixed weight and one axis pill. This layer needs a
  weight that carries the shelf's notional — six shelves
  ranked by size, not six identical rules — and it needs to
  render them clustered around spot without every one
  claiming an axis label. Six pills stacked on a 60px axis
  is exactly the collision the walls already fight.

  The shape is `GexNodesPrimitive`'s, deliberately: this
  product has one way of drawing an overlay on the candles,
  and a second lifecycle for the same job is how two
  overlays end up disagreeing about pan and zoom.
==================================================
*/

/** Drawing scope from the fancy-canvas target lightweight-charts hands to draw(). */
interface BitmapScope {
  context: CanvasRenderingContext2D;
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
  mediaSize: { width: number; height: number };
}
interface DrawTarget {
  useBitmapCoordinateSpace(cb: (scope: BitmapScope) => void): void;
}

const rgbOf = (hex: string): string => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

/*
  ONE INK: the dark-pool teal, for every shelf regardless of role.

  The first cut coloured shelves by role — green for support, red for
  resistance — on the reasoning that support and resistance are directions and
  this product colours directions. That reasoning is right and the result was
  wrong: the candles are ALREADY red and green, so six full-width red and green
  rules landed on a red and green chart and the reader could not tell a shelf
  from a down bar. Rendered, it read as the chart being broken.

  Teal is what this product paints off-exchange prints with everywhere else, it
  is in the hue budget for exactly that, and it is the one family the candles do
  not use. The ROLE has not been dropped — it rides the caption on the one shelf
  that earns a caption, and the Dark Pool desk carries the full table.
*/
const SHELF_INK = rgbOf(DARK_POOL);

class ShelfRenderer {
  constructor(private source: DarkPoolShelfPrimitive) {}

  draw(target: DrawTarget): void {
    const src = this.source;
    if (!src.enabled || !src.series) return;
    if (src.shelves.length === 0 && src.prints.length === 0) return;
    const series = src.series;

    const chart = src.chart;

    target.useBitmapCoordinateSpace(scope => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const wPx = scope.mediaSize.width * hr;

      /*
        ── THE PRINTS, AT THE TIME THEY CROSSED ──────────────────────────────

        Drawn before the shelf lines and doing most of the work.

        A shelf is a SUMMARY — "$1.2B changed hands around 501.30 today" — and
        drawing only shelves states that as a rule running the full width of the
        session, which claims the level applied at 09:31 as much as at 15:59. It
        did not; a shelf exists because prints landed there, in bursts, at
        particular times. Marking each print where it actually happened lets the
        rule assemble itself out of its own evidence: dense runs where size kept
        coming back, gaps where it stopped.

        `at` is why `DarkPoolPrint` grew a real timestamp. The `time` field is
        HH:MM for display and cannot be placed on an axis.
      */
      if (chart && src.prints.length > 0) {
        const ts = chart.timeScale();
        let pmax = 1;
        for (const p of src.prints) pmax = Math.max(pmax, p.notional);
        for (const print of src.prints) {
          const x = ts.timeToCoordinate(Math.floor(print.at / 1000) as UTCTimestamp);
          if (x === null) continue;
          const y = series.priceToCoordinate(print.price);
          if (y === null) continue;
          const t = Math.sqrt(Math.min(1, print.notional / pmax));
          // A tick, not a dot: height carries the size and width stays constant,
          // so a run of prints at one price reads as a rail rather than a row of
          // circles of different diameters.
          const h = (1 + t * 3.2) * vr;
          ctx.fillStyle = `rgba(${SHELF_INK},${(0.28 + t * 0.5).toFixed(3)})`;
          ctx.fillRect(x * hr - 0.75 * hr, y * vr - h / 2, 1.5 * hr, h);
        }
      }

      let max = 1;
      for (const s of src.shelves) max = Math.max(max, s.notional);

      /*
        Exactly ONE caption, on the session's largest shelf.

        The first cut captioned any shelf above a weight threshold, and on a
        normal session that is most of them: shelves cluster where size crosses,
        so six captions landed inside forty pixels and overprinted into an
        unreadable smear. A caption is for the shelf you would name out loud.
      */
      const headline = src.shelves.length
        ? src.shelves.reduce((a, b) => (b.notional > a.notional ? b : a), src.shelves[0])
        : null;

      ctx.setLineDash([3 * hr, 5 * hr]);
      ctx.lineWidth = Math.max(1, vr);

      for (const shelf of src.shelves) {
        const y = series.priceToCoordinate(shelf.price);
        if (y === null) continue;
        // sqrt, matching the node heatmap: a session's largest shelf is often
        // several times the next one, and linear weighting renders every other
        // shelf as the same hairline.
        const t = Math.sqrt(Math.min(1, shelf.notional / max));
        const yPx = y * vr;

        /*
          A DASHED HAIRLINE, not a filled band.

          The band version was 8px tall at 0.36 alpha with a solid full-width
          rule through it, which on a 700px chart covered the candles it exists
          to give context to. This layer is the floor plan; the candles are the
          read. Weight now separates shelves by opacity alone, which is enough
          to rank them and quiet enough to see through.
        */
        ctx.strokeStyle = `rgba(${SHELF_INK},${(0.16 + t * 0.34).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(0, yPx);
        ctx.lineTo(wPx, yPx);
        ctx.stroke();

        if (shelf === headline) {
          ctx.setLineDash([]);
          ctx.font = `${10 * vr}px ${CHART_FONT}`;
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = `rgba(${SHELF_INK},0.9)`;
          // 12px in, not 6: at 6 the glyphs sat on the pane's own left border
          // and the first letter read as clipped.
          ctx.fillText(`${shelf.role} ${shelf.price.toFixed(2)}`, 12 * hr, yPx - 3 * vr);
          ctx.setLineDash([3 * hr, 5 * hr]);
        }
      }
      ctx.setLineDash([]);
    });
  }
}

class ShelfPaneView {
  private _renderer: ShelfRenderer;
  constructor(source: DarkPoolShelfPrimitive) {
    this._renderer = new ShelfRenderer(source);
  }
  /* Behind the candles. A shelf is context for the tape, not a mark on it —
     drawn on top it hides the very bars a reader is checking it against. */
  zOrder(): 'bottom' {
    return 'bottom';
  }
  renderer(): ShelfRenderer {
    return this._renderer;
  }
}

export class DarkPoolShelfPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<'Candlestick'> | null = null;
  requestUpdate?: () => void;
  shelves: DarkPoolLevel[] = [];
  prints: DarkPoolPrint[] = [];
  enabled = true;
  private _paneViews: ShelfPaneView[];

  constructor() {
    this._paneViews = [new ShelfPaneView(this)];
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

  paneViews(): ShelfPaneView[] {
    return this._paneViews;
  }

  setData(shelves: DarkPoolLevel[], prints: DarkPoolPrint[], enabled: boolean): void {
    this.shelves = shelves;
    this.prints = prints;
    this.enabled = enabled;
    this.requestUpdate?.();
  }
}
