import type { ISeriesPrimitive, SeriesAttachedParameter, Time, IChartApi, ISeriesApi } from 'lightweight-charts';
import type { SessionLevelKey, SessionLevels } from '../../data/sessionLevels';

/*
==================================================
  SLAYER TERMINAL - SESSION LEVELS LAYER — T-6
  (components/gex/sessionLevelsPrimitive.ts)
==================================================

  WHY A PRIMITIVE RATHER THAN SEVEN `createPriceLine`s.

  The first cut used price lines, and it drew correctly — seven rules across
  the tape at the right prices with four distinct dash patterns — and it was
  UNLABELLED, which made it unreadable. A price line's `title` is rendered as
  part of its AXIS LABEL, so the only way to name one is `axisLabelVisible:
  true`, which puts seven tags down the price scale.

  That is exactly what the house rule forbids: nothing is named on the price
  axis. And the rule is right here for its own reasons — seven tags would
  bury a scale that already carries the live price card and the key levels'
  chips, and they would collide with each other the moment two levels sat
  within a label's height, which on a quiet day is most of them.

  So the rules and their tags are drawn together, on the field, by this. Which
  also buys the thing price lines could not express at all: a range that is
  still FORMING reads differently from one that has settled.

  ONE INK, FOUR DASH PATTERNS. The dealer palette is spoken for — gold is
  put-dominant, steel call-dominant, magenta the king, blue the flip, lime the
  user's own marks, white spot — and red and green are price direction. A
  session level is none of those, so it takes none of those colours. The dash
  says which level it is; the pairs share a pattern because a high and its low
  are one fact with two edges.
*/

/* Platinum steel at low alpha — present, never competing with the tape. */
const INK = '226,234,244';
const LINE_ALPHA = 0.38;
const TAG_ALPHA = 0.62;
/* A forming range is quieter than a settled one, and says so in words too. */
const FORMING_ALPHA = 0.22;

/* In CSS px, scaled to the bitmap at draw time. Dash then gap. */
const DASH: Record<SessionLevelKey, number[]> = {
  prevClose: [6, 4],
  prevHigh: [12, 5],
  prevLow: [12, 5],
  orHigh: [2, 3],
  orLow: [2, 3],
  ibHigh: [1, 6],
  ibLow: [1, 6],
};

const TAG_FONT = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
const TAG_PAD_X = 4;
const TAG_PAD_Y = 2;
/* The tag sits at the LEFT edge of the plot, where the tape is oldest and
   least likely to be read closely — the right edge holds the live bars and
   the runway the reader is actually watching. */
const TAG_INSET = 4;

interface BitmapScope {
  context: CanvasRenderingContext2D;
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
  mediaSize: { width: number; height: number };
}
interface DrawTarget {
  useBitmapCoordinateSpace(cb: (scope: BitmapScope) => void): void;
}

/** What the layer draws, in the order it draws them. */
export interface SessionLine {
  key: SessionLevelKey;
  /** The shorthand on the field — PDH, OR15, IBL. */
  tag: string;
  price: number;
  /** A range whose window has not closed yet: quieter, and marked. */
  forming: boolean;
}

/**
 * The lines a `SessionLevels` reading draws.
 *
 * The opening range wears the MINUTES it was cut over, and then its own edge:
 * `OR15 H` and `OR15 L`. The minutes because the choice is per pane and
 * invisible otherwise, so two panes side by side at 5 and 30 would draw four
 * identical-looking rules; the edge because `OR15` twice on one chart says
 * which range but not which side of it, and a reader should not have to work
 * that out from which label sits higher. The other five already carry their
 * edge in the shorthand (PDH, PDL, IBH, IBL).
 */
export function sessionLines(s: SessionLevels): SessionLine[] {
  return s.levels.map(l => ({
    key: l.key,
    tag:
      l.key === 'orHigh' ? `OR${s.orMinutes} H`
      : l.key === 'orLow' ? `OR${s.orMinutes} L`
      : l.tag,
    price: l.price,
    forming:
      l.key === 'orHigh' || l.key === 'orLow'
        ? !s.orComplete
        : l.key === 'ibHigh' || l.key === 'ibLow'
          ? !s.ibComplete
          : false,
  }));
}

class SessionLevelsRenderer {
  constructor(private source: SessionLevelsPrimitive) {}

  draw(target: DrawTarget): void {
    const src = this.source;
    const series = src.series;
    if (!series || src.lines.length === 0) return;

    target.useBitmapCoordinateSpace(scope => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const w = scope.mediaSize.width * hr;
      const h = scope.mediaSize.height * vr;

      /*
        Placed tag boxes, so two levels a few cents apart do not print their
        names on top of each other.

        A DISPLACED TAG GETS A LEADER back to its own rule, and that is a
        correctness fix rather than a flourish. Measured on a quiet SPY
        session: three levels inside half a point pushed the third tag two
        lanes down, where it sat about a point below the rule it named — and a
        label a point away from its line does not annotate that level, it
        asserts a different one.

        The push is capped at three lanes for the same reason. Past that the
        leader is long enough to be read as a line of its own, so the tag is
        DROPPED instead: the rule stays, still identified by its dash, which is
        what the dashes are for.
      */
      const taken: { top: number; bottom: number }[] = [];
      const MAX_PUSH = 3;

      ctx.save();
      ctx.font = `${9 * vr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textBaseline = 'middle';
      const tagH = 13 * vr;

      for (const line of src.lines) {
        const yc = series.priceToCoordinate(line.price);
        if (yc === null) continue;
        const y = Math.round(yc * vr) + 0.5;
        if (y < 0 || y > h) continue;

        const alpha = line.forming ? FORMING_ALPHA : LINE_ALPHA;
        ctx.strokeStyle = `rgba(${INK},${alpha})`;
        ctx.lineWidth = Math.max(1, Math.round(vr));
        ctx.setLineDash(DASH[line.key].map(d => d * hr));
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.setLineDash([]);

        /* A forming range says so, rather than looking like a settled one
           that happens to be faint. */
        const label = line.forming ? `${line.tag} forming` : line.tag;
        const textW = ctx.measureText(label).width;
        const boxW = textW + TAG_PAD_X * 2 * hr;
        const boxH = tagH + TAG_PAD_Y * 2 * vr;

        const wanted = y - boxH / 2;
        let top = wanted;
        let pushed = 0;
        while (pushed < MAX_PUSH && taken.some(t => top < t.bottom && top + boxH > t.top)) {
          top += boxH + 2 * vr;
          pushed++;
        }
        /* Still colliding after the cap, or off the plot: no tag. */
        if (taken.some(t => top < t.bottom && top + boxH > t.top)) continue;
        if (top + boxH > h || top < 0) continue;
        taken.push({ top, bottom: top + boxH });

        const x = TAG_INSET * hr;
        /* A wash behind the text, so a tag over a candle is still readable
           without painting a solid block on the tape. */
        ctx.fillStyle = 'rgba(10,10,10,0.55)';
        ctx.fillRect(x, top, boxW, boxH);
        ctx.fillStyle = `rgba(${INK},${line.forming ? FORMING_ALPHA + 0.18 : TAG_ALPHA})`;
        ctx.fillText(label, x + TAG_PAD_X * hr, top + boxH / 2);

        /* The leader, only when the tag had to move. Solid and short, so it
           reads as "this box belongs to that rule" rather than as another
           level. */
        if (pushed > 0) {
          const cy = top + boxH / 2;
          ctx.strokeStyle = `rgba(${INK},${TAG_ALPHA * 0.7})`;
          ctx.lineWidth = Math.max(1, Math.round(vr));
          ctx.beginPath();
          ctx.moveTo(x + boxW, cy);
          ctx.lineTo(x + boxW + 6 * hr, y);
          ctx.stroke();
        }
      }
      ctx.restore();
    });
  }
}

class SessionLevelsPaneView {
  private _renderer: SessionLevelsRenderer;
  constructor(source: SessionLevelsPrimitive) {
    this._renderer = new SessionLevelsRenderer(source);
  }
  /* BOTTOM, unlike the drawings layer. These are the day's furniture and the
     tape is the subject — candles read over them, not under them. */
  zOrder(): 'bottom' {
    return 'bottom';
  }
  renderer(): SessionLevelsRenderer {
    return this._renderer;
  }
}

export class SessionLevelsPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<'Candlestick'> | null = null;
  requestUpdate?: () => void;
  lines: SessionLine[] = [];
  private _paneViews: SessionLevelsPaneView[];

  constructor() {
    this._paneViews = [new SessionLevelsPaneView(this)];
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

  paneViews(): SessionLevelsPaneView[] {
    return this._paneViews;
  }

  /**
   * Replace what is drawn.
   *
   * Compared before it repaints: the host recomputes on every simulator tick
   * and these prices move only while the opening range and the initial
   * balance are still forming. Asking for a frame that draws the same seven
   * rules is a frame spent for nothing, on a desk that can be running four
   * charts.
   */
  setLines(next: SessionLine[]): void {
    const same =
      next.length === this.lines.length &&
      next.every((l, i) => {
        const p = this.lines[i];
        return p.key === l.key && p.price === l.price && p.tag === l.tag && p.forming === l.forming;
      });
    this.lines = next;
    if (!same) this.requestUpdate?.();
  }
}

/** Exported for the proof: the constants a test would otherwise re-type. */
export const SESSION_LAYER = { INK, LINE_ALPHA, TAG_ALPHA, FORMING_ALPHA, DASH, TAG_FONT } as const;
