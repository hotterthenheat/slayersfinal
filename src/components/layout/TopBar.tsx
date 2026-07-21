/*
==================================================
  SLAYER TERMINAL - TOP BAR (nav + utilities)
  Main views sit inline with a sliding holo underline
  ("white = where you are"); Research and Tools fold
  into labelled hover-dropdown groups so the 11-route
  app fits a laptop-width bar. Below lg the whole nav
  collapses into a slide-down drawer. Home exits via
  the wordmark.
==================================================
*/

import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Search, Menu, X, type LucideIcon } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { useLaunch } from './LaunchTransition';
import SignalBadge from '../ui/SignalBadge';
import { NAV_ITEMS, mainViews, researchViews, toolViews, type NavItem } from './nav';
import { GEX_SUBPAGES } from '../../pages/gex/subnav';
import { FLOWDESK_SUBPAGES } from '../../pages/flowdesk/subnav';
import { COMMUNITY_SUBPAGES } from '../../pages/community/subnav';

interface TopBarProps {
  onOpenPalette: () => void;
}

type SubLink = { path: string; label: string; icon?: LucideIcon };

/** Sections that carry subtabs — the inline nav item grows a hover dropdown. */
const SECTION_SUBPAGES: Record<string, SubLink[]> = {
  '/pinpoint': GEX_SUBPAGES,
  '/trace': FLOWDESK_SUBPAGES,
  '/community': COMMUNITY_SUBPAGES,
};

const GROUPS: { key: string; label: string; items: NavItem[] }[] = [
  { key: 'group:research', label: 'Research', items: researchViews },
  { key: 'group:tools', label: 'Tools', items: toolViews },
];

const Wordmark = ({ onClick, size = 'sm' }: { onClick: (e: React.MouseEvent) => void; size?: 'sm' | 'md' }) => (
  <a
    href="/"
    onClick={onClick}
    className={`shrink-0 font-mono font-bold tracking-tight select-none ${size === 'md' ? 'text-[15px]' : 'text-[13px]'}`}
  >
    <span className="text-textMuted">&gt; </span>
    <span className="holo-text">slayer_terminal</span>
    <span className="inline-block w-[6px] h-[12px] ml-1 bg-textPrimary align-middle animate-cursor-blink" />
  </a>
);

const TopBar = ({ onOpenPalette }: TopBarProps) => {
  const { activeTicker, marketData } = useMarketData();
  const { launch } = useLaunch();
  const location = useLocation();
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString('en-US', { hour12: false }));
  const [dropdown, setDropdown] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toLocaleTimeString('en-US', { hour12: false })), 1000);
    return () => clearInterval(id);
  }, []);

  // Close the mobile drawer whenever the route changes
  useEffect(() => setMobileOpen(false), [location.pathname]);

  const changeUp = (marketData?.changePercent ?? 0) >= 0;
  const goHome = (e: React.MouseEvent) => {
    e.preventDefault();
    launch('/');
  };
  const section = `/${location.pathname.split('/')[1] ?? ''}`;
  const groupActive = (items: NavItem[]) => items.some(i => i.path === section);

  return (
    <header className="h-14 shrink-0 border-b border-borderSubtle bg-canvas/90 backdrop-blur flex items-center gap-3 px-4 relative z-40">
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

      {/* Center nav — Main views inline + Research/Tools group menus. Allowed to
          shrink and scroll rather than overflow into the side zones. */}
      <nav className="hidden lg:flex items-center self-stretch min-w-0 mx-auto">
        {mainViews.map(item => {
          const subs = SECTION_SUBPAGES[item.path];
          const isActive = item.path === section;
          return (
            <div
              key={item.path}
              className="relative self-stretch flex items-center"
              onMouseEnter={() => subs && setDropdown(item.path)}
              onMouseLeave={() => setDropdown(null)}
            >
              <NavLink
                to={item.path}
                className={`relative self-stretch flex items-center gap-1 px-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  isActive ? 'text-textPrimary' : 'text-textSecondary hover:text-textPrimary'
                }`}
              >
                <item.icon className={`w-3.5 h-3.5 ${isActive ? 'text-textPrimary' : 'text-textMuted'}`} />
                {item.label}
                {subs && <ChevronDown className="w-3 h-3 text-textMuted" />}
                {isActive && (
                  <motion.span
                    layoutId="topnav-underline"
                    className="absolute left-2 right-2 bottom-0 h-[2px] rounded-full holo-bar"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </NavLink>
              <AnimatePresence>
                {subs && dropdown === item.path && (
                  <DropMenu title={item.label} code={item.code} items={subs} onPick={() => setDropdown(null)} />
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {/* Divider before the grouped menus */}
        <span className="w-px h-4 bg-borderSubtle mx-2" aria-hidden />

        {GROUPS.map(group => {
          const active = groupActive(group.items);
          return (
            <div
              key={group.key}
              className="relative self-stretch flex items-center"
              onMouseEnter={() => setDropdown(group.key)}
              onMouseLeave={() => setDropdown(null)}
            >
              <button
                className={`relative self-stretch flex items-center gap-1 px-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  active ? 'text-textPrimary' : 'text-textSecondary hover:text-textPrimary'
                }`}
              >
                {group.label}
                <ChevronDown className="w-3 h-3 text-textMuted" />
                {active && <span className="absolute left-2 right-2 bottom-0 h-[2px] rounded-full holo-bar" />}
              </button>
              <AnimatePresence>
                {dropdown === group.key && (
                  <DropMenu
                    title={group.label}
                    items={group.items.map(i => ({ path: i.path, label: i.label, icon: i.icon }))}
                    descriptions={Object.fromEntries(group.items.map(i => [i.path, i.description]))}
                    onPick={() => setDropdown(null)}
                  />
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>

      {/* Right cluster: search + live context */}
      <div className="flex items-center justify-end gap-3 shrink-0 ml-auto lg:ml-0">
        <button
          onClick={onOpenPalette}
          aria-label="Search or jump to…"
          className="flex items-center gap-2 border border-borderSubtle bg-panel hover:border-borderMuted rounded-md px-2.5 py-1.5 text-xs text-textMuted transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          <kbd className="hidden sm:inline font-mono text-[10px] border border-borderSubtle rounded px-1 py-0.5 text-textMuted bg-inset">
            ⌘K
          </kbd>
        </button>
        <div className="hidden sm:flex items-center gap-2 font-mono text-xs">
          <span className="text-textSecondary font-semibold">{activeTicker}</span>
          <span className="text-textPrimary font-semibold tnum">
            {marketData ? `$${marketData.spot.toFixed(2)}` : '--'}
          </span>
          {marketData && (
            <span className={`tnum text-[11px] ${changeUp ? 'text-bull' : 'text-bear'}`}>
              {changeUp ? '+' : ''}
              {marketData.changePercent.toFixed(2)}%
            </span>
          )}
        </div>
        <SignalBadge tone="warn">Sim</SignalBadge>
        <span className="hidden xl:block font-mono text-xs text-textSecondary tnum select-none">{clock}</span>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="lg:hidden fixed inset-0 top-14 z-30 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              className="lg:hidden absolute left-0 right-0 top-full z-40 border-b border-borderMuted bg-panel shadow-2xl shadow-black/60 max-h-[calc(100vh-3.5rem)] overflow-y-auto"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              <MobileNav section={section} onPick={() => setMobileOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
};

/** Shared hover dropdown for inline sections and grouped menus. */
const DropMenu = ({
  title,
  code,
  items,
  descriptions,
  onPick,
}: {
  title: string;
  code?: string;
  items: SubLink[];
  descriptions?: Record<string, string>;
  onPick: () => void;
}) => (
  <motion.div
    className="absolute left-0 top-full z-50"
    initial={{ opacity: 0, y: -6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -6 }}
    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
  >
    <div className="mt-1 min-w-[230px] border border-borderMuted bg-panel rounded-md shadow-2xl shadow-black/60 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-borderSubtle">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-textPrimary whitespace-nowrap">
          {title}
        </span>
        {code && <span className="font-mono text-[9px] text-textMuted">{code}</span>}
      </div>
      <div className="p-1.5 flex flex-col gap-0.5">
        {items.map(sub => (
          <NavLink
            key={sub.path}
            to={sub.path}
            onClick={onPick}
            className={({ isActive }) =>
              `flex items-center gap-2 px-2.5 py-1.5 rounded font-mono text-[12px] whitespace-nowrap transition-colors ${
                isActive ? 'bg-white/[0.06] text-textPrimary' : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.03]'
              }`
            }
          >
            {sub.icon && <sub.icon className="w-3.5 h-3.5 text-textMuted" />}
            <span className="flex flex-col">
              {sub.label}
              {descriptions?.[sub.path] && (
                <span className="font-sans text-[10px] text-textMuted normal-case tracking-normal leading-tight">
                  {descriptions[sub.path]}
                </span>
              )}
            </span>
          </NavLink>
        ))}
      </div>
    </div>
  </motion.div>
);

/** Full grouped nav list for the mobile drawer. */
const MobileNav = ({ section, onPick }: { section: string; onPick: () => void }) => {
  const groups: { label: string; items: NavItem[] }[] = [
    { label: 'Main views', items: mainViews },
    { label: 'Research', items: researchViews },
    { label: 'Tools', items: toolViews },
  ];
  return (
    <div className="p-3 flex flex-col gap-4">
      {groups.map(g => (
        <div key={g.label}>
          <div className="px-2 pb-1.5 font-mono text-[10px] uppercase tracking-widest text-textMuted">{g.label}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {g.items.map(item => {
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
                  <span className="font-mono text-[12px] font-semibold uppercase tracking-wider">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
      <p className="px-2 font-mono text-[10px] text-textMuted">
        {NAV_ITEMS.length} destinations · ⌘K for quick jump
      </p>
    </div>
  );
};

export default TopBar;
