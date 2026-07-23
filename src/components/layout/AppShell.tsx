import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import TopBar from './TopBar';
import OnboardingOverlay from './OnboardingOverlay';
import CommandPalette from './CommandPalette';
import SettingsPanel from './SettingsPanel';
import ShortcutsOverlay from './ShortcutsOverlay';
import RouteErrorBoundary from './RouteErrorBoundary';
import { useTicker } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { DUR } from '../../lib/motion';

/** True when focus is in a field, so global single-key shortcuts don't fire mid-typing. */
const isTypingTarget = (el: EventTarget | null): boolean => {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
};

const AppShell = () => {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const location = useLocation();
  const { activeTicker, changeTicker } = useTicker();

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);

  // Keep the live handler reading the current ticker without re-binding the listener.
  const tickerRef = useRef(activeTicker);
  tickerRef.current = activeTicker;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
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
    <div className="h-screen relative bg-canvas text-textPrimary overflow-hidden">
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
      <main id="main-content" tabIndex={-1} className="h-full overflow-y-auto pt-14 focus:outline-none">
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
            className="w-full px-4 lg:px-6 2xl:px-8 py-5 flex flex-col gap-4"
          >
            {/* One broken desk should never blank the whole terminal; the key
                resets the boundary whenever the route changes. */}
            <RouteErrorBoundary resetKey={location.pathname}>
              <Outlet />
            </RouteErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>
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
