/*
==================================================
  SLAYER TERMINAL - IV RANK (ivRank.ts)  [P2.1]
  ONE source of truth for IV rank and IV percentile, keyed on (ticker, day).
  These two numbers used to be drawn from unrelated hashes on the Vol Lab and the
  Vol Complex, so the same name read one rank on one desk and a different one on
  another. Both desks call this now.

  The production shape is ivRankFromSeries(series, current): the real feed passes
  14 years of daily ATM IV and this computes a genuine rank and percentile. The
  simulator has no IV history, so ivRankFor(ticker, day) synthesizes a
  deterministic stand-in series from one shared hash and runs the SAME
  computation over it — the swap to real history changes only where the series
  comes from, not the interface or the call sites.
==================================================
*/

import { h01 } from './rng';
import { math } from './mathProvider';

export interface IvRank {
  /** 0-100: where current IV sits between its own trailing low and high. */
  rank: number;
  /** 0-100: share of the historical series at or below current IV. */
  percentile: number;
}

/**
 * Rank and percentile of `current` within a historical `series` of the same IV.
 * This is the shape the real ThetaData feed fills — 14 years of daily ATM IV in,
 * a measured rank and percentile out. A percentile needs a distribution to be a
 * percentile, and this is where that distribution enters.
 */
export function ivRankFromSeries(series: readonly number[], current: number): IvRank {
  // The computation lives on the MATH SEAM (core/mathProvider.ts) so a house
  // model can redefine what "rank" means — trailing window, log-vol basis,
  // whatever — and every desk that reads a rank inherits it at once.
  return math.ivRank(series, current);
}

/**
 * Simulator entry: one deterministic IV rank / percentile per (ticker, day).
 * Synthesizes a year of daily IV around a hash-drawn level and ranks today
 * within it, then runs the production computation. Every desk calls this with
 * the same (ticker, day), so they cannot disagree.
 */
export function ivRankFor(ticker: string, day: string): IvRank {
  const seed = `${ticker}-${day}-ivrank`;
  const level = 0.2 + h01(`${seed}-lvl`) * 0.4; // 20-60% ATM IV level for the year
  const series: number[] = new Array(252);
  for (let i = 0; i < 252; i++) {
    series[i] = level * (0.7 + h01(`${seed}-h${i}`) * 0.6);
  }
  const current = level * (0.7 + h01(`${seed}-now`) * 0.6);
  return ivRankFromSeries(series, current);
}
