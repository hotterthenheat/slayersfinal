import { useCallback, useEffect, useRef, useState } from 'react';
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

const FADE = 18; // px of fade at an overflowing edge

/**
 * The bordered pill that holds a row of tabs, with the tab strip scrolling
 * inside it.
 *
 * The strip hides its scrollbar (a 4px bar under a 28px tab row reads as grit),
 * which left no signal at all that more tabs existed — on a phone the Pinpoint
 * rail hid 211px, so Volatility, Stress and History were simply invisible. The
 * overflowing edge now fades, and only that edge: a fade on the left when you
 * have scrolled, on the right while more remains, neither when it all fits.
 *
 * The fade is a mask on the inner strip rather than the pill, so the pill's
 * border and glass stay crisp instead of dissolving with the tabs.
 */
const ScrollRail = ({ children }: { children: React.ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 2;
    const right = max > 2 && el.scrollLeft < max - 2;
    setEdges(prev => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    return () => {
      el.removeEventListener('scroll', measure);
      ro.disconnect();
    };
  }, [measure]);

  const mask =
    edges.left && edges.right
      ? `linear-gradient(to right, transparent 0, #000 ${FADE}px, #000 calc(100% - ${FADE}px), transparent 100%)`
      : edges.right
        ? `linear-gradient(to right, #000 calc(100% - ${FADE}px), transparent 100%)`
        : edges.left
          ? `linear-gradient(to right, transparent 0, #000 ${FADE}px)`
          : undefined;

  return (
    <div className="glass border border-white/[0.08] rounded-md p-0.5 max-w-full">
      <div
        ref={ref}
        className="flex items-center gap-0.5 overflow-x-auto no-scrollbar"
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      >
        {children}
      </div>
    </div>
  );
};

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
      <nav ref={navRef} aria-label={ariaLabel} className="flex max-w-full">
        <ScrollRail>
          {items.map(item => (
            <Tab key={item.path} item={item} pillId={pillId} />
          ))}
        </ScrollRail>
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
          <ScrollRail>
            {items
              .filter(i => (i.group ?? '') === g)
              .map(item => (
                <Tab key={item.path} item={item} pillId={pillId} />
              ))}
          </ScrollRail>
        </div>
      ))}
    </nav>
  );
};

export default SubNav;
