/*
==================================================
  SLAYER TERMINAL - PANE LAYOUT
  (gex/paneLayout.ts)

  The heights a reader dragged the pane separators
  to, kept between sessions.
==================================================

  WHY THIS EXISTS.

  lightweight-charts lays panes out by STRETCH FACTOR and lets a reader drag
  the separators between them, and this app was throwing that away twice
  over. Nothing wrote the result down, so a reload put every band back to the
  default split — and worse, four separate places in StrikeChart re-imposed
  that split whenever the indicator set, a Pine pane or a comparison
  rebuilt, so a drag could be undone WITHOUT a reload, by an effect the
  reader had no way to connect to what they had just done (Noah, three
  times, most recently "the pane size thing still doesnt work").

  SHARES, NOT PIXELS. A layout is stored as each pane's fraction of the
  total pane height. Pixels would be wrong the moment the window changed
  size or the desk went from one chart to four; shares survive both, and
  they are also what makes a drag distinguishable from a resize — a window
  resize moves every height and leaves every share alone.

  KEYED BY HOW MANY PANES THERE ARE. Panes have no identity of their own —
  index is the only handle the library offers, and indices shift as bands
  come and go. So a reader gets a remembered layout per pane COUNT: the
  three-band arrangement they set is the one that comes back when three
  bands are open, and adding a fourth starts from the default rather than
  from a stretched-out version of a layout that was about different bands.

  NO REACT STORE. `chartPrefs` is subscribed by every mounted pane; a drag
  writing through it would re-render the whole desk on every frame of the
  drag. This is plain storage, read when a chart lays its panes out and
  written when the reader stops moving one.
*/

const KEY = 'slayer.chart.panes.v1';

type Store = Record<string, number[]>;

const read = (): Store => {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Store) : {};
  } catch {
    /* private window, or a key written by something else — start clean */
    return {};
  }
};

/**
 * The remembered shares for a layout of `count` panes, or null when there is
 * no usable answer. Validated rather than trusted: a stored array of the
 * wrong length is about a different layout, and one carrying a zero would
 * collapse a band to nothing with no way to drag it back.
 */
export function loadPaneShares(count: number): number[] | null {
  if (count < 2) return null;
  const v = read()[String(count)];
  if (!Array.isArray(v) || v.length !== count) return null;
  if (!v.every(n => typeof n === 'number' && Number.isFinite(n) && n > 0.02)) return null;
  return v;
}

/**
 * Remember this layout. Shares are normalised on the way in, so the caller
 * can pass raw pixel heights; a write that would not change what is stored
 * is skipped, which is what makes it safe to call from a drag.
 */
export function savePaneShares(count: number, heights: number[]): void {
  if (count < 2 || heights.length !== count) return;
  const total = heights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return;
  const norm = heights.map(h => Math.round((h / total) * 1000) / 1000);
  /* A band dragged shut is not a layout worth keeping: it would come back
     collapsed, with the separator on top of the one below it. */
  if (norm.some(n => n <= 0.02)) return;
  const store = read();
  const prev = store[String(count)];
  if (prev && prev.length === norm.length && prev.every((p, i) => Math.abs(p - norm[i]) < 0.005)) return;
  store[String(count)] = norm;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* Storage refused. The layout still holds for this session rather than
       the drag doing nothing. */
  }
}

/** Forget every remembered layout — the door back to the defaults. */
export function clearPaneShares(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored is the same outcome */
  }
}

/**
 * The split a layout gets when the reader has never set one: the tape keeps
 * about two thirds and the bands below share the rest.
 *
 * ONE COPY. This was written out at four call sites in StrikeChart with two
 * DIFFERENT ratios — the comparison effect used 3:1 while the band effects
 * used 64:36 — so whichever rebuilt last won, and the file's own comment
 * recorded the two of them "silently fighting over the layout". They now ask
 * this.
 */
export function defaultStretch(index: number, count: number): number {
  if (count < 2) return 1;
  return index === 0 ? 64 : Math.max(10, 36 / (count - 1));
}
