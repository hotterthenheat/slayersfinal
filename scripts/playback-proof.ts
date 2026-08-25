/*
  What the terminal does when the recording runs out.

  WHY THIS EXISTS. Playback is finite. The tape holds 1,013 prints and the
  recordings hold a fixed number of bars, so there is a moment — several
  moments, at different times — when the desk stops moving and every animation
  on it keeps running as though it had not. Nothing said so. `core/feed.ts`
  had exported `atEnd()` since it was written, carrying the comment "the UI
  may want to say so", and no UI did.

  The numbers below were measured twice, independently: ticked headless by
  this script, and watched in a browser for twelve minutes on /trace/live-tape
  (the newest tape row froze at 15:59:37 between t+6m and t+7m; the header
  price stopped changing between t+10m and t+11m — both inside the tick the
  headless run predicts, allowing for page load).

  WHAT IT GUARDS. Two UI signals now depend on facts about playback:

    the header  says "recording played out" when the ACTIVE name's
                priceHistory stops growing (MarketDataContext)
    the tape    says it in the beam subtitle after two empty batches
                (LiveTape)

  Neither reads a magic number, but both rest on properties of the feed that
  are easy to break silently — a looping playhead, a tape that re-serves, a
  recording re-cut to a different length. Each assertion here names the
  property the UI depends on and fails when the feed stops providing it, in
  either direction.

  Run: npx tsx scripts/playback-proof.ts
*/

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Feed from '../src/core/feed';
import RECORDED_TAPE from '../src/data/recorded/tape.json';
import type { MarketSnapshot, TapeOrder } from '../src/types/market';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0,
  fail = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  ok ? pass++ : fail++;
};

/** The provider's interval. Only used to render ticks as minutes in the output. */
const TICK_MS = 1500;
const asTime = (ticks: number) => {
  const s = Math.round((ticks * TICK_MS) / 1000);
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
};

/* ------------------------------------------------------------------ *
   Run playback once, all the way out, recording everything as it goes.
 * ------------------------------------------------------------------ */

const TAPE = RECORDED_TAPE as unknown as TapeOrder[];
const NAMES = Object.keys(Feed.TICKERS);
const active = Feed.getActiveTicker();

/** Enough to carry every recording past its last bar, with room to spare. */
const TICKS = 600;

const served: TapeOrder[] = [];
/** Tick number of the first empty tape batch, 1-based. */
let firstEmptyTape = 0;
/** Tick number at which each name's bar series stopped growing. */
const pinnedAt: Record<string, number> = {};
const barsBefore: Record<string, number> = {};
for (const n of NAMES) barsBefore[n] = Feed.peekCandles(n)?.length ?? 0;

/** Every length the ACTIVE name's priceHistory took, in tick order. */
const activeLengths: number[] = [];
let atEndAt = 0;

for (let t = 1; t <= TICKS; t++) {
  let snap: MarketSnapshot | null = null;
  Feed.tick(s => {
    snap = s;
  });
  const s = snap as unknown as MarketSnapshot;
  served.push(...s.tape);
  if (s.tape.length === 0 && firstEmptyTape === 0) firstEmptyTape = t;
  activeLengths.push(s.priceHistory.length);
  for (const n of NAMES) {
    const len = Feed.peekCandles(n)?.length ?? 0;
    if (len === barsBefore[n]) {
      if (!pinnedAt[n]) pinnedAt[n] = t;
    } else {
      delete pinnedAt[n];
      barsBefore[n] = len;
    }
  }
  if (Feed.atEnd() && atEndAt === 0) atEndAt = t;
}

/* ------------------------------------------------------------------ *
   1. The tape serves every recorded print exactly once, then nothing.
 * ------------------------------------------------------------------ */

/*
  Reference equality, element by element, against the recorded array. Counting
  would pass for a tape that served the same four prints 253 times; comparing
  identity in order proves each print was revealed once and in the order it was
  recorded, which is what LiveTape's accumulation assumes.
*/
const servedInOrder = served.length === TAPE.length && served.every((o, i) => o === TAPE[i]);
check(
  'the tape serves every recorded print exactly once, in order',
  servedInOrder,
  servedInOrder
    ? `${served.length} prints, identical to the recording element for element`
    : `served ${served.length} of ${TAPE.length}, order or identity differs`
);

/*
  And then it is done. A tape that looped would keep the desk looking busy on
  prints the reader has already read — the same lie the playhead refuses to
  tell by holding rather than looping.
*/
const staysEmpty = firstEmptyTape > 0 && served.length === TAPE.length;
check(
  'the tape stays empty once exhausted — it does not loop',
  staysEmpty,
  staysEmpty
    ? `first empty batch at tick ${firstEmptyTape} (${asTime(firstEmptyTape)}), and ${TICKS - firstEmptyTape} further ticks served nothing`
    : 'the tape served prints again after running out'
);

/* ------------------------------------------------------------------ *
   2. The property the header's signal rests on.
 * ------------------------------------------------------------------ */

/*
  MarketDataContext calls a name played out when its `priceHistory.length`
  repeats. That is only sound if the length is strictly increasing until the
  playhead pins — one repeat mid-playback would put "recording played out" on
  a moving market. Asserted directly: no two consecutive lengths are equal
  before the pin, and every step is exactly +1.
*/
const pinIndex = activeLengths.findIndex((l, i) => i > 0 && l === activeLengths[i - 1]);
const strictBefore = activeLengths
  .slice(0, pinIndex < 0 ? activeLengths.length : pinIndex)
  .every((l, i, a) => i === 0 || l === a[i - 1] + 1);
check(
  'the active bar series grows by exactly one per tick until it pins',
  pinIndex > 0 && strictBefore,
  pinIndex > 0 && strictBefore
    ? `${pinIndex} strictly increasing ticks, +1 each, before the first repeat`
    : 'a length repeated (or jumped) while playback was still running'
);

/*
  The other half: once pinned it stays pinned for the rest of the run, so the
  signal cannot flicker off after it has been shown.
*/
const stayedPinned = pinIndex > 0 && activeLengths.slice(pinIndex).every(l => l === activeLengths[pinIndex]);
check(
  'once pinned the active bar series never moves again',
  stayedPinned,
  stayedPinned
    ? `pinned at ${activeLengths[pinIndex]} bars from tick ${pinIndex + 1} (${asTime(pinIndex + 1)}) through tick ${TICKS}`
    : 'the series moved again after pinning — the playhead is looping or rewinding'
);

/* ------------------------------------------------------------------ *
   3. Why the header reads per name instead of calling Feed.atEnd().
 * ------------------------------------------------------------------ */

/*
  THE ASSERTION THAT JUSTIFIES THE DESIGN.

  `atEnd()` is true only when EVERY recording has finished. Playback starts at
  0.8 of each recording, and the recordings are two different lengths, so the
  short names stop moving long before that. A header driven by `atEnd()` would
  sit next to a frozen price saying nothing at all for the gap below.

  If the recordings are ever re-cut to a single length this fails — correctly.
  At that point the gap is gone and the per-name machinery is no longer
  earning its keep.
*/
const pins = Object.entries(pinnedAt).map(([n, t]) => ({ n, t }));
const earliest = pins.reduce((a, b) => (b.t < a.t ? b : a), pins[0]);
const gap = atEndAt - earliest.t;
check(
  'some name stops moving well before Feed.atEnd() would admit it',
  pins.length === NAMES.length && atEndAt > 0 && gap >= 100,
  `${earliest.n} pinned at tick ${earliest.t} (${asTime(earliest.t)}); atEnd() first true at tick ${atEndAt} (${asTime(atEndAt)}) — a ${gap}-tick, ${asTime(gap)} silence`
);

/*
  And the tape is a third clock again, earlier than both. This is why LiveTape
  counts empty batches for itself rather than reading the context's signal:
  by the time either of the other two fires, the tape has been quiet for
  minutes.
*/
const tapeBeforeActivePin = firstEmptyTape > 0 && firstEmptyTape < pinIndex + 1;
check(
  'the tape runs dry before the active recording does',
  tapeBeforeActivePin,
  `tape at tick ${firstEmptyTape} (${asTime(firstEmptyTape)}), ${active} pinned at tick ${pinIndex + 1} (${asTime(pinIndex + 1)}) — ${pinIndex + 1 - firstEmptyTape} ticks apart`
);

/* ------------------------------------------------------------------ *
   4. The UI actually says it.
 * ------------------------------------------------------------------ */

/*
  Comments stripped before matching.

  The first version of the check below searched the raw file for `Feed.atEnd()`
  and failed on the comment that explains why the context does NOT call it —
  a guard that fires on prose is worse than no guard, because it trains you to
  edit the comment. Block comments go first, which covers JSX's braced form
  too; then `//` runs, dropped only when they are not a URL's protocol
  slashes — the one case that appears in this tree.
*/
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const ctx = stripComments(read('src/context/MarketDataContext.tsx'));
const topbar = stripComments(read('src/components/layout/TopBar.tsx'));
const tape = stripComments(read('src/pages/trace/LiveTape.tsx'));

/*
  Coupled to the mechanism, not to the wording: the context must expose the
  flag AND derive it from the bar series, and must NOT be wired to `atEnd()` —
  which would silently reintroduce the gap the assertion above measures.
*/
const ctxDerives = /priceHistory\.length/.test(ctx) && /recordingEnded/.test(ctx);
const ctxAvoidsAtEnd = !/Feed\.atEnd\(\)/.test(ctx);
check(
  'the context derives end-of-recording per name, from the bar series',
  ctxDerives && ctxAvoidsAtEnd,
  ctxDerives
    ? ctxAvoidsAtEnd
      ? 'reads priceHistory.length and exposes recordingEnded'
      : 'wired to Feed.atEnd() — that is the all-names clock, see the gap above'
    : 'no per-name derivation found'
);

const headerSays = /\{recordingEnded && \(/.test(topbar) && /recording played out/.test(topbar);
check(
  'the header says so when the active recording has played out',
  headerSays,
  headerSays ? 'TopBar renders the line under recordingEnded' : 'the header still claims nothing'
);

const tapeSays = /tapePlayedOut/.test(tape) && /recording played out/.test(tape) && /emptyTicksRef/.test(tape);
check(
  'the tape says so when it has no prints left',
  tapeSays,
  tapeSays ? 'LiveTape counts empty batches and puts it in the beam subtitle' : 'the tape goes quiet without saying why'
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
