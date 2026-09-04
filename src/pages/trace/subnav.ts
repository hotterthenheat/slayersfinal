import {
  Radio,
  Bookmark,
  SlidersHorizontal,
  Footprints,
  BellRing,
  Clock,
  Timer,
  Zap,
  Layers,
  Scale,
  EyeOff,
  type LucideIcon,
} from 'lucide-react';

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
    subtitle: 'Streaming options prints — endless, newest first, with the session’s concentration above it',
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
  // Back on the bar (Noah, 2026-09-04: "i don't want the dark pool their make
  // that a new page"). It was trimmed at launch on the grounds that the tape
  // carried the feed in its rail; the tape does not carry it any more, so the
  // page is the feed's home and it needs a way in. Scanner stays unlisted.
  {
    path: '/trace/dark-pool',
    label: 'Dark Pool',
    subtitle: 'Off-exchange flow — where the size crossed, which sectors led & what it left behind',
    icon: EyeOff,
  },
  {
    path: '/trace/tracker',
    label: 'Tracker',
    subtitle: 'Bookmarked prints & contracts under live watch',
    icon: Bookmark,
  },
];
