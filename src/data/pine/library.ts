/*
==================================================
  SLAYER TERMINAL - THE INDICATOR LIBRARY (data/pine/library.ts)
==================================================

  Ninety indicators that ship with the terminal, written in the same Pine a
  reader writes and run by the same engine — the same refusals, the same
  report, the same pane rules. Not a privileged built-in path: if one of
  these draws something, a reader can open it, see exactly how, and change it.

  TWO HALVES, AND THE SPLIT IS THE POINT.

    kind: 'classic'  The standard list, because a desk that cannot draw an
                     Ichimoku is not a charting desk. Together with the two
                     dozen chart built-ins in the indicator menu, this covers
                     the whole of the canonical set that price and volume can
                     support. They are here so nobody has to leave.

    kind: 'slayer'   Two dozen that are IMPOSSIBLE ANYWHERE ELSE. Every one
                     reads `slayer.*` — the dealer book as a per-bar series —
                     which is the only reason to have a Pine engine here
                     rather than link to TradingView's. A moving-average
                     crossover ships with every package on earth; the call
                     wall as it stood at 10:05 ships with none of them.

  WHAT IS NOT HERE, AND WHY — the honest end of the standard list. These are
  absent because the DATA is, not because they were missed, and writing them
  against a substitute would put a plausible line on a chart that means
  something else:

    VIX, IV rank, IV percentile     want an implied-volatility HISTORY as a
                                    series; the desk reports today's implied,
                                    and `slayer.*` has no name for the past
                                    of it.
    Beta, historical beta           want a benchmark's bars beside this
                                    symbol's. `request.security` serves this
                                    symbol at other intervals; a SECOND
                                    instrument is refused by name.
    A/D line, McClellan, TRIN,      want market breadth — every listed name's
    TICK, new highs / new lows,     advance and decline. There is no breadth
    breadth ratio                   feed behind this desk.

  A reader who asks for one of these gets the refusal at the line, with the
  reason, rather than an indicator that draws.

  THE SOURCE LIVES IN CODE, NOT IN STORAGE. The store keeps only whether a
  reader has one switched on. An improvement here reaches everyone on the
  next load instead of being frozen into whatever was in localStorage the day
  they first opened the desk. A reader who wants to change one forks it, and
  the fork is an ordinary script of their own from that moment.

  EVERY ONE OF THESE IS ASSERTED TO DRAW, on the desk's own bars and the
  desk's own book, by `scripts/pine-library-proof.ts`. "It compiles" is a
  weak promise: a script can compile and put nothing on the chart, and that
  is the failure a reader blames the engine for.

  GENERATED — the sources are authored as .pine files and folded in here, so
  what ships is exactly what was run.
*/

export type LibraryKind = 'classic' | 'slayer';

export interface LibraryScript {
  /** Stable across releases — it is what the store remembers. */
  id: string;
  name: string;
  /** The shelf it sits on in the picker. */
  group: string;
  kind: LibraryKind;
  /** Drawn on the tape, or given a pane of its own. */
  overlay: boolean;
  /** One line, for the picker. What it shows, not how it works. */
  blurb: string;
  source: string;
}

export const LIBRARY: readonly LibraryScript[] = [
  {
    id: "ichimoku",
    name: "Ichimoku Cloud",
    group: "Trend",
    kind: "classic",
    overlay: true,
    blurb: "Tenkan, kijun, the lagging span and the cloud ahead — one picture of trend, support and momentum.",
    source: `//@version=6
indicator("Ichimoku Cloud", overlay = true)

convLen = input.int(9,  "Conversion", minval = 1)
baseLen = input.int(26, "Base", minval = 1)
spanLen = input.int(52, "Leading span B", minval = 1)
disp    = input.int(26, "Displacement", minval = 1)

donchian(int len) => math.avg(ta.lowest(len), ta.highest(len))

conv = donchian(convLen)
base = donchian(baseLen)
spanA = math.avg(conv, base)
spanB = donchian(spanLen)

plot(conv, "Conversion", color = #7DE3FF)
plot(base, "Base", color = #FF9500)
plot(close, "Lagging span", color = color.new(#D2FF00, 30), offset = -disp + 1)
a = plot(spanA, "Leading span A", color = color.new(#30D158, 55), offset = disp - 1)
b = plot(spanB, "Leading span B", color = color.new(#FF3B30, 55), offset = disp - 1)
fill(a, b, color = spanA > spanB ? color.new(#30D158, 88) : color.new(#FF3B30, 88), title = "Cloud")
alertcondition(ta.crossover(conv, base), "Conversion crossed up", "{{ticker}} tenkan crossed above kijun")
alertcondition(ta.crossunder(conv, base), "Conversion crossed down", "{{ticker}} tenkan crossed below kijun")`,
  },
  {
    id: "pivot-points",
    name: "Pivot Points Standard",
    group: "Levels",
    kind: "classic",
    overlay: true,
    blurb: "The floor-trader pivot and its R/S ladder, anchored to the previous day, week or month.",
    source: `//@version=6
indicator("Pivot Points Standard", overlay = true, max_lines_count = 20, max_labels_count = 20)

showR3 = input.bool(false, "R3 / S3")
anchor = input.string("D", "Anchor", options = ["D", "W", "M"])

pHigh = request.security(syminfo.tickerid, anchor, high[1], lookahead = barmerge.lookahead_on)
pLow  = request.security(syminfo.tickerid, anchor, low[1],  lookahead = barmerge.lookahead_on)
pClose= request.security(syminfo.tickerid, anchor, close[1],lookahead = barmerge.lookahead_on)

pp = (pHigh + pLow + pClose) / 3
rng = pHigh - pLow
r1 = 2 * pp - pLow
s1 = 2 * pp - pHigh
r2 = pp + rng
s2 = pp - rng
r3 = pHigh + 2 * (pp - pLow)
s3 = pLow - 2 * (pHigh - pp)

plot(pp, "P",  color = #D2FF00, style = plot.style_stepline, linewidth = 2)
plot(r1, "R1", color = color.new(#FF3B30, 25), style = plot.style_stepline)
plot(s1, "S1", color = color.new(#30D158, 25), style = plot.style_stepline)
plot(r2, "R2", color = color.new(#FF3B30, 50), style = plot.style_stepline)
plot(s2, "S2", color = color.new(#30D158, 50), style = plot.style_stepline)
plot(showR3 ? r3 : na, "R3", color = color.new(#FF3B30, 70), style = plot.style_stepline)
plot(showR3 ? s3 : na, "S3", color = color.new(#30D158, 70), style = plot.style_stepline)`,
  },
  {
    id: "auto-fib",
    name: "Auto Fibonacci",
    group: "Levels",
    kind: "classic",
    overlay: true,
    blurb: "Retracements drawn from the swing the chart is actually in, redrawn as the swing changes.",
    source: `//@version=6
indicator("Auto Fibonacci", overlay = true, max_lines_count = 20, max_labels_count = 20)

len = input.int(60, "Swing lookback", minval = 10)
ext = input.int(30, "Extend (bars)", minval = 5)

hi = ta.highest(high, len)
lo = ta.lowest(low, len)
up = ta.barssince(high == hi) > ta.barssince(low == lo)

level(float r) => up ? hi - (hi - lo) * r : lo + (hi - lo) * r

var array<line> fibs = array.new<line>()
var array<label> tags = array.new<label>()
if barstate.islast
    while array.size(fibs) > 0
        line.delete(array.pop(fibs))
    while array.size(tags) > 0
        label.delete(array.pop(tags))
    ratios = array.from(0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0)
    for i = 0 to array.size(ratios) - 1
        r = array.get(ratios, i)
        y = level(r)
        strong = r == 0.5 or r == 0.618
        array.push(fibs, line.new(bar_index - len, y, bar_index + ext, y, color = strong ? color.new(#D2FF00, 15) : color.new(#7DE3FF, 45), width = strong ? 2 : 1, style = strong ? line.style_solid : line.style_dotted))
        array.push(tags, label.new(bar_index + ext, y, str.tostring(r * 100, "#.#") + "%  " + str.tostring(y, "#.##"), style = label.style_label_left, color = color.new(#0a0a0a, 15), textcolor = strong ? #D2FF00 : #a3a3a3, size = size.tiny))`,
  },
  {
    id: "squeeze-momentum",
    name: "Squeeze Momentum",
    group: "Volatility",
    kind: "classic",
    overlay: false,
    blurb: "Bollinger inside Keltner is a coiled market; the histogram says which way it is likely to leave.",
    source: `//@version=6
indicator("Squeeze Momentum", overlay = false, precision = 2)

bbLen  = input.int(20, "BB Length", minval = 2)
bbMult = input.float(2.0, "BB Mult", step = 0.1)
kcLen  = input.int(20, "KC Length", minval = 2)
kcMult = input.float(1.5, "KC Mult", step = 0.1)

[bbMid, bbUp, bbLow] = ta.bb(close, bbLen, bbMult)
[kcMid, kcUp, kcLow] = ta.kc(close, kcLen, kcMult)
on  = bbUp < kcUp and bbLow > kcLow
off = bbUp > kcUp and bbLow < kcLow

basis = math.avg(math.avg(ta.highest(high, kcLen), ta.lowest(low, kcLen)), ta.sma(close, kcLen))
mom   = ta.linreg(close - basis, kcLen, 0)
rising = mom > nz(mom[1])
ink = mom > 0 ? (rising ? #30D158 : color.new(#30D158, 45)) : (rising ? color.new(#FF3B30, 45) : #FF3B30)

plot(mom, "momentum", style = plot.style_columns, color = ink)
plot(0, "squeeze", style = plot.style_circles, color = on ? #FF3B30 : off ? #30D158 : #7d7d7d, linewidth = 2)
hline(0, "", color = color.new(color.white, 70))
alertcondition(off and on[1], "Squeeze fired", "{{ticker}} squeeze released")`,
  },
  {
    id: "heikin-ashi",
    name: "Heikin Ashi Overlay",
    group: "Candles",
    kind: "classic",
    overlay: true,
    blurb: "Smoothed candles drawn over the real ones, so a trend reads clearly without losing the true price.",
    source: `//@version=6
indicator("Heikin Ashi Overlay", overlay = true)

showWicks = input.bool(true, "Wicks")

var float haOpen = na
haClose = (open + high + low + close) / 4
haOpen := na(haOpen) ? (open + close) / 2 : (haOpen + nz(haClose[1], haClose)) / 2
haHigh  = math.max(high, math.max(haOpen, haClose))
haLow   = math.min(low,  math.min(haOpen, haClose))
up = haClose >= haOpen
ink = up ? #30D158 : #FF3B30

plotcandle(haOpen, showWicks ? haHigh : math.max(haOpen, haClose), showWicks ? haLow : math.min(haOpen, haClose), haClose, "Heikin Ashi", color = color.new(ink, 20), wickcolor = color.new(ink, 45), bordercolor = ink)
alertcondition(up and not up[1], "Turned green", "{{ticker}} Heikin Ashi turned up")
alertcondition(not up and up[1], "Turned red", "{{ticker}} Heikin Ashi turned down")`,
  },
  {
    id: "zigzag",
    name: "ZigZag",
    group: "Structure",
    kind: "classic",
    overlay: true,
    blurb: "Swing legs above a percentage threshold, with the size of each move written on it.",
    source: `//@version=6
indicator("ZigZag", overlay = true, max_lines_count = 60, max_labels_count = 60)

dev  = input.float(1.0, "Reversal (%)", step = 0.1, minval = 0.1)
show = input.bool(true, "Leg size")

var float lastPx = na
var int lastIx = na
var int dir = 0
var array<line> legs = array.new<line>()
var array<label> tags = array.new<label>()

newLeg(float px, int ix) =>
    if array.size(legs) > 40
        line.delete(array.shift(legs))
    if array.size(tags) > 40
        label.delete(array.shift(tags))

if na(lastPx)
    lastPx := close
    lastIx := bar_index
    dir := 1

upMove = (high - lastPx) / lastPx * 100
dnMove = (lastPx - low) / lastPx * 100

if dir > 0 and dnMove >= dev
    newLeg(low, bar_index)
    array.push(legs, line.new(lastIx, lastPx, bar_index, low, color = color.new(#FF3B30, 20), width = 2))
    if show
        array.push(tags, label.new(bar_index, low, str.tostring((low - lastPx) / lastPx * 100, "#.##") + "%", style = label.style_label_up, color = color.new(#1a0000, 25), textcolor = #FF3B30, size = size.tiny))
    lastPx := low
    lastIx := bar_index
    dir := -1
else if dir < 0 and upMove >= dev
    newLeg(high, bar_index)
    array.push(legs, line.new(lastIx, lastPx, bar_index, high, color = color.new(#30D158, 20), width = 2))
    if show
        array.push(tags, label.new(bar_index, high, str.tostring((high - lastPx) / lastPx * 100, "+#.##") + "%", style = label.style_label_down, color = color.new(#001a00, 25), textcolor = #30D158, size = size.tiny))
    lastPx := high
    lastIx := bar_index
    dir := 1
else if dir > 0 and high > lastPx
    lastPx := high
    lastIx := bar_index
else if dir < 0 and low < lastPx
    lastPx := low
    lastIx := bar_index`,
  },
  {
    id: "anchored-vwap",
    name: "Multi-Anchor VWAP",
    group: "Volume",
    kind: "classic",
    overlay: true,
    blurb: "Day, week and month VWAPs at once, with a standard-deviation band on the day anchor.",
    source: `//@version=6
indicator("Multi-Anchor VWAP", overlay = true)

useD = input.bool(true,  "Day")
useW = input.bool(true,  "Week")
useM = input.bool(false, "Month")
showBands = input.bool(true, "±1σ on the day anchor")

anchoredVwap(bool reset) =>
    var float pv = 0.0
    var float vv = 0.0
    var float p2 = 0.0
    if reset
        pv := 0.0
        vv := 0.0
        p2 := 0.0
    tp = hlc3
    pv := pv + tp * volume
    vv := vv + volume
    p2 := p2 + tp * tp * volume
    mean = vv == 0 ? na : pv / vv
    varr = vv == 0 ? na : math.max(p2 / vv - mean * mean, 0)
    [mean, math.sqrt(varr)]

[dv, dsd] = anchoredVwap(ta.change(time("D")) != 0)
[wv, _wsd] = anchoredVwap(ta.change(time("W")) != 0)
[mv, _msd] = anchoredVwap(ta.change(time("M")) != 0)

plot(useD ? dv : na, "Day",   color = #D2FF00, linewidth = 2)
plot(useW ? wv : na, "Week",  color = #7DE3FF, linewidth = 1)
plot(useM ? mv : na, "Month", color = color.new(#FF9500, 20), linewidth = 1)
u = plot(useD and showBands ? dv + dsd : na, "+1σ", color = color.new(#D2FF00, 70))
l = plot(useD and showBands ? dv - dsd : na, "−1σ", color = color.new(#D2FF00, 70))
fill(u, l, color = color.new(#D2FF00, 94), title = "day band")`,
  },
  {
    id: "hull-ma",
    name: "Hull Moving Average",
    group: "Trend",
    kind: "classic",
    overlay: true,
    blurb: "A moving average with most of the lag taken out, coloured by the direction it is turning.",
    source: `//@version=6
indicator("Hull Moving Average", overlay = true)

len = input.int(55, "Length", minval = 2)
src = input.source(close, "Source")

hma = ta.wma(2 * ta.wma(src, math.floor(len / 2)) - ta.wma(src, len), math.floor(math.sqrt(len)))
up  = hma > nz(hma[1])
plot(hma, "HMA", color = up ? #30D158 : #FF3B30, linewidth = 3)
alertcondition(up and not up[1], "HMA turned up", "{{ticker}} Hull moving average turned up")
alertcondition(not up and up[1], "HMA turned down", "{{ticker}} Hull moving average turned down")`,
  },
  {
    id: "linreg-channel",
    name: "Linear Regression Channel",
    group: "Trend",
    kind: "classic",
    overlay: true,
    blurb: "The best-fit line through the last N bars with deviation rails either side.",
    source: `//@version=6
indicator("Linear Regression Channel", overlay = true, max_lines_count = 6)

len  = input.int(100, "Length", minval = 10)
mult = input.float(2.0, "Deviation", step = 0.25)

mid = ta.linreg(close, len, 0)
prev= ta.linreg(close, len, len - 1)
dev = ta.stdev(close, len) * mult

var line midL = na
var line upL = na
var line dnL = na
if barstate.islast
    line.delete(midL)
    line.delete(upL)
    line.delete(dnL)
    midL := line.new(bar_index - len + 1, prev, bar_index, mid, color = color.new(#D2FF00, 10), width = 2)
    upL  := line.new(bar_index - len + 1, prev + dev, bar_index, mid + dev, color = color.new(#FF3B30, 40), style = line.style_dashed)
    dnL  := line.new(bar_index - len + 1, prev - dev, bar_index, mid - dev, color = color.new(#30D158, 40), style = line.style_dashed)

plot(mid, "regression", color = color.new(#D2FF00, 65))`,
  },
  {
    id: "vortex",
    name: "Vortex",
    group: "Trend",
    kind: "classic",
    overlay: false,
    blurb: "Two lines racing: the crossing is the trend change, the gap between them is its conviction.",
    source: `//@version=6
indicator("Vortex", overlay = false, precision = 3)

len = input.int(14, "Length", minval = 2)

vmPlus  = math.abs(high - low[1])
vmMinus = math.abs(low - high[1])
trSum   = math.sum(ta.tr(true), len)
viPlus  = trSum == 0 ? na : math.sum(vmPlus, len) / trSum
viMinus = trSum == 0 ? na : math.sum(vmMinus, len) / trSum

p = plot(viPlus, "VI+", color = #30D158, linewidth = 2)
m = plot(viMinus, "VI−", color = #FF3B30, linewidth = 2)
fill(p, m, color = viPlus > viMinus ? color.new(#30D158, 88) : color.new(#FF3B30, 88), title = "lead")
hline(1, "parity", color = color.new(color.white, 60), linestyle = hline.style_dotted)
alertcondition(ta.crossover(viPlus, viMinus), "Vortex turned up", "{{ticker}} VI+ crossed above VI−")
alertcondition(ta.crossunder(viPlus, viMinus), "Vortex turned down", "{{ticker}} VI+ crossed below VI−")`,
  },
  {
    id: "trix",
    name: "TRIX",
    group: "Momentum",
    kind: "classic",
    overlay: false,
    blurb: "Triple-smoothed rate of change — momentum with the noise filtered out rather than averaged in.",
    source: `//@version=6
indicator("TRIX", overlay = false, precision = 4)

len = input.int(18, "Length", minval = 1)
sig = input.int(9,  "Signal", minval = 1)

triple = ta.ema(ta.ema(ta.ema(math.log(close), len), len), len)
trix   = 10000 * ta.change(triple)
signal = ta.sma(trix, sig)

plot(trix - signal, "histogram", style = plot.style_columns, color = trix >= signal ? color.new(#30D158, 45) : color.new(#FF3B30, 45))
plot(trix, "TRIX", color = #7DE3FF, linewidth = 2)
plot(signal, "signal", color = color.new(#FF9500, 20))
hline(0, "", color = color.new(color.white, 60))`,
  },
  {
    id: "force-index",
    name: "Force Index",
    group: "Volume",
    kind: "classic",
    overlay: false,
    blurb: "Price change multiplied by the volume behind it: how hard the move was actually pushed.",
    source: `//@version=6
indicator("Force Index", overlay = false, precision = 0)

len = input.int(13, "Smoothing", minval = 1)

raw = ta.change(close) * volume
fi  = ta.ema(raw, len)
plot(fi, "force", style = plot.style_area, color = fi >= 0 ? color.new(#30D158, 55) : color.new(#FF3B30, 55))
plot(fi, "", color = color.new(color.white, 30))
hline(0, "", color = color.new(color.white, 55))
alertcondition(ta.crossover(fi, 0), "Force turned positive", "{{ticker}} force index crossed above zero")
alertcondition(ta.crossunder(fi, 0), "Force turned negative", "{{ticker}} force index crossed below zero")`,
  },
  {
    id: "accum-dist",
    name: "Accumulation / Distribution",
    group: "Volume",
    kind: "classic",
    overlay: false,
    blurb: "Where each bar closed inside its range, volume-weighted and accumulated — read the slope.",
    source: `//@version=6
indicator("Accumulation / Distribution", overlay = false, precision = 0)

showSignal = input.bool(true, "Signal")
sigLen = input.int(21, "Signal length", minval = 2)

rng = high - low
mfm = rng == 0 ? 0 : ((close - low) - (high - close)) / rng
var float ad = 0.0
ad := ad + mfm * volume
sig = ta.ema(ad, sigLen)

plot(ad, "A/D", color = #7DE3FF, linewidth = 2)
plot(showSignal ? sig : na, "signal", color = color.new(#FF9500, 25))`,
  },
  {
    id: "chandelier",
    name: "Chandelier Exit",
    group: "Stops",
    kind: "classic",
    overlay: true,
    blurb: "An ATR stop hung from the highest high, which only ever moves in the trade's favour.",
    source: `//@version=6
indicator("Chandelier Exit", overlay = true)

len  = input.int(22, "ATR Length", minval = 1)
mult = input.float(3.0, "Multiplier", step = 0.5)

atr = ta.atr(len)
longStop  = ta.highest(close, len) - atr * mult
shortStop = ta.lowest(close, len) + atr * mult
var float ls = na
var float ss = na
ls := close[1] > nz(ls[1]) ? math.max(longStop, nz(ls[1])) : longStop
ss := close[1] < nz(ss[1], 1e18) ? math.min(shortStop, nz(ss[1], 1e18)) : shortStop
var int dir = 1
dir := close > nz(ss[1], 1e18) ? 1 : close < nz(ls[1]) ? -1 : dir

plot(dir > 0 ? ls : na, "long stop",  color = #30D158, style = plot.style_linebr, linewidth = 2)
plot(dir < 0 ? ss : na, "short stop", color = #FF3B30, style = plot.style_linebr, linewidth = 2)
plotshape(dir > 0 and dir[1] < 0, "flip up", style = shape.triangleup, location = location.belowbar, color = #30D158, size = size.tiny)
plotshape(dir < 0 and dir[1] > 0, "flip down", style = shape.triangledown, location = location.abovebar, color = #FF3B30, size = size.tiny)
alertcondition(dir > 0 and dir[1] < 0, "Chandelier flipped long", "{{ticker}} chandelier exit flipped long")
alertcondition(dir < 0 and dir[1] > 0, "Chandelier flipped short", "{{ticker}} chandelier exit flipped short")`,
  },
  {
    id: "atr-trail",
    name: "ATR Trailing Stop",
    group: "Stops",
    kind: "classic",
    overlay: true,
    blurb: "The classic volatility trail, with the bars coloured by the side it is currently on.",
    source: `//@version=6
indicator("ATR Trailing Stop", overlay = true)

len  = input.int(14, "ATR Length", minval = 1)
mult = input.float(2.5, "Multiplier", step = 0.25)

atr = ta.atr(len) * mult
var float trail = na
var int dir = 1
up = close - atr
dn = close + atr
if na(trail)
    trail := up
    dir := 1
else if dir > 0
    trail := math.max(trail, up)
    if close < trail
        dir := -1
        trail := dn
else
    trail := math.min(trail, dn)
    if close > trail
        dir := 1
        trail := up

plot(trail, "trail", color = dir > 0 ? #30D158 : #FF3B30, linewidth = 2, style = plot.style_linebr)
barcolor(dir > 0 ? color.new(#30D158, 65) : color.new(#FF3B30, 65))
plotshape(dir > 0 and dir[1] < 0, "long", style = shape.triangleup, location = location.belowbar, color = #30D158, size = size.tiny)
plotshape(dir < 0 and dir[1] > 0, "short", style = shape.triangledown, location = location.abovebar, color = #FF3B30, size = size.tiny)`,
  },
  {
    id: "relative-volume",
    name: "Relative Volume",
    group: "Volume",
    kind: "classic",
    overlay: false,
    blurb: "This bar's volume as a multiple of what is normal for the time — the participation read.",
    source: `//@version=6
indicator("Relative Volume", overlay = false, precision = 2)

len  = input.int(20, "Baseline (bars)", minval = 2)
loud = input.float(2.0, "Loud above (×)", step = 0.25)

base = ta.sma(volume, len)
rv   = base == 0 ? na : volume / base
hot  = not na(rv) and rv >= loud

plot(rv, "× normal", style = plot.style_columns, color = hot ? color.new(#D2FF00, 10) : rv >= 1 ? color.new(#7DE3FF, 45) : color.new(#7d7d7d, 55))
hline(1, "normal", color = color.new(color.white, 50))
hline(loud, "loud", color = color.new(#D2FF00, 55), linestyle = hline.style_dashed)
alertcondition(hot, "Volume spike", "{{ticker}} is trading well above its normal volume")`,
  },
  {
    id: "bb-percent",
    name: "Bollinger %B and Bandwidth",
    group: "Volatility",
    kind: "classic",
    overlay: false,
    blurb: "Where price sits between the bands, and how tight the bands are against their own range.",
    source: `//@version=6
indicator("Bollinger %B and Bandwidth", overlay = false, precision = 2)

len  = input.int(20, "Length", minval = 2)
mult = input.float(2.0, "Deviation", step = 0.1)
look = input.int(120, "Squeeze judged over (bars)", minval = 20)
pct  = input.float(15, "Squeeze inside (percentile)", step = 5)

[mid, up, lo] = ta.bb(close, len, mult)
span = up - lo
pctB = span == 0 ? na : (close - lo) / span
bw   = mid == 0 ? na : span / mid

// A BANDWIDTH THRESHOLD HAS TO BE RELATIVE. Bandwidth is a fraction of price,
// so any fixed number is either never met or always met depending on what the
// instrument costs — an absolute 0.05 shaded every bar of a $500 tape. Judged
// against its own recent range instead, "tight" means tight for THIS chart.
floorBw  = ta.percentile_linear_interpolation(bw, look, pct)
squeezed = not na(bw) and not na(floorBw) and bw <= floorBw

plot(pctB, "%B", color = #7DE3FF, linewidth = 2)
plot(bw, "bandwidth", color = color.new(#FF9500, 30))
hline(1, "upper band", color = color.new(#FF3B30, 55))
hline(0.5, "basis", color = color.new(color.white, 70), linestyle = hline.style_dotted)
hline(0, "lower band", color = color.new(#30D158, 55))
bgcolor(squeezed ? color.new(#D2FF00, 90) : na)
alertcondition(squeezed and not squeezed[1], "Bands squeezed", "{{ticker}} Bollinger bandwidth is at the tight end of its own range")`,
  },
  {
    id: "fair-value-gaps",
    name: "Fair Value Gaps",
    group: "Structure",
    kind: "classic",
    overlay: true,
    blurb: "Three-bar imbalances marked as zones, removed once price comes back and fills them.",
    source: `//@version=6
indicator("Fair Value Gaps", overlay = true, max_boxes_count = 60)

minPct = input.float(0.05, "Minimum gap (%)", step = 0.01)
keep   = input.int(20, "Gaps kept", minval = 1, maxval = 50)
fillClose = input.bool(true, "Remove once filled")

type Gap
    box  b
    float top
    float bot
    bool  up

var array<Gap> gaps = array.new<Gap>()

bullGap = low > high[2] and (low - high[2]) / close * 100 >= minPct
bearGap = high < low[2] and (low[2] - high) / close * 100 >= minPct

if bullGap
    g = Gap.new(box.new(bar_index - 2, low, bar_index + 10, high[2], border_color = color.new(#30D158, 55), bgcolor = color.new(#30D158, 88)), low, high[2], true)
    array.push(gaps, g)
if bearGap
    g = Gap.new(box.new(bar_index - 2, low[2], bar_index + 10, high, border_color = color.new(#FF3B30, 55), bgcolor = color.new(#FF3B30, 88)), low[2], high, false)
    array.push(gaps, g)

if array.size(gaps) > keep
    old = array.shift(gaps)
    box.delete(old.b)

if fillClose and array.size(gaps) > 0
    for i = array.size(gaps) - 1 to 0
        g = array.get(gaps, i)
        filled = g.up ? low <= g.bot : high >= g.top
        if filled
            box.delete(g.b)
            array.remove(gaps, i)
        else
            box.set_right(g.b, bar_index + 10)

plotshape(bullGap, "bull gap", style = shape.circle, location = location.belowbar, color = color.new(#30D158, 30), size = size.tiny)
plotshape(bearGap, "bear gap", style = shape.circle, location = location.abovebar, color = color.new(#FF3B30, 30), size = size.tiny)`,
  },
  {
    id: "market-structure",
    name: "Market Structure",
    group: "Structure",
    kind: "classic",
    overlay: true,
    blurb: "Breaks of structure and changes of character, labelled at the swing that gave way.",
    source: `//@version=6
indicator("Market Structure", overlay = true, max_lines_count = 40, max_labels_count = 40)

left  = input.int(8, "Pivot left", minval = 1)
right = input.int(8, "Pivot right", minval = 1)

ph = ta.pivothigh(high, left, right)
pl = ta.pivotlow(low, left, right)

var float lastHigh = na
var float lastLow = na
var int trend = 0

if not na(ph)
    lastHigh := ph
if not na(pl)
    lastLow := pl

bos = not na(lastHigh) and close > lastHigh and trend >= 0
choch = not na(lastHigh) and close > lastHigh and trend < 0
bosDn = not na(lastLow) and close < lastLow and trend <= 0
chochDn = not na(lastLow) and close < lastLow and trend > 0

if close > nz(lastHigh, 1e18)
    label.new(bar_index, high, trend < 0 ? "CHoCH" : "BOS", style = label.style_label_down, color = trend < 0 ? color.new(#D2FF00, 15) : color.new(#30D158, 20), textcolor = trend < 0 ? #101010 : color.white, size = size.tiny)
    line.new(bar_index - right, lastHigh, bar_index, lastHigh, color = color.new(#30D158, 35), style = line.style_dashed)
    trend := 1
    lastHigh := na
if close < nz(lastLow, -1e18)
    label.new(bar_index, low, trend > 0 ? "CHoCH" : "BOS", style = label.style_label_up, color = trend > 0 ? color.new(#D2FF00, 15) : color.new(#FF3B30, 20), textcolor = trend > 0 ? #101010 : color.white, size = size.tiny)
    line.new(bar_index - right, lastLow, bar_index, lastLow, color = color.new(#FF3B30, 35), style = line.style_dashed)
    trend := -1
    lastLow := na

alertcondition(bos or bosDn, "Structure broke", "{{ticker}} broke structure")
alertcondition(choch or chochDn, "Character changed", "{{ticker}} changed character")`,
  },
  {
    id: "liquidity-sweep",
    name: "Liquidity Sweeps",
    group: "Structure",
    kind: "classic",
    overlay: true,
    blurb: "Bars that took the highs or lows and closed straight back inside — stops taken, not a breakout.",
    source: `//@version=6
indicator("Liquidity Sweeps", overlay = true, max_labels_count = 60)

len   = input.int(20, "Reference range", minval = 5)
back  = input.float(0.5, "Must close back inside (× wick)", step = 0.1)

hi = ta.highest(high, len)[1]
lo = ta.lowest(low, len)[1]
upperWick = high - math.max(open, close)
lowerWick = math.min(open, close) - low

sweptHigh = high > hi and close < hi and upperWick > (high - low) * back
sweptLow  = low  < lo and close > lo and lowerWick > (high - low) * back

plotshape(sweptHigh, "swept the highs", style = shape.triangledown, location = location.abovebar, color = color.new(#FF3B30, 10), size = size.tiny, text = "sweep")
plotshape(sweptLow, "swept the lows", style = shape.triangleup, location = location.belowbar, color = color.new(#30D158, 10), size = size.tiny, text = "sweep")
barcolor(sweptHigh ? color.new(#FF3B30, 25) : sweptLow ? color.new(#30D158, 25) : na)
alertcondition(sweptHigh, "Highs swept", "{{ticker}} took the highs and closed back below")
alertcondition(sweptLow, "Lows swept", "{{ticker}} took the lows and closed back above")`,
  },
  {
    id: "order-blocks",
    name: "Order Blocks",
    group: "Structure",
    kind: "classic",
    overlay: true,
    blurb: "The last opposite candle before an impulse, kept as a zone because that is where price returns.",
    source: `//@version=6
indicator("Order Blocks", overlay = true, max_boxes_count = 30, max_labels_count = 30)

impulse = input.float(1.5, "Impulse (× ATR)", step = 0.25)
keep    = input.int(8, "Blocks kept", minval = 1, maxval = 20)

atr = ta.atr(14)
body = math.abs(close - open)
strongUp = close > open and body > atr * impulse
strongDn = close < open and body > atr * impulse

var array<box> blocks = array.new<box>()

push(float top, float bot, color ink) =>
    b = box.new(bar_index - 1, top, bar_index + 12, bot, border_color = color.new(ink, 45), bgcolor = color.new(ink, 88))
    array.push(blocks, b)
    if array.size(blocks) > keep
        box.delete(array.shift(blocks))

// The block is the LAST OPPOSITE CANDLE before the impulse — the one whose
// orders the move ran over. That is the level price returns to, not the
// impulse candle itself.
if strongUp and close[1] < open[1]
    push(math.max(open[1], close[1]), low[1], #30D158)
if strongDn and close[1] > open[1]
    push(high[1], math.min(open[1], close[1]), #FF3B30)

if array.size(blocks) > 0
    for i = 0 to array.size(blocks) - 1
        box.set_right(array.get(blocks, i), bar_index + 12)

plotshape(strongUp, "impulse up", style = shape.diamond, location = location.belowbar, color = color.new(#30D158, 40), size = size.tiny)
plotshape(strongDn, "impulse down", style = shape.diamond, location = location.abovebar, color = color.new(#FF3B30, 40), size = size.tiny)`,
  },
  {
    id: "previous-levels",
    name: "Previous Session Levels",
    group: "Levels",
    kind: "classic",
    overlay: true,
    blurb: "Yesterday's high, low and close plus last week's range — the levels everyone is watching.",
    source: `//@version=6
indicator("Previous Session Levels", overlay = true, max_labels_count = 12)

showDay  = input.bool(true, "Previous day")
showWeek = input.bool(true, "Previous week")
showMid  = input.bool(true, "Midpoints")

pdh = request.security(syminfo.tickerid, "D", high[1],  lookahead = barmerge.lookahead_on)
pdl = request.security(syminfo.tickerid, "D", low[1],   lookahead = barmerge.lookahead_on)
pdc = request.security(syminfo.tickerid, "D", close[1], lookahead = barmerge.lookahead_on)
pwh = request.security(syminfo.tickerid, "W", high[1],  lookahead = barmerge.lookahead_on)
pwl = request.security(syminfo.tickerid, "W", low[1],   lookahead = barmerge.lookahead_on)

plot(showDay ? pdh : na, "PDH", color = color.new(#FF3B30, 20), style = plot.style_stepline, linewidth = 2)
plot(showDay ? pdl : na, "PDL", color = color.new(#30D158, 20), style = plot.style_stepline, linewidth = 2)
plot(showDay ? pdc : na, "PDC", color = color.new(#7DE3FF, 35), style = plot.style_stepline)
plot(showDay and showMid ? math.avg(pdh, pdl) : na, "PD mid", color = color.new(#D2FF00, 55), style = plot.style_stepline)
plot(showWeek ? pwh : na, "PWH", color = color.new(#FF3B30, 60), style = plot.style_stepline)
plot(showWeek ? pwl : na, "PWL", color = color.new(#30D158, 60), style = plot.style_stepline)

alertcondition(ta.crossover(close, pdh), "Above yesterday's high", "{{ticker}} took out yesterday's high")
alertcondition(ta.crossunder(close, pdl), "Below yesterday's low", "{{ticker}} lost yesterday's low")`,
  },
  {
    id: "opening-range",
    name: "Opening Range Breakout",
    group: "Levels",
    kind: "classic",
    overlay: true,
    blurb: "The first N minutes boxed, then held as the level, with one- and two-times extensions.",
    source: `//@version=6
indicator("Opening Range Breakout", overlay = true, max_boxes_count = 20, max_lines_count = 20)

mins    = input.int(15, "Opening range (minutes)", minval = 1)
targets = input.bool(true, "1× and 2× extensions")
sess    = input.session("0930-1600", "Session")

inSess  = not na(time(timeframe.period, sess))
newDay  = ta.change(time("D")) != 0
var float orH = na
var float orL = na
var int orStart = na
var bool building = false
var box orBox = na

if newDay
    orH := na
    orL := na
    orStart := bar_index
    building := true
    orBox := box.new(bar_index, high, bar_index, low, border_color = color.new(#D2FF00, 40), bgcolor = color.new(#D2FF00, 92))

elapsed = na(orStart) ? na : (bar_index - orStart) * timeframe.in_seconds() / 60
if building and inSess
    orH := na(orH) ? high : math.max(orH, high)
    orL := na(orL) ? low  : math.min(orL, low)
    if not na(orBox)
        box.set_top(orBox, orH)
        box.set_bottom(orBox, orL)
        box.set_right(orBox, bar_index)
    if not na(elapsed) and elapsed >= mins
        building := false

rng = orH - orL
plot(building ? na : orH, "OR high", color = color.new(#FF3B30, 20), style = plot.style_linebr, linewidth = 2)
plot(building ? na : orL, "OR low",  color = color.new(#30D158, 20), style = plot.style_linebr, linewidth = 2)
plot(targets and not building ? orH + rng : na, "1× up", color = color.new(#FF3B30, 65), style = plot.style_linebr)
plot(targets and not building ? orL - rng : na, "1× down", color = color.new(#30D158, 65), style = plot.style_linebr)

brokeUp = not building and ta.crossover(close, orH)
brokeDn = not building and ta.crossunder(close, orL)
plotshape(brokeUp, "broke up", style = shape.triangleup, location = location.belowbar, color = #30D158, size = size.tiny)
plotshape(brokeDn, "broke down", style = shape.triangledown, location = location.abovebar, color = #FF3B30, size = size.tiny)
alertcondition(brokeUp, "Opening range broken up", "{{ticker}} broke the opening range high")
alertcondition(brokeDn, "Opening range broken down", "{{ticker}} broke the opening range low")`,
  },
  {
    id: "rsi-divergence",
    name: "RSI Divergence",
    group: "Momentum",
    kind: "classic",
    overlay: false,
    blurb: "Higher highs in price against lower highs in RSI, drawn between the two pivots that made them.",
    source: `//@version=6
indicator("RSI Divergence", overlay = false, max_lines_count = 40, max_labels_count = 40, precision = 1)

rsiLen = input.int(14, "RSI Length", minval = 2)
left   = input.int(5, "Pivot left", minval = 1)
right  = input.int(5, "Pivot right", minval = 1)

r = ta.rsi(close, rsiLen)
ph = ta.pivothigh(r, left, right)
pl = ta.pivotlow(r, left, right)

var float lastHiR = na
var int lastHiX = na
var float lastHiP = na
var float lastLoR = na
var int lastLoX = na
var float lastLoP = na

bear = false
bull = false

if not na(ph)
    p = high[right]
    if not na(lastHiR) and p > lastHiP and ph < lastHiR
        bear := true
        line.new(lastHiX, lastHiR, bar_index - right, ph, color = #FF3B30, width = 2)
        label.new(bar_index - right, ph, "bear", style = label.style_label_down, color = color.new(#FF3B30, 20), textcolor = color.white, size = size.tiny)
    lastHiR := ph
    lastHiX := bar_index - right
    lastHiP := p

if not na(pl)
    p = low[right]
    if not na(lastLoR) and p < lastLoP and pl > lastLoR
        bull := true
        line.new(lastLoX, lastLoR, bar_index - right, pl, color = #30D158, width = 2)
        label.new(bar_index - right, pl, "bull", style = label.style_label_up, color = color.new(#30D158, 20), textcolor = color.white, size = size.tiny)
    lastLoR := pl
    lastLoX := bar_index - right
    lastLoP := p

plot(r, "RSI", color = #7DE3FF, linewidth = 2)
hline(70, "overbought", color = color.new(#FF3B30, 60))
hline(50, "", color = color.new(color.white, 75), linestyle = hline.style_dotted)
hline(30, "oversold", color = color.new(#30D158, 60))
alertcondition(bear, "Bearish divergence", "{{ticker}} price made a higher high, RSI did not")
alertcondition(bull, "Bullish divergence", "{{ticker}} price made a lower low, RSI did not")`,
  },
  {
    id: "session-ranges",
    name: "Session Ranges",
    group: "Levels",
    kind: "classic",
    overlay: true,
    blurb: "Asia, London and New York boxed as they build, so the handover between them is visible.",
    source: `//@version=6
indicator("Session Ranges", overlay = true, max_boxes_count = 30, max_labels_count = 30)

asiaS   = input.session("2000-0000", "Asia")
londonS = input.session("0300-0800", "London")
nyS     = input.session("0930-1600", "New York")
showTag = input.bool(true, "Name each session")

track(string spec, color ink, string name) =>
    inside = not na(time(timeframe.period, spec))
    var box b = na
    var label t = na
    var float hi = na
    var float lo = na
    if inside and not inside[1]
        hi := high
        lo := low
        b := box.new(bar_index, high, bar_index, low, border_color = color.new(ink, 50), bgcolor = color.new(ink, 91))
        t := showTag ? label.new(bar_index, high, name, style = label.style_label_down, color = color.new(ink, 30), textcolor = color.white, size = size.tiny) : na
    if inside and not na(b)
        hi := math.max(hi, high)
        lo := math.min(lo, low)
        box.set_top(b, hi)
        box.set_bottom(b, lo)
        box.set_right(b, bar_index)
        if showTag and not na(t)
            label.set_y(t, hi)
    [hi, lo]

[aH, aL] = track(asiaS, #7DE3FF, "Asia")
[lH, lL] = track(londonS, #FF9500, "London")
[nH, nL] = track(nyS, #D2FF00, "New York")

plot(nH, "NY high", color = color.new(#D2FF00, 70), style = plot.style_linebr)
plot(nL, "NY low",  color = color.new(#D2FF00, 70), style = plot.style_linebr)`,
  },
  {
    id: "flip-distance",
    name: "Flip Distance",
    group: "Gamma",
    kind: "slayer",
    overlay: false,
    blurb: "How far price is from the gamma flip in ATR — inside one, the flip is live; beyond three, it is scenery.",
    source: `//@version=6
indicator("Flip Distance", overlay = false, precision = 2)

// How far price is from the gamma flip, in ATR — the one number that says
// whether the book is about to change character. Inside ±1 ATR the flip is
// live; beyond ±3 it is scenery.
atrLen  = input.int(14, "ATR Length", minval = 1)
hot     = input.float(1.0, "Live inside (ATR)", step = 0.25)
cold    = input.float(3.0, "Scenery beyond (ATR)", step = 0.25)

flip = slayer.flip
rng  = ta.atr(atrLen)
dist = na(flip) or rng == 0 ? na : (close - flip) / rng

above = not na(dist) and dist > 0
ink   = na(dist) ? color.gray : math.abs(dist) <= hot ? color.new(color.orange, 0) : above ? color.new(#30D158, 20) : color.new(#FF3B30, 20)

plot(dist, "ATR from flip", color = ink, linewidth = 2, style = plot.style_columns)
hline(0, "flip", color = color.new(color.white, 40), linestyle = hline.style_solid)
hline(hot, "live above", color = color.new(color.orange, 60), linestyle = hline.style_dotted)
hline(-hot, "live below", color = color.new(color.orange, 60), linestyle = hline.style_dotted)
hline(cold, "scenery", color = color.new(color.gray, 70), linestyle = hline.style_dashed)
hline(-cold, "", color = color.new(color.gray, 70), linestyle = hline.style_dashed)

bgcolor(not na(dist) and math.abs(dist) <= hot ? color.new(color.orange, 88) : na)
alertcondition(ta.cross(close, slayer.flip[1]), "Flip crossed", "Price crossed the gamma flip on {{ticker}}")`,
  },
  {
    id: "wall-corridor",
    name: "Wall Corridor",
    group: "Gamma",
    kind: "slayer",
    overlay: true,
    blurb: "The call and put walls as the corridor price is being held inside, shaded when it tightens.",
    source: `//@version=6
indicator("Wall Corridor", overlay = true, max_boxes_count = 8, max_labels_count = 8)

// The corridor the book is holding price inside — call wall above, put wall
// below — and how wide it is against its own recent history. A corridor
// tightening into a squeeze is the setup; the walls themselves are the edges.
tight   = input.float(0.6, "Tight below (× median)", step = 0.05)
lookback= input.int(60, "Median over (bars)", minval = 10)

cw = slayer.callwall
pw = slayer.putwall
width = slayer.wall_width
med   = ta.median(width, lookback)
squeezed = not na(med) and med > 0 and width < med * tight

top = plot(cw, "call wall", color = color.new(#FF3B30, 20), linewidth = 2, style = plot.style_stepline)
bot = plot(pw, "put wall",  color = color.new(#30D158, 20), linewidth = 2, style = plot.style_stepline)
fill(top, bot, color = squeezed ? color.new(color.orange, 86) : color.new(#7DE3FF, 93), title = "corridor")

var label tag = na
if barstate.islast and not na(cw) and not na(pw)
    label.delete(tag)
    pct = close > 0 ? (cw - pw) / close * 100 : na
    tag := label.new(bar_index + 3, cw, "corridor  " + str.tostring(cw - pw, "#.##") + (na(pct) ? "" : "  (" + str.tostring(pct, "#.##") + "%)") + (squeezed ? "  ⟨tight⟩" : ""), style = label.style_label_left, color = squeezed ? color.new(color.orange, 20) : color.new(#101010, 10), textcolor = color.white, size = size.small)

alertcondition(ta.crossover(close, slayer.callwall[1]), "Through the call wall", "{{ticker}} closed through the call wall that stood")
alertcondition(ta.crossunder(close, slayer.putwall[1]), "Through the put wall", "{{ticker}} closed through the put wall that stood")`,
  },
  {
    id: "gex-oscillator",
    name: "Net GEX Oscillator",
    group: "Gamma",
    kind: "slayer",
    overlay: false,
    blurb: "Dealer gamma z-scored against its own session, so an unreadable billion becomes how unusual today is.",
    source: `//@version=6
indicator("Net GEX Oscillator", overlay = false, precision = 2)

// Net dealer gamma is a number in the billions and unreadable as a level.
// Z-scored against its own session it becomes an oscillator: how unusual
// today's book is, not how big the number happens to be.
len  = input.int(120, "Baseline (bars)", minval = 20)
band = input.float(2.0, "Extreme (σ)", step = 0.5)

g   = slayer.netgex
mu  = ta.sma(g, len)
sd  = ta.stdev(g, len)
z   = sd == 0 or na(sd) ? na : (g - mu) / sd

ink = na(z) ? color.gray : z > 0 ? color.new(#FF3B30, 25) : color.new(#30D158, 25)
plot(z, "σ from normal", color = ink, style = plot.style_area, linewidth = 1)
plot(z, "line", color = color.new(color.white, 40), linewidth = 1)
hline(0, "balanced", color = color.new(color.white, 50))
hline(band, "put-heavy", color = color.new(#FF3B30, 60), linestyle = hline.style_dashed)
hline(-band, "call-heavy", color = color.new(#30D158, 60), linestyle = hline.style_dashed)
bgcolor(not na(z) and math.abs(z) >= band ? color.new(z > 0 ? #FF3B30 : #30D158, 90) : na)
alertcondition(not na(z) and math.abs(z) >= band, "Book at an extreme", "{{ticker}} dealer gamma is beyond its normal range")`,
  },
  {
    id: "overhead-underfoot",
    name: "Overhead vs Underfoot",
    group: "Gamma",
    kind: "slayer",
    overlay: false,
    blurb: "All the gamma above price against all of it below — the side dealers must hedge harder into.",
    source: `//@version=6
indicator("Overhead vs Underfoot", overlay = false, precision = 2)

// All the gamma above price against all of it below. The side carrying more
// is the side dealers have to hedge harder into — so the imbalance says which
// way the book leans, and the zero line is where it stops leaning at all.
smooth = input.int(5, "Smoothing", minval = 1)

up   = slayer.gex_above
dn   = slayer.gex_below
tot  = math.abs(up) + math.abs(dn)
tilt = tot == 0 ? na : ta.ema((math.abs(dn) - math.abs(up)) / tot, smooth)

plot(tilt, "underfoot − overhead", color = na(tilt) ? color.gray : tilt > 0 ? color.new(#30D158, 15) : color.new(#FF3B30, 15), style = plot.style_columns)
hline(0, "level", color = color.new(color.white, 40))
hline(0.5, "floor-heavy", color = color.new(#30D158, 70), linestyle = hline.style_dotted)
hline(-0.5, "roof-heavy", color = color.new(#FF3B30, 70), linestyle = hline.style_dotted)
alertcondition(ta.crossover(tilt, 0), "Book tilted to the floor", "{{ticker}} gamma below price now outweighs gamma above")
alertcondition(ta.crossunder(tilt, 0), "Book tilted to the roof", "{{ticker}} gamma above price now outweighs gamma below")`,
  },
  {
    id: "pin-risk",
    name: "Pin Risk",
    group: "Expiry",
    kind: "slayer",
    overlay: true,
    blurb: "The gamma centroid and the max-pain strike, drawn as the two levels that pull price into expiry.",
    source: `//@version=6
indicator("Pin Risk", overlay = true, max_lines_count = 12, max_labels_count = 12)

// The two levels that pull price on expiry — the gamma-weighted centroid of
// the book and the max-pain strike — with the distance to each. Both are
// SNAPSHOT reads off today's chain, so they are drawn as levels standing
// today rather than as a history.
showPain = input.bool(true, "Max pain")
showPin  = input.bool(true, "Gamma pin")

pin  = slayer.gammapin
pain = slayer.maxpain

var line pinLine = na
var line painLine = na
var label pinTag = na
var label painTag = na

if barstate.islast
    if showPin and not na(pin)
        line.delete(pinLine)
        label.delete(pinTag)
        pinLine := line.new(bar_index - 120, pin, bar_index + 6, pin, color = color.new(#D2FF00, 10), width = 2, style = line.style_solid)
        pinTag  := label.new(bar_index + 6, pin, "gamma pin " + str.tostring(pin, "#.##") + "  " + str.tostring(close - pin, "+#.##;-#.##"), style = label.style_label_left, color = color.new(#1a1a00, 10), textcolor = #D2FF00, size = size.small)
    if showPain and not na(pain)
        line.delete(painLine)
        label.delete(painTag)
        painLine := line.new(bar_index - 120, pain, bar_index + 6, pain, color = color.new(#FF9500, 20), width = 2, style = line.style_dashed)
        painTag  := label.new(bar_index + 6, pain, "max pain " + str.tostring(pain, "#.##") + "  " + str.tostring(close - pain, "+#.##;-#.##"), style = label.style_label_left, color = color.new(#1a1000, 10), textcolor = #FF9500, size = size.small)`,
  },
  {
    id: "gamma-momentum",
    name: "Gamma Momentum",
    group: "Gamma",
    kind: "slayer",
    overlay: false,
    blurb: "Not how much gamma there is — how fast it is changing, which is dealers being forced to re-hedge.",
    source: `//@version=6
indicator("Gamma Momentum", overlay = false, precision = 2)

// Not how much gamma there is — how fast it is CHANGING. A book rebuilding
// against price is dealers being forced to re-hedge, and that shows up here
// before it shows up in the level.
len   = input.int(12, "Rate over (bars)", minval = 1)
sig   = input.int(9, "Signal", minval = 1)

g    = slayer.netgex
roc  = ta.change(g, len)
line_ = ta.ema(roc, 3)
signal = ta.ema(line_, sig)
histo  = line_ - signal

plot(histo, "build", style = plot.style_columns, color = histo >= 0 ? color.new(#FF3B30, 40) : color.new(#30D158, 40))
plot(line_, "Δ gamma", color = #7DE3FF, linewidth = 2)
plot(signal, "signal", color = color.new(#FF9500, 20))
hline(0, "flat", color = color.new(color.white, 55))
alertcondition(ta.crossover(line_, signal), "Gamma building to puts", "{{ticker}} dealer gamma is rebuilding put-side")
alertcondition(ta.crossunder(line_, signal), "Gamma building to calls", "{{ticker}} dealer gamma is rebuilding call-side")`,
  },
  {
    id: "strike-magnet",
    name: "Strike Magnet",
    group: "Gamma",
    kind: "slayer",
    overlay: true,
    blurb: "The heaviest strike near price, shown only when it holds enough of the band to actually matter.",
    source: `//@version=6
indicator("Strike Magnet", overlay = true, max_lines_count = 20, max_labels_count = 20)

// The heaviest strike near price, drawn as the level it is, with the gamma
// it carries written beside it. Price does not respect a strike because it
// is round — it respects it because of what is stacked there.
near   = input.float(1.5, "Search within (%)", step = 0.25)
minPct = input.float(15, "Only if it holds (% of band)", step = 5)

band  = slayer.gex_band(near)
here  = slayer.supreme
share = band == 0 or na(here) ? na : math.abs(slayer.gex(here)) / math.abs(band) * 100
strong = not na(share) and share >= minPct

plot(strong ? here : na, "magnet", color = color.new(#D2FF00, 10), linewidth = 3, style = plot.style_linebr)

var label tag = na
if barstate.islast and strong
    label.delete(tag)
    tag := label.new(bar_index + 4, here, "magnet " + str.tostring(here, "#.##") + "  " + str.tostring(share, "#") + "% of the band", style = label.style_label_left, color = color.new(#1a1a00, 10), textcolor = #D2FF00, size = size.small)

alertcondition(strong and ta.cross(close, slayer.supreme[1]), "Through the magnet", "{{ticker}} crossed the heaviest strike near price")`,
  },
  {
    id: "oi-divergence",
    name: "OI Divergence",
    group: "Open interest",
    kind: "slayer",
    overlay: true,
    blurb: "A high made while call open interest is closing: positioning leaving before price does.",
    source: `//@version=6
indicator("OI Divergence", overlay = true, max_labels_count = 60)

// Price making a high while call open interest is being CLOSED — or a low
// while put OI closes — is positioning leaving before price does. This is a
// read no price-only chart can produce.
len  = input.int(20, "Swing lookback", minval = 5)
minOi= input.int(200, "Minimum OI change", minval = 0)

dCall = slayer.doi_book_call
dPut  = slayer.doi_book_put
hiPx  = ta.highest(close, len) == close
loPx  = ta.lowest(close, len) == close

bear = hiPx and dCall < -minOi
bull = loPx and dPut  < -minOi

plotshape(bear, "calls leaving the high", style = shape.triangledown, location = location.abovebar, color = color.new(#FF3B30, 10), size = size.tiny, text = "OI")
plotshape(bull, "puts leaving the low", style = shape.triangleup, location = location.belowbar, color = color.new(#30D158, 10), size = size.tiny, text = "OI")
barcolor(bear ? color.new(#FF3B30, 30) : bull ? color.new(#30D158, 30) : na)
alertcondition(bear, "Calls closing into a high", "{{ticker}} made a high while call OI was closing")
alertcondition(bull, "Puts closing into a low", "{{ticker}} made a low while put OI was closing")`,
  },
  {
    id: "dealer-board",
    name: "Dealer Greek Board",
    group: "Greeks",
    kind: "slayer",
    overlay: true,
    blurb: "Gamma, delta, vega, vanna and charm in one table, with the regime the book is in.",
    source: `//@version=6
indicator("Dealer Greek Board", overlay = true)

// Every dealer greek this desk can see, in one table. These are SNAPSHOT
// reads off today's chain — there is one of each, so they are shown as
// numbers rather than drawn as a history that would be a straight line.
pos = input.string("top right", "Corner", options = ["top right", "top left", "bottom right", "bottom left"])

fmt(float v) =>
    a = math.abs(v)
    a >= 1000000000 ? str.tostring(v / 1000000000, "#.##") + "B" : a >= 1000000 ? str.tostring(v / 1000000, "#.##") + "M" : a >= 1000 ? str.tostring(v / 1000, "#.#") + "K" : str.tostring(v, "#.##")

var table board = table.new(position.top_right, 2, 7, border_width = 1, frame_width = 1, frame_color = #2a2a2a, border_color = #1c1c1c)
if barstate.islast
    table.cell(board, 0, 0, "DEALER BOOK", text_color = #7d7d7d, text_size = size.tiny, bgcolor = #0a0a0a)
    table.cell(board, 1, 0, syminfo.ticker, text_color = #ededed, text_size = size.tiny, bgcolor = #0a0a0a)
    table.cell(board, 0, 1, "gamma", text_color = #a3a3a3, text_size = size.tiny, bgcolor = #070707)
    table.cell(board, 1, 1, fmt(slayer.netgex), text_color = slayer.netgex < 0 ? #30D158 : #FF3B30, text_size = size.tiny, bgcolor = #070707)
    table.cell(board, 0, 2, "delta", text_color = #a3a3a3, text_size = size.tiny, bgcolor = #0a0a0a)
    table.cell(board, 1, 2, fmt(slayer.dex), text_color = #ededed, text_size = size.tiny, bgcolor = #0a0a0a)
    table.cell(board, 0, 3, "vega", text_color = #a3a3a3, text_size = size.tiny, bgcolor = #070707)
    table.cell(board, 1, 3, fmt(slayer.vex), text_color = #ededed, text_size = size.tiny, bgcolor = #070707)
    table.cell(board, 0, 4, "vanna", text_color = #a3a3a3, text_size = size.tiny, bgcolor = #0a0a0a)
    table.cell(board, 1, 4, fmt(slayer.vanna), text_color = #ededed, text_size = size.tiny, bgcolor = #0a0a0a)
    table.cell(board, 0, 5, "charm", text_color = #a3a3a3, text_size = size.tiny, bgcolor = #070707)
    table.cell(board, 1, 5, fmt(slayer.charm), text_color = #ededed, text_size = size.tiny, bgcolor = #070707)
    table.cell(board, 0, 6, "regime", text_color = #a3a3a3, text_size = size.tiny, bgcolor = #0a0a0a)
    table.cell(board, 1, 6, slayer.amplifying ? "amplifying" : slayer.absorbing ? "absorbing" : "—", text_color = slayer.amplifying ? #FF9500 : #30D158, text_size = size.tiny, bgcolor = #0a0a0a)`,
  },
  {
    id: "regime-duration",
    name: "Regime Duration",
    group: "Gamma",
    kind: "slayer",
    overlay: false,
    blurb: "How long the book has held its character — three bars is noise, all session is the condition.",
    source: `//@version=6
indicator("Regime Duration", overlay = false, precision = 0)

// How long the book has held its character. A regime three bars old is
// noise; one that has held all session is the session's actual condition,
// and the bar it breaks is the thing worth an alert.
minRun = input.int(10, "Established after (bars)", minval = 1)

amp = slayer.amplifying
abs_ = slayer.absorbing
var int run = 0
var bool wasAmp = false
flipped = amp != wasAmp
run := flipped ? 1 : run + 1
wasAmp := amp

held = run >= minRun
plot(amp ? run : -run, "bars held", style = plot.style_columns, color = amp ? color.new(#FF9500, held ? 10 : 55) : color.new(#30D158, held ? 10 : 55))
hline(0, "flip", color = color.new(color.white, 45))
plotshape(flipped and run[1] >= minRun, "regime broke", style = shape.diamond, location = location.absolute, color = #D2FF00, size = size.tiny)
alertcondition(flipped, "Gamma regime flipped", "{{ticker}} dealers changed sides — the hedge now runs the other way")`,
  },
  {
    id: "book-skew",
    name: "Book Skew",
    group: "Open interest",
    kind: "slayer",
    overlay: false,
    blurb: "Call OI against put OI at the same distance from price, so the comparison is like for like.",
    source: `//@version=6
indicator("Book Skew", overlay = false, precision = 2)

// Call OI against put OI at the SAME distance from price, so the comparison
// is like for like. A skew is not "more calls than puts" — it is more calls
// than puts at the same reach.
reach = input.float(1.0, "Reach (%)", step = 0.25, minval = 0.1)
smooth= input.int(5, "Smoothing", minval = 1)

up = close * (1 + reach / 100)
dn = close * (1 - reach / 100)
c  = slayer.call_oi(up)
p  = slayer.put_oi(dn)
tot = c + p
skew = tot == 0 ? na : ta.ema((c - p) / tot, smooth)

plot(skew, "call-side − put-side", color = na(skew) ? color.gray : skew > 0 ? color.new(#30D158, 20) : color.new(#FF3B30, 20), style = plot.style_area)
plot(skew, "", color = color.new(color.white, 45))
hline(0, "even", color = color.new(color.white, 45))
hline(0.4, "call-skewed", color = color.new(#30D158, 70), linestyle = hline.style_dotted)
hline(-0.4, "put-skewed", color = color.new(#FF3B30, 70), linestyle = hline.style_dotted)`,
  },
  {
    id: "wall-break",
    name: "Wall Break",
    group: "Gamma",
    kind: "slayer",
    overlay: true,
    blurb: "Walls that stood and then gave, with the broken level left on the chart because price returns to it.",
    source: `//@version=6
indicator("Wall Break", overlay = true, max_lines_count = 30, max_labels_count = 30)

// A wall is only interesting when it BREAKS, and only if it stood first.
// This marks the ones that held for a while and then gave, and leaves the
// broken level on the chart because that is where price comes back to.
minHold = input.int(12, "Must have stood (bars)", minval = 2)
keep    = input.int(6, "Levels kept", minval = 1, maxval = 20)

cw = slayer.callwall
pw = slayer.putwall
var int cwHeld = 0
var int pwHeld = 0
cwHeld := na(cw) or na(cw[1]) or cw != cw[1] ? 0 : cwHeld + 1
pwHeld := na(pw) or na(pw[1]) or pw != pw[1] ? 0 : pwHeld + 1

brokeUp = ta.crossover(close, cw[1]) and cwHeld[1] >= minHold
brokeDn = ta.crossunder(close, pw[1]) and pwHeld[1] >= minHold

var array<line> ghosts = array.new<line>()
if brokeUp or brokeDn
    lvl = brokeUp ? cw[1] : pw[1]
    ink = brokeUp ? color.new(#FF3B30, 45) : color.new(#30D158, 45)
    array.push(ghosts, line.new(bar_index, lvl, bar_index + 40, lvl, color = ink, style = line.style_dashed, width = 1, extend = extend.right))
    if array.size(ghosts) > keep
        line.delete(array.shift(ghosts))
    label.new(bar_index, lvl, brokeUp ? "call wall gave" : "put wall gave", style = brokeUp ? label.style_label_down : label.style_label_up, color = ink, textcolor = color.white, size = size.tiny)

plotshape(brokeUp, "call wall broke", style = shape.triangleup, location = location.belowbar, color = #FF3B30, size = size.tiny)
plotshape(brokeDn, "put wall broke", style = shape.triangledown, location = location.abovebar, color = #30D158, size = size.tiny)
alertcondition(brokeUp, "Call wall gave way", "{{ticker}} broke a call wall that had stood")
alertcondition(brokeDn, "Put wall gave way", "{{ticker}} broke a put wall that had stood")`,
  },
  {
    id: "corridor-position",
    name: "Corridor Position",
    group: "Gamma",
    kind: "slayer",
    overlay: false,
    blurb: "A %B for the dealer book: how much room is left before the book has to defend.",
    source: `//@version=6
indicator("Corridor Position", overlay = false, precision = 1)

// Where price sits INSIDE the wall corridor, 0 at the put wall and 100 at
// the call wall. A %B for the dealer book: the number says how much room is
// left before the book has to defend, which price alone cannot tell you.
hot = input.float(85, "Pressing (%)", step = 5)

cw = slayer.callwall
pw = slayer.putwall
span = cw - pw
pos  = na(span) or span <= 0 ? na : (close - pw) / span * 100

ink = na(pos) ? color.gray : pos >= hot ? color.new(#FF3B30, 10) : pos <= 100 - hot ? color.new(#30D158, 10) : color.new(#7DE3FF, 25)
plot(pos, "position in corridor", color = ink, linewidth = 2)
hline(100, "call wall", color = color.new(#FF3B30, 45))
hline(50, "middle", color = color.new(color.white, 65), linestyle = hline.style_dotted)
hline(0, "put wall", color = color.new(#30D158, 45))
bgcolor(not na(pos) and (pos >= hot or pos <= 100 - hot) ? color.new(pos >= hot ? #FF3B30 : #30D158, 90) : na)
alertcondition(ta.crossover(pos, hot), "Pressing the call wall", "{{ticker}} is in the top of the dealer corridor")
alertcondition(ta.crossunder(pos, 100 - hot), "Pressing the put wall", "{{ticker}} is in the bottom of the dealer corridor")`,
  },
  {
    id: "hedge-flow",
    name: "Dealer Hedge Flow",
    group: "Gamma",
    kind: "slayer",
    overlay: false,
    blurb: "What dealers had to trade to stay hedged — gamma times the move, signed by which way it pushed.",
    source: `//@version=6
indicator("Dealer Hedge Flow", overlay = false, precision = 0)

// What dealers had to TRADE to stay hedged. Gamma is shares-per-point, so
// gamma × the bar's move is the hedge the move forced — and the sign says
// whether that trading pushed with price or against it.
smooth = input.int(3, "Smoothing", minval = 1)

g    = slayer.netgex
move = ta.change(close)
// POSITIVE net gamma is put-dominant, which is dealers SHORT gamma, which is
// hedging WITH the move — they buy into a rise. Negative is long gamma and
// they sell into it. So gamma × the move carries the right sign in BOTH
// regimes, and no case split is needed. Getting this backwards draws a chart
// that looks entirely reasonable and says the opposite of what happened.
forced = na(g) ? na : ta.ema(g * move / 100000000, smooth)
withMove = slayer.amplifying

plot(forced, "forced hedge", style = plot.style_columns, color = na(forced) ? color.gray : forced >= 0 ? color.new(#30D158, 30) : color.new(#FF3B30, 30))
hline(0, "none", color = color.new(color.white, 45))
bgcolor(withMove ? color.new(#FF9500, 92) : na)
alertcondition(withMove and math.abs(forced) > math.abs(ta.sma(forced, 50)) * 3, "Heavy forced hedging", "{{ticker}} dealers are hedging hard into the move")`,
  },
  {
    id: "gamma-vwap",
    name: "Gamma-Weighted VWAP",
    group: "Gamma",
    kind: "slayer",
    overlay: true,
    blurb: "A session VWAP weighted by the gamma standing behind each bar, not by volume alone.",
    source: `//@version=6
indicator("Gamma-Weighted VWAP", overlay = true)

// A session VWAP weighted by how much dealer gamma stood behind each bar
// rather than by volume alone. Bars printed when the book was thick count
// for more, because those are the prices dealers actually had to defend.
showPlain = input.bool(true, "Plain VWAP too")

newSession = ta.change(time("D")) != 0
var float wpv = 0.0
var float wt  = 0.0
var float pv  = 0.0
var float vt  = 0.0
if newSession
    wpv := 0.0
    wt  := 0.0
    pv  := 0.0
    vt  := 0.0
tp = (high + low + close) / 3
w  = volume * (1 + math.abs(nz(slayer.netgex)) / 1000000000)
wpv := wpv + tp * w
wt  := wt + w
pv  := pv + tp * volume
vt  := vt + volume

gv = wt == 0 ? na : wpv / wt
vw = vt == 0 ? na : pv / vt

plot(gv, "gamma VWAP", color = color.new(#D2FF00, 0), linewidth = 2)
plot(showPlain ? vw : na, "plain VWAP", color = color.new(#7DE3FF, 35), linewidth = 1)
alertcondition(ta.crossover(close, gv), "Reclaimed the gamma VWAP", "{{ticker}} closed back above the gamma-weighted VWAP")`,
  },
  {
    id: "charm-clock",
    name: "Charm Clock",
    group: "Greeks",
    kind: "slayer",
    overlay: false,
    blurb: "Delta bleeding away with time, against the clock — the late hours where the drift actually appears.",
    source: `//@version=6
indicator("Charm Clock", overlay = false, precision = 2)

// Charm is delta bleeding away with time, and it does its work late in the
// session. This puts the desk's charm read against the clock, so the hours
// where the drift actually appears are the ones lit up.
fromH = input.int(14, "Drift window opens (hour)", minval = 0, maxval = 23)

ch = slayer.charm
scaled = na(ch) ? na : ch / 1000000
late = hour >= fromH

plot(scaled, "charm (M)", style = plot.style_area, color = na(scaled) ? color.gray : scaled > 0 ? color.new(#30D158, 45) : color.new(#FF3B30, 45))
plot(scaled, "", color = color.new(color.white, 30), linewidth = 1)
hline(0, "flat", color = color.new(color.white, 50))
bgcolor(late ? color.new(#FF9500, 92) : na)
plotchar(late and not late[1], "drift window opens", char = "◷", location = location.bottom, color = #FF9500, size = size.tiny)`,
  },
  {
    id: "strike-ladder",
    name: "Strike Ladder",
    group: "Open interest",
    kind: "slayer",
    overlay: true,
    blurb: "The five heaviest strikes each side with their open interest and distance, as a board not a cage.",
    source: `//@version=6
indicator("Strike Ladder", overlay = true)

// The five heaviest strikes each side with the open interest sitting on
// them, as a board rather than as lines — because five levels drawn across
// a chart is a cage, and the numbers are what a reader is actually after.
depth = input.int(5, "Rungs each side", minval = 1, maxval = 8)

oiFmt(float v) =>
    a = math.abs(v)
    a >= 1000000 ? str.tostring(v / 1000000, "#.#") + "M" : a >= 1000 ? str.tostring(v / 1000, "#.#") + "K" : str.tostring(v, "#")

var table rungs = table.new(position.middle_right, 3, 12, border_width = 1, frame_width = 1, frame_color = #2a2a2a, border_color = #1c1c1c)
if barstate.islast
    table.cell(rungs, 0, 0, "STRIKE", text_color = #7d7d7d, text_size = size.tiny, bgcolor = #0a0a0a)
    table.cell(rungs, 1, 0, "OI", text_color = #7d7d7d, text_size = size.tiny, bgcolor = #0a0a0a)
    table.cell(rungs, 2, 0, "AWAY", text_color = #7d7d7d, text_size = size.tiny, bgcolor = #0a0a0a)
    for i = 1 to depth
        k = slayer.nth_call(i)
        row = i
        shade = i % 2 == 0 ? #070707 : #0a0a0a
        table.cell(rungs, 0, row, na(k) ? "—" : str.tostring(k, "#.##"), text_color = #FF3B30, text_size = size.tiny, bgcolor = shade)
        table.cell(rungs, 1, row, na(k) ? "" : oiFmt(slayer.call_oi(k)), text_color = #ededed, text_size = size.tiny, bgcolor = shade)
        table.cell(rungs, 2, row, na(k) ? "" : str.tostring(k - close, "+#.##;-#.##"), text_color = #a3a3a3, text_size = size.tiny, bgcolor = shade)
    for i = 1 to depth
        k = slayer.nth_put(i)
        row = depth + i
        shade = i % 2 == 0 ? #070707 : #0a0a0a
        table.cell(rungs, 0, row, na(k) ? "—" : str.tostring(k, "#.##"), text_color = #30D158, text_size = size.tiny, bgcolor = shade)
        table.cell(rungs, 1, row, na(k) ? "" : oiFmt(slayer.put_oi(k)), text_color = #ededed, text_size = size.tiny, bgcolor = shade)
        table.cell(rungs, 2, row, na(k) ? "" : str.tostring(k - close, "+#.##;-#.##"), text_color = #a3a3a3, text_size = size.tiny, bgcolor = shade)`,
  },
  {
    id: "expiry-gravity",
    name: "Expiry Gravity",
    group: "Expiry",
    kind: "slayer",
    overlay: true,
    blurb: "Max pain as a band, with how hard it is pulling written beside it.",
    source: `//@version=6
indicator("Expiry Gravity", overlay = true, max_lines_count = 10, max_labels_count = 10)

// How hard the expiry is pulling. Max pain is where the most contracts die
// worthless, and the distance to it — shrinking through the session — is
// the pull. Drawn as a band that closes on price as the day runs out.
showBand = input.bool(true, "Pull band")
wide     = input.float(0.35, "Band (%)", step = 0.05)

pain = slayer.maxpain
pull = na(pain) or close == 0 ? na : (pain - close) / close * 100

var line pinLine = na
var label tag = na
var box band = na
if barstate.islast and not na(pain)
    line.delete(pinLine)
    label.delete(tag)
    box.delete(band)
    pinLine := line.new(bar_index - 90, pain, bar_index + 8, pain, color = color.new(#FF9500, 10), width = 2)
    if showBand
        band := box.new(bar_index - 90, pain * (1 + wide / 100), bar_index + 8, pain * (1 - wide / 100), border_color = color.new(#FF9500, 70), bgcolor = color.new(#FF9500, 92))
    tag := label.new(bar_index + 8, pain, "max pain " + str.tostring(pain, "#.##") + "\\npull " + str.tostring(pull, "+#.##;-#.##") + "%", style = label.style_label_left, color = color.new(#1a1000, 10), textcolor = #FF9500, size = size.small)`,
  },
  {
    id: "book-coverage",
    name: "Book Coverage",
    group: "Data",
    kind: "slayer",
    overlay: false,
    blurb: "Whether there was a book behind each bar at all — the bars where every gamma level is a guess.",
    source: `//@version=6
indicator("Book Coverage", overlay = false, precision = 0)

// EVERY OTHER SCRIPT HERE READS THE BOOK, so this one says whether there
// was a book to read. Bars with no chain behind them are the bars where a
// gamma level is a guess, and no indicator that draws a line will tell you
// which those were.
thin = input.int(8, "Thin below (strikes)", minval = 1)

n     = slayer.strikes
has   = slayer.has_book
step  = slayer.step
poor  = not has or n < thin

plot(has ? n : 0, "strikes in the book", style = plot.style_columns, color = poor ? color.new(#FF9500, 25) : color.new(#7DE3FF, 55))
hline(thin, "thin", color = color.new(#FF9500, 55), linestyle = hline.style_dashed)
bgcolor(not has ? color.new(#FF3B30, 88) : na)

var table meta = table.new(position.bottom_left, 2, 3, border_width = 1, frame_width = 1, frame_color = #2a2a2a, border_color = #1c1c1c)
if barstate.islast
    covered = 0
    table.cell(meta, 0, 0, "coverage", text_color = #7d7d7d, text_size = size.tiny, bgcolor = #0a0a0a)
    table.cell(meta, 1, 0, has ? "book present" : "no book", text_color = has ? #30D158 : #FF3B30, text_size = size.tiny, bgcolor = #0a0a0a)
    table.cell(meta, 0, 1, "strikes", text_color = #7d7d7d, text_size = size.tiny, bgcolor = #070707)
    table.cell(meta, 1, 1, str.tostring(n, "#"), text_color = #ededed, text_size = size.tiny, bgcolor = #070707)
    table.cell(meta, 0, 2, "spacing", text_color = #7d7d7d, text_size = size.tiny, bgcolor = #0a0a0a)
    table.cell(meta, 1, 2, str.tostring(step, "#.##"), text_color = #ededed, text_size = size.tiny, bgcolor = #0a0a0a)`,
  },
  {
    id: "gamma-structure",
    name: "Gamma Structure",
    group: "Gamma",
    kind: "slayer",
    overlay: true,
    blurb: "The call wall, put wall, flip and supreme strike read at every bar rather than as today's snapshot.",
    source: `//@version=6
// ═══════════════════════════════════════════════════════════════════
//  GAMMA STRUCTURE — the dealer book, drawn where price has to meet it
// ═══════════════════════════════════════════════════════════════════
//  The four prices core/walls.ts defines, read AT EVERY BAR rather than
//  as today's snapshot: the walls move as the book is rewritten, and this
//  draws where they were when each candle printed.
indicator("Gamma Structure", "GAMMA", overlay = true, max_lines_count = 20, max_labels_count = 20, max_boxes_count = 4)

showZone  = input.bool(true,  "Shade the wall-to-wall zone")
showFlip  = input.bool(true,  "Gamma flip")
showKing  = input.bool(true,  "Supreme strike (heaviest anywhere)")
labOff    = input.int(6, "Label offset (bars)", minval = 0, maxval = 60)

colCall = input.color(#ef5350, "Call wall")
colPut  = input.color(#26a69a, "Put wall")
colFlip = input.color(#ffd54a, "Flip")
colKing = input.color(#ab47bc, "Supreme")

cw = slayer.callwall
pw = slayer.putwall
fl = slayer.flip
sk = slayer.supreme

f_fmt(p) => str.tostring(p, format.mintick)

var line  lCW = na
var line  lPW = na
var line  lFL = na
var line  lSK = na
var label bCW = na
var label bPW = na
var label bFL = na
var label bSK = na
var box   zone = na

f_place(ln, lb, p, col, txt, w) =>
    if na(p)
        if not na(ln)
            line.delete(ln)
            label.delete(lb)
        [line(na), label(na)]
    else
        _l = na(ln) ? line.new(bar_index - 1, p, bar_index, p, extend = extend.both, color = col, width = w) : ln
        _b = na(lb) ? label.new(bar_index + labOff, p, txt, style = label.style_none, textcolor = col, size = size.small) : lb
        line.set_y1(_l, p)
        line.set_y2(_l, p)
        line.set_x1(_l, bar_index - 1)
        line.set_x2(_l, bar_index)
        label.set_xy(_b, bar_index + labOff, p)
        label.set_text(_b, txt)
        [_l, _b]

if barstate.islast
    [a1, a2] = f_place(lCW, bCW, cw, colCall, "call wall · " + f_fmt(cw), 2)
    lCW := a1
    bCW := a2
    [b1, b2] = f_place(lPW, bPW, pw, colPut, "put wall · " + f_fmt(pw), 2)
    lPW := b1
    bPW := b2
    if showFlip
        [c1, c2] = f_place(lFL, bFL, fl, colFlip, "flip · " + f_fmt(fl), 1)
        lFL := c1
        bFL := c2
    if showKing
        [d1, d2] = f_place(lSK, bSK, sk, colKing, "supreme · " + f_fmt(sk), 1)
        lSK := d1
        bSK := d2

    // the zone between the walls — where dealers hold price when they are long gamma
    if showZone and not na(cw) and not na(pw)
        _fill = slayer.absorbing ? color.new(#26a69a, 90) : color.new(#ef5350, 92)
        if na(zone)
            zone := box.new(bar_index - 1, cw, bar_index, pw, extend = extend.both, border_color = color.new(color.black, 100), bgcolor = _fill)
        else
            box.set_lefttop(zone, bar_index - 1, cw)
            box.set_rightbottom(zone, bar_index, pw)
            box.set_bgcolor(zone, _fill)

// the axis tags: the prices themselves, no line on the pane
plot(cw, "call wall", colCall, 1, display = display.price_scale)
plot(pw, "put wall",  colPut,  1, display = display.price_scale)
plot(fl, "flip",      colFlip, 1, display = display.price_scale)
plot(sk, "supreme",   colKing, 1, display = display.price_scale)`,
  },
  {
    id: "gamma-ladder",
    name: "Gamma Ladder",
    group: "Open interest",
    kind: "slayer",
    overlay: true,
    blurb: "The heaviest strikes each side, stacked as the ladder price is trading through.",
    source: `//@version=6
// ═══════════════════════════════════════════════════════════════════
//  GAMMA LADDER — every wall that matters, not just the nearest one
// ═══════════════════════════════════════════════════════════════════
//  The call wall and the put wall are the two strikes nearest price. They
//  are not the only ones price has to get through. This draws the heaviest
//  N of each sign as a ladder, weighted by how much gamma each carries, so
//  a reader can see whether the next level up is a kerb or a wall.
indicator("Gamma Ladder", "LADDER", overlay = true, max_lines_count = 30, max_labels_count = 30, max_boxes_count = 2)

depth    = input.int(4, "Rungs each side", minval = 1, maxval = 10)
showTxt  = input.bool(true, "Write the price on each rung")
showZone = input.bool(true, "Shade the corridor between the walls")
labOff   = input.int(6, "Label offset (bars)", minval = 0, maxval = 60)

colCall = input.color(#ef5350, "Call-dominant")
colPut  = input.color(#26a69a, "Put-dominant")

var line[]  rungs = array.new_line()
var label[] tags  = array.new_label()
var box     zone  = na

f_fmt(p) => str.tostring(p, format.mintick)

// The heaviest strike of each sign sets the scale, so a rung's WIDTH says
// how it compares to the biggest thing on its own side of the book.
topCall = math.abs(nz(slayer.gex(slayer.nth_call(1)), 0))
topPut  = math.abs(nz(slayer.gex(slayer.nth_put(1)), 0))

f_rung(p, ref, col) =>
    if not na(p)
        _g = math.abs(nz(slayer.gex(p), 0))
        _w = ref <= 0 ? 1 : int(math.max(1, math.min(4, math.round(4 * _g / ref))))
        array.push(rungs, line.new(bar_index - 1, p, bar_index, p,
             extend = extend.both, color = col, width = _w,
             style = _w >= 3 ? line.style_solid : line.style_dotted))
        if showTxt
            array.push(tags, label.new(bar_index + labOff, p, f_fmt(p),
                 style = label.style_none, textcolor = col, size = size.tiny))

if barstate.islast
    // Redrawn whole on the last bar: the book is rewritten every minute and
    // a ladder half from one vintage and half from another is not a book.
    if array.size(rungs) > 0
        for i = 0 to array.size(rungs) - 1
            line.delete(array.get(rungs, i))
        array.clear(rungs)
    if array.size(tags) > 0
        for i = 0 to array.size(tags) - 1
            label.delete(array.get(tags, i))
        array.clear(tags)

    for k = 1 to depth
        f_rung(slayer.nth_call(k), topCall, colCall)
        f_rung(slayer.nth_put(k), topPut, colPut)

    _cw = slayer.callwall
    _pw = slayer.putwall
    if showZone and not na(_cw) and not na(_pw)
        _fill = slayer.absorbing ? color.new(colPut, 94) : color.new(colCall, 94)
        if na(zone)
            zone := box.new(bar_index - 1, _cw, bar_index, _pw, extend = extend.both,
                 border_color = color.new(color.black, 100), bgcolor = _fill)
        else
            box.set_lefttop(zone, bar_index - 1, _cw)
            box.set_rightbottom(zone, bar_index, _pw)
            box.set_bgcolor(zone, _fill)

plot(slayer.nth_call(1), "heaviest call", colCall, 1, display = display.price_scale)
plot(slayer.nth_put(1),  "heaviest put",  colPut,  1, display = display.price_scale)`,
  },
  {
    id: "gamma-regime",
    name: "Gamma Regime",
    group: "Gamma",
    kind: "slayer",
    overlay: true,
    blurb: "Whether dealers are amplifying the move or absorbing it, painted behind the bars.",
    source: `//@version=6
// ═══════════════════════════════════════════════════════════════════
//  GAMMA REGIME — which way the book makes the tape behave
// ═══════════════════════════════════════════════════════════════════
//  Positive net gamma = put-dominant = dealers SHORT gamma = they hedge
//  WITH the move and amplify it. Negative = call-dominant = dealers LONG
//  gamma = they hedge against it and price gets pinned.
//
//  That is a property of a STRETCH of chart, not a level on it, so it is
//  the ground behind the candles rather than a line across them.
//
//  A BACKGROUND HAS ONE JOB AND IT IS NOT TO BE SEEN. The first version of
//  this ran 60–88 transparency and shaded so hard the candles were a
//  rumour; it also re-derived its depth every bar, which strobed inside a
//  single regime. The wash is faint, and its depth is smoothed, so what
//  changes on screen is the regime rather than the rendering.
indicator("Gamma Regime", "REGIME", overlay = true, max_labels_count = 40)

showBand  = input.bool(true, "Shade the regime")
showFlips = input.bool(true, "Mark where the whole book changed sign")
strength  = input.bool(true, "Deepen the shade when the book is one-sided")
lookback  = input.int(200, "Scale the depth over this many bars", minval = 20, maxval = 2000)
holdBars  = input.int(8, "Ignore a turn that does not last this many bars", minval = 0, maxval = 200)

colAmp = input.color(#ef5350, "Amplifying (dealers short gamma)")
colAbs = input.color(#26a69a, "Absorbing (dealers long gamma)")

ng = slayer.netgex

// How one-sided this bar is against the recent range, 0..1 — smoothed, so
// the wash holds steady inside a regime instead of flickering bar to bar.
mag   = na(ng) ? na : math.abs(ng)
peak  = ta.highest(nz(mag), lookback)
raw   = na(mag) or peak <= 0 ? 0.0 : math.min(1.0, mag / peak)
force = nz(ta.sma(raw, 20), raw)

// 96 is a breath on the glass, 88 is a definite wash. Nothing below 88.
fade = strength ? int(96 - 8 * force) : 93
band = na(ng) ? na : ng > 0 ? color.new(colAmp, fade) : color.new(colAbs, fade)
bgcolor(showBand ? band : na)

// THE WHOLE BOOK changing sign — rarer and heavier than spot crossing the
// flip. A turn that reverses again two bars later is noise, so a label waits
// until the new regime has actually held.
sign    = na(ng) ? 0 : ng > 0 ? 1 : -1
turned  = sign != 0 and sign != nz(sign[1], sign)
held    = ta.barssince(turned)
settled = turned and nz(held[1], holdBars) >= holdBars

if showFlips and settled and barstate.isconfirmed
    _txt = sign == 1 ? "book → amplify" : "book → absorb"
    _col = sign == 1 ? colAmp : colAbs
    label.new(bar_index, sign == 1 ? high : low,
         _txt,
         style = sign == 1 ? label.style_label_down : label.style_label_up,
         color = color.new(_col, 25), textcolor = color.white, size = size.tiny)

plotshape(showFlips and settled and sign == 1, "book turned amplifying", shape.triangleup, location.belowbar, colAmp, size = size.tiny)
plotshape(showFlips and settled and sign == -1, "book turned absorbing",  shape.triangledown, location.abovebar, colAbs, size = size.tiny)

alertcondition(settled, title = "Net gamma changed sign", message = "The whole book changed sign on {{ticker}}")

// Net gamma is NOT a price — plotting it on this chart's axis would rescale
// the ruler into the billions and flatten every candle. It belongs in words,
// so it is the label on each turn and the depth of the shade.`,
  },
  {
    id: "book-pressure",
    name: "Book Pressure",
    group: "Gamma",
    kind: "slayer",
    overlay: true,
    blurb: "Which side of the book is heavier around price, as a pressure read rather than a level.",
    source: `//@version=6
// ═══════════════════════════════════════════════════════════════════
//  BOOK PRESSURE — which side of price the gamma is standing on
// ═══════════════════════════════════════════════════════════════════
//  The walls say where the nearest heavy strike is. They do not say which
//  way the book as a whole is leaning: two tapes can name the same call
//  wall while one has the entire book overhead and the other has it all
//  underneath, and dealers hedge those very differently.
//
//  Balance runs -1 (everything below price) to +1 (everything above).
indicator("Book Pressure", "PRESSURE", overlay = true, max_labels_count = 30)

showBand = input.bool(true, "Shade by which side is heavier")
showTbl  = input.bool(true, "Reading")
showTurn = input.bool(true, "Mark where the weight crosses price")
tilt     = input.float(0.25, "Call it lopsided past this balance", minval = 0.02, maxval = 0.9, step = 0.01)
holdBars = input.int(6, "Ignore a cross that does not last", minval = 0, maxval = 200)

colAbove = input.color(#ef5350, "Weight overhead")
colBelow = input.color(#26a69a, "Weight underneath")

up   = slayer.gex_above
dn   = slayer.gex_below
mass = na(up) or na(dn) ? na : math.abs(up) + math.abs(dn)
bal  = na(mass) or mass <= 0 ? na : (math.abs(up) - math.abs(dn)) / mass

// Faint, and deeper only as the book actually leans. Nothing below 88.
lean = na(bal) ? 0.0 : math.min(1.0, math.abs(bal) / math.max(tilt, 0.02))
fade = int(96 - 8 * lean)
band = na(bal) ? na : bal > 0 ? color.new(colAbove, fade) : color.new(colBelow, fade)
bgcolor(showBand ? band : na)

sign    = na(bal) ? 0 : bal > 0 ? 1 : -1
turned  = sign != 0 and sign != nz(sign[1], sign)
held    = ta.barssince(turned)
settled = turned and nz(held[1], holdBars) >= holdBars

if showTurn and settled and barstate.isconfirmed
    _txt = sign == 1 ? "weight → overhead" : "weight → underneath"
    _col = sign == 1 ? colAbove : colBelow
    label.new(bar_index, sign == 1 ? high : low, _txt,
         style = sign == 1 ? label.style_label_down : label.style_label_up,
         color = color.new(_col, 25), textcolor = color.white, size = size.tiny)

plotshape(showTurn and settled and sign == 1,  "weight moved overhead",   shape.triangledown, location.abovebar, colAbove, size = size.tiny)
plotshape(showTurn and settled and sign == -1, "weight moved underneath", shape.triangleup,   location.belowbar, colBelow, size = size.tiny)

alertcondition(settled, title = "Book weight crossed price", message = "The gamma weight crossed price on {{ticker}}")

f_m(v) => na(v) ? "–" : str.tostring(v / 1000000, "0.0") + "M"

var table t = na
if showTbl and barstate.islast
    t := table.new(position.bottom_left, 2, 5, border_width = 1)
    _lean = na(bal) ? "no book" : math.abs(bal) < tilt ? "balanced" : bal > 0 ? "overhead" : "underneath"
    _lc   = na(bal) ? color.gray : math.abs(bal) < tilt ? color.silver : bal > 0 ? colAbove : colBelow
    table.cell(t, 0, 0, "book weight", text_color = color.silver, text_size = size.small)
    table.cell(t, 1, 0, _lean, text_color = _lc, text_size = size.small)
    table.cell(t, 0, 1, "balance", text_color = color.silver, text_size = size.small)
    table.cell(t, 1, 1, na(bal) ? "–" : str.tostring(bal, "0.00"), text_color = _lc, text_size = size.small)
    table.cell(t, 0, 2, "above price", text_color = color.silver, text_size = size.small)
    table.cell(t, 1, 2, f_m(up), text_color = colAbove, text_size = size.small)
    table.cell(t, 0, 3, "below price", text_color = color.silver, text_size = size.small)
    table.cell(t, 1, 3, f_m(dn), text_color = colBelow, text_size = size.small)
    _pc = slayer.pc_oi
    table.cell(t, 0, 4, "put/call OI", text_color = color.silver, text_size = size.small)
    table.cell(t, 1, 4, na(_pc) ? "not recorded" : str.tostring(_pc, "0.00"), text_color = color.silver, text_size = size.small)`,
  },
  {
    id: "wall-approach",
    name: "Wall Approach",
    group: "Gamma",
    kind: "slayer",
    overlay: true,
    blurb: "How close price is to the nearer wall, and how fast it is closing on it.",
    source: `//@version=6
// ═══════════════════════════════════════════════════════════════════
//  WALL APPROACH — price arriving at gamma, measured in its own volatility
// ═══════════════════════════════════════════════════════════════════
//  A wall two dollars away means nothing until you know whether this tape
//  moves two dollars in an hour or a week. Distance is in ATR here, which
//  is the only unit that compares across symbols and sessions.
indicator("Wall Approach", "APPROACH", overlay = true, max_labels_count = 60)

atrLen  = input.int(14,  "ATR length", minval = 1)
near    = input.float(0.75, "Call it an approach inside this many ATR", minval = 0.05, step = 0.05)
showTbl = input.bool(true, "Distance table")
showArr = input.bool(true, "Mark the approach")

colCall = input.color(#ef5350, "Call wall")
colPut  = input.color(#26a69a, "Put wall")

atr = ta.atr(atrLen)
cw  = slayer.callwall
pw  = slayer.putwall

// distance in ATR, and na rather than a big number when the wall is absent
dCall = na(cw) or na(atr) or atr <= 0 ? na : (cw - close) / atr
dPut  = na(pw) or na(atr) or atr <= 0 ? na : (close - pw) / atr

atCall = not na(dCall) and dCall <= near and dCall >= 0
atPut  = not na(dPut)  and dPut  <= near and dPut  >= 0

// first bar of an approach only — a run of thirty arrows says nothing the
// first one did not
newCall = atCall and not atCall[1]
newPut  = atPut  and not atPut[1]

plotshape(showArr and newCall, "arrived at the call wall", shape.triangledown, location.abovebar, colCall, size = size.small)
plotshape(showArr and newPut,  "arrived at the put wall",  shape.triangleup,   location.belowbar, colPut,  size = size.small)

if showArr and newCall and barstate.isconfirmed
    label.new(bar_index, high, str.tostring(dCall, "0.00") + " ATR", style = label.style_none, textcolor = colCall, size = size.tiny)
if showArr and newPut and barstate.isconfirmed
    label.new(bar_index, low, str.tostring(dPut, "0.00") + " ATR", style = label.style_none, textcolor = colPut, size = size.tiny)

alertcondition(newCall, title = "Price reached the call wall", message = "{{ticker}} arrived at the call wall")
alertcondition(newPut,  title = "Price reached the put wall",  message = "{{ticker}} arrived at the put wall")

var table t = na
if showTbl and barstate.islast
    t := table.new(position.top_right, 3, 4, border_width = 1)
    table.cell(t, 0, 0, "wall",  text_color = color.silver, text_size = size.small)
    table.cell(t, 1, 0, "price", text_color = color.silver, text_size = size.small)
    table.cell(t, 2, 0, "away",  text_color = color.silver, text_size = size.small)
    table.cell(t, 0, 1, "call",  text_color = colCall, text_size = size.small)
    table.cell(t, 1, 1, na(cw) ? "none" : str.tostring(cw, format.mintick), text_color = colCall, text_size = size.small)
    table.cell(t, 2, 1, na(dCall) ? "–" : str.tostring(dCall, "0.00") + " ATR", text_color = colCall, text_size = size.small)
    table.cell(t, 0, 2, "put",   text_color = colPut, text_size = size.small)
    table.cell(t, 1, 2, na(pw) ? "none" : str.tostring(pw, format.mintick), text_color = colPut, text_size = size.small)
    table.cell(t, 2, 2, na(dPut) ? "–" : str.tostring(dPut, "0.00") + " ATR", text_color = colPut, text_size = size.small)
    _reg = na(slayer.netgex) ? "no book" : slayer.amplifying ? "amplifying" : "absorbing"
    _rc  = na(slayer.netgex) ? color.gray : slayer.amplifying ? colCall : colPut
    table.cell(t, 0, 3, "book", text_color = color.silver, text_size = size.small)
    table.cell(t, 1, 3, _reg, text_color = _rc, text_size = size.small)
    table.cell(t, 2, 3, str.tostring(slayer.strikes) + " strikes", text_color = color.silver, text_size = size.small)

plot(cw, "call wall", colCall, 1, display = display.price_scale)
plot(pw, "put wall",  colPut,  1, display = display.price_scale)`,
  },
  {
    id: "oi-build",
    name: "OI Build",
    group: "Open interest",
    kind: "slayer",
    overlay: true,
    blurb: "Open interest opening and closing across the book, bar by bar.",
    source: `//@version=6
// ═══════════════════════════════════════════════════════════════════
//  OI BUILD — positions being OPENED where price is standing
// ═══════════════════════════════════════════════════════════════════
//  A gamma level is only live while someone is still adding to it. Open
//  interest at the strike nearest price, bar over bar: a build says the
//  level is being defended now, a bleed says it is a leftover.
//
//  ΔOI reads \`na\`, never zero, where either side has no interest recorded —
//  "nobody wrote it down" is not "nothing changed".
indicator("OI Build", "OI", overlay = true, max_labels_count = 60)

//  THE THRESHOLD IS A PERCENTILE, NOT A CONTRACT COUNT. Measured on this
//  desk's own tape: "2,000 contracts" marks 3% of five-minute bars and 12%
//  of fifteen-minute ones, and something else again on another symbol — so
//  a fixed number means a different thing everywhere it is used. A rank
//  against this timeframe's own recent history means one thing everywhere.
rankPc   = input.float(95, "Mark builds in the top percentile", minval = 50, maxval = 99.5, step = 0.5)
rankLb   = input.int(200, "Ranked against this many bars", minval = 30, maxval = 2000)
minJump  = input.int(50, "...and at least this many contracts", minval = 1)
showTape = input.bool(true, "Mark the builds")
showTbl  = input.bool(true, "Strike table")

colCall = input.color(#ef5350, "Calls opening")
colPut  = input.color(#26a69a, "Puts opening")

k  = slayer.step
at = na(k) or k <= 0 ? close : math.round(close / k) * k

dC = slayer.doi_call(at)
dP = slayer.doi_put(at)

//  Clamped to what the chart actually holds. A 200-bar rank window on a
//  1-hour chart carrying 154 bars never fills, so the rank is \`na\` forever
//  and the indicator draws nothing at all — silently. This asks for no more
//  history than a third of what is there.
lb = int(math.max(30, math.min(rankLb, last_bar_index / 3)))
rC = ta.percentrank(nz(dC), lb)
rP = ta.percentrank(nz(dP), lb)
buildC = not na(dC) and dC >= minJump and not na(rC) and rC >= rankPc
buildP = not na(dP) and dP >= minJump and not na(rP) and rP >= rankPc

plotshape(showTape and buildC, "calls opening at the money", shape.square, location.abovebar, colCall, size = size.tiny)
plotshape(showTape and buildP, "puts opening at the money",  shape.square, location.belowbar, colPut,  size = size.tiny)

if showTape and buildC and barstate.isconfirmed
    label.new(bar_index, high, "+" + str.tostring(dC, "0") + "c", style = label.style_none, textcolor = colCall, size = size.tiny)
if showTape and buildP and barstate.isconfirmed
    label.new(bar_index, low, "+" + str.tostring(dP, "0") + "p", style = label.style_none, textcolor = colPut, size = size.tiny)

alertcondition(buildC, title = "Calls opening at the money", message = "Call OI building at the money on {{ticker}}")
alertcondition(buildP, title = "Puts opening at the money",  message = "Put OI building at the money on {{ticker}}")

var table t = na
if showTbl and barstate.islast
    _oc = slayer.call_oi(at)
    _op = slayer.put_oi(at)
    _g  = slayer.gex(at)
    t := table.new(position.top_left, 2, 5, border_width = 1)
    table.cell(t, 0, 0, "at the money", text_color = color.silver, text_size = size.small)
    table.cell(t, 1, 0, str.tostring(at, format.mintick), text_color = color.white, text_size = size.small)
    table.cell(t, 0, 1, "call OI", text_color = color.silver, text_size = size.small)
    table.cell(t, 1, 1, na(_oc) ? "not recorded" : str.tostring(_oc, "0"), text_color = colCall, text_size = size.small)
    table.cell(t, 0, 2, "put OI", text_color = color.silver, text_size = size.small)
    table.cell(t, 1, 2, na(_op) ? "not recorded" : str.tostring(_op, "0"), text_color = colPut, text_size = size.small)
    table.cell(t, 0, 3, "net gamma here", text_color = color.silver, text_size = size.small)
    table.cell(t, 1, 3, na(_g) ? "–" : str.tostring(_g / 1000000, "0.0") + "M", text_color = na(_g) ? color.gray : _g > 0 ? colPut : colCall, text_size = size.small)
    table.cell(t, 0, 4, "gamma ±1%", text_color = color.silver, text_size = size.small)
    _b = slayer.gex_band(1)
    table.cell(t, 1, 4, na(_b) ? "–" : str.tostring(_b / 1000000, "0.0") + "M", text_color = na(_b) ? color.gray : _b > 0 ? colPut : colCall, text_size = size.small)

// ΔOI is a contract count, not a price. It is in the table and on the marks;
// putting it on the price axis would rescale the chart out of existence.`,
  },
  {
    id: "wma",
    name: "Weighted Moving Average",
    group: "Trend",
    kind: "classic",
    overlay: true,
    blurb: "A moving average that leans on the newest bars, so it turns sooner than a plain one.",
    source: `//@version=6
indicator("Weighted Moving Average", overlay = true)
len = input.int(20, "Length", minval = 1)
src = input.source(close, "Source")
w = ta.wma(src, len)
plot(w, "WMA", color = w > nz(w[1]) ? #30D158 : #FF3B30, linewidth = 2)`,
  },
  {
    id: "vwma",
    name: "Volume Weighted MA",
    group: "Trend",
    kind: "classic",
    overlay: true,
    blurb: "An average weighted by the volume behind each bar, against the plain one — where they part, the volume was uneven.",
    source: `//@version=6
indicator("Volume Weighted Moving Average", overlay = true)
len = input.int(20, "Length", minval = 1)
showPlain = input.bool(true, "Plain SMA for contrast")
v = ta.vwma(close, len)
s = ta.sma(close, len)
plot(v, "VWMA", color = #D2FF00, linewidth = 2)
plot(showPlain ? s : na, "SMA", color = color.new(#7DE3FF, 40))
// The GAP between them is the point: where they part, the volume was not
// spread evenly across the move.
alertcondition(ta.crossover(v, s), "Volume leading up", "{{ticker}} VWMA crossed above the plain average")
alertcondition(ta.crossunder(v, s), "Volume leading down", "{{ticker}} VWMA crossed below the plain average")`,
  },
  {
    id: "dema-tema",
    name: "DEMA and TEMA",
    group: "Trend",
    kind: "classic",
    overlay: true,
    blurb: "Double and triple exponential averages, which cancel most of the lag an EMA carries.",
    source: `//@version=6
indicator("DEMA and TEMA", overlay = true)
len = input.int(21, "Length", minval = 1)
showDema = input.bool(true, "DEMA")
showTema = input.bool(true, "TEMA")
e1 = ta.ema(close, len)
e2 = ta.ema(e1, len)
e3 = ta.ema(e2, len)
dema = 2 * e1 - e2
tema = 3 * e1 - 3 * e2 + e3
plot(showDema ? dema : na, "DEMA", color = #7DE3FF, linewidth = 2)
plot(showTema ? tema : na, "TEMA", color = #D2FF00, linewidth = 2)`,
  },
  {
    id: "wema",
    name: "Wilder's Moving Average",
    group: "Trend",
    kind: "classic",
    overlay: true,
    blurb: "The smoothing every Wilder indicator is built on — slower than an EMA of the same length by half again.",
    source: `//@version=6
indicator("Wilder's Moving Average", overlay = true)
len = input.int(14, "Length", minval = 1)
// Wilder's smoothing is an EMA with alpha 1/len rather than 2/(len+1) — the
// one every one of his indicators is built on, and slower than an EMA of the
// same length by about half again.
w = ta.rma(close, len)
e = ta.ema(close, len)
plot(w, "Wilder", color = #FF9500, linewidth = 2)
plot(e, "EMA, for contrast", color = color.new(#7DE3FF, 55))`,
  },
  {
    id: "alma",
    name: "ALMA",
    group: "Trend",
    kind: "classic",
    overlay: true,
    blurb: "A gaussian-weighted average whose offset trades lag against smoothness, set by the reader.",
    source: `//@version=6
indicator("ALMA", overlay = true)
len    = input.int(21, "Length", minval = 1)
offset = input.float(0.85, "Offset", step = 0.05, minval = 0, maxval = 1)
sigma  = input.float(6, "Sigma", step = 0.5, minval = 0.1)
a = ta.alma(close, len, offset, sigma)
plot(a, "ALMA", color = a > nz(a[1]) ? #30D158 : #FF3B30, linewidth = 2)`,
  },
  {
    id: "kama",
    name: "KAMA",
    group: "Trend",
    kind: "classic",
    overlay: true,
    blurb: "Kaufman's average speeds up only when the distance travelled and the ground covered agree.",
    source: `//@version=6
indicator("KAMA", overlay = true)
len  = input.int(10, "Efficiency window", minval = 1)
fast = input.int(2,  "Fast", minval = 1)
slow = input.int(30, "Slow", minval = 2)

// Kaufman's average moves at the speed of the market: it takes the distance
// travelled against the ground covered, and speeds up only when the two agree.
change = math.abs(close - close[len])
volatility = math.sum(math.abs(ta.change(close)), len)
er = volatility == 0 ? 0 : change / volatility
fastSc = 2.0 / (fast + 1)
slowSc = 2.0 / (slow + 1)
sc = math.pow(er * (fastSc - slowSc) + slowSc, 2)
var float kama = na
kama := na(kama[1]) ? close : kama[1] + sc * (close - kama[1])
plot(kama, "KAMA", color = #D2FF00, linewidth = 2)
plot(er * 100, "efficiency", display = display.none)`,
  },
  {
    id: "zlema",
    name: "Zero Lag EMA",
    group: "Trend",
    kind: "classic",
    overlay: true,
    blurb: "An EMA with the lag cancelled by adding back the distance price has travelled since mid-window.",
    source: `//@version=6
indicator("Zero Lag EMA", overlay = true)
len = input.int(21, "Length", minval = 2)
lag = math.floor((len - 1) / 2)
// The de-lagged source: today's price plus the distance it has travelled
// since the middle of the window, which cancels most of the average's lag.
deLagged = close + (close - close[lag])
z = ta.ema(deLagged, len)
plot(z, "ZLEMA", color = z > nz(z[1]) ? #30D158 : #FF3B30, linewidth = 2)
plot(ta.ema(close, len), "plain EMA", color = color.new(#7d7d7d, 40))`,
  },
  {
    id: "mcginley",
    name: "McGinley Dynamic",
    group: "Trend",
    kind: "classic",
    overlay: true,
    blurb: "A line that adjusts its own speed to the gap between it and price, so a fast move does not run it over.",
    source: `//@version=6
indicator("McGinley Dynamic", overlay = true)
len = input.int(14, "Length", minval = 1)
// The line adjusts its own speed to the gap between it and price, so it does
// not get run over in a fast move the way a fixed-length average does.
var float md = na
md := na(md[1]) ? ta.ema(close, len) : md[1] + (close - md[1]) / math.max(1, len * math.pow(close / md[1], 4))
plot(md, "McGinley", color = #7DE3FF, linewidth = 2)`,
  },
  {
    id: "ma-ribbon",
    name: "Moving Average Ribbon",
    group: "Trend",
    kind: "classic",
    overlay: true,
    blurb: "Six averages stacked — the ribbon's width is the trend's conviction and its twist is the turn.",
    source: `//@version=6
indicator("Moving Average Ribbon", overlay = true)
kind  = input.string("EMA", "Type", options = ["EMA", "SMA", "WMA"])
step  = input.int(10, "Step", minval = 1)
first = input.int(10, "Shortest", minval = 1)

ma(int len) =>
    switch kind
        "SMA" => ta.sma(close, len)
        "WMA" => ta.wma(close, len)
        => ta.ema(close, len)

m1 = ma(first)
m2 = ma(first + step)
m3 = ma(first + step * 2)
m4 = ma(first + step * 3)
m5 = ma(first + step * 4)
m6 = ma(first + step * 5)
spread = m1 > m6
plot(m1, "1", color = color.new(spread ? #30D158 : #FF3B30, 0))
plot(m2, "2", color = color.new(spread ? #30D158 : #FF3B30, 15))
plot(m3, "3", color = color.new(spread ? #30D158 : #FF3B30, 30))
plot(m4, "4", color = color.new(spread ? #30D158 : #FF3B30, 45))
plot(m5, "5", color = color.new(spread ? #30D158 : #FF3B30, 60))
p6 = plot(m6, "6", color = color.new(spread ? #30D158 : #FF3B30, 72))
p1 = plot(m1, "", color = color.new(color.white, 100))
fill(p1, p6, color = color.new(spread ? #30D158 : #FF3B30, 90), title = "ribbon")
alertcondition(spread and not spread[1], "Ribbon turned up", "{{ticker}} moving average ribbon turned up")`,
  },
  {
    id: "price-channels",
    name: "Price Channels",
    group: "Levels",
    kind: "classic",
    overlay: true,
    blurb: "The plain N-bar high and low with the midline — the envelope breakouts are measured against.",
    source: `//@version=6
indicator("Price Channels", overlay = true)
len = input.int(20, "Length", minval = 1)
useClose = input.bool(false, "From closes only")
hi = useClose ? ta.highest(close, len) : ta.highest(high, len)
lo = useClose ? ta.lowest(close, len)  : ta.lowest(low, len)
mid = math.avg(hi, lo)
u = plot(hi, "upper", color = color.new(#FF3B30, 25), linewidth = 2)
l = plot(lo, "lower", color = color.new(#30D158, 25), linewidth = 2)
plot(mid, "middle", color = color.new(#7DE3FF, 45), style = plot.style_stepline)
fill(u, l, color = color.new(#7DE3FF, 94), title = "channel")
alertcondition(ta.crossover(close, hi[1]), "Channel broken up", "{{ticker}} broke the price channel high")
alertcondition(ta.crossunder(close, lo[1]), "Channel broken down", "{{ticker}} broke the price channel low")`,
  },
  {
    id: "awesome",
    name: "Awesome Oscillator",
    group: "Momentum",
    kind: "classic",
    overlay: false,
    blurb: "The gap between a fast and a slow median average, as a histogram, with the saucer marked.",
    source: `//@version=6
indicator("Awesome Oscillator", overlay = false, precision = 2)
fast = input.int(5, "Fast", minval = 1)
slow = input.int(34, "Slow", minval = 2)
ao = ta.sma(hl2, fast) - ta.sma(hl2, slow)
up = ao > nz(ao[1])
plot(ao, "AO", style = plot.style_columns, color = up ? color.new(#30D158, 25) : color.new(#FF3B30, 25))
hline(0, "", color = color.new(color.white, 55))
// The saucer and the zero cross, the two signals it is actually read for.
saucerUp = ao > 0 and ao[2] > ao[1] and ao > ao[1]
plotshape(saucerUp, "saucer", style = shape.circle, location = location.absolute, color = #D2FF00, size = size.tiny)
alertcondition(ta.crossover(ao, 0), "AO crossed up", "{{ticker}} awesome oscillator crossed above zero")`,
  },
  {
    id: "ultimate",
    name: "Ultimate Oscillator",
    group: "Momentum",
    kind: "classic",
    overlay: false,
    blurb: "Buying pressure over three windows at once, so a single timeframe's noise cannot carry it.",
    source: `//@version=6
indicator("Ultimate Oscillator", overlay = false, precision = 1)
l1 = input.int(7,  "Fast", minval = 1)
l2 = input.int(14, "Middle", minval = 1)
l3 = input.int(28, "Slow", minval = 1)
trueLow = math.min(low, close[1])
bp = close - trueLow
tr_ = ta.tr(true)
avg(int len) => math.sum(tr_, len) == 0 ? na : math.sum(bp, len) / math.sum(tr_, len)
uo = 100 * (4 * avg(l1) + 2 * avg(l2) + avg(l3)) / 7
plot(uo, "UO", color = #7DE3FF, linewidth = 2)
hline(70, "overbought", color = color.new(#FF3B30, 55))
hline(50, "", color = color.new(color.white, 75), linestyle = hline.style_dotted)
hline(30, "oversold", color = color.new(#30D158, 55))`,
  },
  {
    id: "ppo",
    name: "Percentage Price Oscillator",
    group: "Momentum",
    kind: "classic",
    overlay: false,
    blurb: "MACD expressed in percent, which is what makes it comparable between a $20 stock and a $600 one.",
    source: `//@version=6
indicator("Percentage Price Oscillator", overlay = false, precision = 2)
fast = input.int(12, "Fast", minval = 1)
slow = input.int(26, "Slow", minval = 2)
sig  = input.int(9,  "Signal", minval = 1)
// MACD in PERCENT, which is what makes it comparable between instruments —
// a two-point spread means something different on a $20 stock and a $600 one.
slowEma = ta.ema(close, slow)
ppo = slowEma == 0 ? na : (ta.ema(close, fast) - slowEma) / slowEma * 100
signal = ta.ema(ppo, sig)
plot(ppo - signal, "histogram", style = plot.style_columns, color = ppo >= signal ? color.new(#30D158, 45) : color.new(#FF3B30, 45))
plot(ppo, "PPO", color = #7DE3FF, linewidth = 2)
plot(signal, "signal", color = color.new(#FF9500, 20))
hline(0, "", color = color.new(color.white, 60))`,
  },
  {
    id: "tsi",
    name: "True Strength Index",
    group: "Momentum",
    kind: "classic",
    overlay: false,
    blurb: "Doubly-smoothed momentum with its signal — slow to fire and slow to lie.",
    source: `//@version=6
indicator("True Strength Index", overlay = false, precision = 2)
longLen  = input.int(25, "Long", minval = 1)
shortLen = input.int(13, "Short", minval = 1)
sigLen   = input.int(13, "Signal", minval = 1)
t = ta.tsi(close, shortLen, longLen) * 100
sig = ta.ema(t, sigLen)
plot(t - sig, "histogram", style = plot.style_columns, color = t >= sig ? color.new(#30D158, 45) : color.new(#FF3B30, 45))
plot(t, "TSI", color = #7DE3FF, linewidth = 2)
plot(sig, "signal", color = color.new(#FF9500, 25))
hline(0, "", color = color.new(color.white, 60))
hline(25, "", color = color.new(#FF3B30, 75), linestyle = hline.style_dotted)
hline(-25, "", color = color.new(#30D158, 75), linestyle = hline.style_dotted)`,
  },
  {
    id: "cmo",
    name: "Chande Momentum Oscillator",
    group: "Momentum",
    kind: "classic",
    overlay: false,
    blurb: "Up moves against down moves over the window, unsmoothed — sharper than RSI and noisier.",
    source: `//@version=6
indicator("Chande Momentum Oscillator", overlay = false, precision = 1)
len = input.int(9, "Length", minval = 1)
c = ta.cmo(close, len)
plot(c, "CMO", style = plot.style_area, color = c >= 0 ? color.new(#30D158, 55) : color.new(#FF3B30, 55))
plot(c, "", color = color.new(color.white, 30))
hline(50, "overbought", color = color.new(#FF3B30, 55))
hline(0, "", color = color.new(color.white, 60))
hline(-50, "oversold", color = color.new(#30D158, 55))`,
  },
  {
    id: "rvi",
    name: "Relative Vigor Index",
    group: "Momentum",
    kind: "classic",
    overlay: false,
    blurb: "Where the close sits against the open, smoothed — conviction rather than direction.",
    source: `//@version=6
indicator("Relative Vigor Index", overlay = false, precision = 3)
len = input.int(10, "Length", minval = 1)
// Where the close sits inside the bar, smoothed — the idea being that in an
// uptrend a market closes above where it opened, and in a downtrend below.
num = ta.swma(close - open)
den = ta.swma(high - low)
rvi = math.sum(den, len) == 0 ? na : math.sum(num, len) / math.sum(den, len)
sig = ta.swma(rvi)
plot(rvi, "RVI", color = #7DE3FF, linewidth = 2)
plot(sig, "signal", color = color.new(#FF9500, 20))
hline(0, "", color = color.new(color.white, 60))
alertcondition(ta.crossover(rvi, sig), "Vigor turned up", "{{ticker}} relative vigor crossed above its signal")`,
  },
  {
    id: "fisher",
    name: "Fisher Transform",
    group: "Momentum",
    kind: "classic",
    overlay: false,
    blurb: "A transform that makes turns sharp instead of rounded, which is the only reason to use it.",
    source: `//@version=6
indicator("Fisher Transform", overlay = false, precision = 3)
len = input.int(9, "Length", minval = 1)
// The transform pushes a bounded series towards a normal distribution, which
// makes its turns sharp rather than rounded — the point of using it at all.
hi = ta.highest(hl2, len)
lo = ta.lowest(hl2, len)
var float val = 0.0
raw = hi == lo ? 0 : 0.66 * ((hl2 - lo) / (hi - lo) - 0.5) + 0.67 * nz(val[1])
val := math.max(math.min(raw, 0.999), -0.999)
var float fish = 0.0
fish := 0.5 * math.log((1 + val) / (1 - val)) + 0.5 * nz(fish[1])
plot(fish, "Fisher", color = #7DE3FF, linewidth = 2)
plot(nz(fish[1]), "trigger", color = color.new(#FF9500, 25))
hline(0, "", color = color.new(color.white, 60))
alertcondition(ta.cross(fish, nz(fish[1])), "Fisher turned", "{{ticker}} Fisher transform crossed its trigger")`,
  },
  {
    id: "elder-ray",
    name: "Elder Ray",
    group: "Momentum",
    kind: "classic",
    overlay: false,
    blurb: "Bull and bear power around an EMA, with the classic read marked: sellers fading in an uptrend.",
    source: `//@version=6
indicator("Elder Ray", overlay = false, precision = 2)
len = input.int(13, "EMA Length", minval = 1)
base = ta.ema(close, len)
bull = high - base
bear = low - base
plot(bull, "bull power", style = plot.style_columns, color = color.new(#30D158, 35))
plot(bear, "bear power", style = plot.style_columns, color = color.new(#FF3B30, 35))
hline(0, "", color = color.new(color.white, 55))
// The classic read: buy when bear power is negative but RISING while the
// trend is up — the sellers are losing their grip rather than being absent.
up = base > base[1]
plotshape(up and bear < 0 and bear > bear[1], "sellers fading", style = shape.triangleup, location = location.bottom, color = #30D158, size = size.tiny)
plotshape(not up and bull > 0 and bull < bull[1], "buyers fading", style = shape.triangledown, location = location.top, color = #FF3B30, size = size.tiny)`,
  },
  {
    id: "momentum",
    name: "Momentum",
    group: "Momentum",
    kind: "classic",
    overlay: false,
    blurb: "The plainest one there is — this close against the close N bars ago, with a signal.",
    source: `//@version=6
indicator("Momentum", overlay = false, precision = 2)
len = input.int(10, "Length", minval = 1)
sig = input.int(9, "Signal", minval = 1)
m = ta.mom(close, len)
s = ta.sma(m, sig)
plot(m, "momentum", style = plot.style_area, color = m >= 0 ? color.new(#30D158, 60) : color.new(#FF3B30, 60))
plot(m, "", color = color.new(color.white, 25), linewidth = 1)
plot(s, "signal", color = color.new(#FF9500, 25))
hline(0, "", color = color.new(color.white, 55))`,
  },
  {
    id: "coppock",
    name: "Coppock Curve",
    group: "Momentum",
    kind: "classic",
    overlay: false,
    blurb: "A long-cycle bottom finder: the turn up out of negative territory is the signal, and only that.",
    source: `//@version=6
indicator("Coppock Curve", overlay = false, precision = 2)
roc1 = input.int(14, "Long ROC", minval = 1)
roc2 = input.int(11, "Short ROC", minval = 1)
wma  = input.int(10, "Smoothing", minval = 1)
// Built for monthly charts and a once-a-cycle signal: the turn UP out of
// negative territory. On an intraday tape it is noise, and that is worth
// knowing before it is read as one.
c = ta.wma(ta.roc(close, roc1) + ta.roc(close, roc2), wma)
plot(c, "Coppock", style = plot.style_area, color = c >= 0 ? color.new(#30D158, 55) : color.new(#FF3B30, 55))
plot(c, "", color = color.new(color.white, 30))
hline(0, "", color = color.new(color.white, 55))
plotshape(c < 0 and c > c[1] and c[1] <= c[2], "turned up below zero", style = shape.triangleup, location = location.bottom, color = #D2FF00, size = size.tiny)`,
  },
  {
    id: "volume-delta",
    name: "Volume Delta and CVD",
    group: "Volume",
    kind: "classic",
    overlay: false,
    blurb: "Volume split by where each bar closed in its range, cumulated — an approximation, and it says so.",
    source: `//@version=6
indicator("Volume Delta", overlay = false, precision = 0)
cumulative = input.bool(true, "Cumulate it (CVD)")

// HOW THIS IS MEASURED, because it matters. A true delta needs every trade
// classified against the bid and the ask; on OHLCV bars that is not
// available, so each bar's volume is split by WHERE THE CLOSE SAT inside its
// own range — a bar closing on its high counts fully to the buyers, one
// closing mid-range counts to neither. It is the standard approximation and
// it is an approximation: read the SHAPE, not the number.
rng = high - low
lean = rng == 0 ? 0 : ((close - low) - (high - close)) / rng
delta = volume * lean
var float cvd = 0.0
cvd := cvd + delta
shown = cumulative ? cvd : delta
plot(shown, "delta", style = cumulative ? plot.style_line : plot.style_columns,
     color = cumulative ? #7DE3FF : (delta >= 0 ? color.new(#30D158, 30) : color.new(#FF3B30, 30)),
     linewidth = cumulative ? 2 : 1)
hline(0, "", color = color.new(color.white, 55))`,
  },
  {
    id: "volume-oscillator",
    name: "Volume Oscillator",
    group: "Volume",
    kind: "classic",
    overlay: false,
    blurb: "Fast against slow volume as a percentage — whether participation is rising or falling away.",
    source: `//@version=6
indicator("Volume Oscillator", overlay = false, precision = 1)
fast = input.int(5, "Fast", minval = 1)
slow = input.int(20, "Slow", minval = 2)
f = ta.sma(volume, fast)
s = ta.sma(volume, slow)
osc = s == 0 ? na : (f - s) / s * 100
plot(osc, "% above normal", style = plot.style_columns, color = osc >= 0 ? color.new(#D2FF00, 35) : color.new(#7d7d7d, 45))
hline(0, "", color = color.new(color.white, 55))`,
  },
  {
    id: "volume-roc",
    name: "Volume Rate of Change",
    group: "Volume",
    kind: "classic",
    overlay: false,
    blurb: "How fast volume itself is changing, with the doubling line marked.",
    source: `//@version=6
indicator("Volume Rate of Change", overlay = false, precision = 1)
len = input.int(14, "Length", minval = 1)
v = ta.roc(volume, len)
plot(v, "volume ROC %", style = plot.style_columns, color = v >= 0 ? color.new(#30D158, 40) : color.new(#FF3B30, 40))
hline(0, "", color = color.new(color.white, 55))
hline(100, "double", color = color.new(#D2FF00, 65), linestyle = hline.style_dashed)`,
  },
  {
    id: "pvt",
    name: "Price Volume Trend",
    group: "Volume",
    kind: "classic",
    overlay: false,
    blurb: "OBV's correction: volume weighted by the percentage move rather than counted flat.",
    source: `//@version=6
indicator("Price Volume Trend", overlay = false, precision = 0)
sigLen = input.int(21, "Signal", minval = 2)
// OBV weights every bar's volume the same however far price moved; PVT
// weights it by the PERCENTAGE move, which is the correction it exists for.
var float pvt = 0.0
pvt := pvt + (nz(close[1]) == 0 ? 0 : volume * (close - close[1]) / close[1])
plot(pvt, "PVT", color = #7DE3FF, linewidth = 2)
plot(ta.ema(pvt, sigLen), "signal", color = color.new(#FF9500, 30))`,
  },
  {
    id: "eom",
    name: "Ease of Movement",
    group: "Volume",
    kind: "classic",
    overlay: false,
    blurb: "How far price travelled per unit of volume — a big move on thin volume reads high.",
    source: `//@version=6
indicator("Ease of Movement", overlay = false, precision = 2)
len   = input.int(14, "Smoothing", minval = 1)
scale = input.float(1000000, "Volume scale", step = 100000)
// How far price moved per unit of volume — a big move on thin volume reads
// high, which is the whole idea: the market moved easily.
dist = hl2 - nz(hl2[1])
boxRatio = (high - low) == 0 or volume == 0 ? na : (volume / scale) / (high - low)
raw = na(boxRatio) or boxRatio == 0 ? 0 : dist / boxRatio
e = ta.sma(raw, len)
plot(e, "EOM", style = plot.style_area, color = e >= 0 ? color.new(#30D158, 55) : color.new(#FF3B30, 55))
plot(e, "", color = color.new(color.white, 30))
hline(0, "", color = color.new(color.white, 55))`,
  },
  {
    id: "nvi-pvi",
    name: "Negative and Positive Volume Index",
    group: "Volume",
    kind: "classic",
    overlay: false,
    blurb: "Two lines that each move on half the bars: the quiet days against the loud ones.",
    source: `//@version=6
indicator("Negative and Positive Volume Index", overlay = false, precision = 1)
showNvi = input.bool(true, "NVI — the quiet days")
showPvi = input.bool(true, "PVI — the loud ones")
// Two lines that only move on half the bars each. The old claim is that the
// smart money trades on quiet days, so NVI is the one to watch; both are here
// because the pair diverging is the read, not either alone.
var float nvi = 1000.0
var float pvi = 1000.0
chg = nz(close[1]) == 0 ? 0 : (close - close[1]) / close[1]
nvi := volume < nz(volume[1]) ? nvi * (1 + chg) : nvi
pvi := volume > nz(volume[1]) ? pvi * (1 + chg) : pvi
plot(showNvi ? nvi : na, "NVI", color = #7DE3FF, linewidth = 2)
plot(showPvi ? pvi : na, "PVI", color = color.new(#FF9500, 20), linewidth = 1)`,
  },
  {
    id: "market-facilitation",
    name: "Market Facilitation Index",
    group: "Volume",
    kind: "classic",
    overlay: true,
    blurb: "Bill Williams' four states, painted straight onto the bars — range per unit of volume, and volume itself.",
    source: `//@version=6
indicator("Market Facilitation Index", overlay = true)
scale = input.float(1000000, "Volume scale", step = 100000)
// Bill Williams' four states, from whether the RANGE per unit of volume and
// the volume itself went up or down. The bar colour IS the indicator.
mfi = volume == 0 ? na : (high - low) / (volume / scale)
mUp = mfi > nz(mfi[1])
vUp = volume > nz(volume[1])
ink = mUp and vUp ? #30D158 : not mUp and not vUp ? #7d7d7d : mUp and not vUp ? #7DE3FF : #FF9500
barcolor(ink)
plot(mfi, "MFI", display = display.none)`,
  },
  {
    id: "standard-deviation",
    name: "Standard Deviation",
    group: "Volatility",
    kind: "classic",
    overlay: false,
    blurb: "Dispersion of the closes, as a percentage of price, against its own recent range.",
    source: `//@version=6
indicator("Standard Deviation", overlay = false, precision = 3)
len = input.int(20, "Length", minval = 2)
asPct = input.bool(true, "As a percent of price")
sd = ta.stdev(close, len)
shown = asPct ? (close == 0 ? na : sd / close * 100) : sd
band = ta.percentile_linear_interpolation(shown, 120, 80)
plot(shown, "σ", color = not na(band) and shown >= band ? #FF9500 : #7DE3FF, linewidth = 2)
plot(band, "80th percentile", color = color.new(#FF9500, 60), style = plot.style_stepline)`,
  },
  {
    id: "historical-vol",
    name: "Historical Volatility",
    group: "Volatility",
    kind: "classic",
    overlay: false,
    blurb: "Annualised close-to-close volatility, in the units an option is quoted in.",
    source: `//@version=6
indicator("Historical Volatility", overlay = false, precision = 1)
len  = input.int(20, "Length", minval = 2)
year = input.int(252, "Periods a year", minval = 1)
// Annualised close-to-close volatility, in the same units an option is
// quoted in — so it can be read against the implied the desk reports.
r = nz(close[1]) == 0 ? 0 : math.log(close / close[1])
hv = ta.stdev(r, len) * math.sqrt(year) * 100
plot(hv, "HV %", color = #7DE3FF, linewidth = 2)
plot(ta.percentile_linear_interpolation(hv, 200, 50), "median", color = color.new(#7d7d7d, 45), style = plot.style_stepline)
bgcolor(hv > ta.percentile_linear_interpolation(hv, 200, 90) ? color.new(#FF9500, 88) : na)`,
  },
  {
    id: "chaikin-volatility",
    name: "Chaikin Volatility",
    group: "Volatility",
    kind: "classic",
    overlay: false,
    blurb: "The rate of change of the SPREAD — it rises into tops and falls into bottoms.",
    source: `//@version=6
indicator("Chaikin Volatility", overlay = false, precision = 1)
emaLen = input.int(10, "Range smoothing", minval = 1)
rocLen = input.int(10, "Rate of change", minval = 1)
// The rate of change of the SPREAD, not of price. It rises into tops (panic
// widens the bars) and falls into bottoms, which is the opposite of the way
// most volatility measures are read.
sp = ta.ema(high - low, emaLen)
cv = ta.roc(sp, rocLen)
plot(cv, "Chaikin volatility %", style = plot.style_columns, color = cv >= 0 ? color.new(#FF9500, 35) : color.new(#7DE3FF, 45))
hline(0, "", color = color.new(color.white, 55))`,
  },
  {
    id: "fib-extension",
    name: "Fibonacci Extension",
    group: "Levels",
    kind: "classic",
    overlay: true,
    blurb: "Projections beyond the swing rather than inside it — targets, not support.",
    source: `//@version=6
indicator("Fibonacci Extension", overlay = true, max_lines_count = 20, max_labels_count = 20)
len = input.int(60, "Swing lookback", minval = 10)
ext = input.int(40, "Extend (bars)", minval = 5)
hi = ta.highest(high, len)
lo = ta.lowest(low, len)
up = ta.barssince(high == hi) > ta.barssince(low == lo)
span = hi - lo
// Extensions project BEYOND the swing, which is what separates them from a
// retracement — they are targets, not support.
level(float r) => up ? lo - span * (r - 1) : hi + span * (r - 1)
var array<line> legs = array.new<line>()
var array<label> tags = array.new<label>()
if barstate.islast
    while array.size(legs) > 0
        line.delete(array.pop(legs))
    while array.size(tags) > 0
        label.delete(array.pop(tags))
    ratios = array.from(1.0, 1.272, 1.414, 1.618, 2.0, 2.618)
    for i = 0 to array.size(ratios) - 1
        r = array.get(ratios, i)
        y = level(r)
        strong = r == 1.618
        array.push(legs, line.new(bar_index - 10, y, bar_index + ext, y, color = strong ? color.new(#D2FF00, 10) : color.new(#FF9500, 50), width = strong ? 2 : 1, style = strong ? line.style_solid : line.style_dotted))
        array.push(tags, label.new(bar_index + ext, y, str.tostring(r, "#.###") + "  " + str.tostring(y, "#.##"), style = label.style_label_left, color = color.new(#0a0a0a, 15), textcolor = strong ? #D2FF00 : #FF9500, size = size.tiny))`,
  },
  {
    id: "chaikin-oscillator",
    name: "Chaikin Oscillator",
    group: "Volume",
    kind: "classic",
    overlay: false,
    blurb: "The momentum of accumulation: a fast and slow average of the A/D line.",
    source: `//@version=6
indicator("Chaikin Oscillator", overlay = false, precision = 0)
fast = input.int(3, "Fast", minval = 1)
slow = input.int(10, "Slow", minval = 2)
rng = high - low
mfm = rng == 0 ? 0 : ((close - low) - (high - close)) / rng
var float ad = 0.0
ad := ad + mfm * volume
osc = ta.ema(ad, fast) - ta.ema(ad, slow)
plot(osc, "Chaikin", style = plot.style_columns, color = osc >= 0 ? color.new(#30D158, 35) : color.new(#FF3B30, 35))
hline(0, "", color = color.new(color.white, 55))
alertcondition(ta.crossover(osc, 0), "Accumulation", "{{ticker}} Chaikin oscillator crossed above zero")`,
  },
  {
    id: "aroon-oscillator",
    name: "Aroon Oscillator",
    group: "Momentum",
    kind: "classic",
    overlay: false,
    blurb: "Aroon up minus down in one line — how recently the high was made against the low.",
    source: `//@version=6
indicator("Aroon Oscillator", overlay = false, precision = 0)
len = input.int(25, "Length", minval = 1)
upA = 100 * (len - ta.barssince(high == ta.highest(high, len + 1))) / len
dnA = 100 * (len - ta.barssince(low == ta.lowest(low, len + 1))) / len
osc = upA - dnA
plot(osc, "Aroon oscillator", style = plot.style_area, color = osc >= 0 ? color.new(#30D158, 55) : color.new(#FF3B30, 55))
plot(osc, "", color = color.new(color.white, 30))
hline(0, "", color = color.new(color.white, 55))
hline(50, "trending up", color = color.new(#30D158, 70), linestyle = hline.style_dotted)
hline(-50, "trending down", color = color.new(#FF3B30, 70), linestyle = hline.style_dotted)`,
  },
  {
    id: "atr-bands",
    name: "ATR Bands",
    group: "Volatility",
    kind: "classic",
    overlay: true,
    blurb: "A basis with ATR shoulders, which is the channel a volatility stop is managed inside.",
    source: `//@version=6
indicator("ATR Bands", overlay = true)
len  = input.int(14, "ATR Length", minval = 1)
mult = input.float(2.0, "Multiplier", step = 0.25)
basis = input.string("EMA 20", "Basis", options = ["EMA 20", "SMA 20", "Close"])
mid = basis == "SMA 20" ? ta.sma(close, 20) : basis == "Close" ? close : ta.ema(close, 20)
band = ta.atr(len) * mult
u = plot(mid + band, "upper", color = color.new(#FF3B30, 35))
l = plot(mid - band, "lower", color = color.new(#30D158, 35))
plot(mid, "basis", color = color.new(#7DE3FF, 30), linewidth = 2)
fill(u, l, color = color.new(#7DE3FF, 94), title = "band")
alertcondition(close > mid + band, "Above the band", "{{ticker}} closed above its ATR band")
alertcondition(close < mid - band, "Below the band", "{{ticker}} closed below its ATR band")`,
  },
  {
    id: "fractals",
    name: "Fractals",
    group: "Structure",
    kind: "classic",
    overlay: true,
    blurb: "Williams fractals with the last of each held as a level, because that is what price returns to.",
    source: `//@version=6
indicator("Fractals", overlay = true, max_labels_count = 100)
wing = input.int(2, "Bars each side", minval = 1, maxval = 6)
showLevels = input.bool(true, "Hold the last one as a level")
up = ta.pivothigh(high, wing, wing)
dn = ta.pivotlow(low, wing, wing)
plotshape(not na(up), "up fractal", style = shape.triangledown, location = location.abovebar, color = color.new(#FF3B30, 20), size = size.tiny, offset = -wing)
plotshape(not na(dn), "down fractal", style = shape.triangleup, location = location.belowbar, color = color.new(#30D158, 20), size = size.tiny, offset = -wing)
var float lastUp = na
var float lastDn = na
lastUp := na(up) ? lastUp : up
lastDn := na(dn) ? lastDn : dn
plot(showLevels ? lastUp : na, "last up", color = color.new(#FF3B30, 55), style = plot.style_stepline)
plot(showLevels ? lastDn : na, "last down", color = color.new(#30D158, 55), style = plot.style_stepline)
alertcondition(not na(lastUp) and ta.crossover(close, lastUp), "Took the last fractal high", "{{ticker}} closed above the last fractal high")`,
  },
  {
    id: "vw-macd",
    name: "Volume Weighted MACD",
    group: "Momentum",
    kind: "classic",
    overlay: false,
    blurb: "MACD built on volume-weighted averages, so a move nobody traded moves it less.",
    source: `//@version=6
indicator("Volume Weighted MACD", overlay = false, precision = 3)
fast = input.int(12, "Fast", minval = 1)
slow = input.int(26, "Slow", minval = 2)
sig  = input.int(9,  "Signal", minval = 1)
// The same construction as MACD with VOLUME-WEIGHTED averages underneath, so
// a move nobody traded moves it less than one everybody did.
line_ = ta.vwma(close, fast) - ta.vwma(close, slow)
signal = ta.ema(line_, sig)
histo = line_ - signal
plot(histo, "histogram", style = plot.style_columns, color = histo >= 0 ? color.new(#30D158, 40) : color.new(#FF3B30, 40))
plot(line_, "VW MACD", color = #7DE3FF, linewidth = 2)
plot(signal, "signal", color = color.new(#FF9500, 20))
hline(0, "", color = color.new(color.white, 60))`,
  },
  {
    id: "connors-rsi",
    name: "Connors RSI",
    group: "Momentum",
    kind: "classic",
    overlay: false,
    blurb: "Momentum, streak length and how unusual today's move is, averaged into one mean-reversion read.",
    source: `//@version=6
indicator("Connors RSI", overlay = false, precision = 1)
rsiLen    = input.int(3,   "RSI of price", minval = 1)
streakLen = input.int(2,   "RSI of the streak", minval = 1)
rankLen   = input.int(100, "Percent-rank window", minval = 2)
// Three things averaged: momentum, how long the current run of up or down
// closes has lasted, and how unusual today's move is against its own history.
var int streak = 0
streak := close > close[1] ? (nz(streak[1]) > 0 ? streak[1] + 1 : 1)
        : close < close[1] ? (nz(streak[1]) < 0 ? streak[1] - 1 : -1)
        : 0
ret = nz(close[1]) == 0 ? 0 : (close - close[1]) / close[1] * 100
crsi = (ta.rsi(close, rsiLen) + ta.rsi(streak, streakLen) + ta.percentrank(ret, rankLen)) / 3
plot(crsi, "Connors RSI", color = #7DE3FF, linewidth = 2)
hline(90, "stretched", color = color.new(#FF3B30, 55))
hline(50, "", color = color.new(color.white, 75), linestyle = hline.style_dotted)
hline(10, "washed out", color = color.new(#30D158, 55))
bgcolor(crsi > 90 ? color.new(#FF3B30, 90) : crsi < 10 ? color.new(#30D158, 90) : na)`,
  },
  {
    id: "ulcer-index",
    name: "Ulcer Index",
    group: "Volatility",
    kind: "classic",
    overlay: false,
    blurb: "Risk as DRAWDOWN rather than wobble — it only counts the moves that hurt.",
    source: `//@version=6
indicator("Ulcer Index", overlay = false, precision = 2)
len = input.int(14, "Length", minval = 2)
// Risk measured as DRAWDOWN rather than as wobble: it only counts the moves
// that hurt, which is the objection to using standard deviation for it.
peak = ta.highest(close, len)
dd = peak == 0 ? 0 : (close - peak) / peak * 100
ui = math.sqrt(math.sum(dd * dd, len) / len)
plot(ui, "Ulcer", style = plot.style_area, color = color.new(#FF9500, 55))
plot(ui, "", color = color.new(#FF9500, 10), linewidth = 1)
plot(ta.percentile_linear_interpolation(ui, 200, 80), "80th percentile", color = color.new(#7d7d7d, 45), style = plot.style_stepline)`,
  },
  {
    id: "choppiness",
    name: "Choppiness Index",
    group: "Volatility",
    kind: "classic",
    overlay: false,
    blurb: "Whether the market covered ground or the same ground twice. It says nothing about direction.",
    source: `//@version=6
indicator("Choppiness Index", overlay = false, precision = 1)
len = input.int(14, "Length", minval = 2)
// 100 means the market covered the same ground over and over; 0 means it went
// somewhere. It says NOTHING about direction, which is the mistake people
// make with it — it is a filter for whether a trend tool should be trusted.
span = ta.highest(high, len) - ta.lowest(low, len)
ci = span <= 0 ? na : 100 * math.log10(math.sum(ta.tr(true), len) / span) / math.log10(len)
choppy = ci > 61.8
plot(ci, "choppiness", color = choppy ? #FF9500 : #30D158, linewidth = 2)
hline(61.8, "chop above", color = color.new(#FF9500, 55), linestyle = hline.style_dashed)
hline(38.2, "trend below", color = color.new(#30D158, 55), linestyle = hline.style_dashed)
bgcolor(choppy ? color.new(#FF9500, 90) : na)
alertcondition(ta.crossunder(ci, 38.2), "Trend starting", "{{ticker}} left the chop — a trend tool is worth reading again")`,
  },
  {
    id: "put-call",
    name: "Put/Call Ratio",
    group: "Open interest",
    kind: "slayer",
    overlay: false,
    blurb: "The book's own put/call ratio at every bar, off open interest rather than a headline number once a day.",
    source: `//@version=6
indicator("Put/Call Ratio", overlay = false, precision = 2)
smooth = input.int(5, "Smoothing", minval = 1)
hot    = input.float(1.2, "Fearful above", step = 0.05)
cold   = input.float(0.7, "Complacent below", step = 0.05)
// The book's own put/call ratio at every bar, read off open interest rather
// than off a headline number once a day — which is the whole difference.
pc = ta.ema(slayer.pc_oi, smooth)
ink = na(pc) ? color.gray : pc >= hot ? color.new(#30D158, 15) : pc <= cold ? color.new(#FF3B30, 15) : color.new(#7DE3FF, 30)
plot(pc, "put/call OI", color = ink, linewidth = 2)
hline(1, "even", color = color.new(color.white, 50))
hline(hot, "fearful", color = color.new(#30D158, 60), linestyle = hline.style_dashed)
hline(cold, "complacent", color = color.new(#FF3B30, 60), linestyle = hline.style_dashed)
bgcolor(not na(pc) and (pc >= hot or pc <= cold) ? color.new(pc >= hot ? #30D158 : #FF3B30, 90) : na)
alertcondition(ta.crossover(pc, hot), "Book turned fearful", "{{ticker}} put/call open interest crossed into fear")`,
  },
];

const IDS = new Set(LIBRARY.map(s => s.id));

/** Is this id one of the shipped fifty? */
export const isLibraryId = (id: string): boolean => IDS.has(id);

/** The shelves, in the order the picker shows them. */
export const LIBRARY_GROUPS: readonly string[] = [
  ...new Set(LIBRARY.filter(s => s.kind === 'slayer').map(s => s.group)),
  ...new Set(LIBRARY.filter(s => s.kind === 'classic').map(s => s.group)),
];
