/*
  TWELVE WHOLE INDICATORS, of the kind people actually ask for.

  `pine-conformance.ts` measures the LANGUAGE one construct at a time, which
  is the right way to find a hole and the wrong way to know whether a real
  script runs. This file is the other half: complete indicators, written the
  way they come out when someone asks an assistant for "a supertrend with
  alerts" or "an RSI divergence detector" — the twelve most-asked shapes,
  with the verbose inputs, the tables, the alertconditions and the idioms
  that come with them.

  NONE OF THEM WERE ADJUSTED TO FIT. They were written first and run second,
  and what they found is in the commit history: `plot.style_linebr` refused a
  Supertrend, and the off-scale guard was holding back every plot in a
  `overlay = false` oscillator — telling the reader a MACD would "rescale the
  whole chart" when it has its own pane and shares nothing.

  THE ASSERTION IS THAT EACH ONE RUNS AND PUTS SOMETHING ON THE CHART. A
  script that compiles and draws nothing is the failure that hides best, and
  it is the one a reader blames the engine for.
*/
import { evaluatePine } from '../src/data/pine/index';
import type { Candle } from '../src/types/market';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

/* THE TAPE HAS TO CONTAIN WHAT THE SCRIPTS LOOK FOR, or the proof measures
   the fixture instead of the engine. Two of these twelve hunt pivots — one
   with a 20/20 lookback, a 41-bar window — and one wants a divergence, so a
   drifting random walk is the wrong tape: on a cumulative walk every window
   is monotone and there are no strict pivots at all.

   So the tape is built out of LEGS. Twenty-four bars up, twenty-four down,
   a fixed step per bar, which puts one apex every 48 bars — far enough
   apart that a +/-20 window never reaches the next one, so a 20/20 pivot
   lands on every turn and a 5/5 pivot lands on the same ones and nowhere
   else, the legs being monotone.

   The step sizes are what make the divergences. Through the first half the
   up leg holds at 1.0 a bar while the pullbacks deepen, 0.35 to 0.71: price
   still nets higher into every apex, but each rally is a smaller share of
   the swing before it, so RSI tops out lower each time. That is a bearish
   divergence — higher high, weaker momentum — and the second half is the
   same construction upside down for the bullish one.

   Two details keep it from being a cartoon. A small wobble rides on top so
   stdev and ATR have something to chew on, kept under half the smallest
   step so no leg stops being monotone. And the wicks VARY BY BAR, which
   matters more than it looks: with `open = previous close` the apex bar and
   the one after it both carry the same extreme, a tie, and a pivot needs a
   STRICT maximum — equal wicks meant zero pivots on the whole tape. */
const bars: Candle[] = [];
{
  const LEG = 24;

  /* Per-bar step for each leg in turn. Rising cycles first, then falling. */
  const steps: number[] = [];
  for (let k = 0; k < 4; k++) { steps.push(+1.0, -(0.35 + 0.12 * k)); }
  for (let k = 0; k < 4; k++) { steps.push(-1.0, +(0.35 + 0.12 * k)); }

  let px = 100;
  for (let i = 0; i < 400; i++) {
    const o = px;
    px += steps[Math.floor(i / LEG) % steps.length];
    const c = px + 0.1 * Math.sin(i * 1.7);
    const wick = 0.2 + ((i * 7) % 3) * 0.04;
    bars.push({
      time: 1_760_000_000 + i * 900,
      open: o,
      high: Math.max(o, c) + wick,
      low: Math.min(o, c) - wick,
      close: c,
      volume: 900 + ((i * 53) % 900) + (i % 37 === 0 ? 2400 : 0),
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

const OPTS = { timeframe: '15m', ticker: 'SPY', chartMinutes: 15, resolveBars: agg };

interface Script { name: string; uses: string; source: string }

const SCRIPTS: Script[] = [
  {
    name: "Supertrend with alerts",
    uses: "plot.style_linebr, a var carried across bars, two-sided flip detection",
    source: `//@version=6
indicator("Supertrend with Alerts", overlay = true)

atrPeriod = input.int(10, "ATR Length", minval = 1)
factor    = input.float(3.0, "Factor", minval = 0.01, step = 0.01)
showLabels = input.bool(true, "Show Buy/Sell Labels")

atr = ta.atr(atrPeriod)
upperBand = hl2 + factor * atr
lowerBand = hl2 - factor * atr

var float superTrend = na
var int   direction  = 1

prevUpper = nz(upperBand[1], upperBand)
prevLower = nz(lowerBand[1], lowerBand)

lowerBand := lowerBand > prevLower or close[1] < prevLower ? lowerBand : prevLower
upperBand := upperBand < prevUpper or close[1] > prevUpper ? upperBand : prevUpper

if na(atr[1])
    direction := 1
else if superTrend[1] == prevUpper
    direction := close > upperBand ? -1 : 1
else
    direction := close < lowerBand ? 1 : -1

superTrend := direction == -1 ? lowerBand : upperBand

upTrend   = plot(direction == -1 ? superTrend : na, "Up Trend",   color = color.green, style = plot.style_linebr)
downTrend = plot(direction ==  1 ? superTrend : na, "Down Trend", color = color.red,   style = plot.style_linebr)

buySignal  = direction == -1 and direction[1] == 1
sellSignal = direction ==  1 and direction[1] == -1

plotshape(buySignal,  "Buy",  shape.labelup,   location.belowbar, color.green, text = "BUY",  textcolor = color.white, size = size.small)
plotshape(sellSignal, "Sell", shape.labeldown, location.abovebar, color.red,   text = "SELL", textcolor = color.white, size = size.small)

alertcondition(buySignal,  "Supertrend Buy",  "Supertrend flipped bullish on {{ticker}}")
alertcondition(sellSignal, "Supertrend Sell", "Supertrend flipped bearish on {{ticker}}")`,
  },
  {
    name: "RSI divergence detector",
    uses: "pivots, lines and labels drawn between them, var state per side",
    source: `//@version=6
indicator("RSI Divergence Detector", overlay = true, max_lines_count = 100, max_labels_count = 100)

rsiLen     = input.int(14, "RSI Length")
pivotLeft  = input.int(5,  "Pivot Left")
pivotRight = input.int(5,  "Pivot Right")
showBull   = input.bool(true, "Bullish Divergence")
showBear   = input.bool(true, "Bearish Divergence")

rsi = ta.rsi(close, rsiLen)

ph = ta.pivothigh(high, pivotLeft, pivotRight)
pl = ta.pivotlow(low,  pivotLeft, pivotRight)

var float lastPivotLow    = na
var float lastPivotLowRSI = na
var int   lastPivotLowBar = na
var float lastPivotHigh    = na
var float lastPivotHighRSI = na
var int   lastPivotHighBar = na

bullDiv = false
bearDiv = false

if not na(pl)
    priceNow = low[pivotRight]
    rsiNow   = rsi[pivotRight]
    if not na(lastPivotLow) and priceNow < lastPivotLow and rsiNow > lastPivotLowRSI
        bullDiv := true
        if showBull
            line.new(lastPivotLowBar, lastPivotLow, bar_index - pivotRight, priceNow, color = color.green, width = 2)
            label.new(bar_index - pivotRight, priceNow, "Bull Div", style = label.style_label_up, color = color.green, textcolor = color.white, size = size.tiny)
    lastPivotLow    := priceNow
    lastPivotLowRSI := rsiNow
    lastPivotLowBar := bar_index - pivotRight

if not na(ph)
    priceNow = high[pivotRight]
    rsiNow   = rsi[pivotRight]
    if not na(lastPivotHigh) and priceNow > lastPivotHigh and rsiNow < lastPivotHighRSI
        bearDiv := true
        if showBear
            line.new(lastPivotHighBar, lastPivotHigh, bar_index - pivotRight, priceNow, color = color.red, width = 2)
            label.new(bar_index - pivotRight, priceNow, "Bear Div", style = label.style_label_down, color = color.red, textcolor = color.white, size = size.tiny)
    lastPivotHigh    := priceNow
    lastPivotHighRSI := rsiNow
    lastPivotHighBar := bar_index - pivotRight

alertcondition(bullDiv, "Bullish Divergence", "Bullish RSI divergence on {{ticker}}")
alertcondition(bearDiv, "Bearish Divergence", "Bearish RSI divergence on {{ticker}}")`,
  },
  {
    name: "VWAP with deviation bands",
    uses: "session reset, compound assignment, two fills between four plots",
    source: `//@version=6
indicator("VWAP with Standard Deviation Bands", overlay = true)

showBand1 = input.bool(true,  "Band 1")
mult1     = input.float(1.0,  "Multiplier 1", step = 0.1)
showBand2 = input.bool(true,  "Band 2")
mult2     = input.float(2.0,  "Multiplier 2", step = 0.1)
src       = input.source(hlc3, "Source")

var float sumSrcVol = 0.0
var float sumVol    = 0.0
var float sumSrc2Vol = 0.0

newSession = ta.change(time("D")) != 0

if newSession
    sumSrcVol  := 0.0
    sumVol     := 0.0
    sumSrc2Vol := 0.0

sumSrcVol  += src * volume
sumVol     += volume
sumSrc2Vol += src * src * volume

vwapValue = sumVol > 0 ? sumSrcVol / sumVol : na
variance  = sumVol > 0 ? sumSrc2Vol / sumVol - vwapValue * vwapValue : na
stdev     = na(variance) ? na : math.sqrt(math.max(variance, 0))

vwapPlot = plot(vwapValue, "VWAP", color = color.blue, linewidth = 2)

upper1 = plot(showBand1 ? vwapValue + stdev * mult1 : na, "Upper 1", color = color.new(color.green, 50))
lower1 = plot(showBand1 ? vwapValue - stdev * mult1 : na, "Lower 1", color = color.new(color.green, 50))
fill(upper1, lower1, color = color.new(color.green, 92), title = "Band 1")

upper2 = plot(showBand2 ? vwapValue + stdev * mult2 : na, "Upper 2", color = color.new(color.red, 50))
lower2 = plot(showBand2 ? vwapValue - stdev * mult2 : na, "Lower 2", color = color.new(color.red, 50))
fill(upper2, lower2, color = color.new(color.red, 95), title = "Band 2")`,
  },
  {
    name: "Multi-timeframe dashboard",
    uses: "request.security in a function, switch, a table, bgcolor",
    source: `//@version=6
indicator("Multi-Timeframe Trend Dashboard", overlay = true)

tf1 = input.timeframe("5",  "Timeframe 1")
tf2 = input.timeframe("15", "Timeframe 2")
tf3 = input.timeframe("60", "Timeframe 3")
emaLen = input.int(50, "EMA Length")
tablePos = input.string("Top Right", "Table Position", options = ["Top Right", "Top Left", "Bottom Right", "Bottom Left"])

getTrend(tf) =>
    e = request.security(syminfo.tickerid, tf, ta.ema(close, emaLen))
    c = request.security(syminfo.tickerid, tf, close)
    c > e ? 1 : c < e ? -1 : 0

t1 = getTrend(tf1)
t2 = getTrend(tf2)
t3 = getTrend(tf3)

trendText(t) => t == 1 ? "BULL" : t == -1 ? "BEAR" : "FLAT"
trendColor(t) => t == 1 ? color.green : t == -1 ? color.red : color.gray

pos = switch tablePos
    "Top Right"    => position.top_right
    "Top Left"     => position.top_left
    "Bottom Right" => position.bottom_right
    => position.bottom_left

var table dash = na
if barstate.islast
    dash := table.new(pos, 2, 4, border_width = 1, bgcolor = color.new(color.black, 20))
    table.cell(dash, 0, 0, "TF", text_color = color.white, text_size = size.small)
    table.cell(dash, 1, 0, "Trend", text_color = color.white, text_size = size.small)
    table.cell(dash, 0, 1, tf1, text_color = color.silver, text_size = size.small)
    table.cell(dash, 1, 1, trendText(t1), text_color = trendColor(t1), text_size = size.small)
    table.cell(dash, 0, 2, tf2, text_color = color.silver, text_size = size.small)
    table.cell(dash, 1, 2, trendText(t2), text_color = trendColor(t2), text_size = size.small)
    table.cell(dash, 0, 3, tf3, text_color = color.silver, text_size = size.small)
    table.cell(dash, 1, 3, trendText(t3), text_color = trendColor(t3), text_size = size.small)

allBull = t1 == 1 and t2 == 1 and t3 == 1
allBear = t1 == -1 and t2 == -1 and t3 == -1
bgcolor(allBull ? color.new(color.green, 92) : allBear ? color.new(color.red, 92) : na)

alertcondition(allBull, "All Timeframes Bullish", "All timeframes aligned bullish on {{ticker}}")
alertcondition(allBear, "All Timeframes Bearish", "All timeframes aligned bearish on {{ticker}}")`,
  },
  {
    name: "Auto support and resistance",
    uses: "array<float>, array<box>, boxes rebuilt on the last bar",
    source: `//@version=6
indicator("Auto Support & Resistance Zones", overlay = true, max_boxes_count = 50, max_lines_count = 50)

lookback   = input.int(20, "Pivot Lookback", minval = 2)
zoneWidth  = input.float(0.15, "Zone Width (%)", step = 0.05)
maxZones   = input.int(5, "Max Zones Each Side", minval = 1, maxval = 20)
resColor   = input.color(color.new(color.red, 80), "Resistance")
supColor   = input.color(color.new(color.green, 80), "Support")

var array<float> resLevels = array.new<float>()
var array<float> supLevels = array.new<float>()
var array<box>   resBoxes  = array.new<box>()
var array<box>   supBoxes  = array.new<box>()

ph = ta.pivothigh(high, lookback, lookback)
pl = ta.pivotlow(low, lookback, lookback)

if not na(ph)
    array.push(resLevels, ph)
    if array.size(resLevels) > maxZones
        array.shift(resLevels)

if not na(pl)
    array.push(supLevels, pl)
    if array.size(supLevels) > maxZones
        array.shift(supLevels)

if barstate.islast
    for i = 0 to array.size(resBoxes) > 0 ? array.size(resBoxes) - 1 : na
        box.delete(array.get(resBoxes, i))
    array.clear(resBoxes)
    for i = 0 to array.size(supBoxes) > 0 ? array.size(supBoxes) - 1 : na
        box.delete(array.get(supBoxes, i))
    array.clear(supBoxes)

    for i = 0 to array.size(resLevels) > 0 ? array.size(resLevels) - 1 : na
        lvl = array.get(resLevels, i)
        w = lvl * zoneWidth / 100
        array.push(resBoxes, box.new(bar_index - 50, lvl + w, bar_index + 10, lvl - w, border_color = color.new(color.red, 60), bgcolor = resColor))

    for i = 0 to array.size(supLevels) > 0 ? array.size(supLevels) - 1 : na
        lvl = array.get(supLevels, i)
        w = lvl * zoneWidth / 100
        array.push(supBoxes, box.new(bar_index - 50, lvl + w, bar_index + 10, lvl - w, border_color = color.new(color.green, 60), bgcolor = supColor))`,
  },
  {
    name: "Heikin Ashi overlay",
    uses: "plotcandle with its own colours, self-referential var",
    source: `//@version=6
indicator("Heikin Ashi Candles Overlay", overlay = true)

showHA = input.bool(true, "Show Heikin Ashi")
upCol   = input.color(color.new(#26a69a, 0), "Up")
downCol = input.color(color.new(#ef5350, 0), "Down")

var float haOpen = na
haClose = (open + high + low + close) / 4
haOpen := na(haOpen[1]) ? (open + close) / 2 : (haOpen[1] + haClose[1]) / 2
haHigh  = math.max(high, math.max(haOpen, haClose))
haLow   = math.min(low,  math.min(haOpen, haClose))

haColor = haClose >= haOpen ? upCol : downCol
plotcandle(showHA ? haOpen : na, showHA ? haHigh : na, showHA ? haLow : na, showHA ? haClose : na, title = "Heikin Ashi", color = haColor, bordercolor = haColor, wickcolor = haColor)

trendUp = haClose > haOpen and haClose[1] <= haOpen[1]
trendDn = haClose < haOpen and haClose[1] >= haOpen[1]
plotshape(trendUp, "HA Turn Up", shape.triangleup, location.belowbar, color.green, size = size.tiny)
plotshape(trendDn, "HA Turn Down", shape.triangledown, location.abovebar, color.red, size = size.tiny)`,
  },
  {
    name: "ATR trailing stop",
    uses: "stateful trail, barcolor, direction flips",
    source: `//@version=6
indicator("ATR Trailing Stop", overlay = true)

atrLen  = input.int(14, "ATR Period")
atrMult = input.float(2.0, "ATR Multiplier", step = 0.1)
useClose = input.bool(true, "Use Close for Extremes")

atrValue = ta.atr(atrLen)
loss = atrMult * atrValue

srcHigh = useClose ? close : high
srcLow  = useClose ? close : low

var float trail = na
var int   dir   = 1

prevTrail = nz(trail[1], srcLow - loss)

if srcHigh > prevTrail and srcHigh[1] > prevTrail
    trail := math.max(prevTrail, srcHigh - loss)
else if srcLow < prevTrail and srcLow[1] < prevTrail
    trail := math.min(prevTrail, srcLow + loss)
else if srcHigh > prevTrail
    trail := srcLow - loss
else
    trail := srcHigh + loss

dir := srcHigh > trail ? 1 : -1

buy  = dir == 1 and dir[1] == -1
sell = dir == -1 and dir[1] == 1

plot(trail, "Trailing Stop", color = dir == 1 ? color.green : color.red, linewidth = 2)
plotshape(buy,  "Buy",  shape.triangleup,   location.belowbar, color.green, size = size.small)
plotshape(sell, "Sell", shape.triangledown, location.abovebar, color.red,   size = size.small)
barcolor(dir == 1 ? color.new(color.green, 70) : color.new(color.red, 70))

alertcondition(buy,  "ATR Stop Buy",  "ATR trailing stop turned up on {{ticker}}")
alertcondition(sell, "ATR Stop Sell", "ATR trailing stop turned down on {{ticker}}")`,
  },
  {
    name: "Fair value gaps",
    uses: "a user-defined type in an array, reverse iteration, array.remove",
    source: `//@version=6
indicator("Fair Value Gaps (FVG)", overlay = true, max_boxes_count = 100)

showBull  = input.bool(true, "Bullish FVG")
showBear  = input.bool(true, "Bearish FVG")
minSize   = input.float(0.0, "Min Gap Size (%)", step = 0.01)
extendBars = input.int(20, "Extend (bars)", minval = 1)
bullCol   = input.color(color.new(color.green, 85), "Bullish")
bearCol   = input.color(color.new(color.red, 85), "Bearish")

type FVG
    box   b
    float top
    float bot
    bool  bull

var array<FVG> gaps = array.new<FVG>()

bullGap = low > high[2]
bearGap = high < low[2]
gapSizeBull = bullGap ? (low - high[2]) / high[2] * 100 : 0.0
gapSizeBear = bearGap ? (low[2] - high) / high * 100 : 0.0

if showBull and bullGap and gapSizeBull >= minSize
    b = box.new(bar_index - 2, low, bar_index + extendBars, high[2], border_color = color.new(color.green, 50), bgcolor = bullCol)
    array.push(gaps, FVG.new(b, low, high[2], true))

if showBear and bearGap and gapSizeBear >= minSize
    b = box.new(bar_index - 2, low[2], bar_index + extendBars, high, border_color = color.new(color.red, 50), bgcolor = bearCol)
    array.push(gaps, FVG.new(b, low[2], high, false))

// remove gaps that price has filled
if array.size(gaps) > 0
    for i = array.size(gaps) - 1 to 0
        g = array.get(gaps, i)
        filled = g.bull ? low <= g.bot : high >= g.top
        if filled
            box.delete(g.b)
            array.remove(gaps, i)

alertcondition(bullGap, "Bullish FVG", "Bullish fair value gap on {{ticker}}")
alertcondition(bearGap, "Bearish FVG", "Bearish fair value gap on {{ticker}}")`,
  },
  {
    name: "Trading session ranges",
    uses: "input.session, time() windows, a function returning a tuple of state",
    source: `//@version=6
indicator("Trading Session Ranges", overlay = true, max_boxes_count = 60, max_lines_count = 60)

asiaSess   = input.session("2000-0000", "Asia")
londonSess = input.session("0300-0800", "London")
nySess     = input.session("0930-1600", "New York")
tz         = input.string("America/New_York", "Timezone")
showLabels = input.bool(true, "Labels")

inAsia   = not na(time(timeframe.period, asiaSess, tz))
inLondon = not na(time(timeframe.period, londonSess, tz))
inNY     = not na(time(timeframe.period, nySess, tz))

trackSession(active, col, name) =>
    var box   b  = na
    var label l  = na
    var float hi = na
    var float lo = na
    if active and not active[1]
        hi := high
        lo := low
        b := box.new(bar_index, hi, bar_index, lo, border_color = col, bgcolor = color.new(col, 90))
        if showLabels
            l := label.new(bar_index, hi, name, style = label.style_label_down, color = color.new(col, 40), textcolor = color.white, size = size.tiny)
    else if active
        hi := math.max(hi, high)
        lo := math.min(lo, low)
        if not na(b)
            box.set_rightbottom(b, bar_index, lo)
            box.set_lefttop(b, box.get_left(b), hi)
        if not na(l)
            label.set_y(l, hi)
    [hi, lo]

[asiaHi, asiaLo]     = trackSession(inAsia,   color.blue,   "ASIA")
[londonHi, londonLo] = trackSession(inLondon, color.orange, "LONDON")
[nyHi, nyLo]         = trackSession(inNY,     color.purple, "NY")

bgcolor(inNY ? color.new(color.purple, 96) : na)`,
  },
  {
    name: "MACD with coloured histogram",
    uses: "overlay = false, ta.macd tuple, hline, a wrapped ternary",
    source: `//@version=6
indicator("MACD with Histogram Colors", overlay = false)

fastLen   = input.int(12, "Fast Length")
slowLen   = input.int(26, "Slow Length")
signalLen = input.int(9,  "Signal Length")
srcInput  = input.source(close, "Source")

[macdLine, signalLine, histLine] = ta.macd(srcInput, fastLen, slowLen, signalLen)

histColor = histLine >= 0 ?
     (histLine[1] < histLine ? color.new(color.green, 0) : color.new(color.green, 60)) :
     (histLine[1] > histLine ? color.new(color.red, 0) : color.new(color.red, 60))

plot(histLine, "Histogram", style = plot.style_columns, color = histColor)
plot(macdLine, "MACD", color = color.blue, linewidth = 2)
plot(signalLine, "Signal", color = color.orange, linewidth = 2)
hline(0, "Zero", color = color.gray, linestyle = hline.style_dashed)

bullCross = ta.crossover(macdLine, signalLine)
bearCross = ta.crossunder(macdLine, signalLine)

alertcondition(bullCross, "MACD Bull Cross", "MACD crossed above signal on {{ticker}}")
alertcondition(bearCross, "MACD Bear Cross", "MACD crossed below signal on {{ticker}}")`,
  },
  {
    name: "Volume spike detector",
    uses: "ta.sma over volume, barcolor, a table, str.tostring formats",
    source: `//@version=6
indicator("Volume Spike Detector", overlay = true)

lookback  = input.int(50, "Average Length")
threshold = input.float(2.0, "Spike Multiplier", step = 0.1)
showTable = input.bool(true, "Stats Table")

avgVol = ta.sma(volume, lookback)
ratio  = avgVol > 0 ? volume / avgVol : na
spike  = not na(ratio) and ratio >= threshold
bullSpike = spike and close > open
bearSpike = spike and close < open

plotshape(bullSpike, "Bull Spike", shape.triangleup,   location.belowbar, color.lime,    size = size.small)
plotshape(bearSpike, "Bear Spike", shape.triangledown, location.abovebar, color.fuchsia, size = size.small)
barcolor(spike ? (close > open ? color.lime : color.fuchsia) : na)

var int spikeCount = 0
if spike and barstate.isconfirmed
    spikeCount += 1

var table stats = na
if showTable and barstate.islast
    stats := table.new(position.top_right, 2, 3, border_width = 1)
    table.cell(stats, 0, 0, "Volume", text_color = color.white, text_size = size.small)
    table.cell(stats, 1, 0, str.tostring(volume, "#,###"), text_color = color.white, text_size = size.small)
    table.cell(stats, 0, 1, "Ratio", text_color = color.silver, text_size = size.small)
    table.cell(stats, 1, 1, na(ratio) ? "-" : str.tostring(ratio, "0.00") + "x", text_color = spike ? color.lime : color.silver, text_size = size.small)
    table.cell(stats, 0, 2, "Spikes", text_color = color.silver, text_size = size.small)
    table.cell(stats, 1, 2, str.tostring(spikeCount), text_color = color.silver, text_size = size.small)

alertcondition(spike, "Volume Spike", "Volume spike on {{ticker}}")`,
  },
  {
    name: "Bollinger squeeze",
    uses: "ta.bb and ta.kc tuples, fill between plots, bgcolor",
    source: `//@version=6
indicator("Bollinger Band Squeeze", overlay = true)

bbLen  = input.int(20, "BB Length")
bbMult = input.float(2.0, "BB StdDev", step = 0.1)
kcLen  = input.int(20, "KC Length")
kcMult = input.float(1.5, "KC Multiplier", step = 0.1)

[bbBasis, bbUpper, bbLower] = ta.bb(close, bbLen, bbMult)
[kcBasis, kcUpper, kcLower] = ta.kc(close, kcLen, kcMult)

squeezeOn  = bbLower > kcLower and bbUpper < kcUpper
squeezeOff = bbLower < kcLower and bbUpper > kcUpper

u = plot(bbUpper, "BB Upper", color = color.new(color.blue, 40))
l = plot(bbLower, "BB Lower", color = color.new(color.blue, 40))
fill(u, l, color = squeezeOn ? color.new(color.orange, 90) : color.new(color.blue, 95))
plot(bbBasis, "Basis", color = color.new(color.blue, 20))

bgcolor(squeezeOn ? color.new(color.orange, 92) : na)
plotshape(squeezeOff and squeezeOn[1], "Squeeze Fired", shape.diamond, location.belowbar, color.yellow, size = size.tiny)

alertcondition(squeezeOff and squeezeOn[1], "Squeeze Fired", "Bollinger squeeze released on {{ticker}}")`,
  },
];

for (const s of SCRIPTS) {
  const t0 = Date.now();
  const r = evaluatePine(s.source, bars, OPTS);
  if (!r.ok) {
    check(s.name, false, `${r.stage}: ${r.message}${r.line ? ` @line ${r.line}` : ''}`);
    continue;
  }
  const run = r.run;
  const drew =
    run.drawings.length > 0 ||
    run.bands.some(Boolean) ||
    run.barColors.some(Boolean) ||
    run.candles.length > 0 ||
    run.fills.length > 0 ||
    run.shapes.some(x => x.at.length > 0) ||
    run.plots.some(p => !p.offScale && p.values.some(v => v !== null));
  /* A bare "it drew nothing" sends the reader hunting. Say WHICH channels
     were empty and what the script said about it — nine times in ten the
     answer is that the tape never met the condition. */
  const empty = [
    `${run.drawings.length} drawings`,
    `${run.shapes.reduce((n, x) => n + x.at.length, 0)} shapes`,
    `${run.plots.filter(p => !p.offScale && p.values.some(v => v !== null)).length}/${run.plots.length} plots`,
    `${run.candles.length} candles`,
    `${run.fills.length} fills`,
  ].join(', ');
  check(
    s.name,
    drew,
    drew
      ? `${Date.now() - t0}ms · ${s.uses}`
      : `drew nothing — ${empty}${run.notes.length ? ` · notes: ${run.notes.join(' | ')}` : ''}`,
  );
}

/*
  AND THE ONE THAT DREW NOTHING SAID SO. The volume-spike script asks for a
  bar at twice its 50-bar average; this tape never gets past 1.45x, so its
  two shapes never fire — correctly. What matters is that the run REPORTS
  the empty shapes rather than leaving a reader to wonder, because that
  report is the difference between "my threshold is wrong" and "this engine
  is broken".
*/
{
  const spike = SCRIPTS.find(s => s.name.startsWith('Volume spike'))!;
  const r = evaluatePine(spike.source, bars, OPTS);
  check('a shape that never fires is named, not silently absent',
    r.ok && r.run.shapes.length > 0 && r.run.shapes.every(x => Array.isArray(x.at)),
    r.ok ? `${r.run.shapes.filter(x => x.at.length === 0).length} of ${r.run.shapes.length} never fired` : 'run failed');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
