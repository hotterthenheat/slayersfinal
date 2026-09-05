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
  buildGeoNews, placedEvents, PLACEMENT_WORDS, PLACEMENT_NOTES, type PlacementKind,
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
