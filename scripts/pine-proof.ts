/*
  Acceptance test for the Pine engine (data/pine/).

  Readers write their own indicators in the language they already know. The
  engine runs a SUBSET of Pine v6, and the whole design rests on one
  decision: what it cannot run, it refuses BY NAME, before it draws.

  A partial Pine that quietly approximates the parts it did not implement
  produces a chart that looks like TradingView's and is not — and a reader
  would size a position on it. That is the same failure this repo deleted
  the seeded "odds it stays inside" for, and labelled the missing IV rank
  as unavailable rather than substituting a lookalike.

  So this proof has two halves, and the second is the one that matters:

    · the maths is RIGHT — ta.ema, ta.sma and ta.rsi are checked against the
      tape's own implementations, bar for bar, so a script and the chart it
      is drawn on cannot disagree;
    · the edges are LOUD — every unimplemented namespace refuses, unknown
      names refuse, and a runaway loop is stopped rather than hanging.
*/
import { readFileSync } from 'node:fs';
import { compilePine, evaluatePine, REFUSED, REFUSED_CALLS } from '../src/data/pine/index';
import { didYouMean } from '../src/data/pine/analyse';
import { LIBRARY } from '../src/data/pine/library';
import { emaSeries, smaSeries, rsiSeries, atrBarSeries } from '../src/data/indicators';
import type { Candle } from '../src/types/market';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

/* A deterministic tape with trend, pullbacks and a range — enough shape
   that a wrong recurrence shows up rather than averaging away. */
const bars: Candle[] = [];
{
  let px = 100;
  for (let i = 0; i < 300; i++) {
    const drift = Math.sin(i / 17) * 1.6 + Math.cos(i / 5) * 0.4;
    const o = px;
    const c = px + drift;
    bars.push({ time: 1600000000 + i * 300, open: o, high: Math.max(o, c) + 0.4, low: Math.min(o, c) - 0.4, close: c, volume: 1000 + (i % 7) * 50 });
    px = c;
  }
}

const run = (src: string) => {
  const r = evaluatePine(src, bars);
  if (!r.ok) throw new Error(`${r.stage}: ${r.message}${r.line ? ` (line ${r.line})` : ''}`);
  return r.run;
};
const same = (a: (number | null)[], b: (number | null)[], tol = 1e-9) =>
  a.length === b.length && a.every((v, i) => (v === null || b[i] === null ? v === b[i] : Math.abs(v - (b[i] as number)) < tol));

// ── the maths agrees with the tape it is drawn on ────────────────────────
{
  /*
    ONE ENGINE, TWO PATHS. A reader's `ta.ema(close, 21)` and the chart's own
    EMA21 sit on the same pixels; if they were computed by two formulas that
    disagreed, one of them would be lying and there would be no way to tell
    which. `emaSeries` seeds at the first close and so does Pine's ta.ema, so
    the agreement here is exact rather than approximate.
  */
  const ema = run('//@version=6\nindicator("t")\nplot(ta.ema(close, 21))').plots[0].values;
  check('ta.ema is the tape\'s own EMA, bar for bar', same(ema, emaSeries(bars, 21)));

  const sma = run('//@version=6\nindicator("t")\nplot(ta.sma(close, 20))').plots[0].values;
  check('ta.sma is the tape\'s own SMA, nulls included', same(sma, smaSeries(bars, 20)));

  const rsi = run('//@version=6\nindicator("t")\nplot(ta.rsi(close, 14))').plots[0].values;
  const wantRsi = rsiSeries(bars, 14);
  const bothRsi = rsi.map((v, i) => [v, wantRsi[i]] as const).filter(([a, b]) => a !== null && b !== null);
  check('ta.rsi is the tape\'s own RSI where both are defined',
    bothRsi.length > 250 && bothRsi.every(([a, b]) => Math.abs((a as number) - (b as number)) < 1e-9),
    `${bothRsi.length} bars`);

  /*
    AND ONE PLACE THEY DELIBERATELY DIFFER, asserted so it cannot drift into
    being an accident. `ta.atr` is `ta.rma(ta.tr(true), len)`, and `tr(true)`
    on the first bar is high−low; the tape's `atrBarSeries` starts true range
    at bar 1 instead. Two definitions, both defensible, and a Pine engine
    owes the reader Pine's.
  */
  const atr = run('//@version=6\nindicator("t")\nplot(ta.atr(14))').plots[0].values;
  const tape = atrBarSeries(bars, 14);
  const trs = bars.map((b, i) => i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)));
  const wantAtr: (number | null)[] = new Array(bars.length).fill(null);
  {
    let prev: number | null = null;
    for (let i = 0; i < trs.length; i++) {
      if (prev === null) { if (i === 13) { prev = trs.slice(0, 14).reduce((x, y) => x + y, 0) / 14; wantAtr[i] = prev; } }
      else { prev = (trs[i] + prev * 13) / 14; wantAtr[i] = prev; }
    }
  }
  check('ta.atr is Pine\'s rma(tr(true), len) exactly', same(atr, wantAtr));
  check('  · which is NOT the tape\'s ATR, and the difference is known',
    !same(atr, tape), 'the tape starts true range at bar 1; Pine includes bar 0');
}

// ── the execution model ──────────────────────────────────────────────────
{
  const ups = run(`//@version=6
indicator("t")
var int up = 0
if close > close[1]
    up := up + 1
plot(up)`).plots[0].values;
  let expect = 0;
  for (let i = 1; i < bars.length; i++) if (bars[i].close > bars[i - 1].close) expect++;
  check('var survives the bar, and close[1] reaches into the last one', ups[ups.length - 1] === expect, `${expect} up bars`);
  check('  · and it only ever climbs, so it is not being re-initialised',
    ups.every((v, i) => i === 0 || (v as number) >= (ups[i - 1] as number)));

  /*
    THE SUBTLE ONE. In Pine each CALL SITE of a ta.* function is its own
    accumulator, and a function holding one that is called twice is two
    accumulators, not one shared between them. Keying state on the call site
    alone passes the first of these and fails the second.
  */
  const spread = run('//@version=6\nindicator("t")\nplot(ta.ema(close, 5) - ta.ema(close, 50))').plots[0].values;
  const want = emaSeries(bars, 5).map((v, i) => v - emaSeries(bars, 50)[i]);
  check('two ta.ema call sites are two averages', same(spread, want));

  const viaFn = run(`//@version=6
indicator("t")
f(len) =>
    ta.ema(close, len)
plot(f(5) - f(50))`).plots[0].values;
  check('  · and so is one function called twice — state is keyed by call PATH', same(viaFn, want));

  const warm = run('//@version=6\nindicator("t")\nplot(ta.sma(close, 50) + 1)').plots[0].values;
  check('na propagates, so a warmup bar draws nothing rather than a zero',
    warm.slice(0, 49).every(v => v === null) && warm[49] !== null);

  const shapes = run(`//@version=6
indicator("t", overlay=true)
plotshape(ta.crossover(close, ta.sma(close, 20)), "x", shape.triangleup, location.belowbar, color.green)`).shapes[0];
  const sma20 = smaSeries(bars, 20);
  let crosses = 0;
  for (let i = 1; i < bars.length; i++) {
    if (sma20[i] === null || sma20[i - 1] === null) continue;
    if (bars[i - 1].close <= (sma20[i - 1] as number) && bars[i].close > (sma20[i] as number)) crosses++;
  }
  check('plotshape marks exactly the bars the condition held on', shapes.at.length === crosses, `${crosses} crossings`);
  /* The colour is the FIFTH positional argument. Reading it only from named
     arguments painted every script's shapes the fallback ink, which looked
     like the engine working right up until two conditions were meant to be
     told apart by colour. */
  check('  · and takes its colour from the positional argument', shapes.color === '#089981', String(shapes.color));
  const namedCol = run(`//@version=6
indicator("t", overlay=true)
plotshape(close > open, "u", shape.circle, location.abovebar, color = color.red)`).shapes[0];
  check('  · or the named one', namedCol.color === '#f23645', String(namedCol.color));

  const decl = run('//@version=6\nindicator("My study", overlay=true)\nplot(close)');
  check('the declaration carries the title and the pane it draws into', decl.title === 'My study' && decl.overlay);

  const inputs = run('//@version=6\nindicator("t")\nlen = input.int(21, "Length")\nplot(ta.ema(close, len))').inputs;
  check('inputs are collected once, with their titles', inputs.length === 1 && inputs[0].title === 'Length' && inputs[0].value === 21);
}

// ── the edges are loud ───────────────────────────────────────────────────
{
  /*
    EVERY REFUSED NAMESPACE IS REACHABLE FROM A SCRIPT, so the table cannot
    rot into a list of prefixes nothing matches. One probe per entry, built
    from the table itself rather than from a second copy of it.
  */
  const unreachable: string[] = [];
  for (const r of REFUSED) {
    const call = r.prefix.endsWith('.') ? `${r.prefix}thing(1)` : `${r.prefix}(1)`;
    const res = compilePine(`//@version=6\nindicator("t")\nx = ${call}\nplot(close)`);
    const refused = !res.ok && res.stage === 'unsupported' && res.refusals.some(f => f.why === r.why || f.name.startsWith(r.prefix));
    if (!refused) unreachable.push(r.prefix);
  }
  check(`all ${REFUSED.length} refused namespaces actually refuse`, unreachable.length === 0, unreachable.join(', ') || 'every one reachable');
  check('  · and every refusal carries a reason, not just a name',
    [...REFUSED, ...REFUSED_CALLS].every(r => r.why.length > 25),
    `shortest ${Math.min(...[...REFUSED, ...REFUSED_CALLS].map(r => r.why.length))} chars`);

  /* Names that are a value here and not a function — `time` is the bar's
     timestamp, `time(tf, session)` is a window this engine cannot answer. */
  const callOnly = REFUSED_CALLS.filter(r => {
    const res = compilePine(`//@version=6\nindicator("t")\nx = ${r.name}("1", "0930-1600")\nplot(close)`);
    return res.ok || res.stage !== 'unsupported';
  }).map(r => r.name);
  check(`the ${REFUSED_CALLS.length} call-only refusals refuse in call position`, callOnly.length === 0, callOnly.join(', ') || 'both');
  check('  · while still working as values', evaluatePine('//@version=6\nindicator("t")\nplot(time)', bars).ok);

  /*
    THE SHAPE OF SCRIPT THIS PROOF USED TO WATCH GET REFUSED.

    Every line below was once a refusal — the lookahead, the array, the two
    drawing objects, the table — and this assertion checked that the engine
    named all five rather than quietly skipping them. They are implemented
    now, so the same script is the assertion in the other direction: it runs
    end to end, and the run reports the one thing about it a reader cannot
    see in the picture.
  */
  const dnfSrc = `//@version=6
indicator("MTF", overlay = true)
[dOpen, pdHigh] = request.security(syminfo.tickerid, "D", [open, high[1]], lookahead = barmerge.lookahead_on)
var float[] store = array.new_float(20, na)
var table tbl = na
eLine = line.new(bar_index, close, bar_index + 1, close)
label.new(bar_index, close, "entry")
if barstate.islast
    tbl := table.new(position.top_right, 1, 1)
    table.cell(tbl, 0, 0, "x")
plot(ta.ema(close, 21))`;
  const roll = (mins: number): Candle[] => {
    const step = mins * 60, out: Candle[] = [];
    for (const b of bars) {
      const bucket = Math.floor(b.time / step) * step;
      const last = out[out.length - 1];
      if (!last || last.time !== bucket) out.push({ ...b, time: bucket });
      else { last.high = Math.max(last.high, b.high); last.low = Math.min(last.low, b.low); last.close = b.close; }
    }
    return out;
  };
  const dnf = evaluatePine(dnfSrc, bars, { timeframe: '5m', ticker: 'SPY', chartMinutes: 5, resolveBars: roll });
  check('the multi-timeframe levels shape that was once refused now runs', dnf.ok, dnf.ok ? '' : `${dnf.message}${dnf.line ? ' @' + dnf.line : ''}`);
  if (dnf.ok) {
    check('  · drawing a line, a label and a table on the tape',
      dnf.run.drawings.some(d => d.what === 'line') && dnf.run.drawings.some(d => d.what === 'label') && dnf.run.drawings.some(d => d.what === 'table'),
      dnf.run.drawings.map(d => d.what).join(','));
    check('  · and saying out loud that it read a daily bar before it closed',
      dnf.run.notes.length === 1 && /lookahead_on/.test(dnf.run.notes[0]), `${dnf.run.notes.length} notes`);
  }

  /* What is still outside the subset refuses by name, at its line. */
  const out = compilePine('//@version=6\nindicator("t")\nx = request.financial(syminfo.tickerid, "TOTAL_REVENUE", "FQ")\nplot(request.security("AAPL", "D", close) + x)');
  check('what remains outside the subset still refuses, at its line',
    !out.ok && out.stage === 'unsupported' && out.refusals.length >= 2 && out.refusals.every(f => f.line > 0),
    !out.ok && out.stage === 'unsupported' ? out.refusals.map(f => f.name).join(' · ') : '');

  const typo = compilePine('//@version=6\nindicator("t")\nplot(ta.emaa(close, 21))');
  check('a misspelt built-in is refused rather than silently ignored', !typo.ok && typo.stage === 'unsupported');

  const undef = compilePine('//@version=6\nindicator("t")\nplot(nosuchvalue)');
  check('so is a name the script never defines', !undef.ok && undef.stage === 'unsupported');

  const strat = compilePine('//@version=6\nstrategy("s")\nstrategy.entry("long", strategy.long)\nplot(close)');
  check('a strategy is refused — there is no order simulator behind this', !strat.ok && strat.stage === 'unsupported');

  const clean = compilePine(`//@version=6
indicator("Custom momentum")
len = input.int(14, "Length")
mom = ta.rsi(close, len) - 50
plot(mom, "Momentum", color = color.blue)
plotshape(ta.crossover(mom, 0), "buy", shape.triangleup, location.belowbar, color.green)`);
  check('and a script inside the subset compiles with nothing to say', clean.ok);

  const syntax = compilePine('//@version=6\nindicator("t"\nplot(close)');
  check('a syntax error reports the line it is on', !syntax.ok && syntax.stage === 'syntax' && syntax.line > 0, `line ${!syntax.ok && syntax.stage === 'syntax' ? syntax.line : '?'}`);

  /* A script is user input, so a runaway loop must stop rather than take
     the tab with it. */
  const runaway = evaluatePine('//@version=6\nindicator("t")\ni = 0\nwhile true\n    i := i + 1\nplot(i)', bars);
  check('a loop that never ends is stopped, not left running',
    !runaway.ok && runaway.stage === 'runtime' && /loop|budget/i.test(runaway.message), runaway.ok ? 'it ran' : runaway.message);
}

// ── the higher timeframe, and the lookahead it will not take ─────────────
{
  /*
    `request.security` on THIS symbol at a higher interval is the one fetch
    the engine serves, because Terrain already aggregates the same base bars
    to any interval — so a script's ten-minute series is the array the chart
    would draw at ten minutes, not a second opinion about the session.

    THE ALIGNMENT IS THE WHOLE CLAIM. Each chart bar sees the last higher bar
    that had ALREADY CLOSED when it closed. A signal printed at 10:05 would
    have printed at 10:05 on the day. The assertion below is not that the
    numbers are plausible — it recomputes the eligible bar for every chart
    bar and demands an exact match, and separately hunts for any value that
    could only have come from a bar still forming.
  */
  const agg = (mins: number): Candle[] => {
    const step = mins * 60;
    const out: Candle[] = [];
    for (const b of bars) {
      const bucket = Math.floor(b.time / step) * step;
      const last = out[out.length - 1];
      if (!last || last.time !== bucket) out.push({ ...b, time: bucket });
      else {
        last.high = Math.max(last.high, b.high);
        last.low = Math.min(last.low, b.low);
        last.close = b.close;
        last.volume += b.volume;
      }
    }
    return out;
  };
  const mtfOpts = { timeframe: '5m', ticker: 'SPY', chartMinutes: 5, resolveBars: (m: number) => agg(m) };
  const r = evaluatePine('//@version=6\nindicator("t")\nplot(request.security(syminfo.tickerid, "15", close))', bars, mtfOpts);
  check('request.security fetches this symbol at a higher interval', r.ok, r.ok ? '' : r.message);
  if (r.ok) {
    const v = r.run.plots[0].values;
    const h15 = agg(15);
    let wrong = 0;
    let ahead = 0;
    for (let i = 0; i < bars.length; i++) {
      const val = v[i];
      if (val === null) continue;
      const closeAt = bars[i].time + 300;
      const eligible = h15.filter(b => b.time + 900 <= closeAt);
      const want = eligible.length ? eligible[eligible.length - 1].close : null;
      if (want === null || Math.abs(val - want) > 1e-9) wrong += 1;
      if (h15.some(b => b.time + 900 > closeAt && b.close === val && b.close !== want)) ahead += 1;
    }
    check('  · every bar carries the last CLOSED higher bar', wrong === 0, `${wrong} wrong of ${bars.length}`);
    check('  · and never one that was still forming', ahead === 0, `${ahead} lookahead hits`);
    const steps = v.filter((x, i) => i > 0 && x !== v[i - 1]).length;
    check('  · so the value steps at the higher boundary, not every bar', steps > 10 && steps < bars.length / 2, `${steps} steps over ${bars.length} bars`);
  }

  /* A user function fetched at three intervals: three independent sets of
     accumulators, and a `var` inside it that survives the bar. This is the
     shape of a multi-timeframe trigger, and it is where a naive engine
     shares one EMA between all three fetches. */
  const trig = `//@version=6
indicator("trigger", overlay = true)
f_trig() =>
    _macd = ta.ema(close, 2) - ta.ema(close, 7)
    _sig  = ta.sma(_macd, 9)
    _k    = ta.sma(ta.stoch(close, high, low, 13), 3)
    _bull = ta.crossover(_macd, _sig) and _k <= 20
    var int _state = 0
    _state := _bull ? 1 : _state
    [_bull, _state]
[b5, st5]   = request.security(syminfo.tickerid, "5",  f_trig())
[b10, st10] = request.security(syminfo.tickerid, "10", f_trig())
[b15, st15] = request.security(syminfo.tickerid, "15", f_trig())
plotshape(b5 and st10 == 1 and st15 == 1, "aligned", shape.triangleup, location.belowbar, color.green)
plotshape(b5, "early", shape.triangleup, location.belowbar, color.blue)`;
  const t = evaluatePine(trig, bars, mtfOpts);
  check('a function fetched at three intervals runs', t.ok, t.ok ? '' : t.message);
  if (t.ok) {
    const aligned = t.run.shapes.find(x => x.title === 'aligned');
    const early = t.run.shapes.find(x => x.title === 'early');
    check('  · a var inside it survives the bar', (early?.at.length ?? 0) > 0, `${early?.at.length ?? 0} triggers`);
    check('  · and alignment is a SUBSET of the entry timeframe firing',
      (aligned?.at.length ?? 0) <= (early?.at.length ?? 0) && (aligned?.at ?? []).every(i => early?.at.includes(i)),
      `${aligned?.at.length ?? 0} aligned within ${early?.at.length ?? 0}`);
  }

  /* A LOWER interval than the chart, which is the case that silently broke
     a reader's indicator the moment they changed a pane's timeframe. The
     alignment rule is the same in both directions — the last bar closed by
     this bar's close — so it is well defined and must not error. */
  const lower = evaluatePine('//@version=6\nindicator("t")\nplot(request.security(syminfo.tickerid, "1", close))', bars, { ...mtfOpts, chartMinutes: 15 });
  check('a LOWER interval than the chart resolves rather than failing', lower.ok, lower.ok ? '' : lower.message);

  /* The two fetches this engine will not serve, refused statically rather
     than at run time on bar 900. */
  const other = compilePine('//@version=6\nindicator("t")\nplot(request.security("AAPL", "15", close))');
  check('a DIFFERENT symbol is refused — there is no feed for a second one', !other.ok && other.stage === 'unsupported');
  /*
    `lookahead_on` RUNS, AND SAYS SO.

    It used to be refused, and refusing it took out every anchored-level
    script — the idiom `request.security(sym, "D", [open, high[1]],
    lookahead_on)` reads today's open and yesterday's high, both of which
    were known at the open. What makes the mode dangerous is asking it for a
    value that was NOT known, and the picture cannot show which. So the two
    things proved here are that it serves the CONTAINING bar rather than the
    last closed one, and that every line using it lands in the run's notes.
  */
  const aheadSrc = '//@version=6\nindicator("t")\nplot(request.security(syminfo.tickerid, "60", open, lookahead = barmerge.lookahead_on))';
  const offSrc = '//@version=6\nindicator("t")\nplot(request.security(syminfo.tickerid, "60", open, lookahead = barmerge.lookahead_off))';
  const onR = evaluatePine(aheadSrc, bars, mtfOpts);
  const offR = evaluatePine(offSrc, bars, mtfOpts);
  check('lookahead_on runs rather than refusing', onR.ok, onR.ok ? '' : onR.message);
  if (onR.ok && offR.ok) {
    check('  · and every line that used it is named in the run notes',
      onR.run.notes.length === 1 && /line 3/.test(onR.run.notes[0]) && /lookahead_on/.test(onR.run.notes[0]),
      onR.run.notes[0] ?? '(none)');
    check('  · lookahead_off makes no note, because it reads nothing early',
      offR.run.notes.length === 0, `${offR.run.notes.length} notes`);

    /* The containing bar's OPEN, from the first chart bar inside it — which
       is the whole reason the mode exists. Under lookahead_off the same
       fetch is still serving the PREVIOUS hour there. */
    const h60 = agg(60);
    const on = onR.run.plots[0].values;
    const off = offR.run.plots[0].values;
    let containing = 0, lagged = 0, differ = 0;
    for (let i = 0; i < bars.length; i++) {
      if (on[i] === null) continue;
      const host = h60.filter(b => b.time <= bars[i].time).pop();
      if (!host) continue;
      if (Math.abs((on[i] as number) - host.open) < 1e-9) containing += 1;
      if (off[i] !== null && Math.abs((on[i] as number) - (off[i] as number)) > 1e-9) differ += 1;
      const closed = h60.filter(b => b.time + 3600 <= bars[i].time + 300).pop();
      if (off[i] !== null && closed && Math.abs((off[i] as number) - closed.open) < 1e-9) lagged += 1;
    }
    check('  · it serves the open of the bar the chart bar sits INSIDE',
      containing > 250 && containing === on.filter(v => v !== null).length, `${containing} of ${on.filter(v => v !== null).length} bars`);
    check('  · which is a different answer from lookahead_off',
      differ > 200, `${differ} bars differ`);
    check('  · and lookahead_off still serves only the last CLOSED bar',
      lagged === off.filter(v => v !== null).length, `${lagged} of ${off.filter(v => v !== null).length}`);
  }
}

/*
  ── the objects a levels indicator is made of ────────────────────────────

  `plot` is one value per bar. A levels script is not that: it is lines
  placed at prices it worked out, labels carrying their held/broken record,
  a box over the active structure, and a table pinned to a corner. Refusing
  those meant refusing every indicator of that shape, which is what sent
  this half of the engine into existence — so what is proved here is that
  each one survives the round trip from source to a drawable object.
*/
{
  const src = `//@version=6
indicator("objects", overlay = true, max_lines_count = 20)
var float[] seen = array.new_float()
var line[] held = array.new_line()
if bar_index == 100
    array.push(seen, close)
    array.push(seen, close * 1.01)
if barstate.islast
    for k = 0 to array.size(seen) - 1
        p = array.get(seen, k)
        array.push(held, line.new(bar_index - 5, p, bar_index, p, extend = extend.both, color = #e91e63, width = 2))
        label.new(bar_index + 8, p, "level " + str.tostring(p, format.mintick), style = label.style_none, textcolor = #e91e63)
    box.new(bar_index - 5, array.get(seen, 1), bar_index, array.get(seen, 0), extend = extend.both, bgcolor = #26a69a2e)
    t = table.new(position.bottom_right, 2, 2, border_width = 1)
    table.cell(t, 0, 0, "levels", text_color = color.white, text_size = size.small)
    table.cell(t, 1, 0, str.tostring(array.size(seen)), text_color = color.white, text_size = size.small)`;
  const r = evaluatePine(src, bars, {});
  check('a script built out of arrays, lines, labels, a box and a table runs', r.ok, r.ok ? '' : `${r.message}${r.line ? ' @' + r.line : ''}`);
  if (r.ok) {
    const kinds = new Map<string, number>();
    for (const d of r.run.drawings) kinds.set(d.what, (kinds.get(d.what) ?? 0) + 1);
    check('  · two lines, two labels, one box and one table are left standing',
      kinds.get('line') === 2 && kinds.get('label') === 2 && kinds.get('box') === 1 && kinds.get('table') === 1,
      [...kinds].map(([k, n]) => `${n} ${k}`).join(', '));
    const line = r.run.drawings.find(d => d.what === 'line');
    check('  · a line carries the price it was drawn at, not a bar value',
      line?.what === 'line' && Math.abs(line.y1 - bars[100].close) < 1e-9);
    check('  · extend.both survives to the renderer', line?.what === 'line' && line.extend === 'both');
    const lab = r.run.drawings.find(d => d.what === 'label');
    check('  · a label formatted with format.mintick reads as a price',
      lab?.what === 'label' && /^level \d+\.\d\d$/.test(lab.text), lab?.what === 'label' ? lab.text : '');
    check('  · a label placed past the last bar keeps that index',
      lab?.what === 'label' && lab.x === bars.length - 1 + 8, lab?.what === 'label' ? String(lab.x) : '');
    const tab = r.run.drawings.find(d => d.what === 'table');
    check('  · the table is anchored to a corner and holds what was written into it',
      tab?.what === 'table' && tab.position === 'bottom_right' && tab.cells[0][0]?.text === 'levels' && tab.cells[0][1]?.text === '2',
      tab?.what === 'table' ? `${tab.cells[0][0]?.text}/${tab.cells[0][1]?.text}` : '');
  }

  /* The count cap is Pine's own guard, and a script that never deletes must
     draw a moving window rather than growing without end. */
  const flood = `//@version=6
indicator("flood", overlay = true, max_lines_count = 5)
line.new(bar_index, close, bar_index + 1, close)`;
  const f = evaluatePine(flood, bars, {});
  check('max_lines_count evicts the oldest rather than drawing 300 lines',
    f.ok && f.run.drawings.length === 5, f.ok ? `${f.run.drawings.length} lines` : f.message);

  /* `display` decides WHERE a plot goes. A levels script plots its prices
     with display.price_scale to get their tags on the axis and draws the
     levels themselves as objects; a caller that ignores the argument lays a
     flat rail across the pane for every one of them. */
  const disp = evaluatePine('//@version=6\nindicator("d")\nplot(close, "a", display = display.price_scale)\nplot(close, "b")', bars, {});
  check('a plot carries its display argument through to the caller',
    disp.ok && disp.run.plots[0].display === 'price_scale' && disp.run.plots[1].display === 'all',
    disp.ok ? disp.run.plots.map(p => p.display).join(',') : disp.message);
}

/*
  ── the language, where it stopped being Pine ────────────────────────────

  Four constructs that each refused a real script over its FORM rather than
  its meaning: a loop that stops early, a ternary wrapped over two lines, a
  cast, and a session window.
*/
{
  const brk = `//@version=6
indicator("b")
found = 0
for k = 0 to 100
    if k == 7
        found := k
        break
plot(found)`;
  const b = evaluatePine(brk, bars, {});
  check('break leaves a loop at the bar it was reached',
    b.ok && b.run.plots[0].values[10] === 7, b.ok ? String(b.run.plots[0].values[10]) : b.message);

  const cont = `//@version=6
indicator("c")
size = 3 == 1 ? 10 : 3 == 2 ? 20 :
     3 == 3 ? 30 : 40
plot(size)`;
  const c = evaluatePine(cont, bars, {});
  check('a ternary wrapped onto a second line is one expression, not a block',
    c.ok && c.run.plots[0].values[5] === 30, c.ok ? String(c.run.plots[0].values[5]) : `${c.message} @${c.line}`);

  const cast = evaluatePine('//@version=6\nindicator("i")\nplot(int(7.9) + int(-7.9))', bars, {});
  check('int() truncates toward zero, the way Pine does',
    cast.ok && cast.run.plots[0].values[5] === 0, cast.ok ? String(cast.run.plots[0].values[5]) : cast.message);

  const sess = `//@version=6
indicator("s")
w = input.session("0930-1600", "RTH")
plot(na(time(timeframe.period, w, "America/New_York")) ? 0 : 1)`;
  const se = evaluatePine(sess, bars, { timeframe: '5m' });
  check('a session window runs and both answers occur over a tape that spans days',
    se.ok && se.run.plots[0].values.some(v => v === 1) && se.run.plots[0].values.some(v => v === 0),
    se.ok ? `${se.run.plots[0].values.filter(v => v === 1).length} bars inside` : se.message);
}

/*
  ── a script is stored whole, or not at all ──────────────────────────────

  The cap was 20,000 characters and the editor TRIMMED to it. The levels
  indicator this engine was built for is 46,000, so saving it kept half a
  script — which then failed to parse and drew nothing, while the editor
  went on reporting the full text as fine. A ceiling that silently mangles
  its input is worse than no ceiling.
*/
{
  const store = readFileSync('src/data/pine/store.ts', 'utf8');
  const cap = /MAX_SOURCE_CHARS = ([\d_]+)/.exec(store);
  const n = cap ? Number(cap[1].replace(/_/g, '')) : 0;
  check('a real indicator fits inside the stored-script ceiling', n >= 60_000, `${n.toLocaleString()} characters`);
  const editor = readFileSync('src/components/terrain/PineEditor.tsx', 'utf8');
  check('and the editor refuses an over-long script rather than trimming it',
    /tooLong/.test(editor) && !/draft\.slice\(0, MAX_SOURCE_CHARS\)/.test(editor));
}

/*
  ── slayer.*: the desk's own book, and the line it must not cross ────────

  A Pine engine that only serves open/high/low/close is a worse TradingView.
  The reason to have one here is the dealer book — and the reason it can be
  trusted is that the engine keeps two kinds of number apart:

    SERIES    the book is recorded once a minute, so net gamma, the walls and
              the flip have a value AT EVERY BAR and behave the way a script
              expects one to.
    SNAPSHOT  net delta, vega and charm come off TODAY'S chain. There is one
              of them. Handed back on every bar it plots as a flat line that
              looks exactly like a level that held all day.

  Both are served. Only one of them is quiet about it.
*/
{
  /* A staged book, so this proves the ENGINE rather than the simulator: two
     hundred bars whose call wall walks up ten dollars and whose net gamma
     changes sign halfway through. */
  const feed = {
    book: bars.map((b, i) => ({
      netGex: i < 150 ? 1_000_000 * (i + 1) : -1_000_000 * (i + 1),
      callWall: 120 + Math.floor(i / 20),
      putWall: 80 - Math.floor(i / 20),
      flip: 100,
      supreme: 95,
      step: 1,
      strikes: [
        { strike: 95, value: 5_000_000, callOI: 1000 + i, putOI: 500 },
        { strike: 100, value: -4_000_000, callOI: 2000, putOI: 700 + i * 2 },
        { strike: 105, value: 2_000_000, callOI: 300, putOI: 100 },
      ],
      _b: b,
    })),
    now: { netDex: -1_600_000_000, netVex: 42, netVanna: 7, netCharm: -3, maxPain: 101, gammaPin: 99.5 },
  };
  const withBook = { timeframe: '5m', ticker: 'SPY', chartMinutes: 5, slayer: feed };

  const r = evaluatePine(`//@version=6
indicator("book", overlay = true)
plot(slayer.callwall, "wall")
plot(slayer.netgex, "ng")
plot(slayer.gex(100), "at 100")
plot(slayer.doi_put(100), "doi put")
plot(slayer.dex, "dex")`, bars, withBook);
  check('slayer.* runs against a book the host supplies', r.ok, r.ok ? '' : r.message);
  if (r.ok) {
    const wall = r.run.plots[0].values.filter(v => v !== null) as number[];
    const dex = r.run.plots[4].values.filter(v => v !== null) as number[];
    check('  · a SERIES moves bar to bar — the wall walks as the book is rewritten',
      new Set(wall).size > 5, `${new Set(wall).size} distinct wall prices`);
    check('  · a SNAPSHOT is one number on every bar, by construction',
      new Set(dex).size === 1 && dex[0] === -1_600_000_000, `${new Set(dex).size} distinct`);
    check('  · and the run SAYS SO rather than letting it pass as history',
      r.run.notes.some(n => n.includes('slayer.dex') && /not history/i.test(n)),
      r.run.notes[0]?.slice(0, 80) ?? '(no notes)');
    check('  · a series reads the strike nearest the price it was asked for',
      r.run.plots[2].values[10] === -4_000_000);
    check('  · ΔOI is the change since the previous bar, and na on the first',
      r.run.plots[3].values[0] === null && r.run.plots[3].values[10] === 2);
  }

  /* THE SIGN CONVENTION. Negative net GEX is call-dominant — `core/walls.ts`
     picks the call wall from `v < 0`. Written the intuitive way round,
     `slayer.heaviest_call` returns the put strike and every script built on
     it draws resistance under price. It did, for about ten minutes. */
  const h = evaluatePine('//@version=6\nindicator("h")\nplot(slayer.heaviest_call, "c")\nplot(slayer.heaviest_put, "p")', bars, withBook);
  check('heaviest_call is the CALL-dominant strike — the sign convention, not the intuitive one',
    h.ok && h.run.plots[0].values[10] === 100 && h.run.plots[1].values[10] === 95,
    h.ok ? `call ${h.run.plots[0].values[10]} · put ${h.run.plots[1].values[10]}` : h.message);

  /* No book behind the run means a slayer.* script FAILS, loudly. Returning
     a quiet `na` would draw an empty chart and blame nobody. */
  const bare = evaluatePine('//@version=6\nindicator("b")\nplot(slayer.netgex)', bars, {});
  check('without a book, a slayer.* script fails rather than drawing nothing',
    !bare.ok && /dealer book/i.test(bare.message), bare.ok ? '(it ran)' : bare.message.slice(0, 60));

  /* The book is aligned to the CHART's bars. Inside a fetch at another
     interval, the same index means a different bar, so it is refused
     statically rather than mis-served at run time. */
  const inFetch = compilePine('//@version=6\nindicator("f")\nplot(request.security(syminfo.tickerid, "60", slayer.netgex))');
  check('the book cannot be read inside a request.security at another interval',
    !inFetch.ok && inFetch.stage === 'unsupported' && inFetch.refusals.some(f => f.name === 'slayer.netgex'),
    !inFetch.ok && inFetch.stage === 'unsupported' ? inFetch.refusals.map(f => f.name).join(',') : '(compiled)');
}

/*
  ── a plot that is not a price ───────────────────────────────────────────

  An overlay chart has ONE vertical ruler and it is in dollars. A script that
  plots net dealer gamma — a number in the billions — onto it does not draw a
  line slightly out of view: it rescales the axis and every candle collapses
  into a thread. Two of the four shipped indicators did exactly that the
  first time they were switched on together, which is how this check exists.
*/
{
  const r = evaluatePine(`//@version=6
indicator("mix", overlay = true)
plot(ta.ema(close, 21), "ema")
plot(close * 1000000, "billions")
plot(0, "zero line")`, bars, {});
  check('a plot is measured against the bars to see whether it is a price', r.ok, r.ok ? '' : r.message);
  if (r.ok) {
    check('  · an EMA is a price and draws', r.run.plots[0].offScale === false);
    check('  · a number in the millions is not, and is held back', r.run.plots[1].offScale === true);
    check('  · nor is a zero line under a hundred-dollar tape', r.run.plots[2].offScale === true);
    check('  · and each one held back is named, with what to do instead',
      r.run.notes.filter(n => n.startsWith('plot ')).length === 2 &&
      r.run.notes.some(n => /rescale the whole chart/.test(n)),
      `${r.run.notes.filter(n => n.startsWith('plot ')).length} named`);
  }

  /*
    AND WHAT IT CANNOT SEPARATE, asserted so nobody later mistakes it for a
    bug. This proof's tape trades near $100, so an RSI's 0..100 readings sit
    genuinely inside the bars' range — no rule reading numbers alone can call
    that apart from a price, and the cost of being wrong here is a line the
    reader did not want rather than a chart they cannot read.
  */
  const osc = evaluatePine('//@version=6\nindicator("o", overlay = true)\nplot(ta.rsi(close, 14), "rsi")', bars, {});
  check('an oscillator over a same-magnitude tape is NOT caught, and that is the known limit',
    osc.ok && osc.run.plots[0].offScale === false,
    osc.ok ? `bars run ${Math.min(...bars.map(b => b.low)).toFixed(0)}–${Math.max(...bars.map(b => b.high)).toFixed(0)}` : osc.message);
}

/*
  ── bgcolor, and a threshold that travels ────────────────────────────────
*/
{
  const bg = evaluatePine('//@version=6\nindicator("bg", overlay = true)\nbgcolor(close > open ? color.new(color.green, 90) : na)', bars, {});
  check('bgcolor paints the ground behind the bars it was called on',
    bg.ok && bg.run.bands.filter(Boolean).length > 0 && bg.run.bands.some(b => b === null),
    bg.ok ? `${bg.run.bands.filter(Boolean).length} of ${bg.run.bands.length} bars` : bg.message);
  check('  · and the transparency Pine writes is the alpha that comes out',
    bg.ok && bg.run.bands.filter(Boolean).every(c => /^#[0-9a-f]{6}1a$/i.test(c as string)),
    bg.ok ? String(bg.run.bands.find(Boolean)) : '');

  /*
    `ta.percentrank` is the only threshold that means the same thing twice.
    Measured on this desk's own tape, "2,000 contracts" marks 3% of
    five-minute bars and 12% of fifteen-minute ones — so a script written
    with a fixed number means something different everywhere it is used.
  */
  const pr = evaluatePine('//@version=6\nindicator("pr")\nplot(ta.percentrank(close, 50), "r")', bars, {});
  check('ta.percentrank ranks a value against its own recent history', pr.ok, pr.ok ? '' : pr.message);
  if (pr.ok) {
    const v = pr.run.plots[0].values;
    check('  · na until the window fills, then bounded 0..100',
      v[48] === null && v.slice(50).every(x => x === null || (x >= 0 && x <= 100)));
    const rising = evaluatePine('//@version=6\nindicator("pr")\nplot(ta.percentrank(bar_index, 50), "r")', bars, {});
    check('  · a series that only rises ranks at the top of its window',
      rising.ok && rising.run.plots[0].values[100] === 100, rising.ok ? String(rising.run.plots[0].values[100]) : '');
  }
}

/*
  ── the shipped library, against a book made of known numbers ────────────

  `pine-library-proof.ts` runs all fifty against the DESK'S OWN tape and its
  real dealer book, which is the test that matters and the one that would
  catch a stale script. What is left here is the half that file cannot do:
  a book whose every number is chosen, so an assertion can be about the
  ANSWER rather than about whether anything was drawn.

  The sign convention is the one that has been got wrong before and is worth
  a fixture of its own — negative net gamma is CALL-dominant on this desk.
*/
{
  const feed = {
    book: bars.map((b, i) => ({
      netGex: i < 150 ? 1_000_000 : -1_000_000,
      callWall: 120, putWall: 80, flip: 100, supreme: 95, step: 5,
      strikes: [
        { strike: 95, value: 5_000_000, callOI: 1000 + i * 3, putOI: 500 + i },
        { strike: 100, value: -4_000_000, callOI: 2000, putOI: 700 },
      ],
      _b: b,
    })),
    now: { netDex: -1, netVex: 1, netVanna: 1, netCharm: 1, maxPain: 100, gammaPin: 99 },
  };
  const book = (expr: string) => {
    const r = evaluatePine(`//@version=6\nindicator("b")\nplot(${expr}, "v")`, bars,
      { timeframe: '5m', ticker: 'SPY', chartMinutes: 5, slayer: feed });
    if (!r.ok) throw new Error(`${r.stage}: ${r.message}`);
    return r.run.plots[0].values;
  };

  check('the corridor is the walls, and it is the width between them',
    book('slayer.wall_width')[200] === 40, String(book('slayer.wall_width')[200]));
  check('a strike carrying positive value is PUT-dominant, and negative is CALL',
    book('slayer.heaviest_call')[200] === 100 && book('slayer.heaviest_put')[200] === 95,
    `call ${book('slayer.heaviest_call')[200]} · put ${book('slayer.heaviest_put')[200]}`);
  /* POSITIVE net gamma is put-dominant, which is dealers SHORT gamma, which
     is hedging WITH the move — amplifying. Negative is the mirror. It is
     written down in `builtins.ts` and asserted here because it is the one
     thing in this namespace that has been got backwards before, in both
     directions, and a chart drawn on the wrong sense of it looks fine. */
  check('positive net gamma is the amplifying regime, negative the absorbing one',
    book('slayer.amplifying ? 1 : 0')[140] === 1 && book('slayer.absorbing ? 1 : 0')[140] === 0
      && book('slayer.amplifying ? 1 : 0')[200] === 0 && book('slayer.absorbing ? 1 : 0')[200] === 1);
  check('open interest is read at the strike nearest the price asked for',
    book('slayer.call_oi(96)')[200] === 1000 + 200 * 3, String(book('slayer.call_oi(96)')[200]));

  /* The catalogue's own shape. The RUNNING of it is the other proof's job —
     these are the claims a reader sees in the picker before anything runs. */
  check('the shipped library is a library, not a demo',
    LIBRARY.length >= 90, String(LIBRARY.length));
  check('  · with both halves carrying real weight',
    LIBRARY.filter(s => s.kind === 'classic').length >= 60
      && LIBRARY.filter(s => s.kind === 'slayer').length >= 25);
  check('  · each with a name, a shelf and a line saying what it shows',
    LIBRARY.every(s => s.name.length > 0 && s.group.length > 0 && s.blurb.length > 40));
}

/*
  ── the language, second pass ────────────────────────────────────────────

  Every construct here was found by `pine-conformance.ts` — a corpus of
  small scripts, one per feature, run against this engine to answer "will it
  run what people paste in" with a number. Eight of them came back as SYNTAX
  ERRORS on valid Pine, which is the worst failure an engine of this shape
  can have: it tells a reader their script is malformed when it is not, and
  they have no way to tell that from a typo of their own.
*/
{
  /* `sum += close` lexed as `sum`, `+`, `= close`, so a for-loop failed on
     its own second line with "Unexpected =". Five operators, one desugar. */
  const comp = evaluatePine(`//@version=6
indicator("c")
a = 10.0
a += 5
a -= 3
a *= 2
a /= 4
a %= 4
plot(a)`, bars, {});
  check('compound assignment — the shape every accumulator is written in',
    comp.ok && comp.run.plots[0].values[5] === 2, comp.ok ? String(comp.run.plots[0].values[5]) : comp.message);

  const loop = evaluatePine(`//@version=6
indicator("l")
sum = 0.0
for i = 0 to 4
    sum += close[i]
plot(sum / 5)`, bars, {});
  check('  · which is what a for-loop average is made of',
    loop.ok && Math.abs((loop.run.plots[0].values[10] as number) - (bars.slice(6, 11).reduce((n, b) => n + b.close, 0) / 5)) < 1e-9,
    loop.ok ? String(loop.run.plots[0].values[10]) : loop.message);

  /* `switch` in both shapes — with a subject, and as a chain of conditions. */
  const sw = evaluatePine(`//@version=6
indicator("s")
x = 2
v = switch x
    1 => 10
    2 => 20
    => 30
w = switch
    close > open => 1
    close < open => -1
    => 0
plot(v + w)`, bars, {});
  check('switch, both the subject form and the bare one',
    sw.ok && sw.run.plots[0].values.every(v => v === 21 || v === 19 || v === 20),
    sw.ok ? `saw ${[...new Set(sw.run.plots[0].values)].join(',')}` : sw.message);

  const fi = evaluatePine(`//@version=6
indicator("f")
a = array.from(1.0, 2.0, 3.0)
s = 0.0
for v in a
    s += v
t = 0.0
for [i, v] in a
    t += i * v
plot(s * 100 + t)`, bars, {});
  check('for…in, over values and over index/value pairs',
    fi.ok && fi.run.plots[0].values[5] === 608, fi.ok ? String(fi.run.plots[0].values[5]) : fi.message);

  const typed = evaluatePine('//@version=6\nindicator("t")\nf(float x, int n) => x * n\nplot(f(close, 2))', bars, {});
  check('a function whose parameters wear their types',
    typed.ok && typed.run.plots[0].values[5] === bars[5].close * 2, typed.ok ? '' : typed.message);

  /*
    A GENERIC TYPE ARGUMENT has to PARSE even though the type behind it is
    refused, or `matrix.new<float>(2,2)` reports a syntax error — and "your
    script is malformed" and "this engine has no matrices" are very
    different things to tell someone.
  */
  const gen = evaluatePine('//@version=6\nindicator("g")\nm = matrix.new<float>(2, 2)\nmatrix.set(m, 0, 0, close)\nplot(matrix.get(m, 0, 0))', bars, {});
  check('a generic type argument parses, and the matrix behind it works',
    gen.ok && gen.run.plots[0].values[5] === bars[5].close,
    gen.ok ? String(gen.run.plots[0].values[5]) : gen.message);
  /* And where the generic wraps something with no feed behind it, the
     refusal is BY NAME rather than a syntax error about the angle bracket. */
  const genOut = compilePine('//@version=6\nindicator("g")\nplot(request.financial(syminfo.tickerid, "X", "FQ"))');
  check('  · and what has no feed behind it still refuses by name',
    !genOut.ok && genOut.stage === 'unsupported' && genOut.refusals.some(f => f.name.startsWith('request.')),
    !genOut.ok && genOut.stage === 'unsupported' ? genOut.refusals.map(f => f.name).join(',') : 'compiled')
}

/*
  ── the outputs a chart script is actually written with ──────────────────
*/
{
  const r = evaluatePine(`//@version=6
indicator("o", overlay = true)
a = plot(ta.ema(close, 5), "fast")
b = plot(ta.ema(close, 20), "slow")
fill(a, b, color = color.new(color.blue, 90))
hline(100, "ref", color = color.gray)
barcolor(close > open ? color.green : na)
bgcolor(close < open ? color.new(color.red, 90) : na)`, bars, {});
  check('fill, hline, barcolor and bgcolor all run together', r.ok, r.ok ? '' : `${r.message}${r.line ? ' @' + r.line : ''}`);
  if (r.ok) {
    check('  · fill names the two plots it lies between, by call site',
      r.run.fills.length === 1 && r.run.plots.some(p => p.id === r.run.fills[0].a) && r.run.plots.some(p => p.id === r.run.fills[0].b),
      `${r.run.fills.length} fill(s)`);
    check('  · hline is a plot of a constant, so it draws where a level draws',
      r.run.plots.some(p => p.title === 'ref' && p.values.every(v => v === 100)));
    check('  · barcolor claims the bars it means and no others',
      r.run.barColors.some(Boolean) && r.run.barColors.some(c => c === null),
      `${r.run.barColors.filter(Boolean).length} of ${r.run.barColors.length}`);
  }

  /* `ta.pivothigh` was refused for needing bars that have not happened. Half
     true, and the wrong half: Pine reports the pivot `right` bars LATER,
     once the bars confirming it have printed. Nothing is read early. */
  /*
    ON A TAPE WITH PIVOTS IN KNOWN PLACES, not on this file's drifting one.

    The drifting tape has NO strict pivots at all — every seven-bar window on
    a cumulative walk is monotone, hand-counted zero — so counting them there
    measures the fixture and not the engine. A zigzag with a peak every eight
    bars puts them exactly where arithmetic says, and the assertion can name
    the bar each one lands on.
  */
  const zig: Candle[] = [];
  for (let i = 0; i < 64; i++) {
    const phase = i % 8;
    /* A TRIANGLE WAVE: 100 101 102 103 [104] 103 102 101, so the peak at
       phase 4 really is the highest of its neighbourhood. The first attempt
       used `phase === 4 ? 6 : phase`, which put a 107 at phase 7 — higher
       than the peak it was meant to frame. */
    const h = 100 + (phase <= 4 ? phase : 8 - phase);
    zig.push({ time: 1_760_000_000 + i * 300, open: h - 1, high: h, low: h - 2, close: h - 0.5, volume: 100 });
  }
  const piv = evaluatePine('//@version=6\nindicator("p")\nplot(ta.pivothigh(high, 3, 3))', zig, {});
  check('ta.pivothigh reports a pivot once the bars confirming it exist', piv.ok, piv.ok ? '' : piv.message);
  if (piv.ok) {
    const v = piv.run.plots[0].values;
    const hits = v.map((x, i) => (x === null ? -1 : i)).filter(i => i >= 0);
    const want: number[] = [];
    for (let peak = 4; peak + 3 < zig.length; peak += 8) want.push(peak + 3);
    check('  · at every peak, and nowhere else', hits.join(',') === want.join(','), `${hits.join(',')} vs ${want.join(',')}`);
    check('  · reported LATE, carrying the high from `right` bars back',
      hits.every(i => v[i] === 104 && Math.abs((v[i] as number) - zig[i - 3].high) < 1e-9));
    check('  · and na on every bar that did not complete one',
      v.filter(x => x === null).length === zig.length - want.length);
  }
}

/*
  ── a misspelling and a missing feature are different problems ───────────

  They look identical in a refusal list and need opposite responses: one is
  a typo to fix, the other a wall to work around. Bounded at two edits and
  to the same namespace, because a WRONG suggestion costs a reader more
  than no suggestion at all.
*/
{
  const cases: [string, string | null][] = [
    ['ta.emaa', 'ta.ema'],
    ['ta.crossundr', 'ta.crossunder'],
    ['math.abz', 'math.abs'],
    ['slayer.callwal', 'slayer.callwall'],
    ['clse', 'close'],
    ['ta.zzzzzzzz', null],
  ];
  let right = 0;
  for (const [written, want] of cases) {
    const got = didYouMean(written);
    if (got === want) right += 1;
    else check(`  · ${written} → ${want ?? 'nothing'}`, false, `got ${got ?? 'nothing'}`);
  }
  check('near-miss names suggest the one this engine has', right === cases.length, `${right}/${cases.length}`);
  check('  · and a name nothing is close to suggests nothing rather than guessing',
    didYouMean('ta.zzzzzzzz') === null);

  const r = compilePine('//@version=6\nindicator("t")\nplot(ta.emaa(close, 9))');
  check('  · the suggestion rides on the refusal the editor prints',
    !r.ok && r.stage === 'unsupported' && r.refusals[0].didYouMean === 'ta.ema',
    !r.ok && r.stage === 'unsupported' ? String(r.refusals[0].didYouMean) : '');

  /* A construct that is deliberately refused is spelt correctly — offering
     a near-miss there sends a reader chasing a typo that is not one. */
  const deliberate = compilePine('//@version=6\nindicator("t")\nplot(request.financial(syminfo.tickerid, "X", "FQ"))');
  check('  · a deliberate refusal carries no suggestion, because it is not a typo',
    !deliberate.ok && deliberate.stage === 'unsupported' && deliberate.refusals.every(f => f.didYouMean === undefined));
}

/*
  ── the shapes modern Pine is written in ─────────────────────────────────

  Types, methods and enums are how a v5/v6 script organises anything bigger
  than a moving average, and the conformance corpus found all three
  missing — the first two as SYNTAX ERRORS, which is the failure that reads
  as the reader's mistake rather than the engine's.
*/
{
  const udt = evaluatePine(`//@version=6
type Point
    float x = 0.0
    float y = 0.0
method away(Point self) => math.sqrt(self.x * self.x + self.y * self.y)
indicator("t", overlay = true)
p = Point.new(3.0, 4.0)
var Point held = Point.new()
held.x := held.x + 1
plot(p.away() + held.x)`, bars, {});
  check('a type, its constructor, a field write and a method on it', udt.ok, udt.ok ? '' : `${udt.message}${udt.line ? ' @' + udt.line : ''}`);
  if (udt.ok) {
    /* 3-4-5, so `away()` is 5; `held.x` counts the bars. */
    check('  · the method sees its receiver, and a var of a type persists',
      udt.run.plots[0].values[0] === 6 && udt.run.plots[0].values[9] === 15,
      `${udt.run.plots[0].values[0]} then ${udt.run.plots[0].values[9]}`);
  }

  const en = evaluatePine(`//@version=6
enum Side
    up
    down
indicator("t", overlay = true)
s = close > open ? Side.up : Side.down
plot(s == Side.up ? 1 : 0)`, bars, {});
  check('an enum, and its members compared as values',
    en.ok && en.run.plots[0].values.every(v => v === 0 || v === 1) && new Set(en.run.plots[0].values).size === 2,
    en.ok ? `${[...new Set(en.run.plots[0].values)].join(',')}` : en.message);

  const method = evaluatePine('//@version=6\nmethod half(float self) => self / 2\nindicator("t")\nplot(close.half())', bars, {});
  check('a method on a BUILT-IN value, where the receiver is never in scope',
    method.ok && Math.abs((method.run.plots[0].values[5] as number) - bars[5].close / 2) < 1e-9,
    method.ok ? '' : method.message);

  const bad = evaluatePine(`//@version=6
type Point
    float x = 0.0
indicator("t")
p = Point.new(1)
plot(p.z)`, bars, {});
  check('  · and a field the type does not have fails by NAME rather than as na',
    !bad.ok && /has no field "z"/.test(bad.message), bad.ok ? '(it ran)' : bad.message.slice(0, 70));
}

/*
  ── the collections, which are arrays underneath ─────────────────────────
*/
{
  const m = evaluatePine(`//@version=6
indicator("m")
var mx = matrix.new<float>(2, 3, 0.0)
matrix.set(mx, 1, 2, close)
var mp = map.new<string, float>()
map.put(mp, "k", close * 2)
plot(matrix.get(mx, 1, 2) + map.get(mp, "k") + matrix.rows(mx) + matrix.columns(mx) + map.size(mp))`, bars, {});
  check('matrix and map, both built on the array the engine already had', m.ok, m.ok ? '' : m.message);
  if (m.ok) {
    check('  · reading back what was written, with the shape it declared',
      Math.abs((m.run.plots[0].values[5] as number) - (bars[5].close * 3 + 6)) < 1e-9,
      String(m.run.plots[0].values[5]));
  }
  /* An index off the matrix is `na`, not a wrong cell — a silent wrap would
     hand back a neighbour's value and nothing would look wrong. */
  const off = evaluatePine('//@version=6\nindicator("m")\nvar mx = matrix.new<float>(2, 2, 1.0)\nplot(na(matrix.get(mx, 5, 5)) ? -1 : 0)', bars, {});
  check('  · an index off the matrix reads na rather than a neighbour',
    off.ok && off.run.plots[0].values[3] === -1, off.ok ? String(off.run.plots[0].values[3]) : off.message);
}

/*
  ── the outputs that were still missing ──────────────────────────────────
*/
{
  const r = evaluatePine(`//@version=6
indicator("o", overlay = true)
plotcandle(open, high, low, close, "own bars")
plotarrow(close > open ? 1 : -1, "arrows")
var line a = na
var line b = na
if barstate.islast
    a := line.new(bar_index - 5, high, bar_index, high)
    b := line.new(bar_index - 5, low, bar_index, low)
    linefill.new(a, b, color.new(color.blue, 90))
plot(close)`, bars, {});
  check('plotcandle, plotarrow and linefill run together', r.ok, r.ok ? '' : `${r.message}${r.line ? ' @' + r.line : ''}`);
  if (r.ok) {
    check('  · the script\'s own bars carry four series and a colour',
      r.run.candles.length === 1 && r.run.candles[0].close.filter(v => v !== null).length === bars.length);
    check('  · plotarrow gives one direction per sign, and says the LENGTH is lost',
      r.run.shapes.length === 2 && r.run.notes.some(n => n.startsWith('plotarrow')),
      r.run.shapes.map(sh => `${sh.shape}:${sh.at.length}`).join(' '));
    check('  · linefill names the two line objects it lies between',
      r.run.lineFills.length === 1 && r.run.drawings.some(d => d.what === 'line' && d.id === r.run.lineFills[0].a));
  }

  /* `varip` is `var` on a closed bar — and the run says so, because a script
     counting ticks inside a bar reads differently here. */
  const vp = evaluatePine('//@version=6\nindicator("v")\nvarip int n = 0\nn := n + 1\nplot(n)', bars, {});
  check('varip runs as var, and the run says what that costs',
    vp.ok && vp.run.plots[0].values[9] === 10 && vp.run.notes.some(n => n.startsWith('varip')),
    vp.ok ? String(vp.run.plots[0].values[9]) : vp.message);
}

/*
  ── the finer bars inside this one ───────────────────────────────────────

  `request.security` asks what had already CLOSED. This asks the opposite —
  what happened INSIDE — and the answer is a collection. Only bars that
  closed within this one are included, so nothing arrives from a bar the
  chart has not reached.
*/
{
  const roll = (mins: number): Candle[] => {
    const step = mins * 60;
    const out: Candle[] = [];
    for (const b of bars) {
      const k = Math.floor(b.time / step) * step;
      const last = out[out.length - 1];
      if (!last || last.time !== k) out.push({ ...b, time: k });
      else { last.high = Math.max(last.high, b.high); last.low = Math.min(last.low, b.low); last.close = b.close; }
    }
    return out;
  };
  const coarse = roll(15);
  const lower = evaluatePine(
    '//@version=6\nindicator("l")\na = request.security_lower_tf(syminfo.tickerid, "5", close)\nplot(array.size(a))',
    coarse,
    { timeframe: '15m', ticker: 'SPY', chartMinutes: 15, resolveBars: roll }
  );
  check('request.security_lower_tf returns the finer bars inside this one', lower.ok, lower.ok ? '' : lower.message);
  if (lower.ok) {
    const sizes = lower.run.plots[0].values.filter(v => v !== null) as number[];
    check('  · three five-minute bars to a fifteen-minute one',
      sizes.length > 5 && sizes.slice(1, -1).every(n => n === 3),
      `saw ${[...new Set(sizes)].sort().join(',')}`);
  }
}

// ── a plot's colour is a series, not a decision made on bar zero ─────────
{
  /*
    EVERY MACD HISTOGRAM EVER WRITTEN is coloured `hist >= 0 ? green : red`,
    and every squeeze, every volume-spike bar and every trend ribbon does the
    same thing. Keeping one colour for the series does not make the picture
    slightly wrong: the sign change is the only thing a histogram is read
    for, so losing it loses the indicator.

    Both spellings are checked, because they are equally common and the
    positional one was the one that broke — the colour was read out of the
    argument list once, at construction, which froze bar zero's answer.
  */
  const named = run(`//@version=6
indicator("named", overlay = false)
d = close - close[1]
plot(d, "delta", color = d >= 0 ? color.green : color.red)`);
  const lane = named.plots[0].colors;
  check('a colour that varies bar to bar comes back as a lane', Array.isArray(lane));
  if (Array.isArray(lane)) {
    const seen = new Set(lane.filter(Boolean) as string[]);
    check('  · and it carries BOTH colours, not the last one repeated', seen.size === 2, [...seen].join(' '));
    /* The lane has to line up with the values it colours, or the histogram
       changes colour on the wrong bar — which is worse than one colour. */
    const wrong = named.plots[0].values.findIndex((v, i) =>
      v === null || lane[i] === null ? false : (v >= 0) !== (lane[i] === '#089981' || (lane[i] as string).toLowerCase().includes('green'))
    );
    check('  · and it is aligned to the bar it belongs to', wrong === -1, wrong === -1 ? '' : `bar ${wrong}`);
  }

  const positional = run(`//@version=6
indicator("positional", overlay = false)
d = close - close[1]
plot(d, "delta", d >= 0 ? color.green : color.red)`);
  const pl = positional.plots[0].colors;
  check('the positional third argument is read every bar too',
    Array.isArray(pl) && new Set((pl as (string | null)[]).filter(Boolean)).size === 2);

  /* And the cheap case stays cheap: a plot that never changes colour hands
     back nothing, so the chart passes one colour instead of an array
     repeating the same string for every bar on the tape. */
  const flat = run('//@version=6\nindicator("flat")\nplot(close, "c", color.blue)');
  check('a plot of one colour carries no lane at all', flat.plots[0].colors === null);
}

// ── an oscillator is not refused, it is given a pane ─────────────────────
{
  /*
    `overlay = false` IS NOT A REFUSAL. It is a script saying its units are
    not dollars — RSI is 0..100, MACD swings around zero — and the answer is
    a pane below the tape with its own ruler, which is what TradingView does
    with the same declaration and where this desk's own RSI already lives.

    The engine's part of that is to STOP MEASURING those plots against the
    candles. It briefly did, and the result was every plot in a MACD held
    back with a note claiming it would "rescale the whole chart" — a chart
    it does not share. The pane itself is asserted in the browser sweep.
  */
  const osc = run(`//@version=6
indicator("osc", overlay = false)
plot(ta.rsi(close, 14) * 1000000, "huge")`);
  check('a non-overlay plot is never held back for not being a price',
    osc.plots.every(p => !p.offScale));
  check('  · and the run says nothing about rescaling a chart it does not share',
    !osc.notes.some(n => /rescale/i.test(n)), osc.notes.join(' | '));

  /* The guard still bites where it was built to: on the price pane. */
  const over = run('//@version=6\nindicator("over", overlay = true)\nplot(close * 1000000, "huge")');
  check('the same plot on the tape IS held back', over.plots[0].offScale);
}

// ── the clock: the two bugs that break a script without breaking it ──────
{
  /*
    `time("D")` IS THE OPENING TIME OF THE DAY THIS BAR SITS IN, and every
    session-anchored thing ever written turns on it:

        newSession = ta.change(time("D")) != 0

    It used to return the BAR's own timestamp, which changes on every bar. A
    session VWAP written that way resets each bar and silently becomes hlc3;
    an opening range never closes; a daily accumulator counts one bar. None
    of that errors, none of it draws nothing, and nothing on the chart says a
    word — which is why it is pinned here.
  */
  const clock = run(`//@version=6
indicator("clock", overlay = false)
plot(ta.change(time("D")) != 0 ? 1 : 0, "day")
plot(ta.change(time("W")) != 0 ? 1 : 0, "week")
plot(ta.change(time("60")) != 0 ? 1 : 0, "hour")
plot(timeframe.in_seconds(), "seconds")`);
  const total = (title: string) => {
    const p = clock.plots.find(x => x.title === title);
    return (p?.values.filter(v => v !== null) as number[]).reduce((a, b) => a + b, 0);
  };
  /* The fixture is 300 five-minute bars at 300s — 25 hours, spanning two
     calendar days in New York and one week boundary at most. */
  const days = total('day');
  const hours = total('hour');
  check('time("D") changes once a day, not once a bar',
    days >= 1 && days <= 4, `${days} changes over ${bars.length} bars`);
  check('time("60") changes once an hour', hours >= 20 && hours <= 30, `${hours} changes`);
  check('  · and an hour holds more bars than a day does not', hours > days);

  /*
    `timeframe.in_seconds()` READ THE DESK'S OWN SPELLING AS PINE'S. Pine
    writes five minutes "5" and a month "M"; this desk writes "5m". Fed to a
    Pine-format parser that is FIVE MONTHS, and the answer came back
    12,960,000 seconds for a five-minute chart — so any script sizing a
    window by it was out by a factor of forty-three thousand.
  */
  const secs = clock.plots.find(p => p.title === 'seconds')?.values.find(v => v !== null);
  check('timeframe.in_seconds() knows a 5-minute chart is 300 seconds', secs === 300, String(secs));

  const named = evaluatePine('//@version=6\nindicator("x")\nplot(timeframe.in_seconds("D"))', bars);
  check('  · and a PINE interval string still parses as Pine',
    named.ok && named.run.plots[0].values.find(v => v !== null) === 86400);
}

// ── the engine is honest about itself in its own source ──────────────────
{
  const idx = readFileSync('src/data/pine/index.ts', 'utf8');
  check('the entry point says what is NOT implemented', /request\.security/.test(idx) && /refused/i.test(idx.toLowerCase()));
  const an = readFileSync('src/data/pine/analyse.ts', 'utf8');
  check('the analyser states why refusing beats approximating', /approximat/i.test(an));
  const bi = readFileSync('src/data/pine/builtins.ts', 'utf8');
  check('the seeding of every moving average is written down where it lives',
    /alpha = 2\/\(len\+1\)/.test(bi) && /SMA of the first/.test(bi));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
