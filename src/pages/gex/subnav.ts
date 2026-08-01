import { Target, Grid3x3, Gauge, History, CandlestickChart, type LucideIcon } from 'lucide-react';

/** Pinpoint subpage registry — drives the sub-tab bar and command palette.
    Five desks, each a single dealer-positioning question. Desks that carry two
    complementary reads (Gamma this-ticker vs the complex, Levels exposure vs
    ranked, Greeks matrix vs migration, Stress hedge vs fracture) expose the
    second as an in-desk sub-toggle (?view=) rather than its own tab, so the bar
    reads as a short map instead of a wall of nine.

    The vol surface and the density it implies are not on this bar: they are what
    a calibrated model says about the chain, not where dealers are hedged, so
    they belong to Prove It. /pinpoint/volatility redirects there. */
export interface GexSubpage {
  path: string;
  label: string;
  subtitle: string;
  icon: LucideIcon;
}

export const GEX_SUBPAGES: GexSubpage[] = [
  {
    path: '/pinpoint/gamma',
    label: 'Gamma',
    subtitle:
      'Net dealer gamma across every strike × expiry: walls, flip, king strike and the pin-vs-trend regime, this ticker or the whole complex',
    icon: CandlestickChart,
  },
  {
    path: '/pinpoint/levels',
    label: 'Levels',
    subtitle:
      'Dealer positioning map (GEX · DEX · VEX by strike) and every strike scored 0–100 into the price levels that matter today',
    icon: Target,
  },
  {
    path: '/pinpoint/greeks',
    label: 'Greeks',
    subtitle:
      'Full 8-greek exposure matrix and dealer regime, plus where exposure migrates as volatility and time shift (charm & vanna)',
    icon: Grid3x3,
  },
  {
    path: '/pinpoint/stress',
    label: 'Stress',
    subtitle: 'Where forced hedging outruns liquidity: the HEX failure boundary and the fracture line where the tape can break',
    icon: Gauge,
  },
  {
    path: '/pinpoint/history',
    label: 'History',
    subtitle: 'Session timeline: how the walls, flip and net GEX moved',
    icon: History,
  },
];
