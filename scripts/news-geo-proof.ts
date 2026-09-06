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
  SEVERITY_METHOD, SEVERITY_RUNGS, type PlacementKind,
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
  const grades = (room.match(/GRADE_TEXT\[/g) ?? []).length;
  const withWhy = (room.match(/title=\{(e|selected)\.item\.sentimentWhy\}/g) ?? []).length;
  check('every printed grade carries its reasoning', grades > 1 && withWhy === grades, `${withWhy} of ${grades}`);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
