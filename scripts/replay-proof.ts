/*
  Acceptance test for the replay seams. Runs the ACTUAL engine modules
  headless — the exact thing a backtest harness will do.

  Proves:
  1. Same snapshot + same pinned clock  → bit-identical scan + weigh output
  2. Same snapshot + DIFFERENT pinned day → different day-seeded output
     (dayKey actually flows through the clock, not the wall)
  3. Expiry resolution follows the PINNED calendar: a Friday pin resolves
     "2 days" to Monday; a Tuesday pin resolves it to Thursday
  4. Engine modules import cleanly without booting the simulator
  5. occSymbol builds the canonical OCC key correctly
*/
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
import { withEngineClock } from '../src/core/clock';
import { weighContracts } from '../src/core/contractScore';
import { buildCompassView } from '../src/data/compass';
import { expiryFor } from '../src/core/calendar';
import { occSymbol, decisionId, optionContractId } from '../src/core/journal';
import type { MarketSnapshot } from '../src/types/market';

// A minimal hand-built snapshot — NO simulator import anywhere in this file.
function fakeSnapshot(): MarketSnapshot {
  const spot = 500;
  const chain = Array.from({ length: 31 }, (_, i) => {
    const strike = 485 + i;
    return {
      strike, callOI: 5000, putOI: 5200, gamma: 0.02,
      callGex: -1e6, putGex: 8e5, netGex: -2e5,
      callDex: -1e6, putDex: 5e5, netDex: -5e5,
      callVex: 1e4, putVex: -1e4, netVex: 0,
      vanna: 0, charm: 0,
    };
  });
  return {
    ticker: 'SPY', spot, changePercent: -0.5,
    priceHistory: Array.from({ length: 100 }, (_, i) => spot - 1 + i * 0.02),
    chain,
    indicators: { rsi: 55, ema9: spot, ema21: spot - 1, ema50: spot - 2, squeeze: false },
    plan: { bias: 'NEUTRAL', supportWall: 495, resistanceWall: 505, flipLevel: 499, note: '' },
    tape: [],
  } as unknown as MarketSnapshot;
}

const snap = fakeSnapshot();
const universe = [{ ticker: 'SPY', price: 500, iv: 0.15, step: 1 }];
const dayA = new Date(2026, 2, 10, 15, 0, 0); // Tue Mar 10 2026
const dayA2 = new Date(2026, 2, 10, 9, 45, 0); // same day, different time
const dayB = new Date(2026, 2, 11, 15, 0, 0); // Wed Mar 11

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// 1. determinism under a pinned clock
const runScan = () => JSON.stringify(buildCompassView(snap, 'top-setups', universe, 'weekly'));
const runWeigh = () => JSON.stringify(weighContracts(snap, 'WEEKLIES'));
const scanA1 = withEngineClock(dayA, runScan);
const scanA2 = withEngineClock(dayA, runScan);
check('scan bit-identical under same pinned clock', scanA1 === scanA2);
const weighA1 = withEngineClock(dayA, runWeigh);
const weighA2 = withEngineClock(dayA2, runWeigh); // same DAY, different hour
check('weigh bit-identical under same pinned DAY (hour irrelevant)', weighA1 === weighA2);

// 2. day actually flows — different pinned day re-rolls day-seeded inputs
const weighB = withEngineClock(dayB, runWeigh);
check('weigh differs across pinned days (dayKey follows the clock)', weighA1 !== weighB);

// 3. calendar follows the pin
const friday = new Date(2026, 6, 24); // Fri Jul 24 2026
const twoOutFromFri = withEngineClock(friday, () => expiryFor(2));
check('Friday pin: "2 days" resolves to Monday', twoOutFromFri.weekday === 'Mon', `${twoOutFromFri.weekday} ${twoOutFromFri.label}`);
const tuesday = new Date(2026, 6, 21);
const twoOutFromTue = withEngineClock(tuesday, () => expiryFor(2));
check('Tuesday pin: "2 days" resolves to Thursday', twoOutFromTue.weekday === 'Thu', `${twoOutFromTue.weekday} ${twoOutFromTue.label}`);
// weigh output expiry labels change with the pin (scoreCandidate resolves through the clock)
const weighFri = withEngineClock(friday, runWeigh);
const weighTue = withEngineClock(tuesday, runWeigh);
const labels = (s: string) => [...new Set([...s.matchAll(/"expiryLabel":"([^"]+)"/g)].map(m => m[1]))].join(',');
check('scored expiries follow the pinned calendar', labels(weighFri) !== labels(weighTue), `Fri→[${labels(weighFri)}] Tue→[${labels(weighTue)}]`);

// 3.5 the eligibility gate lives in the ENGINE — an ineligible lens×tenor
// combination (a scalp on LEAPS) yields an EMPTY scan, never candidates.
const ineligible = withEngineClock(dayA, () =>
  buildCompassView(snap, 'quick-scalp', universe, 'leaps')
);
check('ineligible lens×tenor scans empty', ineligible.totalFound === 0 && ineligible.groups.length === 0);
const eligible = withEngineClock(dayA, () => buildCompassView(snap, 'quick-scalp', universe, 'weekly'));
check('the same lens on an eligible tenor scans', eligible.totalFound > 0, `${eligible.totalFound} found`);

// 4. occ + decision identity
const occ = occSymbol('SPY', '2026-07-31', 'C', 500);
check('OCC symbol exact', occ === 'SPY   260731C00500000', occ);
const occHalf = occSymbol('AAPL', '2026-08-01', 'P', 183.5);
check('OCC half-dollar strike pads to 00183500', occHalf === 'AAPL  260801P00183500', occHalf);
const id = decisionId(
  optionContractId('SPY', '2026-07-31', 'C', 500),
  { kind: 'scanner', scanner: 'top-setups', sleeve: 'weekly' },
  '2026-07-29T15:00:00Z'
);
check('decision id shape (sleeve-aware source)', id === 'SPY   260731C00500000|scanner:top-setups@weekly|2026-07-29T15:00:00Z', id);
const idNoSleeve = decisionId(optionContractId('SPY', '2026-07-31', 'C', 500), { kind: 'scanner', scanner: 'all' }, '2026-07-29T15:00:00Z');
check('decision id shape (sleeveless source)', idNoSleeve === 'SPY   260731C00500000|scanner:all|2026-07-29T15:00:00Z', idNoSleeve);


/*
  ---- The tape's clock ------------------------------------------------------

  The capture stamped every print with `new Date()`, so all 1,013 landed on
  11:20:31 or 11:20:32 PM: a whole session's tape claiming to have crossed
  inside two seconds, at an hour the market is shut, in the first column of
  the first panel on the Trace desk. It also contradicted the dark-pool table
  beside it, which prints ET session times.

  Three assertions, because a re-capture is exactly the thing that would put
  it back: the stamps stay inside the 09:30-16:00 session, they never go
  backwards (replay order IS chronological order, and the tape says "newest
  first"), and they are not all the same instant.
*/
{
  const tape = JSON.parse(
    readFileSync(path.join(ROOT, 'src/data/recorded/tape.json'), 'utf8')
  ) as { time: string }[];

  const secs = tape.map(p => {
    const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(p.time);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
  });

  const OPEN = 9 * 3600 + 30 * 60;
  const CLOSE = 16 * 3600;
  const shaped = secs.every(n => Number.isFinite(n));
  check(
    'every tape print carries an HH:MM:SS stamp',
    shaped && tape.length > 100,
    shaped ? `${tape.length} prints parsed` : 'a stamp is not HH:MM:SS — a wall-clock format is back'
  );

  const outside = secs.filter(n => Number.isFinite(n) && (n < OPEN || n >= CLOSE));
  check(
    'no tape print lands outside the session',
    outside.length === 0,
    outside.length ? `${outside.length} outside 09:30-16:00` : `09:30-16:00, all ${secs.length}`
  );

  let backwards = 0;
  for (let i = 1; i < secs.length; i++) if (secs[i] < secs[i - 1]) backwards++;
  check(
    'the tape never runs backwards',
    backwards === 0,
    backwards ? `${backwards} print(s) go back in time` : 'monotonic in replay order'
  );

  check(
    'the tape is not one frozen instant',
    new Set(secs).size > secs.length / 2,
    `${new Set(secs).size} distinct stamps across ${secs.length} prints`
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
