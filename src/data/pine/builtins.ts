/*
==================================================
  SLAYER TERMINAL - PINE BUILT-INS (data/pine/builtins.ts)
  The surface this engine implements — and the surface it refuses.
==================================================

  TWO TABLES, AND THE SECOND IS THE IMPORTANT ONE.

  `FNS` and `VARS` are what the engine can run. `REFUSED` is every namespace
  it knows about and cannot, each with the reason a reader needs. Nothing
  falls between them: `analyse.ts` walks a parsed script and anything absent
  from both is refused as unknown.

  That is the whole design. A Pine subset that quietly approximates the parts
  it did not implement produces a plot that looks right and is not, which is
  the one outcome worse than refusing to draw at all — a reader would trade
  it. So every gap is named, at the line it appears on, before anything is
  drawn.

  STATE LIVES PER CALL SITE. Pine's `ta.*` are stateful and each call site is
  its own instance; two `ta.ema(close, 9)` on one line are two averages. The
  interpreter keys each accumulator on the call site's id and its call path,
  and hands it in as `slot`.

  SEEDING IS THE PART THAT SILENTLY DIVERGES, so it is written down:
    ta.ema   alpha = 2/(len+1), seeded with the FIRST source value
    ta.rma   alpha = 1/len, seeded with the SMA of the first `len` values
    ta.sma   na until the window is full
  RSI and ATR are both built on rma, so they inherit its seeding. These match
  TradingView's documented definitions, and `emaSeries` in data/indicators.ts
  already seeds the same way, so the tape's own EMA and a script's agree.
*/

import type { Candle } from '../../types/market';
import { strikeNear, type SlayerFeed } from './feed';

/*
  ARRAYS ARE A REFERENCE VALUE, and that is the whole of their semantics
  here: `var float[] a = array.new_float(20, na)` builds the array ONCE and
  every bar afterwards mutates the same one. The `var` store already keeps
  whatever it was handed, so holding a reference makes the persistence fall
  out rather than needing a second mechanism.
*/
export interface PineArray {
  kind: 'array';
  items: PineValue[];
}

export const isPineArray = (v: unknown): v is PineArray =>
  typeof v === 'object' && v !== null && (v as PineArray).kind === 'array';

export const newPineArray = (items: PineValue[] = []): PineArray => ({ kind: 'array', items });

/*
  A DRAWING HANDLE is a value too — `var line eLine = na` then
  `eLine := line.new(...)` stores one in a variable and reads it back to
  delete or move the object later. Declared structurally here so this module
  stays the one place that says what a Pine value can be, without importing
  the drawing store and making the two files circular.
*/
export interface PineHandle {
  kind: 'draw';
  what: 'line' | 'label' | 'box' | 'table' | 'plot' | 'linefill';
  id: number;
}

/**
 * An instance of a `type` the script declared — the record modern Pine is
 * written around. Fields are held by name; the engine is untyped, so what a
 * field carries is whatever was put in it.
 */
export interface PineObject {
  kind: 'object';
  type: string;
  fields: Map<string, PineValue>;
}

export const isPineObject = (v: unknown): v is PineObject =>
  typeof v === 'object' && v !== null && (v as PineObject).kind === 'object';

export type PineValue = number | boolean | string | null | PineArray | PineHandle | PineObject;

/** One call site's private memory. */
export interface Slot { v?: unknown }

export interface Ctx {
  bars: readonly Candle[];
  i: number;
  /** The chart's own interval, for `timeframe.*`. */
  timeframe: string;
  /**
   * THE SAME INTERVAL AS A NUMBER OF MINUTES, and the reason it is here.
   *
   * `timeframe` carries the DESK's spelling — "5m", "15m", "1D" — and Pine's
   * own grammar spells five minutes "5" and a month "M". Feeding the desk's
   * string to a Pine-format parser therefore read "5m" as FIVE MONTHS, and
   * `timeframe.in_seconds()` answered 12,960,000 for a five-minute chart.
   * The host already knows the number; it is passed rather than re-derived.
   */
  chartMinutes: number;
  ticker: string;
  /**
   * The dealer book behind `slayer.*`, aligned to `bars` by the host.
   * Absent when the run has no desk behind it — every `slayer.*` name then
   * fails loudly rather than returning a quiet `na`, because a script whose
   * whole point is the book must not silently draw nothing.
   */
  slayer?: SlayerFeed;
  /**
   * Where a built-in says something about itself the picture cannot show —
   * today, that a value is TODAY'S SNAPSHOT rather than a series. Collected
   * once per distinct message and surfaced as `run.notes`.
   */
  note?: (message: string) => void;
}

/**
 * Pine writes an interval as a bare number of minutes, or D/W/M.
 * Returns null for anything this engine cannot aggregate to.
 */
export function pineTfMinutes(tf: string): number | null {
  const t = tf.trim().toUpperCase();
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(\d*)([SDWM])$/.exec(t);
  if (!m) return null;
  const n = m[1] === '' ? 1 : Number(m[1]);
  switch (m[2]) {
    case 'S': return null;      // sub-minute is not aggregated here
    case 'D': return n * 1440;
    case 'W': return n * 10080;
    case 'M': return n * 43200; // a calendar month is approximated; see the note at the call site
    default: return null;
  }
}

export type BuiltinFn = (ctx: Ctx, a: PineValue[], named: Record<string, PineValue>, slot: Slot) => PineValue | PineValue[];

const num = (v: PineValue): number => (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : NaN);
/** Pine's `na` is our null; NaN from arithmetic is the same thing. */
const clean = (v: number): number | null => (Number.isFinite(v) ? v : null);
const truthy = (v: PineValue): boolean => v === true || (typeof v === 'number' && v !== 0);

/** An array's declared size, bounded — a script is user input. */
export const MAX_ARRAY = 100_000;
const arrSize = (v: PineValue): number => Math.max(0, Math.min(MAX_ARRAY, Math.trunc(num(v)) || 0));

/*
  CLOCK TIME IN THE EXCHANGE'S ZONE.

  Intl is the only thing here that knows New York is on daylight time in
  July, and a session filter that ignores that is wrong for eight months of
  the year. The parts are pulled out once and reassembled, because
  `toLocaleString` has no format string and Pine's is its own.
*/
const zoneParts = (ms: number, tz: string): Record<string, string> => {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(ms))) if (p.type !== 'literal') out[p.type] = p.value;
  /* Midnight comes back as 24 in some ICU builds; Pine calls it 00. */
  if (out.hour === '24') out.hour = '00';
  return out;
};

/**
 * THE OPENING TIME OF THE `tf` BAR THIS ONE FALLS INSIDE — what `time(tf)`
 * means, and the whole basis of the session-reset idiom:
 *
 *     newSession = ta.change(time("D")) != 0
 *
 * Every anchored VWAP, opening range and daily accumulator on earth is
 * written that way. Returning the BAR's own timestamp instead — which this
 * did — makes that expression true on every single bar, so a session VWAP
 * resets each bar and quietly becomes hlc3, an opening range never closes,
 * and nothing about the chart says any of it went wrong.
 *
 * D/W/M are CALENDAR buckets in the exchange's timezone, not UTC ones: a
 * UTC day boundary lands at 19:00 or 20:00 New York, in the middle of the
 * extended session, so a "daily" reset would fire hours after the close and
 * split the evening away from the day it belongs to. Minute intervals are
 * plain arithmetic on the epoch, which is what the host's own aggregation
 * does, so a script mixing `time("60")` with `request.security("60", …)`
 * gets one answer rather than two.
 */
/** How far `tz` runs ahead of UTC at this instant, in milliseconds. */
const zoneOffset = (ms: number, tz: string): number => {
  const p = zoneParts(ms, tz);
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute), Number(p.second)
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
};

/*
  THE OFFSET, MEMOISED BY THE HOUR.

  Every clock question here — which session a bar is in, which day it starts —
  reduces to "how far ahead of UTC was this zone at that moment", and asking
  `Intl` per bar is what made a session script cost seconds rather than
  milliseconds. A zone's offset only changes at a daylight-saving boundary,
  and those fall on the hour, so one reading per UTC hour is not an
  approximation of the answer — it IS the answer, for every zone that shifts
  on the hour, which is every zone this desk trades.
*/
const offsetCache = new Map<string, number>();
const zoneOffsetCached = (ms: number, tz: string): number => {
  const key = `${tz}|${Math.floor(ms / 3_600_000)}`;
  let off = offsetCache.get(key);
  if (off === undefined) {
    off = zoneOffset(ms, tz);
    /* A script panning across years must not grow this without bound. */
    if (offsetCache.size > 20_000) offsetCache.clear();
    offsetCache.set(key, off);
  }
  return off;
};

/** The epoch of local midnight on the y/m/d given, in `tz`. */
const midnightIn = (y: number, m: number, d: number, tz: string): number => {
  const guess = Date.UTC(y, m - 1, d);
  /* Applied twice: the first correction can land on the other side of a
     daylight-saving change, and re-reading the offset THERE settles it. */
  let ms = guess - zoneOffset(guess, tz);
  ms = guess - zoneOffset(ms, tz);
  return ms;
};

/*
  THE BUCKET IS CACHED, and it has to be.

  `time("D")` is called on every bar, and answering it honestly costs two
  `Intl.DateTimeFormat` reads — which is how a session VWAP over 1,738 bars
  came to take 2.4 SECONDS. The chart re-runs a script live, so that is not a
  slow test, it is a frozen tab.

  A bucket is a half-open range, so once one is known every bar inside it is
  answered by two comparisons. Bars arrive in time order, so one entry per
  interval is enough; a script reaching backwards recomputes and re-caches
  rather than growing the map.
*/
const bucketCache = new Map<string, { start: number; end: number }>();

const bucketStart = (sec: number, tf: string, tz: string): number => {
  const key = `${tf}|${tz}`;
  const hit = bucketCache.get(key);
  if (hit && sec >= hit.start && sec < hit.end) return hit.start;
  const start = bucketCompute(sec, tf, tz);
  bucketCache.set(key, { start, end: bucketEnd(start, tf, tz) });
  return start;
};

/** The first second of the NEXT bucket after the one starting at `start`. */
const bucketEnd = (start: number, tf: string, tz: string): number => {
  const t = tf.trim().toUpperCase();
  const cal = /^(\d*)([DWM])$/.exec(t);
  if (cal && !/^\d+$/.test(t)) {
    const p = zoneParts(start * 1000, tz);
    const y = Number(p.year);
    const m = Number(p.month);
    const d = Number(p.day);
    const next = cal[2] === 'M' ? midnightIn(y, m + 1, 1, tz)
      : cal[2] === 'W' ? midnightIn(y, m, d + 7, tz)
      : midnightIn(y, m, d + 1, tz);
    return Math.floor(next / 1000);
  }
  const mins = pineTfMinutes(t);
  return mins === null || mins <= 0 ? start + 1 : start + mins * 60;
};

const bucketCompute = (sec: number, tf: string, tz: string): number => {
  const t = tf.trim().toUpperCase();
  const cal = /^(\d*)([DWM])$/.exec(t);
  if (cal && !/^\d+$/.test(t)) {
    const p = zoneParts(sec * 1000, tz);
    const y = Number(p.year);
    const mo = Number(p.month);
    const d = Number(p.day);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return sec;
    if (cal[2] === 'M') return Math.floor(midnightIn(y, mo, 1, tz) / 1000);
    const dayMs = midnightIn(y, mo, d, tz);
    if (cal[2] === 'D') return Math.floor(dayMs / 1000);
    /* Back to the Monday. The weekday is read in the zone, not from a UTC
       Date, so a Sunday evening bar in New York is not filed under Monday. */
    const dow = (Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' })
      .formatToParts(new Date(dayMs))
      .map(x => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(x.value))
      .find(n => n >= 0) ?? 1) + 6) % 7;
    return Math.floor(midnightIn(y, mo, d - dow, tz) / 1000);
  }
  const mins = pineTfMinutes(t);
  if (mins === null || mins <= 0) return sec;
  const step = mins * 60;
  return Math.floor(sec / step) * step;
};

/** Pine's subset of the format tokens, longest first so `mm` beats `m`. */
function formatClock(ms: number, fmt: string, tz: string): string {
  const p = zoneParts(ms, tz);
  return fmt
    .replace(/yyyy/g, p.year ?? '')
    .replace(/MM/g, p.month ?? '')
    .replace(/dd/g, p.day ?? '')
    .replace(/HH/g, p.hour ?? '')
    .replace(/mm/g, p.minute ?? '')
    .replace(/ss/g, p.second ?? '');
}

/**
 * This bar's moment shifted into the exchange's zone, so the UTC getters on
 * it read as exchange local time. One memoised offset lookup, no formatting.
 */
const exchangeClock = (c: Ctx): Date => {
  const ms = c.bars[c.i].time * 1000;
  return new Date(ms + zoneOffsetCached(ms, 'America/New_York'));
};

/**
 * Is this timestamp inside a Pine session string?
 *
 * `"0930-1600"`, optionally with a `:1234567` day mask. A window that wraps
 * midnight (`"1700-0900"`) is inside when the clock is past the open OR
 * before the close, which is the only reading that makes an overnight
 * session mean anything.
 */
function inSession(ms: number, spec: string, tz: string): boolean {
  const [range, days] = spec.split(':');
  const m = /^(\d{4})-(\d{4})$/.exec(range.trim());
  if (!m) return false;
  /* Shifted into the zone and then read with UTC getters — plain arithmetic
     on a memoised offset, rather than an `Intl` format per bar. */
  const local = new Date(ms + zoneOffsetCached(ms, tz));
  const hhmm = local.getUTCHours() * 100 + local.getUTCMinutes();
  if (days && days.trim() !== '') {
    /* Pine's day mask is 1=Sunday … 7=Saturday, and the day meant is the
       LOCAL one — an 8pm New York bar is Friday there and Saturday in UTC. */
    if (!days.includes(String(local.getUTCDay() + 1))) return false;
  }
  const from = Number(m[1]);
  const to = Number(m[2]);
  return from <= to ? hhmm >= from && hhmm < to : hhmm >= from || hhmm < to;
}

/** OI at the nearest strike, this bar minus the previous one. */
function deltaOI(c: Ctx, price: number, side: 'call' | 'put', name: string): number | null {
  if (!c.slayer) return bookAt(c, name) as null;
  if (c.i === 0) return null;
  const here = c.slayer.book[c.i];
  const prev = c.slayer.book[c.i - 1];
  if (!here || !prev) return null;
  const a = strikeNear(here.strikes, price);
  const b = strikeNear(prev.strikes, price);
  if (!a || !b) return null;
  const now = side === 'call' ? a.callOI : a.putOI;
  const was = side === 'call' ? b.callOI : b.putOI;
  if (now === undefined || was === undefined) return null;
  return now - was;
}

/**
 * The shared body of `ta.pivothigh` / `ta.pivotlow`.
 *
 * Arguments come in two shapes — `(left, right)` reading the bar's own
 * high/low, or `(source, left, right)`. The candidate sits `right` bars
 * back; it is a pivot when nothing in the `left` bars before it and the
 * `right` bars after it beats it.
 */
function pivot(c: Ctx, a: PineValue[], slot: Slot, side: 'high' | 'low'): number | null {
  const threeArg = a.length >= 3;
  const left = Math.trunc(num(threeArg ? a[1] : a[0]));
  const right = Math.trunc(num(threeArg ? a[2] : a[1]));
  if (!Number.isFinite(left) || !Number.isFinite(right) || left < 1 || right < 1) return null;

  /* The source is a SERIES, so it is buffered here rather than indexed out
     of the bars — a script may pivot on something it computed itself. */
  const store = cell(slot, () => ({ buf: [] as number[] }));
  const v = threeArg ? num(a[0]) : side === 'high' ? c.bars[c.i].high : c.bars[c.i].low;
  store.buf.push(v);
  const need = left + right + 1;
  if (store.buf.length > need) store.buf.shift();
  if (store.buf.length < need) return null;

  const cand = store.buf[left];
  for (let k = 0; k < need; k++) {
    if (k === left) continue;
    if (side === 'high' ? store.buf[k] >= cand : store.buf[k] <= cand) return null;
  }
  return clean(cand);
}

/* ── the innards of matrix.* and map.*, which are arrays underneath ── */
const matCells = (v: PineValue): PineArray | null => {
  if (!isPineObject(v) || v.type !== 'matrix') return null;
  const cells = v.fields.get('cells');
  return isPineArray(cells) ? cells : null;
};
const matField = (v: PineValue, key: 'rows' | 'cols'): number | null => {
  if (!isPineObject(v) || v.type !== 'matrix') return null;
  const n = v.fields.get(key);
  return typeof n === 'number' ? n : null;
};
/** Row/column to a flat index, or null when it is off the matrix. */
const matAt = (v: PineValue, row: number, col: number): { cells: PineArray; index: number } | null => {
  const cells = matCells(v);
  const rows = matField(v, 'rows');
  const cols = matField(v, 'cols');
  if (!cells || rows === null || cols === null) return null;
  const r = Math.trunc(row);
  const c = Math.trunc(col);
  if (!Number.isFinite(r) || !Number.isFinite(c) || r < 0 || c < 0 || r >= rows || c >= cols) return null;
  return { cells, index: r * cols + c };
};
const mapOf = (v: PineValue): { keys: PineArray; vals: PineArray } | null => {
  if (!isPineObject(v) || v.type !== 'map') return null;
  const keys = v.fields.get('keys');
  const vals = v.fields.get('vals');
  return isPineArray(keys) && isPineArray(vals) ? { keys, vals } : null;
};

/** The finite numbers in a Pine array — the shape every statistic needs. */
function arrOf(v: PineValue): number[] {
  if (!isPineArray(v)) return [];
  const out: number[] = [];
  for (const x of v.items) {
    const n = typeof x === 'number' ? x : NaN;
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** One step of a weighted average, for the composites built on it. */
function wmaOf(slot: Slot, v: number, len: number): number | null {
  const w = win(slot, len);
  w.push(v);
  if (!w.full) return null;
  let acc = 0;
  let wt = 0;
  w.buf.forEach((x, k) => { const weight = k + 1; acc += x * weight; wt += weight; });
  return acc / wt;
}

/** The value at a percentile of a set, interpolated between neighbours. */
function percentileOf(values: readonly number[], pct: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  const at = (Math.max(0, Math.min(100, pct)) / 100) * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

// ── rolling window, shared by every windowed function ──────────────────────
class Win {
  buf: number[] = [];
  constructor(readonly n: number) {}
  push(v: number): void {
    this.buf.push(v);
    if (this.buf.length > this.n) this.buf.shift();
  }
  get full(): boolean { return this.buf.length >= this.n && this.n > 0; }
  sum(): number { return this.buf.reduce((a, b) => a + b, 0); }
  avg(): number { return this.sum() / this.buf.length; }
  max(): number { return Math.max(...this.buf); }
  min(): number { return Math.min(...this.buf); }
}

const win = (slot: Slot, n: number): Win => {
  const s = slot.v as { w?: Win; n?: number } | undefined;
  if (!s || s.n !== n) {
    const w = new Win(n);
    slot.v = { w, n };
    return w;
  }
  return s.w as Win;
};

/** A one-value memory — the previous input, the running state. */
const cell = <T>(slot: Slot, make: () => T): T => {
  if (slot.v === undefined) slot.v = make();
  return slot.v as T;
};

// ── the moving averages, seeded exactly as documented above ───────────────
function emaStep(slot: Slot, src: number, len: number): number | null {
  const st = cell(slot, () => ({ prev: null as number | null, len }));
  if (st.len !== len) { st.prev = null; st.len = len; }
  if (!Number.isFinite(src)) return st.prev;
  const k = 2 / (len + 1);
  st.prev = st.prev === null ? src : src * k + st.prev * (1 - k);
  return st.prev;
}

function rmaStep(slot: Slot, src: number, len: number): number | null {
  const st = cell(slot, () => ({ prev: null as number | null, seed: [] as number[], len }));
  if (st.len !== len) { st.prev = null; st.seed = []; st.len = len; }
  if (!Number.isFinite(src)) return st.prev;
  if (st.prev === null) {
    st.seed.push(src);
    if (st.seed.length < len) return null;
    st.prev = st.seed.reduce((a, b) => a + b, 0) / len;
    return st.prev;
  }
  st.prev = (src + st.prev * (len - 1)) / len;
  return st.prev;
}

function trueRange(ctx: Ctx, useNaPrev: boolean): number {
  const b = ctx.bars[ctx.i];
  const p = ctx.i > 0 ? ctx.bars[ctx.i - 1] : null;
  if (!p) return useNaPrev ? b.high - b.low : NaN;
  return Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close));
}

/* Every windowed function that needs its own sub-slot gets one, so a single
   call site holding two accumulators (macd holds three) never shares them. */
const sub = (slot: Slot, key: string): Slot => {
  const map = cell(slot, () => ({}) as Record<string, Slot>);
  if (!map[key]) map[key] = {};
  return map[key];
};

/*
  ── slayer.* ───────────────────────────────────────────────────────────────

  The dealer book, as a Pine series. See data/pine/feed.ts for the one
  distinction that matters — SERIES versus SNAPSHOT — and why the snapshot
  half reports itself.
*/

/** The book at this bar, or a loud failure when there is no desk behind it. */
const bookAt = (c: Ctx, name: string) => {
  if (!c.slayer) {
    throw new Error(
      `${name} needs this desk's dealer book, and this run was given none. A slayer.* script draws on a Terrain pane, against the symbol that pane is showing.`
    );
  }
  return c.slayer.book[c.i] ?? null;
};

/**
 * The desk's per-bar lanes — the tape, realised vol, the events.
 *
 * Same contract as `bookAt`: no feed at all is a loud failure, because a
 * script whose whole point is the desk's data must not quietly draw nothing.
 * A lane that is null AT THIS BAR is a different thing and answers `na`.
 */
/**
 * Said once per run that touches the tape, and worth the words.
 *
 * A reader whose flow indicator draws over the last twenty bars of a
 * six-hundred-bar chart will otherwise assume it is broken. It is not: that
 * is how far back the tape goes.
 */
const flowNote = (c: Ctx, _name: string): void => {
  /* THE MESSAGE DOES NOT NAME THE CALLER, deliberately. It is about the
     TAPE, and a script reading calls, puts and the net of them would
     otherwise print the same paragraph three times — de-duplication is by
     message, so one sentence covers all of them. */
  const from = c.slayer?.flowFromBar;
  c.note?.(
    from === null || from === undefined
      ? 'slayer.call_prem / .put_prem found no option tape behind these bars at all. The tape accumulates while the app is open; nothing has been recorded for this symbol yet.'
      : `the option tape accumulates while the app is open, and behind these bars it reaches back to bar ${from} of ${c.bars.length}. Earlier bars are na — NOT zero, because a zero would claim the market was quiet there when the truth is nobody was listening yet.`
  );
};

const deskAt = (c: Ctx, name: string) => {
  if (!c.slayer) {
    throw new Error(
      `${name} needs this desk's own data, and this run was given none. A slayer.* script draws on a Terrain pane, against the symbol that pane is showing.`
    );
  }
  return c.slayer.desk?.[c.i] ?? null;
};

/**
 * A level the desk computed once for the session.
 *
 * Reported with a NOTE the first time a run reads one, for the same reason
 * the greeks carry one: a session level plotted per bar draws a flat line,
 * and a flat line is indistinguishable from a level that held all day.
 */
const deskLevel = (c: Ctx, name: string, field: string, what: string): number | null => {
  if (!c.slayer) {
    throw new Error(
      `${name} needs this desk's own data, and this run was given none. A slayer.* script draws on a Terrain pane, against the symbol that pane is showing.`
    );
  }
  /*
    TWO NOTES, NOT ONE PER NAME.

    The rule is the same for every one of these, so saying it in full beside
    each is a wall rather than a warning: a session map reading seven levels
    printed seven near-identical paragraphs, and a reader skims past all
    seven. The explanation is said ONCE — de-duplication collapses it,
    because the sentence is identical whichever name raised it — and each
    name adds one short line saying what it is.

    THE NAME THE READER WROTE, not the field it is stored in. A note reading
    "slayer.em1Hi" sends someone looking for a name the language does not
    have.
  */
  c.note?.(
    "the slayer.* LEVELS — the profile, the expected move, yesterday's prices, the opening range — are each one reading for TODAY, not a history. Plotted on every bar they draw a flat line, which looks exactly like a level that held all day."
  );
  c.note?.(`${name} is ${what}.`);
  const lv = c.slayer.levels;
  if (!lv) return null;
  const v = (lv as unknown as Record<string, number | null>)[field];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/*
  TODAY'S CHAIN — and the sentence that goes in the report when a script
  touches it. One message per name, written for someone who is about to put
  a level on a chart and believe it.
*/
const chainNow = (c: Ctx, name: string, what: string) => {
  if (!c.slayer) {
    throw new Error(
      `${name} needs this desk's option chain, and this run was given none. A slayer.* script draws on a Terrain pane, against the symbol that pane is showing.`
    );
  }
  c.note?.(
    `${name} is ${what} on TODAY'S chain — one reading, repeated on every bar. It is not history, so a line drawn from it is flat by construction and a cross of it means nothing.`
  );
  return c.slayer.now;
};

/**
 * The strike carrying the most net GEX of one sign, spot playing no part.
 *
 * THE SIGN IS THE TRAP. This terminal's convention is NEGATIVE =
 * call-dominant, POSITIVE = put-dominant — `core/walls.ts` picks the call
 * wall from `v < 0` and the put wall from `v > 0`. Written the intuitive way
 * round, `slayer.heaviest_call` returns the put strike and every script
 * built on it draws resistance under price. It shipped that way for about
 * ten minutes.
 */
const heaviest = (c: Ctx, sign: 1 | -1, name: string): number | null => {
  const b = bookAt(c, name);
  if (!b) return null;
  let at: number | null = null;
  let best = 0;
  for (const s of b.strikes) {
    if (Math.sign(s.value) !== sign) continue;
    const a = Math.abs(s.value);
    if (a > best) { best = a; at = s.strike; }
  }
  return at;
};

/** Total net GEX strictly above or below this bar's close. */
const sideTotal = (c: Ctx, side: 'above' | 'below', name: string): number | null => {
  const b = bookAt(c, name);
  if (!b) return null;
  const spot = c.bars[c.i].close;
  let sum = 0;
  let hit = 0;
  for (const s of b.strikes) {
    if (side === 'above' ? s.strike > spot : s.strike < spot) { sum += s.value; hit += 1; }
  }
  return hit === 0 ? null : sum;
};

/** The nth heaviest strike of one sign, 1-based; na past the end of the book. */
const nth = (c: Ctx, sign: 1 | -1, rank: number, name: string): number | null => {
  const b = bookAt(c, name);
  if (!b || !Number.isFinite(rank) || rank < 1) return null;
  const side = b.strikes
    .filter(s => Math.sign(s.value) === sign)
    .sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
  return side[rank - 1]?.strike ?? null;
};

/** ΔOI summed across every strike, this bar against the one before. */
const bookDeltaOI = (c: Ctx, side: 'call' | 'put', name: string): number | null => {
  const here = bookAt(c, name);
  if (!here || c.i === 0) return null;
  const prev = c.slayer?.book[c.i - 1];
  if (!prev) return null;
  const was = new Map(prev.strikes.map(s => [s.strike, side === 'call' ? s.callOI : s.putOI]));
  let delta = 0;
  let seen = false;
  for (const s of here.strikes) {
    const now = side === 'call' ? s.callOI : s.putOI;
    const then = was.get(s.strike);
    if (now === undefined || then === undefined) continue;
    seen = true;
    delta += now - then;
  }
  return seen ? delta : null;
};

/** Net GEX at the strike nearest a price, per bar. */
const gexAt = (c: Ctx, price: number, name: string): number | null => {
  const b = bookAt(c, name);
  if (!b) return null;
  const s = strikeNear(b.strikes, price);
  return s ? s.value : null;
};

export const VARS: Record<string, (ctx: Ctx) => PineValue> = {
  /* ── the book, per bar ── */
  'slayer.netgex': c => { const b = bookAt(c, 'slayer.netgex'); return b ? b.netGex : null; },
  'slayer.callwall': c => { const b = bookAt(c, 'slayer.callwall'); return b?.callWall ?? null; },
  'slayer.putwall': c => { const b = bookAt(c, 'slayer.putwall'); return b?.putWall ?? null; },
  'slayer.flip': c => { const b = bookAt(c, 'slayer.flip'); return b?.flip ?? null; },
  'slayer.supreme': c => { const b = bookAt(c, 'slayer.supreme'); return b?.supreme ?? null; },

  /*
    THE TWO WALLS ABOVE ARE MEASURED FROM EACH BAR'S OWN SPOT — the call
    wall is the heaviest positive strike ABOVE price — so price can never
    cross them. That is the desk's canon and it is the right answer to
    "where is resistance now", but it makes `ta.crossover(close,
    slayer.callwall)` a line that cannot fire, ever, silently.

    These two are the same book read the other way: the heaviest strike of
    each sign ANYWHERE, spot playing no part. They are levels rather than
    bearings, so price crosses them, and a script about price meeting gamma
    wants these. (`slayer.callwall[1]` — the wall as it stood on the bar
    before — is the other honest way to ask the question.)
  */
  'slayer.heaviest_call': c => heaviest(c, -1, 'slayer.heaviest_call'),
  'slayer.heaviest_put': c => heaviest(c, 1, 'slayer.heaviest_put'),

  /*
    WHERE THE GAMMA SITS RELATIVE TO PRICE, which is the question the walls
    only answer one strike at a time. A book with everything overhead pushes
    differently from one with everything underneath, even when both name the
    same call wall.
  */
  'slayer.gex_above': c => sideTotal(c, 'above', 'slayer.gex_above'),
  'slayer.gex_below': c => sideTotal(c, 'below', 'slayer.gex_below'),

  /** Call wall minus put wall — the corridor, when the book has both sides. */
  'slayer.wall_width': c => {
    const b = bookAt(c, 'slayer.wall_width');
    if (!b || b.callWall === null || b.putWall === null) return null;
    return b.callWall - b.putWall;
  },

  /*
    THE BOOK'S PUT/CALL BALANCE, by open interest, at this bar. `na` rather
    than a number when the snapshot carries no OI — and `na` rather than
    Infinity when there are no calls at all, because a ratio with an empty
    denominator is not a large ratio, it is no answer.
  */
  'slayer.pc_oi': c => {
    const b = bookAt(c, 'slayer.pc_oi');
    if (!b) return null;
    let calls = 0;
    let puts = 0;
    let seen = false;
    for (const s of b.strikes) {
      if (s.callOI === undefined || s.putOI === undefined) continue;
      seen = true;
      calls += s.callOI;
      puts += s.putOI;
    }
    return !seen || calls <= 0 ? null : puts / calls;
  },

  /** Open interest OPENING across the whole book, not at one strike. */
  'slayer.doi_book_call': c => bookDeltaOI(c, 'call', 'slayer.doi_book_call'),
  'slayer.doi_book_put': c => bookDeltaOI(c, 'put', 'slayer.doi_book_put'),
  'slayer.step': c => { const b = bookAt(c, 'slayer.step'); return b && b.step > 0 ? b.step : null; },
  'slayer.strikes': c => { const b = bookAt(c, 'slayer.strikes'); return b ? b.strikes.length : 0; },
  /* Is there a book at THIS bar? The honest gate for a script that must not
     draw across the stretch of chart the history does not reach. */
  'slayer.has_book': c => bookAt(c, 'slayer.has_book') !== null,

  /* ── the option tape, bucketed into these bars ────────────────────────
     THE REACH IS THE CAVEAT AND IT IS SAID OUT LOUD. The tape accumulates
     from the moment the app opens and holds about four hours; older bars
     carry `na` rather than zero, because zero would say the market was quiet
     when what happened is that nobody was listening yet. */
  'slayer.call_prem': c => {
    const d = deskAt(c, 'slayer.call_prem');
    flowNote(c, 'slayer.call_prem');
    return d?.callPrem ?? null;
  },
  'slayer.put_prem': c => {
    const d = deskAt(c, 'slayer.put_prem');
    flowNote(c, 'slayer.put_prem');
    return d?.putPrem ?? null;
  },
  /** Call premium minus put premium — the bar's lean, in dollars. */
  'slayer.flow_net': c => {
    const d = deskAt(c, 'slayer.flow_net');
    flowNote(c, 'slayer.flow_net');
    if (!d || d.callPrem === null || d.putPrem === null) return null;
    return d.callPrem - d.putPrem;
  },
  /** True on a bar the option tape actually reaches. */
  'slayer.has_flow': c => {
    const d = deskAt(c, 'slayer.has_flow');
    return d !== null && d.callPrem !== null;
  },

  /* ── volatility ── */
  /** Annualised realised volatility off THESE bars, percent. A real series,
      so `ta.percentrank(slayer.rv, 200)` is a realised-vol rank. */
  'slayer.rv': c => deskAt(c, 'slayer.rv')?.rv ?? null,
  /** Today's implied, as the feed quotes it, percent. One reading. */
  'slayer.iv': c => deskLevel(c, 'slayer.iv', 'iv', "today's implied volatility"),

  /* ── the session's levels, from the desk's own canon ── */
  'slayer.vpoc': c => deskLevel(c, 'slayer.vpoc', 'vpoc', "the volume profile's point of control"),
  'slayer.vah': c => deskLevel(c, 'slayer.vah', 'vah', "the value area's high"),
  'slayer.val': c => deskLevel(c, 'slayer.val', 'val', "the value area's low"),
  'slayer.em1_hi': c => deskLevel(c, 'slayer.em1_hi', 'em1Hi', 'the one-sigma expected move, upper'),
  'slayer.em1_lo': c => deskLevel(c, 'slayer.em1_lo', 'em1Lo', 'the one-sigma expected move, lower'),
  'slayer.em2_hi': c => deskLevel(c, 'slayer.em2_hi', 'em2Hi', 'the two-sigma expected move, upper'),
  'slayer.em2_lo': c => deskLevel(c, 'slayer.em2_lo', 'em2Lo', 'the two-sigma expected move, lower'),
  'slayer.pdh': c => deskLevel(c, 'slayer.pdh', 'pdh', "yesterday's high"),
  'slayer.pdl': c => deskLevel(c, 'slayer.pdl', 'pdl', "yesterday's low"),
  'slayer.pdc': c => deskLevel(c, 'slayer.pdc', 'pdc', "yesterday's close"),
  'slayer.or_hi': c => deskLevel(c, 'slayer.or_hi', 'orHi', "the opening range's high"),
  'slayer.or_lo': c => deskLevel(c, 'slayer.or_lo', 'orLo', "the opening range's low"),
  'slayer.ib_hi': c => deskLevel(c, 'slayer.ib_hi', 'ibHi', "the initial balance's high"),
  'slayer.ib_lo': c => deskLevel(c, 'slayer.ib_lo', 'ibLo', "the initial balance's low"),
  /* Positive net gamma = put-dominant = dealers short gamma = amplify. The
     sign convention is the terminal's, unchanged, and worth having as a
     word so a script does not have to remember which way it runs. */
  'slayer.amplifying': c => { const b = bookAt(c, 'slayer.amplifying'); return b ? b.netGex > 0 : null; },
  'slayer.absorbing': c => { const b = bookAt(c, 'slayer.absorbing'); return b ? b.netGex < 0 : null; },

  /* ── today's chain, reported as such ── */
  'slayer.dex': c => chainNow(c, 'slayer.dex', 'net dealer DELTA exposure')?.netDex ?? null,
  'slayer.vex': c => chainNow(c, 'slayer.vex', 'net dealer VEGA exposure')?.netVex ?? null,
  'slayer.vanna': c => chainNow(c, 'slayer.vanna', 'net dealer VANNA exposure')?.netVanna ?? null,
  'slayer.charm': c => chainNow(c, 'slayer.charm', 'net dealer CHARM exposure')?.netCharm ?? null,
  'slayer.maxpain': c => chainNow(c, 'slayer.maxpain', 'the max-pain strike')?.maxPain ?? null,
  'slayer.gammapin': c => chainNow(c, 'slayer.gammapin', 'the gamma-weighted pin')?.gammaPin ?? null,


  open: c => c.bars[c.i].open,
  high: c => c.bars[c.i].high,
  low: c => c.bars[c.i].low,
  close: c => c.bars[c.i].close,
  volume: c => c.bars[c.i].volume,
  hl2: c => (c.bars[c.i].high + c.bars[c.i].low) / 2,
  hlc3: c => (c.bars[c.i].high + c.bars[c.i].low + c.bars[c.i].close) / 3,
  ohlc4: c => (c.bars[c.i].open + c.bars[c.i].high + c.bars[c.i].low + c.bars[c.i].close) / 4,
  hlcc4: c => (c.bars[c.i].high + c.bars[c.i].low + c.bars[c.i].close * 2) / 4,
  time: c => c.bars[c.i].time * 1000,
  time_close: c => c.bars[c.i].time * 1000,
  bar_index: c => c.i,
  last_bar_index: c => c.bars.length - 1,

  'barstate.isfirst': c => c.i === 0,
  'barstate.islast': c => c.i === c.bars.length - 1,
  /* Every bar this engine runs is a CLOSED bar out of the tape's history:
     there is no realtime tick here, so `isconfirmed` is true and
     `isrealtime` is false, on every bar, always. A script branching on them
     takes its historical path — which is the honest answer, and the reason
     `analyse.ts` does not refuse them. */
  'barstate.isconfirmed': () => true,
  'barstate.ishistory': () => true,
  'barstate.isrealtime': () => false,
  'barstate.isnew': () => true,

  'syminfo.ticker': c => c.ticker,
  'syminfo.tickerid': c => c.ticker,
  'syminfo.mintick': () => 0.01,
  'syminfo.timezone': () => 'America/New_York',
  'syminfo.currency': () => 'USD',
  'syminfo.type': () => 'stock',

  'timeframe.period': c => c.timeframe,
  'timeframe.multiplier': c => parseInt(c.timeframe, 10) || 1,
  'timeframe.isintraday': c => /m|h|s/.test(c.timeframe),
  'timeframe.isdaily': c => c.timeframe === '1D',
  'timeframe.isweekly': c => c.timeframe === '1W',
  'timeframe.isseconds': c => c.timeframe.endsWith('s'),
  'timeframe.isminutes': c => c.timeframe.endsWith('m'),
  /* `ta.tr` is BOTH a value and a call in Pine — the bare form is true range
     with na handled, `ta.tr(false)` leaves bar zero na. The call lives in
     FNS; this is the value, and without it every ATR script refused. */
  /*
    THE CALENDAR PARTS OF A BAR, in the exchange's zone rather than the
    reader's — a script gating on `hour >= 10` means ten in New York
    wherever the reader is sitting.
  */
  /* THE EXCHANGE CLOCK, arithmetic rather than a format per bar. `hour` in a
     filter is read on every bar of the tape, and an `Intl` call each time is
     what a chart re-running a script live cannot afford. */
  year: c => exchangeClock(c).getUTCFullYear(),
  month: c => exchangeClock(c).getUTCMonth() + 1,
  dayofmonth: c => exchangeClock(c).getUTCDate(),
  hour: c => exchangeClock(c).getUTCHours(),
  minute: c => exchangeClock(c).getUTCMinutes(),
  second: c => exchangeClock(c).getUTCSeconds(),
  /** Pine counts Sunday as 1 — and means the day at the EXCHANGE. */
  dayofweek: c => exchangeClock(c).getUTCDay() + 1,
  'syminfo.pointvalue': () => 1,
  'syminfo.session': () => 'regular',
  'syminfo.prefix': () => 'SIM',
  'syminfo.root': c => c.ticker,
  'syminfo.description': c => c.ticker,
  'timeframe.isdwm': c => /D|W|M/.test(c.timeframe) && !c.timeframe.endsWith('m'),
  'ta.tr': c => {
    const b = c.bars[c.i];
    const p = c.i > 0 ? c.bars[c.i - 1] : null;
    return p ? Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close)) : b.high - b.low;
  },
};

/* Named colours and the plot/shape enums, as their own literal strings — a
   script compares and passes these around, it never does arithmetic on them. */
const NAMED_COLORS: Record<string, string> = {
  'color.red': '#f23645', 'color.green': '#089981', 'color.blue': '#2962ff',
  'color.orange': '#ff9800', 'color.yellow': '#ffeb3b', 'color.purple': '#9c27b0',
  'color.white': '#ffffff', 'color.black': '#000000', 'color.gray': '#787b86',
  'color.silver': '#b2b5be', 'color.lime': '#00e676', 'color.maroon': '#880e4f',
  'color.navy': '#311b92', 'color.olive': '#808000', 'color.teal': '#00897b',
  'color.aqua': '#00bcd4', 'color.fuchsia': '#e040fb',
};

export const CONSTS: Record<string, PineValue> = {
  ...NAMED_COLORS,
  'shape.triangleup': 'triangleup', 'shape.triangledown': 'triangledown',
  'shape.circle': 'circle', 'shape.cross': 'cross', 'shape.diamond': 'diamond',
  'shape.square': 'square', 'shape.arrowup': 'arrowup', 'shape.arrowdown': 'arrowdown',
  'shape.labelup': 'labelup', 'shape.labeldown': 'labeldown', 'shape.flag': 'flag', 'shape.xcross': 'xcross',
  'location.abovebar': 'abovebar', 'location.belowbar': 'belowbar',
  'location.top': 'top', 'location.bottom': 'bottom', 'location.absolute': 'absolute',
  'size.tiny': 'tiny', 'size.small': 'small', 'size.normal': 'normal', 'size.large': 'large', 'size.huge': 'huge',
  'hline.style_solid': 'solid', 'hline.style_dashed': 'dashed', 'hline.style_dotted': 'dotted',
  /* `alert()`'s frequencies. The engine has no live alert bus, so these are
     carried for the script's sake rather than acted on — see the note the
     interpreter attaches when a script calls alert(). */
  'alert.freq_once_per_bar': 'once_per_bar', 'alert.freq_once_per_bar_close': 'once_per_bar_close',
  'alert.freq_all': 'all',
  'plot.style_line': 'line', 'plot.style_stepline': 'stepline', 'plot.style_histogram': 'histogram',
  'plot.style_circles': 'circles', 'plot.style_cross': 'cross', 'plot.style_area': 'area', 'plot.style_columns': 'columns',
  /* The `br` styles BREAK the line across `na` rather than joining over it,
     which is how every two-colour trend line is written — one plot for each
     direction, each `na` where the other is drawing. This engine already
     treats a null as a gap, so they are the line style with a name that
     says so. `plot.style_linebr` alone refused a Supertrend. */
  'plot.style_linebr': 'line', 'plot.style_stepline_diamond': 'stepline',
  'plot.style_steplinebr': 'stepline', 'plot.style_areabr': 'area',
  'extend.none': 'none', 'extend.left': 'left', 'extend.right': 'right', 'extend.both': 'both',
  'xloc.bar_index': 'bar_index', 'xloc.bar_time': 'bar_time',
  'yloc.price': 'price', 'yloc.abovebar': 'abovebar', 'yloc.belowbar': 'belowbar',
  'line.style_solid': 'solid', 'line.style_dashed': 'dashed', 'line.style_dotted': 'dotted',
  'label.style_none': 'label_none', 'label.style_label_left': 'label_left',
  'label.style_label_right': 'label_right', 'label.style_label_up': 'label_up',
  'label.style_label_down': 'label_down', 'label.style_text_outline': 'text_outline',
  'position.bottom_right': 'bottom_right', 'position.bottom_left': 'bottom_left',
  'position.top_right': 'top_right', 'position.top_left': 'top_left',
  'position.middle_right': 'middle_right', 'position.middle_left': 'middle_left',
  'text.align_left': 'left', 'text.align_right': 'right', 'text.align_center': 'center',
  /* `str.tostring(x, format.mintick)` — the price written to the symbol's own
     tick, which is how every level label on a chart is formatted. */
  'format.mintick': '#.##', 'format.percent': '#.##%', 'format.volume': 'volume',
  'format.inherit': '#.##',
  'text.align_top': 'top', 'text.align_bottom': 'bottom',
  'position.top_center': 'top_center', 'position.middle_center': 'middle_center',
  'position.bottom_center': 'bottom_center',
  'order.ascending': 'ascending',
  'order.descending': 'descending',
  'barmerge.lookahead_off': 'lookahead_off',
  /* Implemented, and REPORTED: a run that reads a higher bar before it closed
     names the lines that did it, because the reader cannot tell from the
     picture. See Interp.security and PineRun.notes. */
  'barmerge.lookahead_on': 'lookahead_on',
  'display.none': 'none', 'display.all': 'all', 'display.pane': 'pane', 'display.price_scale': 'price_scale',
  'math.pi': Math.PI, 'math.e': Math.E, 'math.phi': 1.618033988749895, 'math.rphi': 0.618033988749895,
};

export const FNS: Record<string, BuiltinFn> = {
  // ── na / nz ─────────────────────────────────────────────────────────────
  na: (_c, a) => a[0] === null || (typeof a[0] === 'number' && !Number.isFinite(a[0])),
  nz: (_c, a) => (a[0] === null || (typeof a[0] === 'number' && !Number.isFinite(a[0])) ? (a[1] ?? 0) : a[0]),
  fixnan: (_c, a, _n, slot) => {
    const st = cell(slot, () => ({ last: null as PineValue }));
    if (a[0] !== null && Number.isFinite(num(a[0]))) st.last = a[0];
    return st.last;
  },

  // ── math ────────────────────────────────────────────────────────────────
  'math.abs': (_c, a) => clean(Math.abs(num(a[0]))),
  'math.max': (_c, a) => clean(Math.max(...a.map(num))),
  'math.min': (_c, a) => clean(Math.min(...a.map(num))),
  'math.round': (_c, a) => {
    const p = a.length > 1 ? num(a[1]) : 0;
    const f = Math.pow(10, p);
    return clean(Math.round(num(a[0]) * f) / f);
  },
  'math.floor': (_c, a) => clean(Math.floor(num(a[0]))),
  'math.ceil': (_c, a) => clean(Math.ceil(num(a[0]))),
  'math.pow': (_c, a) => clean(Math.pow(num(a[0]), num(a[1]))),
  'math.sqrt': (_c, a) => clean(Math.sqrt(num(a[0]))),
  'math.exp': (_c, a) => clean(Math.exp(num(a[0]))),
  'math.log': (_c, a) => clean(Math.log(num(a[0]))),
  'math.log10': (_c, a) => clean(Math.log10(num(a[0]))),
  'math.sign': (_c, a) => clean(Math.sign(num(a[0]))),
  'math.avg': (_c, a) => clean(a.map(num).reduce((x, y) => x + y, 0) / a.length),
  'math.todegrees': (_c, a) => clean((num(a[0]) * 180) / Math.PI),
  'math.toradians': (_c, a) => clean((num(a[0]) * Math.PI) / 180),

  // ── ta: moving averages ─────────────────────────────────────────────────
  'ta.sma': (_c, a, _n, slot) => {
    const len = Math.trunc(num(a[1]));
    const w = win(slot, len);
    w.push(num(a[0]));
    return w.full ? clean(w.avg()) : null;
  },
  'ta.ema': (_c, a, _n, slot) => emaStep(slot, num(a[0]), Math.trunc(num(a[1]))),
  'ta.rma': (_c, a, _n, slot) => rmaStep(slot, num(a[0]), Math.trunc(num(a[1]))),
  'ta.smma': (_c, a, _n, slot) => rmaStep(slot, num(a[0]), Math.trunc(num(a[1]))),
  'ta.wma': (_c, a, _n, slot) => {
    const len = Math.trunc(num(a[1]));
    const w = win(slot, len);
    w.push(num(a[0]));
    if (!w.full) return null;
    let acc = 0;
    let wt = 0;
    w.buf.forEach((v, k) => { const weight = k + 1; acc += v * weight; wt += weight; });
    return clean(acc / wt);
  },
  'ta.vwma': (c, a, _n, slot) => {
    const len = Math.trunc(num(a[1]));
    const pv = win(sub(slot, 'pv'), len);
    const v = win(sub(slot, 'v'), len);
    pv.push(num(a[0]) * c.bars[c.i].volume);
    v.push(c.bars[c.i].volume);
    return pv.full && v.sum() !== 0 ? clean(pv.sum() / v.sum()) : null;
  },

  // ── ta: windows ─────────────────────────────────────────────────────────
  'ta.highest': (c, a, _n, slot) => {
    const [src, len] = a.length > 1 ? [num(a[0]), Math.trunc(num(a[1]))] : [c.bars[c.i].high, Math.trunc(num(a[0]))];
    const w = win(slot, len);
    w.push(src);
    return w.full ? clean(w.max()) : null;
  },
  /**
   * `ta.percentrank(source, length)` — where this value sits in its own
   * recent history, 0..100.
   *
   * THE ONLY THRESHOLD THAT TRAVELS. "Mark a build over 2,000 contracts"
   * marks 3% of five-minute bars and 12% of fifteen-minute ones on the same
   * tape, and something else again on a different symbol — so a script
   * written with a fixed number means a different thing everywhere it is
   * used. "Top 5% of the last 200 bars" means one thing everywhere.
   *
   * Pine's definition: the share of the PREVIOUS `length` values strictly
   * below the current one, so the window excludes the value being ranked.
   */
  'ta.percentrank': (_c, a, _n, slot) => {
    const src = num(a[0]);
    const len = Math.trunc(num(a[1]));
    const w = win(slot, len);
    const ranked = w.full ? (w.buf.filter(v => v < src).length / w.buf.length) * 100 : null;
    w.push(src);
    return ranked === null ? null : clean(ranked);
  },
  /** The middle of the window — a centre that a few huge prints cannot drag. */
  'ta.median': (_c, a, _n, slot) => {
    const w = win(slot, Math.trunc(num(a[1])));
    w.push(num(a[0]));
    if (!w.full) return null;
    const sorted = [...w.buf].sort((x, y) => x - y);
    const mid = sorted.length >> 1;
    return clean(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
  },
  /* Hull: a weighted average of two weighted averages, then a third over
     the root of the length — the shape is the definition, so it is written
     out rather than approximated with an EMA. */
  'ta.hma': (_c, a, _n, slot) => {
    const src = num(a[0]);
    const len = Math.max(1, Math.trunc(num(a[1])));
    const half = wmaOf(sub(slot, 'h'), src, Math.max(1, Math.round(len / 2)));
    const full = wmaOf(sub(slot, 'f'), src, len);
    if (half === null || full === null) return null;
    return clean(wmaOf(sub(slot, 'o'), 2 * half - full, Math.max(1, Math.round(Math.sqrt(len)))) ?? NaN);
  },
  /** Arnaud Legoux: a gaussian window offset toward the recent end. */
  'ta.alma': (_c, a, _n, slot) => {
    const len = Math.max(1, Math.trunc(num(a[1])));
    const offset = a.length > 2 ? num(a[2]) : 0.85;
    const sigma = a.length > 3 ? num(a[3]) : 6;
    const w = win(slot, len);
    w.push(num(a[0]));
    if (!w.full) return null;
    const m = offset * (len - 1);
    const sd = len / sigma;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < len; i++) {
      const weight = Math.exp(-((i - m) ** 2) / (2 * sd * sd));
      norm += weight;
      sum += w.buf[i] * weight;
    }
    return norm === 0 ? null : clean(sum / norm);
  },
  /** Symmetrically weighted, fixed at four bars: 1/6, 2/6, 2/6, 1/6. */
  'ta.swma': (_c, a, _n, slot) => {
    const w = win(slot, 4);
    w.push(num(a[0]));
    if (!w.full) return null;
    return clean((w.buf[0] * 1 + w.buf[1] * 2 + w.buf[2] * 2 + w.buf[3] * 1) / 6);
  },
  /** Mean absolute deviation from the window's own mean. */
  'ta.dev': (_c, a, _n, slot) => {
    const w = win(slot, Math.trunc(num(a[1])));
    w.push(num(a[0]));
    if (!w.full) return null;
    const mean = w.avg();
    return clean(w.buf.reduce((n, v) => n + Math.abs(v - mean), 0) / w.buf.length);
  },
  /** Least-squares fit over the window, read `offset` bars from its end. */
  'ta.linreg': (_c, a, _n, slot) => {
    const len = Math.max(2, Math.trunc(num(a[1])));
    const offset = a.length > 2 ? Math.trunc(num(a[2])) : 0;
    const w = win(slot, len);
    w.push(num(a[0]));
    if (!w.full) return null;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let i = 0; i < len; i++) {
      sx += i; sy += w.buf[i]; sxy += i * w.buf[i]; sxx += i * i;
    }
    const denom = len * sxx - sx * sx;
    if (denom === 0) return null;
    const slope = (len * sxy - sx * sy) / denom;
    const intercept = (sy - slope * sx) / len;
    return clean(intercept + slope * (len - 1 - offset));
  },
  /** Commodity channel index — typical price against its own mean deviation. */
  'ta.cci': (c, a, _n, slot) => {
    const src = a.length > 1 ? num(a[0]) : (c.bars[c.i].high + c.bars[c.i].low + c.bars[c.i].close) / 3;
    const len = Math.trunc(num(a.length > 1 ? a[1] : a[0]));
    const w = win(slot, len);
    w.push(src);
    if (!w.full) return null;
    const mean = w.avg();
    const dev = w.buf.reduce((n, v) => n + Math.abs(v - mean), 0) / w.buf.length;
    return dev === 0 ? null : clean((src - mean) / (0.015 * dev));
  },
  /** Money flow — volume signed by the direction of typical price. */
  'ta.mfi': (c, a, _n, slot) => {
    const b = c.bars[c.i];
    const tp = a.length > 1 && typeof a[0] === 'number' ? num(a[0]) : (b.high + b.low + b.close) / 3;
    const len = Math.trunc(num(a.length > 1 ? a[1] : a[0]));
    const st = cell(slot, () => ({ prev: NaN, pos: [] as number[], neg: [] as number[] }));
    const flow = tp * b.volume;
    if (Number.isFinite(st.prev)) {
      st.pos.push(tp > st.prev ? flow : 0);
      st.neg.push(tp < st.prev ? flow : 0);
      if (st.pos.length > len) { st.pos.shift(); st.neg.shift(); }
    }
    st.prev = tp;
    if (st.pos.length < len) return null;
    const up = st.pos.reduce((n, v) => n + v, 0);
    const dn = st.neg.reduce((n, v) => n + v, 0);
    return dn === 0 ? 100 : clean(100 - 100 / (1 + up / dn));
  },
  /** Williams %R — where the close sits in its own range, 0 to -100. */
  'ta.wpr': (c, a, _n, slot) => {
    const len = Math.trunc(num(a[0]));
    const hi = win(sub(slot, 'h'), len);
    const lo = win(sub(slot, 'l'), len);
    hi.push(c.bars[c.i].high);
    lo.push(c.bars[c.i].low);
    if (!hi.full) return null;
    const h = hi.max();
    const l = lo.min();
    return h === l ? null : clean((-100 * (h - c.bars[c.i].close)) / (h - l));
  },
  /** True strength — double-smoothed momentum over its own magnitude. */
  'ta.tsi': (_c, a, _n, slot) => {
    const src = num(a[0]);
    const shortLen = Math.trunc(num(a[1]));
    const longLen = Math.trunc(num(a[2]));
    const st = cell(slot, () => ({ prev: NaN }));
    const diff = Number.isFinite(st.prev) ? src - st.prev : 0;
    st.prev = src;
    const smooth = emaStep(sub(slot, 'a'), diff, longLen);
    const dbl = smooth === null ? null : emaStep(sub(slot, 'b'), smooth, shortLen);
    const absSmooth = emaStep(sub(slot, 'c'), Math.abs(diff), longLen);
    const absDbl = absSmooth === null ? null : emaStep(sub(slot, 'd'), absSmooth, shortLen);
    if (dbl === null || absDbl === null || absDbl === 0) return null;
    return clean(dbl / absDbl);
  },
  /** Chande momentum — up moves against down moves, -100 to 100. */
  'ta.cmo': (_c, a, _n, slot) => {
    const src = num(a[0]);
    const len = Math.trunc(num(a[1]));
    const st = cell(slot, () => ({ prev: NaN, up: [] as number[], dn: [] as number[] }));
    if (Number.isFinite(st.prev)) {
      const d = src - st.prev;
      st.up.push(Math.max(d, 0));
      st.dn.push(Math.max(-d, 0));
      if (st.up.length > len) { st.up.shift(); st.dn.shift(); }
    }
    st.prev = src;
    if (st.up.length < len) return null;
    const u = st.up.reduce((n, v) => n + v, 0);
    const d = st.dn.reduce((n, v) => n + v, 0);
    return u + d === 0 ? 0 : clean((100 * (u - d)) / (u + d));
  },
  /** The window's own span. */
  'ta.range': (_c, a, _n, slot) => {
    const w = win(slot, Math.trunc(num(a[1])));
    w.push(num(a[0]));
    return w.full ? clean(w.max() - w.min()) : null;
  },
  /** Pearson correlation of two series over a window. */
  'ta.correlation': (_c, a, _n, slot) => {
    const len = Math.trunc(num(a[2]));
    const x = win(sub(slot, 'x'), len);
    const y = win(sub(slot, 'y'), len);
    x.push(num(a[0]));
    y.push(num(a[1]));
    if (!x.full) return null;
    const mx = x.avg();
    const my = y.avg();
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < len; i++) {
      sxy += (x.buf[i] - mx) * (y.buf[i] - my);
      sxx += (x.buf[i] - mx) ** 2;
      syy += (y.buf[i] - my) ** 2;
    }
    return sxx === 0 || syy === 0 ? null : clean(sxy / Math.sqrt(sxx * syy));
  },
  /** The value at a percentile of the window, interpolated between ranks. */
  'ta.percentile_linear_interpolation': (_c, a, _n, slot) => {
    const w = win(slot, Math.trunc(num(a[1])));
    w.push(num(a[0]));
    if (!w.full) return null;
    return clean(percentileOf(w.buf, num(a[2])));
  },
  'ta.percentile_nearest_rank': (_c, a, _n, slot) => {
    const w = win(slot, Math.trunc(num(a[1])));
    w.push(num(a[0]));
    if (!w.full) return null;
    const sorted = [...w.buf].sort((x, y) => x - y);
    const rank = Math.ceil((Math.max(0, Math.min(100, num(a[2]))) / 100) * sorted.length);
    return clean(sorted[Math.max(0, Math.min(sorted.length - 1, rank - 1))]);
  },
  /** The running extreme over every bar so far, not a window. */
  'ta.max': (_c, a, _n, slot) => {
    const st = cell(slot, () => ({ v: -Infinity }));
    const v = num(a[0]);
    if (Number.isFinite(v)) st.v = Math.max(st.v, v);
    return Number.isFinite(st.v) ? st.v : null;
  },
  'ta.min': (_c, a, _n, slot) => {
    const st = cell(slot, () => ({ v: Infinity }));
    const v = num(a[0]);
    if (Number.isFinite(v)) st.v = Math.min(st.v, v);
    return Number.isFinite(st.v) ? st.v : null;
  },
  /*
    Parabolic SAR — a stateful trend-follower, so it carries its own trend,
    extreme point and acceleration across bars rather than reading a window.
  */
  'ta.sar': (c, a, _n, slot) => {
    const start = num(a[0]);
    const inc = num(a[1]);
    const maxAf = num(a[2]);
    const b = c.bars[c.i];
    const st = cell(slot, () => ({ init: false, up: true, sar: 0, ep: 0, af: 0 }));
    if (!st.init) {
      st.init = true;
      st.up = true;
      st.sar = b.low;
      st.ep = b.high;
      st.af = start;
      return clean(st.sar);
    }
    st.sar += st.af * (st.ep - st.sar);
    if (st.up) {
      if (b.low < st.sar) { st.up = false; st.sar = st.ep; st.ep = b.low; st.af = start; }
      else if (b.high > st.ep) { st.ep = b.high; st.af = Math.min(maxAf, st.af + inc); }
    } else {
      if (b.high > st.sar) { st.up = true; st.sar = st.ep; st.ep = b.high; st.af = start; }
      else if (b.low < st.ep) { st.ep = b.low; st.af = Math.min(maxAf, st.af + inc); }
    }
    return clean(st.sar);
  },
  /** Directional movement: [adx, +di, -di]. */
  'ta.dmi': (c, a, _n, slot) => {
    const diLen = Math.trunc(num(a[0]));
    const adxLen = Math.trunc(num(a[1]));
    const b = c.bars[c.i];
    const p = c.i > 0 ? c.bars[c.i - 1] : null;
    const upMove = p ? b.high - p.high : 0;
    const dnMove = p ? p.low - b.low : 0;
    const plus = upMove > dnMove && upMove > 0 ? upMove : 0;
    const minus = dnMove > upMove && dnMove > 0 ? dnMove : 0;
    const tr = p ? Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close)) : b.high - b.low;
    const trR = rmaStep(sub(slot, 't'), tr, diLen);
    const plusR = rmaStep(sub(slot, 'p'), plus, diLen);
    const minusR = rmaStep(sub(slot, 'm'), minus, diLen);
    if (trR === null || plusR === null || minusR === null || trR === 0) return [null, null, null];
    const pdi = (100 * plusR) / trR;
    const mdi = (100 * minusR) / trR;
    const sum = pdi + mdi;
    const dx = sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum;
    const adx = rmaStep(sub(slot, 'a'), dx, adxLen);
    return [adx === null ? null : clean(adx), clean(pdi), clean(mdi)];
  },
  /** Keltner channel: [middle, upper, lower]. */
  'ta.kc': (c, a, _n, slot) => {
    const src = num(a[0]);
    const len = Math.trunc(num(a[1]));
    const mult = num(a[2]);
    const basis = emaStep(sub(slot, 'b'), src, len);
    const b = c.bars[c.i];
    const p = c.i > 0 ? c.bars[c.i - 1] : null;
    const tr = p ? Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close)) : b.high - b.low;
    const band = rmaStep(sub(slot, 'r'), tr, len);
    if (basis === null || band === null) return [null, null, null];
    return [clean(basis), clean(basis + band * mult), clean(basis - band * mult)];
  },
  'ta.lowest': (c, a, _n, slot) => {
    const [src, len] = a.length > 1 ? [num(a[0]), Math.trunc(num(a[1]))] : [c.bars[c.i].low, Math.trunc(num(a[0]))];
    const w = win(slot, len);
    w.push(src);
    return w.full ? clean(w.min()) : null;
  },
  'ta.stdev': (_c, a, _n, slot) => {
    const len = Math.trunc(num(a[1]));
    const w = win(slot, len);
    w.push(num(a[0]));
    if (!w.full) return null;
    const m = w.avg();
    return clean(Math.sqrt(w.buf.reduce((s, v) => s + (v - m) * (v - m), 0) / w.n));
  },
  'ta.variance': (_c, a, _n, slot) => {
    const len = Math.trunc(num(a[1]));
    const w = win(slot, len);
    w.push(num(a[0]));
    if (!w.full) return null;
    const m = w.avg();
    return clean(w.buf.reduce((s, v) => s + (v - m) * (v - m), 0) / w.n);
  },
  'ta.cum': (_c, a, _n, slot) => {
    const st = cell(slot, () => ({ s: 0 }));
    const v = num(a[0]);
    if (Number.isFinite(v)) st.s += v;
    return clean(st.s);
  },

  // ── ta: change and crosses ──────────────────────────────────────────────
  'ta.change': (_c, a, _n, slot) => {
    const back = a.length > 1 ? Math.trunc(num(a[1])) : 1;
    const w = win(slot, back + 1);
    w.push(num(a[0]));
    return w.buf.length > back ? clean(w.buf[w.buf.length - 1] - w.buf[0]) : null;
  },
  'ta.mom': (_c, a, _n, slot) => {
    const back = Math.trunc(num(a[1]));
    const w = win(slot, back + 1);
    w.push(num(a[0]));
    return w.buf.length > back ? clean(w.buf[w.buf.length - 1] - w.buf[0]) : null;
  },
  'ta.roc': (_c, a, _n, slot) => {
    const back = Math.trunc(num(a[1]));
    const w = win(slot, back + 1);
    w.push(num(a[0]));
    if (w.buf.length <= back || w.buf[0] === 0) return null;
    return clean(((w.buf[w.buf.length - 1] - w.buf[0]) / w.buf[0]) * 100);
  },
  'ta.crossover': (_c, a, _n, slot) => {
    const st = cell(slot, () => ({ pa: null as number | null, pb: null as number | null }));
    const x = num(a[0]);
    const y = num(a[1]);
    const out = st.pa !== null && st.pb !== null && st.pa <= st.pb && x > y;
    st.pa = x; st.pb = y;
    return out;
  },
  'ta.crossunder': (_c, a, _n, slot) => {
    const st = cell(slot, () => ({ pa: null as number | null, pb: null as number | null }));
    const x = num(a[0]);
    const y = num(a[1]);
    const out = st.pa !== null && st.pb !== null && st.pa >= st.pb && x < y;
    st.pa = x; st.pb = y;
    return out;
  },
  'ta.cross': (_c, a, _n, slot) => {
    const st = cell(slot, () => ({ pa: null as number | null, pb: null as number | null }));
    const x = num(a[0]);
    const y = num(a[1]);
    const out = st.pa !== null && st.pb !== null && ((st.pa <= st.pb && x > y) || (st.pa >= st.pb && x < y));
    st.pa = x; st.pb = y;
    return out;
  },
  'ta.rising': (_c, a, _n, slot) => {
    const len = Math.trunc(num(a[1]));
    const w = win(slot, len + 1);
    w.push(num(a[0]));
    if (w.buf.length < len + 1) return false;
    return w.buf.every((v, k) => k === 0 || v > w.buf[k - 1]);
  },
  'ta.falling': (_c, a, _n, slot) => {
    const len = Math.trunc(num(a[1]));
    const w = win(slot, len + 1);
    w.push(num(a[0]));
    if (w.buf.length < len + 1) return false;
    return w.buf.every((v, k) => k === 0 || v < w.buf[k - 1]);
  },
  'ta.barssince': (_c, a, _n, slot) => {
    const st = cell(slot, () => ({ n: null as number | null }));
    if (truthy(a[0])) st.n = 0;
    else if (st.n !== null) st.n += 1;
    return st.n;
  },
  'ta.valuewhen': (_c, a, _n, slot) => {
    const st = cell(slot, () => ({ hits: [] as PineValue[] }));
    if (truthy(a[0])) st.hits.unshift(a[1] ?? null);
    const occ = a.length > 2 ? Math.trunc(num(a[2])) : 0;
    return st.hits[occ] ?? null;
  },

  // ── ta: the named studies ───────────────────────────────────────────────
  'ta.tr': (c, a) => clean(trueRange(c, a.length > 0 && truthy(a[0]))),
  /*
    `ta.atr(len)` is `ta.rma(ta.tr(true), len)`, and `ta.tr(true)` on the
    very first bar is `high - low` because there is no previous close to
    reach for. That first bar IS in the average.

    This is where the engine and `atrBarSeries` in data/indicators.ts part
    company, deliberately: the tape's own ATR starts true range at bar 1 and
    lands its first value on bar `len`, Pine's includes bar 0 and lands on
    bar `len - 1`. Neither is wrong; they are different definitions, and a
    Pine engine owes the reader Pine's. A script's ATR and the tape's ATR
    pane will therefore differ slightly on the left edge, which is a real
    fact about the two definitions rather than a fault in either.
  */
  'ta.atr': (c, a, _n, slot) => rmaStep(slot, trueRange(c, true), Math.trunc(num(a[0]))),
  'ta.rsi': (_c, a, _n, slot) => {
    const len = Math.trunc(num(a[1]));
    const st = cell(slot, () => ({ prev: null as number | null }));
    const src = num(a[0]);
    const ch = st.prev === null ? null : src - st.prev;
    st.prev = src;
    /* THE FIRST BAR HAS NO CHANGE, and must not be fed to the averages as a
       zero: doing that put a spurious value in rma's seed window and moved
       every RSI reading by a bar. Pine's own definition takes
       `src - src[1]`, which is na on bar 0 and contributes nothing. */
    if (ch === null) return null;
    const g = rmaStep(sub(slot, 'g'), Math.max(ch, 0), len);
    const l = rmaStep(sub(slot, 'l'), Math.max(-ch, 0), len);
    if (g === null || l === null) return null;
    if (l === 0) return g === 0 ? 50 : 100;
    return clean(100 - 100 / (1 + g / l));
  },
  'ta.stoch': (_c, a, _n, slot) => {
    const [src, hi, lo, len] = [num(a[0]), num(a[1]), num(a[2]), Math.trunc(num(a[3]))];
    const wh = win(sub(slot, 'h'), len);
    const wl = win(sub(slot, 'l'), len);
    wh.push(hi);
    wl.push(lo);
    if (!wh.full) return null;
    const range = wh.max() - wl.min();
    return range === 0 ? 0 : clean(((src - wl.min()) / range) * 100);
  },
  'ta.macd': (_c, a, _n, slot) => {
    const [src, f, s, sg] = [num(a[0]), Math.trunc(num(a[1])), Math.trunc(num(a[2])), Math.trunc(num(a[3]))];
    const fast = emaStep(sub(slot, 'f'), src, f);
    const slow = emaStep(sub(slot, 's'), src, s);
    const macd = fast === null || slow === null ? null : fast - slow;
    const sig = macd === null ? null : emaStep(sub(slot, 'g'), macd, sg);
    const hist = macd === null || sig === null ? null : macd - sig;
    return [macd, sig, hist];
  },
  'ta.bb': (_c, a, _n, slot) => {
    const [src, len, mult] = [num(a[0]), Math.trunc(num(a[1])), num(a[2])];
    const w = win(sub(slot, 'w'), len);
    w.push(src);
    if (!w.full) return [null, null, null];
    const basis = w.avg();
    const dev = Math.sqrt(w.buf.reduce((s, v) => s + (v - basis) * (v - basis), 0) / len) * mult;
    return [clean(basis), clean(basis + dev), clean(basis - dev)];
  },

  // ── strings ─────────────────────────────────────────────────────────────
  /* `timeframe.in_seconds()` with no argument is THIS chart's interval; with
     one, the interval named. Scripts use it to gate a level set — the DNF
     anchors only draw when the chart is at or below daily — so refusing it
     took out a whole indicator over one arithmetic call. */
  'timeframe.in_seconds': (c: Ctx, a: PineValue[]) => {
    /* With an argument it is a PINE interval string and parses as one. With
       none it is this chart's own, which the host hands over as a number —
       the desk's "5m" is not Pine's "5", and read as Pine it means months. */
    if (typeof a[0] === 'string' && a[0] !== '') {
      const m = pineTfMinutes(a[0]);
      return m === null ? null : m * 60;
    }
    return Math.max(1, Math.round(c.chartMinutes * 60));
  },
  /* ── slayer.*, the parts that take an argument ── */

  /** Net GEX at the strike nearest a price — `slayer.gex(close)`. */
  'slayer.gex': (c: Ctx, a: PineValue[]) => gexAt(c, num(a[0]), 'slayer.gex'),

  /**
   * Net GEX summed over every strike within ±pct% of this bar's close.
   *
   * The number a reader actually wants when they ask "how much gamma is
   * price sitting in" — one strike's value depends on where the chain's
   * spacing happens to fall, a band does not.
   */
  'slayer.gex_band': (c: Ctx, a: PineValue[]) => {
    const b = bookAt(c, 'slayer.gex_band');
    if (!b) return null;
    const pct = Number.isFinite(num(a[0])) ? Math.abs(num(a[0])) : 1;
    const spot = c.bars[c.i].close;
    const lo = spot * (1 - pct / 100);
    const hi = spot * (1 + pct / 100);
    let sum = 0;
    let hit = 0;
    for (const s of b.strikes) {
      if (s.strike >= lo && s.strike <= hi) { sum += s.value; hit += 1; }
    }
    return hit === 0 ? null : sum;
  },

  /* Open interest at the nearest strike. Undefined on a snapshot recorded
     before OI was carried, and that reads as `na` rather than as zero — the
     difference between "no calls are open here" and "nobody wrote it down". */
  'slayer.call_oi': (c: Ctx, a: PineValue[]) => {
    const b = bookAt(c, 'slayer.call_oi');
    const s = b ? strikeNear(b.strikes, num(a[0])) : null;
    return s?.callOI ?? null;
  },
  'slayer.put_oi': (c: Ctx, a: PineValue[]) => {
    const b = bookAt(c, 'slayer.put_oi');
    const s = b ? strikeNear(b.strikes, num(a[0])) : null;
    return s?.putOI ?? null;
  },

  /**
   * ΔOI at the nearest strike, this bar against the one before.
   *
   * Positions being OPENED at a strike, which is the thing that turns a
   * gamma level from a leftover into a live one. `na` at bar zero and
   * wherever either side of the comparison has no OI recorded — never a
   * zero, which would read as "nothing changed".
   */
  'slayer.doi_call': (c: Ctx, a: PineValue[]) => deltaOI(c, num(a[0]), 'call', 'slayer.doi_call'),
  'slayer.doi_put': (c: Ctx, a: PineValue[]) => deltaOI(c, num(a[0]), 'put', 'slayer.doi_put'),

  /*
    THE nTH HEAVIEST STRIKE OF EACH SIGN, so a script can draw a LADDER
    rather than one wall. `slayer.nth_call(1)` is the heaviest call-dominant
    strike, `(2)` the next, and so on; `na` once the book runs out, which is
    what stops a loop drawing lines at strikes that are not there.
  */
  'slayer.nth_call': (c: Ctx, a: PineValue[]) => nth(c, -1, Math.trunc(num(a[0])), 'slayer.nth_call'),
  'slayer.nth_put': (c: Ctx, a: PineValue[]) => nth(c, 1, Math.trunc(num(a[0])), 'slayer.nth_put'),

  /** Distance from a price to the nearest of the two walls, in price. */
  'slayer.wall_gap': (c: Ctx, a: PineValue[]) => {
    const b = bookAt(c, 'slayer.wall_gap');
    if (!b) return null;
    const px = Number.isFinite(num(a[0])) ? num(a[0]) : c.bars[c.i].close;
    const gaps: number[] = [];
    if (b.callWall !== null) gaps.push(Math.abs(b.callWall - px));
    if (b.putWall !== null) gaps.push(Math.abs(b.putWall - px));
    return gaps.length === 0 ? null : Math.min(...gaps);
  },

  /* THE TYPE CASTS. `int(x)` truncates toward zero — Pine's own rule, and
     the difference between "3b" and "3.0000000004b" in a label. */
  int: (_c, a) => { const n = num(a[0]); return Number.isFinite(n) ? Math.trunc(n) : null; },
  /* THE OBJECT CASTS are Pine's way of typing an `na` — `line(na)` is how a
     function returns "no line". This engine is untyped, so they are the
     identity; they exist because without them the idiom is a refusal. */
  line: (_c, a) => a[0] ?? null,
  label: (_c, a) => a[0] ?? null,
  box: (_c, a) => a[0] ?? null,
  table: (_c, a) => a[0] ?? null,
  float: (_c, a) => clean(num(a[0])),
  bool: (_c, a) => truthy(a[0]),
  string: (_c, a) => (a[0] === null ? 'NaN' : String(a[0])),

  /*
    `str.format_time(t, format, timezone)` — a bar's clock time, in the
    exchange's zone rather than the reader's. A dashboard row saying a
    trigger fired at 10:35 has to mean 10:35 in New York wherever the reader
    is sitting, so the zone is honoured through Intl rather than assumed.
  */
  'math.sin': (_c, a) => clean(Math.sin(num(a[0]))),
  'math.cos': (_c, a) => clean(Math.cos(num(a[0]))),
  'math.tan': (_c, a) => clean(Math.tan(num(a[0]))),
  'math.asin': (_c, a) => clean(Math.asin(num(a[0]))),
  'math.acos': (_c, a) => clean(Math.acos(num(a[0]))),
  'math.atan': (_c, a) => clean(Math.atan(num(a[0]))),
  /** A rolling sum — `ta.cum` runs from bar one, this runs over a window. */
  'math.sum': (_c, a, _n, slot) => {
    const w = win(slot, Math.trunc(num(a[1])));
    w.push(num(a[0]));
    return w.full ? clean(w.sum()) : null;
  },

  /*
    `ta.pivothigh(source, left, right)` — the highest of a window, reported
    on the bar where it became KNOWN.

    It was refused on the grounds that "pivots need bars that have not
    happened yet", which is half true and the wrong half. Pine does not
    report a pivot on the bar it sits on: it reports it `right` bars later,
    once the bars that confirm it have printed, and the value is the high
    from `right` bars ago. Nothing is read early. Refusing it took out every
    market-structure script there is.

    `na` on every bar where no pivot completed, which is most of them.
  */
  'ta.pivothigh': (c, a, _n, slot) => pivot(c, a, slot, 'high'),
  'ta.pivotlow': (c, a, _n, slot) => pivot(c, a, slot, 'low'),

  /*
    `str.format("{0} {1,number,#.##}", a, b)` — Pine's own placeholder form.
    Only the parts scripts actually use: the index, and a number pattern
    whose decimal places are counted off the `#.##`.
  */
  'str.format': (_c, a) => {
    const template = typeof a[0] === 'string' ? a[0] : '';
    const rest = a.slice(1);
    return template.replace(/\{(\d+)(?:,[^}]*?(?:#+(?:\.(#+|0+))?|0+(?:\.(0+))?)[^}]*)?\}/g, (whole, idx: string, dp1?: string, dp2?: string) => {
      const v = rest[Number(idx)];
      if (v === undefined || v === null) return 'NaN';
      const places = (dp1 ?? dp2 ?? '').length;
      if (typeof v === 'number') return whole.includes(',') ? v.toFixed(places) : String(v);
      return String(v);
    });
  },
  'str.substring': (_c, a) => {
    const src = typeof a[0] === 'string' ? a[0] : '';
    const from = Math.max(0, Math.trunc(num(a[1])) || 0);
    const to = a.length > 2 ? Math.trunc(num(a[2])) : src.length;
    return src.slice(from, Number.isFinite(to) ? to : src.length);
  },
  'str.replace_all': (_c, a) => String(a[0] ?? '').split(String(a[1] ?? '')).join(String(a[2] ?? '')),
  'str.replace': (_c, a) => {
    const src = String(a[0] ?? '');
    const find = String(a[1] ?? '');
    const at = a.length > 3 ? Math.trunc(num(a[3])) : 0;
    let seen = -1;
    let from = 0;
    for (;;) {
      const idx = src.indexOf(find, from);
      if (idx < 0) return src;
      seen += 1;
      if (seen === at) return src.slice(0, idx) + String(a[2] ?? '') + src.slice(idx + find.length);
      from = idx + Math.max(1, find.length);
    }
  },
  'str.contains': (_c, a) => String(a[0] ?? '').includes(String(a[1] ?? '')),
  'str.startswith': (_c, a) => String(a[0] ?? '').startsWith(String(a[1] ?? '')),
  'str.endswith': (_c, a) => String(a[0] ?? '').endsWith(String(a[1] ?? '')),
  'str.pos': (_c, a) => {
    const at = String(a[0] ?? '').indexOf(String(a[1] ?? ''));
    return at < 0 ? null : at;
  },
  'str.tonumber': (_c, a) => {
    const v = Number(String(a[0] ?? '').trim());
    return Number.isFinite(v) ? v : null;
  },
  'str.trim': (_c, a) => String(a[0] ?? '').trim(),
  'str.repeat': (_c, a) => {
    const n = Math.max(0, Math.min(1000, Math.trunc(num(a[1])) || 0));
    return String(a[0] ?? '').repeat(n) + (a.length > 2 ? '' : '');
  },
  'str.split': (_c, a) => newPineArray(String(a[0] ?? '').split(String(a[1] ?? ','))),

  'str.format_time': (_c, a) => {
    const ms = num(a[0]);
    if (!Number.isFinite(ms)) return 'NaN';
    const fmt = typeof a[1] === 'string' ? a[1] : 'yyyy-MM-dd';
    const tz = typeof a[2] === 'string' ? a[2] : 'America/New_York';
    return formatClock(ms, fmt, tz);
  },

  /*
    `time(timeframe, session)` — the bar's timestamp when it falls inside the
    session window, `na` when it does not. Scripts use it as a display filter
    ("is this the midday lull?"), so `not na(time(...))` is the idiom and the
    na is load-bearing.
  */
  time: (c, a) => {
    const bar = c.bars[c.i];
    if (!bar) return null;
    const tf = typeof a[0] === 'string' && a[0] !== '' ? a[0] : null;
    const sess = typeof a[1] === 'string' ? a[1] : null;
    const tz = typeof a[2] === 'string' ? a[2] : 'America/New_York';
    /* `time(tf)` is the OPENING TIME OF THE tf BAR this one sits in, which is
       constant across that bar and changes once when a new one starts. That
       change is the session-reset idiom; the bar's own timestamp, which this
       used to return, changes on every bar and fires the reset every time. */
    const at = tf ? bucketStart(bar.time, tf, tz) : bar.time;
    if (!sess) return at * 1000;
    return inSession(bar.time * 1000, sess, tz) ? at * 1000 : null;
  },

  'str.tostring': (_c, a) => {
    const v = a[0];
    if (v === null) return 'NaN';
    if (typeof v === 'number') {
      const fmt = typeof a[1] === 'string' ? a[1] : null;
      if (fmt) {
        const dp = (fmt.split('.')[1] ?? '').length;
        return v.toFixed(dp);
      }
      return String(Math.round(v * 1e10) / 1e10);
    }
    return String(v);
  },
  'str.length': (_c, a) => String(a[0] ?? '').length,
  'str.upper': (_c, a) => String(a[0] ?? '').toUpperCase(),
  'str.lower': (_c, a) => String(a[0] ?? '').toLowerCase(),

  // ── arrays ──────────────────────────────────────────────────────────────
  /*
    Bounded on creation and on push. A script is user input, and
    `array.new_float(1e9)` would take the tab with it before any budget the
    interpreter counts in statements could notice.
  */
  'array.new_float': (_c, a) => newPineArray(new Array(arrSize(a[0])).fill(a[1] ?? null)),
  'array.new_int': (_c, a) => newPineArray(new Array(arrSize(a[0])).fill(a[1] ?? null)),
  'array.new_bool': (_c, a) => newPineArray(new Array(arrSize(a[0])).fill(a[1] ?? false)),
  'array.new_string': (_c, a) => newPineArray(new Array(arrSize(a[0])).fill(a[1] ?? '')),
  'array.new_color': (_c, a) => newPineArray(new Array(arrSize(a[0])).fill(a[1] ?? null)),
  /* An array OF DRAWING OBJECTS — `var line[] vLines = array.new_line()` is
     how a levels script keeps hold of what it drew so it can delete the lot
     and redraw on the next bar. Empty and untyped here, because the engine's
     arrays hold PineValue and a handle is one. */
  /* `array.new<Point>()` — the generic form. The type argument is consumed
     by the parser, so what arrives here is just the size and fill. */
  /*
    ── matrix.* and map.* ────────────────────────────────────────────────

    Both are ordinary Pine values, so both are built out of the array this
    engine already has: a matrix is a flat array plus its shape, a map is a
    pair of parallel arrays. Neither is exotic, and refusing them took out
    every script that keeps a lookup table — which is most of the ones that
    do anything structural.
  */
  'matrix.new': (_c, a) => {
    const rows = arrSize(a[0]);
    const cols = arrSize(a[1]);
    const fill = a[2] ?? null;
    return { kind: 'object', type: 'matrix', fields: new Map<string, PineValue>([
      ['rows', rows], ['cols', cols], ['cells', newPineArray(new Array(Math.min(MAX_ARRAY, rows * cols)).fill(fill))],
    ]) };
  },
  'matrix.rows': (_c, a) => matField(a[0], 'rows'),
  'matrix.columns': (_c, a) => matField(a[0], 'cols'),
  'matrix.get': (_c, a) => {
    const at = matAt(a[0], num(a[1]), num(a[2]));
    return at === null ? null : at.cells.items[at.index] ?? null;
  },
  'matrix.set': (_c, a) => {
    const at = matAt(a[0], num(a[1]), num(a[2]));
    if (at) at.cells.items[at.index] = a[3] ?? null;
    return null;
  },
  'matrix.fill': (_c, a) => {
    const cells = matCells(a[0]);
    if (cells) cells.items.fill(a[1] ?? null);
    return null;
  },
  'matrix.elements_count': (_c, a) => matCells(a[0])?.items.length ?? null,

  'map.new': () => ({ kind: 'object', type: 'map', fields: new Map<string, PineValue>([
    ['keys', newPineArray([])], ['vals', newPineArray([])],
  ]) }),
  'map.put': (_c, a) => {
    const m = mapOf(a[0]);
    if (!m) return null;
    const at = m.keys.items.indexOf(a[1] ?? null);
    if (at >= 0) { const was = m.vals.items[at]; m.vals.items[at] = a[2] ?? null; return was; }
    if (m.keys.items.length >= MAX_ARRAY) return null;
    m.keys.items.push(a[1] ?? null);
    m.vals.items.push(a[2] ?? null);
    return null;
  },
  'map.get': (_c, a) => {
    const m = mapOf(a[0]);
    if (!m) return null;
    const at = m.keys.items.indexOf(a[1] ?? null);
    return at < 0 ? null : m.vals.items[at] ?? null;
  },
  'map.contains': (_c, a) => {
    const m = mapOf(a[0]);
    return m ? m.keys.items.indexOf(a[1] ?? null) >= 0 : false;
  },
  'map.remove': (_c, a) => {
    const m = mapOf(a[0]);
    if (!m) return null;
    const at = m.keys.items.indexOf(a[1] ?? null);
    if (at < 0) return null;
    m.keys.items.splice(at, 1);
    return m.vals.items.splice(at, 1)[0] ?? null;
  },
  'map.size': (_c, a) => mapOf(a[0])?.keys.items.length ?? 0,
  'map.clear': (_c, a) => {
    const m = mapOf(a[0]);
    if (m) { m.keys.items.length = 0; m.vals.items.length = 0; }
    return null;
  },
  'map.keys': (_c, a) => newPineArray([...(mapOf(a[0])?.keys.items ?? [])]),
  'map.values': (_c, a) => newPineArray([...(mapOf(a[0])?.vals.items ?? [])]),

  'array.new': (_c, a) => newPineArray(new Array(arrSize(a[0])).fill(a[1] ?? null)),
  'array.stdev': (_c, a) => {
    const xs = arrOf(a[0]);
    if (xs.length < 2) return null;
    const mean = xs.reduce((n, v) => n + v, 0) / xs.length;
    return clean(Math.sqrt(xs.reduce((n, v) => n + (v - mean) ** 2, 0) / (xs.length - 1)));
  },
  'array.variance': (_c, a) => {
    const xs = arrOf(a[0]);
    if (xs.length < 2) return null;
    const mean = xs.reduce((n, v) => n + v, 0) / xs.length;
    return clean(xs.reduce((n, v) => n + (v - mean) ** 2, 0) / (xs.length - 1));
  },
  'array.median': (_c, a) => {
    const xs = [...arrOf(a[0])].sort((x, y) => x - y);
    if (xs.length === 0) return null;
    const mid = xs.length >> 1;
    return clean(xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2);
  },
  'array.mode': (_c, a) => {
    const xs = arrOf(a[0]);
    if (xs.length === 0) return null;
    const seen = new Map<number, number>();
    let best = xs[0];
    let bestN = 0;
    for (const v of xs) {
      const n = (seen.get(v) ?? 0) + 1;
      seen.set(v, n);
      if (n > bestN) { bestN = n; best = v; }
    }
    return clean(best);
  },
  'array.range': (_c, a) => {
    const xs = arrOf(a[0]);
    return xs.length === 0 ? null : clean(Math.max(...xs) - Math.min(...xs));
  },
  'array.percentile_linear_interpolation': (_c, a) => {
    const xs = arrOf(a[0]);
    return xs.length === 0 ? null : clean(percentileOf(xs, num(a[1])));
  },
  'array.covariance': (_c, a) => {
    const xs = arrOf(a[0]);
    const ys = arrOf(a[1]);
    const n = Math.min(xs.length, ys.length);
    if (n < 2) return null;
    const mx = xs.slice(0, n).reduce((s2, v) => s2 + v, 0) / n;
    const my = ys.slice(0, n).reduce((s2, v) => s2 + v, 0) / n;
    let acc = 0;
    for (let i = 0; i < n; i++) acc += (xs[i] - mx) * (ys[i] - my);
    return clean(acc / (n - 1));
  },
  'array.abs': (_c, a) => newPineArray(arrOf(a[0]).map(v => Math.abs(v))),
  'array.new_line': (_c, a) => newPineArray(new Array(arrSize(a[0])).fill(null)),
  'array.new_label': (_c, a) => newPineArray(new Array(arrSize(a[0])).fill(null)),
  'array.new_box': (_c, a) => newPineArray(new Array(arrSize(a[0])).fill(null)),
  'array.new_table': (_c, a) => newPineArray(new Array(arrSize(a[0])).fill(null)),
  'array.from': (_c, a) => newPineArray([...a]),
  'array.size': (_c, a) => (isPineArray(a[0]) ? a[0].items.length : 0),
  'array.get': (_c, a) => {
    if (!isPineArray(a[0])) return null;
    const i = Math.trunc(num(a[1]));
    return i >= 0 && i < a[0].items.length ? a[0].items[i] : null;
  },
  'array.set': (_c, a) => {
    if (!isPineArray(a[0])) return null;
    const i = Math.trunc(num(a[1]));
    if (i >= 0 && i < a[0].items.length) a[0].items[i] = a[2] ?? null;
    return null;
  },
  'array.push': (_c, a) => {
    if (isPineArray(a[0]) && a[0].items.length < MAX_ARRAY) a[0].items.push(a[1] ?? null);
    return null;
  },
  'array.pop': (_c, a) => (isPineArray(a[0]) ? (a[0].items.pop() ?? null) : null),
  'array.shift': (_c, a) => (isPineArray(a[0]) ? (a[0].items.shift() ?? null) : null),
  'array.unshift': (_c, a) => {
    if (isPineArray(a[0]) && a[0].items.length < MAX_ARRAY) a[0].items.unshift(a[1] ?? null);
    return null;
  },
  'array.insert': (_c, a) => {
    if (isPineArray(a[0]) && a[0].items.length < MAX_ARRAY) a[0].items.splice(Math.trunc(num(a[1])), 0, a[2] ?? null);
    return null;
  },
  'array.remove': (_c, a) => {
    if (!isPineArray(a[0])) return null;
    const out = a[0].items.splice(Math.trunc(num(a[1])), 1);
    return out[0] ?? null;
  },
  'array.clear': (_c, a) => {
    if (isPineArray(a[0])) a[0].items.length = 0;
    return null;
  },
  'array.includes': (_c, a) => (isPineArray(a[0]) ? a[0].items.includes(a[1] ?? null) : false),
  'array.indexof': (_c, a) => (isPineArray(a[0]) ? a[0].items.indexOf(a[1] ?? null) : -1),
  'array.first': (_c, a) => (isPineArray(a[0]) ? (a[0].items[0] ?? null) : null),
  'array.last': (_c, a) => (isPineArray(a[0]) ? (a[0].items[a[0].items.length - 1] ?? null) : null),
  'array.slice': (_c, a) => (isPineArray(a[0]) ? newPineArray(a[0].items.slice(Math.trunc(num(a[1])), Math.trunc(num(a[2])))) : newPineArray()),
  'array.copy': (_c, a) => (isPineArray(a[0]) ? newPineArray([...a[0].items]) : newPineArray()),
  'array.sum': (_c, a) => (isPineArray(a[0]) ? clean(a[0].items.reduce<number>((s2, v) => s2 + (typeof v === 'number' && Number.isFinite(v) ? v : 0), 0)) : null),
  'array.avg': (_c, a) => {
    if (!isPineArray(a[0])) return null;
    const ns = a[0].items.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return ns.length ? clean(ns.reduce((x, y) => x + y, 0) / ns.length) : null;
  },
  'array.max': (_c, a) => {
    if (!isPineArray(a[0])) return null;
    const ns = a[0].items.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return ns.length ? clean(Math.max(...ns)) : null;
  },
  'array.min': (_c, a) => {
    if (!isPineArray(a[0])) return null;
    const ns = a[0].items.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return ns.length ? clean(Math.min(...ns)) : null;
  },
  'array.sort': (_c, a, named) => {
    if (!isPineArray(a[0])) return null;
    const desc = named.order === 'descending' || a[1] === 'descending';
    a[0].items.sort((x, y) => (num(x) - num(y)) * (desc ? -1 : 1));
    return null;
  },
  /*
    `array.sort_indices` returns the ORDER, not the values — the DNF levels
    lean on it to walk their majors low to high without disturbing the
    parallel arrays that hold each level's name and slot.
  */
  'array.sort_indices': (_c, a, named) => {
    const arr = a[0];
    if (!isPineArray(arr)) return newPineArray();
    const desc = named.order === 'descending' || a[1] === 'descending';
    const idx = arr.items.map((_, i) => i);
    idx.sort((x, y) => (num(arr.items[x]) - num(arr.items[y])) * (desc ? -1 : 1));
    return newPineArray(idx);
  },
  'array.reverse': (_c, a) => {
    if (isPineArray(a[0])) a[0].items.reverse();
    return null;
  },

  // ── colour ──────────────────────────────────────────────────────────────
  'color.new': (_c, a) => {
    const base = typeof a[0] === 'string' ? a[0] : '#787b86';
    const transp = Math.max(0, Math.min(100, num(a[1] ?? 0)));
    const hex = base.replace('#', '').slice(0, 6).padEnd(6, '0');
    /* `(1 - 90/100) * 255` is 25.4999… in binary floating point and rounds
       DOWN, so a script asking for 90 got one step more opaque than one
       asking for 89.9. Kept in integers until the last step. */
    const alpha = Math.round((255 * (100 - transp)) / 100).toString(16).padStart(2, '0');
    return `#${hex}${alpha}`;
  },
  'color.rgb': (_c, a) => {
    const [r, g, b] = [num(a[0]), num(a[1]), num(a[2])].map(v => Math.max(0, Math.min(255, Math.round(v))));
    const t = a.length > 3 ? Math.max(0, Math.min(100, num(a[3]))) : 0;
    const alpha = Math.round((255 * (100 - t)) / 100).toString(16).padStart(2, '0');
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}${alpha}`;
  },
};

/*
  WHAT THIS ENGINE WILL NOT RUN, and why — read out at the line it appears
  on rather than approximated. The reasons are written for a reader who
  knows Pine and does not know this codebase.
*/
export const REFUSED: { prefix: string; why: string }[] = [
  /* `request.security` is implemented, at another interval AND under another
     symbol — the desk keeps a tape per name. What is left in this namespace
     wants FUNDAMENTALS and CORPORATE ACTIONS, which are a different kind of
     feed entirely and one this desk does not carry. */
  { prefix: 'request.dividends', why: 'corporate actions are not a feed this engine has' },
  { prefix: 'request.earnings', why: 'corporate actions are not a feed this engine has' },
  { prefix: 'request.financial', why: 'fundamentals are not a feed this engine has' },
  { prefix: 'request.quandl', why: 'external data sources are not reachable from a script here' },
  { prefix: 'request.economic', why: 'economic series are not a feed this engine has' },
  { prefix: 'request.splits', why: 'corporate actions are not a feed this engine has' },
  { prefix: 'request.currency_rate', why: 'currency conversion is not a feed this engine has' },
  { prefix: 'request.seed', why: 'external data sources are not reachable from a script here' },
  { prefix: 'polyline.', why: 'drawing objects are not implemented' },
  { prefix: 'strategy', why: 'this is an indicator engine; there is no order simulator behind it' },
  { prefix: 'ticker.', why: 'symbol construction has no meaning without request.security' },
  { prefix: 'barmerge.gaps', why: 'gap handling for a fetched series is not implemented' },
  { prefix: 'runtime.', why: 'runtime control is not implemented — a script cannot halt this engine or raise its own error' },
  { prefix: 'log.', why: 'script logging is not implemented — there is no console for a script to write to here' },
  { prefix: 'chart.', why: 'chart properties are not exposed to scripts here' },
  { prefix: 'input.symbol', why: 'only the chart\'s own symbol can be fetched, so a symbol picker would have nothing to pick' },
];

/*
  A HANDFUL OF NAMES ARE FINE AS VALUES AND NOT AS CALLS. `time` is the bar's
  timestamp, which this engine has; `time(timeframe, session)` asks whether
  the bar falls inside a session window, which it does not. One table cannot
  hold both answers, so calls get their own.
*/
export const REFUSED_CALLS: { name: string; why: string }[] = [
  { name: 'timestamp', why: 'building a timestamp from date parts is not implemented' },
];

/** The reason this name is refused, or null when the engine implements it. */
export function refusalFor(name: string): string | null {
  const hit = REFUSED.find(r => name === r.prefix || name.startsWith(r.prefix));
  return hit ? hit.why : null;
}

/** As `refusalFor`, for a name in CALL position. */
export function refusalForCall(name: string): string | null {
  const only = REFUSED_CALLS.find(r => r.name === name);
  return only ? only.why : refusalFor(name);
}
