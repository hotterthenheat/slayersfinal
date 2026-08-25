import { useEffect, useState } from 'react';

/*
==================================================
  SLAYER TERMINAL - ASKING THE WINDOW ITS SHAPE
  (ui/useMediaQuery.ts)

  A media query read from JavaScript, for the cases
  CSS cannot cover: not "style this differently below
  a width" — Tailwind already does that — but "mount
  something ELSE below a width".

  The distinction matters and it is the reason this
  file exists rather than another `md:hidden`. A
  layout hidden with CSS is still mounted: its charts
  still create canvases, its panels still subscribe to
  the tick, its widgets still compute. On the desk
  that is ten live panels running behind a screen
  nobody can see, on the device least able to afford
  them. A branch in JS never builds the other side.
==================================================
*/

/**
 * Tailwind's `md` floor, expressed as a query.
 *
 * **767.98, not 767.** A window can land on a fractional CSS pixel — a zoomed
 * page, a device pixel ratio that does not divide evenly, a desktop browser
 * dragged slowly. At exactly 767.5px `(max-width: 767px)` does not match and
 * neither does Tailwind's `md:` (which is `min-width: 768px`), so the JS
 * branch and the CSS would disagree about which side of the line the page is
 * on — the layout would pick one shape and its styling the other. The
 * fractional bound closes the gap.
 */
export const PHONE_QUERY = '(max-width: 767.98px)';

/** Whether `query` matches now, kept current as the window changes. */
export function useMediaQuery(query: string): boolean {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';

  // Read on the FIRST render, not in an effect. Seeding `false` and correcting
  // afterwards would mount the wide layout for one frame on every phone —
  // and for a layout that builds charts, one frame is a full chart create and
  // destroy before the right one is even asked for.
  const [matches, setMatches] = useState(() => (supported ? window.matchMedia(query).matches : false));

  useEffect(() => {
    if (!supported) return;
    const mql = window.matchMedia(query);
    // Re-read on subscribe rather than trusting the render-time value: the
    // window can be resized between that read and this effect, and the change
    // event only fires for crossings AFTER the listener is attached, so a
    // crossing inside that gap would otherwise be lost until the next one.
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query, supported]);

  return matches;
}

/** Below Tailwind's `md` — the width at which a multi-panel desk stops working. */
export const useIsPhone = (): boolean => useMediaQuery(PHONE_QUERY);
