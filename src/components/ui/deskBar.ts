import { createContext, useState } from 'react';

/*
==================================================
  SLAYER TERMINAL - ONE TOOLBAR, NOT TWO (ui/deskBar.ts)

  A slot on the desk strip that a DESK can render into,
  from inside its own tree.

  WHY. Pinpoint's Gamma desk carried a second control row —
  `VIEW  This ticker | Complex | Roll-off | Dependency` —
  directly under the strip that already held
  `PINPOINT | Gamma Levels Greeks Stress History`. Two bars,
  sixty pixels apart, both changing what you are looking at,
  and the reader has to work out which level of nav is
  which. Every Pinpoint desk carries one, and so does
  anything else built on SubtabDesk.

  The controls belong on the strip. They could not get there
  because the strip is rendered by the section LAYOUT while
  the controls are owned by the ROUTED desk two levels
  below — a tree problem, not a design one.

  So the strip publishes an element and the desk portals
  into it. Same shape as Panel's focus overlay, where
  `FocusContext` hands out `overlayEl` and Panel
  `createPortal`s its body through it, rather than a second
  mechanism for one idea.

  `useState` rather than a ref for the element: a ref does
  not re-render the consumer when it fills, so the slot
  would stay empty until something unrelated updated the
  tree.

  The component that consumes this is ui/DeskBarSlot.tsx —
  split out so a file that exports a component exports only
  components, which is what fast refresh needs.
==================================================
*/

export const DeskBarContext = createContext<HTMLElement | null>(null);

export const DeskBarProvider = DeskBarContext.Provider;

/** The strip's own hook: gives it the slot element and the setter for it. */
export function useDeskBarSlot(): [HTMLElement | null, (el: HTMLElement | null) => void] {
  return useState<HTMLElement | null>(null);
}
