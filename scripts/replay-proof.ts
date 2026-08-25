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
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
import { etClock, etHm, etMonthDay } from '../src/core/etFormat';
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
  ---- The candles' clock ----------------------------------------------------

  The capture stamped bars with wall-clock time, so the recordings ran 102
  unbroken hours from 16:44 UTC on a Thursday through the weekend to 23:13 on
  the following Monday — 1,950 continuous one-minute bars with no session
  break. On screen that is a 1m SPY chart with candles at 3am on a Sunday, and
  a time axis reading 21:30 to 24:00.

  Every recording is an exact multiple of 390 bars, which is one 09:30-16:00
  session to the minute, so the generator had built sessions all along and only
  the clock was wrong. They now carry true ET session epochs — true, not
  shifted-so-UTC-reads-as-ET, because the shortcut makes the epoch stop being
  the moment it claims to be and every later join against a real feed inherits
  a four-hour offset. The AXIS is told which zone to speak instead
  (candleTheme.ts).

  Four assertions: whole sessions, weekdays only, inside 09:30-16:00 ET, and
  never running backwards.
*/
{
  const dir = path.join(ROOT, 'src/data/recorded');
  const files = readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'tape.json' && f !== 'index.json');

  // ET is UTC-4 in August (EDT). Reading the parts back out via Intl keeps the
  // check honest about the zone rather than assuming an offset.
  const partsOf = (unix: number) => {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(unix * 1000);
    const get = (t: string) => f.find(p => p.type === t)?.value ?? '';
    return { weekday: get('weekday'), mins: Number(get('hour')) * 60 + Number(get('minute')) };
  };

  const OPEN = 9 * 60 + 30;
  const CLOSE = 15 * 60 + 59;
  const WEEKEND = new Set(['Sat', 'Sun']);

  let total = 0;
  const notWholeSessions: string[] = [];
  const weekendBars: string[] = [];
  const outOfSession: string[] = [];
  const backwards: string[] = [];

  for (const f of files) {
    const bars = (JSON.parse(readFileSync(path.join(dir, f), 'utf8')).bars ?? []) as number[][];
    if (bars.length === 0 || bars.length % 390 !== 0) notWholeSessions.push(`${f}:${bars.length}`);
    let prev = -Infinity;
    for (const b of bars) {
      total++;
      const { weekday, mins } = partsOf(b[0]);
      if (WEEKEND.has(weekday)) weekendBars.push(`${f} ${weekday}`);
      if (mins < OPEN || mins > CLOSE) outOfSession.push(`${f} ${mins}`);
      if (b[0] < prev) backwards.push(f);
      prev = b[0];
    }
  }

  check(
    'every recording is a whole number of 390-bar sessions',
    files.length >= 20 && notWholeSessions.length === 0,
    notWholeSessions.length ? notWholeSessions.join(', ') : `${files.length} recordings, ${total} bars`
  );
  check(
    'no recorded bar lands on a weekend',
    weekendBars.length === 0,
    weekendBars.length ? `${weekendBars.length} weekend bars, e.g. ${weekendBars[0]}` : 'weekdays only'
  );
  check(
    'no recorded bar lands outside 09:30-16:00 Eastern',
    outOfSession.length === 0,
    outOfSession.length ? `${outOfSession.length} outside, e.g. ${outOfSession[0]}` : `all ${total} in session`
  );
  check(
    'no recording runs backwards',
    backwards.length === 0,
    backwards.length ? [...new Set(backwards)].join(', ') : 'monotonic'
  );
}

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

/*
  ---- One display clock, and it is Eastern ---------------------------------

  `toLocaleTimeString` with no timeZone renders in the VIEWER's zone, so one
  recorded 15:59 bar read 15:59 in New York, 20:59 in London and 04:59 the
  next morning in Tokyo — while the chart axis beside it, which the same
  commit pinned to ET, said 15:59 for all three. Sixteen call sites, sixteen
  clocks, none of them labelled.

  `toLocaleDateString(undefined, ...)` took the viewer's LOCALE too, so a date
  rendered "Aug 24" or "24 août" depending on the browser.

  Two assertions. The first is a scan: nothing under src/ may format a date or
  time without naming a zone, with core/etFormat.ts the single exception since
  that is where the zone is named. It counts toLocaleTimeString and
  toLocaleDateString always, and bare toLocaleString only when Date appears on
  the same line — Number carries toLocaleString too, and the first version of
  this flagged a thousands separator for an index price. The second runs the helpers
  against a known instant, because a scan only proves the call sites route
  through a module — not that the module is pointing at New York.
*/
{
  const skip = 'src/core/etFormat.ts';
  const offenders: string[] = [];
  const walkSrc = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walkSrc(full, out);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  };
  const files = walkSrc(path.join(ROOT, 'src'));
  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (rel === skip) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const dateOnly = /toLocale(Time|Date)String\s*\(/.test(line);
        const ambiguous = /\.toLocaleString\s*\(/.test(line) && /\bDate\b/.test(line);
        if (!dateOnly && !ambiguous) return;
        if (/timeZone/.test(line)) return;
        offenders.push(`${rel}:${i + 1}`);
      });
  }
  check(
    'no date or time is formatted in the viewer timezone',
    files.length > 100 && offenders.length === 0,
    offenders.length ? offenders.join(', ') : `${files.length} files scanned, none`
  );
}

{
  // 2026-08-24T19:59:00Z is 15:59 in New York (EDT, UTC-4) — the last bar of
  // the recorded session. If the helpers ever stop naming the zone, this
  // prints the container's UTC 19:59 and fails.
  const LAST_BAR = Date.UTC(2026, 7, 24, 19, 59, 0) / 1000;
  const hm = etHm(LAST_BAR);
  const clock = etClock(new Date(LAST_BAR * 1000));
  const day = etMonthDay(LAST_BAR);
  check(
    'the display helpers really render Eastern',
    hm === '15:59' && clock === '15:59:00' && day === 'Aug 24',
    `etHm=${hm} etClock=${clock} etMonthDay=${day} (expected 15:59 / 15:59:00 / Aug 24)`
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
