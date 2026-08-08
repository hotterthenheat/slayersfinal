import {
  Activity,
  Crosshair,
  Compass,
  Radar,
  Sigma,
  BarChart3,
  CalendarClock,
  Bookmark,
  Users,
  type LucideIcon,
} from 'lucide-react';

// Groups are named after what the desks inside them hold, not after a generic
// workflow verb. Discover/Analyze/Manage/Review said nothing this product does
// and could have sat on any dashboard: Scan ranks the whole universe, Read goes
// deep on one name, Yours is the only pair whose contents you write, Models is
// the math. Order is load-bearing — the terminal index pairs groups 0+2 and 1+3
// into two columns and relies on 3+2 and 4+1 both being five rows.
export type NavGroup = 'Scan' | 'Read' | 'Yours' | 'Models';

export interface NavItem {
  path: string;
  label: string;
  code: string;
  icon: LucideIcon;
  description: string;
  group: NavGroup;
}

export const NAV_ITEMS: NavItem[] = [
  // ── Scan: the whole universe, ranked ──
  {
    path: '/compass',
    label: 'Compass',
    code: '01',
    icon: Compass,
    description: 'Options chooser: weeklies, swings and LEAPS, weighed and graded',
    group: 'Scan',
  },
  {
    path: '/stocks',
    label: 'Stocks',
    code: '02',
    icon: BarChart3,
    description: 'Ranked equity picks and sector rotation',
    group: 'Scan',
  },
  {
    path: '/trace',
    label: 'Trace',
    code: '03',
    icon: Radar,
    description: 'Options flow and dark-pool prints, and what they mean',
    group: 'Scan',
  },
  // ── Read: one name, in depth ──
  {
    path: '/pulse',
    label: 'Pulse',
    code: '04',
    icon: Activity,
    // The Key Levels panel was removed from Pulse (levels ride the chart now),
    // so the promise had to go with it.
    description: 'The market desk: chart, dealer pressure, order flow and the options tape',
    group: 'Read',
  },
  {
    path: '/pinpoint',
    label: 'Pinpoint',
    code: '05',
    icon: Crosshair,
    description: 'GEX, dealer positioning, hedge impact and the fracture line',
    group: 'Read',
  },
  {
    path: '/earnings',
    label: 'Earnings',
    code: '07',
    icon: CalendarClock,
    description: 'Earnings hub: implied against realized, play it or fade it',
    group: 'Read',
  },
  // ── Yours: the desks you fill in ──
  {
    path: '/tracker',
    label: 'Tracker',
    code: '08',
    icon: Bookmark,
    description: 'Bookmarked setups, contracts and names, watched in one place',
    group: 'Yours',
  },
  {
    path: '/community',
    label: 'Community',
    code: '09',
    icon: Users,
    description: 'Trade ideas, requests and feedback',
    group: 'Yours',
  },
  // ── Models: the math behind the calls ──
  {
    path: '/prove-it',
    label: 'Prove It',
    code: '10',
    icon: Sigma,
    description: 'Quantitative modeling and predictive analytics',
    group: 'Models',
  },
];

export const NAV_GROUPS: NavGroup[] = ['Scan', 'Read', 'Yours', 'Models'];

/** What each group holds. Promoted out of the section comments above: the index
    is the first surface that shows all four at once and needs to say what they
    mean. */
export const NAV_GROUP_PURPOSE: Record<NavGroup, string> = {
  Scan: 'The whole universe, ranked: contracts, equities and the flow behind them',
  Read: 'One name in depth: the tape, the dealers, the catalysts',
  Yours: 'The two desks whose contents you write, kept in this browser',
  Models: 'The math behind the calls, and how it scored against what happened',
};

/** The group a desk path belongs to, for surfaces that hold a path and not an item. */
export const groupOfPath = (path: string): NavGroup | undefined =>
  NAV_ITEMS.find(i => i.path === path || path.startsWith(`${i.path}/`))?.group;

export interface ReferenceItem {
  path: string;
  label: string;
}

/** Guide and Legal, deliberately outside NAV_ITEMS: putting them there would
    file them under a desk group, underline a group they do not belong to, and
    resolve a PageHeader icon for pages that carry none. */
export const REFERENCE_ITEMS: ReferenceItem[] = [
  { path: '/guide', label: 'Guide' },
  { path: '/legal/disclaimer', label: 'Disclaimer' },
  { path: '/legal/terms', label: 'Terms' },
  { path: '/legal/privacy', label: 'Privacy' },
];

export const itemsByGroup = (group: NavGroup): NavItem[] => NAV_ITEMS.filter(i => i.group === group);
