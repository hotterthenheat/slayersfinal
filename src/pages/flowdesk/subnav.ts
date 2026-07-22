import { Radio, Layers, Flame, ScanLine, Network, Bookmark, type LucideIcon } from 'lucide-react';

/** Trace subpage registry — drives the sub-tab bar and command palette. */
export interface FlowDeskSubpage {
  path: string;
  label: string;
  subtitle: string;
  icon: LucideIcon;
}

export const FLOWDESK_SUBPAGES: FlowDeskSubpage[] = [
  {
    path: '/trace/live-tape',
    label: 'Live Tape',
    subtitle: 'Streaming options prints, dark-pool crosses & session flow',
    icon: Radio,
  },
  {
    path: '/trace/dark-pool',
    label: 'Dark Pool',
    subtitle: 'Off-exchange blocks mapped to shelves — who is building, who is leaving',
    icon: Layers,
  },
  {
    path: '/trace/liquidity',
    label: 'Liquidity',
    subtitle: 'Order-book heatmap — resting liquidity, candles & executed trades over time',
    icon: Flame,
  },
  {
    path: '/trace/scanner',
    label: 'Scanner',
    subtitle: 'Per-contract flow aggregation — volume, ΔOI & bull/bear scoring',
    icon: ScanLine,
  },
  {
    path: '/trace/reconstruction',
    label: 'Reconstruction',
    subtitle: 'Prints clustered into probable parent metaorders — size, completion & urgency',
    icon: Network,
  },
  {
    path: '/trace/tracker',
    label: 'Tracker',
    subtitle: 'Bookmarked prints & contracts under live watch',
    icon: Bookmark,
  },
];
