/*
  Acceptance test for Part 10 — the tab that advertises rigour.

  Two items, and they are the same item twice: a quant surface that looks
  authoritative and does not say what is behind it.

  MODEL DISCLOSURE. A fan chart with a percentile cone and a histogram is
  the most authoritative-looking object a quant interface produces. Behind
  it is geometric Brownian motion, which the checklist correctly calls the
  weakest assumption in the app. Naming it is not enough — the reader needs
  to know in WHICH DIRECTION it is wrong, because for options every one of
  its errors runs the same way.

  LOCKED PREDICTIONS. A scoreboard is a claim that the desk called things
  correctly, and it is worth exactly nothing unless the calls were fixed
  before the results were known. Any model grades brilliantly against a
  window chosen after the fact.
*/
import { readFileSync } from 'node:fs';
import { buildScoreboard, sampleWords, type Claim } from '../src/data/scoreboard';
import type { ScannerKey } from '../src/types/compass';
import {
  MC_MODEL_NAME, MC_MODEL_ASSUMPTIONS, MC_MODEL_NOTE,
  SCOREBOARD_LOCK_NOTE, MATURITY_DAYS,
} from '../src/core/quant';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// ── the model is named, and its failures are named ──────────────────────
{
  check('the model has a name, not an acronym in a subtitle',
    MC_MODEL_NAME.length > 10 && /brownian/i.test(MC_MODEL_NAME), MC_MODEL_NAME);
  check('there are several stated assumptions', MC_MODEL_ASSUMPTIONS.length >= 3,
    `${MC_MODEL_ASSUMPTIONS.length}`);
  check('each one says what it is AND why it is wrong',
    MC_MODEL_ASSUMPTIONS.every(a => a.claim.length > 8 && a.why.length > 60));

  /*
    THE THREE THAT MATTER FOR OPTIONS, by name. A disclosure that says
    "this is a model, models are imperfect" teaches nothing. Fat tails, vol
    clustering and jumps are the specific ways GBM misprices exactly what
    an option buyer is paying for, and all three errors run the same way.
  */
  const all = MC_MODEL_ASSUMPTIONS.map(a => `${a.claim} ${a.why}`).join(' ').toLowerCase();
  check('fat tails are named', /fat|tail/.test(all));
  check('vol clustering is named', /cluster/.test(all));
  check('the absence of jumps is named', /jump|gap/.test(all));
  check('and the note tells the reader how to read the cone',
    /shape, not as a probability/i.test(MC_MODEL_NOTE), MC_MODEL_NOTE.slice(-60));

  const page = readFileSync('src/pages/proveit/ProveIt.tsx', 'utf8');
  check('the page renders the model card beside the chart',
    page.includes('MC_MODEL_ASSUMPTIONS') && page.includes('MC_MODEL_NAME'));
  check('and calls it the weakest assumption in as many words',
    /weakest assumption/i.test(page));
}

// ── the scoreboard counts real claims, or says it has none ──────────────
{
  /*
    WHAT THIS SECTION USED TO ASSERT, AND WHY IT WAS NOT ENOUGH.

    It checked the lock window's arithmetic exhaustively — that the window
    closes strictly before outcomes are known, that the gap is the whole
    maturity horizon, that every row states the same window — and every one
    of those checks passed while the HIT RATES were
    `Math.round(base + hRange(seed, -3, 3))` around a hand-picked base.

    A perfectly-shaped frame around an invented number. So the checks now
    go at the number: the board grades the reader's own tracked setups, and
    the arithmetic is verified against a ledger whose answer is known here
    in advance.
  */
  const rows = (claims: Claim[]) => buildScoreboard(claims);
  const at = Date.UTC(2026, 0, 5);
  const claim = (lens: ScannerKey, matured: boolean, heldUp: boolean | null, day = 0): Claim => ({
    lens,
    at: at + day * 86_400_000,
    matured,
    heldUp,
  });

  check('an empty ledger is an empty board, not a board of zeros', (() => {
    const b = rows([]);
    return b.rows.length === 0 && b.graded === 0 && b.lockedFrom === null;
  })());

  const board = rows([
    claim('top-setups', true, true),
    claim('top-setups', true, true, 1),
    claim('top-setups', true, false, 2),
    claim('top-setups', false, null, 3),
    claim('rebounds', true, null, 4),
  ]);
  const top = board.rows.find(r => r.lens === 'top-setups')!;
  check('the hit rate is held over held-plus-missed', top.hitRatePct === 67, `${top.hitRatePct}% from ${top.held}/${top.sample}`);
  check('  · a pending claim is not in the denominator', top.sample === 3 && top.pending === 1);

  /* THREE OUTCOMES, TWO IN THE DENOMINATOR. A WATCH says "not yet" and is
     right about nothing either way. Counting it as a miss punishes the desk
     for its own caution; counting it as a hit rewards it for saying
     nothing. */
  const reb = board.rows.find(r => r.lens === 'rebounds')!;
  check('a matured claim that claimed nothing grades neither way', reb.noClaim === 1 && reb.sample === 0);
  check('  · and a lens with nothing graded reads NULL, never 0%', reb.hitRatePct === null);

  /* THE LOCK WINDOW IS MEASURED OFF THE GRADED CLAIMS THEMSELVES rather
     than declared, so it cannot describe a sample it does not hold. */
  check('the lock window spans the graded claims', board.lockedFrom === '2026-01-05' && board.lockedTo === '2026-01-07', `${board.lockedFrom} → ${board.lockedTo}`);
  check('  · and ignores the ones that were never graded', board.lockedTo !== '2026-01-09');
  check('the totals add up across lenses', board.graded === 3 && board.pending === 1 && board.noClaim === 1);

  /* A 70% over three calls and a 70% over ninety are not the same
     statement, and the surface has to say which it is. */
  check('a thin sample is named as thin', /anecdote/.test(sampleWords(4)) && /thin/.test(sampleWords(20)) && !/thin|anecdote/.test(sampleWords(80)));
  check('  · and nothing graded is named as nothing', /nothing graded/.test(sampleWords(0)));

  /* Best-supported first: the reader should meet the number that can carry
     weight before the one that cannot. */
  const ordered = rows([claim('rebounds', true, true), claim('top-setups', true, true), claim('top-setups', true, false, 1)]);
  check('the better-supported lens is listed first', ordered.rows[0].lens === 'top-setups', ordered.rows.map(r => `${r.lens}:${r.sample}`).join(' '));

  const page = readFileSync('src/pages/proveit/ProveIt.tsx', 'utf8');
  check('the board reads the reader’s own tracked setups', /useTracker\(\)/.test(page) && /buildScoreboard\(trackedSetups\.map\(claimOf\)\)/.test(page));
  check('  · graded by the shared maturity rule, not a second copy of it', /labelRead\(t\.verdictAtTrack/.test(page) && /from '\.\.\/\.\.\/data\/labelMaturity'/.test(page));
  check('  · and the clock lives in one module', (() => {
    const tracker = readFileSync('src/pages/Tracker.tsx', 'utf8');
    const lm = readFileSync('src/data/labelMaturity.ts', 'utf8');
    return /export const DTE_BY_SLEEVE/.test(lm) && !/const DTE_BY_SLEEVE/.test(tracker);
  })());
  check('the page prints the lock window it measured', /scoreboard\.lockedFrom/.test(page));
  check('and the empty state is reachable — the rows are no longer hardcoded', /No graded calls yet/.test(page));

  const quant = readFileSync('src/core/quant.ts', 'utf8');
  check('the seeded scoreboard is gone from the engine', !/export function modelScoreboard/.test(quant));
  check('  · and no hit rate is drawn from a seed anywhere in it', !/hitRatePct/.test(quant));
  check('the lock discipline survives, because it was the valuable part',
    /do not overlap|does not overlap|cannot be/i.test(SCOREBOARD_LOCK_NOTE) && /before its outcome was known/i.test(SCOREBOARD_LOCK_NOTE));
  check('  · and the horizon it names is the one the code uses', MATURITY_DAYS > 0 && new RegExp(`\\b${MATURITY_DAYS}\\b`).test(page));
}

// ── the surface is not the only copy of the surface ────────────────────
{
  /*
    A CANVAS IS A RENDERING, NOT A RECORD. `getContext('2d')` returning null
    used to `return` out of the effect and leave a 340px hole — a reader on
    a hardened profile, an assistive rendering path, or a printed page got a
    blank box with neither an explanation nor the numbers. The projection is
    a way of LOOKING at the grid; losing it must not lose the grid.
  */
  const surf = readFileSync('src/pages/proveit/Surface3D.tsx', 'utf8');
  check('a canvas the browser refuses falls back rather than blanking',
    /if \(!ctx\) \{\s*setFlat\(true\);/.test(surf) && /data-surface-fallback/.test(surf));
  check('  · saying WHY, in the desk\'s own four-state vocabulary',
    /kind="unavailable"/.test(surf) && /from '\.\.\/\.\.\/components\/ui\/DataState'/.test(surf));
  check('  · and carrying the same numbers, flat', /grid\.map\(\(row, e\)/.test(surf) && /strikes\.map\(/.test(surf));

  /*
    AND THE ORBIT OBEYS THE SETTING. A surface that turns forever is exactly
    the animation a reader with reduced motion has asked not to be shown,
    and the desk's own copy says motion can only ever be reduced. Read
    through the store so flipping the switch re-runs the effect; dragging
    survives, because motion the reader causes is not motion imposed.
  */
  check('the auto-orbit asks the motion preference before it spins',
    /const spin = motionAllowed\(prefs\.motion\)/.test(surf) && /!draggingRef\.current && spin/.test(surf));
  check('  · subscribed, so the setting takes effect when it is changed',
    /usePrefs\(\)/.test(surf) && /\}, \[spin\]\)/.test(surf));
  check('  · the reader can still turn it by hand', /cursor-grab/.test(surf) && /kickRef\.current\(\)/.test(surf));
  /* Reduced motion should cost LESS. A loop redrawing an unchanged frame
     sixty times a second is not visibly animating, but it is still a fan. */
  check('  · and a still surface actually stops, rather than redrawing itself',
    /else raf = 0;/.test(surf) && /if \(!raf\) raf = requestAnimationFrame\(draw\);/.test(surf));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
