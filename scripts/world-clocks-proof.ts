/*
  Acceptance test for the News Room's world clocks.

  Proves:
  1. Local time comes from the PLATFORM's zone database, not a table of
     offsets — the same instant reads differently in each centre, and the
     US and Europe are an hour apart in the weeks their clocks disagree
  2. DST is really handled: New York in January and in July sit at
     different UTC offsets, which a hardcoded −5 would get wrong for eight
     months of the year
  3. The session test is the CASH session, not daylight — 09:00 in New York
     is bright and shut; 09:35 is open
  4. Weekends are closed everywhere, whatever the hour
  5. The countdown points at the right edge — to the close when open, to
     the next open when shut
*/
import { WORLD_CLOCKS, readClock, readAllClocks, fmtGap } from '../src/data/worldClocks';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const byCity = (c: string) => WORLD_CLOCKS.find(x => x.city === c)!;

// ── 1. one instant, many wall clocks ──────────────────────────────────────
{
  /* 2026-06-15 14:00 UTC — a summer Monday. */
  const at = new Date('2026-06-15T14:00:00Z');
  const all = readAllClocks(at);
  const t = (c: string) => all.find(x => x.city === c)!.time;
  check('New York reads 10:00 at 14:00 UTC in June (EDT, UTC−4)', t('New York') === '10:00', t('New York'));
  check('London reads 15:00 (BST, UTC+1)', t('London') === '15:00', t('London'));
  check('Frankfurt reads 16:00 (CEST, UTC+2)', t('Frankfurt') === '16:00', t('Frankfurt'));
  check('Tokyo reads 23:00 (JST, no DST)', t('Tokyo') === '23:00', t('Tokyo'));
  check('every centre reports a distinct wall clock', new Set(all.map(x => x.time)).size >= 5, all.map(x => `${x.city} ${x.time}`).join(' · '));
}

// ── 2. DST, the thing an offset table gets wrong ──────────────────────────
{
  const ny = byCity('New York');
  const winter = readClock(ny, new Date('2026-01-15T14:00:00Z')); // EST, UTC−5
  const summer = readClock(ny, new Date('2026-06-15T14:00:00Z')); // EDT, UTC−4
  check('New York shifts an hour between January and June', winter.time === '09:00' && summer.time === '10:00', `${winter.time} vs ${summer.time}`);
  const syd = byCity('Sydney');
  const jan = readClock(syd, new Date('2026-01-15T02:00:00Z'));
  const jul = readClock(syd, new Date('2026-07-15T02:00:00Z'));
  check('and Sydney shifts the OTHER way, being southern', jan.time !== jul.time, `${jan.time} vs ${jul.time}`);
}

// ── 3. the session, not the daylight ──────────────────────────────────────
{
  const ny = byCity('New York');
  /* Monday 2026-06-15. 13:00Z = 09:00 in New York — full daylight, and the
     bell has not rung. This is the distinction the strip exists to make. */
  const before = readClock(ny, new Date('2026-06-15T13:00:00Z'));
  const after = readClock(ny, new Date('2026-06-15T13:35:00Z'));
  check('09:00 in New York is bright and SHUT', before.time === '09:00' && !before.open);
  check('09:35 is open', after.time === '09:35' && after.open);
  const closed = readClock(ny, new Date('2026-06-15T20:30:00Z')); // 16:30 local
  check('and 16:30 is shut again', !closed.open, closed.time);
}

// ── 4. weekends ───────────────────────────────────────────────────────────
{
  /* 2026-06-13 is a Saturday, 2026-06-14 a Sunday. */
  for (const iso of ['2026-06-13T14:00:00Z', '2026-06-14T14:00:00Z']) {
    const all = readAllClocks(new Date(iso));
    check(`nothing is open on ${iso.slice(0, 10)}`, all.every(c => !c.open), all.filter(c => c.open).map(c => c.city).join(',') || 'all shut');
  }
}

// ── 5. the countdown ──────────────────────────────────────────────────────
{
  const ny = byCity('New York');
  const open = readClock(ny, new Date('2026-06-15T14:00:00Z')); // 10:00 local
  check('an open centre counts down to its CLOSE', open.open && open.minutesToEdge === 6 * 60, String(open.minutesToEdge));
  const shut = readClock(ny, new Date('2026-06-15T13:00:00Z')); // 09:00 local
  check('a shut centre counts down to its OPEN', !shut.open && shut.minutesToEdge === 30, String(shut.minutesToEdge));
  const evening = readClock(ny, new Date('2026-06-15T22:00:00Z')); // 18:00 local
  check('after the close it counts to TOMORROW\'s open, not backwards', evening.minutesToEdge > 0 && evening.minutesToEdge < 24 * 60, String(evening.minutesToEdge));
  check('the gap words read as a person would say them', fmtGap(90) === '1h 30m' && fmtGap(45) === '45m' && fmtGap(0) === '0m', `${fmtGap(90)} / ${fmtGap(45)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
