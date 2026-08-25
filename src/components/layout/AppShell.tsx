import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import PageFault from '../ui/PageFault';
import TopBar from './TopBar';
import CommandPalette from './CommandPalette';

/** Full-page detours that live under a section prefix but share none of its
    layout — they get their own transition key so the changeover animates
    instead of snapping (subtabs inside section layouts stay key-stable). */
const FULL_PAGE_DETOURS = ['/pulse/board'];

const AppShell = () => {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const transitionKey = FULL_PAGE_DETOURS.includes(location.pathname)
    ? location.pathname
    : `/${location.pathname.split('/')[1] ?? ''}`;

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-canvas text-textPrimary overflow-hidden">
      <TopBar onOpenPalette={openPalette} />
      <main className="flex-grow overflow-y-auto">
        {/* Keyed by top-level section only — subpage changes animate inside
            their section layout so the header/tabs never remount */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={transitionKey}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            /* pb-16: pages breathe at the bottom (Noah, 2026-08-17 —
               "everything ends very close to the bottom") */
            className="w-full px-4 lg:px-6 2xl:px-8 pt-5 pb-16 flex flex-col gap-4"
          >
            <PageFault resetKey={location.pathname}>
              <Outlet />
            </PageFault>
          </motion.div>
        </AnimatePresence>
      </main>
      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </div>
  );
};

export default AppShell;
