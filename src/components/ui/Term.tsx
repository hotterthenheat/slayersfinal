import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { TERMS, type TermKey } from '../../data/terms';

interface TermProps {
  k: TermKey;
  children?: ReactNode;
  className?: string;
}

/*
==================================================
  SLAYER TERMINAL - JARGON, EXPLAINED IN PLACE (ui/Term.tsx)

  A dotted-underlined term that reveals its definition on hover or keyboard
  focus.

  WHAT THE HAND-ROLLED VERSION WAS DOING, AND WHY RADIX DOES IT BETTER. The
  previous implementation was 121 lines carrying its own portal, its own close
  timer, its own scroll-dismiss listener, its own Escape and Enter handling, and
  its own positioning:

      const up = r.top > (window.innerHeight || 900) * 0.5;
      left: Math.min(Math.max(pos.x, 120), (window.innerWidth || 1440) - 120)

  That flips the card upward based on which HALF OF THE VIEWPORT the anchor sits
  in, rather than on whether the card actually fits — so a term near the top with
  a tall card still opened downward off-screen, and one just past the midpoint
  flipped up even with room below. The horizontal clamp is a fixed 120px guess at
  half the card's width, which stops matching the moment the card's content
  changes. Radix measures the card and the viewport and places it where it fits,
  on both axes, and re-places it on scroll.

  `Popover` is deliberately not used here: it opens on CLICK, and this has to
  answer a reader who paused on a word. `HoverCard` would be the exact fit but is
  not a dependency, and the tooltip's own hover-bridge already keeps the card open
  while the pointer travels to it.

  THE GLOSSARY LINK IS GONE, on purpose. It sat inside the card, and a Radix
  tooltip closes on blur — so a link in there is reachable by mouse and by nothing
  else. A control no keyboard user can reach is worse than one that is not
  offered, and /guide/concepts is one click away in the nav. The card's job is
  the definition.
==================================================
*/
const Term = ({ k, children, className = '' }: TermProps) => (
  <Tooltip.Root>
    <Tooltip.Trigger asChild>
      <span
        tabIndex={0}
        /*
          THE GUARD IS BACK, and the comment that said it was unnecessary was
          wrong. DataTable gives every sortable column a `<th tabIndex={0}>`
          whose `onKeyDown` re-sorts on Enter or Space, and a Term renders
          INSIDE that header. Radix's tooltip trigger adds `onPointerDown` and
          `onClick` and no key handling at all, so Tab onto a column's
          definition, press Enter to read it, and the table re-sorts under you.
          The tooltip already opens on focus; the key press has nothing left to
          do here, so it stops rather than bubbling to a control the reader was
          not aiming at.
        */
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
        }}
        className={cn(
          'cursor-help underline decoration-dotted decoration-textMuted/60 underline-offset-2',
          'outline-none focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60',
          className
        )}
      >
        {children ?? k}
      </span>
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content
        side="top"
        sideOffset={6}
        collisionPadding={12}
        className="z-[60] w-56 rounded-md border border-borderMuted bg-panelRaised px-3 py-2 shadow-overlay normal-case tracking-normal"
      >
        <span className="font-mono text-label font-semibold uppercase tracking-wider text-textPrimary">{k}</span>
        <span className="mt-0.5 block font-sans text-label font-normal leading-relaxed text-textSecondary">
          {TERMS[k]}
        </span>
        <Tooltip.Arrow className="fill-borderMuted" />
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
);

export default Term;
