import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import TopBar from './TopBar';
import OnboardingOverlay from './OnboardingOverlay';
import CommandPalette from './CommandPalette';
import SettingsPanel from './SettingsPanel';
import ShortcutsOverlay from './ShortcutsOverlay';
import RouteErrorBoundary from './RouteErrorBoundary';
import SiteFooter from './SiteFooter';
import BackToTop from './BackToTop';
import { footerVariant, isTerminalRoute } from './chromeRoutes';
import { PAGE_CONTAINER } from './container';
import { useTicker } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { DUR } from '../../lib/motion';
import { isTypingTarget, overlayOwnsKeyboard } from '../../lib/keys';

const AppShell = () => {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const location = useLocation();
  const { activeTicker, changeTicker } = useTicker();
  const footer = footerVariant(location.pathname);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);

  // Keep the live handler reading the current ticker without re-binding the listener.
  const tickerRef = useRef(activeTicker);
  tickerRef.current = activeTicker;

  /*
    The DOCUMENT scrolls. It used to be <main>, and that was the wrong shape for
    this product.

    The shell was `h-screen overflow-hidden` wrapping a `h-full overflow-y-auto`
    <main>, which is a fixed-size window with the site sliding around behind it.
    Every consequence of that had to be re-implemented by hand because the
    browser could no longer see the scroll: `Home` and `End` did nothing unless
    focus happened to be inside the region, the scrollbar belonged to the shell
    rather than the page, scroll restoration never fired, and mobile browsers
    never collapsed their URL bar because from their side the page never moved.

    It also forced the boards inside it into their own scrollers, so reading a
    long list meant scrolling a box inside a box.

    Now: nothing owns the scroll but the document. Route changes reset the
    window — the one behaviour genuinely worth keeping, since react-router does
    not do it — and skip when the URL carries a hash, where the target section
    IS the requested position and jumping to the top would fight the anchor.
  */
  useEffect(() => {
    if (location.hash) return;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname, location.hash]);

  /**
   * Publish the scrollbar's width so the top bar can reserve the same gutter.
   *
   * The bar is `position: fixed`, so it spans the viewport INCLUDING the space
   * a classic scrollbar occupies; the page below it is laid out in the document
   * width, which excludes it. Left alone the wordmark sits a scrollbar's width
   * right of the first column of the page under it.
   *
   * Measured, not assumed: the gutter is 0 on overlay-scrollbar platforms and
   * ~15px on Windows, and hard-coding either is wrong on the other.
   * `scrollbar-gutter: stable` on <html> (see index.css) makes it a constant, so
   * a short page and a long one no longer reserve different widths — which used
   * to nudge the whole layout on every navigation between them.
   */
  useEffect(() => {
    const publish = () =>
      document.documentElement.style.setProperty(
        '--scrollbar-gutter',
        `${window.innerWidth - document.documentElement.clientWidth}px`
      );
    publish();
    window.addEventListener('resize', publish);
    return () => window.removeEventListener('resize', publish);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      // A dialog owns the keyboard while it is open: `?` must not stack the
      // shortcuts sheet on top of Settings, and `]` must not switch the ticker
      // out from under a drilldown that is showing one print.
      if (overlayOwnsKeyboard()) return;
      // `?` (Shift+/) opens the shortcuts sheet
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(prev => !prev);
        return;
      }
      // `[` / `]` step through the watchlist without leaving the keyboard
      if (e.key === '[' || e.key === ']') {
        const list = Simulator.WATCHLIST;
        const at = list.indexOf(tickerRef.current);
        if (at === -1) return;
        e.preventDefault();
        const next = e.key === ']' ? (at + 1) % list.length : (at - 1 + list.length) % list.length;
        changeTicker(list[next]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [changeTicker]);

  return (
    <div className="min-h-screen relative bg-canvas text-textPrimary">
      {/* Keyboard/screen-reader escape hatch past the nav straight to the desk. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-md focus:border focus:border-select/50 focus:bg-panel focus:px-3 focus:py-2 focus:font-mono focus:text-label focus:uppercase focus:tracking-wider focus:text-textPrimary focus:shadow-overlay"
      >
        Skip to content
      </a>
      <TopBar onOpenPalette={openPalette} onOpenSettings={openSettings} />
      {/* pt-14 clears the overlaid glass bar; content scrolls under it so the
          blur has the live desk behind it to refract. */}
      {/* No scroller and no height of its own — the document handles both. */}
      <main id="main-content" tabIndex={-1} className="pt-14 focus:outline-none">
        {/* Keyed by top-level section only — subpage changes animate inside
            their section layout so the header/tabs never remount */}
        {/* Opacity-only crossfade — no vertical translate (which nudged the whole
            page on every section switch) and a short fade so content never blanks. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`/${location.pathname.split('/')[1] ?? ''}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.fast, ease: 'easeOut' }}
            /* Was min-h-full, which resolved against <main>'s fixed height.
               With the document scrolling there is no such height, so the
               viewport minus the bar is stated directly — it is what keeps the
               footer on the bottom edge of a short page rather than floating
               it mid-screen. */
            className="w-full min-h-[calc(100vh-3.5rem)] flex flex-col"
          >
            {/* One broken desk should never blank the whole terminal; the key
                resets the boundary whenever the route changes. */}
            <div data-page-container="body" className={`${PAGE_CONTAINER} flex flex-1 flex-col gap-4 py-5`}>
              <RouteErrorBoundary resetKey={location.pathname}>
                <Outlet />
              </RouteErrorBoundary>
            </div>
            {/* min-h-full above + mt-auto here pin the footer to the bottom of
                the viewport on short desks instead of letting it float
                mid-page; on tall desks it simply trails the content. It sits
                OUTSIDE the page container and supplies its own, so its rule
                and its columns land on the same left and right edges as the
                content above. Pulse renders nothing at all, so its panels keep
                the viewport's bottom edge. */}
            {footer != null && (
              <div className="mt-auto">
                <SiteFooter bleed />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      {/* Not on Pulse: the workspace is a fixed surface with panels in every
          corner, and a floating control over the bottom-right one is furniture
          in the middle of the work. Everywhere else it self-gates on scroll
          depth, so short pages never show it. */}
      {!isTerminalRoute(location.pathname) && <BackToTop />}
      <CommandPalette
        open={paletteOpen}
        onClose={closePalette}
        onOpenSettings={openSettings}
        onOpenShortcuts={openShortcuts}
      />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <OnboardingOverlay />
    </div>
  );
};

export default AppShell;
