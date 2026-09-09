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

  const dnf = compilePine(`//@version=6
indicator("MTF", overlay = true)
[dOpen, pdHigh] = request.security(syminfo.tickerid, "D", [open, high[1]], lookahead = barmerge.lookahead_on)
var float[] store = array.new_float(20, na)
eLine = line.new(bar_index, close, bar_index + 1, close)
label.new(bar_index, close, "entry")
table.cell(tbl, 0, 0, "x")
plot(ta.ema(close, 21))`);
  check('a real multi-timeframe script is refused, not approximated', !dnf.ok && dnf.stage === 'unsupported');
  if (!dnf.ok && dnf.stage === 'unsupported') {
    const names = dnf.refusals.map(f => f.name);
    /* `request.security` on the chart's OWN symbol is served now, so what
       stops this script is the rest of it: the lookahead it asks for, the
       arrays, and the drawing objects. The list moved when the engine grew,
       which is the assertion doing its job. */
    check('  · naming every construct behind it',
      ['barmerge.lookahead_on', 'array.new_float', 'line.new', 'label.new', 'table.cell'].every(n => names.includes(n)),
      names.join(' · '));
    check('  · each at the line it appears on', dnf.refusals.every(f => f.line > 0));
  }

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
  const ahead2 = compilePine('//@version=6\nindicator("t")\nplot(request.security(syminfo.tickerid, "D", open, lookahead = barmerge.lookahead_on))');
  check('lookahead_on is refused — a bar is never read before it closes',
    !ahead2.ok && ahead2.stage === 'unsupported' && ahead2.refusals.some(f => f.name.includes('lookahead_on')));
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
