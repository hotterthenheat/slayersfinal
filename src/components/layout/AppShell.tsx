import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import TopBar from './TopBar';
import CommandPalette from './CommandPalette';
import SettingsPanel from './SettingsPanel';
import ShortcutsOverlay from './ShortcutsOverlay';
import RouteErrorBoundary from './RouteErrorBoundary';

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

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
        return;
      }
      // `?` (Shift+/) opens the shortcuts sheet, unless the user is typing
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        setShortcutsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-canvas text-textPrimary overflow-hidden">
      <TopBar onOpenPalette={openPalette} onOpenSettings={openSettings} />
      <main className="flex-grow overflow-y-auto">
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
            transition={{ duration: 0.12, ease: 'easeOut' }}
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
    </div>
  );
};

export default AppShell;
