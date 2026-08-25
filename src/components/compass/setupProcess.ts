/*
==================================================
  SLAYER TERMINAL - SETUP PROCESS STATE (setupProcess.ts)
  Where a setup sits in ITS OWN lifecycle — derived
  fresh every render from two inputs (verdict + delta),
  never a stored transition, never an instruction.

  VOCABULARY (Noah, 2026-08-05): one lexicon, the one
  users already know. The port's ARMED/TRIGGERED was a
  second language ("what does that even mean?") — gone.
  WATCH and FADING are the verdict's own words; ACTIVE
  is the verdict's word too; MOVING is the single new
  one, and it means exactly what it says: the contract
  now trades like its thesis (|delta| crossed 0.50).
  Process states wear CHROME tones (select/neutral);
  bull/bear stay the market's own language.
==================================================
*/

import type { Setup } from '../../types/compass';
import type { Tone } from '../ui/tones';

export type ProcessState = 'WATCH' | 'ACTIVE' | 'MOVING' | 'FADING';

/** The taken line: at |delta| ≥ 0.50 the contract moves like the trade it
    describes — the market has picked the thesis up, not merely priced it. */
const TAKEN_DELTA = 0.5;

export function processState(setup: Setup): ProcessState {
  if (setup.verdict === 'EXIT') return 'FADING';
  if (setup.verdict === 'ENTER') {
    return Math.abs(setup.greeks.delta) >= TAKEN_DELTA ? 'MOVING' : 'ACTIVE';
  }
  return 'WATCH';
}

/* HOLO, not lime (Noah, 2026-08-05: "too much neon green"): the board already
   speaks green three ways that EARN it — bull scores, call pills, TP HIT.
   Process states are the terminal talking about itself, which is silver's
   job. Flat tinted holo chip (toneBadge.holo), never the animated foil —
   foil stays reserved for nav/CTAs per the Weigher count-chip ruling. */
export const PROCESS_META: Record<ProcessState, { tone: Tone; pulse: boolean; hint: string }> = {
  WATCH: { tone: 'neutral', pulse: false, hint: 'On the board, thesis not proven yet' },
  ACTIVE: { tone: 'holo', pulse: false, hint: 'Thesis working — the level structure is in place' },
  MOVING: { tone: 'holo', pulse: true, hint: 'The contract now trades like its thesis (delta ≥ 0.50)' },
  FADING: { tone: 'neutral', pulse: false, hint: 'Thesis degrading — the setup is retiring' },
};
