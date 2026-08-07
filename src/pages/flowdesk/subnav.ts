import { Radio, Sigma, BrainCircuit, Layers, ScanLine, Network, type LucideIcon } from 'lucide-react';

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
    label: 'Tape',
    subtitle: 'Options prints tagged sweep or block, with session premium and conviction',
    icon: Radio,
  },
  {
    path: '/trace/gamma-tape',
    label: 'Gamma Tape',
    subtitle: 'Dealer gamma inventory built print-by-print from trade greeks and the aggressor',
    icon: Sigma,
  },
  {
    path: '/trace/informed-flow',
    label: 'Informed Flow',
    subtitle: 'Smart money vs noise: each print scored for information content, and the informed tilt',
    icon: BrainCircuit,
  },
  {
    path: '/trace/dark-pool',
    label: 'Dark Pool',
    subtitle: 'Off-exchange blocks mapped to shelves: who is building, who is leaving',
    icon: Layers,
  },
  {
    path: '/trace/scanner',
    label: 'Scanner',
    subtitle: 'Per-contract flow aggregation: volume, ΔOI and bull/bear scoring',
    icon: ScanLine,
  },
  {
    path: '/trace/reconstruction',
    label: 'Reconstruction',
    subtitle: 'Prints clustered into probable parent metaorders: size, completion and urgency',
    icon: Network,
  },
];
