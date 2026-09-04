import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/*
  THE RUNWAY — one endless feed, shared by the Live Tape and the Dark Pool
  (Noah, 2026-09-04: "make it a endless scroll and don't let it load when
  people get to the page it should be nonstop").

  Both pages ask the same thing of a reader: scroll for as long as you like
  and never meet a spinner, an end, or a row that was not there a second ago.
  Both keep it the same way, so the promise lives in one file rather than in
  two copies that drift.

  THE CONTRACT with the caller is a `generate(page)` that is a PURE FUNCTION
  of its page index. Page seven must be the same seven rows every time it is
  asked for. That is not a nicety — it is the whole reason there is no
  loading state to render: fetching IS computing here, so the runway can be
  extended thousands of pixels before the reader could see an end, and there
  is nothing to cache, await, retry or fail. It is also what stops the feed
  rewriting itself underneath someone who scrolls away from a row and back.

  WHAT IT MEASURES is the gap below the fold, on every scroll frame and again
  whenever the rendered count changes — a filter empties a page as effectively
  as scrolling does, and a feed that stops being endless the moment you type a
  ticker into it is not endless.

  WHAT IT GETS WRONG IF YOU DO NOT TELL IT: how much of what it generates
  actually reaches the page. Under no scope that is all of it; under "TSLA" it
  is about one row in forty. Sizing an extension as though every generated row
  were rendered is what left a scoped tape holding 1,700px of runway while an
  open one held 7,500 — the extension asked for two pages when it needed
  eighty. So the caller reports its yield, and the estimate is divided by it.
*/

export interface RunwayOptions<T> {
  /** Rows for page n. MUST be pure in n — see the note above. */
  generate: (page: number) => T[];
  /** Rows per page. */
  pageSize: number;
  /** Pages generated before the first paint, so the feed arrives full. */
  prefetchPages: number;
  /** Unread pixels that must always sit below the fold. */
  runwayPx: number;
  /** Row height, used only to size an extension; the next frame corrects it. */
  rowPx: number;
  /** Pages one extension may add — a bound on work per scroll event. */
  maxPagesPerExtend: number;
  /** The stop. A scope narrow enough will extend without lengthening the page. */
  maxPages: number;
}

export interface Runway<T> {
  /** Everything generated so far, oldest page last. */
  rows: T[];
  /** Attach to the scrolling element once it is known. */
  setScroller: (el: HTMLElement | null) => void;
  /** Re-check the runway. Call on scroll and whenever the render count moves. */
  extend: () => void;
  /** Tell it what fraction of generated rows are actually rendered. */
  reportYield: (rendered: number, generated: number) => void;
}

export function useRunway<T>(opts: RunwayOptions<T>): Runway<T> {
  const { generate, pageSize, prefetchPages, runwayPx, rowPx, maxPagesPerExtend, maxPages } = opts;

  /* Held in refs, not state: the scroll listener must never re-bind to read
     them, and none of them should cause a render on their own. `generate` is
     re-captured every render so a caller may close over changing values
     without stale-closure bugs, while `extend` keeps one stable identity. */
  const genRef = useRef(generate);
  genRef.current = generate;
  const yieldRef = useRef(1);
  const pagesRef = useRef(prefetchPages);
  const scrollerRef = useRef<HTMLElement | null>(null);

  const [rows, setRows] = useState<T[]>(() => {
    const seed: T[] = [];
    for (let p = 0; p < prefetchPages; p++) seed.push(...generate(p));
    return seed;
  });

  const setScroller = useCallback((el: HTMLElement | null) => {
    scrollerRef.current = el;
  }, []);

  const reportYield = useCallback((rendered: number, generated: number) => {
    yieldRef.current = generated > 0 ? Math.max(0.01, rendered / generated) : 1;
  }, []);

  const extend = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || pagesRef.current >= maxPages) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (gap > runwayPx) return;
    const want = Math.ceil((runwayPx * 2 - gap) / (pageSize * rowPx * yieldRef.current));
    const add = Math.min(Math.max(1, want), maxPagesPerExtend, maxPages - pagesRef.current);
    const first = pagesRef.current;
    pagesRef.current = first + add;
    const grown: T[] = [];
    for (let p = first; p < first + add; p++) grown.push(...genRef.current(p));
    setRows(prev => [...prev, ...grown]);
  }, [maxPages, maxPagesPerExtend, pageSize, rowPx, runwayPx]);

  return { rows, setScroller, extend, reportYield };
}

/** Binds a runway to the app's scrolling <main> and keeps it topped up as the
    rendered count moves. `rendered`/`generated` feed the yield estimate. */
export function useRunwayScroll<T>(
  runway: Runway<T>,
  rendered: number,
  generated: number,
  onScroll?: (el: HTMLElement) => void
): void {
  const { setScroller, extend, reportYield } = runway;
  reportYield(rendered, generated);

  useLayoutEffect(() => {
    extend();
  }, [rendered, extend]);

  useLayoutEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;
    setScroller(main);
    const handle = () => {
      onScroll?.(main);
      extend();
    };
    main.addEventListener('scroll', handle, { passive: true });
    handle();
    return () => {
      main.removeEventListener('scroll', handle);
      setScroller(null);
    };
    // onScroll is re-created per render by design; binding to it would
    // re-attach the listener every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extend, setScroller]);
}
