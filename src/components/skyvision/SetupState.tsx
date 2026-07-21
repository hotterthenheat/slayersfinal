/*
==================================================
  SLAYER TERMINAL - SETUP LIFECYCLE STATE
  Maps a setup to an observational lifecycle state,
  read entirely from fields the engine already
  computes (verdict + take-profit ladder). This is a
  relabel of the actionable ENTER/EXIT verdict into a
  state that describes where a setup SITS — never an
  instruction to place an order. No new math here.
==================================================
*/

import SignalBadge from '../ui/SignalBadge';
import type { Tone } from '../ui/tones';
import type { Setup } from '../../types/skyvision';

/**
 * Lifecycle state for a setup, derived from existing fields:
 *   WAITING     — a score is present but no trigger has formed (still building)
 *   ARMED       — entry conditions are met, no trigger has fired yet
 *   TRIGGERED   — entry conditions met AND a take-profit level is live or hit
 *   INVALIDATED — the thesis has faded and the engine has stepped aside
 */
export type SetupState = 'WAITING' | 'ARMED' | 'TRIGGERED' | 'INVALIDATED';

export const SETUP_STATES: SetupState[] = ['WAITING', 'ARMED', 'TRIGGERED', 'INVALIDATED'];

/**
 * Derive the lifecycle state from values the setup already carries.
 * A score with no trigger present resolves to WAITING.
 */
export function setupState(setup: Setup): SetupState {
  // Engine has faded the thesis — nothing left to arm or trigger.
  if (setup.verdict === 'EXIT') return 'INVALIDATED';
  // A live/hit take-profit rung is the trigger having fired.
  const triggered = setup.takeProfits.some(tp => tp.status === 'HIT' || tp.status === 'IN PROGRESS');
  if (setup.verdict === 'ENTER') return triggered ? 'TRIGGERED' : 'ARMED';
  // Score present, conditions building, no trigger yet.
  return 'WAITING';
}

interface StateMeta {
  tone: Tone;
  pulse: boolean;
  /** Actionability rank for sorting — hotter states sort higher (desc). */
  rank: number;
  hint: string;
}

// Grey = dormant · amber = primed · green = live · red = dead.
export const STATE_META: Record<SetupState, StateMeta> = {
  WAITING: { tone: 'neutral', pulse: false, rank: 1, hint: 'Score present, no trigger yet — still building' },
  ARMED: { tone: 'warn', pulse: false, rank: 2, hint: 'Entry conditions met — no trigger fired yet' },
  TRIGGERED: { tone: 'bull', pulse: true, rank: 3, hint: 'Trigger fired — a take-profit level is live' },
  INVALIDATED: { tone: 'bear', pulse: false, rank: 0, hint: 'Thesis faded — engine has stepped aside' },
};

interface StateBadgeProps {
  state: SetupState;
  dot?: boolean;
  className?: string;
}

/** Lifecycle-state pill. Tone follows STATE_META; TRIGGERED pulses (live). */
export const StateBadge = ({ state, dot = true, className = '' }: StateBadgeProps) => {
  const meta = STATE_META[state];
  return (
    <SignalBadge tone={meta.tone} dot={dot} pulse={meta.pulse} className={className}>
      {state}
    </SignalBadge>
  );
};
