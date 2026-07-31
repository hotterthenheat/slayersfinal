import { useEffect, useState } from 'react';

/**
 * Client-only media-query subscription.
 *
 * For layout that Tailwind breakpoints cannot express — anything that has to
 * change a value in JS rather than a class. Both callers place grid items with
 * inline `gridColumn`/`gridRow`, and an inline placement cannot be scoped to a
 * breakpoint, so the decision has to be made in JS.
 *
 * Defaults to `true` before mount so the desktop layout is the SSR/first-paint
 * assumption rather than the phone one.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : true
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

export default useMediaQuery;
