/*
  Acceptance test for 8.3 — what a pin on the globe actually claims.

  "Label the semantic explicitly on the surface: plotted at company
   headquarters, not where it happened. The honesty is the feature — do not
   let a reader infer event geography."

  And its companion: "Unavailable state for non-US and non-corporate news —
  a story with no ticker and no country cannot be plotted. Show it in the
  list, absent from the globe, and say so rather than dropping it silently."

  THE DEFECT THIS REPLACES was worse than dropping. `HQ[ticker] ??
  LISTING_VENUE` sent every company not in the registry to New York, and
  the label called it "origin" — so a Linde story (Woking) and a Procter &
  Gamble story (Cincinnati) were pinned to lower Broadway and presented as
  where the news came from. A dot on a globe is a claim, and that one was
  made confidently about a place chosen because it was convenient.
*/
import { readFileSync } from 'node:fs';
import {
  buildGeoNews, placedEvents, severityWord, PLACEMENT_WORDS, PLACEMENT_NOTES,
  SEVERITY_METHOD, SEVERITY_RUNGS, GRADE_CUT, GRADE_NOTES,
  bandFor, BAND_CUTS, BAND_WORDS, spreadStories, openingView, clusterByCity,
  type PlacementKind,
} from '../src/data/newsroom';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const events = buildGeoNews();
check('PREMISE: there is a feed to place', events.length > 5, `${events.length} stories`);

// ── every story knows how it was placed ─────────────────────────────────
{
  const kinds: PlacementKind[] = ['headquarters', 'macro-region', 'unplaced'];
  check('every story carries a placement', events.every(e => kinds.includes(e.placed)));
  check('every placement has a word and a note',
    kinds.every(k => PLACEMENT_WORDS[k]?.length > 0 && PLACEMENT_NOTES[k]?.length > 40));

  /* The words must not say "origin" — that is the inference the whole
     change exists to stop the reader making. */
  check('nothing in the vocabulary calls a headquarters an origin',
    !/origin/i.test(PLACEMENT_WORDS.headquarters + PLACEMENT_NOTES.headquarters),
    PLACEMENT_WORDS.headquarters);
  check('and the headquarters note says explicitly it is not where it happened',
    /not where the news happened/i.test(PLACEMENT_NOTES.headquarters));
}

// ── the fallback is gone ────────────────────────────────────────────────
{
  /*
    A COMPANY WITH NO REGISTERED HQ IS UNPLACED, not New York. Checked
    against the story's own ticker rather than against a list of names, so
    adding a company to the registry cannot silently break this.
  */
  const src = readFileSync('src/data/newsroom.ts', 'utf8');
  const registry = new Set([...src.matchAll(/^\s{2}([A-Z]{1,5}):\s*\{\s*lat:/gm)].map(m => m[1]));
  check('the HQ registry parsed', registry.size > 20, `${registry.size} companies`);

  let wrongPlace = '';
  for (const e of events) {
    const t = e.item.ticker;
    if (!t) continue;
    const known = registry.has(t);
    if (known && e.placed !== 'headquarters') { wrongPlace = `${t} is in the registry but placed ${e.placed}`; break; }
    if (!known && e.placed !== 'unplaced') { wrongPlace = `${t} is NOT in the registry but placed ${e.placed}`; break; }
  }
  check('a company in the registry is placed at its head office, and one that is not is unplaced',
    wrongPlace === '', wrongPlace);

  const unplaced = events.filter(e => e.placed === 'unplaced');
  check('the unplaced stories are still IN the feed', unplaced.every(e => events.includes(e)));
  check('and out of the globe\'s data', placedEvents(events).every(e => e.placed !== 'unplaced'));
  check('placedEvents drops exactly the unplaced ones',
    placedEvents(events).length === events.length - unplaced.length);

  /* A ticker story that IS placed must not be sitting on the listing
     venue by accident — the specific coordinates the fallback used. */
  const NYC = { lat: 40.71, lng: -74.01 };
  const suspicious = events.filter(
    e => e.placed === 'headquarters' && e.origin.lat === NYC.lat && e.origin.lng === NYC.lng && !registry.has(e.item.ticker ?? '')
  );
  check('nothing is pinned to the old fallback coordinates by accident',
    suspicious.length === 0, suspicious.map(e => e.item.ticker).join(', '));
}

// ── the labels ───────────────────────────────────────────────────────────
{
  const hq = events.filter(e => e.placed === 'headquarters');
  check('a headquarters label says headquarters',
    hq.length === 0 || hq.every(e => /headquarters/i.test(e.origin.label)),
    hq[0]?.origin.label);
  check('and none of them says "origin"',
    hq.every(e => !/origin/i.test(e.origin.label)),
    hq.find(e => /origin/i.test(e.origin.label))?.origin.label);

  const macro = events.filter(e => e.placed === 'macro-region');
  check('a macro label names the region rather than a company',
    macro.length === 0 || macro.every(e => /region/i.test(e.origin.label)),
    macro[0]?.origin.label);

  const un = events.filter(e => e.placed === 'unplaced');
  check('an unplaced story does not claim a city', un.every(e => !/·/.test(e.origin.label)),
    un[0]?.origin.label);
}

// ── the surface says so ─────────────────────────────────────────────────
{
  const pane = readFileSync('src/pages/newsroom/GlobePane.tsx', 'utf8');
  check('the globe draws only placeable stories', /placedEvents\(events\)/.test(pane));
  check('and the caption states the semantic on the surface',
    /pins sit at company headquarters/i.test(pane) && /not where the story happened/i.test(pane));
  check('and it counts what is missing rather than dropping it silently',
    /not on the map/i.test(pane) && /unplaced\.length/.test(pane));
}

// ── the severity model says it is a model ───────────────────────────────
{
  const room = readFileSync('src/pages/newsroom/NewsRoom.tsx', 'utf8');
  /* The checklist asked for severity to be "a model output with a real
     input, not an invented field". It is one — expected move and magnitude,
     both from the same template that wrote the headline — but the surface
     said neither that it was a model nor how many rungs the words cover. */
  check('the severity method is written down', /export const SEVERITY_METHOD/.test(readFileSync('src/data/newsroom.ts', 'utf8')));
  check('  · and says it is a model rather than an observation', /MODEL OUTPUT, not a measurement/.test(SEVERITY_METHOD));
  check('  · naming the two inputs it actually uses', /predicted next-session move/.test(SEVERITY_METHOD) && /how market-moving the item is/.test(SEVERITY_METHOD));
  check('  · and why the raw number is never printed', /cannot carry the precision/.test(SEVERITY_METHOD));
  check('the three rungs are listed, not described', SEVERITY_RUNGS.length === 3 && SEVERITY_RUNGS.every(r => r.from <= r.to));
  /* The rungs on the door have to be the cuts the code actually makes, or
     the door is a second place the scale is written down. */
  check('and the rungs are the cuts severityWord makes',
    SEVERITY_RUNGS.every(r => severityWord(r.from) === r.word && severityWord(r.to) === r.word),
    SEVERITY_RUNGS.map(r => `${r.word} ${r.from}-${r.to}`).join(' · '));
  check('the scale opens as a door rather than a hover', /setSeverityDoor\(true\)/.test(room) && /How impact is scored/.test(room));
}

// ── the reasoning reaches every grade, not one ──────────────────────────
{
  const room = readFileSync('src/pages/newsroom/NewsRoom.tsx', 'utf8');
  /* `sentimentWhy` is the differentiator the checklist names, and it was
     wired to exactly one node: the grade in the summary panel, reachable
     only after selecting the story. A grade a reader cannot interrogate is
     a grade they ignore. */
  /*
    COUNTING ONE SHAPE OF ANSWER WAS NOT THE RULE.

    This matched `title={e.item.sentimentWhy}` and required as many of them
    as there were grades, which held for as long as a grade only ever
    appeared as a VERDICT ON ONE STORY. The filter's Reading row broke that
    assumption honestly: it prints THREAT and ALLY as CONTROLS, with no
    story behind them and so no per-story reason to attach — and the guard
    read that as a grade going naked.

    The rule was never "carries sentimentWhy". It is: a reader who meets a
    grade can find out why it says that. On a story that is the story's own
    reasoning; on a control it is the definition of the word and the cut it
    is made at. Checked per occurrence rather than by tally, so a seventh
    grade cannot be balanced out by a sixth reason somewhere else — which
    the old count would have allowed.
  */
  const naked: string[] = [];
  for (const m of room.matchAll(/GRADE_TEXT\[/g)) {
    const at = m.index ?? 0;
    /* The title rides in the same element as the ink — a window either side
       of the class is the element, not the file. */
    const near = room.slice(Math.max(0, at - 700), at + 700);
    const onAStory = /title=\{(e|selected)\.item\.sentimentWhy\}/.test(near);
    const asAControl = /GRADE_NOTES\[/.test(near);
    if (!onAStory && !asAControl) naked.push(room.slice(0, at).split('\n').length.toString());
  }
  const grades = [...room.matchAll(/GRADE_TEXT\[/g)].length;
  check('every printed grade can be interrogated', grades > 1 && naked.length === 0,
    naked.length ? `bare at line ${naked.join(', ')}` : `${grades} printed, all answerable`);
  /* AND BOTH ANSWERS EXIST — a rule with one branch never taken is a rule
     that has not been tested. */
  check('  · a grade on a story gives that story’s reasoning',
    /title=\{(e|selected)\.item\.sentimentWhy\}/.test(room));
  check('  · and a grade used as a control gives what the word means',
    /GRADE_NOTES\[g\]/.test(room));
  /* The cut in the words has to be the cut the code makes, or the door is a
     second place the scale is written down — SEVERITY_RUNGS' rule. */
  const nr = readFileSync('src/data/newsroom.ts', 'utf8');
  check('  · with the cut it is made at, taken from the code that makes it',
    /export const GRADE_CUT/.test(nr) && /s > GRADE_CUT \? 'ALLY' : s < -GRADE_CUT \? 'THREAT'/.test(nr) &&
    Object.values(GRADE_NOTES).every(n => n.includes(String(GRADE_CUT))));
  /* A reading is a reading of the HEADLINE. Saying so is what stops it
     being read as an observation of the tape. */
  check('  · and each says it is a reading, not something that has happened',
    Object.values(GRADE_NOTES).every(n => /reads this story/.test(n)) &&
    /nothing has moved yet/.test(GRADE_NOTES.THREAT) && /nothing has moved yet/.test(GRADE_NOTES.ALLY));
}

// ── a quiet wire and a broken one are different states ──────────────────
{
  const room = readFileSync('src/pages/newsroom/NewsRoom.tsx', 'utf8');
  /* They look identical as a blank column and the reader's next move is
     opposite in each: wait, or find out what broke. The room had one
     message for both, and never imported the four-state component the rest
     of the desk uses for exactly this. */
  check('the room distinguishes an empty wire from a faulted one',
    /kind="unavailable"/.test(room) && /kind="empty"/.test(room) && /The wire is not answering/.test(room));
  check('  · told apart by the stream seam rather than by guessing', /isStreamFault\(stream\)/.test(room));
  check('  · and the quiet case says it is quiet, not broken', /a slow morning, not a fault/.test(room));
}

// ── the globe resolves as you come down ─────────────────────────────────
{
  /*
    IT HAD ONE LEVEL OF DETAIL AT EVERY ALTITUDE — one dot per city, the
    same curated place names, arcs tuned for orbit — so coming closer
    magnified the abstraction instead of resolving it. Three bands now, and
    the test is that each answers a question the others cannot.
  */
  check('the bands are ordered and cover every altitude',
    BAND_CUTS.ground < BAND_CUTS.approach &&
    bandFor(0.1) === 'ground' && bandFor(BAND_CUTS.ground) === 'ground' &&
    bandFor(1.0) === 'approach' && bandFor(BAND_CUTS.approach) === 'approach' &&
    bandFor(2.1) === 'orbit' && bandFor(99) === 'orbit');
  check('  · and each says what it draws, so a reader can find the next one',
    (['orbit', 'approach', 'ground'] as const).every(b => BAND_WORDS[b].label.length > 0 && BAND_WORDS[b].note.length > 30));
  check('  · with the two upper bands pointing further down',
    /zoom in/i.test(BAND_WORDS.orbit.note) && /zoom in/i.test(BAND_WORDS.approach.note));

  const pings = clusterByCity(placedEvents(events));
  check('PREMISE: the cities cluster', pings.length > 3, `${pings.length} cities`);
  check('a cluster carries its own stories, not just the loudest',
    pings.every(p => p.stories.length === p.n) && pings.some(p => p.stories.length > 1),
    `busiest city has ${Math.max(...pings.map(p => p.stories.length))}`);
  check('  · loudest first, so the mark that appears is the one the dot stood for',
    pings.every(p => p.stories[0].id === p.topId));

  /* THE FAN. Co-located stories land on identical coordinates and draw on
     top of each other; the ground band spreads them. */
  const fan = spreadStories(pings);
  check('every story gets its own mark on the ground', fan.length === placedEvents(events).length,
    `${fan.length} marks for ${placedEvents(events).length} placed stories`);
  check('  · the first stays put, so a one-story city never moves under the reader',
    pings.every(p => {
      const a = fan.find(f => f.id === p.stories[0].id)!;
      return a.anchor && a.lat === p.lat && a.lng === p.lng;
    }));

  const busy = pings.filter(p => p.n > 1);
  if (busy.length) {
    const b = busy[0];
    const own = fan.filter(f => f.city === b.city);
    const apart = own.every((m, i) => own.every((o, j) => i === j || Math.hypot(m.lat - o.lat, m.lng - o.lng) > 0.2));
    check('  · and co-located stories actually separate', apart, `${b.city}, ${own.length} marks`);
    /* A fan the size of a continent is not a fan. */
    const far = Math.max(...own.map(m => Math.hypot(m.lat - b.lat, (m.lng - b.lng) * Math.cos((b.lat * Math.PI) / 180))));
    check('  · without sweeping a circle the size of a country', far < 2.2, `${far.toFixed(2)}° from ${b.city}`);
  } else {
    check('  · and co-located stories actually separate', true, 'no city has two today');
    check('  · without sweeping a circle the size of a country', true, 'no city has two today');
  }
}

// ── the camera opens on the news ────────────────────────────────────────
{
  /*
    It opened at `{ lat: 30, lng: -60 }` — the middle of the North Atlantic,
    which is the one part of the planet this feed never touches. The reader
    arrived looking at an ocean with the news off the left edge.
  */
  const v = openingView(events);
  const placed = placedEvents(events);
  check('the opening view is derived, not a constant', !(v.lat === 30 && v.lng === -60), `${v.lat.toFixed(1)}, ${v.lng.toFixed(1)}`);
  check('  · and it looks at somewhere a story actually is',
    placed.some(e => Math.abs(e.origin.lng - v.lng) < 60), 'a placed story within 60° of centre');
  check('  · staying off the poles, where half the sphere is Arctic', Math.abs(v.lat) <= 55);

  /*
    THE WRAP. Longitudes are circular: a feed split between Tokyo (+139)
    and Los Angeles (−118) averages ARITHMETICALLY to +10 — Niger, the one
    place equidistant from the news and pointing at neither. The unit-vector
    mean puts the camera on the short way round instead.
  */
  const pacific = [
    { ...events[0], origin: { ...events[0].origin, lat: 35, lng: 139 }, severity: 5 },
    { ...events[0], origin: { ...events[0].origin, lat: 34, lng: -118 }, severity: 5 },
  ];
  const w = openingView(pacific);
  check('a feed split across the date line does not centre on Africa',
    Math.abs(w.lng) > 150, `${w.lng.toFixed(1)}° — arithmetic mean would be +10.5`);

  check('and an unplaceable feed falls back rather than throwing',
    (() => { const f = openingView([]); return f.lat === 30 && f.lng === -60; })());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
