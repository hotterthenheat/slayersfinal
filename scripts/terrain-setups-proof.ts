/*
  Acceptance test for Terrain's symbol memory. Runs the ACTUAL store module —
  no browser, no React, no simulator.

  Proves:
  1. A symbol nobody has configured leaves the pane exactly as it was
  2. Validation drops FIELDS, not whole records — one retired interval must not
     cost a reader their whole setup for that name
  3. A rejected field falls through to the pane rather than blanking it
  4. Junk keys inside overlays/indicators never reach the pane
  5. A setup cannot put a symbol on its own tape
  6. The cap holds, and it evicts the least recently touched
  7. A full map at the cap stays small enough to be worth keeping
*/
import {
  SETUP_CAP,
  applySetup,
  captureSetup,
  evict,
  readSetup,
  readSetups,
  symKey,
  type SetupMap,
  type SymbolSetup,
} from '../src/pages/terrain/setups';
import { DEFAULT_OVERLAYS } from '../src/components/gex/StrikeChart';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

/* Today's shape, carrying EVERY overlay. The other fixtures below deliberately
   carry four — they stand for records written before `flow` existed, which is
   the whole point of the migration assertions. */
/*
  The pane fixture spreads DEFAULT_OVERLAYS rather than listing the overlays.

  It used to list them, and the list went stale twice: once when `flow` landed
  and again when the two drift panes did. Both times an assertion about JUNK
  HANDLING failed for a reason that had nothing to do with junk, which is the
  worst kind of red — it teaches you to edit the test instead of reading it.
  Spreading the shipped defaults means a new overlay arrives here already
  counted, and the two this fixture actually cares about are still named.
*/
const pane = (): SymbolSetup => ({
  timeframe: '1h',
  overlays: { ...DEFAULT_OVERLAYS, trails: true, levels: true, darkpool: false, volume: true },
  indicators: { ema9: false, ema21: true, ema50: false, vwap: false },
  chartStyle: 'candles',
  compares: [],
});

// 1. the never-seen symbol — the whole reason this is unsurprising
const untouched = applySetup(pane(), undefined);
check(
  'a symbol with no setup leaves the pane byte-for-byte alone',
  JSON.stringify(untouched) === JSON.stringify(pane()),
  JSON.stringify(untouched.timeframe)
);

// 2 + 3. field-level validation, and a rejected field must FALL THROUGH
const retired = readSetup(
  {
    seen: 5,
    timeframe: '3m', // never existed
    chartStyle: 'line',
    overlays: { trails: false, levels: false, darkpool: true, volume: false },
  },
  'NVDA'
);
check('a retired interval is dropped', !!retired && !('timeframe' in retired));
check('and the rest of that setup survives it', retired?.chartStyle === 'line' && retired?.overlays?.darkpool === true);
const fellThrough = applySetup(pane(), retired ?? undefined);
check(
  'the dropped field falls through to the pane instead of blanking it',
  fellThrough.timeframe === '1h',
  String(fellThrough.timeframe)
);
check('while the valid fields do apply', fellThrough.chartStyle === 'line' && fellThrough.overlays.darkpool === true);

// 4. junk inside a nested object
const poisoned = readSetup({ seen: 1, overlays: { trails: 'yes', ghost: true } }, 'SPY');
check(
  'a half-typed overlays object yields no overlays at all, not a poisoned one',
  !!poisoned && !('overlays' in poisoned),
  JSON.stringify(poisoned)
);
const withJunk = readSetup(
  { seen: 1, overlays: { trails: true, levels: true, darkpool: true, volume: true, ghost: true } },
  'SPY'
);
/*
  The count comes from the SHIPPED DEFAULTS, not from a literal and not from
  this file's own fixture.

  It was `=== 4`, then a fixture's key count — and the fixture was a literal
  one level down, so it went stale on the very next overlay anyway.
  DEFAULT_OVERLAYS is the type's canonical instance, and setups.ts is held to
  the same type by a `satisfies` tripwire that fails the build if it drifts, so
  reading the count from there cannot silently disagree with the module under
  test.
*/
const OVERLAY_COUNT = Object.keys(DEFAULT_OVERLAYS).length;
check(
  'and an extra key is dropped rather than carried',
  !!withJunk?.overlays && !('ghost' in withJunk.overlays) && Object.keys(withJunk.overlays).length === OVERLAY_COUNT,
  `${withJunk?.overlays ? Object.keys(withJunk.overlays).length : 'none'} of ${OVERLAY_COUNT}`
);

/*
  ADDING AN OVERLAY MUST NOT COST A READER THE ONES THEY ALREADY SET.

  The gate here used to be `length === OVERLAY_KEYS.length` — a stored record
  had to carry EVERY overlay or the whole field was thrown away. That is
  invisible until an overlay is added, at which point every setup ever saved is
  one key short and every symbol loses ALL of its overlays at once, for a key
  the reader has never heard of. Measured against the real store before the fix:
  the overlays field vanished from every stored symbol.

  This is the regression guard for that. The fixture is deliberately written as
  a record from BEFORE the new key existed.
*/
const legacy = readSetup(
  { overlays: { trails: true, levels: false, darkpool: true, volume: false } },
  'TSLA'
);
check(
  'a setup saved before a new overlay existed still returns its overlays',
  !!legacy?.overlays,
  legacy?.overlays ? 'kept' : 'WIPED — every symbol just lost its overlays'
);
check(
  'and every value the reader actually chose survives unchanged',
  legacy?.overlays?.trails === true &&
    legacy?.overlays?.levels === false &&
    legacy?.overlays?.darkpool === true &&
    legacy?.overlays?.volume === false,
  JSON.stringify(legacy?.overlays)
);
check(
  'the key they never saw comes back OFF, not on',
  legacy?.overlays !== undefined &&
    Object.keys(legacy.overlays).length === OVERLAY_COUNT &&
    Object.entries(legacy.overlays).every(
      ([k, v]) => ['trails', 'levels', 'darkpool', 'volume'].includes(k) || v === false
    ),
  JSON.stringify(legacy?.overlays)
);

// 5. a symbol cannot compare against itself
const selfie = readSetup(
  {
    seen: 1,
    compares: [
      { ticker: 'spy', mode: 'percent', ink: '#fff' },
      { ticker: 'QQQ', mode: 'percent', ink: '#000' },
    ],
  },
  'SPY'
);
check(
  'a stored comparison on the symbol itself is dropped, case-insensitively',
  selfie?.compares?.length === 1 && selfie.compares[0].ticker === 'QQQ',
  JSON.stringify(selfie?.compares)
);

// bad modes and shapes
const junkCompare = readSetup(
  { seen: 1, compares: [{ ticker: 'QQQ', mode: 'sideways', ink: '#000' }, null, { ticker: 5 }] },
  'SPY'
);
check('malformed comparisons are dropped', junkCompare?.compares?.length === 0, JSON.stringify(junkCompare?.compares));

// keys that are not tickers
const keyed = readSetups({ SPY: { seen: 1 }, 'not a ticker!!': { seen: 2 }, '': { seen: 3 } });
check('only ticker-shaped keys survive', Object.keys(keyed).join(',') === 'SPY', Object.keys(keyed).join(','));
check('lower-case keys are folded to one name', Object.keys(readSetups({ spy: { seen: 1 } })).join(',') === 'SPY');

// 6. the cap
{
  const big: SetupMap = {};
  for (let i = 0; i < 200; i++) big[`S${i}`] = captureSetup(pane(), i);
  const kept = evict(big);
  const keys = Object.keys(kept);
  check(`${SETUP_CAP} is the ceiling`, keys.length === SETUP_CAP, String(keys.length));
  const seens = keys.map(k => kept[k].seen);
  check(
    'and the ones kept are the most recently touched',
    Math.min(...seens) === 200 - SETUP_CAP && Math.max(...seens) === 199,
    `${Math.min(...seens)}..${Math.max(...seens)}`
  );
  check('a map under the cap is returned untouched', evict({ A: { seen: 1 } }) !== undefined && Object.keys(evict({ A: { seen: 1 } })).length === 1);
}

// 7. what it costs
{
  const full: SetupMap = {};
  for (let i = 0; i < SETUP_CAP; i++) {
    full[`SYM${i}`] = captureSetup(
      { ...pane(), compares: [{ ticker: 'QQQ', mode: 'percent', ink: '#5B9CF6' }] },
      1700000000000 + i
    );
  }
  const bytes = JSON.stringify(full).length;
  check(`a full map is ${(bytes / 1024).toFixed(1)} KB — small enough to keep`, bytes < 20 * 1024, `${bytes} bytes`);
}

// symKey
check('symKey trims and upper-cases', symKey('  spy ') === 'SPY');

// a round trip
{
  const saved = captureSetup({ ...pane(), timeframe: '5m', chartStyle: 'area' }, 9);
  const back = readSetup(JSON.parse(JSON.stringify(saved)), 'AAPL');
  const applied = applySetup(pane(), back ?? undefined);
  check(
    'capture → JSON → read → apply is lossless',
    applied.timeframe === '5m' && applied.chartStyle === 'area' && applied.indicators.ema21 === true
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
