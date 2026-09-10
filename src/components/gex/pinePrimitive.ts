/*
==================================================
  SLAYER TERMINAL - PINE DRAWINGS ON THE TAPE
  (components/gex/pinePrimitive.ts)
==================================================

  A script's `line`, `label`, `box` and `table` objects, painted over the
  candles — and its `bgcolor()` regime bands, painted under them.

  WHY A PRIMITIVE RATHER THAN SERIES. A `plot` is a series and the library
  draws it; these are OBJECTS at arbitrary coordinates — a level extended
  both ways with its price and its held/broken record written beside it, a
  translucent structure box between two majors. None of that is one value
  per bar, so it is painted on the pane's own canvas, the way the reader's
  drawing tools and the session levels already are.

  COORDINATES. The engine works in bar INDEX, because that is what Pine
  hands a script (`bar_index`). Index becomes x through the bars array the
  script was run against, so an object lands on the bar the script meant
  even after a pan; a script may also place one PAST the last bar (the DNF
  labels sit a few bars to the right of price), so an index beyond the
  array is projected forward at the bar spacing rather than dropped.
*/

import type { IChartApi, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, SeriesType, Time } from 'lightweight-charts';
import type { DrawObj, LineObj, TableObj } from '../../data/pine/drawings';
import type { CandleOut } from '../../data/pine/interpreter';

/** One `fill()`, with both plots already resolved to per-bar values. */
export interface PineFill {
  color: string;
  top: (number | null)[];
  bottom: (number | null)[];
}

interface BitmapScope {
  context: CanvasRenderingContext2D;
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
  mediaSize: { width: number; height: number };
}
interface DrawTarget {
  useBitmapCoordinateSpace(cb: (scope: BitmapScope) => void): void;
}

const LABEL_SIZE: Record<string, number> = { tiny: 8, small: 10, normal: 11, large: 14, huge: 18 };
const DASH: Record<string, number[]> = { solid: [], dashed: [6, 4], dotted: [2, 3] };

class PinePaneRenderer {
  constructor(private source: PinePrimitive) {}

  draw(target: DrawTarget): void {
    const src = this.source;
    const series = src.series;
    if (!src.chart || !series) return;
    if (
      src.objects.length === 0 && src.bands.length === 0 &&
      src.fills.length === 0 && src.candles.length === 0 && src.lineFills.length === 0
    ) return;

    target.useBitmapCoordinateSpace(scope => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const W = scope.mediaSize.width * hr;

      const y = (price: number): number | null => {
        const c = series.priceToCoordinate(price);
        return c === null ? null : c * vr;
      };
      const x = (index: number): number | null => {
        const c = src.indexToX(index);
        return c === null ? null : c * hr;
      };

      ctx.save();

      /*
        THE REGIME BANDS GO DOWN FIRST — they are the ground, and everything
        else stands on them. One vertical strip per bar, each spanning to the
        midpoint of its neighbours so adjacent bars of the same colour read
        as one continuous stretch rather than a picket fence.
      */
      if (src.bands.length > 0) {
        const H = scope.mediaSize.height * vr;
        const times = src.barTimes;
        for (let i = 0; i < src.bands.length && i < times.length; i++) {
          const col = src.bands[i];
          if (!col) continue;
          const at = src.indexToX(i);
          if (at === null) continue;
          const prev = i > 0 ? src.indexToX(i - 1) : null;
          const next = i + 1 < times.length ? src.indexToX(i + 1) : null;
          const halfL = prev === null ? (next === null ? 2 : (next - at) / 2) : (at - prev) / 2;
          const halfR = next === null ? halfL : (next - at) / 2;
          const left = (at - halfL) * hr;
          const width = (halfL + halfR) * hr;
          if (left + width < 0 || left > W) continue;
          ctx.fillStyle = col;
          ctx.fillRect(left, 0, Math.max(width, 1), H);
        }
      }

      /*
        `fill()` — THE BAND BETWEEN TWO PLOTS, and it goes down with the
        regime bands rather than over the candles: it is context, and every
        cloud script draws it behind price.

        Painted as one polygon per RUN of bars where both series have a
        value. A gap in either — a warmup bar, an `na` — ends the run, so a
        band never bridges across bars the script had no answer for.
      */
      for (const f of src.fills) {
        ctx.fillStyle = f.color;
        let run: { x: number; a: number; b: number }[] = [];
        const flush = (): void => {
          if (run.length < 2) { run = []; return; }
          ctx.beginPath();
          ctx.moveTo(run[0].x, run[0].a);
          for (let k = 1; k < run.length; k++) ctx.lineTo(run[k].x, run[k].a);
          for (let k = run.length - 1; k >= 0; k--) ctx.lineTo(run[k].x, run[k].b);
          ctx.closePath();
          ctx.fill();
          run = [];
        };
        for (let i = 0; i < f.top.length && i < src.barTimes.length; i++) {
          const ta = f.top[i];
          const tb = f.bottom[i];
          if (ta === null || tb === null || !Number.isFinite(ta) || !Number.isFinite(tb)) { flush(); continue; }
          const px = src.indexToX(i);
          const ya = y(ta);
          const yb = y(tb);
          if (px === null || ya === null || yb === null) { flush(); continue; }
          run.push({ x: px * hr, a: ya, b: yb });
        }
        flush();
      }

      /*
        `linefill` — the band between two LINE OBJECTS, as opposed to `fill`,
        which is between two plots. The lines it names may have been moved by
        a later bar, so they are resolved HERE rather than when the script
        asked, and a line that has since been deleted simply draws nothing.
      */
      if (src.lineFills.length > 0) {
        const byId = new Map<number, LineObj>();
        for (const o of src.objects) if (o.what === 'line') byId.set(o.id, o);
        for (const lf of src.lineFills) {
          const la = byId.get(lf.a);
          const lb = byId.get(lf.b);
          if (!la || !lb) continue;
          const seg = (l: LineObj): { x1: number; y1: number; x2: number; y2: number } | null => {
            const ax = x(l.x1);
            const bx = x(l.x2);
            const ay = y(l.y1);
            const by = y(l.y2);
            if (ax === null || bx === null || ay === null || by === null) return null;
            let px1 = ax, py1 = ay, px2 = bx, py2 = by;
            if (l.extend === 'left' || l.extend === 'both') {
              const t = ax === bx ? 0 : (0 - ax) / (bx - ax);
              px1 = 0;
              py1 = ay + (by - ay) * t;
            }
            if (l.extend === 'right' || l.extend === 'both') {
              const t = ax === bx ? 0 : (W - ax) / (bx - ax);
              px2 = W;
              py2 = ay + (by - ay) * t;
            }
            return { x1: px1, y1: py1, x2: px2, y2: py2 };
          };
          const sa = seg(la);
          const sb = seg(lb);
          if (!sa || !sb) continue;
          ctx.fillStyle = lf.color;
          ctx.beginPath();
          ctx.moveTo(sa.x1, sa.y1);
          ctx.lineTo(sa.x2, sa.y2);
          ctx.lineTo(sb.x2, sb.y2);
          ctx.lineTo(sb.x1, sb.y1);
          ctx.closePath();
          ctx.fill();
        }
      }

      /*
        `plotcandle` / `plotbar` — a script's OWN bars, which is how every
        Heikin-Ashi and renko overlay is written. Body plus wick for
        plotcandle, a stick with two ticks for plotbar; a bar the script left
        `na` draws nothing rather than collapsing to a line at zero.
      */
      for (const cs of src.candles) {
        const spacing = (() => {
          if (src.barTimes.length < 2) return 6 * hr;
          const a = src.indexToX(src.barTimes.length - 2);
          const b = src.indexToX(src.barTimes.length - 1);
          return a === null || b === null ? 6 * hr : Math.abs(b - a) * hr;
        })();
        const halfBody = Math.max(1, spacing * 0.32);
        for (let i = 0; i < cs.close.length && i < src.barTimes.length; i++) {
          const o = cs.open[i];
          const h = cs.high[i];
          const l = cs.low[i];
          const c = cs.close[i];
          if (o === null || h === null || l === null || c === null) continue;
          const px = src.indexToX(i);
          if (px === null) continue;
          const cx = px * hr;
          if (cx < -spacing || cx > W + spacing) continue;
          const yo = y(o);
          const yh = y(h);
          const yl = y(l);
          const yc = y(c);
          if (yo === null || yh === null || yl === null || yc === null) continue;
          const ink = cs.colors[i] ?? (c >= o ? '#26a69a' : '#ef5350');
          ctx.strokeStyle = ink;
          ctx.fillStyle = ink;
          ctx.lineWidth = Math.max(1, hr);
          ctx.beginPath();
          ctx.moveTo(cx, yh);
          ctx.lineTo(cx, yl);
          ctx.stroke();
          if (cs.hollow) {
            /* plotbar: an open tick left, a close tick right. */
            ctx.beginPath();
            ctx.moveTo(cx - halfBody, yo);
            ctx.lineTo(cx, yo);
            ctx.moveTo(cx, yc);
            ctx.lineTo(cx + halfBody, yc);
            ctx.stroke();
          } else {
            const top = Math.min(yo, yc);
            const height = Math.max(1, Math.abs(yc - yo));
            ctx.fillRect(cx - halfBody, top, halfBody * 2, height);
          }
        }
      }

      for (const o of src.objects) {
        if (o.what === 'box') {
          const x1 = x(o.left);
          const x2 = x(o.right);
          const y1 = y(o.top);
          const y2 = y(o.bottom);
          if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
          /* An extended box is the ACTIVE STRUCTURE — a wash across the
             whole pane between two majors, not a rectangle around a span. */
          const left = o.extend === 'both' || o.extend === 'left' ? 0 : Math.min(x1, x2);
          const right = o.extend === 'both' || o.extend === 'right' ? W : Math.max(x1, x2);
          ctx.fillStyle = o.bgColor;
          ctx.fillRect(left, Math.min(y1, y2), right - left, Math.abs(y2 - y1));
          if (o.borderWidth > 0 && o.borderColor !== 'transparent') {
            ctx.strokeStyle = o.borderColor;
            ctx.lineWidth = o.borderWidth * hr;
            ctx.strokeRect(left, Math.min(y1, y2), right - left, Math.abs(y2 - y1));
          }
          continue;
        }

        if (o.what === 'line') {
          const x1 = x(o.x1);
          const x2 = x(o.x2);
          const y1 = y(o.y1);
          const y2 = y(o.y2);
          if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
          let ax = x1;
          let bx = x2;
          let ay = y1;
          let by = y2;
          /* Extending follows the line's own slope, so a sloped line
             projected left or right stays on its own trajectory rather than
             flattening — the levels are horizontal, but nothing here
             assumes it. */
          if (o.extend === 'left' || o.extend === 'both') {
            const t = x1 === x2 ? 0 : (0 - x1) / (x2 - x1);
            ax = 0;
            ay = y1 + (y2 - y1) * t;
          }
          if (o.extend === 'right' || o.extend === 'both') {
            const t = x1 === x2 ? 0 : (W - x1) / (x2 - x1);
            bx = W;
            by = y1 + (y2 - y1) * t;
          }
          ctx.beginPath();
          ctx.strokeStyle = o.color;
          ctx.lineWidth = Math.max(1, o.width) * hr;
          ctx.setLineDash((DASH[o.style] ?? []).map(d => d * hr));
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.setLineDash([]);
          continue;
        }

        if (o.what === 'table') {
          drawTable(ctx, o, scope.mediaSize, hr);
          continue;
        }

        const lx = x(o.x);
        const ly = y(o.y);
        if (lx === null || ly === null || !o.text) continue;
        const size = (LABEL_SIZE[o.size] ?? 11) * hr;
        ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.textBaseline = 'middle';
        const pad = 3 * hr;
        const w = ctx.measureText(o.text).width;
        /* `label.style_none` is the words alone — which is how the levels
           write their price and their held record onto the field. Any other
           style gets the chip Pine draws behind them. */
        const chip = o.style !== 'label_none' && o.color !== 'transparent';
        const want = o.style === 'label_left' ? lx : o.style === 'label_right' ? lx - w - pad * 2 : lx - w / 2;
        /*
          KEPT INSIDE THE PANE.

          A levels script parks its labels a few bars PAST the last one —
          TradingView leaves a right margin and they sit in it. This chart
          runs bars to the edge, so a label placed out there loses its
          right-hand half, and its right-hand half is the price and the
          held/broken record: the whole reason it exists. Pulled back only
          as far as needed, so a label with room stays exactly where the
          script put it.
        */
        const left = Math.max(pad, Math.min(want, W - w - pad));
        if (chip) {
          ctx.fillStyle = o.color;
          ctx.fillRect(left - pad, ly - size * 0.75, w + pad * 2, size * 1.5);
        }
        ctx.fillStyle = o.textcolor;
        ctx.textAlign = 'left';
        ctx.fillText(o.text, chip ? left : left, ly);
      }
      ctx.restore();
    });
  }
}

/*
  THE DASHBOARD.

  Pinned to one of nine corners of the PANE rather than to a bar, so it is
  laid out from the edges in and never touches the time scale. Column widths
  come from the widest cell in each column — Pine sizes tables to their
  content unless a width is given, and a fixed grid would clip the one row
  that matters.
*/
function drawTable(
  ctx: CanvasRenderingContext2D,
  t: TableObj,
  media: { width: number; height: number },
  hr: number
): void {
  const padX = 6 * hr;
  const padY = 3 * hr;
  const sizeOf = (s: string): number => (LABEL_SIZE[s] ?? 11) * hr;

  const colW = new Array<number>(t.cols).fill(0);
  const rowH = new Array<number>(t.rows).fill(0);
  for (let r = 0; r < t.rows; r++) {
    for (let c = 0; c < t.cols; c++) {
      const cell = t.cells[r][c];
      if (!cell || !cell.text) continue;
      const fs = sizeOf(cell.textSize);
      ctx.font = `${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      colW[c] = Math.max(colW[c], ctx.measureText(cell.text).width + padX * 2);
      rowH[r] = Math.max(rowH[r], fs * 1.6 + padY);
    }
  }
  const W = colW.reduce((a, b) => a + b, 0);
  const H = rowH.reduce((a, b) => a + b, 0);
  if (W <= 0 || H <= 0) return;

  const margin = 8 * hr;
  /*
    THE PANE HAS ITS OWN FURNITURE AT BOTH ENDS, and a table parked at
    `margin` lands underneath it. The desk's floating toolbar runs along the
    bottom — that is where the DNF dashboard's last row went — and the
    ticker header runs along the top, which is where an `OI Build` table
    went. Both edges get the clearance they need; the sides do not.
  */
  const topMargin = 34 * hr;
  const bottomMargin = 40 * hr;
  const paneW = media.width * hr;
  const paneH = media.height * hr;
  const [vert, horiz] = t.position.split('_');
  const x0 = horiz === 'left' ? margin : horiz === 'center' ? (paneW - W) / 2 : paneW - W - margin;
  const y0 =
    vert === 'top' ? topMargin
      : vert === 'middle' ? (paneH - H) / 2
        : Math.max(topMargin, paneH - H - bottomMargin);

  ctx.fillStyle = t.bgColor;
  ctx.fillRect(x0, y0, W, H);

  let y = y0;
  for (let r = 0; r < t.rows; r++) {
    let x = x0;
    for (let c = 0; c < t.cols; c++) {
      const cell = t.cells[r][c];
      const w = colW[c];
      const h = rowH[r];
      if (cell) {
        if (cell.bgColor && cell.bgColor !== 'transparent') {
          ctx.fillStyle = cell.bgColor;
          ctx.fillRect(x, y, w, h);
        }
        if (cell.text) {
          const fs = sizeOf(cell.textSize);
          ctx.font = `${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`;
          ctx.fillStyle = cell.textColor;
          ctx.textBaseline = 'middle';
          ctx.textAlign = cell.halign === 'left' ? 'left' : cell.halign === 'right' ? 'right' : 'center';
          const tx = cell.halign === 'left' ? x + padX : cell.halign === 'right' ? x + w - padX : x + w / 2;
          ctx.fillText(cell.text, tx, y + h / 2);
        }
      }
      if (t.borderWidth > 0 && t.borderColor !== 'transparent') {
        ctx.strokeStyle = t.borderColor;
        ctx.lineWidth = t.borderWidth * hr;
        ctx.strokeRect(x, y, w, h);
      }
      x += w;
    }
    y += rowH[r];
  }
  if (t.frameWidth > 0 && t.frameColor !== 'transparent') {
    ctx.strokeStyle = t.frameColor;
    ctx.lineWidth = t.frameWidth * hr;
    ctx.strokeRect(x0, y0, W, H);
  }
  ctx.textAlign = 'left';
}

class PinePaneView {
  private _renderer: PinePaneRenderer;
  constructor(source: PinePrimitive) {
    this._renderer = new PinePaneRenderer(source);
  }
  zOrder(): 'top' {
    return 'top';
  }
  renderer(): PinePaneRenderer {
    return this._renderer;
  }
}

export class PinePrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  /* ANY series, not the candles specifically. All this needs of its host is
     `priceToCoordinate`, which every series type has — and a script that
     asked for its OWN pane hangs one of these off a line series down there,
     where there are no candles to attach to. */
  series: ISeriesApi<SeriesType> | null = null;
  requestUpdate?: () => void;
  objects: DrawObj[] = [];
  /** One colour per bar from `bgcolor()`; null where nothing was painted. */
  bands: (string | null)[] = [];
  /** `fill(a, b, …)` — the band between two plots, already resolved to values. */
  fills: PineFill[] = [];
  /** `plotcandle` / `plotbar` — bars a script drew itself. */
  candles: CandleOut[] = [];
  /** `linefill.new` — a band between two LINE objects, by their ids. */
  lineFills: { a: number; b: number; color: string }[] = [];
  /** Bar times of the aggregation the scripts were run against. */
  barTimes: number[] = [];
  private _paneViews: PinePaneView[];

  constructor() {
    this._paneViews = [new PinePaneView(this)];
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<SeriesType>;
    this.requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = undefined;
  }

  updateAllViews(): void {}

  paneViews(): PinePaneView[] {
    return this._paneViews;
  }

  set(
    objects: DrawObj[],
    barTimes: number[],
    bands: (string | null)[] = [],
    fills: PineFill[] = [],
    candles: CandleOut[] = [],
    lineFills: { a: number; b: number; color: string }[] = []
  ): void {
    this.objects = objects;
    this.barTimes = barTimes;
    this.bands = bands;
    this.fills = fills;
    this.candles = candles;
    this.lineFills = lineFills;
    this.requestUpdate?.();
  }

  /**
   * Bar index to an x coordinate.
   *
   * An index PAST the last bar is legitimate — Pine scripts park their
   * labels a few bars to the right of price, which is exactly what the DNF
   * levels do — so it is projected forward at the current bar spacing
   * rather than returned as null and dropped.
   */
  indexToX(index: number): number | null {
    const ts = this.barTimes;
    const chart = this.chart;
    if (!chart || ts.length === 0) return null;
    const scale = chart.timeScale();
    const clamped = Math.max(0, Math.min(ts.length - 1, Math.trunc(index)));
    const at = scale.timeToCoordinate(ts[clamped] as Time);
    if (at === null) return null;
    if (index <= ts.length - 1) return at;
    /* Past the last bar: step forward at the spacing of the final two. */
    if (ts.length < 2) return at;
    const prev = scale.timeToCoordinate(ts[ts.length - 2] as Time);
    if (prev === null) return at;
    return at + (at - prev) * (index - (ts.length - 1));
  }
}
