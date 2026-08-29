import { Activity, Clock, Columns2, Flame, Gauge, Grid3x3, Layers, Map, Target, Waves, Wind, type LucideIcon } from 'lucide-react';

/** Pinpoint subpage registry — drives the sub-tab bar and command palette. */
export interface GexSubpage {
  path: string;
  label: string;
  subtitle: string;
  icon: LucideIcon;
}

export const GEX_SUBPAGES: GexSubpage[] = [
  {
    path: '/pinpoint/exposure-profile',
    label: 'Exposure Profile',
    subtitle: 'GEX · DEX · VEX by strike — dealer positioning map, zones & bias',
    icon: Map,
  },
  {
    path: '/pinpoint/ranked-targets',
    label: 'Ranked Targets',
    subtitle: 'Every strike ranked by structural priority — the price levels that matter today',
    icon: Target,
  },
  {
    path: '/pinpoint/vanna-charm',
    label: 'Vanna & Charm',
    subtitle: 'Where dealer exposure migrates as vol and time shift',
    icon: Waves,
  },
  {
    path: '/pinpoint/expiry-ladder',
    label: 'Expiry Ladder',
    subtitle: 'Which expiry owns each strike — is this wall 0DTE, or structure?',
    icon: Grid3x3,
  },
  {
    path: '/pinpoint/greek-surfaces',
    label: 'Greek Surfaces',
    subtitle: 'Color · vomma · speed · veta · zomma — the derivatives behind the levels',
    icon: Layers,
  },
  {
    path: '/pinpoint/pain-map',
    label: 'Pain Map',
    subtitle: 'Where today\u2019s buyers got in, strike by strike \u2014 and the spot that flips them',
    icon: Flame,
  },
  {
    path: '/pinpoint/oi-heat',
    label: '\u0394OI Heat',
    subtitle: 'Strikes being built and unwound through the session \u2014 the flow behind the snapshot',
    icon: Activity,
  },
  {
    path: '/pinpoint/compare',
    label: 'Compare',
    subtitle: 'Two books on one normalized axis — where their positioning diverges',
    icon: Columns2,
  },
  {
    path: '/pinpoint/history',
    label: 'Time Machine',
    subtitle: 'Any past session replayed — level migration, strike × time, and a real scrubber',
    icon: Clock,
  },
  {
    path: '/pinpoint/model-error',
    label: 'Model Error',
    subtitle: 'How wrong is textbook GEX right now — the audit of the whole category',
    icon: Gauge,
  },
  {
    path: '/pinpoint/vol-lab',
    label: 'Vol Lab',
    subtitle: 'The surface, the term structure, and what the market pays for vol',
    icon: Wind,
  },
];
