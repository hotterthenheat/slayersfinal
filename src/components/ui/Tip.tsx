import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/*
==================================================
  SLAYER TERMINAL - TOOLTIP (ui/Tip.tsx)

  A styled, keyboard-reachable replacement for the native `title` attribute,
  which the terminal used 231 times.

  WHAT `title` COSTS. It is the cheapest tooltip there is and it is barely a
  tooltip:

    - It appears after a browser-controlled delay of roughly a second, which is
      long enough that most readers never see it and conclude there is nothing
      there.
    - It is unstyled and unstylable — an OS-chrome yellow box on a near-black
      terminal.
    - It does not appear on keyboard focus in any major browser, so every
      explanation delivered this way is mouse-only.
    - It is announced inconsistently by screen readers, and when an element
      already has an accessible name, `title` is usually ignored entirely.
    - It cannot hold markup, so a value and its unit arrive as one flat string.

  `title` is KEPT where it is a last-resort fallback for clipped text — a
  truncated table cell has nothing to hover but itself, and the native tooltip
  costs no layout there. This is for the explanations: what a column means, what
  a badge is asserting, what a number is measured in.

  `delayDuration={200}` because the house tooltips explain jargon rather than
  reveal hidden content, and a reader who paused on a label has already decided
  they want it.
==================================================
*/

export interface TipProps {
  /** What the tooltip says. Rich content is allowed — it is a popover, not an attribute. */
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
  children: ReactNode;
}

const Tip = ({ content, side = 'top', className, children }: TipProps) => (
  <Tooltip.Root>
    {/* `asChild` so the trigger stays whatever the caller rendered — wrapping it
        in a button would change the tab order and, on a table cell, the layout. */}
    <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content
        side={side}
        sideOffset={6}
        collisionPadding={8}
        className={cn(
          'z-[80] max-w-xs rounded-md border border-borderMuted bg-panelRaised px-2.5 py-1.5',
          'font-mono text-micro leading-4 text-textSecondary shadow-overlay',
          'animate-slide-in',
          className
        )}
      >
        {content}
        <Tooltip.Arrow className="fill-borderMuted" />
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
);

export default Tip;
