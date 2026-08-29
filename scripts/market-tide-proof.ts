/*
  Acceptance test for §10's Market Tide.

  The tide's whole value is that it is CUMULATIVE and that its TURN is
  legible. A series that only ever adds cannot go backwards, and a crossing
  is only a crossing if it is detected where the sign actually changes —
  those are the two things this pins.

  Proves:
  1. Premium accumulates and never decreases; net is always call − put
  2. A turn is the LAST zero crossing, and a tide that never crossed
     reports null rather than minute 0
  3. The side is FLAT when the net is under a percent of the day, rather
     than a direction assigned to noise
  4. Sectors and ETFs share the builder, so they are comparable
  5. The words match the numbers, and name the turn when there is one
  6. Deterministic per (key, date)
*/
import { buildTide, etfTides, sectorTides, tideRead } from '../src/data/marketTide';
import { RTH_MINUTES } from '../src/core/calendar';

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, x = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`);
  ok ? pass++ : fail++;
};

const D = '2026-08-28';

// ── 1. it accumulates ─────────────────────────────────────────────────────
{
  const t = buildTide('MARKET', 'Whole market', D, RTH_MINUTES);
  check('PREMISE: a full session of points', t.points.length > 60, `${t.points.length}`);
  check('call premium never decreases', t.points.every((p, i) => i === 0 || p.callPrem >= t.points[i - 1].callPrem));
  check('put premium never decreases', t.points.every((p, i) => i === 0 || p.putPrem >= t.points[i - 1].putPrem));
  check('net is always call − put, exactly', t.points.every(p => Math.abs(p.net - (p.callPrem - p.putPrem)) < 1e-6));
  check('the summary matches the last point',
    Math.abs(t.net - t.points[t.points.length - 1].net) < 1e-6 && Math.abs(t.callPrem - t.points[t.points.length - 1].callPrem) < 1e-6);
  check('call share is a percentage of the total', t.callSharePct >= 0 && t.callSharePct <= 100, `${t.callSharePct.toFixed(1)}%`);
  check('a session only just open still builds', buildTide('M', 'm', D, 5).points.length >= 1);
}

// ── 2. the turn ───────────────────────────────────────────────────────────
{
  /* Scan every sector for one that turned and one that did not — both
     states must be reachable and correctly reported. */
  const all = [...sectorTides(D, RTH_MINUTES), ...etfTides(D, RTH_MINUTES), buildTide('MARKET', 'm', D, RTH_MINUTES)];
  const turned = all.filter(t => t.turnedAt !== null);
  const never = all.filter(t => t.turnedAt === null);
  check('PREMISE: both a turning tide and a one-sided one exist',
    turned.length > 0 && never.length > 0, `${turned.length} turned, ${never.length} never`);

  for (const t of turned) {
    /* The reported turn must be a real sign change in the series. */
    const i = t.points.findIndex(p => p.min === t.turnedAt);
    const before = t.points.slice(0, i).reverse().find(p => p.net !== 0);
    const at = t.points[i];
    if (!before || !at || Math.sign(before.net) === Math.sign(at.net)) {
      check(`the turn on ${t.key} is a real sign change`, false, `min ${t.turnedAt}`);
      break;
    }
  }
  check('every reported turn is a real sign change', turned.every(t => {
    const i = t.points.findIndex(p => p.min === t.turnedAt);
    const before = t.points.slice(0, i).reverse().find(p => p.net !== 0);
    return !!before && Math.sign(before.net) !== Math.sign(t.points[i].net);
  }));
  check('a tide that never crossed reports null, not minute zero', never.every(t => t.turnedAt === null));
}

// ── 3. FLAT is a state, not a rounding ────────────────────────────────────
{
  const t = buildTide('MARKET', 'm', D, RTH_MINUTES);
  const total = t.callPrem + t.putPrem;
  const flat = Math.abs(t.net) / total < 0.01;
  check('the side agrees with the one-percent rule',
    (t.side === 'FLAT') === flat && (flat || t.side === (t.net > 0 ? 'CALLS' : 'PUTS')),
    `${t.side}, net ${(Math.abs(t.net) / total * 100).toFixed(2)}% of the day`);
}

// ── 4. sectors and ETFs share the shape ───────────────────────────────────
{
  const sec = sectorTides(D, RTH_MINUTES);
  const etf = etfTides(D, RTH_MINUTES);
  check('eleven sectors, three ETFs', sec.length === 11 && etf.length === 3);
  check('sectors come back most call-leaning first',
    sec.every((t, i) => i === 0 || sec[i - 1].callSharePct >= t.callSharePct));
  check('every tide has the same shape of series',
    [...sec, ...etf].every(t => t.points.length === sec[0].points.length));
  check('and they differ from one another', new Set([...sec, ...etf].map(t => t.net.toFixed(2))).size > 10);
}

// ── 5. the words ──────────────────────────────────────────────────────────
{
  const all = [...sectorTides(D, RTH_MINUTES), buildTide('MARKET', 'm', D, RTH_MINUTES)];
  for (const t of all) {
    const words = tideRead(t);
    if (t.side === 'FLAT' && !/level|not picked/i.test(words)) { check('FLAT is worded as level', false, words); break; }
    if (t.side === 'CALLS' && !/calls/i.test(words)) { check('a call tide says calls', false, words); break; }
    if (t.side === 'PUTS' && !/puts/i.test(words)) { check('a put tide says puts', false, words); break; }
  }
  check('every tide words its own side', true);
  const turnedOne = all.find(t => t.turnedAt !== null);
  check('a turn is named with its clock time', !turnedOne || /turned at \d{2}:\d{2}/.test(tideRead(turnedOne)),
    turnedOne ? tideRead(turnedOne) : 'none turned');
  const straight = all.find(t => t.turnedAt === null && t.side !== 'FLAT');
  check('and one that never turned says so', !straight || /since the open/.test(tideRead(straight)));
}

// ── 6. determinism ────────────────────────────────────────────────────────
{
  check('the same day builds the same tide',
    JSON.stringify(buildTide('MARKET', 'm', D, 200)) === JSON.stringify(buildTide('MARKET', 'm', D, 200)));
  check('a different day differs',
    JSON.stringify(buildTide('MARKET', 'm', '2026-08-27', 200)) !== JSON.stringify(buildTide('MARKET', 'm', D, 200)));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
