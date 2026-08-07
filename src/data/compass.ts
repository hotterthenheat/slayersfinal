/*
==================================================
  SLAYER TERMINAL - COMPASS ENGINE (compass.ts)
  Placeholder advisory model. Deterministic per contract
  so rows stay stable across ticks. Swap this whole file
  for the real quant engine / ThetaData feed later.
==================================================
*/

import Simulator from '../core/simulator';
import { yearsToExpiry } from '../core/optionTime';
import { expiryFor } from '../core/calendar';
import {
  SCAN_UNIVERSE_SIZE,
  buildScanUniverse,
  scanEpoch,
  scanNameFor,
  scanSparkline,
  type ScanName,
} from '../core/scanUniverse';
import type { MarketSnapshot, OpenInterest } from '../types/market';
import { SLEEVE_BY_KEY } from '../types/compass';
import type {
  ChainAction,
  ChainRow,
  ChainSide,
  ContractChain,
  ImpactRow,
  Momentum,
  OptionRight,
  ScannerKey,
  Setup,
  SetupGroup,
  SleeveKey,
  CompassData,
  TakeProfit,
  Verdict,
} from '../types/compass';

// ---- deterministic RNG ----------------------------------------------------
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seedNum: number): () => number {
  let a = seedNum;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ---- sleeve: the horizon axis ---------------------------------------------
/*
  The sleeve owns the clock and nothing else does.

  It used to be the scanner's, which made the horizon and the edge a single
  choice: every preset was 0DTE or 1DTE by construction, so the desk had no way
  to ask for a weekly, a swing or a LEAP at all. Splitting them is what lets one
  style be asked of four horizons — and it is what makes the ladder honest, since
  a 0.5% rung is a real spread of strikes on a same-day contract and pure noise
  on one with a year to run.
*/

/** The engine's bucket stamp for a sleeve, e.g. "45DTE". Read by setupHorizon. */
export function sleeveExpiry(sleeve: SleeveKey): string {
  return `${SLEEVE_BY_KEY[sleeve].dte}DTE`;
}

// ---- scanner tuning -------------------------------------------------------
interface ScannerProfile {
  swingMul: number; // upper target aggressiveness
  scalpMul: number; // tighter exit
  moveBias: number; // expected-move scaling
  scoreFloor: number; // min score to surface a setup
  /**
   * Where on the ladder this style looks, in window units: 0 is at the money,
   * +1 is the far edge of the sleeve's window on the side the trade wants,
   * negative is in the money. This is the whole difference between the styles.
   */
  seek: number;
  /** How fast it loses interest either side of `seek`, in window units. */
  reach: number;
  /** Marks a contract down when it is off the grid blocks print on. */
  blockBias?: boolean;
}

/*
  Score floors, calibrated against the WIDE field (see core/scanUniverse.ts).
  With four names and four strikes a floor was a formality — everything the
  generator produced was near-the-money and trend-aligned, so nothing was ever
  rejected and the floor's only job was to not fire. Over ~9,000 candidates it
  is the actual gate, so each one now has to mean something:

  - The five selective scanners keep their bars. A high floor across a wide
    field is exactly what "the best setups in the market" asks for — the field
    got two orders of magnitude bigger, so the bar should not come down.
  - 'all' drops 65 → 8, the score clamp's own minimum, i.e. no bar at all. Its
    blurb promises "every setup across all scanners" and now it means it: its
    count IS the field. Nothing about the rows changes — the screen shows the
    top of the ranking either way — but the number beside the tab stops being
    an arbitrary subset of a field the user was never shown.

  A note on what the floors do NOT decide. The EXIT verdict needs a score under
  72, and no contract scoring under 72 is ever going to be in the top 240 of
  9,000. That is not a floor problem and lowering one will not fix it: a scanner
  ranks opportunities, so its feed is the head of the distribution by
  construction. Treat it as an invariant rather than a shortfall — scanRanking
  .test.ts asserts BOTH halves of it, that no sweep ever emits an EXIT and that
  makeSetup reaches EXIT on a contract that is merely evaluated rather than
  ranked. Those are the surfaces a fading read belongs on: Tracker rebuilds a
  setup the user already carries, and the Weigher grades whatever strike the
  user points at.
*/
/*
  `seek` and `reach` ARE the styles. Everything else here is presentation.

  Top Setups and All look straight at the money and fall away evenly — the
  neutral ranking. The other four each want a different part of the ladder, and
  that is what stops five tabs from printing one board:

  - Quick Scalp wants the gamma peak and nothing else, so it dies inside half the
    window. On a 0DTE that is the at-the-money strike and its neighbour.
  - Discounted wants the contract that is cheap against the move it needs, which
    is never the at-the-money one — it sits about half a window out, where
    premium per unit of expected move bottoms out.
  - Rebounds wants delta, because a reversal has to pay before the tape agrees
    with you. It leans slightly IN the money, and it is the one style that reads
    the tape backwards (see scanLean).
  - Whale Sweeps wants the strikes size actually prints on: the round numbers
    nearest the money. Off the block grid it marks a contract down hard.

  Two calibration notes on Whale Sweeps, because both bit.

  The block penalty and an off-centre seek compound. At seek 0.35 the strike
  nearest the sweet spot was rarely also on the grid, so the best whale contract
  topped out near pref 0.6 and the whole board fell under its own floor —
  measured, 63 contracts cleared against 389 for Top Setups. A style's BEST
  contract has to be able to reach pref 1 or its floor stops meaning what the
  other tabs' floors mean. Seek 0 puts the penalty and the seek on one strike,
  which is also the truer claim: blocks concentrate at the money.

  Its floor then had to come down, from 83 to 72. The floors were calibrated
  against a score that read proximity and nothing else; a style carrying a hard
  0.55 penalty on most of its ladder is being asked a materially harder question
  by the same number. 83 admitted only the perfect contract — the at-the-money
  strike that also happened to be on the grid — and nothing one rung either side
  of it, which is not a screen, it is a coincidence detector.
*/
const PROFILES: Record<ScannerKey, ScannerProfile> = {
  'top-setups': { swingMul: 0.38, scalpMul: 0.18, moveBias: 1.0, scoreFloor: 84, seek: 0, reach: 1 },
  'quick-scalp': { swingMul: 0.22, scalpMul: 0.1, moveBias: 0.7, scoreFloor: 82, seek: 0, reach: 0.5 },
  discounted: { swingMul: 0.6, scalpMul: 0.28, moveBias: 1.35, scoreFloor: 78, seek: 0.55, reach: 0.75 },
  rebounds: { swingMul: 0.45, scalpMul: 0.22, moveBias: 1.15, scoreFloor: 76, seek: -0.25, reach: 1.1 },
  'whale-sweeps': { swingMul: 0.42, scalpMul: 0.2, moveBias: 1.1, scoreFloor: 72, seek: 0, reach: 1.3, blockBias: true },
  all: { swingMul: 0.38, scalpMul: 0.18, moveBias: 1.0, scoreFloor: 8, seek: 0, reach: 1 },
};

export function scannerFloor(scanner: ScannerKey): number {
  return PROFILES[scanner].scoreFloor;
}

// Thesis prose is DIRECTIONAL — a put setup must never carry a buy-wall
// story about a floor under the strike. Each scanner supplies a bull and
// a bear variant; the setup's right picks which one renders.
//
// It is also OBSERVATIONAL. Every string here describes the book and what that
// implies for price, and none of them instructs or claims a position: the app
// holds nothing, so there is no "our entry" for a wall to sit under, and the
// top-setups variant renders on the public landing page where a sentence
// telling a reader to scalp a pop is the product speaking, not the model.
const WHY_LIBRARY: Record<ScannerKey, { tag: string; text: (t: string, k: number, bullish: boolean) => string }> = {
  'top-setups': {
    tag: 'TREND ALIGNED',
    text: (t, k, bullish) =>
      bullish
        ? `Solid institutional buy walls are supporting price at ${k}. Market makers are heavily short this strike and must buy ${t} to stay hedged, forming an automatic protective floor beneath the level.`
        : `Heavy institutional supply caps price at ${k}. Market makers unload ${t} delta into every push toward the strike, forming an automatic ceiling pressing on each bounce.`,
  },
  'quick-scalp': {
    tag: 'GAMMA PEAK',
    text: (t) =>
      `Concentrated gamma at this strike makes ${t} whippy, and dealer re-hedging amplifies small moves. That same concentration comes with steep decay, so the window in which a move outruns theta is a narrow one.`,
  },
  discounted: {
    tag: 'CHEAP VS 1σ',
    text: (t) =>
      `Premium is mispriced relative to the projected move. Implied vol is underpricing the expected ${t} range, giving an asymmetric payout if the move materializes.`,
  },
  rebounds: {
    tag: 'FADES THE TAPE',
    text: (t, k, bullish) =>
      bullish
        ? `${t} is oversold near key support at ${k}. Price has compressed into a structure floor where dealer hedging creates a natural bounce zone. Reversal probability is elevated.`
        : `${t} is overbought into key resistance at ${k}. Price has stretched into a structure ceiling where dealer hedging leans against the move. Rejection probability is elevated.`,
  },
  'whale-sweeps': {
    tag: 'SWEEP FOOTPRINT',
    text: (t, k, bullish) =>
      bullish
        ? `Repeated large sweep orders are accumulating ${t} upside exposure near ${k}. Size and persistence of the prints read as informed positioning rather than incidental flow.`
        : `Repeated large sweep orders are stacking ${t} downside protection near ${k}. Size and persistence of the prints read as informed hedging, or an outright short lean.`,
  },
  all: {
    tag: 'UNFILTERED',
    text: (t, k) =>
      `${t} at ${k} qualifies across multiple scanner criteria. Composite scoring aggregates trend alignment, premium value, and flow signals into a single unified ranking.`,
  },
};

// ---- premium / greeks model ----------------------------------------------
/**
 * CALENDAR days for a profile expiry label. The floor that keeps a same-session
 * contract from carrying zero time lives in `yearsToExpiry`, not here — a day
 * count is a day count, and folding a modelling floor into it is how the two
 * engines came to disagree about what a 0DTE is worth.
 */
function dteOf(expiry: string): number {
  const n = parseInt(expiry, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** Intrinsic + normal-shaped time value with a REAL √T term, so a 0DTE
    contract prices cheaper than a 1DTE and OTM decay width scales with vol. */
function estimatePremium(spot: number, strike: number, right: OptionRight, iv: number, dte: number): number {
  const t = yearsToExpiry(dte);
  const width = iv * Math.sqrt(t);
  const m = Math.log(strike / spot) / (width || 1e-6);
  const timeValue = spot * width * 0.4 * Math.exp(-(m * m) / 2);
  const intrinsic = right === 'C' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
  return Math.max(0.05, intrinsic + timeValue);
}

function healthFor(spot: number, strike: number, right: OptionRight): number {
  // Calls: healthier ITM (low strike). Puts: healthier ITM (high strike).
  const moneyness = (strike - spot) / spot; // + above spot
  const base = right === 'C' ? 50 - moneyness * 900 : 50 + moneyness * 900;
  return Math.round(clamp(base, 22, 78));
}

function momentumFromHealth(health: number): Momentum {
  if (health >= 56) return 'STRENGTHENING';
  if (health >= 45) return 'NEUTRAL';
  return 'WEAKENING';
}

function actionFromHealth(health: number): ChainAction {
  if (health >= 56) return 'HOLD';
  if (health >= 45) return 'REDUCE';
  return 'SELL';
}

// ---- opportunity score ----------------------------------------------------
/*
  ONE definition of the score, shared by the cheap prescreen and the full
  builder. The scan ranks ~9,000 candidates per sweep but materialises only the
  few hundred it shows, so the score has to be computable without paying for
  greeks, prose and a take-profit ladder. Keeping the arithmetic here — rather
  than copied into a fast path — is what makes the two provably agree, and
  scanUniverse.test.ts asserts it on a grid.

  It comes in two forms and the difference matters: `rankOf` is the continuous
  quantity everything ORDERS by, `displayScore` is the 8-99 integer a screen
  prints. Rounding is the last step and never an input to a comparison.
*/

/** How hard a contract facing the tape is marked down. */
const COUNTER_TREND_MULT = 0.72;
/*
  Half-width of the per-contract jitter, in score points. It is a tiebreaker
  between names, NOT a ranking signal, and the size is what makes that true: one
  rung of the strike ladder is worth 96*0.6*(RUNG_PCT/PROXIMITY_WINDOW) = 9.6
  points, so a jitter spanning 3 can never lift a strike above the one nearer
  the money. At the ±4 it used to carry it could, and did.
*/
const JITTER_HALF = 1.5;
/*
  Half-width of the per-NAME term, in score points.

  This is what stops the board being a wall of one number. Ranking on moneyness
  alone means the head of a 9,000-contract field is one at-the-money contract per
  name, and every one of those scores 96 or better — measured on the shipped
  board, 240 rows printed TWO distinct scores. That is a ranking nobody can read.

  The term is constant across a name's own strikes, so it cannot reorder that
  name's ladder — the invariant scanRanking.test.ts holds the engine to — but it
  spreads the at-the-money contracts of ~194 different names across a readable
  range. It is derived from things true about the NAME rather than the strike:
  how hard the tape is running, what the vol is worth, and whether the terminal
  can actually open the thing.

  It defaults to 1, i.e. no markdown. Every caller outside the sweep — the
  Weigher's evidence, the Tracker rebuilding a setup a user already carries, the
  landing page's live pick — is grading ONE named contract rather than ranking a
  field, and has no business docking it for a quality it was never asked to
  measure. Only the sweep, which knows each name's own edge, passes one.

  It only ever marks DOWN. A centred ±8 term looks equivalent and is not: the
  base already tops out at 96 and the printed score clamps at 99, so half the
  term was spent pushing contracts past a ceiling that flattened them straight
  back — measured, the board still printed two distinct values. Subtracting from
  the ideal keeps the whole range inside the scale, and it leaves the maximum
  where every floor was calibrated against it.
*/
const NAME_EDGE_SPAN = 8;
/**
 * Ceiling a counter-trend contract's SCORE can reach — an exact bound on the
 * rounded number the floors compare against, used to prune. Preference is capped
 * at 1 on every style, so this bounds all six.
 */
export const COUNTER_TREND_CEILING = displayScore(96 * COUNTER_TREND_MULT + JITTER_HALF);

/**
 * Signed moneyness in window units, oriented toward the trade.
 *
 * Positive is out of the money for the side being bought, negative is in. It has
 * to be SIGNED because that is the axis the styles disagree on: unsigned
 * proximity cannot tell "cheap because it is a stretch" from "expensive because
 * it is already working", and those are opposite trades.
 */
function moneynessU(spot: number, strike: number, right: OptionRight, windowPct: number): number {
  const otm = right === 'C' ? (strike - spot) / spot : (spot - strike) / spot;
  return otm / windowPct;
}

/**
 * How much a style wants a contract at that point on the ladder, 0 to 1.
 *
 * A tent centred on the style's `seek`, falling to zero over its `reach`. Capped
 * at 1 by construction, which is what keeps COUNTER_TREND_CEILING an exact bound
 * rather than an estimate. Top Setups is seek 0 / reach 1 — plain proximity, the
 * neutral ranking the board has always used.
 */
function preference(u: number, profile: ScannerProfile): number {
  return 1 - Math.min(1, Math.abs(u - profile.seek) / profile.reach);
}

/**
 * Strikes size prints on. Blocks land on round numbers, so a sweep screen that
 * ignores the grid is scanning for something that does not print.
 */
function onBlockGrid(strike: number, step: number): boolean {
  /*
    The grid is a multiple of the NAME'S OWN strike step, not an absolute price.

    Absolute tiers (multiples of ten above $200, five above $50) sound right and
    are useless here: the sweep ladder samples nine strikes about 0.5% apart, so
    on a $400 name those are 392 through 408 in twos and exactly one of them is a
    multiple of ten — and only when the rounded spot happens to land there.
    Measured, the whole style admitted 55 contracts against Top Setups' 389,
    because most names had no qualifying strike at all.

    Five steps is round at whatever granularity the name actually lists, so every
    ladder carries two or three of them and the claim on the tab is true on every
    name rather than one in ten.
  */
  const grid = step * 5;
  return Math.abs(strike / grid - Math.round(strike / grid)) < 1e-6;
}

/**
 * The ranking quantity. Continuous on purpose — see displayScore.
 * `jitter01` is the candidate's third RNG draw; `edge01` is the name's own
 * quality, constant across that name's ladder.
 */
function rankOf(
  spot: number,
  strike: number,
  right: OptionRight,
  aligned: boolean,
  jitter01: number,
  profile: ScannerProfile,
  windowPct: number,
  edge01: number,
  step: number
): number {
  const u = moneynessU(spot, strike, right, windowPct);
  let pref = preference(u, profile);
  /* The block penalty has to outweigh a rung of the ladder or it decides
     nothing. At 0.72 the strike one rung nearer the sweet spot still won even
     when it was off the grid, so the board filled with 404s and the tab was a
     lie. At 0.55 the nearest block strike wins, which is the claim the tab makes. */
  if (profile.blockBias && !onBlockGrid(strike, step)) pref *= 0.55;
  return (
    96 * (0.4 + 0.6 * pref) * (aligned ? 1 : COUNTER_TREND_MULT) +
    (edge01 - 1) * NAME_EDGE_SPAN +
    (jitter01 - 0.5) * (JITTER_HALF * 2)
  );
}

/**
 * A name's own quality, 0 to 1 — constant across its ladder, so it separates
 * names without ever reordering one name's strikes.
 *
 * Exported so a test that re-derives the field independently can MIRROR the
 * engine's inputs rather than re-implement them. A test that reimplements the
 * formula stops checking the engine and starts checking its own copy.
 */
export function nameEdge01(name: ScanName): number {
  const trend = clamp(Math.abs(name.changePct) / 2.5, 0, 1); // conviction, either way
  const vol = clamp((name.iv - 0.15) / 0.45, 0, 1); // premium worth paying attention to
  const depth = name.coverage === 'modeled' ? 1 : name.coverage === 'covered' ? 0.55 : 0.2;
  return clamp(0.42 * trend + 0.3 * vol + 0.28 * depth, 0, 1);
}

/**
 * The 8-99 integer a screen shows, and the number the floors are read against.
 * It is far too coarse to ORDER by: above a floor of 84 there are sixteen of
 * these to share between thousands of candidates, so sorting on it sorts a
 * sixteen-way tie and hands the board to whatever breaks that tie. One
 * definition, called once at the end of each path.
 */
function displayScore(rank: number): number {
  return Math.round(clamp(rank, 8, 99));
}

/**
 * The rank a full makeSetup() would produce, without building the setup. Burns
 * the same first three draws off the same seeded stream, so the number is
 * identical rather than merely close.
 */
export function prescreenRank(
  ticker: string,
  spot: number,
  strike: number,
  right: OptionRight,
  scanner: ScannerKey,
  aligned: boolean,
  sleeve: SleeveKey = 'odte',
  edge01 = 1,
  step = 1
): number {
  const rng = mulberry(hash(`${ticker}-${strike}-${right}-${scanner}`));
  rng(); // live mid
  rng(); // health
  return rankOf(
    spot,
    strike,
    right,
    aligned,
    rng(),
    PROFILES[scanner],
    SLEEVE_BY_KEY[sleeve].windowPct,
    edge01,
    step
  );
}

/** The same prescreen, rounded to the score a setup would carry. */
export function prescreenScore(
  ticker: string,
  spot: number,
  strike: number,
  right: OptionRight,
  scanner: ScannerKey,
  aligned: boolean,
  sleeve: SleeveKey = 'odte',
  edge01 = 1,
  step = 1
): number {
  return displayScore(prescreenRank(ticker, spot, strike, right, scanner, aligned, sleeve, edge01, step));
}

// ---- setup builder --------------------------------------------------------
/*
  The ladder a scanned setup carries is a PLAN, and every rung on it is PENDING.

  Nobody entered anything. The scan quotes `mid` off the current spot, so the
  contract is being met at its reference price this instant — there is no fill,
  no position and no elapsed path, and therefore nothing that can have been
  reached. What used to stand here was `progress = rng()`, a hidden draw that
  printed "TP1 · HIT" in green on a third of the board and could not be checked
  against anything on the screen.

  A rung IS reachable, on the surface that can evidence it: SignalMonitor throws
  this status away and takes contractTrack's, which reprices the contract on the
  underlying's real bars and asks whether the path ever touched the rung. That
  is the only derivation entitled to say HIT, and it stays the only one.
*/
function buildTakeProfits(mid: number, profile: ScannerProfile): TakeProfit[] {
  const ladders = [0.3, 0.8, 1.5, 2.5].map(p => p * (0.8 + profile.moveBias * 0.3));
  return ladders.map((pct, i): TakeProfit => ({
    level: i + 1,
    status: 'PENDING',
    expectedPct: Math.round(pct * 100),
    target: Number((mid * (1 + pct)).toFixed(2)),
  }));
}

/**
 * `leanBullish` lets the scan hand in a lean it already knows. Without it the
 * builder reads the ticker's candle buffer, and reading a candle buffer for a
 * name the simulator has never seen registers it — 78ms of session seeding, and
 * a permanent seat in the 1.5s tick loop. Fine for the handful of contracts a
 * user opens; ruinous for a five-hundred-name sweep.
 */
export function makeSetup(
  ticker: string,
  spot: number,
  strike: number,
  right: OptionRight,
  scanner: ScannerKey,
  iv: number,
  leanBullish?: boolean,
  sleeve: SleeveKey = 'odte',
  edge01 = 1,
  step = 1
): Setup {
  const profile = PROFILES[scanner];
  const sleeveDef = SLEEVE_BY_KEY[sleeve];
  const rng = mulberry(hash(`${ticker}-${strike}-${right}-${scanner}`));
  const strikeLabel = strike % 1 === 0 ? strike.toFixed(0) : strike.toFixed(2);
  const contract = `${ticker} ${strikeLabel}${right}`;

  /*
    Two day counts, and they are not interchangeable.

    `sleeveDef.dte` is the HORIZON — what the sleeve asked for, and what the
    board stamps on the row. `dte` below is what the calendar actually resolved
    it to, which differs whenever the nominal target lands on a weekend or a
    holiday: a weekly asked for on Monday 2026-08-31 backs off Labor Day to
    Friday 09/04, four calendar days out rather than seven.

    Anything with time in it prices on the resolved distance, because that is
    how much life the contract on that date really has. buildChain was already
    corrected this way; leaving makeSetup on the nominal bucket meant the setup
    and the chain beside it disagreed about the same contract — which is the
    exact cross-panel split this file's whole coherence suite exists to catch,
    reintroduced by fixing one side of it.
  */
  const horizonDte = sleeveDef.dte;
  const dte = expiryFor(horizonDte).dte;
  const mid = Number(estimatePremium(spot, strike, right, iv, dte).toFixed(2));
  // Spread widens with distance from spot and 0DTE urgency — liquidity is a
  // real variable here, not a constant 3% decoration.
  //
  // The urgency test reads the HORIZON, not the resolved gap: a same-session
  // contract quoted on a Saturday is still a same-session contract, and its
  // book is wide for that reason rather than because Monday is two days away.
  const otmDist = Math.abs(strike - spot) / spot;
  const spreadPctModel = clamp(1.2 + otmDist * 180 + (horizonDte <= 0.5 ? 0.6 : 0), 0.8, 7);
  const spread = Math.max(0.02, mid * (spreadPctModel / 100));
  const bid = Number((mid - spread / 2).toFixed(2));
  const ask = Number((mid + spread / 2).toFixed(2));
  const liveMid = Number((mid * (0.9 + rng() * 0.2)).toFixed(2));

  const health = clamp(healthFor(spot, strike, right) + Math.round((rng() - 0.5) * 12), 5, 99);
  const momentum = momentumFromHealth(health);

  const bullish = leanBullish ?? tickerLean(ticker, scanner);
  const aligned = bullish ? right === 'C' : right === 'P';
  // The setup carries BOTH: the continuous quantity a board orders by and the
  // integer it prints. Rounding stays the last step, so nothing downstream has to
  // re-derive a rank the sweep already computed.
  const rank = rankOf(spot, strike, right, aligned, rng(), profile, sleeveDef.windowPct, edge01, step);
  const score = displayScore(rank);
  // ±1σ expected move of the UNDERLYING over the contract's life — real math
  // (iv·√t), not a decorative random percentage
  const expectedMovePct = Number((iv * Math.sqrt(yearsToExpiry(dte)) * 100).toFixed(1));

  const greeks = Simulator.getGreeks(spot, strike, yearsToExpiry(dte), iv);
  const delta = right === 'C' ? greeks.deltaCall : greeks.deltaPut;
  const verdict: Verdict = score >= 88 ? 'ENTER' : score >= 72 ? 'WATCH' : 'EXIT';

  const why = WHY_LIBRARY[scanner];
  /*
    Evidence, read off THIS contract.

    Every card on the board used to wear the same three chips, because the chips
    were a constant on the scanner rather than a fact about the row — 240 cards
    all saying TREND ALIGNED / DEALER SUPPORT / RSI CONFIRM, which is decoration
    with the shape of information. SetupScanBoard had already dropped the column
    from the table for exactly that reason while the card kept it. These are
    computed, so two rows on one board disagree whenever the contracts do.
  */
  const intrinsic = Math.max(0, right === 'C' ? spot - strike : strike - spot);
  const breakeven = right === 'C' ? strike + mid : strike - mid;
  const beMovePct = ((right === 'C' ? breakeven - spot : spot - breakeven) / spot) * 100;
  const moneyPct = ((right === 'C' ? spot - strike : strike - spot) / spot) * 100;
  const chips: string[] = [
    why.tag,
    moneyPct > 0.15 ? `ITM ${moneyPct.toFixed(1)}%` : moneyPct < -0.15 ? `OTM ${(-moneyPct).toFixed(1)}%` : 'AT THE MONEY',
  ];
  if (beMovePct <= expectedMovePct) chips.push('1σ CLEARS BREAKEVEN');
  if (spreadPctModel <= 2) chips.push('TIGHT BOOK');
  else if (spreadPctModel >= 5) chips.push('WIDE BOOK');
  if (profile.blockBias && onBlockGrid(strike, step)) chips.push('BLOCK STRIKE');
  if (intrinsic <= 0) chips.push('ALL TIME VALUE');
  // Observational headlines only — the engine describes what the signal shows,
  // it never instructs the user to place an order ("enter now" is off-limits).
  // Colon, not an em dash, and it matches the landing page's own rendering of
  // this same headline (pages/landing/LiveSections.tsx) to the character.
  const headline =
    verdict === 'ENTER'
      ? `STRONG ${right === 'C' ? 'CALL' : 'PUT'}: CONDITIONS ALIGNED`
      : verdict === 'WATCH'
        ? 'BUILDING: UNCONFIRMED'
        : 'FADING: LOW CONVICTION';

  // Liquidity: derive from bid/ask spread
  const spreadPct = mid > 0 ? ((ask - bid) / mid) * 100 : 0;
  const liquidityLabel: 'Tight' | 'Normal' | 'Wide' = spreadPct <= 2 ? 'Tight' : spreadPct <= 5 ? 'Normal' : 'Wide';
  const liquiditySpread = `${spreadPct.toFixed(1)}% spread`;

  // Invalidation: nearest support/resistance based on direction
  const invalidationOffset = spot * (0.008 + rng() * 0.012); // 0.8–2% away
  const invalidationPrice = right === 'C'
    ? Number((spot - invalidationOffset).toFixed(2))     // calls invalidate below
    : Number((spot + invalidationOffset).toFixed(2));     // puts invalidate above
  const invalidationReasons = [
    'Dealer buy-wall support',
    'Gamma concentration floor',
    'Dark-pool accumulation level',
    'Key open-interest cluster',
  ];
  const invalidationReason = invalidationReasons[Math.floor(rng() * invalidationReasons.length)];

  return {
    id: `${ticker}-${strikeLabel}-${right}-${scanner}-${sleeve}`,
    ticker,
    contract,
    right,
    strike,
    expiry: sleeveExpiry(sleeve),
    sleeve,
    rank,
    score,
    verdict,
    topRated: score >= 93,
    topOpportunity: score >= 90,
    expectedMovePct,
    swingTarget: { price: Number((mid * (1 + profile.swingMul)).toFixed(2)), pct: Math.round(profile.swingMul * 100) },
    scalpExit: { price: Number((mid * (1 + profile.scalpMul)).toFixed(2)), pct: Math.round(profile.scalpMul * 100) },
    headline,
    whyChips: chips,
    whyText: why.text(ticker, strike, right === 'C'),
    greeks: {
      delta: Number(delta.toFixed(2)),
      gamma: Number(greeks.gamma.toFixed(4)),
      theta: Number((-(mid - Math.max(right === 'C' ? spot - strike : strike - spot, 0)) / (2 * Math.max(0.5, dte))).toFixed(2)),
      vega: Number(greeks.vega.toFixed(2)),
      iv: Number((iv * 100).toFixed(1)),
    },
    bid,
    ask,
    mid,
    liveMid,
    confidence: Math.round(clamp((score - 55) * 2.1, 5, 98)),
    health,
    momentum,
    takeProfits: buildTakeProfits(mid, profile),
    liquidityLabel,
    liquiditySpread,
    invalidationPrice,
    invalidationReason,
  };
}

// ---- feed / groups --------------------------------------------------------

/** Directional lean per ticker+scanner, read from the ACTUAL tape — hour
    momentum plus day direction — so "TREND ALIGNED" means what it says.
    Mean-reversion scanners (rebounds) fade the trend instead of following it. */
function tickerLean(ticker: string, scanner: ScannerKey): boolean {
  const candles = Simulator.getCandles(ticker) ?? [];
  const n = candles.length;
  if (n < 120) return true;
  const last = candles[n - 1].close;
  const hourAgo = candles[n - 61].close;
  const dayAgo = candles[Math.max(0, n - 391)].close;
  const up = last - hourAgo + 0.5 * (last - dayAgo) >= 0;
  return scanner === 'rebounds' ? !up : up;
}

/** Same read for a scan-universe name, off its own session path — no candle
    buffer, so no simulator registration. Rebounds still fade the trend. */
function scanLean(name: ScanName, scanner: ScannerKey): boolean {
  const up = name.live ? tickerLean(name.ticker, 'top-setups') : name.trendUp;
  return scanner === 'rebounds' ? !up : up;
}

/** Bars in one session — the span both sparkline sources cover, so a live name
    and a scanned one are showing the same window of time. */
const SESSION_BARS = 390;

/** A live name's group traces its ACTUAL bars, so the feed's sparkline and the
    chart the user opens next are the same session. Only a handful of names are
    live, so reading the buffer costs nothing at sweep scale. */
function liveSparkline(ticker: string, spot: number, points = 24): number[] {
  const candles = Simulator.getCandles(ticker) ?? [];
  if (candles.length < SESSION_BARS) return [];
  const stride = Math.floor(SESSION_BARS / points);
  const out: number[] = new Array(points + 1);
  for (let i = 0; i < points; i++) out[i] = candles[candles.length - 1 - (points - i) * stride].close;
  out[points] = spot;
  return out;
}

/*
  ---- the sweep ------------------------------------------------------------
  Strikes either side of spot on BOTH rights, so a bearish tape can still
  surface a call and the ranking is a real choice rather than a formality.
  Nine strikes x two rights x the scan universe is the field; what the screen
  shows is the top of it.
*/
const STRIKE_RUNGS = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
const RIGHTS: OptionRight[] = ['C', 'P'];

/**
 * One rung of the ladder, as a fraction of spot. It has to be a PERCENTAGE
 * because the score reads moneyness as one: proximity is measured over
 * spot*0.03, so a ladder counted in strike steps is a different ladder on every
 * name. The field spans $7.80 to $3,862 (data/universe.ts) on a $1 grid above
 * $100 and $0.50 below, and with the old ±4 steps that meant a $600 name's nine
 * strikes all landed inside 0.7% of spot — every one of them at the money by
 * the score's reckoning, every one of them 96+, the whole board back at 99 —
 * while a $40 name's second strike was already outside the window. The ladder,
 * not the market, was deciding which names could compete.
 */
const RUNG_PCT = 0.005;

/**
 * The strike grid a name is swept on: nine rungs of ~0.5% of spot each, snapped
 * to the name's own step and never finer than it, so two rungs cannot collide
 * on one strike. Where the grid is coarser than the rung the ladder is grid
 * limited, and that is the market and not the model: 3% of a $7.80 name is 23
 * cents, less than half a strike step, so it genuinely has one strike inside
 * the window and its at-the-money contract genuinely sits further from the
 * money than a $600 name's. The score marks it down for the grid it trades on,
 * which is a real handicap and not an arithmetic one.
 */
export function strikeLadder(spot: number, step: number, rungPct: number = RUNG_PCT): number[] {
  const rung = Math.max(1, Math.round((spot * rungPct) / step));
  const atm = Math.round(spot / step);
  return STRIKE_RUNGS.map(k => (atm + k * rung) * step);
}

/** Candidates per name per sweep. */
export const CANDIDATES_PER_NAME = STRIKE_RUNGS.length * RIGHTS.length;

/*
  How much of the ranking reaches the DOM. ONE cap, on rows, because the board
  is the global top-N and nothing else: there is no per-ticker quota and no
  group quota, so a contract is on the screen if and only if nothing outside
  beats it.

  There used to be both (8 per ticker, 40 tickers). They recreated the exact
  defect the note on buildFeed says was fixed — the honest top-240 spreads over
  most of the field, so a quota of forty names admitted one name's fourth-best
  contract while discarding better ones on the hundred-odd names it had no room
  for. Measured on the shipped field: top-setups filled 103 of its 240-row cap,
  and 312 contracts that outranked rows ON the board were never admitted.

  Nothing replaces them, because nothing needs to. A name cannot own the board:
  it has CANDIDATES_PER_NAME contracts in the entire field, so its ceiling is 18
  of 240 rows and the arithmetic caps it, not a policy. Groups cost one
  closed-form sparkline each and the card view is a flat ranked list, so the
  group count was never the expensive axis it was described as.

  How much depth a name gets is then arithmetic too, and worth knowing because
  it is a consequence rather than a choice. A name's best contract is its
  at-the-money one and its second is a full rung — 9.6 score points — behind, so
  depth per name only exists while the field is narrower than the cap. Today it
  is: 194 names for 240 rows, which lands at one to three contracts a name. Take
  the field past the cap and the head of the ranking becomes one at-the-money
  contract per name, which is what ranking on moneyness means rather than a
  regression. Per-name depth is the contract chain's job, not the board's.
*/
const DISPLAY_CAP = 240;

interface Candidate {
  name: ScanName;
  strike: number;
  right: OptionRight;
  /** Ranking value — continuous, the number the sweep sorts on */
  rank: number;
  /** The 8-99 integer the setup will carry, and what the floor is read against */
  score: number;
  /** The scanner's read on the name — carried so stage two need not re-derive it */
  leanBullish: boolean;
  /** The name's own quality, carried for the same reason */
  edge01: number;
}

interface Feed {
  groups: SetupGroup[];
  /** Candidates that cleared the scanner's floor across the whole field */
  totalFound: number;
  /** Setups actually materialised for the screen */
  shown: number;
}

/**
 * Rank the field, then build only what shows.
 *
 * Stage one prices nothing: it burns three RNG draws per candidate and keeps
 * the rank. Stage two builds full Setups — greeks, prose, take-profit ladder —
 * for the few hundred that survive a single GLOBAL sort, with no quota of any
 * kind between the sort and the screen. The board IS the top of the ranking:
 * every contract on it beats every contract off it, and scanRanking.test.ts
 * re-derives the field independently to hold that line.
 */
function buildFeed(
  scanner: ScannerKey,
  sleeve: SleeveKey,
  activeTicker: string,
  epoch: number,
  size: number
): Feed {
  const floor = PROFILES[scanner].scoreFloor;
  const { rungPct } = SLEEVE_BY_KEY[sleeve];
  const universe = buildScanUniverse(epoch, size);
  // Whatever the user is looking at is always in the field, even when it sits
  // outside the ranked pool.
  const names = universe.some(n => n.ticker === activeTicker)
    ? universe
    : [scanNameFor(activeTicker, epoch), ...universe];

  // A contract facing the tape cannot beat this, ever — so when the floor sits
  // above it, the whole counter-trend half of the field is skipped rather than
  // scored and discarded. Exact bound, not a heuristic.
  const skipCounterTrend = COUNTER_TREND_CEILING < floor;

  const survivors: Candidate[] = [];
  for (const name of names) {
    const bullish = scanLean(name, scanner);
    const edge01 = nameEdge01(name);
    const ladder = strikeLadder(name.spot, name.step, rungPct);
    for (const right of RIGHTS) {
      const aligned = bullish ? right === 'C' : right === 'P';
      if (!aligned && skipCounterTrend) continue;
      for (const strike of ladder) {
        const rank = prescreenRank(name.ticker, name.spot, strike, right, scanner, aligned, sleeve, edge01, name.step);
        // The floor is a bar on the number the user will see, so it is read
        // against the rounded score; the ordering is not.
        const score = displayScore(rank);
        if (score >= floor) survivors.push({ name, strike, right, rank, score, leanBullish: bullish, edge01 });
      }
    }
  }

  /*
    One global sort — the whole point. It runs on `rank`, not `score`: the score
    is an integer between the floor and 99, so it holds at most sixteen values
    for the hundreds or thousands of candidates that clear a floor, and sorting
    on it is sorting a sixteen-way tie. Whatever breaks that tie is what really
    ranks the board, and the old tiebreak was the ticker name — measured, 96% of
    adjacent rows came back in ascending alphabetical order.

    The ticker is now out of the comparator entirely. Below rank it falls to
    moneyness, then to the strike and the right, none of which is spelling; two
    candidates that tie on all four keep the field's own order, which is seeded
    (see core/scanUniverse.ts) rather than alphabetical.
  */
  survivors.sort(
    (a, b) =>
      b.rank - a.rank ||
      Math.abs(a.strike - a.name.spot) / a.name.spot - Math.abs(b.strike - b.name.spot) / b.name.spot ||
      a.strike - b.strike ||
      (a.right < b.right ? -1 : a.right > b.right ? 1 : 0)
  );

  // Admit straight down the ranking, and stop at the row cap. A ticker enters
  // `admitted` the first time one of its contracts is admitted, so the Map's
  // insertion order IS the ranking — strongest name first, no second sort.
  const shown = Math.min(DISPLAY_CAP, survivors.length);
  const admitted = new Map<string, Candidate[]>();
  for (let i = 0; i < shown; i++) {
    const c = survivors[i];
    const bucket = admitted.get(c.name.ticker);
    if (bucket) bucket.push(c);
    else admitted.set(c.name.ticker, [c]);
  }

  // Setups are built on first read, not on admission. Five of the six builds a
  // sweep runs exist only to put a number on a scanner tab — they count groups
  // and never open one, so materialising 240 contracts for each of them would
  // be 5/6ths of the work thrown away. Rank is already known from stage one, so
  // the sort below costs nothing either.
  const groups: SetupGroup[] = [];
  for (const [ticker, bucket] of admitted) {
    const { name } = bucket[0];
    let built: Setup[] | null = null;
    const live = name.live ? liveSparkline(ticker, name.spot) : [];
    const sparkline = live.length ? live : scanSparkline(ticker, name.spot, epoch);
    // The feed tints the sparkline by changePct, so the number has to be the
    // line's own slope — otherwise a rising line can print red.
    const changePct = ((sparkline[sparkline.length - 1] - sparkline[0]) / sparkline[0]) * 100;
    groups.push({
      ticker,
      spot: name.spot,
      sparkline,
      // `+ 0` is load-bearing: Number((-0.002).toFixed(2)) is NEGATIVE zero, so a
      // group whose move rounds away publishes a signed flat — `>= 0` yet not
      // `Object.is` 0. Rounding a sub-cent move to flat is fine; carrying the
      // sign of a move that no longer exists is not.
      changePct: Number(changePct.toFixed(2)) + 0,
      found: bucket.length,
      get setups(): Setup[] {
        return (built ??= bucket.map(c =>
          makeSetup(ticker, name.spot, c.strike, c.right, scanner, name.iv, c.leanBullish, sleeve, c.edge01, name.step)
        ));
      },
    });
  }
  return { groups, totalFound: survivors.length, shown };
}

// One sweep drives six scanner builds (the active pane plus five tab counts),
// and Compass re-enters every tick for the contract chain. Keyed on the epoch,
// so the repeats are free and the field is identical across all six.
const feedCache = new Map<string, Feed>();
const FEED_CACHE_MAX = 24;

function cachedFeed(
  scanner: ScannerKey,
  sleeve: SleeveKey,
  activeTicker: string,
  epoch: number,
  size: number
): Feed {
  const key = `${scanner}|${sleeve}|${activeTicker}|${epoch}|${size}`;
  const hit = feedCache.get(key);
  if (hit) return hit;
  const built = buildFeed(scanner, sleeve, activeTicker, epoch, size);
  if (feedCache.size >= FEED_CACHE_MAX) feedCache.delete(feedCache.keys().next().value as string);
  feedCache.set(key, built);
  return built;
}

/** Drops the memoised sweeps. Tests use it to measure a cold build. */
export function resetCompassCache(): void {
  feedCache.clear();
}

// ---- contract chain -------------------------------------------------------
/*
  The chain prices the expiry the BOARD is on.

  It used to hardcode `1` here regardless of the preset, so on the four
  same-session presets the ladder beside the monitor quoted next-day premiums:
  measured on BAC 41.50P, the monitor header read $0.16 and the chain cell for
  the identical contract read $0.47, at the same instant, on one screen. The
  chain is the strike-PICKING instrument — every comparison a user makes on it
  was against the wrong clock, and clicking a strike then repriced it on the
  board's clock, so the number moved on the click with nothing to explain it.

  `buildImpact` was already handed the preset's expiry. The chain was simply
  missed. It takes the same source now, and `ContractChain.expiry` carries the
  stamp out so the panel can say which session it is quoting.

  It also carries EVERY listed strike rather than a twelve-row window. Six rungs
  either side is a fine default and a useless instrument: the whole reason to put
  a chain on the screen is that the user picks the strike, and six rungs of a
  large-cap's grid is a fraction of a percent of spot. The simulator lists 31
  strikes a name; all 31 are here, the panel scrolls, and `atmIndex` is what lets
  it open at the money without re-deriving where spot sits.
*/
/**
 * One side of one strike. Split out because the chain now carries real depth —
 * a book, a delta and an implied vol per side rather than a premium and a mood.
 */
function chainSide(
  ticker: string,
  spot: number,
  node: { strike: number; callOI: OpenInterest; putOI: OpenInterest },
  right: OptionRight,
  iv: number,
  dte: number
): ChainSide {
  const { strike } = node;
  const health = healthFor(spot, strike, right);
  const rng = mulberry(hash(`${ticker}-${strike}-${right}-chain`));
  const premium = Number(estimatePremium(spot, strike, right, iv, dte).toFixed(2));
  const greeks = Simulator.getGreeks(spot, strike, yearsToExpiry(dte), iv);
  const delta = right === 'C' ? greeks.deltaCall : greeks.deltaPut;
  const otmDist = Math.abs(strike - spot) / spot;
  const spreadPct = clamp(1.2 + otmDist * 180 + 0.6, 0.8, 12);
  const half = Math.max(0.01, (premium * spreadPct) / 200);
  const oi = (right === 'C' ? node.callOI : node.putOI).value;
  // Skew: the wings are bid for, so they carry more implied than the money does.
  const sideIv = iv * (1 + otmDist * 1.6);
  return {
    premium,
    bid: Number(Math.max(0.01, premium - half).toFixed(2)),
    ask: Number((premium + half).toFixed(2)),
    // Centred noise so OTM strikes can print red — a change column that can
    // never go negative reads fake.
    changePct: Math.round(
      clamp((((right === 'C' ? spot - strike : strike - spot) / spot) * 800) + (rng() - 0.35) * 30, -60, 130)
    ),
    delta: Number(delta.toFixed(2)),
    ivPct: Number((sideIv * 100).toFixed(1)),
    volume: Math.round(oi * (0.18 + rng() * 0.5)),
    openInterest: oi,
    itm: right === 'C' ? strike < spot : strike > spot,
    health,
    momentum: momentumFromHealth(health),
    action: actionFromHealth(health),
  };
}

function buildChain(snapshot: MarketSnapshot, iv: number, expiry: string): ContractChain {
  const { ticker, spot, chain } = snapshot;
  /*
    The RESOLVED expiry's calendar distance, not the bucket number.

    A 1DTE preset viewed on a Friday resolves to Monday — three calendar days —
    but `dteOf` reads the label and returns 1, so every premium in a chain
    stamped with Monday's date was priced with one day of life in it.
    estimatePremium consumes calendar days through yearsToExpiry, so the number
    handed to it has to be the one the date actually implies.
  */
  const dte = expiryFor(dteOf(expiry)).dte;
  const sorted = [...chain].sort((a, b) => a.strike - b.strike);

  const rows: ChainRow[] = sorted.map(node => ({
    strike: node.strike,
    call: chainSide(ticker, spot, node, 'C', iv, dte),
    put: chainSide(ticker, spot, node, 'P', iv, dte),
  }));

  const found = rows.findIndex(r => r.strike >= spot);
  return {
    ticker,
    spot,
    rows,
    atmIndex: found === -1 ? Math.max(0, rows.length - 1) : found,
    expiry,
  };
}

// ---- impact leaderboard ---------------------------------------------------
/*
  The WHOLE field, ranked by gamma as a default. The leaderboard slices it.

  This used to sort by gamma and slice to eight here, and the panel then offered
  four "rank by" metrics over those eight — so Volume, Notional and Open Int all
  showed the largest-by-GAMMA contracts in a different order, which is not the
  question any of those three controls asks. The engine hands over the field and
  the panel picks its own top eight, which is the only way a metric switch can
  mean what it says.

  Delta notional is a REAL delta now. It was `oi * 100 * spot * 0.5` — a flat
  half-delta on every strike and both sides — so with spot constant across rows
  it was a monotone transform of open interest, and the two columns could never
  disagree about a ranking. A column headed DEX has to be exposure rather than
  open interest in different units.
*/
function buildImpact(snapshot: MarketSnapshot, expiry: string): ImpactRow[] {
  const { ticker, spot, chain } = snapshot;
  const iv = Simulator.TICKERS[ticker]?.iv ?? 0.2;
  const t = yearsToExpiry(dteOf(expiry));
  const totalGamma = chain.reduce((a, n) => a + Math.abs(n.netGex), 0) || 1;
  const rows = chain.flatMap(node => {
    const greeks = Simulator.getGreeks(spot, node.strike, t, iv);
    const mk = (right: OptionRight, oi: number, gammaScale: number): Omit<ImpactRow, 'rank'> => {
      const delta = right === 'C' ? greeks.deltaCall : greeks.deltaPut;
      return {
        contract: `${ticker} ${node.strike % 1 === 0 ? node.strike.toFixed(0) : node.strike.toFixed(2)}${right}`,
        expiry,
        openInterest: oi,
        volume: Math.round(oi * (0.3 + (hash(`${node.strike}${right}`) % 50) / 100)),
        // $B of underlying the book is effectively long or short through this
        // contract: |delta| × shares × spot.
        deltaNotional: Number(((Math.abs(delta) * oi * 100 * spot) / 1e9).toFixed(2)),
        gamma: Number(((Math.abs(node.netGex) / totalGamma) * 100 * gammaScale).toFixed(1)),
      };
    };
    return [mk('C', node.callOI.value, 0.45), mk('P', node.putOI.value, 0.38)];
  });
  return rows.sort((a, b) => b.gamma - a.gamma).map((r, i) => ({ ...r, rank: i + 1 }));
}

// ---- top-level assembly ---------------------------------------------------

/** Pins the sweep to a fixed epoch. Tests use it; the app leaves it alone. */
export interface CompassOptions {
  epoch?: number;
  universeSize?: number;
  /** Horizon to sweep. Defaults to same-session, the desk's landing sleeve. */
  sleeve?: SleeveKey;
}

/**
 * The feed is behind a getter on purpose. Compass rebuilds this object every
 * 1.5s purely to read `.chain` — the contract chain is meant to breathe with
 * price — and paying for a five-hundred-name sweep to reach a twelve-row
 * ladder would put the scan on the render path. Touch `.groups` and you get
 * the sweep; touch `.chain` and you get the chain.
 */
export function buildCompass(
  snapshot: MarketSnapshot,
  scanner: ScannerKey,
  options: CompassOptions = {}
): CompassData {
  const epoch = options.epoch ?? scanEpoch();
  const size = options.universeSize ?? SCAN_UNIVERSE_SIZE;
  const sleeve = options.sleeve ?? 'odte';
  const activeIv = Simulator.TICKERS[snapshot.ticker]?.iv ?? 0.2;
  const feed = () => cachedFeed(scanner, sleeve, snapshot.ticker, epoch, size);

  return {
    scanner,
    sleeve,
    get groups() {
      return feed().groups;
    },
    /** Everything the scanner's floor let through, across the whole field. */
    get totalFound() {
      return feed().totalFound;
    },
    /** What the caps let onto the screen. */
    get shown() {
      return feed().shown;
    },
    chain: buildChain(snapshot, activeIv, sleeveExpiry(sleeve)),
    impact: buildImpact(snapshot, sleeveExpiry(sleeve)),
  };
}
