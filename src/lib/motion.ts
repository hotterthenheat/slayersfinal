/*
  Canonical motion tokens — one easing curve plus a duration ladder so every
  transition reads as the same hand instead of a scatter of ad-hoc cubic-béziers
  and seconds. Framer-motion consumers import these.
  Reduced motion is honored globally via <MotionConfig reducedMotion="user">.
*/

/** The house glide — easeOutExpo family: settles fast, never overshoots. */
export const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Duration ladder, in seconds.
 *
 * Six rungs, not three. The ladder used to stop at fast/base/slow, and 31 call
 * sites went around it with hand-picked seconds — 0.16, 0.18, 0.24, 0.25, 0.28,
 * 0.35, 0.7, 0.9. Those weren't noise: they clustered into three intents the
 * ladder had no word for (a menu reveal, a list reflow, a bar settling to its
 * value). Naming the rungs the app actually uses is what makes "no magic
 * numbers" enforceable; a ladder nobody can hit is one nobody uses.
 */
export const DUR = {
  /** Hover states, route crossfades — barely-there. */
  fast: 0.12,
  /** Menus, dropdowns, small reveals — quicker than a content swap. */
  quick: 0.16,
  /** Content swaps, soft-in body changes. */
  base: 0.2,
  /** Overlays, drawers, the launch reveal — the longest the chrome goes. */
  slow: 0.3,
  /** List reflow — rows changing places, where the eye has to follow one row. */
  reflow: 0.35,
  /**
   * A bar, ring or map settling to its value. Deliberately slower than any
   * chrome: this is the instrument reading out, not the UI responding to a tap.
   */
  data: 0.7,
} as const;

/**
 * The sliding selection pill — `layoutId` marker that glides to the active item.
 *
 * One recipe, because there were five. The segmented control sprang at 400/32,
 * the top nav underline at 400/30, the landing nav at 320/30, while the sub-nav
 * and the Compass scanner tabs tweened at 0.25. Same gesture, five different
 * physics. A spring wins over a tween here: the pill is tracking a selection the
 * user just made, and the follow-through is what makes it feel attached to the
 * click rather than played back at it.
 */
export const PILL = { type: 'spring', stiffness: 400, damping: 32 } as const;
