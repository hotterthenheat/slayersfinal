/*
  Acceptance test for P-5's air pockets and P-6's wall conviction.

  Both turn stores the terminal already has into reads it did not have, and
  both are the kind of claim that is easy to make and hard to make WELL: a
  pocket that fires on ordinary texture is noise, and a conviction score
  that counts a choppy afternoon as ten breaks is worse than no score.
  So the staged cases below are the edges, not the happy path.

  Proves:
  1. A pocket is a run of quiet strikes BOUNDED BY SHELVES on both sides —
     and a quiet run at the window's edge is not a pocket, because gamma
     thinning where the strikes run out is not emptiness
  2. Width matters: a run under MIN_STRIKES is texture
  3. Quiet is RELATIVE to the book, so the same shape fires on a $600 index
     and a $12 name alike, and a flat book has no pockets at all
  4. Touches count the wick; a session that opens beyond the level never
     "broke" it
  5. A break re-arms only after price closes back — oscillation across a
     level is one break, not ten. This is the assertion that keeps a choppy
     afternoon from reading as a collapse
  6. Persistence counts COMPLETED sessions and stops at the first session
     that had a different title-holder
  7. The grade demands dominance AND an unbroken record for STRONG
*/
import { findAirPockets, pocketWords, MIN_STRIKES, QUIET_SHARE, SHELF_SHARE } from '../src/data/airPockets';
import { buildWallConviction, convictionGrade, touchesAndBreaks, type WallConviction } from '../src/data/wallConviction';
import type { Candle, GexSnapshot } from '../src/types/market';
import type { StrikeExposure } from '../src/types/gex';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

/** A row carrying only what the pocket finder reads. */
const row = (strike: number, net: number): StrikeExposure =>
  ({ strike, gex: { put: 0, call: 0, net }, dex: { put: 0, call: 0, net: 0 }, vex: { put: 0, call: 0, net: 0 } } as unknown as StrikeExposure);

// ── 1+2. bounded, and wide enough ─────────────────────────────────────────
{
  /* Descending strikes: a heavy shelf, four empty, a heavy shelf. */
  const strikes = [row(110, 100), row(109, 1), row(108, 1), row(107, 1), row(106, 1), row(105, 100), row(104, 60)];
  const pockets = findAirPockets(strikes);
  check('a bounded run of quiet strikes is a pocket', pockets.length === 1, JSON.stringify(pockets));
  check('and it reports its run and its shelves', pockets[0]?.from === 109 && pockets[0]?.to === 106 && pockets[0]?.ceiling === 110 && pockets[0]?.floor === 105);
  check('with its width', pockets[0]?.width === 4);

  /* The same emptiness at the END of the window is not a pocket. */
  const edge = [row(110, 100), row(109, 1), row(108, 1), row(107, 1), row(106, 1)];
  check('a quiet run at the window edge is NOT a pocket — no floor under it', findAirPockets(edge).length === 0);
  const edgeTop = [row(110, 1), row(109, 1), row(108, 1), row(107, 100), row(106, 90)];
  check('— nor at the top, with no ceiling over it', findAirPockets(edgeTop).length === 0);

  /* Two quiet strikes is texture. */
  const narrow = [row(110, 100), row(109, 1), row(108, 1), row(107, 100), row(106, 90)];
  check(`a run under ${MIN_STRIKES} strikes is texture, not a pocket`, findAirPockets(narrow).length === 0);

  /*
    BOUNDED BY SHELVES, not merely by "not-quiet". A mutation that kept the
    array-bounds check but dropped the shelf test SURVIVED the cases above,
    because every run staged there happens to sit against heavy strikes. This
    is the case that separates them: the run's neighbours carry 20% of the
    heaviest — over the quiet bar, under the shelf bar — so the run is
    bounded by middling strikes and is NOT a pocket. A pocket's claim is that
    price crossing it meets nothing and then meets SOMETHING; drift between
    two mediocre strikes is just a thin patch of book.
  */
  const middling = [row(112, 100), row(111, 20), row(110, 1), row(109, 1), row(108, 1), row(107, 20), row(106, 100)];
  check('a quiet run bounded by MIDDLING strikes is not a pocket', findAirPockets(middling).length === 0, JSON.stringify(findAirPockets(middling)));
  /* And the same run, with real shelves either side, is one. */
  const shelved = [row(112, 100), row(111, 50), row(110, 1), row(109, 1), row(108, 1), row(107, 50), row(106, 100)];
  check('— the same run between real shelves is', findAirPockets(shelved).length === 1);
}

// ── 3. relative, not absolute ─────────────────────────────────────────────
{
  const shape = (heavy: number, quiet: number) => [row(110, heavy), row(109, quiet), row(108, quiet), row(107, quiet), row(106, heavy), row(105, heavy * 0.6)];
  check('the same shape fires on a huge book', findAirPockets(shape(9e9, 1e8)).length === 1);
  check('and on a tiny one', findAirPockets(shape(900, 10)).length === 1);
  /* A flat book: every strike equal, so nothing is quiet against anything. */
  check('a flat book has no pockets', findAirPockets([row(110, 50), row(109, 50), row(108, 50), row(107, 50), row(106, 50)]).length === 0);
  check('and an empty book yields none rather than throwing', findAirPockets([]).length === 0);
  /* The thresholds are shares of the heaviest — pinned so a tuning change
     has to come here, deliberately. */
  const atBar = [row(110, 100), row(109, QUIET_SHARE * 100 - 0.01), row(108, 1), row(107, 1), row(106, SHELF_SHARE * 100), row(105, 90)];
  check('a strike just under the quiet bar counts as quiet', findAirPockets(atBar).length === 1);
  const overBar = [row(110, 100), row(109, QUIET_SHARE * 100 + 0.01), row(108, 1), row(107, 1), row(106, 100), row(105, 90)];
  check('and one just over it breaks the run', findAirPockets(overBar).length === 0, JSON.stringify(findAirPockets(overBar)));
  check('the words name the span and where spot sits', /wide with almost no hedging/.test(pocketWords(findAirPockets(atBar)[0], 108)));
}

// ── 4+5. touches and breaks ───────────────────────────────────────────────
{
  const bar = (i: number, low: number, high: number, close: number): Candle => ({ time: 1_700_000_000 + i * 60, open: close, high, low, close, volume: 1 });

  const wick = [bar(0, 98, 100.5, 99)]; // range spans 100, closes below
  check('a wick through the level is a touch', touchesAndBreaks(wick, 100, 'call').touches === 1);
  check('and closing back below is not a break', touchesAndBreaks(wick, 100, 'call').breaks === 0);

  const opened = [bar(0, 101, 103, 102), bar(1, 101, 103, 102)]; // never came back
  check('a session that OPENS beyond the level never broke it', touchesAndBreaks(opened, 100, 'call').breaks === 0);

  const through = [bar(0, 98, 100.5, 99), bar(1, 99, 101, 100.8)];
  check('touching then closing through IS a break', touchesAndBreaks(through, 100, 'call').breaks === 1);

  /* THE OSCILLATION GUARD. Ten bars crossing back and forth is one break
     per genuine re-entry, not one per bar. */
  const chop: Candle[] = [];
  for (let i = 0; i < 10; i++) chop.push(bar(i, 99, 101, i % 2 === 0 ? 100.6 : 99.4));
  const got = touchesAndBreaks(chop, 100, 'call');
  check('oscillation re-arms only on a close back — not once per bar', got.breaks === 5, `${got.breaks} breaks over 10 bars`);
  check('and every bar spanning the level is a touch', got.touches === 10);

  /* Put side reads the other way. Staged so the CALL side sees no break at
     all: every close sits at or below the level, so nothing ever closes
     through it upward. (The first cut of this case closed at 100.2 on bar 0,
     which really does break a call wall — the tape was wrong, not the
     engine.) */
  const putBreak = [bar(0, 99.5, 100.5, 100), bar(1, 98, 100.2, 99.2)];
  check('a put wall breaks on a close BELOW', touchesAndBreaks(putBreak, 100, 'put').breaks === 1);
  check('— and the same tape is no break for a call wall', touchesAndBreaks(putBreak, 100, 'call').breaks === 0);
}

// ── 6. persistence over completed sessions ────────────────────────────────
{
  const T0 = 1_760_000_000 - (1_760_000_000 % 60);
  const bars: Candle[] = [];
  /* Four sessions, a day apart, 5 bars each — the last one still printing. */
  for (let d = 0; d < 4; d++) for (let i = 0; i < 5; i++) bars.push({ time: T0 + d * 86400 + i * 60, open: 100, high: 101, low: 99, close: 100, volume: 1 });
  const snapAt = (d: number, i: number, callWall: number): GexSnapshot => ({
    time: T0 + d * 86400 + i * 60,
    levels: [{ strike: callWall, value: 900 }, { strike: 108, value: 300 }, { strike: 95, value: -500 }],
  });
  /* Sessions 1 and 2 held 110; session 0 held 112. Today holds 110. */
  const snaps = [
    snapAt(0, 4, 112),
    snapAt(1, 4, 110),
    snapAt(2, 4, 110),
    snapAt(3, 4, 110),
  ];
  const c = buildWallConviction(snaps, bars, 100, 'call');
  check('PREMISE: the wall is found', c?.strike === 110, String(c?.strike));
  check('persistence counts back to the first session with a different holder', c?.heldSessions === 2, String(c?.heldSessions));
  check('the margin is this shelf over the runner-up on its side', c !== null && Math.abs((c.margin ?? 0) - 3) < 1e-9, String(c?.margin));

  const noHistory = buildWallConviction([snapAt(3, 4, 110)], bars.slice(-5), 100, 'call');
  check('no session behind today means no persistence claim, not zero', noHistory?.heldSessions === null, String(noHistory?.heldSessions));
  check('an empty history yields null, not a wall', buildWallConviction([], bars, 100, 'call') === null);
  const oneSided = buildWallConviction([{ time: T0, levels: [{ strike: 110, value: 900 }] }], bars, 100, 'call');
  check('a side with no runner-up reports no margin', oneSided?.margin === null);
}

// ── 7. the grade ──────────────────────────────────────────────────────────
{
  const c = (margin: number | null, breaks: number): WallConviction => ({ strike: 110, side: 'call', margin, heldSessions: 3, touches: 4, breaks });
  check('dominant and unbroken is STRONG', convictionGrade(c(2.4, 0)) === 'STRONG');
  check('dominant but broken is not STRONG', convictionGrade(c(2.4, 1)) !== 'STRONG');
  check('unbroken but marginal is not STRONG either', convictionGrade(c(1.05, 0)) !== 'STRONG');
  check('a marginal winner that has been broken is THIN', convictionGrade(c(1.05, 2)) === 'THIN');
  check('and a broken-but-dominant shelf is still HOLDING', convictionGrade(c(2.0, 1)) === 'HOLDING');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
