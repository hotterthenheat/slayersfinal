import { Radio, Bookmark, Layers, Scan, Boxes, type LucideIcon } from 'lucide-react';

/** Trace subpage registry — drives the sub-tab bar and command palette. */
export interface TraceSubpage {
  path: string;
  label: string;
  subtitle: string;
  icon: LucideIcon;
}

export const TRACE_SUBPAGES: TraceSubpage[] = [
  {
    path: '/trace/live-tape',
    label: 'Live Tape',
    subtitle: 'Streaming options prints, dark-pool crosses & session flow',
    icon: Radio,
  },
  {
    path: '/trace/interval',
    label: 'Interval',
    subtitle: 'What is being assembled quietly, and how much of the tape is structure',
    icon: Boxes,
  },
  {
    path: '/trace/scanner',
    label: 'Scanner',
    subtitle: 'Per-contract rollup, directional scoring & session replay',
    icon: Scan,
  },
  {
    path: '/trace/dark-pool',
    label: 'Dark Pool',
    subtitle: 'Off-exchange prints, liquidity shelves & the leaders board',
    icon: Layers,
  },
  {
    path: '/trace/tracker',
    label: 'Tracker',
    subtitle: 'Bookmarked prints & contracts under live watch',
    icon: Bookmark,
  },
];
