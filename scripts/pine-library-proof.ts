/*
  THE FIFTY SHIPPED INDICATORS, RUN.

  A catalogue is the easiest thing in this codebase to let rot. The sources
  live in `library.ts`; the engine underneath them changes every week; and
  nothing about a stale script announces itself — it compiles, it runs, and
  it draws nothing, which on a chart is indistinguishable from an indicator
  that had nothing to say about today.

  So each one is run against the DESK'S OWN BARS AND THE DESK'S OWN BOOK —
  the same `Simulator` tape the chart draws and the same `buildSlayerFeed`
  the chart hands the engine — and asserted to put something on the chart.
  Not "compiles". Drew.

  THE OTHER HALF IS THE SPLIT. Twenty-five of these have to be impossible
  anywhere else, and the only thing that makes them so is that they read the
  dealer book. A "slayer" entry that never touches `slayer.*` is a classic
  indicator wearing the wrong label and quietly weakens the claim the whole
  library is built on, so that is checked too.
*/
import Simulator from '../src/core/simulator';
import { evaluatePine } from '../src/data/pine/index';
import { buildSlayerFeed } from '../src/data/slayerFeed';
import { LIBRARY } from '../src/data/pine/library';
import type { Candle } from '../src/types/market';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const agg = (src: readonly Candle[], mins: number): Candle[] => {
  const step = mins * 60;
  const out: Candle[] = [];
  for (const b of src) {
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

const base = Simulator.getCandles('SPY') ?? [];
const bars = agg(base, 5);

/*
  A SYNTHETIC OPTION TAPE OVER THE LAST FEW HOURS, which is how far the real
  one reaches. Handing the proof a full-history tape would test coverage the
  desk does not have; handing it none would fail every flow indicator for
  behaving correctly. This is the shape the app actually presents: recent
  bars carry premium, older ones carry na.
*/
const TAPE_BARS = 48;
const prints = bars.slice(-TAPE_BARS).flatMap((b, k) => {
  const lean = Math.sin(k / 6);
  return [
    { right: 'C', premium: 400_000 * (1 + lean), at: b.time * 1000 + 60_000, ticker: 'SPY' },
    { right: 'P', premium: 400_000 * (1 - lean), at: b.time * 1000 + 90_000, ticker: 'SPY' },
  ];
}) as never[];

const feed = buildSlayerFeed('SPY', bars, 5, { prints }) ?? undefined;

check('PREMISE: there is a tape to run against', bars.length > 200, `${bars.length} bars`);
check('PREMISE: there is a dealer book behind it', !!feed && feed.book.some(Boolean),
  `${feed?.book.filter(Boolean).length ?? 0} of ${bars.length} bars carry one`);
check('PREMISE: the desk lanes are filled — the tape, realised vol',
  !!feed?.desk && feed.desk.some(d => d.callPrem !== null) && feed.desk.some(d => d.rv !== null),
  `${feed?.desk?.filter(d => d.callPrem !== null).length ?? 0} bars of tape, ${feed?.desk?.filter(d => d.rv !== null).length ?? 0} of realised vol`);
check("PREMISE: and the session's levels are there",
  !!feed?.levels && feed.levels.vpoc !== null && feed.levels.pdh !== null,
  `vpoc ${feed?.levels?.vpoc?.toFixed(2)} · pdh ${feed?.levels?.pdh?.toFixed(2)}`);
/* THE TAPE'S REACH IS BOUNDED, and the proof says so rather than assuming a
   full history it will never have in the app. */
check('  · with the tape reaching only the recent bars, as it does live',
  (feed?.desk?.filter(d => d.callPrem !== null).length ?? 0) < bars.length / 2,
  `${feed?.desk?.filter(d => d.callPrem !== null).length ?? 0} of ${bars.length}`);

let slowest = 0;
let slowestName = '';
const alertRuns: { script: string; title: string; fired: number }[] = [];
/*
  INDICATORS THAT PUT NOTHING ON THE CHART BUT OBJECTS.

  `drew` below counts line/label/box objects, which is right — an order-block
  script is boxes and nothing else. But it is also the loophole Opening Range
  Breakout sat in for weeks: no plot carried a value, no mark was placed, and
  twenty empty boxes counted as a picture. Kept separately so the alert check
  can ask the sharper question — silent on the chart AND silent in its alerts.
*/
const silent = new Set<string>();
for (const s of LIBRARY) {
  const t0 = Date.now();
  const r = evaluatePine(s.source, bars, {
    timeframe: '5m', ticker: 'SPY', chartMinutes: 5, slayer: feed,
    resolveBars: m => agg(base, m),
  });
  const ms = Date.now() - t0;
  if (ms > slowest) { slowest = ms; slowestName = s.name; }
  if (!r.ok) {
    const detail = r.refusals?.length
      ? r.refusals.map(x => `line ${x.line} ${x.name}: ${x.why}`).join(' | ')
      : `${r.message}${r.line ? ` @line ${r.line}` : ''}`;
    check(s.name, false, `[${r.stage}] ${detail}`);
    continue;
  }
  const run = r.run;
  const plots = run.plots.filter(p => !p.offScale && p.values.some(v => v !== null)).length;
  const marks = run.shapes.reduce((n, x) => n + x.at.length, 0);
  const drew = plots > 0 || run.drawings.length > 0 || marks > 0 || run.bands.some(Boolean)
    || run.barColors.some(Boolean) || run.candles.length > 0 || run.fills.length > 0;
  check(s.name, drew, drew
    ? `${ms}ms · ${[
        `${plots}/${run.plots.length} plots`,
        run.drawings.length ? `${run.drawings.length} objects` : '',
        marks ? `${marks} marks` : '',
      ].filter(Boolean).join(', ')}`
    : `drew nothing — ${plots}/${run.plots.length} plots, ${run.drawings.length} objects, ${marks} marks${run.notes.length ? ` · ${run.notes.join(' | ')}` : ''}`);

  /* WHAT THE ALERTS DID, not how many were declared — see below. */
  for (const a of run.alerts) alertRuns.push({ script: s.name, title: a.title, fired: a.fired });
  if (plots === 0 && marks === 0 && !run.bands.some(Boolean) && !run.barColors.some(Boolean)
      && run.candles.length === 0 && run.fills.length === 0) silent.add(s.name);

  /* The declared pane has to match what the script actually asked for, or
     the picker tells a reader an oscillator will sit on their candles. */
  if (drew && run.overlay !== s.overlay) {
    check(`  · ${s.name} is filed under the pane it actually uses`, false,
      `catalogue says ${s.overlay ? 'overlay' : 'own pane'}, the script says ${run.overlay ? 'overlay' : 'own pane'}`);
  }
}

// ── the halves are what they claim to be ─────────────────────────────────
{
  const classic = LIBRARY.filter(s => s.kind === 'classic');
  const slayer = LIBRARY.filter(s => s.kind === 'slayer');
  check('the classics cover the standard list', classic.length >= 60, String(classic.length));
  check('and there are two dozen that exist nowhere else', slayer.length >= 25, String(slayer.length));

  /* THE CLAIM IS LOAD-BEARING. "Impossible anywhere else" is true only of a
     script that reads the book; one that does not is an ordinary indicator
     filed under the wrong half. */
  const notReally = slayer.filter(s => !/\bslayer\./.test(s.source));
  check('every one of those actually reads the dealer book', notReally.length === 0,
    notReally.map(s => s.name).join(', '));

  /* And the other way: a classic that quietly needs the book would break for
     any reader on a symbol the desk has no chain for. */
  const leaky = classic.filter(s => /\bslayer\./.test(s.source));
  check('and no classic secretly depends on it', leaky.length === 0, leaky.map(s => s.name).join(', '));

  const ids = new Set(LIBRARY.map(s => s.id));
  check('every id is unique — the store remembers them', ids.size === LIBRARY.length);
  const unnamed = LIBRARY.filter(s => !s.blurb || s.blurb.length < 20);
  check('every one says what it shows', unnamed.length === 0, unnamed.map(s => s.id).join(', '));
}

// ── the alerts these ship with can actually fire ─────────────────────────
/*
  AN ALERT NOBODY CAN EVER RECEIVE is the quietest bug a library can carry.
  Nothing is missing from the chart — the picture is complete and correct —
  and a reader who arms the alert simply waits forever.

  The engine used to make this unfindable: `alertcondition` was registered on
  the first bar and its condition never evaluated again, so an alert existed
  as a title and nothing else. Reading it on every bar turned the question
  into one this proof can ask, and asking it found Opening Range Breakout
  with both alerts dead — because it drew no opening range at all, on a tape
  whose bars all fell outside market hours.

  WHY THIS IS A BUDGET AND NOT A LIST. The first version of this check named
  the quiet ones exactly and failed if the set changed. That set is a fact
  about ONE DAY'S TAPE — the walk is re-seeded per calendar day — so the
  check failed the first time the tape got livelier and three of the four
  came alive. A proof that fails when the product improves is a proof that
  will be edited until it says nothing. What is stable is the budget and the
  SHAPE of a real failure, so that is what is asserted, and the quiet ones
  are named in the output every run so drift is visible without being fatal.
*/
{
  const withAlerts = new Map<string, { title: string; fired: number }[]>();
  for (const a of alertRuns) {
    const list = withAlerts.get(a.script) ?? [];
    list.push({ title: a.title, fired: a.fired });
    withAlerts.set(a.script, list);
  }
  check('PREMISE: the shipped indicators declare alerts at all', alertRuns.length > 40,
    `${alertRuns.length} conditions across ${withAlerts.size} indicators`);

  const quiet = alertRuns.filter(a => a.fired === 0);
  const BUDGET = Math.ceil(alertRuns.length * 0.08);
  check(`all but a handful of the shipped alerts fire on a month of tape`,
    quiet.length <= BUDGET,
    quiet.length
      ? `${alertRuns.length - quiet.length}/${alertRuns.length} fired · quiet: ${quiet.map(a => `${a.script} :: ${a.title}`).join(' | ')}`
      : `all ${alertRuns.length} fired`);

  /*
    THE SHAPE OF A REAL ONE. A threshold set past anything a given month did
    is ordinary and harmless. An indicator that draws NOTHING and whose every
    alert is also dead is the other thing entirely — it is switched on, it
    occupies a row in the picker, and it does not work. That was Opening
    Range Breakout exactly, and it passed this proof for weeks because the
    empty boxes it left behind counted as having drawn something.
  */
  const dead = [...withAlerts.entries()]
    .filter(([name, list]) => list.every(x => x.fired === 0) && silent.has(name))
    .map(([name]) => name);
  check('and no indicator is silent on the chart AND silent in its alerts',
    dead.length === 0, dead.length ? dead.join(', ') : `${withAlerts.size} checked`);
}

/* A LIBRARY IS A BUDGET. The chart re-runs enabled scripts live, so one slow
   entry is a frozen tab rather than a slow test — this is the number that
   caught `time("D")` costing an Intl format per bar. */
check(`the slowest of the ${LIBRARY.length} stays under 400ms — ${slowestName} at ${slowest}ms`, slowest < 400);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
