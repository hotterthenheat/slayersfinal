import {
  Activity,
  Crosshair,
  Compass,
  Radar,
  Sigma,
  BarChart3,
  Newspaper,
  CalendarClock,
  Bookmark,
  Users,
  type LucideIcon,
} from 'lucide-react';

// Navigation is organised by WORKFLOW, not by product name: Discover → Analyze
// → Manage → Review reads as the pipeline a trader actually runs. The branded
// desks (Pulse, Compass, Pinpoint…) live inside those workflows. Home exits via
// the wordmark. (Workspace folded into Pulse; MOC into Compass; Fracture into
// Pinpoint.)
export type NavGroup = 'Discover' | 'Analyze' | 'Manage' | 'Review';

export interface NavItem {
  path: string;
  label: string;
  code: string;
  icon: LucideIcon;
  description: string;
  group: NavGroup;
}

export const NAV_ITEMS: NavItem[] = [
  // ── Discover ──
  {
    path: '/compass',
    label: 'Compass',
    code: '01',
    icon: Compass,
    description: 'Options chooser: weeklies, swings and LEAPS, weighed and graded',
    group: 'Discover',
  },
  {
    path: '/stocks',
    label: 'Stocks',
    code: '02',
    icon: BarChart3,
    description: 'Ranked equity picks and sector rotation',
    group: 'Discover',
  },
  {
    path: '/trace',
    label: 'Trace',
    code: '03',
    icon: Radar,
    description: 'Options flow and dark-pool prints, and what they mean',
    group: 'Discover',
  },
  // ── Analyze ──
  {
    path: '/pulse',
    label: 'Pulse',
    code: '04',
    icon: Activity,
    description: 'The market desk: chart, dealer pressure, order flow and key levels',
    group: 'Analyze',
  },
  {
    path: '/pinpoint',
    label: 'Pinpoint',
    code: '05',
    icon: Crosshair,
    description: 'GEX, dealer positioning, hedge impact and the fracture line',
    group: 'Analyze',
  },
  {
    path: '/news',
    label: 'News',
    code: '06',
    icon: Newspaper,
    description: 'Stock news with a predicted outcome per headline',
    group: 'Analyze',
  },
  {
    path: '/earnings',
    label: 'Earnings',
    code: '07',
    icon: CalendarClock,
    description: 'Earnings hub: implied against realized, play it or fade it',
    group: 'Analyze',
  },
  // ── Manage ──
  {
    path: '/tracker',
    label: 'Tracker',
    code: '08',
    icon: Bookmark,
    description: 'Bookmarked setups, contracts and names, watched in one place',
    group: 'Manage',
  },
  {
    path: '/community',
    label: 'Community',
    code: '09',
    icon: Users,
    description: 'Trade ideas, requests and feedback',
    group: 'Manage',
  },
  // ── Review ──
  {
    path: '/prove-it',
    label: 'Prove It',
    code: '10',
    icon: Sigma,
    description: 'Quantitative modeling and predictive analytics',
    group: 'Review',
  },
];

export const NAV_GROUPS: NavGroup[] = ['Discover', 'Analyze', 'Manage', 'Review'];

/** What each workflow is for. Promoted out of the section comments above: the
    index is the first surface that shows all four groups at once and needs to
    say what they mean. */
export const NAV_GROUP_PURPOSE: Record<NavGroup, string> = {
  Discover: 'Find what is moving and what to trade',
  Analyze: 'Study the tape, the dealers, the catalysts',
  Manage: 'Track what you are in and talk to the desk',
  Review: 'Audit the models and the calls',
};

export interface ReferenceItem {
  path: string;
  label: string;
}

/** Guide and Legal, deliberately outside NAV_ITEMS: putting them there would
    file them under a workflow dropdown, underline a group they do not belong
    to, and resolve a PageHeader icon for pages that carry none. */
export const REFERENCE_ITEMS: ReferenceItem[] = [
  { path: '/guide', label: 'Guide' },
  { path: '/legal/disclaimer', label: 'Disclaimer' },
  { path: '/legal/terms', label: 'Terms' },
  { path: '/legal/privacy', label: 'Privacy' },
];

export const itemsByGroup = (group: NavGroup): NavItem[] => NAV_ITEMS.filter(i => i.group === group);
