/*
==================================================
  SLAYER TERMINAL - TRADE CONDITION CODES (conditions.ts)  [P0.2]
  OPRA (options) and CTA/UTP (equity) trade condition codes, as a first-class
  type. These codes are facts stamped by the exchange, not inferences — the
  aggressor (145/146), the ISO sweep flag (95), the multi-leg and delta-hedged
  families — and nothing in the type system represented them until now.

  This module is the single place the platform reads condition codes; call
  sites use the named predicates below so intent reads as intent rather than as
  magic numbers. Pure module: no imports from src/data or src/components, and no
  consumer is wired here — that is P3.1 (simulator emits them) and P4.2 (clean
  flow consumes them).

  Source: ThetaData `trade` condition array (OPRA option + CTA/UTP equity tables,
  see docs/SLAYER-DATA-MAP.md §4.3 / BUILD-INVENTORY §1.4).

  A note on honesty: where the source tables give an unambiguous name for a
  single code, it is named below. Where they describe a *family* over a range
  (single-leg mechanism 125-129; multi-leg / stock-option 130-144) without a
  verified per-code name, the range is modelled as a constant rather than
  inventing a specific label per number. Any per-code display name must be
  confirmed against ThetaData's published condition table before it is shown.
==================================================
*/

/**
 * Individually-named condition codes the platform branches on. Values are the
 * raw integers carried in ThetaData's `trade` condition array.
 */
export const TRADE_CONDITION = {
  // --- Late-report family (equity + option) — why a print lands away from spot
  /** Reported out of time sequence. */
  OUT_OF_SEQ: 2,
  /** Printed at a price referenced to an earlier time. */
  PRIOR_REFERENCE_PRICE: 8,
  /** Sold last — a late-reported sale. */
  SOLD_LAST: 13,

  // --- Block / cross / VWAP family (equity)
  /** NYSE Rule 127 block. */
  RULE_127: 14,
  /** NYSE Rule 155 block. */
  RULE_155: 29,
  /** Cross / crossing-session print. */
  MATCH_CROSS: 45,
  /** Volume-weighted average price (algo schedule execution). */
  VWAP: 59,
  /** Block trade. */
  BLOCK_TRADE: 75,

  // --- Structure tags straight off the tape (option)
  SPREAD: 35,
  STRADDLE: 36,
  BUY_WRITE: 37,
  COMBO: 38,

  // --- Mechanism / pricing
  /** Position liquidation at a half-tick (option). */
  CABINET: 48,
  /** Intermarket sweep order — a real ISO flag, not a volume heuristic. */
  INTERMARKET_SWEEP: 95,
  /** Derivatively priced. */
  DERIVATIVELY_PRICED: 96,
  /** Retail-participation proxy (equity). */
  ODD_LOT: 115,
  /** Contingent, hedged, non-directional (option). */
  QUALIFIED_CONTINGENT_TRADE: 124,

  // --- Exchange-reported aggressor (option) — stop inferring side from fill
  /** The aggressor traded against the bid (seller-initiated). */
  BID_AGGRESSOR: 145,
  /** The aggressor lifted the ask (buyer-initiated). */
  ASK_AGGRESSOR: 146,

  // --- Closing family (equity)
  /** Basket on close. */
  BASKET_ON_CLOSE: 28,
  /** Market-center official close. */
  MC_OFFICIAL_CLOSE: 51,
  /** Market on close. */
  MARKET_ON_CLOSE: 63,
  /** Closing print. */
  CLOSING: 98,
} as const;

export type TradeConditionName = keyof typeof TRADE_CONDITION;
export type TradeConditionCode = (typeof TRADE_CONDITION)[TradeConditionName];

/**
 * Single-leg execution mechanism (option): auction / cross / floor, ISO and
 * non-ISO. Modelled as a range because the source describes the family, not a
 * verified name per code.
 */
export const SINGLE_LEG_MECHANISM_CODES: readonly number[] = [125, 126, 127, 128, 129];

/**
 * MULTI_LEG_* family (option): the print is a leg of a multi-leg order — a
 * spread leg, zero standalone directional content. Boundary chosen to match the
 * clean-flow contract (P4.2): directional flow excludes 130-134.
 */
export const MULTI_LEG_CODES: readonly number[] = [130, 131, 132, 133, 134];

/**
 * STOCK_OPTIONS_* family (option): the option traded WITH a stock leg —
 * delta-hedged, zero directional content. Boundary (135-143) matches the
 * clean-flow contract (P4.2): directional flow excludes 124 and 135-143.
 *
 * NOTE: OPRA code 144 sits at the documented MULTI_LEG / STOCK_OPTIONS boundary
 * and our sources disagree on which family it belongs to. It is deliberately
 * excluded from both ranges here rather than guessed; confirm against
 * ThetaData's published condition table before relying on it.
 */
export const STOCK_OPTION_CODES: readonly number[] = [135, 136, 137, 138, 139, 140, 141, 142, 143];

/** Late-report codes. */
export const LATE_REPORT_CODES: readonly number[] = [
  TRADE_CONDITION.OUT_OF_SEQ,
  TRADE_CONDITION.PRIOR_REFERENCE_PRICE,
  TRADE_CONDITION.SOLD_LAST,
];

/** Block codes. */
export const BLOCK_CODES: readonly number[] = [
  TRADE_CONDITION.BLOCK_TRADE,
  TRADE_CONDITION.RULE_127,
  TRADE_CONDITION.RULE_155,
];

/** Closing-auction family codes. */
export const CLOSING_CODES: readonly number[] = [
  TRADE_CONDITION.MC_OFFICIAL_CLOSE,
  TRADE_CONDITION.MARKET_ON_CLOSE,
  TRADE_CONDITION.CLOSING,
  TRADE_CONDITION.BASKET_ON_CLOSE,
];

/** Extended-hours session codes (GTH prints separable from RTH). */
export const EXTENDED_HOURS_CODES: readonly number[] = [118, 148];

// ---- Predicates ------------------------------------------------------------
// Every predicate is null-safe: an absent or empty condition array reads as
// "no such flag", never as a throw. Call sites pass FlowPrint.conditions
// (optional) directly.

type Codes = readonly number[] | null | undefined;

const has = (codes: Codes, code: number): boolean =>
  Array.isArray(codes) && codes.includes(code);

const hasAny = (codes: Codes, set: readonly number[]): boolean =>
  Array.isArray(codes) && codes.some((c) => set.includes(c));

/** Intermarket sweep (95). A real ISO flag. */
export const isSweep = (codes: Codes): boolean => has(codes, TRADE_CONDITION.INTERMARKET_SWEEP);

/** Block print: block trade (75), Rule 127 (14) or Rule 155 (29). */
export const isBlock = (codes: Codes): boolean => hasAny(codes, BLOCK_CODES);

/** Leg of a multi-leg order (130-134) — a spread leg, not a directional bet. */
export const isMultiLeg = (codes: Codes): boolean => hasAny(codes, MULTI_LEG_CODES);

/** Delta-hedged: qualified contingent (124) or stock+option (135-143). */
export const isDeltaHedged = (codes: Codes): boolean =>
  has(codes, TRADE_CONDITION.QUALIFIED_CONTINGENT_TRADE) || hasAny(codes, STOCK_OPTION_CODES);

/**
 * Directional flow: a single-leg, un-hedged print — a standalone bet on
 * direction. NOT a multi-leg leg (130-134) and NOT delta-hedged (124, 135-143),
 * both of which carry zero standalone directional content. This is the P4.2
 * clean-flow contract: only directional prints feed the bull/bear read. An
 * untagged print (no conditions) is directional by default.
 */
export const isDirectional = (codes: Codes): boolean =>
  !isMultiLeg(codes) && !isDeltaHedged(codes);

/** Late report: out-of-sequence (2), prior-reference (8) or sold-last (13). */
export const isLateReport = (codes: Codes): boolean => hasAny(codes, LATE_REPORT_CODES);

/** Odd lot (115) — retail-participation proxy. */
export const isOddLot = (codes: Codes): boolean => has(codes, TRADE_CONDITION.ODD_LOT);

/** Closing-auction print: MC official close (51), MOC (63), closing (98) or basket-on-close (28). */
export const isClosingPrint = (codes: Codes): boolean => hasAny(codes, CLOSING_CODES);

/** Extended-hours (GTH) print (118 / 148). */
export const isExtendedHours = (codes: Codes): boolean => hasAny(codes, EXTENDED_HOURS_CODES);

/**
 * Exchange-reported aggressor side.
 *   145 BID_AGGRESSOR -> 'BID'   (aggressor traded against the bid; seller-initiated)
 *   146 ASK_AGGRESSOR -> 'ASK'   (aggressor lifted the ask; buyer-initiated)
 *   neither present    -> null   (no exchange aggressor stamp on this print)
 * This replaces fill-vs-mid side inference. It reports the exchange fact only;
 * the dealer sign convention that consumes it lives at the consumer (P4.1/P4.3),
 * not here.
 */
export const aggressorSide = (codes: Codes): 'BID' | 'ASK' | null => {
  if (has(codes, TRADE_CONDITION.BID_AGGRESSOR)) return 'BID';
  if (has(codes, TRADE_CONDITION.ASK_AGGRESSOR)) return 'ASK';
  return null;
};
