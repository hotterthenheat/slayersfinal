import { Component, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import TopBar from './TopBar';
import CommandPalette from './CommandPalette';

/** A page crash must never black-screen the terminal — it renders a readable
    fault panel instead. Recovers via the resetKey prop (NOT a React key: a key
    would remount the whole section on every subtab change and kill the smooth
    subnav transitions). */
class RouteBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prevProps: { resetKey: string }) {
    // Navigating anywhere clears a shown fault so the next page gets a clean try
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="border border-bear/30 bg-bear/[0.04] rounded-lg p-8 flex flex-col items-start gap-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-bear">Page fault</span>
        <p className="text-[13px] text-textSecondary leading-relaxed max-w-lg">
          This page hit an error and stopped rendering. The rest of the terminal is fine — reload the
          page, or head back to Pulse. If it keeps happening, tell us in Community → Feedback.
        </p>
        <code className="font-mono text-[11px] text-textMuted break-all">{this.state.error.message}</code>
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-borderMuted font-mono text-[11px] uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:bg-white/[0.03] transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Reload
          </button>
          <Link
            to="/pulse"
            onClick={() => this.setState({ error: null })}
            className="inline-flex items-center px-3 py-1.5 rounded-md font-mono text-[11px] font-semibold uppercase tracking-wider text-[#0a0a0a] bg-[#D2FF00]"
          >
            Back to Pulse
          </Link>
        </div>
      </div>
    );
  }
}

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
            <RouteBoundary resetKey={location.pathname}>
              <Outlet />
            </RouteBoundary>
          </motion.div>
        </AnimatePresence>
      </main>
      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </div>
  );
};

export default AppShell;
