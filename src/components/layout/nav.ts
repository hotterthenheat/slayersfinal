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
  Telescope,
  Microscope,
  FolderKanban,
  ClipboardCheck,
  type LucideIcon,
} from 'lucide-react';

// Navigation is organised by WORKFLOW, not by product name: Discover → Analyze
// → Manage → Review reads as the pipeline a trader actually runs, so a new
// user knows what each tab is FOR before learning a single brand name. The
// branded desks (Pulse, Compass, Pinpoint…) live inside those workflows.
// Home exits via the wordmark.
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
  // ── Discover — find what is moving and what to trade ──
  {
    path: '/compass',
    label: 'Compass',
    code: '01',
    icon: Compass,
    description: 'Options chooser — weeklies, swings & LEAPS weighed and graded',
    group: 'Discover',
  },
  {
    path: '/stocks',
    label: 'Stocks',
    code: '02',
    icon: BarChart3,
    description: 'Ranked equity picks & sector rotation',
    group: 'Discover',
  },
  {
    path: '/trace',
    label: 'Trace',
    code: '03',
    icon: Radar,
    description: 'Options flow & dark-pool intelligence — what the prints actually mean',
    group: 'Discover',
  },
  // ── Analyze — study the tape, the dealers, the catalysts ──
  {
    path: '/pulse',
    label: 'Pulse',
    code: '04',
    icon: Activity,
    description: 'The live market desk — chart, dealer pressure & key levels, arranged your way',
    group: 'Analyze',
  },
  {
    path: '/pinpoint',
    label: 'Pinpoint',
    code: '05',
    icon: Crosshair,
    description: 'GEX & dealer-positioning system',
    group: 'Analyze',
  },
  {
    path: '/news',
    label: 'News',
    code: '06',
    icon: Newspaper,
    description: 'Stock news + predicted outcomes per headline',
    group: 'Analyze',
  },
  {
    path: '/earnings',
    label: 'Earnings',
    code: '07',
    icon: CalendarClock,
    description: 'Earnings hub — implied vs. realized, play it or fade it',
    group: 'Analyze',
  },
  // ── Manage — track what you are in, build your desk, talk shop ──
  {
    path: '/tracker',
    label: 'Tracker',
    code: '08',
    icon: Bookmark,
    description: 'Bookmarked setups — live monitoring',
    group: 'Manage',
  },
  {
    path: '/community',
    label: 'Community',
    code: '09',
    icon: Users,
    description: 'Trade ideas, requests & feedback',
    group: 'Manage',
  },
  // ── Review — audit the models and the calls ──
  {
    path: '/prove-it',
    label: 'Prove It',
    code: '10',
    icon: Sigma,
    description: 'Quantitative modeling & predictive analytics',
    group: 'Review',
  },
];

export const NAV_GROUPS: NavGroup[] = ['Discover', 'Analyze', 'Manage', 'Review'];

/** Top-bar tab metadata: the icon Noah asked for + a one-line answer to
    "what is this tab for", shown as the dropdown header. */
export const NAV_GROUP_META: Record<NavGroup, { icon: LucideIcon; hint: string }> = {
  Discover: { icon: Telescope, hint: 'Find what to trade' },
  Analyze: { icon: Microscope, hint: 'Study the tape & the dealers' },
  Manage: { icon: FolderKanban, hint: 'Track what you are in' },
  Review: { icon: ClipboardCheck, hint: 'Audit the models' },
};

export const itemsByGroup = (group: NavGroup): NavItem[] =>
  NAV_ITEMS.filter(i => i.group === group);
