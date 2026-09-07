import { Fragment } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

export interface SubNavItem {
  path: string;
  label: string;
  icon?: LucideIcon;
  /*
    A RAIL LONG ENOUGH TO NEED READING ORDER SHOULD SHOW IT.

    Ten peers in a flat row answer "what is here" and not "where do I
    start". When items carry a group, the rail draws a hairline and the
    group's name before the first item of each — so the row reads as
    sections of a workflow rather than a list of equals. Items without a
    group render exactly as before; every other rail in the app is
    untouched.
  */
  group?: string;
}

interface SubNavProps {
  items: SubNavItem[];
  ariaLabel?: string;
}

/**
 * Route-driven sub-page tabs. The active tab wears a living holo-silver pill
 * with dark ink — the same animated chrome as the logo, so navigation reads
 * as terminal hardware rather than market color. The pill is a framer-motion
 * shared element, so it slides between tabs instead of blinking.
 */
/*
  ICONS STOP EARNING THEIR SPACE SOMEWHERE AROUND EIGHT TABS, and the
  threshold is where it is because it was measured rather than felt.

  Pinpoint's rail is twelve tabs. With icons it measures 1,416px against a
  1,392px content area at 1440 — so it WRAPPED, on the widest desk screen
  this terminal is built for, putting one orphaned tab on a second row
  under eleven. The icons are 240px of that 1,416. Removing them takes the
  rail to 1,176px, which fits on one row at 1440 and at 1280 with room to
  spare, and the wrap that was the first thing a reader saw is gone.

  It is also the better look, which is the part that matters more than the
  arithmetic. One glyph beside two words tells you something. Twelve
  different glyphs in a row at 14px stop distinguishing anything and start
  reading as texture — the eye scans the words and the icons become noise
  the words have to fight through.

  So the rule is a property of the rail rather than a flag at each call
  site: a nav that has grown past eight tabs is a rail rather than a set of
  buttons, and it goes typographic. Four tabs keep their icons and are
  better for them.
*/
/* Raised to 9 when Pinpoint's rebuilt rail had nine tabs, then put back
   (2026-09-06). The paragraph above is right and I overrode it for one
   section: nine glyphs at 14px in a row are texture the words have to
   fight through, and Pinpoint's tabs are one word each — the word IS the
   icon. The rail goes typographic exactly as this file argues. */
export const ICON_LIMIT = 8;

const SubNav = ({ items, ariaLabel }: SubNavProps) => {
  /*
    A GROUPED RAIL IS ALREADY WAYFINDING, so it does not also buy glyphs.

    Not a width fix — measured, Pinpoint's eight grouped tabs hold one row
    with or without icons, down to 1024 (519px of links in a 976px rail). It
    is the argument this file already makes, applied to a rail that now has
    something better than a glyph: a group label says WHERE IN THE PRODUCT a
    tab sits, which no icon can, and it says it in the same ink as the tab
    beside it. Carrying both means two wayfinding systems competing over one
    row of 10px type. The labels win and the icons go.

    Ungrouped rails keep the old rule untouched — four tabs with icons are
    better for them, exactly as argued above.
  */
  const grouped = items.some(i => i.group);
  const showIcons = !grouped && items.length <= ICON_LIMIT;
  return (
    <nav
      aria-label={ariaLabel}
      /* A STRUCTURAL HOOK, so the overflow guard stops matching on prose.
         The sweep found this bar with `nav[aria-label$="subpages"]` and lost
         it the day Pinpoint's rail was renamed to "Pinpoint desks" — better
         copy for a screen reader, and a silent hole in the one check that
         keeps a tab from running off the right edge of a phone. */
      data-subnav="true"
      /* `flex-wrap` because three tabs do not fit a phone. The Pinpoint set
         measures 415px of pills against a 358px content area at 390px, so
         "Vanna & Charm" ended 40px past the right edge and the desk slid 43px
         sideways. Wrapping rather than scrolling: a horizontal scroller hides
         tabs behind a scrollbar that is invisible until you drag it, and a tab
         a reader cannot see is a route they cannot reach.

         It stays the mechanism after the icon rule above, and the two answer
         different widths: dropping the icons is what stops a DESK screen
         wrapping, and wrapping is still the right thing on a phone, where no
         amount of trimming fits twelve tabs on one line. */
      className="inline-flex flex-wrap items-center gap-0.5 border border-borderSubtle bg-panel rounded-md p-0.5"
    >
      {items.map((item, i) => (
        <Fragment key={item.path}>
          {item.group && item.group !== items[i - 1]?.group && (
            <span className="inline-flex items-center gap-1.5 pl-2 pr-1 first:pl-1 select-none">
              {i > 0 && <span aria-hidden className="w-px h-3.5 bg-borderSubtle" />}
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-textMuted whitespace-nowrap">
                {item.group}
              </span>
            </span>
          )}
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
                  layoutId={`subnav-pill-${ariaLabel ?? 'tabs'}`}
                  className="absolute inset-0 rounded-[5px] holo-bg"
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                {showIcons && item.icon && <item.icon className="w-3.5 h-3.5" />}
                {item.label}
              </span>
            </>
          )}
        </NavLink>
        </Fragment>
      ))}
    </nav>
  );
};

export default SubNav;
