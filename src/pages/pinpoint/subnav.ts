import { Map, Target, Waves, type LucideIcon } from 'lucide-react';

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
  // Launch trim (Noah, 2026-08-17): Volatility Lab + History & Replay pulled
  // from the first launch — pages kept on disk, routes redirect.
];
