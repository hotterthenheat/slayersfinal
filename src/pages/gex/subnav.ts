import { Map, Target, Waves, Grid3x3, Gauge, FlaskConical, History, type LucideIcon } from 'lucide-react';

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
    subtitle: 'Every strike scored 0–100 — the price levels that matter today',
    icon: Target,
  },
  {
    path: '/pinpoint/vanna-charm',
    label: 'Vanna & Charm',
    subtitle: 'Where dealer exposure migrates as vol and time shift',
    icon: Waves,
  },
  {
    path: '/pinpoint/greeks-regime',
    label: 'Greeks & Regime',
    subtitle: 'Full 8-greek exposure matrix, dealer regime probability, charm clock & vanna shock',
    icon: Grid3x3,
  },
  {
    path: '/pinpoint/hedge-impact',
    label: 'Hedge Impact',
    subtitle: 'HEX — dealer hedge vs available liquidity, hedge-flow forecast & the failure boundary',
    icon: Gauge,
  },
  {
    path: '/pinpoint/vol-lab',
    label: 'Volatility Lab',
    subtitle: 'IV surface, term structure, implied odds & volatility state',
    icon: FlaskConical,
  },
  {
    path: '/pinpoint/history',
    label: 'History & Replay',
    subtitle: 'Session timeline — how walls, flip and net GEX moved',
    icon: History,
  },
];
