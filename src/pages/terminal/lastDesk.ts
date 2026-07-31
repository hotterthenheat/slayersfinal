/*
  Where the visitor was last, for the index's Resume row. Storage only: this
  records the user's own movement, never anything about the market.
*/

import { NAV_ITEMS } from '../../components/layout/nav';
import { GEX_SUBPAGES } from '../gex/subnav';
import { FLOWDESK_SUBPAGES } from '../flowdesk/subnav';
import { COMMUNITY_SUBPAGES } from '../community/subnav';

export const LAST_DESK_KEY = 'slayer.terminal.last';

export interface LastDesk {
  /** Full stored pathname, e.g. '/pinpoint/stress' — what Resume navigates to. */
  path: string;
  /** Desk root, e.g. '/pinpoint' — the caller resolves the icon from this. */
  deskPath: string;
  deskLabel: string;
  /** Present only when the stored path is a known subpage of a sectioned desk. */
  tabLabel?: string;
}

/** Only the three desks that actually route subpages; the other seven have no tab bar. */
const SUBPAGES: Record<string, { path: string; label: string }[]> = {
  '/pinpoint': GEX_SUBPAGES,
  '/trace': FLOWDESK_SUBPAGES,
  '/community': COMMUNITY_SUBPAGES,
};

/** The nav registry is the ownership test, so /terminal, /guide/*, /legal/* and
    folded paths fall out on their own without a second list to maintain. */
const deskFor = (pathname: string) =>
  NAV_ITEMS.find(i => pathname === i.path || pathname.startsWith(`${i.path}/`));

/**
 * Records a desk visit. Never clears on a non-desk path: a detour through the
 * Guide should not erase where the visitor was. Search and hash are dropped —
 * resuming into a `?view=` sub-toggle restores one control's position, not a place.
 */
export const writeLastDesk = (pathname: string): void => {
  if (!deskFor(pathname)) return;
  try {
    localStorage.setItem(LAST_DESK_KEY, pathname);
  } catch {
    // Private-mode / blocked storage must not throw on the front door.
  }
};

/** Re-validates on read, so a value written by an older build resolves to null
    rather than pointing Resume at a route that no longer exists. */
export const readLastDesk = (): LastDesk | null => {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LAST_DESK_KEY);
  } catch {
    return null;
  }
  if (!stored) return null;

  const desk = deskFor(stored);
  if (!desk) return null;

  const tab = SUBPAGES[desk.path]?.find(s => s.path === stored);
  return { path: stored, deskPath: desk.path, deskLabel: desk.label, tabLabel: tab?.label };
};
