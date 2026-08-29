import { useCallback, useEffect, useRef, useState } from 'react';

/*
==================================================
  SLAYER TERMINAL - TOP-EDGE REVEAL (useTopEdgeReveal)

  Chrome that gets out of the chart's way.
==================================================

  THE BEHAVIOUR THIS REPLACES. The pane's toolbar was revealed by
  `group-hover` on the whole pane, so it faded in the moment the pointer
  entered anywhere — which is to say, the entire time anybody was actually
  reading the chart. A strip of controls sat over the top of the tape
  through every crosshair sweep, every drawing, every measure. It was
  "reveal on hover" in name and "always on" in practice.

  Reveal should follow REACH, not presence: the pointer climbing toward the
  top edge is the gesture that means "I want the controls". Working in the
  middle of the chart means the opposite, and should give the pixels back.

  WHY NOT CSS. The obvious `peer`/sentinel version eats itself. A hidden
  toolbar must be `pointer-events: none` or it swallows clicks on the tape
  beneath it; revealing it therefore has to GRANT pointer events; and the
  instant it does, the pointer is over the toolbar rather than the sentinel,
  so `peer-hover` drops, so the grant is withdrawn, so it hides — a flicker
  loop at the boundary. Chaining the toolbar's own `:hover` does not close
  it either, because that hover only exists while the grant it depends on
  does. Measuring the pointer directly has none of that circularity.

  THE HYSTERESIS IS THE POINT. One threshold would flicker along its own
  edge, so opening and closing use different ones: the strip opens when the
  pointer is within `revealPx` of the top and only closes past `hidePx`,
  which is deliberately further down. A pointer resting near the boundary
  stays in whichever state it reached, instead of strobing.

  It stays open, whatever the pointer is doing, while anything inside has
  keyboard focus or a menu is open — closing a dropdown out from under
  someone reaching for it would be its own bug. That is `keepOpen`.
*/

export interface TopEdgeReveal {
  /** True when the chrome should be visible. */
  shown: boolean;
  /** Spread onto the element the pointer moves across (the pane). */
  bind: {
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerLeave: () => void;
  };
}

export function useTopEdgeReveal(
  keepOpen = false,
  revealPx = 56,
  hidePx = 104,
): TopEdgeReveal {
  const [near, setNear] = useState(false);
  /* Read through a ref inside the handler so the callback identity is stable
     and the listener is not re-created on every pointer move. */
  const nearRef = useRef(false);
  nearRef.current = near;

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      /* A touch is not a hover. Coarse pointers get the chrome unconditionally
         (Terrain's `chrome-tap` rule), so leave their state alone rather than
         flickering it against a finger that is scrolling the chart. */
      if (e.pointerType === 'touch') return;
      const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
      if (!nearRef.current && y <= revealPx) setNear(true);
      else if (nearRef.current && y > hidePx) setNear(false);
    },
    [revealPx, hidePx],
  );

  const onPointerLeave = useCallback(() => setNear(false), []);

  /* Leaving the window does not fire pointerleave on the pane, so a pointer
     that exits over the top edge would strand the chrome open. */
  useEffect(() => {
    const onWindowLeave = () => setNear(false);
    window.addEventListener('blur', onWindowLeave);
    document.addEventListener('mouseleave', onWindowLeave);
    return () => {
      window.removeEventListener('blur', onWindowLeave);
      document.removeEventListener('mouseleave', onWindowLeave);
    };
  }, []);

  return { shown: near || keepOpen, bind: { onPointerMove, onPointerLeave } };
}

export default useTopEdgeReveal;
