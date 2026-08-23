import React from 'react';
import { useLocation } from 'react-router-dom';
import { NAV_ITEMS } from '../layout/nav';
import SubNav, { type SubNavItem } from './SubNav';
import { DeskBarProvider, useDeskBarSlot } from './deskBar';
import { PAGE_STACK } from '../layout/container';

/*
==================================================
  SLAYER TERMINAL - THE DESK STRIP (ui/PageHeader.tsx)

  One row that says which desk you are on and lets you
  change it. Everything above the data, in about 40px.

  IT WAS FOUR ROWS AND 300px. Measured at 1500x900 before
  this change, from the top of the viewport to the first
  pixel of content:

      /pinpoint/gamma    282px
      /trace/execution   326px
      /trace/dark-pool   334px
      /compass           347px

  A third of the screen, on every route, before anything
  the reader came for. And the four rows were largely the
  same sentence four times: a breadcrumb reading
  TERMINAL / TRACE / EXECUTION, an <h1> reading "Trace", a
  subtitle describing the desk, and a tab bar with the
  desk's own tab already lit. The top bar above all of it
  already highlights the section.

  So: one strip. The section icon, the section name, the
  tabs, and whatever the page puts on the right. The
  breadcrumb is gone because the strip IS the breadcrumb —
  section on the left, active tab beside it. The prop went
  with it rather than lingering as a value six pages
  computed and nothing read.

  THE SUBTITLE IS NOT DELETED, IT IS RELOCATED. It stays in
  the accessibility tree next to the heading (`sr-only`), it
  is the `title` on the tab it describes, and it is still
  written out in full on /guide/desks and in the command
  palette. What it stops doing is spending a row of every
  desk on a sentence a returning reader has read a hundred
  times.

  NO FRAME, NO CARD, NO BOXED ICON. A hairline under the
  strip separates it from the desk; nothing draws a
  container. Same rule the panels already follow
  (`inst-surface` paints nothing) — a section is marked by a
  rule and by space.
==================================================
*/

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** Dense stat strip that rides the same row. */
  ribbon?: React.ReactNode;
  /** Sub-page tabs. When present they sit inline rather than on their own row. */
  items?: SubNavItem[];
  /** Accessible name for the tab list. */
  itemsLabel?: string;
  /**
   * The section body. Rendered inside the strip's provider so a routed desk can
   * portal its own controls onto the strip (see ui/deskBar.tsx) instead of
   * opening a second toolbar row under it.
   */
  children?: React.ReactNode;
}

const PageHeader = ({ title, subtitle, actions, ribbon, items, itemsLabel, children }: PageHeaderProps) => {
  const { pathname } = useLocation();
  // Every page carries its section icon — resolved from the nav registry, so
  // no page has to pass one and nav/page identity can never drift apart.
  const section = `/${pathname.split('/')[1] ?? ''}`;
  const Icon = NAV_ITEMS.find(i => i.path === section)?.icon;
  const [slot, setSlot] = useDeskBarSlot();

  return (
    /* A flex column carrying the page's own rhythm, NOT a fragment.

       Six pages self-close this header and let AppShell's body column space
       them; four section layouts pass their whole body through it as children.
       Those two shapes used to produce two different gaps under the same
       hairline — and the children shape produced none at all. One column with
       one gap makes them the same measurement by construction, and PAGE_STACK
       is that measurement for the terminal. */
    <div className={`flex flex-col ${PAGE_STACK} min-w-0`}>
      <div className="flex items-center gap-3 min-h-10 border-b border-borderSubtle">
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {/* Bare, not in a bordered tile. The tile was 24px of frame around a
              14px glyph, and the strip has no other boxes on it. */}
          {Icon && <Icon className="w-4 h-4 shrink-0 text-textSecondary" aria-hidden="true" />}
          <h1 className="font-mono text-caption font-semibold uppercase tracking-widest text-textPrimary leading-none truncate">
            {title}
            {/* The description a screen reader would have got from the subtitle
                row. Sighted readers get it on the tab it belongs to. */}
            {subtitle && <span className="sr-only"> — {subtitle}</span>}
          </h1>
        </div>

        {items && items.length > 0 && (
          <>
            {/* Hidden below sm: at 390 the strip is the title plus a scrolling tab
                rail, and a divider between them costs a tab. */}
            <span className="hidden sm:block w-px h-4 bg-borderSubtle shrink-0" aria-hidden="true" />
            <SubNav items={items} ariaLabel={itemsLabel ?? `${title} subpages`} />
          </>
        )}

        {ribbon && <div className="hidden md:flex flex-1 min-w-0 justify-end">{ribbon}</div>}

        {/* Where a desk's own controls land. `ml-auto` only when nothing else has
            already claimed the free space, so the slot sits hard right on a bare
            strip and beside the ribbon when there is one. */}
        <div
          ref={setSlot}
          className={`flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar ${
            ribbon || actions ? '' : 'ml-auto'
          }`}
        />

        {actions && (
          /* `min-w-0` + scroll rather than `shrink-0`: Compass puts a three-way
             mode switch here, and on the one-row strip a control that refuses to
             shrink pushed the page 11px past a 390 viewport. It scrolls inside
             itself now, the way the tab rail beside it already does. */
          <div
            className={`flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar ${
              ribbon ? '' : 'ml-auto'
            }`}
          >
            {actions}
          </div>
        )}
      </div>
      {children != null && (
        <DeskBarProvider value={slot}>
          {/* The section body is itself a stack: Community puts a standing notice
              above the routed outlet, and the two need the same air between them
              as everything else on the page. */}
          <div className={`flex flex-col ${PAGE_STACK} min-w-0`}>{children}</div>
        </DeskBarProvider>
      )}
    </div>
  );
};

export default PageHeader;
