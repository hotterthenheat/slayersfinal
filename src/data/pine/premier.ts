/*
==================================================
  SLAYER TERMINAL - THE INDICATORS THAT COME WITH IT (data/pine/premier.ts)
==================================================

  Six scripts that ship with the terminal, written in the same Pine the
  reader writes. Not a privileged built-in path — the SAME engine, the same
  refusals, the same report. If one of these draws something, a reader can
  open it, see exactly how, and change it.

  WHY THESE SIX. Every one of them is impossible anywhere else. They are
  built on `slayer.*` — the dealer book as a per-bar series — which is the
  only reason to have a Pine engine here rather than use TradingView’s. A
  moving-average crossover ships with every charting package on earth; the
  call wall as it stood at 10:05 ships with none of them.

  THE SOURCE LIVES IN CODE, NOT IN STORAGE. The store keeps only whether a
  reader has one switched on. That way an improvement here reaches everyone
  on the next load instead of being frozen into whatever was in localStorage
  the day they first opened the desk. A reader who wants to change one forks
  it, and the fork is an ordinary script of their own from that moment.
*/

export interface PremierScript {
  /** Stable across releases — it is what the store remembers. */
  id: string;
  name: string;
  /** One line, for the picker. What it shows, not how it works. */
  blurb: string;
  source: string;
}

export const PREMIER: readonly PremierScript[] = [
  {
    id: "gamma-structure",
    name: "Gamma Structure",
    blurb:
      "The call wall, put wall, flip and supreme strike, read at every bar rather than as today\u2019s snapshot \u2014 so the levels are where they were when each candle printed.",
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
    blurb:
      "Every wall that matters, not just the nearest \u2014 the heaviest strikes each side drawn as a ladder, each rung as thick as the gamma it carries.",
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
    blurb:
      "Whether the book amplifies a move or absorbs it, as the ground behind the candles, with the bars where the whole book changed sign.",
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
    blurb:
      "Which side of price the gamma is standing on. Two tapes can name the same call wall while one has the whole book overhead and the other has it underneath.",
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
    blurb:
      "Price arriving at gamma, measured in the tape\u2019s own volatility \u2014 distance to each wall in ATR, marked the first bar it gets there.",
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
    blurb:
      "Open interest opening at the strike price is standing on. A level is only live while someone is still adding to it.",
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
];

/** Is this id one of ours? Used to keep a stale copy out of storage. */
export const isPremierId = (id: string): boolean => PREMIER.some(p => p.id === id);
