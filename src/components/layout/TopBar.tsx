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

import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Search } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { useLaunch } from './LaunchTransition';
import SignalBadge from '../ui/SignalBadge';
import { NAV_GROUPS, NAV_GROUP_META, NAV_ITEMS, itemsByGroup } from './nav';

interface TopBarProps {
  onOpenPalette: () => void;
}

const TopBar = ({ onOpenPalette }: TopBarProps) => {
  const { activeTicker, marketData } = useMarketData();
  const { launch } = useLaunch();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString('en-US', { hour12: false }));
  const [dropdown, setDropdown] = useState<string | null>(null);

  // Which workflow the current route lives in — drives the underline.
  const activeGroup = NAV_ITEMS.find(i => pathname.startsWith(i.path))?.group ?? null;

  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toLocaleTimeString('en-US', { hour12: false })), 1000);
    return () => clearInterval(id);
  }, []);

  const changeUp = (marketData?.changePercent ?? 0) >= 0;

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

      {/* Right cluster: search + live context */}
      <div className="flex-1 flex items-center justify-end gap-4">
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
        <span className="hidden md:block font-mono text-xs text-textSecondary tnum select-none">{clock}</span>
      </div>
    </header>
  );
};

export default TopBar;
