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

export type PineValue = number | boolean | string | null;

/** One call site's private memory. */
export interface Slot { v?: unknown }

export interface Ctx {
  bars: readonly Candle[];
  i: number;
  /** The chart's own interval, for `timeframe.*`. */
  timeframe: string;
  ticker: string;
}

export type BuiltinFn = (ctx: Ctx, a: PineValue[], named: Record<string, PineValue>, slot: Slot) => PineValue | PineValue[];

const num = (v: PineValue): number => (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : NaN);
/** Pine's `na` is our null; NaN from arithmetic is the same thing. */
const clean = (v: number): number | null => (Number.isFinite(v) ? v : null);
const truthy = (v: PineValue): boolean => v === true || (typeof v === 'number' && v !== 0);

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

export const VARS: Record<string, (ctx: Ctx) => PineValue> = {
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
  'plot.style_line': 'line', 'plot.style_stepline': 'stepline', 'plot.style_histogram': 'histogram',
  'plot.style_circles': 'circles', 'plot.style_cross': 'cross', 'plot.style_area': 'area', 'plot.style_columns': 'columns',
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
  'str.tonumber': (_c, a) => { const n = Number(a[0]); return Number.isFinite(n) ? n : null; },
  'str.length': (_c, a) => String(a[0] ?? '').length,
  'str.upper': (_c, a) => String(a[0] ?? '').toUpperCase(),
  'str.lower': (_c, a) => String(a[0] ?? '').toLowerCase(),
  'str.contains': (_c, a) => String(a[0] ?? '').includes(String(a[1] ?? '')),
  'str.replace_all': (_c, a) => String(a[0] ?? '').split(String(a[1] ?? '')).join(String(a[2] ?? '')),

  // ── colour ──────────────────────────────────────────────────────────────
  'color.new': (_c, a) => {
    const base = typeof a[0] === 'string' ? a[0] : '#787b86';
    const transp = Math.max(0, Math.min(100, num(a[1] ?? 0)));
    const hex = base.replace('#', '').slice(0, 6).padEnd(6, '0');
    const alpha = Math.round((1 - transp / 100) * 255).toString(16).padStart(2, '0');
    return `#${hex}${alpha}`;
  },
  'color.rgb': (_c, a) => {
    const [r, g, b] = [num(a[0]), num(a[1]), num(a[2])].map(v => Math.max(0, Math.min(255, Math.round(v))));
    const t = a.length > 3 ? Math.max(0, Math.min(100, num(a[3]))) : 0;
    const alpha = Math.round((1 - t / 100) * 255).toString(16).padStart(2, '0');
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}${alpha}`;
  },
};

/*
  WHAT THIS ENGINE WILL NOT RUN, and why — read out at the line it appears
  on rather than approximated. The reasons are written for a reader who
  knows Pine and does not know this codebase.
*/
export const REFUSED: { prefix: string; why: string }[] = [
  { prefix: 'request.', why: 'this engine draws one symbol on one timeframe; there is no second series to fetch' },
  { prefix: 'array.', why: 'arrays are not implemented — a script that accumulates values across bars can use `var` and a rolling calculation instead' },
  { prefix: 'matrix.', why: 'matrices are not implemented, and nothing in this engine takes their place' },
  { prefix: 'map.', why: 'maps are not implemented — there is no keyed collection in this engine' },
  { prefix: 'line.', why: 'drawing objects are not implemented — plot and plotshape are' },
  { prefix: 'label.', why: 'drawing objects are not implemented — plotshape carries a title instead' },
  { prefix: 'box.', why: 'drawing objects are not implemented' },
  { prefix: 'table.', why: 'tables are not implemented — the numbers a table would hold can be plotted, or read off the chart' },
  { prefix: 'linefill.', why: 'drawing objects are not implemented' },
  { prefix: 'polyline.', why: 'drawing objects are not implemented' },
  { prefix: 'strategy', why: 'this is an indicator engine; there is no order simulator behind it' },
  { prefix: 'ticker.', why: 'symbol construction has no meaning without request.security' },
  { prefix: 'barmerge.', why: 'a merge policy only applies to request.security, which is not implemented' },
  { prefix: 'runtime.', why: 'runtime control is not implemented — a script cannot halt this engine or raise its own error' },
  { prefix: 'log.', why: 'script logging is not implemented — there is no console for a script to write to here' },
  { prefix: 'chart.', why: 'chart properties are not exposed to scripts here' },
  { prefix: 'ta.pivot', why: 'pivots need bars that have not happened yet on the bar they are reported' },
  { prefix: 'input.source', why: 'a source picker needs series the reader can choose between; only close is available' },
  { prefix: 'input.session', why: 'session windows are not implemented' },
  { prefix: 'input.timeframe', why: 'a second timeframe needs request.security, which is not implemented' },
  { prefix: 'input.symbol', why: 'a second symbol needs request.security, which is not implemented' },
  { prefix: 'timeframe.in_seconds', why: 'the chart interval is exposed as timeframe.period, and converting it to seconds is not implemented' },
  { prefix: 'fill', why: 'filling between two plots is not implemented' },
  { prefix: 'bgcolor', why: 'background colouring is not implemented' },
  { prefix: 'hline', why: 'horizontal lines are not implemented — plot a constant instead' },
  { prefix: 'plotcandle', why: 'only plot and plotshape are implemented' },
  { prefix: 'plotbar', why: 'only plot and plotshape are implemented' },
  { prefix: 'plotarrow', why: 'only plot and plotshape are implemented' },
  { prefix: 'varip', why: 'varip updates within a bar; every bar here is already closed' },
];

/*
  A HANDFUL OF NAMES ARE FINE AS VALUES AND NOT AS CALLS. `time` is the bar's
  timestamp, which this engine has; `time(timeframe, session)` asks whether
  the bar falls inside a session window, which it does not. One table cannot
  hold both answers, so calls get their own.
*/
export const REFUSED_CALLS: { name: string; why: string }[] = [
  { name: 'time', why: 'the session-window form of time() is not implemented — the bar timestamp is available as the value `time`' },
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
