/*
==================================================
  SLAYER TERMINAL - SETUP LIFECYCLE STATE (logic)
  Maps a setup to an observational lifecycle state,
  read entirely from fields the engine already
  computes (verdict + delta). This is a relabel of
  the actionable ENTER/EXIT verdict into a state that
  describes where a setup SITS — never an instruction
  to place an order. No new math here.
  Kept apart from the StateBadge component so that
  file only exports a component (fast-refresh).
==================================================
*/

import type { Tone } from '../ui/tones';
import type { Setup } from '../../types/compass';

/**
 * Lifecycle state for a setup, derived from existing fields:
 *   WAITING     — a score is present but the setup does not qualify yet
 *   ARMED       — it qualifies, and price has not reached the strike
 *   TRIGGERED   — it qualifies, and price has taken the strike
 *   INVALIDATED — the thesis has faded and the engine has stepped aside
 */
export type SetupState = 'WAITING' | 'ARMED' | 'TRIGGERED' | 'INVALIDATED';

export const SETUP_STATES: SetupState[] = ['WAITING', 'ARMED', 'TRIGGERED', 'INVALIDATED'];

/**
 * The 0.50-delta line: the strike the model prices as more likely than not to
 * finish in the money, which for a fresh contract is the strike price has
 * reached. Puts carry a negative delta, hence the magnitude.
 */
const TAKEN_DELTA = 0.5;

/**
 * Derive the lifecycle state from values the setup already carries.
 *
 * ARMED vs TRIGGERED used to be read off the take-profit ladder, and the ladder
 * was decided by a hidden RNG draw that always lit the first rung on a
 * qualifying setup — so TRIGGERED was every qualifying setup and ARMED could
 * not happen at all. It reads delta instead: whether price has taken the strike
 * is a fact about two numbers the setup publishes, it is orthogonal to the
 * score (which reads distance, not side), and it splits a scan board roughly in
 * half because the nearest strike is either just under spot or just over it.
 */
export function setupState(setup: Setup): SetupState {
  // Engine has faded the thesis — nothing left to arm or trigger.
  if (setup.verdict === 'EXIT') return 'INVALIDATED';
  if (setup.verdict === 'ENTER') {
    return Math.abs(setup.greeks.delta) >= TAKEN_DELTA ? 'TRIGGERED' : 'ARMED';
  }
  // Score present, conditions building, nothing qualified yet.
  return 'WAITING';
}

export interface StateMeta {
  tone: Tone;
  pulse: boolean;
  /** Actionability rank for sorting — hotter states sort higher (desc). */
  rank: number;
  /** The state's definition. Nothing renders it yet, so it is written as copy
      that could be: no em dash, observational, never an instruction. */
  hint: string;
}

// THE CHROME TONE RULE, stated once for the whole desk. Green & red are the
// market's own language (call/put, bull/bear, a price that moved), so nothing
// that is merely a PROCESS may borrow them — not this lifecycle, not a verdict
// (see ./verdict.ts), not a status pill. Process states speak silver/amber/grey:
// select = primed or live, warn = caution, neutral = dormant or faded. Only the
// live state pulses. A verdict that renders green is this rule being broken.
export const STATE_META: Record<SetupState, StateMeta> = {
  WAITING: { tone: 'neutral', pulse: false, rank: 1, hint: 'Score present, does not qualify yet' },
  ARMED: { tone: 'select', pulse: false, rank: 2, hint: 'Qualified, price has not reached the strike' },
  TRIGGERED: { tone: 'select', pulse: true, rank: 3, hint: 'Qualified, price has taken the strike' },
  INVALIDATED: { tone: 'neutral', pulse: false, rank: 0, hint: 'Thesis faded, the engine has stepped aside' },
};
