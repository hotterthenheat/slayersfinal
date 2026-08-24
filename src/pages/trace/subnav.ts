import { Radio, Bookmark, type LucideIcon } from 'lucide-react';

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
  // Launch trim (Noah, 2026-08-17): Dark Pool + Scanner pulled from the
  // first launch — pages kept on disk, routes redirect to the tape (which
  // still carries the dark-pool feed).
  {
    path: '/trace/tracker',
    label: 'Tracker',
    subtitle: 'Bookmarked prints & contracts under live watch',
    icon: Bookmark,
  },
];
