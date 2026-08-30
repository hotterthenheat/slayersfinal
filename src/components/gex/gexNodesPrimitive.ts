import type { ISeriesPrimitive, SeriesAttachedParameter, Time, IChartApi, ISeriesApi } from 'lightweight-charts';
import type { GexSnapshot } from '../../types/market';
import { heatPoleRgb } from './heatmap';

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
  (lime, or magenta while it is the supreme) at full strength, and the rest of
  the field steps back.
*/

/* THE FIELD'S OWN INKS (Noah, 2026-08-22): the house heatmap's steel-gold
   poles — gold = put-dominant / amplifying, steel = call-dominant /
   absorbing — and magenta on the supreme strike, as everywhere else. Not the
   market red/green: on THIS surface those belong to the candles, and a
   field in the tape's ink can't be told from the tape. The legend above the
   chart teaches the pair. Strength lives in height and alpha, never in
   desaturation. */
/* DERIVED, not copied — these carry exactly the heat ramp's two meanings
   (amplify / absorb) and used to be literals of the old steel-gold poles, so
   a ramp change left the dealer nodes painting the previous palette while
   the ladders and matrices moved. */
const triple = (rgb: string): readonly [number, number, number] => {
  const [r, g, b] = rgb.split(',').map(Number);
  return [r, g, b] as const;
};
const PUT_RGB = triple(heatPoleRgb.pos);
const CALL_RGB = triple(heatPoleRgb.neg);
const KING_RGB: readonly [number, number, number] = [234, 0, 255];
/* THE WALLS LIVE HERE (Noah, 2026-08-22: "I hate how they look on the side
   line"): each moment's call wall beads ink green, its put wall red, and the
   flip runs as a blue tick trail — the levels ON the tape, history included,
   instead of static lines at today's values. Same level rules as the chips
   used (buildLevelsFor): wall = heaviest |gamma| above/below that moment's
   close, flip = the sign-change midpoint nearest it. */
const CW_RGB: readonly [number, number, number] = [48, 209, 88]; // bull green
const PW_RGB: readonly [number, number, number] = [255, 59, 48]; // bear red
const FLIP_RGBA = 'rgba(125,211,252,0.55)'; // baby blue — the regime border

/* WHEN TWO IDENTITIES SHARE A STRIKE, THE INKS MIX (Noah, 2026-08-22, with
   the paint chart): a put wall that IS the supreme paints wine (red+magenta),
   a call wall that is the supreme a violet, a flip on the supreme purple — both
   facts visible in one band, neither swallowed. 50/50 blends. */
const mix = (a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] => [
  Math.round((a[0] + b[0]) / 2),
  Math.round((a[1] + b[1]) / 2),
  Math.round((a[2] + b[2]) / 2),
];
const PWK_RGB = mix(PW_RGB, KING_RGB); // wine  (245, 30, 152)
const CWK_RGB = mix(CW_RGB, KING_RGB); // violet (141, 105, 172)
const FLIPK_RGBA = 'rgba(180,106,254,0.7)'; // purple — flip on the supreme

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

/** The focused level's ink: the focus lime — or the supreme's magenta while the
    focused strike IS the supreme. Mirrors palette FOCUS/SUPREME. */
export type FocusInk = 'focus' | 'supreme';
const INK_RGB: Record<FocusInk, readonly [number, number, number]> = {
  focus: [210, 255, 0],
  supreme: [234, 0, 255],
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
    const supreme = src.kingStrike;
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
      const flipPath = new Path2D();
      let flipDrawn = false;
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

        // The flip: ONE dotted blue line at TODAY'S flip — a tick per column
        // in the field's grammar, never a solid side line
        if (src.flipPrice != null) {
          const fy = series.priceToCoordinate(src.flipPrice);
          if (fy !== null) {
            const w = (barSpacing / drawnSlots) * 0.62 * hr;
            flipPath.rect(cx - w / 2, fy * vr - 0.8 * vr, w, 1.6 * vr);
            flipDrawn = true;
          }
        }

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
          /* Ink precedence: the focus wins, then TODAY'S walls — ABOVE the
             supreme, because the put wall often IS the supreme and magenta was
             swallowing the red entirely (Noah, 2026-08-22: "I don't even see
             any put wall"); the supreme keeps its chip, axis line and label —
             then the supreme's magenta, then the side. */
          const isKing = supreme != null && bead.strike === supreme;
          const inkKey = isFocus
            ? 'f'
            : bead.strike === src.cwStrike
              ? isKing
                ? 'cwk' // call wall AND supreme — violet
                : 'cw'
              : bead.strike === src.pwStrike
                ? isKing
                  ? 'pwk' // put wall AND supreme — wine
                  : 'pw'
                : isKing
                  ? 'k'
                  : bead.put
                    ? 'p'
                    : 'c';

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

      const INKS: Record<string, readonly [number, number, number]> = {
        f: ink,
        k: KING_RGB,
        cw: CW_RGB,
        pw: PW_RGB,
        cwk: CWK_RGB,
        pwk: PWK_RGB,
        p: PUT_RGB,
        c: CALL_RGB,
      };
      const paint = (map: Map<string, Path2D>, step: number) => {
        for (const [key, path] of map) {
          const [inkKey, q] = key.split('|');
          const rgb = INKS[inkKey] ?? CALL_RGB;
          ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(Number(q) / step).toFixed(3)})`;
          ctx.fill(path);
        }
      };
      if (flipDrawn) {
        // Flip sitting ON the supreme → purple, both facts in one line
        const flipOnKing = supreme != null && src.flipPrice != null && Math.abs(src.flipPrice - supreme) < 1e-6;
        ctx.fillStyle = flipOnKing ? FLIPK_RGBA : FLIP_RGBA;
        ctx.fill(flipPath);
      }
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

      const labelPx = src.labelPx;
      ctx.font = `${Math.round(labelPx * vr)}px "SF Pro", sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const xRight = (wCss - 8) * hr;

      const drawLabel = (lvl: { strike: number; value: number }, color: string) => {
        const y = series.priceToCoordinate(lvl.strike);
        if (y === null) return;
        const pct = Math.round((Math.abs(lvl.value) / total) * 100);
        const strikeLabel = lvl.strike % 1 === 0 ? lvl.strike.toFixed(0) : lvl.strike.toFixed(2);
        const text = `${strikeLabel} · ${pct}%`;
        const yPix = y * vr;

        // Dark backing pad so the label survives whatever sits behind it
        const w = ctx.measureText(text).width;
        /* The pad rides the type size. Fixed padding around shrinking text
           leaves the chip the same height with a smaller word rattling inside
           it — smaller type and no more room, which is the opposite of the
           point. */
        const scale = labelPx / 9.5;
        const padX = 4 * hr * scale;
        const padY = 2.5 * vr * scale;
        const boxH = 12 * vr * scale;
        ctx.fillStyle = 'rgba(5,5,5,0.72)';
        ctx.fillRect(xRight - w - padX, yPix - boxH / 2 - padY / 2, w + padX * 2, boxH + padY);
        ctx.fillStyle = color;
        ctx.fillText(text, xRight, yPix);
      };

      for (const lvl of top) {
        if (focus != null && lvl.strike === focus) continue; // drawn below, in its own ink
        const rgb = supreme != null && lvl.strike === supreme ? KING_RGB : lvl.value >= 0 ? PUT_RGB : CALL_RGB;
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
  /**
   * The strike chips' type size in CSS px — 9.5 normally, smaller on a phone.
   *
   * A field rather than another `setData` argument: it is a presentation
   * setting that changes with the HOST, while setData carries the data and is
   * called on every tick. Bundling them would make a size change look like new
   * data to every reader of this class.
   */
  labelPx = 9.5;
  /** The field's own clock, seconds between snapshots — beads per bar = barSec / stepSec */
  stepSec = 60;
  /** The level view's strike — its beads lead, the field steps back. */
  focusStrike: number | null = null;
  /** Its ink: lime, or magenta while the focused strike is the supreme. The
      focus never follows the supreme — the strike you clicked is the strike
      you're watching; the ink reports its standing (Noah, 2026-08-22). */
  focusInk: FocusInk = 'focus';
  /** The book's supreme strike — its band wears magenta (re-read every scan) */
  kingStrike: number | null = null;
  /** TODAY'S levels — ONE green band, ONE red band, ONE blue flip line, all
      re-read every scan so they move with the math (Noah, 2026-08-22) */
  cwStrike: number | null = null;
  pwStrike: number | null = null;
  flipPrice: number | null = null;
  private _paneViews: TrailsPaneView[];

  constructor() {
    this._paneViews = [new TrailsPaneView(this)];
  }

  setKing(strike: number | null): void {
    if (this.kingStrike === strike) return;
    this.kingStrike = strike;
    this.requestUpdate?.();
  }

  setWalls(cw: number | null, pw: number | null, flip: number | null): void {
    if (this.cwStrike === cw && this.pwStrike === pw && this.flipPrice === flip) return;
    this.cwStrike = cw;
    this.pwStrike = pw;
    this.flipPrice = flip;
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
