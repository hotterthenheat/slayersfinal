/*
==================================================
  SLAYER TERMINAL - TOP BAR (nav + utilities)
  Four groups from nav.ts — Scan · Read · Yours ·
  Models — each a hover-dropdown of the branded desks
  inside it. A sliding holo underline marks the active
  group. Below lg the whole nav collapses into a
  slide-down drawer grouped the same way. Home exits
  via the wordmark.
==================================================
*/

import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Search, Menu, X, Settings, type LucideIcon } from 'lucide-react';
import { useMarketData, useTicker } from '../../context/MarketDataContext';
import AnimatedNumber from '../ui/AnimatedNumber';
import TickerSearch from '../ui/TickerSearch';
import FeedBadge from './FeedBadge';
import { NAV_GROUPS, itemsByGroup, NAV_ITEMS, type NavGroup, type NavItem } from './nav';
import { PAGE_CONTAINER } from './container';
import { DUR, EASE, PILL } from '../../lib/motion';
import { marketClock } from '../../core/calendar';

interface TopBarProps {
  onOpenPalette: () => void;
  onOpenSettings: () => void;
}

type SubLink = { path: string; label: string; icon?: LucideIcon };

const Wordmark = ({ onClick, size = 'sm' }: { onClick: (e: React.MouseEvent) => void; size?: 'sm' | 'md' }) => (
  <a
    href="/terminal"
    onClick={onClick}
    aria-label="Terminal home"
    title="Terminal home"
    className={`shrink-0 font-mono font-bold tracking-tight select-none ${size === 'md' ? 'text-read' : 'text-data'}`}
  >
    <span className="text-textMuted">&gt; </span>
    {/* Abbreviated on phone. The full wordmark is 138px and the right cluster
        needs that room — the global ticker switcher was being clipped off the
        edge at 390px and below. Branding yields to the instrument; the
        aria-label and title still read "Terminal home" either way. */}
    <span className="holo-text">
      slayer<span className="hidden sm:inline">_terminal</span>
    </span>
    <span className="inline-block w-[6px] h-[12px] ml-1 bg-textPrimary align-middle animate-cursor-blink" />
  </a>
);

/**
 * Routes where the active symbol actually drives the page.
 *
 * The chip used to render on all 21 shell routes and, measured by switching it
 * and diffing the rendered text, changed six of them. On the Guide and Legal
 * pages it was a live-looking quote decorating a help article and a legal
 * document, which is the one thing this product must not imply.
 *
 * Pinpoint is listed whole. Its Stress tab looked unscoped by that test and is
 * not — `HedgeImpact` reads the snapshot, it just never prints the symbol. A
 * rendered-text diff can only see what a page says out loud, so check the
 * source before concluding a page ignores something.
 *
 * Trace is listed per tab because it genuinely splits: Dark pool and Scanner
 * rebuild around the active symbol, Live tape and Reconstruction do not. Live
 * tape shows the same SPY prints whichever symbol is selected, so a chip there
 * would not be merely inert — it would say the desk is looking at something it
 * is not, which is worse than absent.
 */
const TICKER_SCOPED = [
  '/pulse',
  '/compass',
  '/pinpoint',
  '/prove-it',
  '/trace/dark-pool',
  '/trace/scanner',
  // Tracker for the same reason again: EdgeLedger seeds every modelled trade
  // from the active snapshot, so the global [ / ] shortcuts were silently
  // rebuilding the ledger with nothing on screen naming the symbol or able to
  // put it back.
  '/tracker',
];
const tickerScoped = (path: string) =>
  TICKER_SCOPED.some(r => path === r || path.startsWith(`${r}/`));

const TopBar = ({ onOpenPalette, onOpenSettings }: TopBarProps) => {
  const { activeTicker, changeTicker } = useTicker();
  const navigate = useNavigate();
  const location = useLocation();
  const [clock, setClock] = useState(marketClock);
  const [dropdown, setDropdown] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setClock(marketClock()), 1000);
    return () => clearInterval(id);
  }, []);

  // The chip is only meaningful where the page is scoped to one symbol.
  const scoped = tickerScoped(location.pathname);

  // Close the mobile drawer whenever the route changes
  useEffect(() => setMobileOpen(false), [location.pathname]);

  // Inside the shell the wordmark is Home, the convention for an app logo, and
  // it goes to the index rather than to Pulse. It has always been labelled
  // "Terminal home" while landing on one particular desk; now the label is true,
  // and the index is reachable from inside the terminal instead of being a page
  // you can only arrive at once.
  const goHome = (e: React.MouseEvent) => {
    e.preventDefault();
    navigate('/terminal');
  };
  const section = `/${location.pathname.split('/')[1] ?? ''}`;
  const activeItem = NAV_ITEMS.find(i => i.path === section);

  return (
    <>
    {/* The glass spans the viewport — it is the window's chrome — but its
        CONTENTS ride the page container, so the wordmark starts exactly where
        the page's first column starts instead of 32px inside it. */}
    <header
      className="glass absolute top-0 inset-x-0 h-14 border-b border-white/[0.07] z-40"
      // Reserve the page's scrollbar gutter so the bar's column lands on the
      // same left and right edges as the content scrolling beneath it.
      style={{ paddingRight: 'var(--scrollbar-gutter, 0px)' }}
    >
      <div data-page-container="bar" className={`${PAGE_CONTAINER} h-full flex items-center gap-3`}>
      {/* Left zone: mobile menu + wordmark. Reserved, high-stacking so nav can
          never paint over it. */}
      <div className="flex items-center gap-2 shrink-0 relative z-10">
        <button
          onClick={() => setMobileOpen(o => !o)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          className="lg:hidden inline-flex items-center justify-center w-8 h-8 -ml-1 rounded-md border border-borderSubtle bg-panel text-textSecondary hover:text-textPrimary transition-colors"
        >
          {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
        <Wordmark onClick={goHome} />
      </div>

      {/* Center nav — one dropdown per group. Allowed to shrink rather than
          overflow the side zones. */}
      <nav className="hidden lg:flex items-center self-stretch min-w-0 mx-auto">
        {NAV_GROUPS.map(group => {
          const items = itemsByGroup(group);
          const active = items.some(i => i.path === section);
          return (
            <div
              key={group}
              className="relative self-stretch flex items-center"
              onMouseEnter={() => setDropdown(group)}
              onMouseLeave={() => setDropdown(null)}
            >
              <button
                type="button"
                aria-haspopup="true"
                aria-expanded={dropdown === group}
                onClick={() => setDropdown(prev => (prev === group ? null : group))}
                onFocus={() => setDropdown(group)}
                className={`relative self-stretch flex items-center gap-1 px-3 my-2 rounded-md font-mono text-label font-semibold uppercase tracking-wider transition-colors ${
                  active
                    ? 'text-textPrimary bg-white/[0.06]'
                    : 'text-textMuted hover:text-textPrimary hover:bg-rowHover'
                }`}
              >
                {group}
                {active && activeItem && (
                  <span className="text-select">
                    {/* textSecondary, not textMuted: this dot rides the active
                        tab's lifted `bg-white/[0.06]`, where muted measures
                        4.39:1 — under AA. Still quieter than the group name
                        beside it and the desk name after it. */}
                    <span aria-hidden className="mx-1 text-textSecondary font-normal">·</span>
                    {activeItem.label}
                  </span>
                )}
                <ChevronDown className={`w-3 h-3 ${active ? 'text-textSecondary' : 'text-textMuted'}`} />
                {active && (
                  <motion.span
                    layoutId="topnav-underline"
                    className="absolute left-2.5 right-2.5 -bottom-2 h-[2px] rounded-full holo-bar"
                    transition={PILL}
                  />
                )}
              </button>
              <AnimatePresence>
                {dropdown === group && (
                  <DropMenu
                    title={group}
                    items={items.map(i => ({ path: i.path, label: i.label, icon: i.icon }))}
                    descriptions={Object.fromEntries(items.map(i => [i.path, i.description]))}
                    section={section}
                    onPick={() => setDropdown(null)}
                  />
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>

      {/* Right cluster: search + live context */}
      <div className="flex items-center justify-end gap-2 sm:gap-3 shrink-0 ml-auto lg:ml-0">
        <button
          onClick={onOpenPalette}
          aria-label="Search or jump to…"
          className="flex items-center gap-2 border border-borderSubtle bg-panel hover:border-borderMuted rounded-md px-2.5 py-1.5 text-caption text-textMuted transition-colors leading-4"
        >
          <Search className="w-3.5 h-3.5" />
          <kbd className="hidden sm:inline font-mono text-micro border border-borderSubtle rounded px-1 py-0.5 text-textMuted bg-inset">
            ⌘K
          </kbd>
        </button>
        <button
          onClick={onOpenSettings}
          aria-label="Settings"
          className="inline-flex items-center justify-center w-8 h-8 border border-borderSubtle bg-panel hover:border-borderMuted rounded-md text-textMuted hover:text-textPrimary transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
        {/* Ticker switcher — click the symbol to change what the desk is looking
            at. Only on the desks that are actually looking at one thing. */}
        {scoped && (
          <div className="flex items-center gap-2.5 font-mono text-caption leading-4">
            <TickerSearch value={activeTicker} onChange={changeTicker} />
            <LivePrice />
          </div>
        )}
        {/* Eastern time, and only that.
            
            It carried the session phase too — Open / Closed / Weekend — which
            read as a fact about the market and contradicted the desk directly
            underneath it: "WEEKEND" above a page saying "of today's volume" and
            "carries the session at $2.3B across 58 prints". Every desk here
            renders a full session, so a badge driven by the wall clock
            disagrees with the screen every night and all weekend. The time
            itself does not make that claim, and is the part a terminal wants.
            The phase survives as the hover, where it explains the clock instead
            of arguing with the page. */}
        <span
          className="hidden xl:flex items-center gap-1.5 font-mono text-caption text-textSecondary tnum select-none leading-4"
          title={`New York time — market ${clock.label.toLowerCase()}`}
        >
          <span>{clock.time}</span>
          <span className="text-micro uppercase tracking-wider text-textMuted">ET</span>
        </span>
        {/* What the numbers are. Every width, every desk — see FeedBadge. */}
        <FeedBadge />
      </div>
      </div>
    </header>

      {/* Mobile overlay — a SIBLING of the glass header, not a child. A
          backdrop-filter nested inside another backdrop-filter element can't
          sample the page, so the drawer's blur only composites out here. */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="lg:hidden fixed inset-0 top-14 z-30 bg-black/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              className="glass lg:hidden fixed inset-x-0 top-14 z-40 border-b border-white/[0.08] shadow-overlay max-h-[calc(100vh-3.5rem)] overflow-y-auto"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: DUR.quick, ease: EASE }}
            >
              <MobileNav section={section} onPick={() => setMobileOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

/** Spot + day change. Isolated so the price tick re-renders only this span, not
    the whole group nav / dropdown tree above it. */
const LivePrice = () => {
  const { marketData } = useMarketData();
  if (!marketData) return null;
  const changeUp = marketData.changePercent >= 0;
  return (
    <span className="hidden sm:flex items-baseline gap-1.5">
      <span className="text-textPrimary font-semibold tnum">
        <AnimatedNumber value={marketData.spot} format={v => `$${v.toFixed(2)}`} />
      </span>
      <span className={`tnum text-label ${changeUp ? 'text-bull' : 'text-bear'}`}>
        {changeUp ? '+' : ''}
        {marketData.changePercent.toFixed(2)}%
      </span>
    </span>
  );
};

/** Shared hover dropdown — lists the desks inside a group with a one-line
    description each. `section` marks the active desk (matches on the first path
    segment so a desk's subpages still highlight it). */
const DropMenu = ({
  title,
  items,
  descriptions,
  section,
  onPick,
}: {
  title: string;
  items: SubLink[];
  descriptions?: Record<string, string>;
  section?: string;
  onPick: () => void;
}) => (
  <motion.div
    className="absolute left-0 top-full z-50"
    initial={{ opacity: 0, y: -6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -6 }}
    transition={{ duration: DUR.quick, ease: EASE }}
  >
    <div className="relative mt-1 min-w-[248px] border border-borderMuted bg-panel rounded-md shadow-overlay overflow-hidden">
      <span aria-hidden className="holo-bar absolute inset-y-0 left-0 w-[2px] z-10" />
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-borderSubtle">
        <span className="font-mono text-micro font-semibold uppercase tracking-widest whitespace-nowrap text-textPrimary">
          {title}
        </span>
      </div>
      <div className="p-1.5 flex flex-col gap-0.5">
        {items.map(sub => {
          const isActive = section ? sub.path === section : false;
          return (
            <NavLink
              key={sub.path}
              to={sub.path}
              onClick={onPick}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded font-mono text-caption whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-white/[0.06] text-textPrimary'
                  : 'text-textSecondary hover:text-textPrimary hover:bg-rowHover'
              }`}
            >
              {sub.icon && <sub.icon className="w-3.5 h-3.5 text-textMuted" />}
              <span className="flex flex-col">
                {sub.label}
                {descriptions?.[sub.path] && (
                  <span className="font-sans text-label text-textMuted normal-case tracking-normal leading-tight">
                    {descriptions[sub.path]}
                  </span>
                )}
              </span>
            </NavLink>
          );
        })}
      </div>
    </div>
  </motion.div>
);

/** Full grouped nav list for the mobile drawer. */
const MobileNav = ({ section, onPick }: { section: string; onPick: () => void }) => (
  <div className="p-3 flex flex-col gap-4">
    {NAV_GROUPS.map((group: NavGroup) => {
      const items = itemsByGroup(group);
      return (
        <div key={group}>
          <div className="holo-text w-fit px-2 pb-1.5 font-mono text-micro uppercase tracking-widest">{group}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {items.map((item: NavItem) => {
              const active = item.path === section;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onPick}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-md border transition-colors ${
                    active
                      ? 'border-borderMuted bg-white/[0.06] text-textPrimary'
                      : 'border-borderSubtle text-textSecondary hover:text-textPrimary'
                  }`}
                >
                  <item.icon className={`w-4 h-4 ${active ? 'text-textPrimary' : 'text-textMuted'}`} />
                  <span className="font-mono text-caption font-semibold uppercase tracking-wider">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      );
    })}
    <p className="px-2 font-mono text-micro text-textMuted">
      {NAV_ITEMS.length} desks · ⌘K for quick jump
    </p>
  </div>
);

export default TopBar;
