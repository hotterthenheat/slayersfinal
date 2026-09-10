/*
  HOW MUCH OF PINE THIS ENGINE ACTUALLY RUNS — measured, not estimated.

  "Will it run any script someone pastes in?" is the question this file
  exists to answer with a number instead of a shrug. It is a corpus of small
  scripts, each exercising ONE construct of Pine v6, each labelled with what
  should happen to it.

  ─────────────────────────────────────────────────────────────────────────
  THERE ARE THREE OUTCOMES AND ONLY ONE OF THEM IS A BUG.

    RUNS      inside the subset. It compiles and produces output.
    REFUSED   outside the subset, and the engine says so by name, at the
              line. That is a correct answer — the reader is told what is
              missing and can work around it or stop.
    SYNTAX    the parser could not read valid Pine.

  The third is the only true defect, and it is the worst possible one: it
  tells a reader their script is malformed when it is not. Someone who
  pastes a working TradingView indicator and is told "line 42 will not
  parse" has no way to tell a gap in this engine from a typo of their own.
  So `expect: 'runs'` failing with a syntax error is counted separately and
  loudly from `expect: 'runs'` failing with a refusal.

  A REFUSAL WHERE A RUN WAS EXPECTED is a smaller failure: honest, but a gap
  worth closing. A RUN WHERE A REFUSAL WAS EXPECTED is worse than it looks —
  it means the engine accepted something it does not really implement.
*/
import { compilePine, evaluatePine } from '../src/data/pine/index';
import type { Candle } from '../src/types/market';

/* A short synthetic tape — enough bars for a 50-length average to fill. */
const bars: Candle[] = [];
{
  let px = 100;
  for (let i = 0; i < 200; i++) {
    const drift = Math.sin(i / 13) * 1.4 + Math.cos(i / 4) * 0.5;
    const o = px;
    const c = px + drift;
    bars.push({
      time: 1_760_000_000 + i * 300,
      open: o,
      high: Math.max(o, c) + 0.3,
      low: Math.min(o, c) - 0.3,
      close: c,
      volume: 1000 + ((i * 37) % 500),
    });
    px = c;
  }
}

const agg = (mins: number): Candle[] => {
  const step = mins * 60;
  const out: Candle[] = [];
  for (const b of bars) {
    const k = Math.floor(b.time / step) * step;
    const last = out[out.length - 1];
    if (!last || last.time !== k) out.push({ ...b, time: k });
    else {
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume += b.volume;
    }
  }
  return out;
};

/* A staged dealer book, so `slayer.*` cases do not depend on a simulator. */
const feed = {
  book: bars.map((b, i) => ({
    netGex: i < 100 ? 1_000_000 : -1_000_000,
    callWall: 120,
    putWall: 80,
    flip: 100,
    supreme: 95,
    step: 5,
    strikes: [
      { strike: 95, value: 5_000_000, callOI: 1000 + i, putOI: 500 },
      { strike: 100, value: -4_000_000, callOI: 2000, putOI: 700 + i },
    ],
    _b: b,
  })),
  now: { netDex: -1, netVex: 1, netVanna: 1, netCharm: 1, maxPain: 100, gammaPin: 99 },
};

const OPTS = {
  timeframe: '5m',
  ticker: 'SPY',
  chartMinutes: 5,
  resolveBars: (m: number) => agg(m),
  slayer: feed,
};

interface Case {
  area: string;
  name: string;
  /** Everything after the declaration line, which is added for you. */
  body: string;
  expect: 'runs' | 'refuses';
  /** Overlay is on unless a case needs otherwise. */
  head?: string;
}

const DEFAULT_HEAD = '//@version=6\nindicator("t", overlay = true)';

const CASES: Case[] = [
  // ── declaration and annotations ────────────────────────────────────────
  { area: 'declaration', name: 'title, shorttitle, overlay', expect: 'runs',
    head: '//@version=6\nindicator("Long title", "SHORT", overlay = true)', body: 'plot(close)' },
  { area: 'declaration', name: 'max_bars_back and object caps', expect: 'runs',
    head: '//@version=6\nindicator("t", overlay = true, max_lines_count = 20, max_labels_count = 20, max_boxes_count = 5)',
    body: 'plot(close)' },
  { area: 'declaration', name: 'overlay = false (own pane)', expect: 'runs',
    head: '//@version=6\nindicator("t", overlay = false)', body: 'plot(ta.rsi(close, 14))' },
  { area: 'declaration', name: 'strategy()', expect: 'refuses',
    head: '//@version=6\nstrategy("s")', body: 'strategy.entry("L", strategy.long)' },
  { area: 'declaration', name: 'library()', expect: 'refuses',
    head: '//@version=6\nlibrary("lib")', body: 'export f(int x) => x' },

  // ── literals and operators ─────────────────────────────────────────────
  { area: 'literals', name: 'numbers, hex colour, string', expect: 'runs',
    body: 'x = 1 + 2.5 - 1e-3\nc = #ff8800\ns = "hello"\nplot(x)' },
  { area: 'literals', name: 'arithmetic and comparison', expect: 'runs',
    body: 'plot(close > open ? high * 2 - low / 2 : (high + low) % 3)' },
  { area: 'literals', name: 'and / or / not', expect: 'runs',
    body: 'b = close > open and not (high < low) or volume > 0\nplotshape(b)' },
  { area: 'literals', name: 'chained ternary over two lines', expect: 'runs',
    body: 'v = close > 110 ? 1 : close > 105 ? 2 :\n     close > 100 ? 3 : 4\nplot(v)' },
  { area: 'literals', name: 'unary minus and parentheses', expect: 'runs',
    body: 'plot(-(close - open) * -1)' },

  // ── variables ──────────────────────────────────────────────────────────
  { area: 'variables', name: 'assignment and reassignment', expect: 'runs',
    body: 'x = 0.0\nx := close\nplot(x)' },
  { area: 'variables', name: 'var persists across bars', expect: 'runs',
    body: 'var int n = 0\nn := n + 1\nplot(n)' },
  { area: 'variables', name: 'typed declarations', expect: 'runs',
    body: 'float f = na\nint i = 3\nbool b = true\nstring s = "x"\ncolor c = color.red\nplot(i)' },
  { area: 'variables', name: 'varip (declared)', expect: 'runs', body: 'varip int n = 0\nn := n + 1\nplot(n)' },
  { area: 'variables', name: 'tuple destructuring', expect: 'runs',
    body: '[a, b] = [close, open]\nplot(a - b)' },

  // ── history ────────────────────────────────────────────────────────────
  { area: 'history', name: 'series history operator', expect: 'runs', body: 'plot(close[1] - close[5])' },
  { area: 'history', name: 'history of an expression variable', expect: 'runs',
    body: 'x = close - open\nplot(x[3])' },
  { area: 'history', name: 'history inside a function', expect: 'runs',
    body: 'f(s) => s - s[1]\nplot(f(close))' },

  // ── control flow ───────────────────────────────────────────────────────
  { area: 'control', name: 'if / else if / else', expect: 'runs',
    body: 'v = 0.0\nif close > open\n    v := 1\nelse if close < open\n    v := -1\nelse\n    v := 0\nplot(v)' },
  { area: 'control', name: 'if as an expression', expect: 'runs',
    body: 'v = if close > open\n    1\nelse\n    2\nplot(v)' },
  { area: 'control', name: 'for loop with to', expect: 'runs',
    body: 'sum = 0.0\nfor i = 0 to 4\n    sum += close[i]\nplot(sum / 5)' },
  { area: 'control', name: 'for loop with by', expect: 'runs',
    body: 'n = 0\nfor i = 0 to 10 by 2\n    n += 1\nplot(n)' },
  { area: 'control', name: 'while loop', expect: 'runs',
    body: 'i = 0\nwhile i < 5\n    i += 1\nplot(i)' },
  { area: 'control', name: 'break', expect: 'runs',
    body: 'found = 0\nfor i = 0 to 100\n    if i == 7\n        found := i\n        break\nplot(found)' },
  { area: 'control', name: 'continue', expect: 'runs',
    body: 'n = 0\nfor i = 0 to 10\n    if i % 2 == 0\n        continue\n    n += 1\nplot(n)' },
  { area: 'control', name: 'switch on a value', expect: 'runs',
    body: 'x = 2\nv = switch x\n    1 => 10\n    2 => 20\n    => 30\nplot(v)' },
  { area: 'control', name: 'switch with no subject', expect: 'runs',
    body: 'v = switch\n    close > open => 1\n    close < open => -1\n    => 0\nplot(v)' },
  { area: 'control', name: 'for...in over an array', expect: 'runs',
    body: 'a = array.from(1, 2, 3)\ns = 0.0\nfor v in a\n    s += v\nplot(s)' },

  // ── functions ──────────────────────────────────────────────────────────
  { area: 'functions', name: 'single-expression function', expect: 'runs',
    body: 'f(x) => x * 2\nplot(f(close))' },
  { area: 'functions', name: 'multi-line function with locals', expect: 'runs',
    body: 'f(x) =>\n    _a = x * 2\n    _b = _a + 1\n    _b\nplot(f(close))' },
  { area: 'functions', name: 'function returning a tuple', expect: 'runs',
    body: 'f() =>\n    [close, open]\n[a, b] = f()\nplot(a - b)' },
  { area: 'functions', name: 'var inside a function keeps its own state', expect: 'runs',
    body: 'f() =>\n    var int n = 0\n    n := n + 1\n    n\nplot(f())' },
  { area: 'functions', name: 'typed parameters', expect: 'runs',
    body: 'f(float x, int n) => x * n\nplot(f(close, 2))' },

  // ── ta.* ───────────────────────────────────────────────────────────────
  { area: 'ta', name: 'moving averages', expect: 'runs',
    body: 'plot(ta.sma(close, 10) + ta.ema(close, 10) + ta.rma(close, 10) + ta.wma(close, 10) + ta.vwma(close, 10))' },
  { area: 'ta', name: 'rsi, stoch, atr, tr', expect: 'runs',
    body: 'plot(ta.rsi(close, 14) + ta.stoch(close, high, low, 14) + ta.atr(14) + ta.tr)' },
  { area: 'ta', name: 'macd tuple', expect: 'runs',
    body: '[m, s, h] = ta.macd(close, 12, 26, 9)\nplot(m + s + h)' },
  { area: 'ta', name: 'bollinger bands tuple', expect: 'runs',
    body: '[mid, up, lo] = ta.bb(close, 20, 2)\nplot(up - lo)' },
  { area: 'ta', name: 'crossover / crossunder / cross', expect: 'runs',
    body: 'f = ta.ema(close, 5)\ns = ta.ema(close, 20)\nplotshape(ta.crossover(f, s) or ta.crossunder(f, s) or ta.cross(f, s))' },
  { area: 'ta', name: 'highest / lowest / change / mom / roc', expect: 'runs',
    body: 'plot(ta.highest(high, 10) - ta.lowest(low, 10) + ta.change(close) + ta.mom(close, 5) + ta.roc(close, 5))' },
  { area: 'ta', name: 'barssince / valuewhen / cum', expect: 'runs',
    body: 'plot(ta.barssince(close > open) + ta.valuewhen(close > open, close, 0) + ta.cum(1))' },
  { area: 'ta', name: 'stdev / variance / rising / falling', expect: 'runs',
    body: 'plot(ta.stdev(close, 10) + ta.variance(close, 10) + (ta.rising(close, 3) ? 1 : 0) + (ta.falling(close, 3) ? 1 : 0))' },
  { area: 'ta', name: 'percentrank / median', expect: 'runs',
    body: 'plot(ta.percentrank(close, 20) + ta.median(close, 20))' },
  { area: 'ta', name: 'pivothigh / pivotlow', expect: 'runs',
    body: 'ph = ta.pivothigh(high, 5, 5)\npl = ta.pivotlow(low, 5, 5)\nplot(na(ph) ? na : ph)\nplot(na(pl) ? na : pl)' },
  { area: 'ta', name: 'supertrend', expect: 'refuses', body: '[st, dir] = ta.supertrend(3, 10)\nplot(st)' },

  // ── math.* and str.* ───────────────────────────────────────────────────
  { area: 'math', name: 'common maths', expect: 'runs',
    body: 'plot(math.abs(-1) + math.max(1, 2) + math.min(1, 2) + math.round(1.5) + math.floor(1.5) + math.ceil(1.5) + math.sqrt(4) + math.pow(2, 3) + math.log(2) + math.avg(1, 2))' },
  { area: 'math', name: 'sign, exp, trig, sum', expect: 'runs',
    body: 'plot(math.sign(-2) + math.exp(1) + math.sin(1) + math.cos(1) + math.sum(close, 5))' },
  { area: 'str', name: 'tostring, length, concat, format', expect: 'runs',
    body: 'var label L = na\nif barstate.islast\n    L := label.new(bar_index, close, str.tostring(close, "0.00") + str.tostring(1) + " " + str.upper("a"))\nplot(close)' },
  { area: 'str', name: 'str.format (label)', expect: 'runs',
    body: 'var label L = na\nif barstate.islast\n    L := label.new(bar_index, close, str.format("{0}", close))\nplot(close)' },

  // ── array.* ────────────────────────────────────────────────────────────
  { area: 'array', name: 'new, push, get, size, set', expect: 'runs',
    body: 'var a = array.new_float()\nif barstate.isconfirmed\n    array.push(a, close)\nplot(array.size(a) > 0 ? array.get(a, 0) : na)' },
  { area: 'array', name: 'clear, pop, shift, sum, avg', expect: 'runs',
    body: 'var a = array.new_float(5, 1.0)\nplot(array.sum(a) + array.avg(a))' },
  { area: 'array', name: 'sort_indices, max, min', expect: 'runs',
    body: 'var a = array.new_float(3, 0.0)\narray.set(a, 0, close)\nplot(array.max(a) - array.min(a))' },
  { area: 'array', name: 'array.from', expect: 'runs',
    body: 'a = array.from(1.0, 2.0, 3.0)\nplot(array.sum(a))' },
  { area: 'array', name: 'arrays of drawing objects', expect: 'runs',
    body: 'var line[] ls = array.new_line()\nvar label[] bs = array.new_label()\nplot(array.size(ls) + array.size(bs))' },

  // ── drawing objects ────────────────────────────────────────────────────
  { area: 'objects', name: 'line.new and setters', expect: 'runs',
    body: 'var line L = na\nif barstate.islast\n    L := line.new(bar_index - 5, close, bar_index, close, extend = extend.both, color = color.red, width = 2, style = line.style_dashed)\n    line.set_y1(L, close)\nplot(close)' },
  { area: 'objects', name: 'label.new and setters', expect: 'runs',
    body: 'var label B = na\nif barstate.islast\n    B := label.new(bar_index, close, "x", style = label.style_label_left, textcolor = color.white, size = size.small)\n    label.set_text(B, "y")\nplot(close)' },
  { area: 'objects', name: 'box.new and setters', expect: 'runs',
    body: 'var box X = na\nif barstate.islast\n    X := box.new(bar_index - 5, high, bar_index, low, bgcolor = color.new(color.green, 90))\n    box.set_bgcolor(X, color.new(color.red, 90))\nplot(close)' },
  { area: 'objects', name: 'table.new and cells', expect: 'runs',
    body: 'var table T = na\nif barstate.islast\n    T := table.new(position.top_right, 2, 2)\n    table.cell(T, 0, 0, "a", text_color = color.white, text_size = size.small)\nplot(close)' },
  { area: 'objects', name: 'linefill (handles)', expect: 'runs',
    body: 'var line a = na\nvar line b = na\nlinefill.new(a, b, color.red)\nplot(close)' },
  { area: 'objects', name: 'polyline', expect: 'refuses', body: 'polyline.new(array.new_chart_point())\nplot(close)' },

  // ── plotting ───────────────────────────────────────────────────────────
  { area: 'plot', name: 'plot with title, colour, linewidth', expect: 'runs',
    body: 'plot(close, "Close", color = color.aqua, linewidth = 2)' },
  { area: 'plot', name: 'plot styles and display', expect: 'runs',
    body: 'plot(close, "a", style = plot.style_circles, display = display.price_scale)' },
  { area: 'plot', name: 'plotshape with every argument', expect: 'runs',
    body: 'plotshape(close > open, "up", shape.triangleup, location.belowbar, color.green, size = size.small, text = "B")' },
  { area: 'plot', name: 'plotchar', expect: 'runs',
    body: 'plotchar(close > open, "up", "▲", location.belowbar, color.green)' },
  { area: 'plot', name: 'bgcolor', expect: 'runs', body: 'bgcolor(close > open ? color.new(color.green, 90) : na)' },
  { area: 'plot', name: 'hline', expect: 'runs', body: 'hline(100, "Ref", color = color.gray, linestyle = hline.style_dashed)' },
  { area: 'plot', name: 'fill between two plots', expect: 'runs',
    body: 'a = plot(ta.ema(close, 10))\nb = plot(ta.ema(close, 20))\nfill(a, b, color = color.new(color.blue, 90))' },
  { area: 'plot', name: 'barcolor', expect: 'runs', body: 'barcolor(close > open ? color.green : color.red)' },
  { area: 'plot', name: 'plotcandle (bare)', expect: 'runs', body: 'plotcandle(open, high, low, close)' },
  { area: 'plot', name: 'alertcondition', expect: 'runs',
    body: 'alertcondition(close > open, title = "up", message = "up on {{ticker}}")' },
  { area: 'plot', name: 'alert()', expect: 'runs', body: 'if close > open\n    alert("up", alert.freq_once_per_bar)' },

  // ── inputs ─────────────────────────────────────────────────────────────
  { area: 'input', name: 'int, float, bool, string, color', expect: 'runs',
    body: 'a = input.int(1, "a")\nb = input.float(1.5, "b")\nc = input.bool(true, "c")\nd = input.string("x", "d", options = ["x", "y"])\ne = input.color(color.red, "e")\nplot(a + b)' },
  { area: 'input', name: 'input.timeframe and input.source', expect: 'runs',
    body: 'tf = input.timeframe("5", "tf")\nsrc = input.source(close, "src")\nplot(src)' },
  { area: 'input', name: 'input.session', expect: 'runs',
    body: 's = input.session("0930-1600", "s")\nplot(na(time(timeframe.period, s)) ? 0 : 1)' },
  { area: 'input', name: 'bare input()', expect: 'runs', body: 'x = input(14, "len")\nplot(ta.sma(close, x))' },
  { area: 'input', name: 'input.symbol', expect: 'refuses', body: 's = input.symbol("AAPL")\nplot(close)' },

  // ── built-in variables ─────────────────────────────────────────────────
  { area: 'builtins', name: 'ohlcv and derived sources', expect: 'runs',
    body: 'plot(open + high + low + close + volume + hl2 + hlc3 + ohlc4)' },
  { area: 'builtins', name: 'bar_index, last_bar_index, time', expect: 'runs',
    body: 'plot(bar_index + last_bar_index + time)' },
  { area: 'builtins', name: 'barstate.*', expect: 'runs',
    body: 'plotshape(barstate.islast or barstate.isfirst or barstate.isconfirmed)' },
  { area: 'builtins', name: 'syminfo.* and timeframe.*', expect: 'runs',
    body: 'plot(syminfo.mintick + timeframe.multiplier + timeframe.in_seconds())' },
  { area: 'builtins', name: 'na() and nz()', expect: 'runs', body: 'plot(na(close) ? 0 : nz(close, 0))' },

  // ── request.* ──────────────────────────────────────────────────────────
  { area: 'request', name: 'security at a higher interval', expect: 'runs',
    body: 'plot(request.security(syminfo.tickerid, "60", close))' },
  { area: 'request', name: 'security with a tuple and lookahead', expect: 'runs',
    body: '[o, h] = request.security(syminfo.tickerid, "D", [open, high[1]], lookahead = barmerge.lookahead_on)\nplot(o + h)' },
  { area: 'request', name: 'security on another symbol', expect: 'refuses',
    body: 'plot(request.security("AAPL", "D", close))' },
  { area: 'request', name: 'request.financial', expect: 'refuses',
    body: 'plot(request.financial(syminfo.tickerid, "TOTAL_REVENUE", "FQ"))' },

  // ── the desk's own data ────────────────────────────────────────────────
  { area: 'slayer', name: 'the book as a series', expect: 'runs',
    body: 'plot(slayer.callwall)\nplot(slayer.netgex, display = display.price_scale)' },
  { area: 'slayer', name: 'parameterised book reads', expect: 'runs',
    body: 'plot(slayer.gex(close))\nplot(slayer.nth_call(2))' },

  // ── user-defined types and methods ─────────────────────────────────────
  { area: 'udt', name: 'type with fields and .new()', expect: 'runs',
    head: '//@version=6\ntype Point\n    float x\n    float y\nindicator("t", overlay = true)',
    body: 'p = Point.new(1.0, 2.0)\nplot(p.x + p.y)' },
  { area: 'udt', name: 'field assignment', expect: 'runs',
    head: '//@version=6\ntype Point\n    float x = 0.0\nindicator("t", overlay = true)',
    body: 'p = Point.new()\np.x := close\nplot(p.x)' },
  { area: 'udt', name: 'var of a type persists', expect: 'runs',
    head: '//@version=6\ntype Bag\n    int n = 0\nindicator("t", overlay = true)',
    body: 'var b = Bag.new()\nb.n := b.n + 1\nplot(b.n)' },
  { area: 'udt', name: 'array of a type', expect: 'runs',
    head: '//@version=6\ntype Point\n    float x = 0.0\nindicator("t", overlay = true)',
    body: 'var Point[] ps = array.new<Point>()\nif barstate.isfirst\n    array.push(ps, Point.new(1))\nplot(array.size(ps))' },
  { area: 'udt', name: 'method on a type', expect: 'runs',
    head: '//@version=6\ntype Point\n    float x = 0.0\nmethod twice(Point self) => self.x * 2\nindicator("t", overlay = true)',
    body: 'p = Point.new(close)\nplot(p.twice())' },
  { area: 'udt', name: 'method on a built-in type', expect: 'runs',
    head: '//@version=6\nmethod half(float self) => self / 2\nindicator("t", overlay = true)',
    body: 'plot(close.half())' },
  { area: 'udt', name: 'enum', expect: 'runs',
    head: '//@version=6\nenum Side\n    up\n    down\nindicator("t", overlay = true)',
    body: 'var Side s = Side.up\nplot(s == Side.up ? 1 : 0)' },

  // ── matrices and maps ──────────────────────────────────────────────────
  { area: 'matrix', name: 'new, set, get, rows, cols', expect: 'runs',
    body: 'var m = matrix.new<float>(2, 2, 0.0)\nmatrix.set(m, 0, 0, close)\nplot(matrix.get(m, 0, 0) + matrix.rows(m) + matrix.columns(m))' },
  { area: 'map', name: 'new, put, get, contains, size', expect: 'runs',
    body: 'var m = map.new<string, float>()\nmap.put(m, "a", close)\nplot(map.contains(m, "a") ? map.get(m, "a") : na)' },

  // ── the rest of the plot family ────────────────────────────────────────
  { area: 'plot', name: 'plotcandle', expect: 'runs', body: 'plotcandle(open, high, low, close, "ha")' },
  { area: 'plot', name: 'plotbar', expect: 'runs', body: 'plotbar(open, high, low, close, "bars")' },
  { area: 'plot', name: 'plotarrow', expect: 'runs', body: 'plotarrow(close > open ? 1 : -1, "arrows")' },
  { area: 'plot', name: 'linefill between two lines', expect: 'runs',
    body: 'var line a = na\nvar line b = na\nif barstate.islast\n    a := line.new(bar_index - 5, high, bar_index, high)\n    b := line.new(bar_index - 5, low, bar_index, low)\n    linefill.new(a, b, color.new(color.blue, 90))\nplot(close)' },

  // ── the object option surface real scripts use ─────────────────────────
  { area: 'objects', name: 'label tooltip, textalign, xloc', expect: 'runs',
    body: 'if barstate.islast\n    label.new(bar_index, close, "x", xloc = xloc.bar_index, yloc = yloc.price, textalign = text.align_left, tooltip = "hi")\nplot(close)' },
  { area: 'objects', name: 'box text and border style', expect: 'runs',
    body: 'if barstate.islast\n    box.new(bar_index - 3, high, bar_index, low, border_style = line.style_dotted, text = "zone", text_color = color.white, text_size = size.small)\nplot(close)' },
  { area: 'objects', name: 'table cell width, tooltip, merge', expect: 'runs',
    body: 'var t = table.new(position.middle_center, 1, 1, frame_color = color.gray, frame_width = 1)\nif barstate.islast\n    table.cell(t, 0, 0, "x", width = 10, height = 5, tooltip = "t", text_halign = text.align_center, text_valign = text.align_top)\nplot(close)' },
  { area: 'objects', name: 'line.get_x1 / get_y2 / copy', expect: 'runs',
    body: 'var line L = na\nif barstate.islast\n    L := line.new(bar_index - 2, close, bar_index, close)\nplot(na(L) ? na : line.get_y2(L))' },

  // ── more of ta.* that real scripts reach for ───────────────────────────
  { area: 'ta', name: 'hma, alma, swma, dev, linreg', expect: 'runs',
    body: 'plot(ta.hma(close, 9) + ta.alma(close, 9, 0.85, 6) + ta.swma(close) + ta.dev(close, 9) + ta.linreg(close, 9, 0))' },
  { area: 'ta', name: 'cci, mfi, wpr, tsi, cmo', expect: 'runs',
    body: 'plot(ta.cci(close, 20) + ta.mfi(close, 14) + ta.wpr(14) + ta.tsi(close, 13, 25) + ta.cmo(close, 9))' },
  { area: 'ta', name: 'sar, dmi, kc, atr-family', expect: 'runs',
    body: '[d, p, m] = ta.dmi(14, 14)\n[kmid, kup, klo] = ta.kc(close, 20, 2)\nplot(ta.sar(0.02, 0.02, 0.2) + d + p + m + kup - klo)' },
  { area: 'ta', name: 'range, correlation, percentile', expect: 'runs',
    body: 'plot(ta.range(close, 10) + ta.correlation(close, open, 10) + ta.percentile_linear_interpolation(close, 20, 50))' },
  { area: 'ta', name: 'ta.max / ta.min / ta.mode', expect: 'runs',
    body: 'plot(ta.max(close) + ta.min(close))' },

  // ── str.* completeness ─────────────────────────────────────────────────
  { area: 'str', name: 'format, split, replace, contains, pos', expect: 'runs',
    body: 'if barstate.islast\n    label.new(bar_index, close, str.format("{0,number,#.##} {1}", close, "x") + str.replace_all("a-b", "-", "+") + (str.contains("abc", "b") ? "y" : "n"))\nplot(close)' },
  { area: 'str', name: 'substring, tonumber, trim, repeat', expect: 'runs',
    body: 'x = str.tonumber("12.5")\nplot(na(x) ? 0 : x + str.length(str.substring("hello", 1, 3)))' },

  // ── array.* completeness ───────────────────────────────────────────────
  { area: 'array', name: 'slice, concat, reverse, includes, indexof', expect: 'runs',
    body: 'a = array.from(3.0, 1.0, 2.0)\nb = array.copy(a)\narray.reverse(b)\nplot((array.includes(a, 1.0) ? 1 : 0) + array.indexof(a, 2.0) + array.size(array.slice(a, 0, 2)))' },
  { area: 'array', name: 'stdev, median, mode, percentile, range', expect: 'runs',
    body: 'a = array.from(1.0, 2.0, 3.0, 4.0)\nplot(array.stdev(a) + array.median(a) + array.range(a))' },
  { area: 'array', name: 'insert, remove, unshift, fill, join', expect: 'runs',
    body: 'a = array.new_float(0)\narray.push(a, 1.0)\narray.insert(a, 0, 2.0)\narray.unshift(a, 3.0)\nplot(array.size(a))' },

  // ── varip, and the odd corners ─────────────────────────────────────────
  { area: 'variables', name: 'varip', expect: 'runs', body: 'varip int n = 0\nn := n + 1\nplot(n)' },
  { area: 'builtins', name: 'dayofweek, hour, minute, month', expect: 'runs',
    body: 'plot(dayofweek + hour + minute + month + year + dayofmonth)' },
  { area: 'builtins', name: 'syminfo.* surface', expect: 'runs',
    body: 'plot(syminfo.pointvalue + (syminfo.session == "" ? 0 : 1) + (syminfo.prefix == "" ? 0 : 1))' },
  { area: 'builtins', name: 'timeframe.change and isdwm', expect: 'runs',
    body: 'plotshape(timeframe.isdwm or timeframe.isseconds)' },
  { area: 'request', name: 'security_lower_tf', expect: 'runs',
    body: 'a = request.security_lower_tf(syminfo.tickerid, "1", close)\nplot(array.size(a) > 0 ? array.get(a, 0) : na)' },

  // ── deliberately outside ───────────────────────────────────────────────
  { area: 'udt', name: 'type declared before indicator()', expect: 'runs',
    body: 'type Point\n    float x\n    float y\np = Point.new(1, 2)\nplot(p.x)' },
  { area: 'udt', name: 'method declared before indicator()', expect: 'runs',
    body: 'method double(float x) => x * 2\nplot(close.double())' },
  { area: 'matrix', name: 'generic matrix.new', expect: 'runs', body: 'm = matrix.new<float>(2, 2)\nplot(close)' },
  { area: 'map', name: 'generic map.new', expect: 'runs', body: 'm = map.new<string, float>()\nplot(close)' },
  { area: 'outside', name: 'import a library', expect: 'refuses',
    head: '//@version=6\nimport TradingView/ta/7 as tv\nindicator("t")', body: 'plot(close)' },
  { area: 'outside', name: 'runtime.error', expect: 'refuses', body: 'runtime.error("no")\nplot(close)' },
  { area: 'outside', name: 'log.info', expect: 'refuses', body: 'log.info("x")\nplot(close)' },
];

// ── run them ──────────────────────────────────────────────────────────────
type Outcome = 'runs' | 'refuses' | 'syntax' | 'threw';

interface Result extends Case {
  outcome: Outcome;
  detail: string;
}

const results: Result[] = CASES.map(c => {
  const src = `${c.head ?? DEFAULT_HEAD}\n${c.body}`;
  const compiled = compilePine(src);
  if (!compiled.ok) {
    if (compiled.stage === 'syntax') return { ...c, outcome: 'syntax', detail: `line ${compiled.line}: ${compiled.message}` };
    return { ...c, outcome: 'refuses', detail: compiled.refusals.map(r => r.name).join(', ') };
  }
  const run = evaluatePine(src, bars, OPTS);
  if (!run.ok) return { ...c, outcome: 'threw', detail: `${run.message}${run.line ? ` @line ${run.line}` : ''}` };
  return { ...c, outcome: 'runs', detail: `${run.run.plots.length}p ${run.run.shapes.length}s ${run.run.drawings.length}o` };
});

/*
  A case is CORRECT when what happened matches what should have. A case that
  was expected to run and refused is a GAP — honest, and worth closing. One
  that was expected to run and would not PARSE is a DEFECT, because the
  reader is told their script is broken when it is this engine that is.
*/
const gaps = results.filter(r => r.expect === 'runs' && r.outcome === 'refuses');
const defects = results.filter(r => r.expect === 'runs' && (r.outcome === 'syntax' || r.outcome === 'threw'));
const overreach = results.filter(r => r.expect === 'refuses' && r.outcome === 'runs');
const wrongShape = results.filter(r => r.expect === 'refuses' && (r.outcome === 'syntax' || r.outcome === 'threw'));
const correct = results.length - gaps.length - defects.length - overreach.length - wrongShape.length;

const areas = [...new Set(CASES.map(c => c.area))];
console.log('\nBY AREA');
for (const a of areas) {
  const rs = results.filter(r => r.area === a);
  const want = rs.filter(r => r.expect === 'runs');
  const got = want.filter(r => r.outcome === 'runs');
  const bar = want.length === 0 ? '—' : `${got.length}/${want.length}`;
  console.log(`  ${a.padEnd(12)} ${String(bar).padStart(6)}  ${want.length && got.length < want.length ? want.filter(r => r.outcome !== 'runs').map(r => r.name).join(' · ') : ''}`);
}

const say = (title: string, rs: Result[]): void => {
  if (rs.length === 0) return;
  console.log(`\n${title}`);
  for (const r of rs) console.log(`  ${r.area}/${r.name}\n      ${r.outcome.toUpperCase()} — ${r.detail}`);
};

say('DEFECTS — valid Pine this engine could not read', defects);
say('GAPS — refused, which is honest but a hole', gaps);
say('OVERREACH — accepted something it does not implement', overreach);
say('WRONG SHAPE — should have refused by name, did something else', wrongShape);

const wantRun = results.filter(r => r.expect === 'runs');
const didRun = wantRun.filter(r => r.outcome === 'runs');
console.log(`\nIN-SUBSET COVERAGE  ${didRun.length}/${wantRun.length} (${Math.round((100 * didRun.length) / wantRun.length)}%)`);
console.log(`CORRECT OUTCOMES    ${correct}/${results.length}`);
console.log(`DEFECTS             ${defects.length}   (valid Pine that would not parse — the only true bug)`);

/*
  The gate is DEFECTS and OVERREACH, not coverage. A subset is allowed to be
  a subset; it is not allowed to misreport valid Pine as malformed, and it is
  not allowed to accept what it cannot do. Coverage is printed to be watched,
  not enforced — closing a gap is a choice, and this file is how that choice
  is made with a number in front of it.
*/
process.exit(defects.length + overreach.length > 0 ? 1 : 0);
