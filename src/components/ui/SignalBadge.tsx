import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { toneBadge, toneDot, type Tone } from './tones';

/*
==================================================
  SLAYER TERMINAL - STATUS BADGE (ui/SignalBadge.tsx)

  The house's status ink: uppercase mono, tone-coloured, optionally dotted.

  WHY `cn` AND NOT A TEMPLATE LITERAL. The class list was assembled with
  `${toneBadge[tone]} ${className}` — string concatenation, which cannot resolve
  a collision. A caller passing `className="text-textMuted"` to soften a badge
  got BOTH its own class and the tone's, and which one won was decided by their
  order in the generated stylesheet rather than by the fact that the caller asked
  last. `cn` (clsx + tailwind-merge) resolves it: the caller's class wins, which
  is what a `className` prop has always implied.

  WHY NOT CVA HERE. `class-variance-authority` is for a component with its own
  variant TABLE — size x intent x state resolved into one class string. This
  badge has one axis and it does not own it: the tone→class map lives in
  `ui/tones.ts` because six components share it, and moving it into a `cva()`
  call here would make a second copy of exactly the map that file exists to
  prevent. A `cva()` wrapper with no variants is a string with ceremony, so
  there is none. CVA belongs where a real variant table does.
==================================================
*/

interface SignalBadgeProps {
  tone?: Tone;
  /** Render a small status dot before the label */
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
}

const SignalBadge = ({ tone = 'neutral', dot = false, pulse = false, children, className }: SignalBadgeProps) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 font-mono text-label font-semibold uppercase tracking-wider',
      toneBadge[tone],
      className
    )}
  >
    {dot && <span className={cn('w-1.5 h-1.5 rounded-full', toneDot[tone], pulse && 'custom-pulse')} />}
    {children}
  </span>
);

export default SignalBadge;
