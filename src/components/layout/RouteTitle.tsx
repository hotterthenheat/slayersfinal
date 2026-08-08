import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { titleFor } from './documentTitle';

/** Matches public/sitemap.xml, which sitemap.test.ts pins to this one origin. */
export const CANONICAL_ORIGIN = 'https://slayerterminal.com';

/**
 * Writes the browser tab title and the canonical URL for the current route.
 *
 * Mounted once, above the router's outlet, so it covers the routes outside the
 * app shell (landing, trailer) as well as the desks inside it. Renders nothing.
 *
 * Keyed on `pathname` only. `?view=` toggles are a second read of the same desk
 * and share its name, so re-titling on every search-param change would rewrite
 * the same string on every click of a segmented control. The canonical follows
 * the same rule for the same reason: a pane is not a separate page.
 *
 * THE CANONICAL. index.html can carry only one, and it named the homepage.
 * Every route is served that same file — vercel.json rewrites every non-asset
 * path to /index.html — so all fifteen URLs in public/sitemap.xml were telling
 * a crawler they were really `/`. The sitemap asked for fifteen pages to be
 * indexed while the markup on every one of them asked for none, and the two
 * files had contradicted each other since the SEO commit that added them.
 *
 * The tag stays in index.html so a crawler that does not run JS still gets a
 * valid (if homepage-shaped) answer; this rewrites it once the router knows
 * where it is, the same way the title is written.
 */
const RouteTitle = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = titleFor(pathname);
  }, [pathname]);

  useEffect(() => {
    // Trailing slash trimmed so /compass/ and /compass do not advertise two
    // different canonicals for one desk. The root keeps its bare origin.
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : '';
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = `${CANONICAL_ORIGIN}${path || '/'}`;
  }, [pathname]);

  return null;
};

export default RouteTitle;
