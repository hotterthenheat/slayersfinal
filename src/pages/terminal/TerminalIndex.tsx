/*
==================================================
  SLAYER TERMINAL - TERMINAL INDEX (/terminal)
  The front door, inside the shell. Every desk, what
  each one is for, and a preview of the tab bar for
  the three that have one. It reads the user, never
  the market: nothing here is a quote, a count or a
  score, so the page is final at first paint.
==================================================
*/

import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import {
  NAV_GROUPS,
  NAV_GROUP_PURPOSE,
  NAV_ITEMS,
  REFERENCE_ITEMS,
  itemsByGroup,
  type NavGroup,
  type NavItem,
} from '../../components/layout/nav';
import { GEX_SUBPAGES } from '../gex/subnav';
import { FLOWDESK_SUBPAGES } from '../flowdesk/subnav';
import { COMMUNITY_SUBPAGES } from '../community/subnav';
import { readLastDesk } from './lastDesk';
import { FOCUS_RING, FOCUS_RING_ON_HOLO } from '../../components/ui/focusRing';
import { isTypingTarget, overlayOwnsKeyboard } from '../../lib/keys';

/** The house content panel, distinct from the titled data `Panel`. */
const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-lg border border-borderSubtle bg-panel ${className}`}>{children}</div>
);

/** Only `label` is read. The registries' `subtitle` fields describe the tape and
    have no business on a page that shows no data. */
const SUBTABS: Record<string, { path: string; label: string }[]> = {
  '/trace': FLOWDESK_SUBPAGES,
  '/pinpoint': GEX_SUBPAGES,
  '/community': COMMUNITY_SUBPAGES,
};

// `code` is the visible chip on each row, so the mnemonic is printed on the
// control it fires. An 11th desk simply gets no digit rather than silently
// stealing `0`.
const DIGIT_MAP: Record<string, string> = Object.fromEntries(
  NAV_ITEMS.flatMap(i => {
    const n = Number(i.code);
    if (!Number.isInteger(n) || n < 1 || n > 10) return [];
    return [[n === 10 ? '0' : String(n), i.path]] as const;
  })
);

/**
 * The separator between inline facts. `text-textMuted` is the tone every other
 * middot in the app uses; this one reached for `borderMuted` — a BORDER value
 * pressed into service as ink — and measured 1.38:1 on the card behind it,
 * which is not a faint dot, it is no dot at all.
 */
const Dot = () => (
  <span aria-hidden className="text-textMuted">
    ·
  </span>
);

/**
 * The page's one accent, and always present in one of two states. "Nothing
 * stored" is not only a first visit: it is also the state after Settings clears
 * local data and after a stale route fails validation, and a row that appears on
 * the second visit but not the first reflows the page between its two most
 * important first impressions.
 */
const ResumeRow = () => {
  const last = readLastDesk();
  const Icon = last ? NAV_ITEMS.find(i => i.path === last.deskPath)?.icon : undefined;
  const where = last ? [last.deskLabel, last.tabLabel].filter(Boolean).join(', ') : '';

  // First focusable element in the page, taken on mount so the returning
  // visitor's whole path is land, then Enter. A link rather than a button, so
  // middle-click and open-in-new-tab still work; React only auto-focuses form
  // controls, hence the ref.
  const resumeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    resumeRef.current?.focus();
  }, []);

  const button =
    'inline-flex items-center gap-1.5 rounded-md px-3 py-2 holo-bg text-ink ' +
    'font-mono text-label font-semibold uppercase tracking-wider ' +
    `transition-transform active:scale-[0.98] ${FOCUS_RING_ON_HOLO} w-full sm:w-auto justify-center ml-auto`;

  return (
    <Card className="px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="font-mono text-micro font-semibold uppercase tracking-widest text-textMuted">
        {last ? 'Last opened' : 'Start here'}
      </span>
      {last ? (
        <>
          {Icon && <Icon className="w-4 h-4 text-textSecondary" />}
          <span className="font-mono text-caption font-bold uppercase tracking-wider text-textPrimary">
            {last.deskLabel}
            {last.tabLabel && <span className="text-textSecondary"> / {last.tabLabel}</span>}
          </span>
          <Link ref={resumeRef} to={last.path} aria-label={`Resume ${where}`} className={button}>
            Resume <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </>
      ) : (
        <>
          <span className="text-caption text-textSecondary">No desk opened yet.</span>
          <Link ref={resumeRef} to="/pulse" aria-label="Open Pulse" className={button}>
            Open Pulse <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </>
      )}
    </Card>
  );
};

/** One `<li>` carries the desk link and, for the three sectioned desks, the chip
    band as a sibling — chips nested inside the link would be invalid, and this
    way exactly one hairline falls below the pair. */
const DeskRow = ({ item }: { item: NavItem }) => {
  const Icon = item.icon;
  const subs = SUBTABS[item.path];

  return (
    <li>
      <Link
        to={item.path}
        className={`flex w-full items-start lg:items-center gap-3 px-3 py-2.5 min-h-[44px] hover:bg-rowHover transition-colors ${FOCUS_RING}`}
      >
        <span
          aria-hidden
          className="holo-border flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-label tnum text-select"
        >
          {item.code}
        </span>
        <Icon className="w-4 h-4 shrink-0 mt-0.5 lg:mt-0 text-textSecondary" />
        <span className="min-w-0 flex flex-col lg:flex-row lg:items-center lg:gap-3 flex-1">
          <span className="font-mono text-caption font-bold uppercase tracking-wider text-textPrimary lg:w-24 shrink-0">
            {item.label}
          </span>
          <span className="min-w-0 text-caption text-textSecondary lg:truncate">{item.description}</span>
        </span>
        <span aria-hidden className="hidden 2xl:block ml-auto shrink-0 font-mono text-micro text-textMuted">
          {item.path}
        </span>
      </Link>
      {subs && (
        // pb-2.5 absorbs the chips' -my-1 bleed so the hit box never crosses the
        // hairline below the row.
        <div className="px-3 pb-2.5 lg:pl-[3.25rem] flex flex-wrap items-center gap-x-1.5">
          {subs.map((sub, i) => (
            <span key={sub.path} className="flex items-center gap-x-1.5">
              {i > 0 && <Dot />}
              <Link
                to={sub.path}
                aria-label={`${item.label} ${sub.label}`}
                className={`font-mono text-micro leading-4 text-textMuted hover:text-textPrimary transition-colors -my-1 py-1 ${FOCUS_RING}`}
              >
                {sub.label}
              </Link>
            </span>
          ))}
        </div>
      )}
    </li>
  );
};

const GroupBlock = ({ group, className }: { group: NavGroup; className: string }) => {
  const id = `desks-${group.toLowerCase()}`;
  return (
    <section aria-labelledby={id} className={className}>
      <h2 id={id} className="holo-text w-fit font-mono text-label font-semibold uppercase tracking-widest">
        {group}
      </h2>
      <p className="text-caption text-textSecondary mt-0.5 mb-2">{NAV_GROUP_PURPOSE[group]}</p>
      {/* A living foil rail down the left edge, so the four blocks read as four
          families without four colours. The sheen is the brand's, and it is the
          only thing on this page that moves. */}
      <Card className="relative overflow-hidden">
        <span aria-hidden className="holo-bar absolute inset-y-0 left-0 w-[2px]" />
        <ul className="divide-y divide-borderSubtle/60">
          {itemsByGroup(group).map(item => (
            <DeskRow key={item.path} item={item} />
          ))}
        </ul>
      </Card>
    </section>
  );
};

const ReferenceStrip = () => (
  <Card className="px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
    <span className="font-mono text-micro font-semibold uppercase tracking-widest text-textMuted">Reference</span>
    {REFERENCE_ITEMS.map((ref, i) => (
      <span key={ref.path} className="flex items-center gap-x-3">
        {i > 0 && <Dot />}
        <Link
          to={ref.path}
          className={`font-mono text-caption text-textMuted hover:text-textPrimary transition-colors -my-1 py-1 ${FOCUS_RING}`}
        >
          {ref.label}
        </Link>
      </span>
    ))}
    <span className="ml-auto hidden sm:block font-mono text-micro text-textMuted">
      ⌘K jump · ? shortcuts · number keys open a desk
    </span>
  </Card>
);

/**
 * Two explicit columns, not four blocks flowed through a grid. Discover(3) +
 * Manage(2) is five rows against Analyze(4) + Review(1), also five; letting the
 * grid pair them by source order would align Discover against Analyze and leave
 * a row-deep hole under it.
 */
const TerminalIndex = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      // A digit must not navigate out from under an open overlay, or while the
      // ticker search in the bar above has focus.
      if (isTypingTarget(e.target)) return;
      if (overlayOwnsKeyboard()) return;
      const to = DIGIT_MAP[e.key];
      if (!to) return;
      e.preventDefault();
      navigate(to);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Index']}
        title="Terminal index"
        subtitle="Every desk, and what each one is for. Pick one to open it."
      />

      <ResumeRow />

      <nav aria-label="Terminal index">
        <div className="flex flex-col gap-6 xl:grid xl:grid-cols-2 xl:gap-x-8">
          {/* `contents` dissolves the two column wrappers below xl, so the four
              sections become siblings of the one flex column and `order` can put
              them back in workflow order. Source order is the pairing the
              two-column layout needs; `order` is the pairing a single column
              needs; neither can serve both. */}
          <div className="contents xl:flex xl:flex-col xl:gap-6">
            <GroupBlock group={NAV_GROUPS[0]} className="order-1" />
            <GroupBlock group={NAV_GROUPS[2]} className="order-3" />
          </div>
          <div className="contents xl:flex xl:flex-col xl:gap-6">
            <GroupBlock group={NAV_GROUPS[1]} className="order-2" />
            <GroupBlock group={NAV_GROUPS[3]} className="order-4" />
          </div>
        </div>
      </nav>

      <ReferenceStrip />
    </>
  );
};

export default TerminalIndex;
