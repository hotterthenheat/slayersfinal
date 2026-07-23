import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

export interface SubNavItem {
  path: string;
  label: string;
  icon?: LucideIcon;
  /** Optional workflow cluster — when present, tabs render in labelled groups. */
  group?: string;
}

interface SubNavProps {
  items: SubNavItem[];
  ariaLabel?: string;
}

const Tab = ({ item, pillId }: { item: SubNavItem; pillId: string }) => (
  <NavLink
    to={item.path}
    className={({ isActive }) =>
      `relative shrink-0 px-3 py-1.5 font-mono text-caption leading-4 whitespace-nowrap transition-colors rounded-[5px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select/60 active:scale-[0.98] ${
        isActive
          ? 'text-ink font-semibold'
          : 'text-textSecondary font-medium hover:text-textPrimary hover:bg-white/[0.03] rounded-[5px]'
      }`
    }
  >
    {({ isActive }) => (
      <>
        {isActive && (
          <motion.span
            layoutId={pillId}
            className="absolute inset-0 rounded-[5px] holo-bg"
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
        <span className="relative z-10 inline-flex items-center gap-1.5">
          {item.icon && <item.icon className="w-3.5 h-3.5" />}
          {item.label}
        </span>
      </>
    )}
  </NavLink>
);

/**
 * Route-driven sub-page tabs. The active tab wears a holographic-silver pill
 * with dark text; the pill is a framer-motion shared element, so it slides
 * between tabs instead of blinking. When items carry a `group`, the bar splits
 * into labelled clusters that wrap on narrow screens.
 */
const SubNav = ({ items, ariaLabel }: SubNavProps) => {
  const pillId = `subnav-pill-${ariaLabel ?? 'tabs'}`;
  const grouped = items.some(i => i.group);
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  // On a phone the bar scrolls horizontally; keep the active tab in view so you
  // never land on a page with its own tab clipped off the right edge.
  useEffect(() => {
    const active = navRef.current?.querySelector('[aria-current="page"]');
    active?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [pathname]);

  if (!grouped) {
    return (
      <nav
        ref={navRef}
        aria-label={ariaLabel}
        className="glass flex items-center gap-0.5 border border-white/[0.08] rounded-md p-0.5 max-w-full overflow-x-auto no-scrollbar"
      >
        {items.map(item => (
          <Tab key={item.path} item={item} pillId={pillId} />
        ))}
      </nav>
    );
  }

  // Preserve first-seen group order.
  const groups: string[] = [];
  for (const i of items) {
    const g = i.group ?? '';
    if (!groups.includes(g)) groups.push(g);
  }

  return (
    <nav aria-label={ariaLabel} className="flex flex-wrap items-start gap-x-3 gap-y-2.5">
      {groups.map(g => (
        <div key={g} className="flex flex-col gap-1 min-w-0 max-w-full">
          <span className="px-1 font-mono text-micro font-medium uppercase tracking-[0.18em] text-textMuted select-none">
            {g}
          </span>
          <div className="glass flex items-center gap-0.5 border border-white/[0.08] rounded-md p-0.5 max-w-full overflow-x-auto no-scrollbar">
            {items
              .filter(i => (i.group ?? '') === g)
              .map(item => (
                <Tab key={item.path} item={item} pillId={pillId} />
              ))}
          </div>
        </div>
      ))}
    </nav>
  );
};

export default SubNav;
