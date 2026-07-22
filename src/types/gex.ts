/*
==================================================
  SLAYER TERMINAL - PINPOINT GEX TYPES (gex.ts)
  Strike chart overlays, strike×expiry matrix,
  multi-ticker flow board & dark pool prints
==================================================
*/

export type GexMetric = 'GEX' | 'VEX' | 'GEX+VEX';

export type OverlayMode = 'NODES' | 'LEVELS' | 'BOTH';

export type StrikeRange = 10 | 20;

/** Key dealer-structure price levels drawn on the strike chart. */
export interface KeyLevels {
  spot: number;
  callWall: number;
  putWall: number;
  flip: number;
  /** Strike holding the largest absolute exposure */
  king: number;
}

/** One horizontal exposure node on the price axis. */
export interface NodeLevel {
  strike: number;
  /** Signed metric value in dollars */
  value: number;
}

export interface MatrixCell {
  value: number;
  king?: boolean;
}

export interface GexMatrixData {
  /** Column labels, nearest expiry first (e.g. 0DTE, 1D, …) */
  expiries: string[];
  /** Row strikes, descending */
  strikes: number[];
  /** cells[rowIndex][colIndex] */
  cells: MatrixCell[][];
  maxAbs: number;
  spotRowIndex: number;
  callWallIndex: number;
  putWallIndex: number;
}

export interface DarkPoolPrint {
  price: number;
  /** Notional in $B */
  notional: number;
  date: string;
  /** Shares crossed */
  size: number;
  /** HH:MM:SS print time */
  time: string;
}

export interface LadderRow {
  strike: number;
  value: number;
  king?: boolean;
}

export interface BoardTicker {
  ticker: string;
  spot: number;
  changePercent: number;
  prints: DarkPoolPrint[];
  ladder: LadderRow[];
  ladderMaxAbs: number;
}

export interface GexView {
  levels: KeyLevels;
  nodes: NodeLevel[];
  nodesMaxAbs: number;
  matrix: GexMatrixData;
  board: BoardTicker[];
}

// ---- Exposure Profile (GEX / DEX / VEX by strike + dealer positioning) ------

export type ExposureExpiry = '0DTE' | '1D' | '2D' | '5D' | '7D' | 'ALL';

/** Put / call legs and their net, signed dollars. */
export interface GreekSplit {
  put: number;
  call: number;
  net: number;
}

export interface StrikeExposure {
  strike: number;
  /** Marks the pin strike (max open-interest magnet) in the rail */
  pin?: boolean;
  gex: GreekSplit;
  dex: GreekSplit;
  vex: GreekSplit;
}

export type ZoneKind = 'call-wall' | 'put-wall' | 'friction';

/** Contiguous strike band annotated on the positioning map (strikes descending: from ≥ to). */
export interface ZoneBand {
  from: number;
  to: number;
  kind: ZoneKind;
  label: string;
}

export type DealerBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface ExposureLevels {
  spot: number;
  callWall: number;
  putWall: number;
  pin: number;
  flip: number;
}

export interface ExposureProfileData {
  ticker: string;
  expiry: ExposureExpiry;
  /** Strikes descending, window around spot */
  strikes: StrikeExposure[];
  /** Per-greek scaling for bars (max |leg| across the window) */
  maxAbs: { gex: number; dex: number; vex: number };
  netGex: number;
  netDex: number;
  netVex: number;
  levels: ExposureLevels;
  zones: ZoneBand[];
  bias: DealerBias;
  biasNote: string;
  /** Generated narrative — levels translated to English */
  insights: string[];
  /** Row index after which the spot marker renders (-0.5 = above all rows) */
  spotAfterIndex: number;
}

// ---- Command cockpit ---------------------------------------------------------

export interface PressureSide {
  /** Signed dealer pressure, dollars */
  pressure: number;
  /** Open-interest change vs prior session, contracts */
  deltaOI: number;
  volume: number;
}

export interface PressureRow {
  strike: number;
  pin?: boolean;
  flip?: boolean;
  call: PressureSide;
  put: PressureSide;
  /** Net dealer pressure across both sides */
  net: number;
}

export type KeyLevelKind = 'call-wall' | 'spot' | 'put-wall' | 'pin' | 'flip' | 'king';

export interface KeyLevelRow {
  kind: KeyLevelKind;
  label: string;
  price: number;
  /** Signed % distance from spot (spot row = 0) */
  distPct: number;
  /** Exposure magnitude parked at the level, dollars */
  pressure: number;
}

export interface DeltaPoint {
  /** Minutes into the session */
  minute: number;
  value: number;
}

export interface DeltaByPrice {
  price: number;
  /** Signed delta traded at this price bucket, dollars */
  value: number;
}

export interface OrderFlowData {
  cumulativeDelta: DeltaPoint[];
  deltaByPrice: DeltaByPrice[];
  buyVolume: number;
  sellVolume: number;
  /** Net delta over the session, dollars */
  netDelta: number;
  vwap: number;
  /** Point of control — price bucket with the most traded volume */
  poc: number;
}

export interface MarketNote {
  /** HH:MM:SS */
  time: string;
  text: string;
  /** True when typed by the user rather than generated */
  manual?: boolean;
}

export interface CommandView {
  pressure: PressureRow[];
  /** Max |pressure| across rows for bar scaling */
  pressureMaxAbs: number;
  keyLevels: KeyLevelRow[];
  orderFlow: OrderFlowData;
  bias: DealerBias;
  biasNote: string;
}

// ---- Volatility Lab ------------------------------------------------------------

export interface IvSurfaceData {
  /** Column axis — strike / forward */
  moneyness: number[];
  /** Row axis, shortest first */
  dte: number[];
  /** cells[dteIndex][moneynessIndex], IV in % */
  cells: number[][];
  min: number;
  max: number;
  forward: number;
}

export interface TermPoint {
  dte: number;
  /** ATM IV, % */
  iv: number;
}

export interface TermStructureData {
  current: TermPoint[];
  dayAgo: TermPoint[];
  weekAgo: TermPoint[];
  monthAgo: TermPoint[];
  stats: {
    atm30: number;
    iv1m: number;
    iv3m: number;
    iv6m: number;
    iv1y: number;
    /** 0–100, of the 1y range */
    ivRank: number;
    /** 0–100 */
    ivPercentile: number;
  };
}

export interface RndData {
  /** Price grid, ascending */
  prices: number[];
  /** Normalized density per price */
  density: number[];
  forward: number;
  /** [-1σ, +1σ] prices */
  sigma1: [number, number];
  /** [-2σ, +2σ] prices */
  sigma2: [number, number];
  stats: {
    expMoveAbs: number;
    expMovePct: number;
    skew: number;
    kurtosis: number;
    /** Tail probabilities, % */
    pAbove2: number;
    pBelow2: number;
    /** 25Δ structures, vol points */
    riskReversal: number;
    butterfly: number;
  };
}

export type VolRegime = 'LOW VOL' | 'NORMAL' | 'HIGH VOL';

export interface RegimeSlice {
  /** e.g. "Jul 24" */
  month: string;
  /** Probabilities 0–1, sum ≈ 1 */
  low: number;
  normal: number;
  high: number;
}

export interface RegimeData {
  series: RegimeSlice[];
  current: VolRegime;
  /** Probability of the current regime, % */
  prob: number;
  since: string;
  avgDurationDays: number;
  /** 1-month transition probabilities, % */
  nextLow: number;
  nextHigh: number;
}

export interface VolLabData {
  surface: IvSurfaceData;
  term: TermStructureData;
  rnd: RndData;
  regime: RegimeData;
}

// ---- Vanna & Charm (exposure migration) -----------------------------------------

/** CHARM = decay into the close · VANNA = shift under an IV move */
export type ShiftMode = 'CHARM' | 'VANNA';

export type IvShift = -2 | -1 | 1 | 2;

export interface ShiftBarRow {
  strike: number;
  pin?: boolean;
  /** Net GEX now, signed dollars */
  current: number;
  /** Net GEX under the scenario */
  projected: number;
}

export interface LevelShift {
  label: string;
  kind: KeyLevelKind;
  current: number;
  projected: number;
}

export interface WallDriftPoint {
  /** Unix seconds, bar-aligned */
  time: number;
  spot: number;
  callWall: number;
  putWall: number;
  flip: number;
}

// ---- Ranked Targets (strike scoring engine) ---------------------------------------

export type HedgingClass = 'DOWNSIDE CUSHION' | 'UPSIDE RESISTANCE' | 'MAGNET' | 'NEUTRAL';

export type TargetTag = 'WALL' | 'PIN' | 'KING' | 'SPOT TARGET';

export interface RankedTarget {
  rank: number;
  strike: number;
  /** 0–100 composite priority score */
  score: number;
  /** Signed basis points from spot */
  bps: number;
  volume: number;
  /** Volume vs. average of neighboring strikes — isolated magnets score high */
  nbr: number;
  netGex: number;
  openInterest: number;
  callVol: number;
  putVol: number;
  pressure: 'SUPPORT' | 'RESISTANCE';
  hedgingClass: HedgingClass;
  tags: TargetTag[];
}

export interface RankedTargetsView {
  ticker: string;
  spot: number;
  /** Sorted by score, descending */
  targets: RankedTarget[];
  maxVolume: number;
  maxAbsGex: number;
}

// ---- Vanna & Charm view -------------------------------------------------------------

export interface VannaCharmView {
  ticker: string;
  spot: number;
  mode: ShiftMode;
  ivShift: IvShift;
  /** Strikes descending */
  rows: ShiftBarRow[];
  /** Max |value| across current + projected, for bar scaling */
  maxAbs: number;
  flipCurrent: number;
  flipProjected: number;
  shifts: LevelShift[];
  drift: WallDriftPoint[];
  insights: string[];
}
