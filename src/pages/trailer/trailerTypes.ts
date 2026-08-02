/*
==================================================
  SLAYER TERMINAL - TRAILER DOMAIN TYPES
  One market event, carried through every desk.
==================================================
*/

/**
 * The State Thread.
 *
 * The trailer's spine: one packet that every scene reads and that later scenes
 * add fields to. Pulse writes the regime, Pinpoint writes the dealer and gamma
 * state, Compass writes the setup, the Weigher writes the contract, Prove It
 * writes the confidence. Nothing is re-derived per scene — if two desks disagree
 * about the level or the timestamp, the trailer has lied about being one system.
 */
export interface TrailerStateThread {
  ticker: string;
  /** Session clock in epoch ms — advances with the trailer, not the wall clock. */
  timestamp: number;
  spot: number;
  changePct: number;
  regime: string;
  dealerState: string;
  gammaState: string;
  flowState: string;
  volatilityState: string;
  /** The one structural level the whole story happens at. */
  activeLevel: number;
  setupId?: string;
  contractId?: string;
  modelConfidence?: number;
}

/** Which fields of the thread a scene is allowed to have acquired by then. */
export type ThreadField = keyof TrailerStateThread;

export interface TrailerSceneDefinition {
  id: string;
  /** Product name as it appears in the app, not a marketing label. */
  product: string;
  /** The real desk this scene projects. Drives the "Open desk" control. */
  route?: string;
  durationMs: number;
  enterAtMs: number;
  exitAtMs: number;
  /** Screen-reader description of what the scene shows. */
  description: string;
  /** Thread fields this scene is the first to establish. */
  acquires?: ThreadField[];
}

// ---- story payloads ---------------------------------------------------------

export interface PricePoint {
  t: number;
  px: number;
}

export interface OptionPrint {
  id: string;
  /** Seconds into the story window. */
  at: number;
  strike: number;
  right: 'C' | 'P';
  expiry: string;
  dte: number;
  size: number;
  premium: number;
  /** Where in the quote it filled — 0 = bid, 1 = ask. */
  fill: number;
  bid: number;
  ask: number;
  oi: number;
  kind: 'SWEEP' | 'BLOCK' | 'SPLIT';
  /** Directional read WITH its uncertainty — never a bare "bullish". */
  lean: 'CALL-SIDE' | 'PUT-SIDE';
  leanConf: number;
  /** Milliseconds since the quote used for the classification. */
  quoteAgeMs: number;
  urgency: 'PATIENT' | 'FIRM' | 'AGGRESSIVE';
  /** Part of the reconstructed parent sequence. */
  child: boolean;
}

export interface ScannerRow {
  id: string;
  label: string;
  premium: number;
  volOi: number;
  moneyness: number;
  dte: number;
  iv: number;
  /** Live score at t=0 and at the end of the scene — the row climbs. */
  scoreFrom: number;
  scoreTo: number;
  state: 'LIVE READ' | 'UNCONFIRMED' | 'DECAYING';
  ours: boolean;
}

export interface MetaorderHypothesis {
  label: string;
  probability: number;
}

export interface MetaorderRead {
  childIds: string[];
  windowSec: number;
  sharedStrike: number;
  sharedExpiry: string;
  aggressorConsistency: number;
  estimatedTotal: number;
  completedPct: number;
  minutesRemaining: number;
  hypotheses: MetaorderHypothesis[];
  invalidation: string;
}

export interface DarkPrint {
  at: number;
  px: number;
  notional: number;
  venue: string;
}

export interface DarkPoolRead {
  shelf: number;
  prints: DarkPrint[];
  shelfNotional: number;
  touches: number;
  survivedTouches: number;
  distancePct: number;
  state: 'ABSORPTION' | 'REJECTION' | 'PASS-THROUGH' | 'UNRESOLVED';
  readings: { label: string; weight: number }[];
}

export interface GammaCell {
  strike: number;
  expiryIdx: number;
  netGex: number;
}

export interface GammaField {
  strikes: number[];
  expiries: string[];
  cells: GammaCell[];
  flip: number;
  callWall: number;
  putWall: number;
  king: number;
  maxAbs: number;
  /** How much of the read depends on the dealer-sign assumption. */
  signDependence: number;
}

export interface RankedLevel {
  price: number;
  role: 'SUPPORT' | 'RESISTANCE' | 'PIVOT';
  distancePct: number;
  reaction: number;
  confidence: number;
  sensitivity: number;
}

export interface GreekRow {
  key: string;
  label: string;
  now: number;
  drift: number;
  unit: string;
}

export interface StressCase {
  label: string;
  spotShock: number;
  ivShock: number;
  hoursForward: number;
  hedgeFlow: number;
  levelSurvives: boolean;
  note: string;
}

export interface SetupCandidate {
  id: string;
  label: string;
  right: 'C' | 'P';
  horizon: string;
  /** The anatomy — every contribution is shown, never a bare composite. */
  factors: { key: string; label: string; value: number; weight: number }[];
  pTargetBeforeStop: number;
  evAfterCosts: number;
  expectedShortfall: number;
  dataQuality: number;
  modelConfidence: number;
  invalidation: string;
  verdict: 'SELECTED' | 'ALTERNATIVE' | 'REJECTED';
  rejectReason?: string;
}

export interface ContractRow {
  id: string;
  strike: number;
  right: 'C' | 'P';
  expiry: string;
  dte: number;
  bid: number;
  ask: number;
  mid: number;
  spreadPct: number;
  quoteAgeMs: number;
  oi: number;
  volume: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  iv: number;
  breakeven: number;
  physicalExit: number;
  executionCost: number;
  ev: number;
  expectedShortfall: number;
  utility: number;
  liquidityRisk: number;
  verdict: 'SELECTED' | 'ALTERNATIVE' | 'REJECTED';
  why: string;
}

export interface LottoRow {
  id: string;
  strike: number;
  ask: number;
  breakevenMove: number;
  requiredMove: number;
  pFirstPassage: number;
  pTargetBeforeExpiry: number;
  thetaBurnPerHour: number;
  spreadCost: number;
  terminalLiquidity: number;
  pinRisk: number;
  maxLoss: number;
  verdict: 'CONSIDERED' | 'NO TRADE';
  why: string;
}

export interface ScalpRead {
  horizonMin: number;
  pTargetBeforeStop: number;
  spreadCost: number;
  quoteStability: number;
  gammaEfficiency: number;
  minutesToCutoff: number;
}

export interface ReboundRead {
  touch: number;
  displacement: number;
  absorption: number;
  flowReversal: number;
  dealerSupport: number;
  excursion: number;
  invalidation: number;
}

export interface DistributionBin {
  px: number;
  physical: number;
  riskNeutral: number;
}

export interface CalibrationPoint {
  predicted: number;
  observed: number;
}

export interface ModelCandidate {
  name: string;
  role: 'CHAMPION' | 'CHALLENGER';
  crps: number;
  calibrationErr: number;
  economicValue: number;
  walkForward: number;
  promoted: boolean;
  gate: string;
}

export interface ProveItRead {
  bins: DistributionBin[];
  calibration: CalibrationPoint[];
  expectedLow: number;
  expectedHigh: number;
  tailProb: number;
  horizonLabel: string;
  models: ModelCandidate[];
}

export interface StockRow {
  ticker: string;
  momentum: number;
  quality: number;
  flow: number;
  news: number;
  composite: number;
  sector: string;
  relStrength: number;
  offExchange: number;
  routing: 'STOCK' | 'OPTIONS' | 'SPREAD' | 'NO TRADE';
  ours: boolean;
}

export interface NewsItem {
  at: number;
  source: string;
  headline: string;
  catalyst: string;
  novelty: number;
  duplicates: number;
  contradiction: boolean;
}

export interface NewsRead {
  items: NewsItem[];
  driftBefore: number;
  driftAfter: number;
  widthBefore: number;
  widthAfter: number;
  confidence: number;
}

export interface EarningsRead {
  date: string;
  daysAway: number;
  timeConfirmed: boolean;
  session: string;
  straddleCost: number;
  impliedMovePct: number;
  realizedMedianPct: number;
  forecastMovePct: number;
  ivCrush: number;
  pDirection: number;
  pMagnitude: number;
  structures: { label: string; verdict: 'FAVOURED' | 'NEUTRAL' | 'AGAINST'; note: string }[];
  selected: string;
}

export interface TrackerPacket {
  id: string;
  frozenAt: number;
  ticker: string;
  setupId: string;
  contractId: string;
  entry: number;
  stop: number;
  target: number;
  level: number;
  ev: number;
  expectedShortfall: number;
  dataQuality: number;
  modelVersion: string;
  invalidation: string;
  alternatives: string[];
}

export interface TrackerOutcome {
  path: PricePoint[];
  targetProgress: number;
  invalidationRisk: number;
  survived: boolean;
  outcome: 'TARGET' | 'STOPPED' | 'CLOSED ON RULE' | 'OPEN';
  counterfactuals: { label: string; result: number; better: boolean }[];
  attribution: { label: string; contribution: number }[];
  learning: 'LEARN' | 'UNCHANGED' | 'RETIRE';
  learningNote: string;
}

/** Everything the trailer will ever show, derived once from one snapshot. */
export interface TrailerStory {
  ticker: string;
  sessionStart: number;
  /** The structural level the whole narrative happens at. */
  level: number;
  spot0: number;
  path: PricePoint[];
  levels: { callWall: number; putWall: number; flip: number; king: number };
  prints: OptionPrint[];
  scanner: ScannerRow[];
  metaorder: MetaorderRead;
  darkPool: DarkPoolRead;
  gamma: GammaField;
  rankedLevels: RankedLevel[];
  greeks: GreekRow[];
  stress: StressCase[];
  setups: SetupCandidate[];
  contracts: ContractRow[];
  lotto: LottoRow[];
  scalp: ScalpRead;
  rebound: ReboundRead;
  proveIt: ProveItRead;
  stocks: StockRow[];
  news: NewsRead;
  earnings: EarningsRead;
  packet: TrackerPacket;
  outcome: TrackerOutcome;
}
