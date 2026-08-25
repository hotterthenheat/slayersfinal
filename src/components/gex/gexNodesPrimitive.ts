import type { ISeriesPrimitive, SeriesAttachedParameter, Time, IChartApi, ISeriesApi } from 'lightweight-charts';
import type { GexSnapshot } from '../../types/market';
import { canvasFont } from '../ui/typeface';

/*
  Exposure nodes — the ORIGINAL trail form, back by request (Noah,
  2026-08-22: "the prev exposure trail we used to have, the same one Skylit
  and a few others had"). For every bar-aligned snapshot, one small bead at
  each strike that carries enough gamma: its thickness and brightness are
  that moment's strength, and it simply isn't drawn when the strike stops
  mattering — so a wall reads as a dotted band that fattens as it builds,
  thins as it drains, and breaks where it died. Beads are anchored to
  absolute price (y) and time (x), so they stay pinned across timeframes.

  WHITE, not red/green (Noah): the trails say WHERE and HOW MUCH; the sign
  lives on the ladder, the map and the levels. Strength lives in alpha and
  height, never in desaturation.

  The level view rides on top: a focused strike's beads wear the focus ink
  (lime, or magenta while it is the king) at full strength, and the rest of
  the field steps back.
*/

/* THE FIELD'S OWN INKS (Noah, 2026-08-22): the house heatmap's steel-gold
   poles — gold = put-dominant / amplifying, steel = call-dominant /
   absorbing — and magenta on the king strike, as everywhere else. Not the
   market red/green: on THIS surface those belong to the candles, and a
   field in the tape's ink can't be told from the tape. The legend above the
   chart teaches the pair. Strength lives in height and alpha, never in
   desaturation. */
const PUT_RGB: readonly [number, number, number] = [245, 197, 66]; // honey gold
const CALL_RGB: readonly [number, number, number] = [226, 234, 244]; // platinum steel
const KING_RGB: readonly [number, number, number] = [234, 0, 255];

/* A dozen strikes per column, steep falloff; below the floor, nothing. The
   ranking happens ONCE, when the data arrives — a frame must never sort. */
const TOP_N = 12;
const MIN_STRENGTH = 0.08;

/** One bead: a strike's strength against the reference, and which side owns it */
interface Bead {
  strike: number;
  t: number;
  /** Sim side-coding: positive = put-dominant (amplifies), negative = call-dominant (absorbs) */
  put: boolean;
}

/** One column of the field, ranked and scaled at load time */
interface Column {
  time: number;
  /** The strikes that draw, strongest first */
  top: Bead[];
  /** Every strike — only consulted for a focused strike outside the top */
  all: Map<number, Bead>;
}

/** The focused level's ink: the focus lime — or the king's magenta while the
    focused strike IS the king. Mirrors palette FOCUS/KING. */
export type FocusInk = 'focus' | 'king';
const INK_RGB: Record<FocusInk, readonly [number, number, number]> = {
  focus: [210, 255, 0],
  king: [234, 0, 255],
};

interface BitmapScope {
  context: CanvasRenderingContext2D;
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
  mediaSize: { width: number; height: number };
}
interface DrawTarget {
  useBitmapCoordinateSpace(cb: (scope: BitmapScope) => void): void;
}

class TrailsPaneRenderer {
  constructor(private source: GexTrailsPrimitive) {}

  draw(target: DrawTarget): void {
    const src = this.source;
    if (!src.enabled || !src.chart || !src.series || src.columns.length === 0) return;
    const series = src.series;
    const ts = src.chart.timeScale();
    const barSpacing = ts.options().barSpacing ?? 6;
    if (src.ref <= 0) return;
    /* WAVEFORMS, NOT DOTS (Noah, 2026-08-22, against Sovereign's close-ups):
       a rail is a ribbon — every bead is as WIDE as its slot, so they touch,
       and the variation is VERTICAL: the ribbon's thickness flickers with
       each moment's strength, like an audio waveform. Weak strikes draw as
       hairline dashes, not specks. The ribbon is translucent and layered (a
       wider, fainter halo under a soft core) so candles show through it. */
    /* Amplitude follows the BAR WIDTH, not a fixed pixel count, so 15m/1h
       ribbons sit in proportion to their candles: the heaviest rail is
       ~60% of a bar tall, a hairline is under a pixel. t^1.6 keeps the
       weak field thin without crushing the mid-rails to nothing. */
    const A_MIN = 0.45;
    const A_MAX = Math.max(3, Math.min(barSpacing * 0.6, 9));
    const focus = src.focusStrike;
    const king = src.kingStrike;
    const lineKeys = src.priceLineKeys;
    const ink = INK_RGB[src.focusInk];
    const inkCss = `rgba(${ink[0]},${ink[1]},${ink[2]},0.95)`;

    target.useBitmapCoordinateSpace(scope => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const wCss = scope.mediaSize.width;
      /* SUB-BAR BEADS (Noah, 2026-08-22: one bead per 30m/1h bar was a row of
         pearls): the field's clock is finer than the bars, so a bar holds
         several beads, each placed at its own time across the bar's width.
         On 1m/5m the slot IS the bar and nothing changes.
         BUDGET: never more columns than the pixels can show — a slot under
         ~3px wide is drawn every 2nd/3rd/nth, so a zoomed-out 1h chart costs
         the same frame as a 1m one (the price-scale drag lagged without it). */
      const barSec = src.barSec;
      const slots = Math.max(1, Math.round(barSec / Math.max(1, src.stepSec)));
      const stride = Math.max(1, Math.ceil(3 / (barSpacing / slots)));
      const drawnSlots = Math.max(1, Math.ceil(slots / stride));
      const rx = (barSpacing / drawnSlots) * 0.54 * hr;
      const halfW = barSpacing * 0.5;

      /* BATCHED: beads are gathered into one path per ink (alpha quantised to
         ~20 steps), then each path is filled once. Thousands of fills became
         a few dozen — the difference between a frame and a stutter. */
      const cores = new Map<string, Path2D>();
      const halos = new Map<string, Path2D>();
      const pathFor = (map: Map<string, Path2D>, key: string) => {
        let p = map.get(key);
        if (!p) map.set(key, (p = new Path2D()));
        return p;
      };
      const yCache = new Map<number, number | null>();
      const yOf = (strike: number) => {
        let y = yCache.get(strike);
        if (y === undefined) {
          y = series.priceToCoordinate(strike);
          yCache.set(strike, y);
        }
        return y;
      };

      // ---- the beads ---------------------------------------------------------
      for (const col of src.columns) {
        // The bead's bar, and where inside it this moment sits
        const bucket = Math.floor(col.time / barSec) * barSec;
        const slot = slots > 1 ? Math.floor(((col.time - bucket) / barSec) * slots) : 0;
        if (slot % stride !== 0) continue;
        const xBar = ts.timeToCoordinate(bucket as Time);
        if (xBar === null || xBar < -halfW || xBar > wCss + halfW) continue;
        const x = slots > 1 ? xBar - halfW + ((slot / stride + 0.5) / drawnSlots) * barSpacing : xBar;
        const cx = x * hr;

        // This moment's field, ranked at load — plus the focused strike at
        // EVERY moment, however faint (its history must have no gaps)
        let beads = col.top;
        if (focus != null && !beads.some(b => b.strike === focus)) {
          const fb = col.all.get(focus);
          if (fb) beads = [...beads, fb];
        }

        for (const bead of beads) {
          const isFocus = focus != null && bead.strike === focus;
          const y = yOf(bead.strike);
          if (y === null) continue;

          // t^1.6 — the amplitude; weak strikes stay hairlines, rails swell
          const t = Math.max(isFocus ? 0.08 : 0, bead.t);
          const s = Math.pow(t, 1.6);
          const ry = (A_MIN + s * (A_MAX - A_MIN)) * vr;
          const yc = y * vr;
          // Translucent on purpose — the tape reads THROUGH the ribbon
          let core = 0.16 + s * 0.5;
          let halo = 0.04 + s * 0.14;
          if (focus != null && !isFocus) {
            core *= 0.3; // the field steps back
            halo *= 0.3;
          }
          // The king's band is magenta, as the king is everywhere; a focused
          // strike's own ink wins (it is magenta too while it IS the king)
          const inkKey = isFocus ? 'f' : king != null && bead.strike === king ? 'k' : bead.put ? 'p' : 'c';

          /* Each bead is its OWN subpath: ellipse() draws a line from the
             path's current point to the ellipse's start, so without the
             moveTo every bead joined the last one and the fills became
             polygons across the whole chart. */
          // The halo: wider and taller, faint — what makes the ribbon soft
          if (t > 0.2) {
            const hx = rx * 1.15;
            const p = pathFor(halos, `${inkKey}|${Math.round(halo * 40)}`);
            p.moveTo(cx + hx, yc);
            p.ellipse(cx, yc, hx, ry * 1.9, 0, 0, Math.PI * 2);
          }
          // The core: a slot-wide bead whose height is this moment's strength
          const p = pathFor(cores, `${inkKey}|${Math.round(core * 20)}`);
          p.moveTo(cx + rx, yc);
          p.ellipse(cx, yc, rx, ry, 0, 0, Math.PI * 2);
        }
      }

      const paint = (map: Map<string, Path2D>, step: number) => {
        for (const [key, path] of map) {
          const [inkKey, q] = key.split('|');
          const rgb = inkKey === 'f' ? ink : inkKey === 'k' ? KING_RGB : inkKey === 'p' ? PUT_RGB : CALL_RGB;
          ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(Number(q) / step).toFixed(3)})`;
          ctx.fill(path);
        }
      };
      paint(halos, 40);
      paint(cores, 20);

      // ---- axis-side strength labels for the heaviest strikes ---------------
      const latest = src.snapshots[src.snapshots.length - 1];
      if (!latest) return;
      const total = latest.levels.reduce((s, l) => s + Math.abs(l.value), 0);
      if (total <= 0) return;

      // Four labels at most — one small sort on one snapshot, not per column
      const top = [...latest.levels]
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, 4)
        .filter(l => Math.abs(l.value) / total >= 0.08);

      ctx.font = canvasFont(Math.round(9.5 * vr));
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const xRight = (wCss - 8) * hr;

      const drawLabel = (lvl: { strike: number; value: number }, color: string) => {
        // A price line already names this strike on a layer above this one.
        if (lineKeys.has(lvl.strike.toFixed(2))) return;
        const y = series.priceToCoordinate(lvl.strike);
        if (y === null) return;
        const pct = Math.round((Math.abs(lvl.value) / total) * 100);
        const strikeLabel = lvl.strike % 1 === 0 ? lvl.strike.toFixed(0) : lvl.strike.toFixed(2);
        const text = `${strikeLabel} · ${pct}%`;
        const yPix = y * vr;

        /* Dark backing pad so the label survives whatever sits behind it.
           CENTRED on yPix, because the text is: textBaseline is 'middle'.
           The old rect ran from yPix - padY to yPix + 12*vr — the `- 6*vr
           + 6*vr` in it cancelled — so the glyphs' top half sat on bare
           canvas and only their bottom half was backed. Visible in the
           /pulse/board capture as half-plated numbers. */
        const w = ctx.measureText(text).width;
        const padX = 4 * hr;
        const padY = 2.5 * vr;
        const halfH = 6 * vr + padY;
        ctx.fillStyle = 'rgba(5,5,5,0.72)';
        ctx.fillRect(xRight - w - padX, yPix - halfH, w + padX * 2, halfH * 2);
        ctx.fillStyle = color;
        ctx.fillText(text, xRight, yPix);
      };

      for (const lvl of top) {
        if (focus != null && lvl.strike === focus) continue; // drawn below, in its own ink
        const rgb = king != null && lvl.strike === king ? KING_RGB : lvl.value >= 0 ? PUT_RGB : CALL_RGB;
        drawLabel(lvl, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${focus != null ? 0.55 : 0.95})`);
      }
      // The focused level is always labelled — its share of the book, in its ink
      if (focus != null) {
        const f = latest.levels.find(l => l.strike === focus);
        if (f) drawLabel(f, inkCss);
      }
    });
  }
}

class TrailsPaneView {
  private _renderer: TrailsPaneRenderer;
  constructor(source: GexTrailsPrimitive) {
    this._renderer = new TrailsPaneRenderer(source);
  }
  zOrder(): 'bottom' {
    return 'bottom';
  }
  renderer(): TrailsPaneRenderer {
    return this._renderer;
  }
}

export class GexTrailsPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<'Candlestick'> | null = null;
  requestUpdate?: () => void;
  snapshots: GexSnapshot[] = [];
  /** The snapshots ranked and scaled once, at load — what draw() reads */
  columns: Column[] = [];
  maxAbs = 1;
  /** Robust strength reference: high percentile of per-moment maxima. Using
      the absolute max instead lets one freak spike crush every other wall. */
  ref = 0;
  enabled = true;
  /** The chart's bar length, seconds — a bead finds its bar by it */
  barSec = 60;
  /** The field's own clock, seconds between snapshots — beads per bar = barSec / stepSec */
  stepSec = 60;
  /** The level view's strike — its beads lead, the field steps back. */
  focusStrike: number | null = null;
  /** Its ink: lime, or magenta while the focused strike is the king. The
      focus never follows the king — the strike you clicked is the strike
      you're watching; the ink reports its standing (Noah, 2026-08-22). */
  focusInk: FocusInk = 'focus';
  /** The book's king strike — its band wears magenta (re-read every scan) */
  kingStrike: number | null = null;
  /** Prices that already carry a chart price line, as toFixed(2) keys.

      The library draws those axis badges on a layer ABOVE this pane, so a
      strength label at the same strike loses every time no matter what it
      paints behind itself — measured on /pulse/board: "187.50 · 18%" with
      its bottom half under PUT WALL · KING, and "420 · 14%" under
      CALL WALL · KING. Two labels for one strike was the defect; the badge
      already names the level, so the label stands down. */
  priceLineKeys: ReadonlySet<string> = new Set();
  private _paneViews: TrailsPaneView[];

  constructor() {
    this._paneViews = [new TrailsPaneView(this)];
  }

  setKing(strike: number | null): void {
    if (this.kingStrike === strike) return;
    this.kingStrike = strike;
    this.requestUpdate?.();
  }

  /** Prices the chart drew a price line at — those strikes skip their label. */
  setPriceLines(prices: number[]): void {
    const next = new Set(prices.filter(Number.isFinite).map(p => p.toFixed(2)));
    if (next.size === this.priceLineKeys.size && [...next].every(k => this.priceLineKeys.has(k))) return;
    this.priceLineKeys = next;
    this.requestUpdate?.();
  }

  setFocus(strike: number | null, ink: FocusInk = 'focus'): void {
    if (this.focusStrike === strike && this.focusInk === ink) return;
    this.focusStrike = strike;
    this.focusInk = ink;
    this.requestUpdate?.();
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

  paneViews(): TrailsPaneView[] {
    return this._paneViews;
  }

  setData(snapshots: GexSnapshot[], maxAbs: number, enabled: boolean, barSec = 60): void {
    this.snapshots = snapshots;
    this.maxAbs = maxAbs;
    this.barSec = barSec;
    // The snapshots' own spacing (the smallest gap between neighbours —
    // overnight gaps are larger and must not set it)
    let step = Infinity;
    for (let i = 1; i < snapshots.length; i++) {
      const d = snapshots[i].time - snapshots[i - 1].time;
      if (d > 0 && d < step) step = d;
    }
    this.stepSec = Number.isFinite(step) ? step : barSec;
    // Strength is ABSOLUTE against a stable window reference (a high
    // percentile of per-moment maxima), so a wall visibly builds and drains
    // over time instead of every moment being rescaled to its own peak.
    const maxima = snapshots
      .map(s => s.levels.reduce((m, l) => Math.max(m, Math.abs(l.value)), 0))
      .filter(v => v > 0)
      .sort((a, b) => a - b);
    this.ref = maxima.length ? maxima[Math.min(maxima.length - 1, Math.floor(maxima.length * 0.85))] : 0;
    // Rank and scale every column NOW — draw() must never sort
    const ref = this.ref;
    this.columns =
      ref > 0
        ? snapshots.map(s => {
            const all = new Map<number, Bead>();
            for (const l of s.levels) all.set(l.strike, { strike: l.strike, t: Math.min(1, Math.abs(l.value) / ref), put: l.value >= 0 });
            const top = [...s.levels]
              .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
              .slice(0, TOP_N)
              .map(l => all.get(l.strike)!)
              .filter(b => b.t >= MIN_STRENGTH);
            return { time: s.time, top, all };
          })
        : [];
    this.enabled = enabled;
    this.requestUpdate?.();
  }
}
