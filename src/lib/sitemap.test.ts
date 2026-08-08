import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, REFERENCE_ITEMS } from '../components/layout/nav';
import { CANONICAL_ORIGIN } from '../components/layout/RouteTitle';

/*
==================================================
  SLAYER TERMINAL - SITEMAP (lib/sitemap.test.ts)
  The sitemap points at pages that exist.

  It did not. `public/sitemap.xml` was written when there was a News desk and
  never revisited, so it kept telling crawlers to fetch `/news` long after the
  route was removed — which now resolves to the 404 page. A sitemap is a
  positive claim that a URL is worth indexing; a dead entry in one spends
  crawl budget on nothing and advertises a broken site.

  The reverse drift is just as quiet: `/tracker` and `/community` are real
  desks in the top nav that the file had never heard of, so nothing linked
  externally could find them.

  Both directions are checked here against the SAME registry the navigation
  renders from, so a desk cannot be added, moved or retired without this
  failing.
==================================================
*/

/**
 * Everything a visitor can reach from the chrome, which is exactly what belongs
 * in a sitemap: the front door, the index, every desk, and the reference pages.
 *
 * Desk paths come from NAV_ITEMS rather than being retyped. Some of them are
 * section roots that redirect to their first tab — that is what the nav itself
 * links to, so it is the canonical entry point, not a stray redirect.
 */
const EXPECTED_PATHS = [
  '/',
  '/terminal',
  ...NAV_ITEMS.map(i => i.path),
  ...REFERENCE_ITEMS.map(i => i.path),
].sort();

const ORIGIN = 'https://slayerterminal.com';

const xml = readFileSync(join(process.cwd(), 'public/sitemap.xml'), 'utf8');
const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

describe('sitemap', () => {
  it('lists every page the navigation offers, and nothing else', () => {
    const paths = locs
      .map(u => u.replace(ORIGIN, ''))
      .map(p => (p === '' ? '/' : p))
      .sort();
    expect(paths).toEqual(EXPECTED_PATHS);
  });

  it('agrees with the canonical the app writes at runtime', () => {
    /*
      The defect this closes: index.html carries one static
      <link rel="canonical"> naming the homepage, and every route is served that
      same file. So all fifteen URLs below were declaring `/` as their canonical
      — this file asking a crawler to index fifteen pages while the markup on
      each of them asked it not to. RouteTitle now rewrites the tag per route;
      if the two origins ever diverge, the contradiction comes straight back.
    */
    expect(CANONICAL_ORIGIN).toBe(ORIGIN);
  });

  it('uses one origin, with no trailing-slash variants to split ranking', () => {
    for (const loc of locs) {
      expect(loc.startsWith(`${ORIGIN}/`), `${loc} is not on ${ORIGIN}`).toBe(true);
      // `/compass` and `/compass/` are two URLs to a crawler and one page to a
      // reader; the root is the only entry allowed to end in a slash.
      expect(loc === `${ORIGIN}/` || !loc.endsWith('/'), `${loc} has a trailing slash`).toBe(true);
    }
  });

  it('names each URL once', () => {
    expect(new Set(locs).size).toBe(locs.length);
  });
});
