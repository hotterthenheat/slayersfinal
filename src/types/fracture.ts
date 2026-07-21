/*
==================================================
  SLAYER TERMINAL - FRACTURE TYPES (fracture.ts)
  The instability engine's contract. GEX estimates
  which way dealers must hedge; Fracture estimates
  where forced flow overwhelms available liquidity
  and the market goes nonlinear — before it shows in
  price.
==================================================
*/

/** The forced participants whose flow is mechanical, not discretionary. */
export type ForcedParticipant =
  | 'Dealer hedging'
  | 'Vol-control'
  | 'CTA trend'
  | 'Leveraged ETF'
  | 'Margin / liquidation';

/** Absorption regime for a single price level. */
export type AbsorptionRegime = 'ABSORBED' | 'PRESSURE' | 'UNSTABLE' | 'NONLINEAR';

export interface ForcedFlowLevel {
  price: number;
  /** Signed % distance from spot */
  distPct: number;
  /** Signed $ forced by each participant if price reaches here (negative = selling) */
  dealerHedge: number;
  volControl: number;
  cta: number;
  letf: number;
  margin: number;
  /** Signed sum, dollars */
  totalForced: number;
  /** Executable liquidity available at this level, dollars */
  latentLiquidity: number;
  /** |forced| ÷ latent — >1 means the book can't absorb it */
  absorption: number;
  regime: AbsorptionRegime;
}

export interface CriticalityRead {
  /** Hawkes branching ratio proxy, 0–1; near 1 = self-sustaining */
  branchingRatio: number;
  /** Share of activity that is endogenous (market reacting to itself), 0–100 */
  endogeneityPct: number;
  label: 'STABLE' | 'REACTIVE' | 'CRITICAL' | 'UNSTABLE';
  note: string;
}

export interface CascadeResult {
  triggerPrice: number;
  /** Probability a break of the trigger produces a self-reinforcing cascade, 0–100 */
  cascadeProbPct: number;
  medianTerminus: number;
  exhaustionLo: number;
  exhaustionHi: number;
  primaryAmplifier: ForcedParticipant;
  secondaryAmplifier: ForcedParticipant;
  /** Sample simulated paths for the fan chart (price by step) */
  paths: number[][];
}

export interface MoveDecomposition {
  informational: number;
  dealerHedging: number;
  systematic: number;
  passive: number;
  shortCovering: number;
  liquidation: number;
  unexplained: number;
}

export type MocClassification = 'CONTINUATION' | 'ABSORPTION FADE' | 'DISLOCATION REVERSAL' | 'NO TRADE';

export interface MocRead {
  /** Signed unpaired auction interest, dollars (negative = sell imbalance) */
  imbalanceUsd: number;
  side: 'BUY' | 'SELL' | 'BALANCED';
  /** Normalized imbalance z-score vs expected auction liquidity */
  normalizedZ: number;
  /** Imbalance growth over the last updates, signed */
  growthZ: number;
  /** Indicative-price displacement from mid, in intraday-vol units */
  displacementZ: number;
  /** How much of the imbalance the paired book is soaking up, 0–100 */
  absorptionPct: number;
  /** Confirmation from futures / ETF / sector, −1…+1 */
  confirmation: number;
  /** Odds the imbalance mean-reverts before the cross, 0–100 */
  reversalRisk: number;
  /** Composite MOC score, −100…+100 (signed toward the trade) */
  score: number;
  classification: MocClassification;
  note: string;
}

export interface FractureView {
  ticker: string;
  spot: number;
  /** The nearest price (below or above spot) where absorption crosses 1 */
  fractureLine: number | null;
  fractureSide: 'DOWN' | 'UP' | null;
  fractureDistPct: number | null;
  /** The one-line read a trader acts on */
  headline: string;
  /** Total forced flow in motion right now, dollars (signed) */
  forcedNowUsd: number;
  /** Instability pressure index, 0–100 (the composite) */
  instability: number;
  levels: ForcedFlowLevel[];
  criticality: CriticalityRead;
  cascade: CascadeResult;
  decomposition: MoveDecomposition;
  moc: MocRead;
}
