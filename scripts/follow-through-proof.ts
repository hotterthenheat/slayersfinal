/*
  Acceptance test for 6.1's iron rule.

    "The live score may only use what existed at detection; follow-through
     goes in a separate confirmed score. The UI must never blend them."

  WHY IT IS IRON, and why a proof rather than a convention: the moment a
  ranking is allowed to see what happened after a print, every historical
  row looks brilliant — the ones that worked float to the top BECAUSE they
  worked — and the reader concludes the flag was good. It is the purest
  hindsight bias a trading interface can commit, it is invisible in a
  screenshot, and it flatters the product, which is why it survives review.

  So the first section reads the SOURCE. A behavioural test cannot prove
  that a function never consults the future; a dependency check can.
*/
import { readFileSync } from 'node:fs';
import { rankNotable } from '../src/data/tape';
import {
  followThrough, hasVerdict, tallyFollowThrough, CONFIRM_AFTER_MIN,
  CONFIRM_BAND_PCT, CONFIRM_WORDS, CONFIRM_NOTES, type ConfirmState,
} from '../src/data/followThrough';
import type { FlowPrint } from '../src/types/trace';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// ── the separation, read off the source ─────────────────────────────────
{
  const tape = readFileSync('src/data/tape.ts', 'utf8');
  const ft = readFileSync('src/data/followThrough.ts', 'utf8');

  check('the live scorer does not import the follow-through module',
    !/from\s+'\.\/followThrough'/.test(tape) && !/followThrough/.test(tape.replace(/\/\*[\s\S]*?\*\//g, '')),
    'tape.ts is clean');
  check('and the follow-through module does not import the live scorer',
    !/from\s+'\.\/tape'/.test(ft.replace(/\/\*[\s\S]*?\*\//g, '')) || !/rankNotable/.test(ft));

  /*
    The ranking's inputs, named. Each is a field stamped on the print when
    it printed; none of them can change afterwards. This is the list a
    future edit would have to grow in order to break the rule, which is why
    it is written down here rather than left implicit.
  */
  const body = tape.slice(tape.indexOf('export function rankNotable'));
  const fn = body.slice(0, body.indexOf('\n}\n') + 2);
  const AT_DETECTION = ['premium', 'size', 'otmPct', 'sweep', 'side'];
  const reads = [...fn.matchAll(/\bp\.(\w+)/g)].map(m => m[1]);
  const foreign = [...new Set(reads)].filter(f => !AT_DETECTION.includes(f));
  check('the live ranking reads only fields stamped at detection',
    foreign.length === 0, foreign.length ? `also reads ${foreign.join(', ')}` : reads.length + ' reads, all at-detection');
  check('and it reads no clock', !/Date\.now|performance\.now|new Date/.test(fn));
}

// ── the ranking is stable under follow-through ──────────────────────────
{
  /*
    The behavioural half. Two prints identical except for what the market
    did afterwards must rank identically — if they do not, something in the
    ranking is looking forward.
  */
  const base = (over: Partial<FlowPrint> = {}): FlowPrint => ({
    id: 1, time: '10:00:00', ticker: 'AAA', legs: 1, strike: 100, right: 'C',
    otmPct: 4, expiry: '01/16/2027', dte: 30, fill: 2, bid: 1.9, ask: 2.1, fillPos: 1,
    side: 'ASK', flowScore: 80, ratioLabel: 'ASK 70%', ratioBidPct: 30, size: 500,
    premium: 100_000, volume: 900, oi: 400, deltaOI: 100, spot: 96, iv: 30,
    volOverOI: 2.2, strat: '—', sweep: true, ...over,
  });
  const winner = { ...base({ id: 1 }), at: Date.now() - 60 * 60_000 };
  const loser = { ...base({ id: 2 }), at: Date.now() - 60 * 60_000 };
  // Same inputs, opposite outcomes.
  check('one of the pair really did work and the other faded',
    followThrough(winner, 130).state === 'working' && followThrough(loser, 80).state === 'faded',
    `${followThrough(winner, 130).state} / ${followThrough(loser, 80).state}`);

  const ranked = rankNotable([winner, loser]);
  const rankedFlipped = rankNotable([loser, winner]);
  check('the ranking does not reorder on outcome',
    ranked[0].id === 1 && rankedFlipped[0].id === 2,
    'order follows input, not results');
}

// ── the refusals ─────────────────────────────────────────────────────────
{
  const now = Date.now();
  const p = (over: Partial<FlowPrint & { at: number }> = {}) => ({
    id: 1, time: '10:00', ticker: 'AAA', legs: 1, strike: 100, right: 'C' as const,
    otmPct: 4, expiry: '01/16/2027', dte: 30, fill: 2, bid: 1.9, ask: 2.1, fillPos: 1,
    side: 'ASK' as const, flowScore: 80, ratioLabel: 'ASK', ratioBidPct: 30, size: 500,
    premium: 100_000, volume: 900, oi: 400, deltaOI: 0, spot: 96, iv: 30,
    volOverOI: 2.2, strat: '—' as const, sweep: true, at: now - 60 * 60_000, ...over,
  });

  /*
    A PRINT TWO MINUTES OLD HAS NOT BEEN PROVED OR DISPROVED BY ANYTHING.
    "too fresh" is a first-class state and the default, not a soft reading.
  */
  const fresh = followThrough(p({ at: now - 2 * 60_000 }), 130, now);
  check('a two-minute-old print gets no verdict', fresh.state === 'too-fresh' && fresh.movePct === null);
  check('and the threshold is stated, not buried', CONFIRM_AFTER_MIN >= 5, `${CONFIRM_AFTER_MIN} minutes`);
  check('a print one minute past the line does get one',
    hasVerdict(followThrough(p({ at: now - (CONFIRM_AFTER_MIN + 1) * 60_000 }), 130, now).state));

  // A MID print has no aggressor, so there is no position to be right about.
  const mid = followThrough(p({ side: 'MID' }), 130, now);
  check('a mid print never gets a verdict', mid.state === 'no-thesis' && mid.movePct === null);
  check('not even a very old one',
    followThrough(p({ side: 'MID', at: now - 8 * 3_600_000 }), 200, now).state === 'no-thesis');

  check('a refusal reports null, never 0', [fresh, mid].every(f => f.movePct === null && f.markNow === null));
  check('a missing spot-now refuses rather than guessing', followThrough(p(), 0, now).state === 'too-fresh');
  check('a missing spot-at-the-print refuses too', followThrough(p({ spot: 0 }), 130, now).state === 'too-fresh');

  /*
    THE FILL IS NOT AN INPUT ANY MORE, and that is the point of the change
    this assertion replaces. The reading is model-to-model — the contract
    valued at the spot it printed at, and again now — so what somebody paid
    cannot leak into what the market did. Two prints on the same contract,
    one at a good fill and one that paid up, must read identically.
  */
  const cheap = followThrough(p({ fill: 1 }), 130, now);
  const dear = followThrough(p({ fill: 9 }), 130, now);
  check('execution quality does not leak into follow-through',
    cheap.movePct === dear.movePct && cheap.state === dear.state,
    `${cheap.movePct}% vs ${dear.movePct}%`);
  check('and a zero fill is simply irrelevant rather than fatal',
    followThrough(p({ fill: 0 }), 130, now).state === 'working');
}

// ── the direction is the AGGRESSOR's ─────────────────────────────────────
{
  const now = Date.now();
  const mk = (side: 'ASK' | 'BID', right: 'C' | 'P') => ({
    id: 1, time: '10:00', ticker: 'AAA', legs: 1, strike: 100, right,
    otmPct: 4, expiry: '01/16/2027', dte: 30, fill: 3, bid: 2.9, ask: 3.1, fillPos: 1,
    side, flowScore: 0, ratioLabel: '', ratioBidPct: 0, size: 100,
    premium: 30_000, volume: 100, oi: 100, deltaOI: 0, spot: 100, iv: 30,
    volOverOI: 1, strat: '—' as const, sweep: false, at: now - 60 * 60_000,
  });
  /*
    An ASK print BOUGHT it; a BID print SOLD it. The same market move
    confirms one and fades the other, and getting this backwards would
    produce a column that is confidently wrong exactly half the time —
    which reads as a working feature.
  */
  check('a call bought at the ask works when spot rises', followThrough(mk('ASK', 'C'), 118, now).state === 'working');
  check('a call SOLD at the bid fades on the same move', followThrough(mk('BID', 'C'), 118, now).state === 'faded');
  check('a put bought at the ask works when spot falls', followThrough(mk('ASK', 'P'), 82, now).state === 'working');
  check('a put SOLD at the bid fades on the same move', followThrough(mk('BID', 'P'), 82, now).state === 'faded');

  // A small wiggle is the spread breathing, not the market answering.
  const flat = followThrough(mk('ASK', 'C'), 100.05, now);
  check('an unmoved market reads flat, not working', flat.state === 'flat', `${flat.state} ${flat.movePct}%`);
  check('the dead band is wide enough to mean something', CONFIRM_BAND_PCT >= 5, `${CONFIRM_BAND_PCT}%`);

  /*
    TIME DECAYS TOO. A long that goes nowhere for a month has LOST, and a
    model that ignored theta would report it flat — flattering every long
    on the tape.
  */
  const stale = followThrough({ ...mk('ASK', 'C'), at: now - 20 * 24 * 3_600_000, dte: 30 }, 100, now);
  check('a long that went nowhere for twenty days has faded, not stayed flat',
    stale.state === 'faded', `${stale.state} ${stale.movePct}%`);
}

// ── the tally ────────────────────────────────────────────────────────────
{
  const now = Date.now();
  const mk = (i: number, side: 'ASK' | 'BID' | 'MID', ageMin: number) => ({
    id: i, time: '10:00', ticker: 'AAA', legs: 1, strike: 100, right: 'C' as const,
    otmPct: 4, expiry: '01/16/2027', dte: 30, fill: 3, bid: 2.9, ask: 3.1, fillPos: 1,
    side, flowScore: 0, ratioLabel: '', ratioBidPct: 0, size: 100,
    premium: 30_000, volume: 100, oi: 100, deltaOI: 0, spot: 100, iv: 30,
    volOverOI: 1, strat: '—' as const, sweep: false, at: now - ageMin * 60_000,
  });
  const prints = [mk(1, 'ASK', 90), mk(2, 'BID', 90), mk(3, 'MID', 90), mk(4, 'ASK', 1)];
  const t = tallyFollowThrough(prints, () => 118, now);
  check('every print lands in exactly one bucket',
    Object.values(t).reduce((a, b) => a + b, 0) === prints.length, JSON.stringify(t));
  check('the fresh one and the mid one are counted as refusals, not as outcomes',
    t['too-fresh'] === 1 && t['no-thesis'] === 1, JSON.stringify(t));

  /*
    COUNTS, NEVER A RATE. A percentage invites "the tape is 63% accurate",
    which this cannot support: the population is whatever is in the buffer,
    the horizon is however long each print has been sitting, and nobody
    closed any of these positions.
  */
  const src = readFileSync('src/data/followThrough.ts', 'utf8');
  check('the module returns counts and says why it is not a rate',
    /never as a hit RATE/i.test(src) && !/hitRate|accuracy|winRate/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
}

// ── the vocabulary ───────────────────────────────────────────────────────
{
  const states: ConfirmState[] = ['too-fresh', 'no-thesis', 'working', 'faded', 'flat'];
  check('every state has a word and a note',
    states.every(s => CONFIRM_WORDS[s]?.length > 0 && CONFIRM_NOTES[s]?.length > 0));
  check('no two states share a word', new Set(states.map(s => CONFIRM_WORDS[s])).size === states.length);
  check('exactly two states are refusals',
    states.filter(s => !hasVerdict(s)).length === 2 &&
    !hasVerdict('too-fresh') && !hasVerdict('no-thesis'));
  /* The copy must not let a follow-through read as a verdict on the flag —
     that is the same hindsight bias wearing different words. */
  check('the notes say this is what happened since, not a judgment of the print',
    /not a judgment|not a verdict/i.test(CONFIRM_NOTES.working + CONFIRM_NOTES.faded));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
