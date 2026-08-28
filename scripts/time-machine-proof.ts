/*
  Acceptance test for P-20's time machine — the three modules the GEX
  History page has carried as "scheduled" placeholders since launch.

  A history surface has one failure mode that matters more than the rest:
  inventing a past that did not happen. A smooth line through a gap, an
  average of two book states, or a historical level picked against TODAY'S
  spot all produce confident output about moments that never existed. All
  three are staged below.

  Proves:
  1. Sessions come from the bars' own gap cut and report how many snapshots
     each actually holds — a session with none says none
  2. HIST_01 re-picks each point with the SAME pickers the live map uses,
     against the spot AT THAT MOMENT — not today's. A level picked against
     the wrong spot is a level that never existed, and the staged case makes
     the two answers differ
  3. Migration is confined to its session — yesterday's levels are not in
     today's line
  4. HIST_02 takes the LAST snapshot in a bucket, never an average of two
     book states
  5. HIST_03 lands on the nearest RECORDED snapshot, never between two
  6. The words report a flip that held versus one that migrated, and say so
     plainly when there is nothing to track
*/
import { levelMigration, sessionSpans, strikeTimeHeat, snapshotAt, migrationWords } from '../src/data/timeMachine';
import { pickWalls } from '../src/core/walls';
import type { Candle, GexSnapshot } from '../src/types/market';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const T0 = 1_760_000_000 - (1_760_000_000 % 60);
/* Three sessions, a day apart, 10 bars each. Session 0 trades at 100,
   session 1 at 100, session 2 at 130 — the price MOVED between them, which
   is what makes "which spot was it picked against" a real question. */
const bars: Candle[] = [];
for (let d = 0; d < 3; d++) {
  const px = d === 2 ? 130 : 100;
  for (let i = 0; i < 10; i++) bars.push({ time: T0 + d * 86400 + i * 60, open: px, high: px, low: px, close: px, volume: 1 });
}
const at = (d: number, i: number) => T0 + d * 86400 + i * 60;
const snap = (time: number, levels: [number, number][]): GexSnapshot => ({
  time,
  levels: levels.map(([strike, value]) => ({ strike, value })),
});

/*
  A book with shelves both sides of 100 AND both sides of 130, staged so the
  CALL WALL genuinely differs between the two spots — 125 is the heaviest
  call-side shelf seen from 100, but it sits BELOW 130 and cannot be a call
  wall from there, where 135 wins. Without that the "picked against the right
  spot" test would pass on an implementation that used today's spot for
  everything, which is exactly the bug it exists to catch. (The first cut of
  this file had 125 at 400 and both spots answered 135.)
*/
const BOOK: [number, number][] = [[140, -300], [135, -900], [125, -1_500], [110, -800], [105, -500], [95, 700], [90, 200]];

// ── 1. the sessions ───────────────────────────────────────────────────────
{
  const snaps = [snap(at(0, 5), BOOK), snap(at(2, 3), BOOK), snap(at(2, 8), BOOK)];
  const spans = sessionSpans(bars, snaps);
  check('three sessions in the buffer', spans.length === 3, String(spans.length));
  check('each spans its own bars', spans[0].from === at(0, 0) && spans[0].to === at(0, 9));
  check('and reports the snapshots it actually holds', spans[0].snapshots === 1 && spans[1].snapshots === 0 && spans[2].snapshots === 2, spans.map(s => s.snapshots).join(','));
  check('a session with no snapshots says none rather than borrowing', spans[1].snapshots === 0);
}

// ── 2. picked against the spot AT THAT MOMENT ─────────────────────────────
{
  const snaps = [snap(at(0, 5), BOOK), snap(at(2, 5), BOOK)];
  const points = levelMigration(snaps, bars);
  check('PREMISE: two points, one per session with a snapshot', points.length === 2);

  /* The same book at spot 100 and at spot 130 must pick DIFFERENT walls —
     that is what makes this test meaningful rather than tautological. */
  const book = BOOK.map(([strike, value]) => ({ strike, netGex: value }));
  const at100 = pickWalls(book, 100, n => n.netGex);
  const at130 = pickWalls(book, 130, n => n.netGex);
  check('PREMISE: this book picks different walls at 100 than at 130', at100.callWall !== at130.callWall, `${at100.callWall} vs ${at130.callWall}`);

  check(
    'the older point is picked against the spot of ITS session, not today’s',
    points[0].callWall === (at100.callWall ?? null),
    `${points[0].callWall} vs ${at100.callWall}`
  );
  check('and the newer against its own', points[1].callWall === (at130.callWall ?? null), `${points[1].callWall} vs ${at130.callWall}`);
  /* The king is a whole-book argmax and so is spot-independent — it must be
     the same at both, which also proves the two points are not just copies. */
  check('the king is the same at both — it is a whole-book read', points[0].king === points[1].king && points[0].king === 125, String(points[0].king));
}

// ── 3. confined to its session ────────────────────────────────────────────
{
  const snaps = [snap(at(0, 5), BOOK), snap(at(2, 5), BOOK)];
  const spans = sessionSpans(bars, snaps);
  const todayOnly = levelMigration(snaps, bars, spans[2]);
  check('a session filter keeps only that session’s points', todayOnly.length === 1 && todayOnly[0].time === at(2, 5));
  const emptySession = levelMigration(snaps, bars, spans[1]);
  check('a session with no snapshots yields no line — not one drawn through nothing', emptySession.length === 0);
  check('and the words say so', migrationWords(emptySession) === 'No snapshots recorded for this session');
}

// ── 4. the bucket takes a REAL reading ────────────────────────────────────
{
  /* Two very different books inside one bucket. The result must be one of
     them — the later — never their average. */
  const a: [number, number][] = [[100, 1_000]];
  const b: [number, number][] = [[100, 9_000]];
  const snaps = [snap(at(2, 1), a), snap(at(2, 2), b)];
  const spans = sessionSpans(bars, snaps);
  const heat = strikeTimeHeat(snaps, spans[2], 1);
  const cell = heat.rows[0].cells[0].netGex;
  check('a bucket takes the LAST real reading', cell === 9_000, String(cell));
  check('— never the average of two book states', cell !== 5_000);
  check('the scale is the largest |cell|', heat.maxAbs === 9_000);
  check('an empty span is an empty grid', strikeTimeHeat([], spans[2], 4).rows.length === 0);
  check('and zero buckets is refused', strikeTimeHeat(snaps, spans[2], 0).rows.length === 0);
}

// ── 5. nearest RECORDED ───────────────────────────────────────────────────
{
  const snaps = [snap(at(2, 1), [[100, 1_000]]), snap(at(2, 9), [[100, 9_000]])];
  const mid = snapshotAt(snaps, at(2, 5) - 1);
  check('a scrub between two snapshots lands on one that happened', mid !== null && (mid.time === at(2, 1) || mid.time === at(2, 9)));
  check('— the nearer of the two', snapshotAt(snaps, at(2, 2))?.time === at(2, 1));
  check('and its value is a recorded one, not a blend', snapshotAt(snaps, at(2, 2))?.levels[0].value === 1_000);
  check('an empty history reports null', snapshotAt([], at(2, 5)) === null);
}

// ── 6. the words ──────────────────────────────────────────────────────────
{
  const held = [snap(at(2, 1), BOOK), snap(at(2, 9), BOOK)];
  const spans = sessionSpans(bars, held);
  check('a flip that held says so', /held at/.test(migrationWords(levelMigration(held, bars, spans[2]))));

  const moved = [snap(at(2, 1), [[125, 400], [110, -800]]), snap(at(2, 9), [[135, 400], [128, -800]])];
  const words = migrationWords(levelMigration(moved, bars, spans[2]));
  check('a flip that migrated reports how far and which way', /migrated/.test(words), words.slice(0, 90));

  const oneSided = [snap(at(2, 1), [[140, -100], [135, -200]]), snap(at(2, 9), [[140, -100], [135, -200]])];
  check('a one-sided book says there was no flip to track', /no flip to track/.test(migrationWords(levelMigration(oneSided, bars, spans[2]))));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
