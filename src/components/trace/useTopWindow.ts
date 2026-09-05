import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/*
  THE TOP WINDOW — the other half of the endless feed.

  `useRunway` answers "there is always more below." This answers the bill for
  it, because a feed that only ever appends stops being usable long before it
  stops being endless.

  WHAT WAS MEASURED, on the Live Tape at 1440x900, scrolling in 900px steps:

      depth        rows    DOM nodes    heap     ms per step
      22,500px      633       37,750   204 MB       73
      67,500px    1,733      102,517   247 MB       97
     157,500px    3,908      230,670   340 MB      165
     337,500px    8,298      489,222   500 MB      448

  At the bottom of that table one scroll step costs nearly half a second —
  the page locks under the reader's hand — and that is SEVEN PERCENT of the
  runway's own cap of 120,000 rows.

  THE SAME TABLE WITH THIS HOOK IN PLACE:

      depth        rows    DOM nodes    heap     ms per step
      22,500px      246       14,903   204 MB       65
      67,500px      333       20,019   232 MB       72
     157,500px      312       18,765   225 MB       70
     337,500px      273       16,461   246 MB       70

  Thirty times fewer nodes at depth, and — the part that matters — a cost
  that is FLAT rather than one that grows with how long someone has been
  reading.

  TWO CHEAPER FIXES WERE TRIED AND REJECTED BY MEASUREMENT, in this order:

    `content-visibility: auto` on every row, which lets the browser skip
    layout and paint for off-screen content. 620ms per step before, 623ms
    after. The cost is not off-screen painting.

    Memoising the row so React reconciles less. Ruled out without building
    it: scrolling UP through the same 8,291 rows, where no page is generated
    and React does no work at all, still costs 438-508ms per step. There is a
    ~450ms floor that is the browser carrying 488,832 nodes, and no amount of
    saved React work goes underneath it.

  So the node count itself has to come down, and that leaves windowing.

  WHY ONLY THE TOP. The runway keeps just `runwayPx` of unread rows below the
  fold, so at any depth almost every row it has ever made is ABOVE the
  viewport — at 375 steps, effectively all 8,291 of them. Dropping from the
  top alone removes ~99% of the DOM while leaving the bottom edge, where the
  extension logic lives, completely untouched.

  WHAT THAT DOES NOT FIX, stated plainly because the numbers above would
  otherwise imply it does. This lowers the cost of SCROLLING deep, not the
  cost of HAVING scrolled deep. Come back up and every row generated on the
  way down is below the reader, where nothing is windowed, and all of it
  renders again: on the Dark Pool feed, 375 steps down and back returns the
  page to 138,279 nodes and 653MB — near where it started.

  It is the rarer shape of use, and the common one (scroll deep, keep
  reading) is ~19x cheaper than it was, so this ships as it is. The fix is
  the mirror of what is here — a bottom stack and spacer on the same
  measure-before-hiding rule — and it is a separate change, not a
  postscript. Anyone adding it should know the bottom edge is where the
  runway's own extension logic reads `scrollHeight`, which a bottom spacer
  keeps honest but a naive row-drop would not.

  THE SPACER IS MEASURED, NOT COMPUTED. Rows are 28px, but a day divider is
  not, so any arithmetic on row height would drift and the page would creep
  under the reader. Instead the pixel height of a chunk is read off the DOM
  immediately before it is hidden, and the spacer is set to exactly that.
  Scroll position cannot move, because the height removed and the height
  added are the same number.

  RESTORING IS EXACT for the same reason: each hidden chunk's measured height
  is kept on a stack, so scrolling back up pops one and shrinks the spacer by
  precisely what it added. Nothing is recomputed and nothing is estimated.
*/

export interface TopWindow {
  /** Rows before this index are not rendered. */
  start: number;
  /** Height of the spacer that stands in for them, in px. */
  spacerPx: number;
  /**
   * Call on scroll with the scrolling element and the row container. Hides a
   * chunk once enough of it is above the fold, and restores one when the
   * reader comes back up.
   */
  sync: (scroller: HTMLElement, container: HTMLElement | null) => void;
  /** Drop the window — a filter change makes the old indices meaningless. */
  reset: () => void;
}

export interface TopWindowOptions {
  /** Rows hidden or restored at a time. */
  chunk?: number;
  /**
   * Pixels of already-read rows kept above the fold before a chunk is hidden.
   * Generous on purpose: this is the distance a reader can scroll back up
   * without touching the spacer at all.
   */
  keepAbovePx?: number;
  /** Rows below which windowing never engages, so a short feed is untouched. */
  floor?: number;
}

export function useTopWindow(
  total: number,
  { chunk = 200, keepAbovePx = 4000, floor = 400 }: TopWindowOptions = {}
): TopWindow {
  const [start, setStart] = useState(0);
  const [spacerPx, setSpacerPx] = useState(0);

  /* MIRRORED INTO REFS, AND `sync` READS ONLY THESE.

     `useRunwayScroll` binds its scroll listener exactly once and says so in
     its own comment — re-binding per render would re-attach the listener
     every frame. That means the handler holds the FIRST `sync` closure for
     the life of the page, so a `sync` that read `start` and `spacerPx` from
     the closure read 0 and 0 forever.

     Every symptom came from that. The hide gate compared against a spacer of
     zero and fired almost every frame; `offset` stayed 0, so the height of a
     chunk was measured from the SPACER row rather than the first data row and
     came back inflated by the whole spacer — the 33,000px jumps; and the
     restore gate, also against zero, fired on the way DOWN. 150 hides and 135
     restores in one 200-step scroll, undoing each other.

     A stable `sync` over refs is the fix, and it is what the binding contract
     above requires of anything hung off that listener. */
  const startRef = useRef(0);
  const spacerRef = useRef(0);
  startRef.current = start;
  spacerRef.current = spacerPx;
  const totalRef = useRef(total);
  totalRef.current = total;
  /* One entry per hidden chunk: how many rows it held and how tall it was.
     Kept in a ref because restoring must read it inside the scroll handler
     without waiting for a render. */
  const stack = useRef<{ rows: number; px: number }[]>([]);

  const reset = useCallback(() => {
    stack.current = [];
    settling.current = false;
    setStart(0);
    setSpacerPx(0);
  }, []);

  /* HAS THE LAST DECISION LANDED? A second one taken before the first renders
     would measure rows the first has already accounted for — hiding the same
     chunk twice and inflating the spacer to a multiple of the height it
     stands for, which showed up as a 33,000px jump where 5,600px was due.

     A one-frame guard was too weak (React can take longer than a frame to
     commit) and predicting the resulting child count was wrong outright: the
     tbody carries day-divider rows between the data rows, so hiding N rows
     removes N plus however many dividers fell among them. The prediction
     never matched, `sync` blocked permanently, and the window froze with a
     24,858px spacer stranded above the reader.

     So nothing is predicted. The flag is cleared by a layout effect, which
     runs after the DOM is updated and before the next scroll event can be
     handled — the one moment that means "committed" without arithmetic. */
  const settling = useRef(false);
  /* The last pair `sync` was called with, so a settled change can drive the
     next one without waiting for the reader to move again. */
  const lastArgs = useRef<[HTMLElement, HTMLElement | null] | null>(null);
  const syncRef = useRef<TopWindow['sync'] | null>(null);

  useLayoutEffect(() => {
    settling.current = false;
    /* RE-RUN ONCE THE CHANGE HAS LANDED. Only one decision can be taken per
       commit, but reaching a stable window may need several — and scroll
       events stop the moment the reader does. Without this the last chunk
       never came back: scrolling quickly to the top left 8,300px of blank
       above the first row and nothing further to trigger the restore. */
    if (!lastArgs.current) return;
    const [sc, ct] = lastArgs.current;
    if (!sc.isConnected) return;
    const id = requestAnimationFrame(() => syncRef.current?.(sc, ct));
    return () => cancelAnimationFrame(id);
  }, [start, spacerPx]);

  const sync = useCallback(
    (scroller: HTMLElement, container: HTMLElement | null) => {
      if (!container) return;
      lastArgs.current = [scroller, container];
      if (settling.current) return;
      const kids = container.children;

      const foldTop = scroller.scrollTop;
      const spacer = spacerRef.current;

      /* ── restore, when the reader has come back up to the spacer ──
         IN A LOOP, and that matters. Restoring one chunk per scroll event
         leaves the reader stranded above a spacer the moment they stop
         scrolling — reaching the top quickly and letting go left 8,300px of
         blank above the first row. Nothing here touches the DOM: each chunk's
         height was measured when it was hidden, so unwinding is arithmetic
         and can run to completion in one pass. */
      if (stack.current.length > 0 && foldTop < spacer + keepAbovePx / 2) {
        let rows = 0;
        let px = 0;
        let left = spacer;
        while (stack.current.length > 0 && foldTop < left + keepAbovePx / 2) {
          const last = stack.current.pop()!;
          rows += last.rows;
          px += last.px;
          left -= last.px;
        }
        settling.current = true;
        setStart(s => Math.max(0, s - rows));
        setSpacerPx(p => Math.max(0, p - px));
        return;
      }

      /* ── hide, once a chunk is well clear above the fold ── */
      if (totalRef.current - startRef.current <= floor) return;
      /* Index within the RENDERED children. The spacer, when present, is
         child 0, so the first real row sits one along. */
      const offset = spacer > 0 ? 1 : 0;
      const firstNow = kids[offset] as HTMLElement | undefined;
      if (!firstNow) return;
      /* Walk to the row after the chunk COUNTING DATA ROWS ONLY. `chunk` is a
         count of `displayRows`, and the tbody interleaves day dividers among
         them — indexing children directly would stop short and measure a
         height for fewer rows than are about to go. */
      let seen = 0;
      let k = offset;
      while (k < kids.length && seen < chunk) {
        if (!(kids[k] as HTMLElement).hasAttribute('data-divider')) seen++;
        k++;
      }
      if (seen < chunk) return;
      const firstKept = kids[k] as HTMLElement | undefined;
      if (!firstKept) return;

      const chunkPx = firstKept.offsetTop - firstNow.offsetTop;
      if (chunkPx <= 0) return;
      /* Only hide it once the whole chunk plus the keep-back margin is above
         where the reader is looking. */
      if (foldTop - spacer < chunkPx + keepAbovePx) return;

      stack.current.push({ rows: chunk, px: chunkPx });
      settling.current = true;
      setStart(s => s + chunk);
      setSpacerPx(p => p + chunkPx);
    },
    /* No changing deps: the listener that calls this is bound once. */
    [chunk, floor, keepAbovePx]
  );

  syncRef.current = sync;

  return { start, spacerPx, sync, reset };
}
