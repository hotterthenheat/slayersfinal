import { Radio, Bookmark, SlidersHorizontal, Footprints, BellRing, Clock, Timer, Zap, Layers, Scale, type LucideIcon } from 'lucide-react';

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
  // Expansion phase (Noah, 2026-08-30): the flow family grows here — the
  // screener first, net flow / OI explorer / alerts / interval / 0DTE /
  // multi-leg to follow, all reading data/flowBook's one day book.
  {
    path: '/trace/screener',
    label: 'Screener',
    subtitle: "The whole day's option book — screens, filters & every contract that traded",
    icon: SlidersHorizontal,
  },
  {
    path: '/trace/net-flow',
    label: 'Net Flow',
    subtitle: 'Which way each name’s money leans — net premium ranked & charted through the session',
    icon: Scale,
  },
  {
    path: '/trace/footprints',
    label: 'Footprints',
    subtitle: 'What the flow left standing — overnight position builds & unwinds, contract by contract',
    icon: Footprints,
  },
  {
    path: '/trace/flow-alerts',
    label: 'Flow Alerts',
    subtitle: 'The desk watching the tape — a contract surfaces the moment there’s a reason to look',
    icon: BellRing,
  },
  {
    path: '/trace/windows',
    label: 'Windows',
    subtitle: 'The day cut into quarter-hour windows — where the volume actually landed',
    icon: Clock,
  },
  {
    path: '/trace/odte',
    label: '0DTE',
    subtitle: 'The same-day money — net call & put premium flowing through the session',
    icon: Zap,
  },
  {
    path: '/trace/interval',
    label: 'Interval',
    subtitle: 'Size that arrived in pieces — accumulation by contract, not by clock',
    icon: Timer,
  },
  {
    path: '/trace/multi-leg',
    label: 'Multi-Leg',
    subtitle: 'The tape reconstructed into structures — spreads, their legs & their defined risk',
    icon: Layers,
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
