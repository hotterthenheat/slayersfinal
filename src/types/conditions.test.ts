import { describe, it, expect } from 'vitest';
import {
  TRADE_CONDITION,
  MULTI_LEG_CODES,
  STOCK_OPTION_CODES,
  isSweep,
  isBlock,
  isMultiLeg,
  isDeltaHedged,
  isLateReport,
  isOddLot,
  isClosingPrint,
  isExtendedHours,
  aggressorSide,
} from './conditions';

/**
 * Trade-condition predicates. The codes are exchange facts, so the point of
 * these tests is that each predicate reads exactly the codes it claims and
 * nothing adjacent — and that an absent/empty array is a clean "no", never a
 * throw, because most simulator prints will not carry every flag.
 */
describe('trade-condition predicates', () => {
  it('are all null-safe on missing / empty input', () => {
    for (const p of [
      isSweep,
      isBlock,
      isMultiLeg,
      isDeltaHedged,
      isLateReport,
      isOddLot,
      isClosingPrint,
      isExtendedHours,
    ]) {
      expect(p(undefined)).toBe(false);
      expect(p(null)).toBe(false);
      expect(p([])).toBe(false);
    }
    expect(aggressorSide(undefined)).toBeNull();
    expect(aggressorSide(null)).toBeNull();
    expect(aggressorSide([])).toBeNull();
  });

  it('isSweep reads only 95', () => {
    expect(isSweep([TRADE_CONDITION.INTERMARKET_SWEEP])).toBe(true);
    expect(isSweep([146, 130])).toBe(false);
  });

  it('isBlock reads 75, 14 and 29', () => {
    expect(isBlock([TRADE_CONDITION.BLOCK_TRADE])).toBe(true);
    expect(isBlock([TRADE_CONDITION.RULE_127])).toBe(true);
    expect(isBlock([TRADE_CONDITION.RULE_155])).toBe(true);
    expect(isBlock([59])).toBe(false);
  });

  it('isMultiLeg reads the 130-134 family and not the stock-option family', () => {
    for (const c of MULTI_LEG_CODES) expect(isMultiLeg([c])).toBe(true);
    for (const c of STOCK_OPTION_CODES) expect(isMultiLeg([c])).toBe(false);
  });

  it('isDeltaHedged reads 124 and the 135-143 family', () => {
    expect(isDeltaHedged([TRADE_CONDITION.QUALIFIED_CONTINGENT_TRADE])).toBe(true);
    for (const c of STOCK_OPTION_CODES) expect(isDeltaHedged([c])).toBe(true);
    for (const c of MULTI_LEG_CODES) expect(isDeltaHedged([c])).toBe(false);
  });

  it('multi-leg and delta-hedged partition cleanly, and 144 is in neither (boundary is unconfirmed)', () => {
    // The clean-flow contract (P4.2) excludes 130-134 and 124/135-143 from
    // directional premium. 144 must not silently fall into either bucket.
    expect(isMultiLeg([144])).toBe(false);
    expect(isDeltaHedged([144])).toBe(false);
    // No overlap between the two families.
    for (const c of MULTI_LEG_CODES) expect(STOCK_OPTION_CODES.includes(c)).toBe(false);
  });

  it('isLateReport reads 2, 8 and 13', () => {
    expect(isLateReport([TRADE_CONDITION.OUT_OF_SEQ])).toBe(true);
    expect(isLateReport([TRADE_CONDITION.PRIOR_REFERENCE_PRICE])).toBe(true);
    expect(isLateReport([TRADE_CONDITION.SOLD_LAST])).toBe(true);
    expect(isLateReport([75])).toBe(false);
  });

  it('isOddLot reads only 115', () => {
    expect(isOddLot([TRADE_CONDITION.ODD_LOT])).toBe(true);
    expect(isOddLot([114, 116])).toBe(false);
  });

  it('isClosingPrint reads 51, 63, 98 and 28', () => {
    expect(isClosingPrint([TRADE_CONDITION.MC_OFFICIAL_CLOSE])).toBe(true);
    expect(isClosingPrint([TRADE_CONDITION.MARKET_ON_CLOSE])).toBe(true);
    expect(isClosingPrint([TRADE_CONDITION.CLOSING])).toBe(true);
    expect(isClosingPrint([TRADE_CONDITION.BASKET_ON_CLOSE])).toBe(true);
    expect(isClosingPrint([59])).toBe(false);
  });

  it('isExtendedHours reads 118 and 148', () => {
    expect(isExtendedHours([118])).toBe(true);
    expect(isExtendedHours([148])).toBe(true);
    expect(isExtendedHours([95])).toBe(false);
  });

  it('aggressorSide maps 145->BID, 146->ASK, else null', () => {
    expect(aggressorSide([TRADE_CONDITION.BID_AGGRESSOR])).toBe('BID');
    expect(aggressorSide([TRADE_CONDITION.ASK_AGGRESSOR])).toBe('ASK');
    expect(aggressorSide([95, 130])).toBeNull();
    // A print with a real code alongside the aggressor still resolves the side.
    expect(aggressorSide([95, TRADE_CONDITION.ASK_AGGRESSOR])).toBe('ASK');
  });
});
