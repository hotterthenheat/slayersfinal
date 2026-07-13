/*
==================================================
  SLAYER TERMINAL - SKY'S VISION TYPES (skyvision.ts)
  Advisory signal engine — ENTER/EXIT guidance only.
  Four scanners, grouped setup feed, contract chain,
  signal monitor & impact leaderboard.
==================================================
*/

export type ScannerKey = 'top-setups' | 'quick-scalp' | 'discounted' | 'rebounds' | 'whale-sweeps' | 'all';

export interface ScannerDef {
  key: ScannerKey;
  label: string;
  blurb: string;
}

export const SCANNERS: ScannerDef[] = [
  { key: 'top-setups', label: 'Top Setups', blurb: 'Strongest ranked — trend + dealer-flow conviction' },
  { key: 'quick-scalp', label: 'Quick Scalp', blurb: 'High-gamma, short-hold intraday pops' },
  { key: 'discounted', label: 'Discounted', blurb: 'Cheap premium vs projected move' },
  { key: 'rebounds', label: 'Rebounds', blurb: 'Oversold reversals with structure support' },
  { key: 'whale-sweeps', label: 'Whale Sweeps', blurb: 'Large institutional sweep orders detected' },
  { key: 'all', label: 'All', blurb: 'Every setup across all scanners' },
];

/** The engine's read on a contract — a recommendation, never an order. */
export type Verdict = 'ENTER' | 'EXIT' | 'WATCH';

export type Momentum = 'STRENGTHENING' | 'NEUTRAL' | 'WEAKENING';

/** Per-strike engine recommendation shown in the contract chain. */
export type ChainAction = 'HOLD' | 'REDUCE' | 'SELL';

export type TakeProfitStatus = 'PENDING' | 'IN PROGRESS' | 'HIT';

export type OptionRight = 'C' | 'P';

export interface SetupGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
}

export interface TargetLevel {
  price: number;
  pct: number;
}

export interface TakeProfit {
  level: number;
  status: TakeProfitStatus;
  expectedPct: number;
  target: number;
}

export interface Setup {
  id: string;
  ticker: string;
  contract: string;
  right: OptionRight;
  strike: number;
  expiry: string;
  score: number;
  verdict: Verdict;
  topRated: boolean;
  topOpportunity: boolean;
  expectedMovePct: number;
  swingTarget: TargetLevel;
  scalpExit: TargetLevel;
  headline: string;
  whyChips: string[];
  whyText: string;
  greeks: SetupGreeks;
  bid: number;
  ask: number;
  mid: number;
  liveMid: number;
  confidence: number;
  health: number;
  momentum: Momentum;
  takeProfits: TakeProfit[];
  liquidityLabel: 'Tight' | 'Normal' | 'Wide';
  liquiditySpread: string;
  invalidationPrice: number;
  invalidationReason: string;
}

export interface SetupGroup {
  ticker: string;
  spot: number;
  sparkline: number[];
  changePct: number;
  found: number;
  setups: Setup[];
}

export interface ChainSide {
  premium: number;
  changePct: number;
  health: number;
  momentum: Momentum;
  action: ChainAction;
}

export interface ChainRow {
  strike: number;
  call: ChainSide;
  put: ChainSide;
}

export interface ContractChain {
  ticker: string;
  spot: number;
  rows: ChainRow[];
}

export type ImpactMetric = 'gamma' | 'volume' | 'notional' | 'oi';

export interface ImpactRow {
  rank: number;
  contract: string;
  expiry: string;
  openInterest: number;
  volume: number;
  deltaNotional: number;
  gamma: number;
}

export interface SkyVisionData {
  scanner: ScannerKey;
  groups: SetupGroup[];
  totalFound: number;
  shown: number;
  chain: ContractChain;
  impact: ImpactRow[];
}
