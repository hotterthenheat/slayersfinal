/*
==================================================
  SLAYER TERMINAL - COMPASS TYPES (compass.ts)
  Advisory signal engine — ENTER/EXIT guidance only.
  Four scanners, grouped setup feed, contract chain,
  signal monitor & impact leaderboard.
==================================================
*/

/*
  ---- two axes, because a contract is two decisions ------------------------

  HOW LONG you are holding it decides everything downstream — the strike ladder
  it makes sense to look at, how much of the premium the clock takes, whether
  "swing" is even a legal word for a target. WHAT KIND of edge you want is a
  separate question entirely.

  They used to be one strip of six presets, so every preset was same-session or
  next-day by construction and a trader looking for a weekly, a swing or a LEAP
  had nowhere to click. Sleeve is the primary axis now and style the secondary
  one: five sleeves x six styles, rather than six half-answers.
*/

export type SleeveKey = 'odte' | 'weekly' | 'swing' | 'leaps' | 'structures';

export interface SleeveDef {
  key: SleeveKey;
  label: string;
  /** The horizon in plain words, under the label. */
  window: string;
  blurb: string;
  /**
   * CALENDAR days to the sleeve's expiry — the unit core/calendar.ts resolves an
   * expiry from. It is the ONLY source of a setup's expiry; the styles have no
   * say, which is the whole point of the split.
   */
  dte: number;
  /**
   * One rung of the strike ladder, as a share of spot. It tracks the expected
   * move, which grows with the root of time: a 0.5% rung is a real spread of
   * choices on a same-day contract and pure noise on one with a year to run.
   */
  rungPct: number;
  /**
   * How far from the money still counts as near. Held at about six rungs on
   * every sleeve so the boards spread alike instead of saturating on the long end.
   */
  windowPct: number;
}

export const SLEEVES: SleeveDef[] = [
  {
    key: 'odte',
    label: '0DTE',
    window: 'same session',
    blurb: 'Expires at the bell. Gamma is everything and the clock is measured in hours.',
    dte: 0,
    rungPct: 0.005,
    windowPct: 0.03,
  },
  {
    key: 'weekly',
    label: 'Weekly',
    // "one week out", not "this week": seven CALENDAR days from a Monday
    // resolves to the following Monday, so the tab was contradicting the date
    // printed directly beneath it.
    window: 'one week out',
    blurb: 'A handful of sessions. Long enough for a thesis, short enough that decay still votes.',
    dte: 7,
    rungPct: 0.012,
    windowPct: 0.07,
  },
  {
    key: 'swing',
    label: 'Swing',
    window: '6 weeks',
    blurb: 'Room for the move to happen. Direction and volatility both carry the trade.',
    dte: 45,
    rungPct: 0.025,
    windowPct: 0.15,
  },
  {
    key: 'leaps',
    label: 'LEAPS',
    window: 'a year out',
    blurb: 'Buying time rather than timing. Decay barely votes; what you pay for volatility does.',
    dte: 365,
    rungPct: 0.06,
    windowPct: 0.36,
  },
  {
    key: 'structures',
    label: 'Structures',
    window: 'defined risk',
    blurb: 'Verticals, condors, butterflies and straddles — the worst case is known before the trade.',
    dte: 45,
    rungPct: 0.025,
    windowPct: 0.15,
  },
];

export const SLEEVE_BY_KEY: Record<SleeveKey, SleeveDef> = Object.fromEntries(
  SLEEVES.map(s => [s.key, s])
) as Record<SleeveKey, SleeveDef>;

/** Sleeves whose board is a single contract. Structures builds multi-leg. */
export const CONTRACT_SLEEVES: SleeveKey[] = ['odte', 'weekly', 'swing', 'leaps'];

export type ScannerKey = 'top-setups' | 'quick-scalp' | 'discounted' | 'rebounds' | 'whale-sweeps' | 'all';

export interface ScannerDef {
  key: ScannerKey;
  label: string;
  blurb: string;
}

/*
  The styles are LENSES on a sleeve, not horizons of their own.

  Two of them read as near-duplicates until you look at what they do with the
  tape, and it is worth saying plainly because the old labels did not: Discounted
  buys WITH the trend and screens on price — premium cheap against the move the
  contract needs. Rebounds is the only style in the strip that trades AGAINST the
  tape, and it screens on position — a stretched name leaning into a level, taken
  with delta rather than convexity. Opposite direction, opposite strike
  preference, and the two boards now overlap on almost nothing.
*/
export const SCANNERS: ScannerDef[] = [
  { key: 'top-setups', label: 'Top Setups', blurb: 'Strongest ranked on trend and dealer-flow conviction' },
  { key: 'quick-scalp', label: 'Quick Scalp', blurb: 'Peak gamma at the money — most movement per dollar risked' },
  { key: 'discounted', label: 'Discounted', blurb: 'With the tape, priced cheap against the move it needs' },
  { key: 'rebounds', label: 'Rebounds', blurb: 'Against the tape — stretched names taken with delta, not convexity' },
  { key: 'whale-sweeps', label: 'Whale Sweeps', blurb: 'The block strikes size actually prints on' },
  { key: 'all', label: 'All', blurb: 'Every contract in the sleeve, unfiltered' },
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
  /** The engine's bucket, e.g. "0DTE" / "7DTE" / "45DTE" / "365DTE". */
  expiry: string;
  /** The sleeve that chose the expiry. */
  sleeve: SleeveKey;
  /**
   * The engine's continuous ranking quantity (data/compass.ts rankOf). This is
   * what a board ORDERS by. `score` is its display rounding, and above a floor of
   * 84 that rounding holds sixteen values for thousands of candidates, so sorting
   * on it sorts a sixteen-way tie and hands the board to whatever breaks it.
   */
  rank: number;
  /** The 8-99 integer a screen prints. Never an input to a comparison. */
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
  /*
    A `confidence` percentage sat here, computed as `clamp((score - 55) * 2.1)` —
    the score with a percent sign and no second input. Three surfaces had already
    refused to render it and written down why (compass/contractFacts.ts,
    compass/SignalMonitor.tsx, compass/SetupScanCard.tsx: "a Conf column is the
    Score column wearing a percent sign"), but Tracker and the public landing page
    still printed it, so the desk both featured and excluded one number depending
    on which pane you stood in. It is deleted rather than left on the type,
    because a field nothing may honestly render is an invitation.

    `health` is the independent read those three panels name as its replacement:
    it comes from moneyness (data/compass.ts healthFor), not from the score, so
    the two can disagree — which is the only reason to show a second number.
  */
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
  bid: number;
  ask: number;
  changePct: number;
  delta: number;
  ivPct: number;
  volume: number;
  openInterest: number;
  /** True when the strike is in the money for THIS side. */
  itm: boolean;
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
  /** EVERY listed strike, low to high. Not a window — see buildChain. */
  rows: ChainRow[];
  /** Index of the first row at or above spot, so the panel can open at the money. */
  atmIndex: number;
  /**
   * The expiry these premiums are quoted for, verbatim from the active preset.
   *
   * It is on the data rather than assumed by the panel because the two used to
   * disagree silently: the chain priced every strike at a fixed 1DTE while the
   * board beside it was 0DTE, so one contract printed two premiums on one
   * screen. Carrying the stamp is what lets the panel say which clock it is on.
   */
  expiry: string;
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

export interface CompassData {
  scanner: ScannerKey;
  sleeve: SleeveKey;
  groups: SetupGroup[];
  totalFound: number;
  shown: number;
  chain: ContractChain;
  impact: ImpactRow[];
}
