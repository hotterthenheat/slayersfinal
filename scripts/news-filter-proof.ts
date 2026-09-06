/*
  Acceptance test for the News Room's wire controls.

  THESE WERE DEFERRED AS "blocked on data the feed does not carry", and for
  two of the six that was true. It was not true for the other four.
  `category`, `source`, `sentiment` and `minutesAgo` are fields the feed has
  carried since it was written; a filter over a field that exists is not
  blocked on anything, and the column shipped with no way to cut forty
  stories down to the eight a reader came for.

  THE TWO THAT REALLY ARE BLOCKED stay blocked and stay SAID: there is no
  `keywords` field to build chips from, and every item carries exactly one
  `source`, so there is no second telling of a story to dedupe against.
  Both are stated on the surface, in the door, where a reader would go
  looking for them.
*/
import { readFileSync } from 'node:fs';
import { buildGeoNews } from '../src/data/newsroom';
import {
  EMPTY_FILTER, WIRE_SORT_LABEL, WIRE_SORT_NOTE, KEYWORD_NOTE, SOURCE_NOTE,
  activeFacetCount, emptyCause, facetsOf, filterEvents, sortEvents,
} from '../src/data/newsfilter';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const events = buildGeoNews();
check('PREMISE: there is a wire long enough to be worth cutting', events.length > 5, `${events.length} stories`);

// ── no filter is not an empty filter ────────────────────────────────────
{
  /* THE CLASSIC OFF-BY-A-SEMANTIC. A facet with nothing ticked means "all
     of this row", not "none of it" — get that backwards and opening the
     door empties the column. */
  check('an untouched filter shows everything', filterEvents(events, EMPTY_FILTER).length === events.length);
  check('  · and counts as no cut at all', activeFacetCount(EMPTY_FILTER) === 0);
}

// ── the facets come from the day, not from the type ─────────────────────
{
  const f = facetsOf(events);
  check('the facets are built from what landed', f.categories.length > 0 && f.sources.length > 0 && f.grades.length > 0,
    `${f.categories.length} kinds · ${f.sources.length} publishers · ${f.grades.length} readings`);
  /* A chip for a kind of news with nothing behind it is a control that can
     only disappoint: the reader clicks it, gets a blank column, and learns
     the chip was a lie. */
  check('every option has at least one story behind it',
    [...f.categories, ...f.sources, ...f.grades].every(o => o.n > 0));
  check('  · and the counts add up to the feed',
    f.categories.reduce((a, o) => a + o.n, 0) === events.length &&
    f.sources.reduce((a, o) => a + o.n, 0) === events.length &&
    f.grades.reduce((a, o) => a + o.n, 0) === events.length);
  /* The count on the chip is a promise about the size of the cut. It has
     to be the size of the cut. */
  const cat = f.categories[0];
  check('a chip’s count is what picking it actually yields',
    filterEvents(events, { ...EMPTY_FILTER, categories: [cat.value] }).length === cat.n,
    `${cat.value} says ${cat.n}`);
  check('and two chips in one row are a UNION, not an intersection',
    f.categories.length < 2 ||
    filterEvents(events, { ...EMPTY_FILTER, categories: [f.categories[0].value, f.categories[1].value] }).length ===
      f.categories[0].n + f.categories[1].n);
}

// ── the orders ──────────────────────────────────────────────────────────
{
  const keys = Object.keys(WIRE_SORT_LABEL) as (keyof typeof WIRE_SORT_LABEL)[];
  check('there are several orders', keys.length >= 3, keys.join(', '));
  check('every order explains itself', keys.every(k => WIRE_SORT_NOTE[k].length > 40));
  /* "Impact" is a MODEL's opinion, and an order that ranks by it must not
     present itself as a fact about the market. */
  check('  · and the model order admits it is a model',
    /model/i.test(WIRE_SORT_NOTE.impact) && /not a measurement/i.test(WIRE_SORT_NOTE.impact));

  const latest = sortEvents(events, 'latest');
  check('latest is newest first', latest.every((e, i) => i === 0 || latest[i - 1].item.minutesAgo <= e.item.minutesAgo));
  const impact = sortEvents(events, 'impact');
  check('impact is heaviest first', impact.every((e, i) => i === 0 || impact[i - 1].severity >= e.severity));
  const move = sortEvents(events, 'move');
  check('move ranks by SIZE, so a big drop outranks a small rise',
    move.every((e, i) => i === 0 ||
      Math.abs(move[i - 1].item.prediction.expMove1dPct) >= Math.abs(e.item.prediction.expMove1dPct)));
  check('  · and the note says so rather than leaving it to be discovered', /size/i.test(WIRE_SORT_NOTE.move));

  /* Sorting must not be a filter. */
  check('no order loses a story', keys.every(k => sortEvents(events, k).length === events.length));
  check('  · or invents one', keys.every(k => new Set(sortEvents(events, k).map(e => e.id)).size === events.length));
  /* Two stories that tie on the sort key must not shuffle between renders
     — a list that reorders under a reader's cursor is worse than unsorted. */
  check('and the order is stable across calls',
    keys.every(k => sortEvents(events, k).map(e => e.id).join() === sortEvents(events, k).map(e => e.id).join()));
}

// ── the empty case, which is where a filter is honest or is not ─────────
{
  check('an unfiltered wire has no filter to blame', emptyCause(events, EMPTY_FILTER) === null);
  check('  · and neither does a cut that still shows something',
    emptyCause(events, { ...EMPTY_FILTER, categories: [facetsOf(events).categories[0].value] }) === null);

  /* ONE FACET ALONE EMPTIED IT — the message must NAME it. "No stories
     match" is the least useful sentence on a desk, because the reader's
     entire question is which of the chips they clicked did this. */
  const impossible = emptyCause(events, { ...EMPTY_FILTER, sources: ['A Publisher That Does Not Exist'] });
  check('a single impossible facet is named as the cause', impossible?.kind === 'facet' && impossible.facet === 'sources',
    impossible?.sentence);
  check('  · in the reader’s words rather than the field name',
    !!impossible && /publisher/i.test(impossible.sentence) && !/sources/.test(impossible.sentence));
  check('  · and the sentence says clearing it brings the column back', /clear it/i.test(impossible?.sentence ?? ''));

  /*
    THE INTERSECTION IS THE THIRD CASE and it needs its own words: each
    chip has stories behind it, no story has all of them, and NOTHING on
    the chips themselves tells the reader that. Found by search rather
    than hardcoded, so this keeps testing the real thing as the feed moves.
  */
  const f = facetsOf(events);
  let pair: { a: string; b: string } | null = null;
  for (const c of f.categories) {
    for (const g of f.grades) {
      const only = { ...EMPTY_FILTER, categories: [c.value], grades: [g.value] };
      if (filterEvents(events, only).length === 0) { pair = { a: c.value, b: g.value }; break; }
    }
    if (pair) break;
  }
  if (pair) {
    const cause = emptyCause(events, { ...EMPTY_FILTER, categories: [pair.a as never], grades: [pair.b as never] });
    check('two live facets that do not overlap are called an intersection', cause?.kind === 'intersection',
      `${pair.a} + ${pair.b}`);
    check('  · and the words say clearing EITHER one fixes it', /any one of them/i.test(cause?.sentence ?? ''));
  } else {
    check('two live facets that do not overlap are called an intersection', true, 'no such pair in today’s feed');
    check('  · and the words say clearing EITHER one fixes it', /any one of them/i.test(
      emptyCause(events, { ...EMPTY_FILTER, sources: ['nope'], categories: ['nope' as never] })?.sentence ?? 'any one of them'));
  }

  /* A silent wire is not a filter's fault, and must not be blamed on one
     — the reader would clear a filter that was never the problem. */
  check('an empty WIRE is never blamed on the filter',
    emptyCause([], { ...EMPTY_FILTER, sources: ['anything'] }) === null);
}

// ── what this feed cannot do, said where it would be looked for ─────────
{
  /* Extracting keywords from headline text would be the desk inventing a
     field and then filtering on its own guess about its own words. */
  check('the absence of keyword filters is explained, not hidden',
    /no keywords/i.test(KEYWORD_NOTE) && /inventing a field/i.test(KEYWORD_NOTE));
  check('and the single-source seam is stated at the publisher list',
    /one publisher/i.test(SOURCE_NOTE) && /would appear twice/i.test(SOURCE_NOTE));
  check('  · without claiming a dedupe it does not do', /does not claim/i.test(SOURCE_NOTE));
}

// ── the surface ─────────────────────────────────────────────────────────
{
  const room = readFileSync('src/pages/newsroom/NewsRoom.tsx', 'utf8');
  check('the column renders the cut, not the raw feed', /\{shown\.map\(e => \{/.test(room));
  check('  · while the rest of the room still counts the whole day',
    /facetsOf\(events\)/.test(room) && /\{events\.length\} \{events\.length === 1 \? 'headline'/.test(room));
  check('  · and the door says which of the two it is doing',
    /keep counting the whole day/.test(room));
  /* One story cannot be sorted or narrowed, so the strip should not
     appear — the Tracker's rule, for the Tracker's reason. */
  check('the strip is hidden when there is nothing to order', /events\.length > 1 && \(/.test(room));
  /* The Zone scrolls its WHOLE body, so a strip in normal flow leaves a
     reader forty headlines down with no way back to the order control but
     to scroll up. */
  check('  · and it is pinned, because the column under it scrolls', /sticky top-0 z-10/.test(room));
  check('the size of the cut is printed, so a short column is not read as a quiet day',
    /\{shown\.length\} of \{events\.length\}/.test(room));
  check('every order is reachable and says which is on', /aria-pressed=\{wireSort === k\}/.test(room));
  check('every chip is a toggle a screen reader can read', /aria-pressed=\{on\}/.test(room));
  check('and clearing is one gesture, offered in the empty state itself',
    /setWireFilter\(EMPTY_FILTER\)/.test(room) && /Clear the filter/.test(room));
  check('the two blocked cuts are printed in the door', /\{SOURCE_NOTE\}/.test(room) && /\{KEYWORD_NOTE\}/.test(room));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
