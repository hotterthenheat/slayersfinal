import type { StrikeNode } from '../types/market';

/*
==================================================
  SLAYER TERMINAL - READ THE STRUCTURE OFF A CHAIN (core/chainStructure.ts)

  Net gamma, the flip, the two walls and the gamma centre — derived from a chain
  and a spot, and from nothing else.

  WHY IT IS ITS OWN MODULE. This arithmetic lived inside the simulator's
  `generateTradePlan`, where it could only ever be applied to the one chain the
  simulator was building. The expiry-dependency engine has to apply it to a chain
  with an expiry taken out, and the ONLY way that comparison means anything is if
  both sides are read by the same function. A second copy — however careful —
  turns "0DTE holds a third of the structure" into a measurement of the
  difference between two implementations.

  So it moved here, `generateTradePlan` calls it, and the removal engine calls
  it. A change to how a wall is found changes both readings at once, which is the
  only way the difference between them stays a fact about the book.
==================================================
*/

export interface ChainStructure {
  /** Net dealer gamma across the whole chain, signed dollars. */
  netGex: number;
  /** First upward zero-crossing of the smoothed profile. */
  flip: number;
  /** Largest |net gamma| strike above spot. */
  callWall: number;
  /** Largest |net gamma| strike below spot. */
  putWall: number;
  /**
   * The |gamma|-weighted mean strike — where the book's mass actually sits.
   *
   * Weighted by MAGNITUDE, deliberately. A signed weighting is a weighted mean
   * whose weights sum to something that passes through zero, so it diverges
   * exactly at the flip — the moment the number matters most — and can land
   * outside the strike ladder entirely. Magnitude asks a different and
   * answerable question: where is the exposure, never mind which way it points.
   */
  gammaCenter: number;
}

/** A chain too short to have a shape at all. Returned rather than thrown so a
    caller mid-render gets spot-anchored levels instead of a blank desk. */
const degenerate = (spot: number): ChainStructure => ({
  netGex: 0,
  flip: spot,
  callWall: spot,
  putWall: spot,
  gammaCenter: spot,
});

export function readStructure(chain: StrikeNode[], spot: number, step = 1): ChainStructure {
  if (chain.length < 2) return degenerate(spot);

  let putWall = spot - step * 4;
  let callWall = spot + step * 4;
  let maxBelow = 0;
  let maxAbove = 0;
  let netGex = 0;
  let massWeighted = 0;
  let mass = 0;

  for (const node of chain) {
    netGex += node.netGex;
    const magnitude = Math.abs(node.netGex);
    massWeighted += node.strike * magnitude;
    mass += magnitude;
    if (node.strike < spot && magnitude > maxBelow) {
      maxBelow = magnitude;
      putWall = node.strike;
    }
    if (node.strike > spot && magnitude > maxAbove) {
      maxAbove = magnitude;
      callWall = node.strike;
    }
  }

  /*
    Gamma flip: first upward zero-crossing of the 3-strike smoothed net-GEX
    profile — put-dominated below, call-supported above. Smoothing keeps a single
    noisy strike from faking the crossover, and the crossing must be UPWARD
    because long-gamma-above is what a desk means by the flip; a first-sign-change
    of any direction finds a different level.
  */
  const smooth = (i: number): number =>
    (chain[Math.max(0, i - 1)].netGex + chain[i].netGex + chain[Math.min(chain.length - 1, i + 1)].netGex) / 3;

  let flip = spot;
  for (let i = 1; i < chain.length; i++) {
    if (smooth(i - 1) < 0 && smooth(i) >= 0) {
      flip = (chain[i - 1].strike + chain[i].strike) / 2;
      break;
    }
  }

  return {
    netGex,
    flip,
    callWall,
    putWall,
    // A chain of pure zeroes has no centre; spot is the honest stand-in.
    gammaCenter: mass > 0 ? massWeighted / mass : spot,
  };
}
