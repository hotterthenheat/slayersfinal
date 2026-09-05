/*
==================================================
  SLAYER TERMINAL - TOP BAR (nav + utilities)
  Four workflow tabs — Discover, Analyze, Manage,
  Review — each with its icon, so a new user knows
  what a tab is FOR before learning a brand name.
  Hovering a tab drops the desks it holds; the holo
  underline marks the workflow you are inside. The
  wordmark exits to the landing.
==================================================
*/

import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Search } from 'lucide-react';
import { useLaunch } from './LaunchTransition';
import { NAV_GROUPS, NAV_GROUP_META, NAV_ITEMS, itemsByGroup } from './nav';
import { SessionPhase } from '../ui/AsOf';

interface TopBarProps {
  onOpenPalette: () => void;
}

const TopBar = ({ onOpenPalette }: TopBarProps) => {
  const { launch } = useLaunch();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [dropdown, setDropdown] = useState<string | null>(null);

  // Which workflow the current route lives in — drives the underline.
  const activeGroup = NAV_ITEMS.find(i => pathname.startsWith(i.path))?.group ?? null;

  return (
    <header className="h-14 shrink-0 border-b border-borderSubtle bg-canvas/90 backdrop-blur flex items-center gap-4 px-4 relative z-40">
      {/* Logo — plays the gate back out to the landing. flex-1 mirrors the
          right cluster so the nav sits dead-center in the bar. */}
      <div className="flex-1 min-w-0 flex items-center">
        <a
          href="/"
          onClick={e => {
            e.preventDefault();
            launch('/');
          }}
          className="shrink-0 font-mono text-[13px] font-bold tracking-tight select-none"
        >
          <span className="text-textMuted">&gt; </span>
          <span className="holo-text">slayer_terminal</span>
          <span className="inline-block w-[6px] h-[12px] ml-1 bg-textPrimary align-middle animate-cursor-blink" />
        </a>
      </div>

      {/* Workflow nav — four tabs centered between the flex-1 side zones */}
      <nav className="hidden md:flex items-center self-stretch shrink-0">
        {NAV_GROUPS.map(group => {
          const meta = NAV_GROUP_META[group];
          const items = itemsByGroup(group);
          const isActive = activeGroup === group;
          const GroupIcon = meta.icon;
          return (
            <div
              key={group}
              className="relative self-stretch flex items-center"
              onMouseEnter={() => setDropdown(group)}
              onMouseLeave={() => setDropdown(null)}
            >
              <button
                onClick={() => {
                  // Tab click lands on the group's lead desk.
                  navigate(items[0].path);
                  setDropdown(null);
                }}
                className={`relative self-stretch flex items-center gap-1.5 px-3 font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  isActive ? 'text-textPrimary' : 'text-textSecondary hover:text-textPrimary'
                }`}
              >
                <GroupIcon className={`w-3.5 h-3.5 ${isActive ? 'text-textPrimary' : 'text-textMuted'}`} />
                {group}
                <ChevronDown className="w-3 h-3 text-textMuted" />
                {isActive && (
                  <motion.span
                    layoutId="topnav-underline"
                    className="absolute left-2 right-2 bottom-0 h-[2px] rounded-full holo-bar"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>

              {/* Hover dropdown — the desks inside this workflow */}
              <AnimatePresence>
                {dropdown === group && (
                  <motion.div
                    className="absolute left-0 top-full z-50"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="mt-1 min-w-[264px] border border-borderMuted bg-panel rounded-md shadow-2xl shadow-black/60 overflow-hidden">
                      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-borderSubtle">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-textPrimary whitespace-nowrap">
                          {group}
                        </span>
                        <span className="font-mono text-[9px] text-textMuted whitespace-nowrap">{meta.hint}</span>
                      </div>
                      <div className="p-1.5 flex flex-col gap-0.5">
                        {items.map(item => (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => setDropdown(null)}
                            className={({ isActive: here }) =>
                              `flex items-start gap-2.5 px-2.5 py-2 rounded transition-colors ${
                                here
                                  ? 'bg-white/[0.06]'
                                  : 'hover:bg-white/[0.03]'
                              }`
                            }
                          >
                            {({ isActive: here }) => (
                              <>
                                <item.icon
                                  className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${here ? 'text-textPrimary' : 'text-textMuted'}`}
                                />
                                <span className="flex flex-col gap-0.5 min-w-0">
                                  <span
                                    className={`font-mono text-[12px] font-semibold leading-none ${
                                      here ? 'text-textPrimary' : 'text-textSecondary'
                                    }`}
                                  >
                                    {item.label}
                                  </span>
                                  <span className="text-[10px] text-textMuted leading-snug max-w-[240px]">
                                    {item.description}
                                  </span>
                                </span>
                                <span className="ml-auto font-mono text-[9px] text-textMuted pt-0.5">{item.code}</span>
                              </>
                            )}
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>

      {/*
        Right cluster: SEARCH, and nothing else (Noah, 2026-08-25).

        It used to carry a ticker readout, a Sim badge and a wall clock. All
        three were the same fact printed twice by the time you were anywhere
        worth being: a chart desk shows its own symbol and price per pane, and
        the tape now carries the clock on its own time axis. A global header
        that repeats what the page under it already says is a header that
        costs 14px of every page for nothing.
      */}
      <div className="flex-1 flex items-center justify-end gap-4">
        {/* WHERE THE SESSION IS, once, for the whole desk.

            Every page on this terminal draws numbers whose meaning depends on
            it — a chain read at 07:00 is yesterday's, a tape that is quiet at
            03:00 is quiet because the market is shut, not because the feed
            died. Repeating that per panel would cost every header a line; the
            reader only needs it in one place, and this is the strip that is on
            screen no matter which page they are on.

            Hidden below `sm`: a phone has no room for it, and the phone's
            Pulse is a single chart whose own header can say it. */}
        <span className="hidden sm:inline-flex">
          <SessionPhase />
        </span>
        <button
          onClick={onOpenPalette}
          aria-label="Search or jump to…"
          className="flex items-center gap-2 border border-borderSubtle bg-panel hover:border-borderMuted rounded-md px-2.5 py-1.5 text-xs text-textMuted transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          <kbd className="font-mono text-[10px] border border-borderSubtle rounded px-1 py-0.5 text-textMuted bg-inset">
            ⌘K
          </kbd>
        </button>
      </div>
    </header>
  );
};

export default TopBar;
