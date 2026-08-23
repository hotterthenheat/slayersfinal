import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  loadAnimatedIcons,
  warmAnimatedIcons,
  type AnimatedIconComponent,
  type AnimatedIconHandle,
} from './animatedIcons';

/*
==================================================
  SLAYER TERMINAL - ICONS THAT ANSWER THE POINTER
  (ui/AnimatedIcon.tsx)

  A lucide icon that plays a short animation while the
  control it sits in is hovered or focused, and is an
  ordinary static icon otherwise.

  WHERE THESE GO, as a rule rather than a taste: an icon
  that DOES something animates, an icon that IDENTIFIES
  something does not. Search, settings, bookmark, refresh,
  copy — those respond to you, and motion on hover is the
  affordance saying so. Pinpoint's crosshair and Trace's
  radar are names, not buttons; animating a desk's identity
  icon says nothing and costs the reader a moving target on
  a screen already full of moving numbers.

  WHICH IS WHY THERE ARE ONLY TWO OF THESE. Search and
  settings. The obvious third was the bookmark toggle, and
  it does not qualify: every bookmark in the app draws its
  state with `fill={marked ? 'currentColor' : 'none'}`, so
  the icon is not a button that acts, it is an indicator
  that reports — and the animated component takes no `fill`,
  so adopting it would trade a state a reader can see for a
  flourish they cannot. The rule earns its keep by ruling
  things out.

  IT IS DRIVEN FROM THE CONTROL, NOT FROM THE GLYPH. The
  pack animates on its own hover by default, which is wrong
  inside a button: a 14px icon in a 32px target leaves most
  of the button dead. This walks up to the nearest
  button/link and listens there — and listens for FOCUS too,
  so the affordance exists for a keyboard.

  THREE STATES, NOT TWO.
    reduced motion  → the still lucide glyph, permanently.
    pack not here   → the still lucide glyph, for now.
    pack here       → the animated one, in the same box.
  See ui/animatedIcons.ts for why the pack arrives late.
==================================================
*/

interface AnimatedIconProps {
  /** Export name in `@animateicons/react/lucide`, e.g. `SearchIcon`. */
  name: string;
  /** The plain lucide twin — what renders until (or instead of) the pack. */
  still: LucideIcon;
  /**
   * Pixel size, and it MUST MATCH what `className` resolves to.
   *
   * The still icon is sized by Tailwind class and the animated one by number,
   * so the two can disagree — and did: `size={14}` beside `w-3.5 h-3.5` looked
   * right until the density pass redefined `spacing[3.5]` as 16px, after which
   * the glyph shrank two pixels the moment the pack arrived. Nothing failed;
   * the button just reflowed a few seconds into every session, under a comment
   * claiming the swap moves nothing.
   */
  size?: number;
  /** Classes for the still icon, sized the Tailwind way like every other icon. */
  className?: string;
}

/**
 * What an icon can belong to. Deliberately not `*`: the point is to find the
 * thing a reader aims at, and the nearest non-control ancestor of a button icon
 * is a layout div nobody hovers on purpose.
 */
const CONTROL = 'button, a[href], [role="button"], label';

const AnimatedIcon = ({ name, still: Still, size = 16, className = '' }: AnimatedIconProps) => {
  const reduced = useReducedMotion();
  const host = useRef<HTMLSpanElement>(null);
  const icon = useRef<AnimatedIconHandle>(null);
  const [Icon, setIcon] = useState<AnimatedIconComponent | null>(null);

  useEffect(() => {
    if (reduced) return;
    let alive = true;
    const cancelWarm = warmAnimatedIcons();
    void loadAnimatedIcons().then(pack => {
      // A name the pack does not carry leaves the still icon standing rather
      // than rendering nothing — the domain glyphs are half-covered upstream and
      // a missing icon must degrade, not disappear.
      if (alive) setIcon(() => pack[name] ?? null);
    });
    return () => {
      alive = false;
      cancelWarm();
    };
  }, [name, reduced]);

  useEffect(() => {
    if (reduced || !Icon) return;
    const el = host.current?.closest(CONTROL) ?? host.current;
    if (!el) return;

    const on = () => icon.current?.startAnimation();
    const off = () => icon.current?.stopAnimation();
    // `pointerenter`/`pointerleave` rather than mouse events: they do not fire
    // for a tap, so a phone does not leave the icon stuck mid-animation.
    el.addEventListener('pointerenter', on);
    el.addEventListener('pointerleave', off);
    el.addEventListener('focusin', on);
    el.addEventListener('focusout', off);
    return () => {
      el.removeEventListener('pointerenter', on);
      el.removeEventListener('pointerleave', off);
      el.removeEventListener('focusin', on);
      el.removeEventListener('focusout', off);
    };
  }, [reduced, Icon]);

  if (reduced || !Icon) return <Still className={className} aria-hidden="true" />;

  return (
    // `display: contents` so the wrapper adds no box of its own — the icon sits
    // in the control's flex row exactly where the plain one did, and swapping in
    // mid-session moves nothing. `closest()` walks the DOM, which
    // display:contents does not affect.
    <span ref={host} className="contents" aria-hidden="true">
      <Icon ref={icon} size={size} />
    </span>
  );
};

export default AnimatedIcon;
