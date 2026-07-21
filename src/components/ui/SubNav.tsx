import { NavLink } from 'react-router-dom';
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
      `relative px-3 py-1.5 font-mono text-xs whitespace-nowrap transition-colors ${
        isActive
          ? 'text-[#0a0a0a] font-semibold'
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

  if (!grouped) {
    return (
      <nav
        aria-label={ariaLabel}
        className="inline-flex items-center gap-0.5 border border-borderSubtle bg-panel rounded-md p-0.5"
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
        <div key={g} className="flex flex-col gap-1">
          <span className="px-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-textMuted select-none">
            {g}
          </span>
          <div className="inline-flex items-center gap-0.5 border border-borderSubtle bg-panel rounded-md p-0.5">
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
