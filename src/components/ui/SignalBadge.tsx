import React from 'react';
import { toneBadge, toneDot, type Tone } from './tones';

interface SignalBadgeProps {
  tone?: Tone;
  /** Render a small status dot before the label */
  dot?: boolean;
  pulse?: boolean;
  children: React.ReactNode;
  className?: string;
}

const SignalBadge = ({ tone = 'neutral', dot = false, pulse = false, children, className = '' }: SignalBadgeProps) => {
  return (
    <span
      /*
        `whitespace-nowrap` — a badge is a LABEL, and a label that wraps
        stops being one. Seen on the Ranked Targets ladder, where the two
        words of SPOT TARGET broke across two lines in a narrow strike cell
        and made that one row taller than every other row in the table; the
        eye reads a broken rhythm as a broken table long before it works out
        which cell caused it. A badge that will not fit should be clipped by
        its container or dropped by its caller, never folded.
      */
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${toneBadge[tone]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${toneDot[tone]} ${pulse ? 'custom-pulse' : ''}`} />}
      {children}
    </span>
  );
};

export default SignalBadge;
