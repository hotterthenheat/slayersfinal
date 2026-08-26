/*
  Acceptance test for KEY LEVEL SELECTION — which strike gets called the call
  wall, which the put wall, and whether either can contradict the flip line
  drawn beside it.

  WHY THIS FILE EXISTS. `buildLevelsFor` picked the walls by |value| plus SIDE
  OF SPOT, and side-of-spot is only a PROXY for option side. It holds for a
  fresh OI profile (simulator.ts seeds calls above spot, puts below) and
  deliberately does NOT hold for the live book, which is sticky on purpose
  (BOOK_BLEND, ~1h half-life: "walls persist, get tested, and fade for real
  instead of shadowing price") — so a shelf keeps its option side while price
  walks past it and its side of spot flips.

  Measured on SPY at spot 505.17 before the fix: strike 505 carried
  -$436.8M — CALL-dominant — and was named the PUT wall, so the strike rail
  printed a red PW tag on a steel row sitting ABOVE its own flip rule at
  504.50. A put wall on the call side of the flip is not a thing that can
  exist.

  Nothing in `npm test` asserted anything about wall selection when that
  shipped: `grep -rl callWall scripts/` was empty. The only check that caught
  it was the rail's own rendering, in a browser. This is that check, moved to
  where it runs on every push.

  Runs the REAL module against the REAL simulator book — the sign convention
  under test is the simulator's, so a mock would be asserting my own
  arithmetic rather than the product's.

  SAMPLED ALONG THE WALK, NOT AT THE END, and that is the whole design. The
  book BLENDS toward a fresh profile (`evolveBook`, per bar roll), and a fresh
  profile is the one shape where side-of-spot happens to agree with option
  side. Walk far enough and the book CONVERGES back onto the benign case, so
  "walk a long time, then assert once" tests the least interesting instant it
  could have picked. The pathological shape is TRANSIENT — it exists in the
  window after spot jumps and before the blend catches up. So this walks in
  short chunks and re-checks every name at every chunk boundary, which is both
  cheaper in ticks and a strictly stronger claim: the invariant holds
  CONTINUOUSLY, not just at one arbitrary endpoint.
*/
// FIRST — pins Math.random before simulator.ts seeds its watchlist at module
// scope. Below that import it would pin nothing. See the file for why.
import './deterministic-random';
import Simulator from '../src/core/simulator';
import { buildLevelsFor } from '../src/data/gex';

let pass = 0,
  fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

/* Enough names to catch a book that has drifted, not just the four the
   simulator seeds by hand. Registration forward-sims candles per name, so this
   is the cost/coverage trade: eight names spans three step sizes (0.5 / 1) and
   an IV range from SPY's 0.15 to TSLA's 0.48, and high IV is what moves spot
   far enough per bar to strand a shelf on the wrong side. */
const NAMES = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMD', 'META'];

/* 60 samples x 100 ticks. The tick count is the same order as walking straight
   through; the sampling is what makes it inspect 60 book states per name
   instead of 1. */
const SAMPLES = 60;
const TICKS_PER_SAMPLE = 100;

for (const n of NAMES) Simulator.ensureTicker(n);

type Tally = { checked: number; bad: number; first: string };
const blank = (): Tally => ({ checked: 0, bad: 0, first: '' });
const rec = (t: Tally, ok: boolean, detail: string) => {
  t.checked++;
  if (!ok) {
    t.bad++;
    if (!t.first) t.first = detail;
  }
};

const stats: Record<string, {
  cwSign: Tally; cwSide: Tally; cwFlip: Tally;
  pwSign: Tally; pwSide: Tally; pwFlip: Tally;
}> = {};
for (const n of NAMES)
  stats[n] = {
    cwSign: blank(), cwSide: blank(), cwFlip: blank(),
    pwSign: blank(), pwSide: blank(), pwFlip: blank()
  };

const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '-' : '0');

/* MUTATION GUARD, and the reason it is here: every assertion below passes on a
   FRESH book whether or not the sign is checked, because the seeded profile
   puts calls above spot and puts below. If the walk never strands a shelf,
   this file is decorative — it would go green against the exact bug it was
   written for. So it counts the sampled book states where the OLD rule
   (biggest |value| on that side of spot, sign ignored) would have named a
   DIFFERENT strike than the shipped rule does. Zero such states means the walk
   never reproduced the bug's precondition, and the file fails rather than
   quietly reporting a green it did not earn. */
let naiveDiffered = 0;
let statesSampled = 0;

for (let s = 0; s < SAMPLES; s++) {
  for (let i = 0; i < TICKS_PER_SAMPLE; i++) Simulator.tick(() => {});

  for (const name of NAMES) {
    const sym = Simulator.ensureTicker(name);
    const { spot, callWall, putWall, flip } = buildLevelsFor(sym);
    const snaps = Simulator.getGexHistory(sym);
    const levels = snaps[snaps.length - 1]?.levels ?? [];
    if (!levels.length) continue;
    const at = (k: number) => levels.find(l => l.strike === k);
    const st = stats[name];
    statesSampled++;

    /* An unnamed wall is the honest answer to "no call wall overhead" — the
       picker leaves it at spot when nothing on that side qualifies. Skip
       those: a valid outcome, not a violation. */
    const cw = callWall !== spot ? at(callWall) : null;
    const pw = putWall !== spot ? at(putWall) : null;

    if (cw) {
      rec(st.cwSign, cw.value < 0, `${callWall} value ${sign(cw.value)}${Math.abs(cw.value).toExponential(2)}`);
      rec(st.cwSide, callWall > spot, `${callWall} vs spot ${spot.toFixed(2)}`);
      /* THE ONE THAT WOULD HAVE CAUGHT IT. The flip IS the sign-change
         midpoint, so a call wall below it is a call wall on the put side of
         the book. */
      rec(st.cwFlip, callWall >= flip, `cw ${callWall} vs flip ${flip}`);
    }
    if (pw) {
      rec(st.pwSign, pw.value > 0, `${putWall} value ${sign(pw.value)}${Math.abs(pw.value).toExponential(2)}`);
      rec(st.pwSide, putWall < spot, `${putWall} vs spot ${spot.toFixed(2)}`);
      rec(st.pwFlip, putWall <= flip, `pw ${putWall} vs flip ${flip}`);
    }

    let naiveCw = spot, naiveAbs = 0, signedCw = spot, signedAbs = 0;
    for (const l of levels) {
      const a = Math.abs(l.value);
      if (l.strike > spot && a > naiveAbs) { naiveAbs = a; naiveCw = l.strike; }
      if (l.strike > spot && l.value < 0 && a > signedAbs) { signedAbs = a; signedCw = l.strike; }
    }
    if (naiveCw !== signedCw) naiveDiffered++;
  }
}

const report = (name: string, label: string, t: Tally) => {
  if (!t.checked) return; // wall never named across the whole walk — nothing claimed
  check(`${name}: ${label}`, t.bad === 0, t.bad ? `${t.bad}/${t.checked} bad, first: ${t.first}` : `${t.checked} states`);
};

for (const name of NAMES) {
  const st = stats[name];
  report(name, 'the call wall is CALL-dominant', st.cwSign);
  report(name, 'the call wall is above spot', st.cwSide);
  report(name, 'the call wall is on the call side of the flip', st.cwFlip);
  report(name, 'the put wall is PUT-dominant', st.pwSign);
  report(name, 'the put wall is below spot', st.pwSide);
  report(name, 'the put wall is on the put side of the flip', st.pwFlip);
}

check(
  'the walked books actually exercise the difference',
  naiveDiffered > 0,
  `${naiveDiffered}/${statesSampled} sampled book states where side-of-spot alone would name a different call wall`
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
