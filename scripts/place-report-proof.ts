/*
  Acceptance test for the globe's place report — what a click on the planet
  answers.

  Proves:
  1. The nearest region is genuinely the nearest, and the distance it
     reports is the real great-circle gap — not a bounding-box guess
  2. A click in open ocean is told it is remote, and the nearest centre is
     NAMED rather than silently claimed as the place clicked
  3. Origins and landings are kept apart, and no story is counted as both —
     the distinction is the whole reason this surface exists
  4. A story appears as a LANDING only where it actually reaches, not
     wherever it came from
  5. The pressure weights match the heat layer's currency (severity x
     freshness) and the lean follows them, with a tie leaning neither way
  6. Local time is read for every region, exchange or not, and the session
     state only appears where a market actually trades
*/
import { placeAt, placeRead, distanceKm, bearingFrom, PLACE_REGIONS } from '../src/data/placeReport';
import { buildGeoNews, freshnessOf, FRESHNESS_FACTOR } from '../src/data/newsroom';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const events = buildGeoNews();
const AT = new Date('2026-08-30T14:30:00Z');

// ── 1. distance is real geometry ─────────────────────────────────────────
{
  check('PREMISE: the room has stories to place', events.length > 0, `${events.length}`);

  // A known pair: New York to London is ~5,570km.
  const nyLon = distanceKm(40.71, -74.01, 51.51, -0.13);
  check('New York to London measures right', Math.abs(nyLon - 5570) < 60, `${Math.round(nyLon)}km`);
  // Antipodal-ish: the clamp must not blow up.
  const far = distanceKm(0, 0, 0, 180);
  check('half the planet is half the circumference', Math.abs(far - 20015) < 30, `${Math.round(far)}km`);
  check('a point is zero from itself', distanceKm(35, 139, 35, 139) === 0);
  /* The sphere's own asymmetry, which a lat/lng swap cannot fake: a degree
     of latitude is ~111km everywhere, a degree of longitude shrinks by
     cos(lat) and is ~55.6km at 60 degrees north. */
  const degNS = distanceKm(60, 20, 61, 20);
  const degEW = distanceKm(60, 20, 60, 21);
  check('a degree of latitude is ~111km', Math.abs(degNS - 111.2) < 0.5, `${degNS.toFixed(1)}km`);
  check('a degree of longitude at 60N is half that', Math.abs(degEW - 55.6) < 0.5, `${degEW.toFixed(1)}km`);

  // The nearest region really is the nearest of all of them.
  for (const [lat, lng] of [[35.7, 139.7], [51.5, -0.1], [-20, -50], [60, 100]] as [number, number][]) {
    const p = placeAt(lat, lng, events, 1200, AT);
    const trueMin = Math.min(...PLACE_REGIONS.map(r => distanceKm(lat, lng, r.lat, r.lng)));
    check(
      `nearest region at ${lat},${lng} is the actual nearest`,
      Math.abs(p.km - trueMin) < 1,
      `${p.region.name} ${p.km}km vs ${Math.round(trueMin)}km`
    );
  }
}

// ── 2. a remote click says so ────────────────────────────────────────────
{
  // Mid-South-Pacific — nothing within thousands of km.
  const p = placeAt(-30, -140, events, 1200, AT);
  check('open ocean is flagged remote', p.remote, `nearest ${p.region.name} ${p.km}km`);
  check('— and the nearest centre is still named', p.region.name.length > 0);
  check('— with nothing claimed for it', p.origins.length === 0 && p.landings.length === 0);
  const read = placeRead(p);
  check('the sentence says nothing is happening', /Nothing is happening here/.test(read), read.slice(0, 60));
  check('— and names the gap', read.includes(p.km.toLocaleString()));

  const onIt = placeAt(51.51, -0.13, events, 1200, AT);
  check('a click on a centre is NOT remote', !onIt.remote && onIt.km === 0, `${onIt.region.name} ${onIt.km}km`);
}

// ── 3. origins and landings never double-count ───────────────────────────
{
  let checkedSomewhere = false;
  for (const r of PLACE_REGIONS) {
    const p = placeAt(r.lat, r.lng, events, 1200, AT);
    const oIds = new Set(p.origins.map(h => h.event.id));
    const lIds = new Set(p.landings.map(h => h.event.id));
    const both = [...oIds].filter(id => lIds.has(id));
    check(`${r.name}: no story is both an origin and a landing`, both.length === 0, both.join(','));
    // Each list holds each story at most once, even when a story drew
    // three impact dots in the same metro.
    check(`${r.name}: landings list each story once`, lIds.size === p.landings.length);
    if (p.origins.length > 0 && p.landings.length > 0) checkedSomewhere = true;
  }
  check('PREMISE: at least one place has both kinds', checkedSomewhere);
}

// ── 4. a landing is where a story REACHES ────────────────────────────────
{
  const withImpacts = events.find(e => e.impacts.length > 0);
  if (!withImpacts) {
    check('PREMISE: some story has impact zones', false);
  } else {
    check('PREMISE: some story has impact zones', true, `${withImpacts.item.ticker ?? 'macro'}`);
    const z = withImpacts.impacts[0];
    const p = placeAt(z.lat, z.lng, events, 1200, AT);
    const here = p.origins.some(h => h.event.id === withImpacts.id) || p.landings.some(h => h.event.id === withImpacts.id);
    check('a story is present where it lands', here, `${p.region.name}`);

    // And it is NOT present somewhere it neither came from nor reaches.
    const away = placeAt(-30, -140, events, 1200, AT);
    check('— and absent where it does neither', !away.landings.some(h => h.event.id === withImpacts.id));

    // Every landing carries the zone label that caught it, so the panel can
    // print a trajectory rather than a bare distance.
    const anyLanding = PLACE_REGIONS.map(r => placeAt(r.lat, r.lng, events, 1200, AT)).flatMap(p2 => p2.landings);
    check('PREMISE: landings exist to inspect', anyLanding.length > 0, `${anyLanding.length}`);
    check('every landing names the zone that caught it', anyLanding.every(h => !!h.zone));
    check('every landing is inside the catchment', anyLanding.every(h => h.km <= 1200));
  }
}

// ── 5. weights are the heat layer's currency ─────────────────────────────
{
  const p = PLACE_REGIONS.map(r => placeAt(r.lat, r.lng, events, 1200, AT)).find(x => x.origins.length + x.landings.length > 1);
  if (!p) {
    check('PREMISE: a busy place to weigh', false);
  } else {
    check('PREMISE: a busy place to weigh', true, `${p.region.name}`);
    const all = [...p.origins, ...p.landings];
    check(
      'each weight is severity x freshness, exactly',
      all.every(h => Math.abs(h.weight - h.event.severity * FRESHNESS_FACTOR[freshnessOf(h.event)]) < 1e-9)
    );
    const t = all.filter(h => h.event.grade === 'THREAT').reduce((s, h) => s + h.weight, 0);
    const a = all.filter(h => h.event.grade === 'ALLY').reduce((s, h) => s + h.weight, 0);
    check('the threat tally sums its own rows', Math.abs(p.threat - Number(t.toFixed(1))) < 0.05, `${p.threat} vs ${t.toFixed(1)}`);
    check('the ally tally sums its own rows', Math.abs(p.ally - Number(a.toFixed(1))) < 0.05, `${p.ally} vs ${a.toFixed(1)}`);
    const want = p.threat > p.ally ? 'THREAT' : p.ally > p.threat ? 'ALLY' : 'WATCH';
    check('the lean follows the weights', p.lean === want, `${p.lean}`);
  }
  // A tie leans NEITHER way — not toward whichever side was tested first.
  const empty = placeAt(-30, -140, events, 1200, AT);
  check('an even board leans neither way', empty.threat === empty.ally && empty.lean === 'WATCH');
}

// ── 6. clocks: local time always, session only where one trades ──────────
{
  for (const r of PLACE_REGIONS) {
    const p = placeAt(r.lat, r.lng, events, 1200, AT);
    check(`${r.name}: reads a real local time`, /^\d{2}:\d{2}$/.test(p.localTime), p.localTime);
    if (r.clock) {
      check(`${r.name}: hosts a session, so it has a clock read`, p.clock !== null);
    } else {
      check(`${r.name}: no exchange, so no session claimed`, p.clock === null);
    }
  }
  // The time genuinely tracks the zone: Tokyo is ahead of New York.
  const tokyo = placeAt(35.68, 139.69, events, 1200, AT);
  const ny = placeAt(40.71, -74.01, events, 1200, AT);
  check('the two clocks differ', tokyo.localTime !== ny.localTime, `${tokyo.localTime} vs ${ny.localTime}`);
  // 14:30Z is 23:30 in Tokyo and 10:30 in New York on this date.
  check('Tokyo reads 23:30 at 14:30Z', tokyo.localTime === '23:30', tokyo.localTime);
  check('New York reads 10:30 at 14:30Z', ny.localTime === '10:30', ny.localTime);
}

// ── 7. the bearing points the right way ──────────────────────────────────
{
  const ldn = PLACE_REGIONS.find(r => r.name === 'London')!;
  check('north of London reads north', bearingFrom(ldn, 60, -0.13) === 'north');
  check('south-west of London reads so', bearingFrom(ldn, 45, -20) === 'south-west');
  check('on top of it reads "right on"', bearingFrom(ldn, 51.51, -0.13) === 'right on');
  // The antimeridian must not turn a short hop into a half-world bearing.
  const tky = PLACE_REGIONS.find(r => r.name === 'Tokyo')!;
  check('crossing the dateline still reads east', bearingFrom(tky, 35.68, -179) === 'east');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
