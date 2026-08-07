import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { titleFor } from './documentTitle';

/**
 * Writes the browser tab title for the current route.
 *
 * Mounted once, above the router's outlet, so it covers the routes outside the
 * app shell (landing, trailer) as well as the desks inside it. Renders nothing.
 *
 * Keyed on `pathname` only. `?view=` toggles are a second read of the same desk
 * and share its name, so re-titling on every search-param change would rewrite
 * the same string on every click of a segmented control.
 */
const RouteTitle = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = titleFor(pathname);
  }, [pathname]);
  return null;
};

export default RouteTitle;
