/*
==================================================
  SLAYER TERMINAL - PINE DRAWING OBJECTS (data/pine/drawings.ts)
  line, label, box and table — what a script draws, and what it writes.
==================================================

  WHAT THESE ARE, AND WHY THEY ARE NOT PLOTS.

  A `plot` is one value per bar: a series. A `line` is an OBJECT — created
  once, mutated over later bars, deleted when it stops being true. The DNF
  levels indicator is built almost entirely out of them: each major is a
  `line.new(..., extend = extend.both)` with a `label.new` carrying its
  price and its held/broken record, and the active structure is a `box`.
  Without objects that script draws nothing recognisable, which is what
  sent this file into existence.

  THE LIFECYCLE IS THE SUBTLE PART. Pine keeps every object alive until it
  is deleted or the count cap evicts the oldest. A script that calls
  `line.new` every bar and never deletes will draw hundreds of them — that
  is Pine's behaviour, and `max_lines_count` is the reader's own guard. The
  cap is honoured here, defaulted the way Pine defaults it, and bounded
  again so a script cannot exhaust the tab.

  WHAT IS RENDERED is the set alive at the END of the run, because that is
  what a chart shows: the objects the script left standing on the last bar.
*/

import type { PineHandle, PineValue } from './builtins';

export type DrawKind = 'line' | 'label' | 'box' | 'table';

/** The handle a script holds — `var line eLine = na; eLine := line.new(...)`. */
export type DrawRef = PineHandle;

export const isDrawRef = (v: unknown): v is DrawRef =>
  typeof v === 'object' && v !== null && (v as DrawRef).kind === 'draw';

/** How far a line runs past its two anchors. */
export type Extend = 'none' | 'left' | 'right' | 'both';

export interface LineObj {
  what: 'line';
  id: number;
  /** Bar INDEX, always — `xloc.bar_time` is converted on creation. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  extend: Extend;
  color: string;
  width: number;
  /** `solid` | `dashed` | `dotted` */
  style: string;
}

export interface LabelObj {
  what: 'label';
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  textcolor: string;
  /** `none` draws the words alone; anything else draws a chip behind them. */
  style: string;
  size: string;
  yloc: string;
}

export interface BoxObj {
  what: 'box';
  id: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  borderColor: string;
  bgColor: string;
  borderWidth: number;
  extend: Extend;
}

/*
  A TABLE IS THE ONE OBJECT THAT IS NOT ON THE TAPE.

  Everything above is anchored to a bar and a price: pan the chart and it
  moves with the candles, because it is a claim about a moment. A table is
  anchored to the PANE — one of nine corners — and says the same thing
  wherever price goes. That is what the DNF dashboard is: five rows of
  MTF state pinned bottom-right, unmoved by scrolling.

  So it carries no coordinates at all, and the renderer lays it out from
  the corner rather than from the time scale.
*/
export interface TableCell {
  text: string;
  textColor: string;
  /** `tiny` | `small` | `normal` | `large` | `huge` */
  textSize: string;
  bgColor: string;
  /** `left` | `center` | `right` */
  halign: string;
}

export interface TableObj {
  what: 'table';
  id: number;
  /** `top_left` … `bottom_right`. */
  position: string;
  cols: number;
  rows: number;
  /** Row-major, `cells[row][col]`; a cell never written stays null. */
  cells: (TableCell | null)[][];
  bgColor: string;
  frameColor: string;
  frameWidth: number;
  borderColor: string;
  borderWidth: number;
}

export type DrawObj = LineObj | LabelObj | BoxObj | TableObj;

/* Pine's own defaults, and a hard ceiling over them: a script is user input
   and 500 lines is already more than a chart can say anything with. */
export const DEFAULT_CAPS: Record<DrawKind, number> = { line: 50, label: 50, box: 50, table: 8 };
export const MAX_CAP = 500;

export class DrawStore {
  private seq = 0;
  private readonly objs = new Map<number, DrawObj>();
  private readonly order: Record<DrawKind, number[]> = { line: [], label: [], box: [], table: [] };
  readonly caps: Record<DrawKind, number> = { ...DEFAULT_CAPS };

  setCap(kind: DrawKind, n: number): void {
    if (Number.isFinite(n) && n > 0) this.caps[kind] = Math.min(MAX_CAP, Math.trunc(n));
  }

  private add(obj: DrawObj): DrawRef {
    this.objs.set(obj.id, obj);
    const line = this.order[obj.what];
    line.push(obj.id);
    /* The OLDEST goes when the cap is reached, which is Pine's rule and the
       reason a script that never deletes still draws a moving window rather
       than growing without end. */
    while (line.length > this.caps[obj.what]) {
      const gone = line.shift();
      if (gone !== undefined) this.objs.delete(gone);
    }
    return { kind: 'draw', what: obj.what, id: obj.id };
  }

  newLine(o: Omit<LineObj, 'what' | 'id'>): DrawRef {
    return this.add({ what: 'line', id: this.seq++, ...o });
  }
  newLabel(o: Omit<LabelObj, 'what' | 'id'>): DrawRef {
    return this.add({ what: 'label', id: this.seq++, ...o });
  }
  newBox(o: Omit<BoxObj, 'what' | 'id'>): DrawRef {
    return this.add({ what: 'box', id: this.seq++, ...o });
  }
  newTable(o: Omit<TableObj, 'what' | 'id' | 'cells'>): DrawRef {
    const cells: (TableCell | null)[][] = [];
    for (let r = 0; r < o.rows; r++) cells.push(new Array<TableCell | null>(o.cols).fill(null));
    return this.add({ what: 'table', id: this.seq++, ...o, cells });
  }

  get(ref: PineValue): DrawObj | null {
    return isDrawRef(ref) && ref.what !== 'plot' && ref.what !== 'linefill' ? (this.objs.get(ref.id) ?? null) : null;
  }

  remove(ref: PineValue): void {
    /* A `plot` handle is a DrawRef too — `fill()` needs one to name its two
       plots — but it is not in this store, so `line.delete(aPlot)` is a
       no-op rather than an index into nothing. */
    if (!isDrawRef(ref) || ref.what === 'plot' || ref.what === 'linefill') return;
    this.objs.delete(ref.id);
    const line = this.order[ref.what];
    const at = line.indexOf(ref.id);
    if (at >= 0) line.splice(at, 1);
  }

  /** Everything still standing, in creation order. */
  all(): DrawObj[] {
    const out: DrawObj[] = [];
    /* PAINT ORDER, and it matters: the shaded structure is the ground, the
       levels sit on it, their words sit on those, and the dashboard sits
       over all of it because it is furniture rather than tape. */
    for (const kind of ['box', 'line', 'label', 'table'] as DrawKind[]) {
      for (const id of this.order[kind]) {
        const o = this.objs.get(id);
        if (o) out.push(o);
      }
    }
    return out;
  }
}
