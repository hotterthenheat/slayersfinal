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
const feed = buildSlayerFeed('SPY', bars, 5) ?? undefined;

check('PREMISE: there is a tape to run against', bars.length > 200, `${bars.length} bars`);
check('PREMISE: there is a dealer book behind it', !!feed && feed.book.some(Boolean),
  `${feed?.book.filter(Boolean).length ?? 0} of ${bars.length} bars carry one`);

let slowest = 0;
let slowestName = '';
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
  check('twenty-five classics', classic.length === 25, String(classic.length));
  check('twenty-five that exist nowhere else', slayer.length === 25, String(slayer.length));

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

/* A LIBRARY IS A BUDGET. The chart re-runs enabled scripts live, so one slow
   entry is a frozen tab rather than a slow test — this is the number that
   caught `time("D")` costing an Intl format per bar. */
check(`the slowest of the fifty stays under 400ms — ${slowestName} at ${slowest}ms`, slowest < 400);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
