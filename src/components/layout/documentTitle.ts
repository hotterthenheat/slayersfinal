import { NAV_ITEMS } from './nav';
import { GEX_SUBPAGES } from '../../pages/gex/subnav';
import { FLOWDESK_SUBPAGES } from '../../pages/flowdesk/subnav';
import { GUIDE_SUBPAGES } from '../../pages/guide/subnav';
import { COMMUNITY_SUBPAGES } from '../../pages/community/subnav';

/*
==================================================
  SLAYER TERMINAL - DOCUMENT TITLE (layout/documentTitle.ts)
  What the browser tab says.

  Every route in the terminal shared one title — the marketing line baked into
  index.html — because the app is a single page and nothing ever wrote over it.
  With eight tabs open, all eight read "Slayer Terminal — Institutional Options
  GEX Analytics", history is a wall of the same entry, and a bookmark records
  nothing about where it points.

  Titles are COMPOSED from the same subnav registries the tab bars render from,
  never retyped. Rename a desk in one place and the tab title follows; add a
  subpage and it is titled the moment it is routable. The alternative — a second
  hand-kept table of the same strings — is a table that goes stale silently,
  and a wrong title is worse than a generic one.
==================================================
*/

/** The suite name every title ends on, so a tab is identifiable when truncated. */
export const SUITE = 'Slayer Terminal';

/** The landing page keeps index.html's line: it is the page being marketed. */
export const DEFAULT_TITLE = `${SUITE} — Institutional Options GEX Analytics`;

/** Routes that are their own page rather than a desk or a desk's subpage. */
const STANDALONE: Record<string, string> = {
  '/terminal': 'Terminal',
  '/trailer': 'Trailer',
  '/guide': 'Guide',
  '/legal/disclaimer': 'Disclaimer',
  '/legal/terms': 'Terms of Use',
  '/legal/privacy': 'Privacy Policy',
};

/**
 * Full path → `[leaf, section]`, built from the registries that already own
 * these names. A leaf under a desk titles as "Leaf · Desk"; the desk's own root
 * titles as just the desk.
 */
const SECTIONS: { section: string; pages: readonly { path: string; label: string }[] }[] = [
  { section: 'Pinpoint', pages: GEX_SUBPAGES },
  { section: 'Trace', pages: FLOWDESK_SUBPAGES },
  { section: 'Guide', pages: GUIDE_SUBPAGES },
  { section: 'Community', pages: COMMUNITY_SUBPAGES },
];

const LEAF = new Map<string, string>();
for (const { section, pages } of SECTIONS) {
  for (const page of pages) LEAF.set(page.path, `${page.label} · ${section}`);
}

const DESK = new Map<string, string>(NAV_ITEMS.map(i => [i.path, i.label]));

/**
 * The page name for a path, without the suite suffix — `null` on the landing
 * page, which is titled by its own line rather than as a page of the app.
 *
 * Trailing slashes are normalised because a link written `/guide/faq/` and one
 * written `/guide/faq` are the same page and must not title differently.
 */
export function pageNameFor(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '' || path === '/') return null;
  return LEAF.get(path) ?? STANDALONE[path] ?? DESK.get(path) ?? null;
}

/** The full string written to `document.title` for a path. */
export function titleFor(pathname: string): string {
  const page = pageNameFor(pathname);
  return page == null ? DEFAULT_TITLE : `${page} — ${SUITE}`;
}
