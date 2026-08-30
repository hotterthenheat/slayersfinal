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
  /**
   * Put this on the band the chrome lives in. While the pointer is inside
   * that band the strip stays up, whatever `hidePx` says — see THE BAND
   * KEEPS ITSELF OPEN below.
   */
  bandRef: React.MutableRefObject<HTMLElement | null>;
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

  /*
    THE BAND KEEPS ITSELF OPEN, and without this the feature did not work
    with a mouse at all.

    `hidePx` is 104, and it is a distance from the PANE's top edge — which
    cannot know where the strip's controls actually sit. Measured on the
    built desk, the Overlays trigger's centre is 113px below that edge at
    1440x900 and 146px at 1600x950, because the toolbar wraps differently at
    different widths. So the sequence a reader performs is:

      reach the top band   -> the strip appears
      move onto the button -> the pointer passes 104px, the strip HIDES

    The control vanishes from under the cursor on the way to being clicked.
    The browser sweep had been reporting this since the reveal landed, as a
    30-second click timeout with the plot canvas named as the element
    intercepting the click, and I read it twice as the probe's fault before
    measuring the geometry.

    So the pointer being inside the chrome's own band is a keep-open, whatever
    the distance says. NO CIRCULARITY: the band is the container, not the
    strip — it is `pointer-events: none` and laid out whether or not the
    strip is shown — and this is a geometry test on its rect, not a `:hover`
    that only exists while the grant it depends on does.
  */
  const bandRef = useRef<HTMLElement | null>(null);
  const inBand = (x: number, y: number): boolean => {
    const el = bandRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      /* A touch is not a hover. Coarse pointers get the chrome unconditionally
         (Terrain's `chrome-tap` rule), so leave their state alone rather than
         flickering it against a finger that is scrolling the chart. */
      if (e.pointerType === 'touch') return;
      const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
      if (!nearRef.current && y <= revealPx) setNear(true);
      else if (nearRef.current && y > hidePx && !inBand(e.clientX, e.clientY)) setNear(false);
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

  return { shown: near || keepOpen, bind: { onPointerMove, onPointerLeave }, bandRef };
}

export default useTopEdgeReveal;
