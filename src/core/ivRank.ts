/*
==================================================
  SLAYER TERMINAL - IV RANK (ivRank.ts)  [P2.1]
  ONE source of truth for IV rank and IV percentile, keyed on (ticker, day).
  These two numbers used to be drawn from unrelated hashes on the Vol Lab and the
  Earnings Hub, so the same name read one rank on one desk and a different one on
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

export interface IvRank {
  /** 0-100: where current IV sits between its own trailing low and high. */
  rank: number;
  /** 0-100: share of the historical series at or below current IV. */
  percentile: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Rank and percentile of `current` within a historical `series` of the same IV.
 * This is the shape the real ThetaData feed fills — 14 years of daily ATM IV in,
 * a measured rank and percentile out. A percentile needs a distribution to be a
 * percentile, and this is where that distribution enters.
 */
export function ivRankFromSeries(series: readonly number[], current: number): IvRank {
  if (!series.length) return { rank: 50, percentile: 50 };
  let min = Infinity;
  let max = -Infinity;
  let below = 0;
  for (const v of series) {
    if (v < min) min = v;
    if (v > max) max = v;
    if (v <= current) below += 1;
  }
  const rank = max > min ? ((current - min) / (max - min)) * 100 : 50;
  const percentile = (below / series.length) * 100;
  return { rank: Math.round(clamp(rank, 0, 100)), percentile: Math.round(clamp(percentile, 0, 100)) };
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
