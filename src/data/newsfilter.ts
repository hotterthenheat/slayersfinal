/*
==================================================
  SLAYER TERMINAL - CUTTING THE WIRE
  (data/newsfilter.ts)
==================================================

  The headline column shipped with no way to cut it. Every story the
  generator produced, newest first, forever — which is fine at nine
  stories and useless at forty, and forty is what a full session lands.

  WHAT WAS DEFERRED, AND WHY THAT WAS HALF WRONG. The build notes said
  the wire's filters were "blocked on data the feed does not carry", and
  for two of them that is true: there is no `keywords` field to build
  keyword chips from, and every `NewsItem` carries exactly one `source`,
  so there is no second telling of a story to dedupe against or reconcile
  with. Inventing either would mean inventing the data underneath it.

  BUT THE OTHER FOUR WERE ALREADY THERE. `category`, `source`, `sentiment`
  and `minutesAgo` are all fields the feed has carried since it was
  written. A filter over a field that exists is not blocked on anything.

  THE LOGIC LIVES HERE, AWAY FROM THE ROOM, because a filter's honesty is
  mostly about its EMPTY CASE — which facet cut the last row, and can the
  reader tell — and that is a thing worth asserting in a test rather than
  discovering on screen.
*/
import type { GeoNewsEvent, NewsGrade } from './newsroom';
import type { NewsCategory } from './news';

export type WireSort = 'latest' | 'impact' | 'move';

export const WIRE_SORT_LABEL: Record<WireSort, string> = {
  latest: 'Latest',
  impact: 'Impact',
  move: 'Move',
};

/*
  EVERY ORDER EXPLAINS ITSELF. Three buttons reading Latest / Impact /
  Move are three guesses unless the reader is told what each one ranks by;
  "Impact" in particular is a MODEL's opinion and the note has to say so,
  or the order reads as a fact about the market.
*/
export const WIRE_SORT_NOTE: Record<WireSort, string> = {
  latest: 'Newest first — the tape order. What you want when you are watching the day happen.',
  impact: 'The desk’s severity model first, heaviest at the top. A model’s opinion of what matters, not a measurement of what moved.',
  move: 'Largest predicted next-session move first, up or down. Ranks by size, so a big drop outranks a small rise.',
};

export interface WireFilter {
  categories: readonly NewsCategory[];
  sources: readonly string[];
  grades: readonly NewsGrade[];
}

export const EMPTY_FILTER: WireFilter = { categories: [], sources: [], grades: [] };

/** A facet with nothing selected means "everything" — not "nothing". */
const facetPasses = <T,>(selected: readonly T[], value: T): boolean =>
  selected.length === 0 || selected.includes(value);

export const filterEvents = (events: readonly GeoNewsEvent[], f: WireFilter): GeoNewsEvent[] =>
  events.filter(
    e =>
      facetPasses(f.categories, e.item.category) &&
      facetPasses(f.sources, e.item.source) &&
      facetPasses(f.grades, e.grade)
  );

export const sortEvents = (events: readonly GeoNewsEvent[], sort: WireSort): GeoNewsEvent[] => {
  const out = [...events];
  if (sort === 'impact') out.sort((a, b) => b.severity - a.severity || a.item.minutesAgo - b.item.minutesAgo);
  else if (sort === 'move')
    out.sort(
      (a, b) =>
        Math.abs(b.item.prediction.expMove1dPct) - Math.abs(a.item.prediction.expMove1dPct) ||
        a.item.minutesAgo - b.item.minutesAgo
    );
  else out.sort((a, b) => a.item.minutesAgo - b.item.minutesAgo);
  return out;
};

export const activeFacetCount = (f: WireFilter): number =>
  f.categories.length + f.sources.length + f.grades.length;

/*
  THE FACETS ARE BUILT FROM THE FEED, NOT FROM THE TYPE.

  A category chip for a kind of news that landed nothing today is a dead
  control: the reader clicks it, gets an empty column, and learns only
  that the chip was a lie. So the options are whatever is actually on the
  wire right now, each carrying its own count, so the size of the cut is
  legible BEFORE it is made.
*/
export interface Facet<T> {
  value: T;
  n: number;
}

const tally = <T,>(events: readonly GeoNewsEvent[], of: (e: GeoNewsEvent) => T): Facet<T>[] => {
  const by = new Map<T, number>();
  for (const e of events) by.set(of(e), (by.get(of(e)) ?? 0) + 1);
  return [...by.entries()].map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n);
};

export const facetsOf = (events: readonly GeoNewsEvent[]) => ({
  categories: tally(events, e => e.item.category),
  sources: tally(events, e => e.item.source),
  grades: tally(events, e => e.grade),
});

/*
  WHICH FACET EMPTIED THE COLUMN.

  "No stories match" is the least useful empty state on a desk, because
  the reader's whole question is WHICH of the things they clicked did it.
  So when the result is empty, each facet is re-tested alone: a facet that
  is empty by itself is a cause, and the message can name it. Two facets
  that are each fine alone but empty together is the third case — an
  intersection — and it needs its own words, because clearing one chip
  will fix it and the reader cannot tell that from the chips.
*/
export interface EmptyCause {
  kind: 'none-selected' | 'facet' | 'intersection';
  /** The facet to name, when one facet alone is responsible. */
  facet?: 'categories' | 'sources' | 'grades';
  sentence: string;
}

export const emptyCause = (events: readonly GeoNewsEvent[], f: WireFilter): EmptyCause | null => {
  if (events.length === 0) return null; // nothing on the wire — not a filter problem
  if (filterEvents(events, f).length > 0) return null;
  if (activeFacetCount(f) === 0) return null;

  const alone: [EmptyCause['facet'], WireFilter][] = [
    ['categories', { ...EMPTY_FILTER, categories: f.categories }],
    ['sources', { ...EMPTY_FILTER, sources: f.sources }],
    ['grades', { ...EMPTY_FILTER, grades: f.grades }],
  ];
  const WORD: Record<NonNullable<EmptyCause['facet']>, string> = {
    categories: 'kind of news',
    sources: 'publisher',
    grades: 'reading',
  };
  for (const [facet, only] of alone) {
    if (facet && f[facet].length > 0 && filterEvents(events, only).length === 0) {
      return {
        kind: 'facet',
        facet,
        sentence: `Nothing on the wire matches the ${WORD[facet]} you picked. Today’s stories are elsewhere — clear it and the column comes back.`,
      };
    }
  }
  return {
    kind: 'intersection',
    sentence:
      'Each of these filters has stories behind it, but no single story satisfies all of them at once. Clearing any one of them will bring the column back.',
  };
};

/*
  WHAT THIS FEED CANNOT BE FILTERED BY, said where a reader would look for
  it. The publisher facet is exactly where someone expects "collapse the
  duplicates", and its absence is a property of the SEAM, not an oversight
  worth leaving them to guess at.
*/
export const SOURCE_NOTE =
  'Each story arrives carrying one publisher, so there is nothing here to reconcile. A story two wires both carried would appear twice and the seam does not tell us they are the same story — so the desk does not claim to have collapsed them.';

export const KEYWORD_NOTE =
  'There are no keyword filters because the feed carries no keywords. Extracting them from the headline text would be the desk inventing a field and then filtering on its own guess.';
