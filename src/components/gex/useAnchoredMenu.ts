import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { placeMenu, type MenuBox, type MenuSide } from './menuPlacement';

/*
==================================================
  SLAYER TERMINAL - KEEPING A MENU OFF ITS ANCHOR
  (components/gex/useAnchoredMenu.ts)

  The React half of `menuPlacement.ts`: hold a ref on
  the trigger, and keep a fixed-position box for the
  menu current while it is open.

  IT IS A HOOK BECAUSE THERE ARE THREE MENUS. The
  toolbar's Dropdown solved this first and kept the
  plumbing inline; the symbol quick-pick and the
  compare '+' never got it, and stayed
  `absolute left-0 top-full` inside a pane whose box
  is `overflow-hidden`. Measured on the built desk at
  1024x768, four panes: the compare popover ran to
  x=517 against a pane clipping at x=509, so 8px of
  it was rendered and unreachable — the same defect
  menuPlacement.ts was written for, in the two
  components that never adopted it.

  Copying the plumbing into them would have made three
  copies of one rule, which is how the first one came
  to be the only correct one.

  The arithmetic stays in `menuPlacement.ts`, which
  imports no React so it can be tested on its own.
==================================================
*/

/**
 * A fixed-position box for a menu anchored to `anchorRef`, recomputed while
 * `open` and whenever anything could have moved the trigger.
 *
 * `placed` is null until the first measurement, so a caller renders nothing
 * rather than painting a menu at the origin for one frame.
 */
export function useAnchoredMenu<T extends HTMLElement>(
  open: boolean,
  menuSide: MenuSide = 'bottom',
  /** The menu's own width, so the placement can keep its FAR edge on screen.
      Omitted, the placement assumes MENU_MIN_WIDTH — see placeMenu. */
  menuWidth?: number
) {
  const anchorRef = useRef<T | null>(null);
  const [placed, setPlaced] = useState<{ box: MenuBox; side: MenuSide } | null>(null);

  const measure = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    setPlaced(placeMenu(el.getBoundingClientRect(), menuSide, window.innerWidth, window.innerHeight, menuWidth));
  }, [menuSide, menuWidth]);

  /* Measured in a LAYOUT effect, before paint: a passive effect would paint
     the menu at its previous position for one frame, which on a desk of four
     panes reads as the menu jumping in from the last pane you opened. */
  useLayoutEffect(() => {
    if (!open) {
      setPlaced(null);
      return;
    }
    measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    /* Capture, so a scroll inside ANY ancestor moves the menu with its trigger
       and not just a scroll of the window. */
    const onMove = () => measure();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, measure]);

  return { anchorRef, placed };
}
