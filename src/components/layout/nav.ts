import {
  Activity,
  LayoutGrid,
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

export type NavGroup = 'Main' | 'Research' | 'Tools';

export interface NavItem {
  path: string;
  label: string;
  code: string;
  icon: LucideIcon;
  description: string;
  group: NavGroup;
}

// Home is intentionally absent — the wordmark is the sole home affordance.
// Main views render inline in the top bar; Research and Tools fold into
// labelled dropdown groups so the 12-route app fits a laptop-width bar.
export const NAV_ITEMS: NavItem[] = [
  {
    path: '/pulse',
    label: 'Pulse',
    code: '01',
    icon: Activity,
    description: 'Live market terminal — chart, dealer pressure, order flow & key levels',
    group: 'Main',
  },
  {
    path: '/compass',
    label: 'Compass',
    code: '02',
    icon: Compass,
    description: 'Options chooser — weeklies, swings & LEAPS weighed and graded',
    group: 'Main',
  },
  {
    path: '/trace',
    label: 'Trace',
    code: '03',
    icon: Radar,
    description: 'Options flow & dark-pool intelligence — what the prints actually mean',
    group: 'Main',
  },
  {
    path: '/pinpoint',
    label: 'Pinpoint',
    code: '04',
    icon: Crosshair,
    description: 'GEX, dealer positioning, hedge impact & the fracture line',
    group: 'Main',
  },
  {
    path: '/prove-it',
    label: 'Prove It',
    code: '05',
    icon: Sigma,
    description: 'Quantitative modeling & predictive analytics',
    group: 'Research',
  },
  {
    path: '/stocks',
    label: 'Stocks',
    code: '06',
    icon: BarChart3,
    description: 'Ranked equity picks & sector rotation',
    group: 'Research',
  },
  {
    path: '/news',
    label: 'News',
    code: '07',
    icon: Newspaper,
    description: 'Stock news + predicted outcomes per headline',
    group: 'Research',
  },
  {
    path: '/earnings',
    label: 'Earnings',
    code: '08',
    icon: CalendarClock,
    description: 'Earnings hub — implied vs. realized, play it or fade it',
    group: 'Research',
  },
  {
    path: '/tracker',
    label: 'Tracker',
    code: '09',
    icon: Bookmark,
    description: 'Bookmarked setups, contracts & names — live monitoring',
    group: 'Tools',
  },
  {
    path: '/workspace',
    label: 'Workspace',
    code: '10',
    icon: LayoutGrid,
    description: 'Saved layouts — mix any panels together',
    group: 'Tools',
  },
  {
    path: '/community',
    label: 'Community',
    code: '11',
    icon: Users,
    description: 'Trade ideas, requests & feedback',
    group: 'Tools',
  },
];

export const NAV_GROUPS: NavGroup[] = ['Main', 'Research', 'Tools'];

export const mainViews = NAV_ITEMS.filter(i => i.group === 'Main');
export const researchViews = NAV_ITEMS.filter(i => i.group === 'Research');
export const toolViews = NAV_ITEMS.filter(i => i.group === 'Tools');
