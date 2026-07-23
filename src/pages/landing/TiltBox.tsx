/*
==================================================
  SLAYER TERMINAL - TILT BOX (landing)
  A flat instrument card. Hover lifts the hairline
  border only — no 3D tilt, no cursor glare, no
  floating halo. A terminal panel earns presence by
  being sharp and still, not by wobbling toward the
  cursor. Props kept for call-site compatibility.
==================================================
*/

import type { ReactNode } from 'react';

interface TiltBoxProps {
  children: ReactNode;
  className?: string;
  /** Accepted for compatibility; the card no longer tilts. */
  maxTilt?: number;
  /** Accepted for compatibility; no cursor sheen. */
  glare?: boolean;
}

const TiltBox = ({ children, className = '' }: TiltBoxProps) => (
  <div
    className={`relative h-full rounded-lg border border-borderSubtle bg-panel overflow-hidden transition-colors hover:border-select/40 ${className}`}
  >
    {children}
  </div>
);

export default TiltBox;
