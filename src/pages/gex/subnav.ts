import { Map, Target, Waves, Grid3x3, Gauge, Zap, FlaskConical, AreaChart, History, CandlestickChart, type LucideIcon } from 'lucide-react';

/** Pinpoint subpage registry — drives the sub-tab bar and command palette.
    The nine views cluster into four workflows so the bar reads as a map, not a
    wall of equal tabs:
      Positioning — where dealer exposure sits right now
      Dynamics    — how it migrates through time
      Volatility  — the surface and the implied distribution
      Stress      — where it can break */
export type PinpointGroup = 'Positioning' | 'Dynamics' | 'Volatility' | 'Stress';

export interface GexSubpage {
  path: string;
  label: string;
  subtitle: string;
  icon: LucideIcon;
  group: PinpointGroup;
}

export const GEX_SUBPAGES: GexSubpage[] = [
  // ── Positioning ──
  {
    path: '/pinpoint/gamma',
    label: 'Gamma Heatmap',
    subtitle: 'Net dealer gamma across every strike × expiry — the walls, flip, king strike and the pin-vs-trend regime',
    icon: CandlestickChart,
    group: 'Positioning',
  },
  {
    path: '/pinpoint/exposure-profile',
    label: 'Exposure Profile',
    subtitle: 'GEX · DEX · VEX by strike — dealer positioning map, zones & bias',
    icon: Map,
    group: 'Positioning',
  },
  {
    path: '/pinpoint/ranked-targets',
    label: 'Ranked Targets',
    subtitle: 'Every strike scored 0–100 — the price levels that matter today',
    icon: Target,
    group: 'Positioning',
  },
  {
    path: '/pinpoint/greeks-regime',
    label: 'Greeks & Regime',
    subtitle: 'Full 8-greek exposure matrix, dealer regime probability, charm clock & vanna shock',
    icon: Grid3x3,
    group: 'Positioning',
  },
  // ── Dynamics ──
  {
    path: '/pinpoint/vanna-charm',
    label: 'Vanna & Charm',
    subtitle: 'Where dealer exposure migrates as vol and time shift',
    icon: Waves,
    group: 'Dynamics',
  },
  {
    path: '/pinpoint/history',
    label: 'History & Replay',
    subtitle: 'Session timeline — how walls, flip and net GEX moved',
    icon: History,
    group: 'Dynamics',
  },
  // ── Volatility ──
  {
    path: '/pinpoint/vol-lab',
    label: 'Volatility Lab',
    subtitle: 'IV surface, term structure, implied odds & volatility state',
    icon: FlaskConical,
    group: 'Volatility',
  },
  {
    path: '/pinpoint/state-density',
    label: 'State Density',
    subtitle: 'Risk-neutral price density, probability-mass flow, skew stress & variance premium',
    icon: AreaChart,
    group: 'Volatility',
  },
  // ── Stress ──
  {
    path: '/pinpoint/hedge-impact',
    label: 'Hedge Impact',
    subtitle: 'HEX — dealer hedge vs available liquidity, hedge-flow forecast & the failure boundary',
    icon: Gauge,
    group: 'Stress',
  },
  {
    path: '/pinpoint/fracture',
    label: 'Fracture',
    subtitle: 'Where forced flow exceeds liquidity — instability, cascades & the fracture line',
    icon: Zap,
    group: 'Stress',
  },
];

export const PINPOINT_GROUPS: PinpointGroup[] = ['Positioning', 'Dynamics', 'Volatility', 'Stress'];
