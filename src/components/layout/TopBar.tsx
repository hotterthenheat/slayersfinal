/*
==================================================
  SLAYER TERMINAL - TOP BAR (nav + utilities)
  The sidebar, laid flat: logo, horizontal nav with
  a sliding white underline ("white = where you are")
  and hover dropdowns for sectioned pages, then the
  live context cluster. Home exits to the landing.
==================================================
*/

import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Search, type LucideIcon } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { useLaunch } from './LaunchTransition';
import SignalBadge from '../ui/SignalBadge';
import { NAV_ITEMS } from './nav';
import { GEX_SUBPAGES } from '../../pages/gex/subnav';
import { FLOWDESK_SUBPAGES } from '../../pages/flowdesk/subnav';
import { COMMUNITY_SUBPAGES } from '../../pages/community/subnav';

interface TopBarProps {
  onOpenPalette: () => void;
}

/** Sections that carry subtabs — the nav item grows a hover dropdown. */
const SECTION_SUBPAGES: Record<string, { path: string; label: string; icon?: LucideIcon }[]> = {
  '/pinpoint': GEX_SUBPAGES,
  '/trace': FLOWDESK_SUBPAGES,
  '/community': COMMUNITY_SUBPAGES,
};

const TopBar = ({ onOpenPalette }: TopBarProps) => {
  const { activeTicker, marketData } = useMarketData();
  const { launch } = useLaunch();
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString('en-US', { hour12: false }));
  const [dropdown, setDropdown] = useState<string | null>(null);

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

      {/* Horizontal nav — centered between the flex-1 side zones */}
      <nav className="hidden lg:flex items-center self-stretch shrink-0">
        {NAV_ITEMS.map((item, i) => {
          const subs = SECTION_SUBPAGES[item.path];
          const groupBreak = i > 0 && NAV_ITEMS[i - 1].group !== item.group;
          return (
            <div
              key={item.path}
              className="relative self-stretch flex items-center"
              onMouseEnter={() => subs && setDropdown(item.path)}
              onMouseLeave={() => setDropdown(null)}
            >
              {groupBreak && <span className="w-px h-4 bg-borderSubtle mx-2" aria-hidden />}
              <NavLink
                to={item.path}
                end={item.path === '/'}
                onClick={
                  item.path === '/'
                    ? e => {
                        // Home = the landing — leave through the gate.
                        e.preventDefault();
                        launch('/');
                      }
                    : undefined
                }
                className={({ isActive }) =>
                  `relative self-stretch flex items-center gap-1 px-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                    isActive ? 'text-textPrimary' : 'text-textSecondary hover:text-textPrimary'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
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
                  </>
                )}
              </NavLink>

              {/* Hover dropdown — subtabs for sectioned pages */}
              <AnimatePresence>
                {subs && dropdown === item.path && (
                  <motion.div
                    className="absolute left-0 top-full z-50"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="mt-1 min-w-[210px] border border-borderMuted bg-panel rounded-md shadow-2xl shadow-black/60 overflow-hidden">
                      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-borderSubtle">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-textPrimary whitespace-nowrap">
                          {item.label}
                        </span>
                        <span className="font-mono text-[9px] text-textMuted">{item.code}</span>
                      </div>
                      <div className="p-1.5 flex flex-col gap-0.5">
                        {subs.map(sub => (
                          <NavLink
                            key={sub.path}
                            to={sub.path}
                            onClick={() => setDropdown(null)}
                            className={({ isActive }) =>
                              `flex items-center gap-2 px-2.5 py-1.5 rounded font-mono text-[12px] whitespace-nowrap transition-colors ${
                                isActive
                                  ? 'bg-white/[0.06] text-textPrimary'
                                  : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.03]'
                              }`
                            }
                          >
                            {sub.icon && <sub.icon className="w-3.5 h-3.5 text-textMuted" />}
                            {sub.label}
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
