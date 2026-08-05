/*
==================================================
  COMMUNITY - THE BOOK BEHIND A THESIS (book.ts)
  A posted thesis is only worth reading next to the
  levels it was written against, so the Ideas board
  reads the SAME key levels every other desk reads:
  data/gex.ts buildLevels(). Nothing here derives a
  wall, a flip or a king itself.
==================================================
*/

import { useEffect, useMemo, useState } from 'react';
import Simulator from '../../core/simulator';
import { buildLevels } from '../../data/gex';
import { useMarketData } from '../../context/MarketDataContext';
import type { KeyLevels } from '../../types/gex';
import type { IdeaDirection } from '../../types/community';
import { etTime } from '../../core/calendar';

export interface Books {
  /** Key levels per symbol, from buildLevels(). */
  byTicker: Record<string, KeyLevels>;
  /** When the non-active symbols were last measured. */
  checkedAt: number;
  /** Re-measure every symbol in the set. */
  recheck: () => void;
}

/**
 * Key levels for a set of symbols.
 *
 * The active symbol comes off the market context, so it tracks the pulse for
 * free. Every other symbol needs its own chain built, which is the expensive
 * part, so those are measured once per symbol set and then only on request. The
 * timestamp is returned rather than hidden: a level measured two minutes ago is
 * fine to show as long as the surface says when it was taken.
 */
interface Measurement {
  key: string;
  at: number;
  levels: Record<string, KeyLevels>;
}

function measure(key: string): Measurement {
  const levels: Record<string, KeyLevels> = {};
  for (const t of key ? key.split(',') : []) levels[t] = buildLevels(Simulator.buildSnapshot(t));
  return { key, at: Date.now(), levels };
}

export function useBooks(tickers: string[]): Books {
  const { activeTicker, marketData } = useMarketData();
  const key = useMemo(() => Array.from(new Set(tickers)).sort().join(','), [tickers]);
  const [measured, setMeasured] = useState<Measurement>(() => measure(key));

  // A symbol joining or leaving the board re-measures the whole set; nothing
  // else does, so a board of ten names is not rebuilding ten chains per tick.
  useEffect(() => {
    setMeasured(prev => (prev.key === key ? prev : measure(key)));
  }, [key]);

  const byTicker = useMemo(() => {
    if (!marketData || !(activeTicker in measured.levels)) return measured.levels;
    return { ...measured.levels, [activeTicker]: buildLevels(marketData) };
  }, [measured, marketData, activeTicker]);

  return { byTicker, checkedAt: measured.at, recheck: () => setMeasured(measure(key)) };
}

/** First number in a free-text field, so "below 498" reads as 498. Returns null
    when the text carries no number, and the caller then shows nothing rather
    than guessing. */
export function firstNumber(text: string): number | null {
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Which band of the book a price sits in, phrased from the three levels the
 * engine publishes. Sorted rather than assumed: put wall below flip below call
 * wall is the usual shape, not a guarantee, and a hard-coded ladder would print
 * a false sentence on the day it inverts.
 */
export function zoneOf(price: number, levels: KeyLevels): string {
  const marks = [
    { name: 'put wall', value: levels.putWall },
    { name: 'flip', value: levels.flip },
    { name: 'call wall', value: levels.callWall },
  ].sort((a, b) => a.value - b.value);

  if (price < marks[0].value) return `below the ${marks[0].name}`;
  if (price > marks[2].value) return `above the ${marks[2].name}`;
  for (let i = 0; i < marks.length - 1; i++) {
    if (price >= marks[i].value && price <= marks[i + 1].value) {
      return `between the ${marks[i].name} and the ${marks[i + 1].name}`;
    }
  }
  return 'on a level';
}

/** Has spot traded through the level the author called their invalidation? */
export function isThrough(direction: IdeaDirection, spot: number, invalidation: number): boolean {
  return direction === 'BULLISH' ? spot <= invalidation : spot >= invalidation;
}

/** Signed distance from spot, in percent. */
export function pctFromSpot(price: number, spot: number): number {
  return spot === 0 ? 0 : ((price - spot) / spot) * 100;
}

export const fmtPct = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

export const fmtLevel = (v: number): string => v.toFixed(2);

// Idea and comment stamps sit beside entry prices and gamma flips, so they
// belong on the market's clock like every other time in the terminal.
export const clockOf = (ms: number): string => etTime(ms);
