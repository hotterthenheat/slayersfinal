import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { placeMenu, type MenuBox, type MenuSide } from './menuPlacement';

/*
==================================================
  SLAYER TERMINAL - KEEPING A MENU OFF ITS ANCHOR
  (components/ui/useAnchoredMenu.ts)

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
export function useAnchoredMenu<T extends HTMLElement, M extends HTMLElement = HTMLDivElement>(
  open: boolean,
  menuSide: MenuSide = 'bottom',
  /** The menu's own width, so the placement can keep its FAR edge on screen.
      Omitted, the placement assumes MENU_MIN_WIDTH — see placeMenu. */
  menuWidth?: number
) {
  const anchorRef = useRef<T | null>(null);
  const [placed, setPlaced] = useState<{ box: MenuBox; side: MenuSide } | null>(null);

  /*
    THE MENU'S OWN WIDTH, MEASURED, when the caller cannot name it.

    The toolbar's Dropdown renders whatever child it is given, and those are
    not one width: `min-w-[210px]` on the wrapper, but AlertsMenu is
    `w-[228px]`, the chart-style menu comes out 230, and the candle theme 317.
    A per-menu constant here would be a number kept by hand next to a class
    that already says it — the same two-generators trap, and it would drift the
    first time a menu grew a row.

    Measured on the built desk, left-column pane, before this: chart style at
    x = -12, Alerts and candle theme at x = 0. All three exactly what a 210
    assumption predicts (210 -> 8, 218 -> 0, 230 -> -12), which is what said
    the assumption was the fault rather than the arithmetic.

    THE WIDEST SEEN WHILE OPEN, not the first. Taking the first reading was
    the obvious bound against a loop — re-placing feeds a new maxHeight, which
    can take a scrollbar away, which changes the width, which re-places again —
    and it was wrong in a way the measurement showed: the Alerts menu read 218
    on the first frame and settled at 226 once its scrollbar went, so it stayed
    clamped to a width it no longer had and sat at x = 0.

    A maximum converges instead of oscillating. Width can only grow a bounded
    number of times for fixed content, and each growth places the menu further
    from the edge, which never brings the scrollbar back.
  */
  const [measured, setMeasured] = useState<number | null>(null);
  const width = menuWidth ?? measured ?? undefined;

  const measure = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    setPlaced(placeMenu(el.getBoundingClientRect(), menuSide, window.innerWidth, window.innerHeight, width));
  }, [menuSide, width]);

  /** Put this on the menu element itself when the width is not passed in. */
  const menuRef = useRef<M | null>(null);

  /* Measured in a LAYOUT effect, before paint: a passive effect would paint
     the menu at its previous position for one frame, which on a desk of four
     panes reads as the menu jumping in from the last pane you opened. */
  useLayoutEffect(() => {
    if (!open) {
      setPlaced(null);
      setMeasured(null); // the next open re-measures its own content
      return;
    }
    measure();
  }, [open, measure]);

  /*
    RE-READ THE WIDTH AFTER EVERY PLACEMENT, not once when the menu mounts.

    A ref CALLBACK fires on mount and never again while the element stays
    mounted, so it can only ever see the FIRST layout — which is the one placed
    from the assumed width, before any correction. Measured: the Alerts menu
    read 218 at mount and settled at 226 once its scrollbar went, and the
    correction never arrived because nothing sampled it again. It sat at x = 0
    instead of the 8px edge.

    Keyed on `placed`, so each placement gets a fresh reading. It terminates
    because `measured` only ever grows: a wider reading places the menu further
    from the edge, which cannot bring the scrollbar back, and an unchanged
    reading sets no state.
  */
  useLayoutEffect(() => {
    if (!open || menuWidth != null) return;
    const el = menuRef.current;
    if (!el) return;
    const w = Math.round(el.getBoundingClientRect().width);
    if (w > 0) setMeasured(prev => (prev == null || w > prev ? w : prev));
  }, [open, placed, menuWidth]);

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

  return { anchorRef, placed, menuRef };
}
