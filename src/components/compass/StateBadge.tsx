/*
==================================================
  SLAYER TERMINAL - SETUP LIFECYCLE STATE BADGE
  The pill component. Its logic (state derivation +
  metadata) lives in ./setupState so this file only
  exports a component and fast-refresh stays hot.
==================================================
*/

import SignalBadge from '../ui/SignalBadge';
import { STATE_META, type SetupState } from './setupState';

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
