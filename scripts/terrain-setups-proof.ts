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
import { DEFAULT_INDICATORS, DEFAULT_OVERLAYS } from '../src/components/gex/StrikeChart';

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
  priceScale: 'normal',
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
/* Same rule as OVERLAY_COUNT: read from the shipped defaults, never a literal.
   A literal here goes stale on the very first indicator the directive adds,
   which is the failure this whole block exists to catch. */
const INDICATOR_COUNT = Object.keys(DEFAULT_INDICATORS).length;
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

/*
  THE SAME GUARD FOR INDICATORS, and it is separate from the overlay one on
  purpose: the two fields are validated by two blocks, and for a while only one
  of them was fixed. A guard that covered "the migration works" through the
  overlay path alone would have been green that entire time.

  Half of the Terrain/Pinpoint directive adds indicators — RSI, MACD, ATR,
  Bollinger, VWAP bands, anchored VWAP, SMA. Every one of them makes today's
  stored records one key short. Before the fix that dropped all four indicators
  from up to sixty symbols, with no error.

  `INDICATOR_KEYS` is bound to `keyof ChartIndicators` by a `satisfies`
  tripwire, so a proof cannot append a fictional fifth key to it at runtime —
  the type would have to change first. The arithmetic that matters is identical
  either way: what breaks is a STORED RECORD that carries fewer keys than the
  list. So the fixture carries three of four, which is exactly the shape every
  saved setup takes the day a fifth indicator ships.
*/
const legacyInd = readSetup({ indicators: { ema9: true, ema21: false, ema50: true } }, 'TSLA');
check(
  'a setup saved before a new indicator existed still returns its indicators',
  !!legacyInd?.indicators,
  legacyInd?.indicators ? 'kept' : 'WIPED — every symbol just lost its indicators'
);
check(
  'and every indicator the reader actually chose survives unchanged',
  legacyInd?.indicators?.ema9 === true &&
    legacyInd?.indicators?.ema21 === false &&
    legacyInd?.indicators?.ema50 === true,
  JSON.stringify(legacyInd?.indicators)
);
check(
  'the indicator they never saw comes back OFF, not on',
  legacyInd?.indicators !== undefined &&
    Object.keys(legacyInd.indicators).length === INDICATOR_COUNT &&
    legacyInd.indicators.vwap === false,
  JSON.stringify(legacyInd?.indicators)
);
/* Junk still yields nothing rather than a full set of invented values — the
   floor that keeps the relaxed gate from accepting anything at all. */
const poisonedInd = readSetup({ seen: 1, indicators: { ema9: 'yes', rsi: true } }, 'SPY');
check(
  'a half-typed indicators object yields no indicators at all',
  !!poisonedInd && !('indicators' in poisonedInd),
  JSON.stringify(poisonedInd)
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
  /*
    THE BUDGET IS A SHARE OF THE QUOTA, not a round number.

    This was `< 20 * 1024`, and adding ONE field to `SymbolSetup` (T-7's
    `priceScale`) took a full map from 19.4 KB to 21.1 KB and turned it red —
    for a change that consumes 0.03% of the storage this assertion exists to
    protect. A literal that a routine field addition can trip is a literal
    that gets bumped by whoever trips it, which is the same thing as not
    having the check at all.

    So it is stated as what it defends: a full map has to stay a rounding
    error against the ~5 MB `localStorage` quota. One percent is two orders of
    magnitude of headroom — enough that a real regression (a field carrying an
    array, a nested history) fails it while a sixth boolean does not.
  */
  const QUOTA_BYTES = 5 * 1024 * 1024;
  const perEntry = Math.round(bytes / SETUP_CAP);
  check(
    `a full map is ${(bytes / 1024).toFixed(1)} KB — ${((bytes / QUOTA_BYTES) * 100).toFixed(2)}% of the quota`,
    bytes < QUOTA_BYTES * 0.01,
    `${bytes} bytes, ${perEntry} per entry`
  );
}

/*
  T-7 · THE SIXTH FIELD, AND WHAT A RECORD WRITTEN BEFORE IT MUST DO.

  `priceScale` is the first field added to `SymbolSetup` since the store
  shipped, so this is the first time the "a stored record is one key short"
  path has been exercised on a TOP-LEVEL field rather than inside overlays or
  indicators. The two are validated differently — the nested ones rebuild a
  full object, this one is a single conditional assignment — so the overlay
  and indicator guards above say nothing about it.

  The requirement is that a record from before T-7 leaves the pane's own scale
  ALONE. Not defaulted to linear, not blanked: `applySetup` spreads the stored
  object over the pane, and a key whose value is literally `undefined`
  overwrites rather than falls through. Assigning `priceScale: undefined` for
  a missing field would silently reset the axis of every symbol a reader has
  ever configured, which is the same shape of bug T-0 was.
*/
{
  const before = readSetup({ seen: 5, timeframe: '5m', chartStyle: 'area' }, 'TSLA');
  check(
    'a setup saved before T-7 still returns its other fields',
    before?.timeframe === '5m' && before?.chartStyle === 'area',
    JSON.stringify(before)
  );
  check(
    'and carries no priceScale KEY at all — not the key set to undefined',
    !!before && !('priceScale' in before),
    JSON.stringify(Object.keys(before ?? {}))
  );
  /* The consequence, stated as the thing a reader would notice. */
  const paneInLog = { ...pane(), priceScale: 'log' as const };
  check(
    'so applying it leaves a pane that was in log IN LOG',
    applySetup(paneInLog, before ?? undefined).priceScale === 'log',
    applySetup(paneInLog, before ?? undefined).priceScale
  );

  check('a valid scale is kept', readSetup({ seen: 1, priceScale: 'indexed' }, 'SPY')?.priceScale === 'indexed');
  /* Junk is DROPPED rather than coerced — the same field-level rule the rest
     of this module follows. A mode this build does not have would otherwise
     reach `chart.priceScale().applyOptions({ mode: undefined })`. */
  const junkScale = readSetup({ seen: 1, timeframe: '1h', priceScale: 'holographic' }, 'SPY');
  check(
    'a scale this build does not have is dropped, and takes nothing with it',
    !!junkScale && !('priceScale' in junkScale) && junkScale.timeframe === '1h',
    JSON.stringify(junkScale)
  );

  /* And it round-trips — the field is in captureSetup as well as readSetup.
     It would be easy to add one and not the other, and the symptom would be a
     scale that never persists rather than an error. */
  const saved = captureSetup({ ...pane(), priceScale: 'log' }, 11);
  const back = readSetup(JSON.parse(JSON.stringify(saved)), 'AAPL');
  check('capture → JSON → read carries the scale', back?.priceScale === 'log', JSON.stringify(back?.priceScale));
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
