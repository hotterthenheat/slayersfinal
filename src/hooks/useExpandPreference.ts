import { useCallback, useState } from 'react';

/*
==================================================
  SLAYER TERMINAL - EXPAND PREFERENCE (hooks/useExpandPreference.ts)
  Whether drilldowns open at drilldown size or full screen.

  A preference, not a per-row mode: whoever prefers the full view gets it on
  every drilldown from then on rather than pressing the same button every time.

  Its own module because DetailModal must export components and nothing else —
  a hook alongside them breaks fast refresh for every file that imports it.
==================================================
*/

const KEY = 'slayer_detail_expanded';

export const readExpandPref = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

export const writeExpandPref = (v: boolean): void => {
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* storage unavailable — the choice just doesn't persist */
  }
};

/**
 * The expand preference, for a caller that needs it in its own body rather than
 * only in its markup.
 *
 * The Stocks drilldown is the case: expanding there means BUILDING more — the
 * dark-pool read, the options book, the swing model — and those are memos in the
 * component body, above the point where a render prop could reach them. Reading
 * the same key means the hook and the modal's own state can never disagree about
 * what the user chose.
 */
export function useExpandPreference(): [boolean, () => void] {
  const [expanded, setExpanded] = useState(readExpandPref);
  const toggle = useCallback(() => {
    setExpanded(prev => {
      writeExpandPref(!prev);
      return !prev;
    });
  }, []);
  return [expanded, toggle];
}
