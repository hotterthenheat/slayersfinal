import type { ISeriesPrimitive, SeriesAttachedParameter, Time, IChartApi, ISeriesApi } from 'lightweight-charts';
import { CHROME_STEEL_RGB } from '../gex/palette';

/*
==================================================
  SLAYER TERMINAL - CAMPAIGN LEVEL NODES
  (components/compass/campaignLevelsPrimitive.ts)
==================================================

  The campaign's targets and its floor, drawn as NODES on the field instead
  of as price lines with axis tags.

  WHY, in one line: the house already settled this argument. The session
  levels layer (T-6) moved off `createPriceLine` for exactly this reason and
  wrote the rule down — a price line can only be named through
  `axisLabelVisible`, which puts its title on the PRICE SCALE, and nothing
  is named on the price axis. The campaign chart never got the treatment and
  was still drawing four dashed rules straight across the tape with four
  tags stacked down the axis, on a scale that already carries the live price
  card. Noah, 2026-08-30: "not those ugly looking lines".

  RELATED TO TERRAIN'S NODES, NOT A COPY OF THEM. Terrain's dealer nodes are
  a dark pad with coloured text, right-aligned, because there are twelve of
  them and they must not shout. A campaign has three or four levels and each
  one is a DECISION — where the thesis is taken off, where it is wrong — so
  these get more presence: a capsule with a real border, an anchor dot, and
  a lead-in that fades in from the left so the level can be traced back to
  the candles without a dashed rule cutting the chart in half.

  THE LEAD-IN CARRIES THE MEANING, NOT JUST THE EYE. It fades from nothing
  at the far left to full ink at the node, so the further a price is from
  the level the quieter the level's claim on it. A dashed line is the same
  weight everywhere, which is why four of them read as a grid rather than as
  four different facts.

  CAPSULES NEVER OVERLAP. Two targets a few cents apart used to draw two
  tags on top of each other and neither could be read. They are pushed apart
  vertically here — the ANCHOR DOT stays on the true price, so the capsule
  moving is honest: the dot is the level, the capsule is its name.
*/

export type CampaignLevelKind = 'target' | 'floor' | 'strike';

export interface CampaignLevel {
  price: number;
  kind: CampaignLevelKind;
  /** The short name in the capsule — 'TP2', 'FLOOR', 'STRIKE'. */
  label: string;
}

export interface CampaignLevelsData {
  levels: CampaignLevel[];
}

/*
  The inks. A campaign target and its floor ARE direction — this is the one
  surface where up and down are the subject rather than dealer positioning —
  so they take the house bull/bear, and the strike takes the neutral steel
  that is used for chrome everywhere else.
*/
const INK: Record<CampaignLevelKind, string> = {
  target: '48,209,88',
  floor: '255,59,48',
  /* Chrome, not the call side — the strike is a reference mark, so it takes
     the furniture steel by name and does NOT follow the heat ramp. */
  strike: CHROME_STEEL_RGB,
};

const CAPSULE_H = 15; // CSS px
const CAPSULE_PAD_X = 6;
const DOT_R = 2.6;
const GAP = 5; // dot to capsule
const RIGHT_INSET = 8;
const FONT_PX = 9.5;
/** The lead-in starts this far across the plot, as a fraction of its width. */
const LEAD_FROM = 0.3;

interface BitmapScope {
  context: CanvasRenderingContext2D;
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
  mediaSize: { width: number; height: number };
}
interface DrawTarget {
  useBitmapCoordinateSpace(cb: (scope: BitmapScope) => void): void;
}

/** Rounded rect, for runtimes without ctx.roundRect. */
const capsulePath = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
};

/**
 * Push capsule centres apart so none overlaps, keeping each as close to its
 * true price as it can be. Returns a y per level, in the SAME order.
 *
 * Exported because it is the one piece of arithmetic here worth proving on
 * its own — the drawing needs a canvas, this does not.
 */
export function stackCapsules(ys: number[], minGap: number): number[] {
  /* Solve in price order, top to bottom, so the pushing is stable rather
     than depending on which level happened to be listed first. */
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  let last = -Infinity;
  for (const it of order) {
    const want = Math.max(it.y, last + minGap);
    it.y = want;
    last = want;
  }
  const out = new Array<number>(ys.length);
  for (const it of order) out[it.i] = it.y;
  return out;
}

class CampaignLevelsRenderer {
  constructor(private source: CampaignLevelsPrimitive) {}

  draw(target: DrawTarget): void {
    const src = this.source;
    const data = src.data;
    const series = src.series;
    if (!series || !data || data.levels.length === 0) return;

    target.useBitmapCoordinateSpace(scope => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const wCss = scope.mediaSize.width;

      /* Coordinates first, then the stack, then one pass of drawing — the
         capsule positions depend on ALL the levels, so nothing can be drawn
         until every price has been resolved. */
      const placed: { lvl: CampaignLevel; yTrue: number; text: string; w: number }[] = [];
      ctx.save();
      ctx.font = `600 ${Math.round(FONT_PX * vr)}px "SF Pro Text", system-ui, sans-serif`;
      for (const lvl of data.levels) {
        const y = series.priceToCoordinate(lvl.price);
        if (y === null) continue;
        const price = lvl.price % 1 === 0 ? lvl.price.toFixed(0) : lvl.price.toFixed(2);
        const text = `${lvl.label}  ${price}`;
        placed.push({ lvl, yTrue: y, text, w: ctx.measureText(text).width / hr });
      }
      if (placed.length === 0) {
        ctx.restore();
        return;
      }
      const stacked = stackCapsules(
        placed.map(p => p.yTrue),
        CAPSULE_H + 3
      );

      placed.forEach((p, i) => {
        const ink = INK[p.lvl.kind];
        const yTrue = p.yTrue * vr;
        const yCap = stacked[i] * vr;
        const capW = (p.w + CAPSULE_PAD_X * 2) * hr;
        const capH = CAPSULE_H * vr;
        const capRight = (wCss - RIGHT_INSET) * hr;
        const capLeft = capRight - capW;
        const dotX = capLeft - GAP * hr;

        /* 1. The lead-in, fading in toward the node. Drawn at the TRUE
              price — it is the level itself, and it does not move when the
              capsule is pushed aside. */
        const x0 = wCss * LEAD_FROM * hr;
        const grad = ctx.createLinearGradient(x0, 0, dotX, 0);
        grad.addColorStop(0, `rgba(${ink},0)`);
        grad.addColorStop(1, `rgba(${ink},0.5)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(1, Math.round(vr));
        ctx.beginPath();
        ctx.moveTo(x0, yTrue);
        ctx.lineTo(dotX, yTrue);
        ctx.stroke();

        /* 2. When the capsule has been pushed off its price, a hairline
              elbow joins the dot to it, so the name is never floating
              beside a level it does not belong to. */
        if (Math.abs(yCap - yTrue) > 0.5) {
          ctx.strokeStyle = `rgba(${ink},0.35)`;
          ctx.beginPath();
          ctx.moveTo(dotX, yTrue);
          ctx.lineTo(dotX, yCap);
          ctx.stroke();
        }

        /* 3. The anchor dot — this, not the capsule, is the price. */
        ctx.fillStyle = `rgba(${ink},0.95)`;
        ctx.beginPath();
        ctx.arc(dotX, yTrue, DOT_R * vr, 0, Math.PI * 2);
        ctx.fill();

        /* 4. The capsule: dark plate so it survives whatever is behind it,
              a real border in the level's ink, and the name inside. */
        capsulePath(ctx, capLeft, yCap - capH / 2, capW, capH, 4 * vr);
        ctx.fillStyle = 'rgba(8,9,12,0.86)';
        ctx.fill();
        ctx.strokeStyle = `rgba(${ink},0.7)`;
        ctx.lineWidth = Math.max(1, Math.round(vr));
        ctx.stroke();

        ctx.fillStyle = `rgba(${ink},0.95)`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.text, capLeft + CAPSULE_PAD_X * hr, yCap);
      });
      ctx.restore();
    });
  }
}

class CampaignLevelsPaneView {
  private _renderer: CampaignLevelsRenderer;
  constructor(source: CampaignLevelsPrimitive) {
    this._renderer = new CampaignLevelsRenderer(source);
  }
  zOrder(): 'top' {
    return 'top';
  }
  renderer(): CampaignLevelsRenderer {
    return this._renderer;
  }
}

export class CampaignLevelsPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<'Candlestick'> | null = null;
  requestUpdate?: () => void;
  data: CampaignLevelsData | null = null;
  private _paneViews: CampaignLevelsPaneView[];

  constructor() {
    this._paneViews = [new CampaignLevelsPaneView(this)];
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

  paneViews(): CampaignLevelsPaneView[] {
    return this._paneViews;
  }

  setData(data: CampaignLevelsData | null): void {
    this.data = data;
    this.requestUpdate?.();
  }
}

/** The layer's own constants, for the proof and for anything that has to
    line up with it. */
export const CAMPAIGN_LAYER = { INK, CAPSULE_H, DOT_R, LEAD_FROM } as const;
