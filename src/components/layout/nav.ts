import {
  Home,
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

export type NavGroup = 'Main views' | 'Research' | 'Tools';

export interface NavItem {
  path: string;
  label: string;
  code: string;
  icon: LucideIcon;
  description: string;
  group: NavGroup;
}

export const NAV_ITEMS: NavItem[] = [
  {
    path: '/',
    label: 'Home',
    code: '01',
    icon: Home,
    description: 'Back to the landing page',
    group: 'Main views',
  },
  {
    path: '/pulse',
    label: 'Pulse',
    code: '02',
    icon: Activity,
    description: 'Live market terminal — chart, dealer pressure, order flow & key levels',
    group: 'Main views',
  },
  {
    path: '/compass',
    label: 'Compass',
    code: '03',
    icon: Compass,
    description: 'Options chooser — weeklies, swings & LEAPS weighed and graded',
    group: 'Main views',
  },
  {
    path: '/trace',
    label: 'Trace',
    code: '04',
    icon: Radar,
    description: 'Options flow & dark-pool intelligence — what the prints actually mean',
    group: 'Main views',
  },
  {
    path: '/pinpoint',
    label: 'Pinpoint',
    code: '05',
    icon: Crosshair,
    description: 'GEX & dealer-positioning system',
    group: 'Main views',
  },
  {
    path: '/prove-it',
    label: 'Prove It',
    code: '06',
    icon: Sigma,
    description: 'Quantitative modeling & predictive analytics',
    group: 'Main views',
  },
  {
    path: '/stocks',
    label: 'Stocks',
    code: '07',
    icon: BarChart3,
    description: 'Ranked equity picks & sector rotation',
    group: 'Research',
  },
  {
    path: '/news',
    label: 'News',
    code: '08',
    icon: Newspaper,
    description: 'Stock news + predicted outcomes per headline',
    group: 'Research',
  },
  {
    path: '/earnings',
    label: 'Earnings',
    code: '09',
    icon: CalendarClock,
    description: 'Earnings hub — implied vs. realized, play it or fade it',
    group: 'Research',
  },
  {
    path: '/tracker',
    label: 'Tracker',
    code: '10',
    icon: Bookmark,
    description: 'Bookmarked setups — live monitoring',
    group: 'Tools',
  },
  {
    path: '/workspace',
    label: 'Workspace',
    code: '11',
    icon: LayoutGrid,
    description: 'Saved layouts — mix any panels together',
    group: 'Tools',
  },
  {
    path: '/community',
    label: 'Community',
    code: '12',
    icon: Users,
    description: 'Trade ideas, requests & feedback',
    group: 'Tools',
  },
];

export const NAV_GROUPS: NavGroup[] = ['Main views', 'Research', 'Tools'];
