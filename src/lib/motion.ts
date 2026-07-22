/*
  Canonical motion tokens — one easing curve plus a small duration ladder so
  every transition reads as the same hand instead of a scatter of ad-hoc
  cubic-béziers and seconds. Framer-motion consumers import these.
  Reduced motion is honored globally via <MotionConfig reducedMotion="user">.
*/

/** The house glide — easeOutExpo family: settles fast, never overshoots. */
export const EASE = [0.16, 1, 0.3, 1] as const;

/** Duration ladder, in seconds. */
export const DUR = {
  /** Hover states, route crossfades — barely-there. */
  fast: 0.12,
  /** Content swaps, soft-in body changes. */
  base: 0.2,
  /** Overlays, drawers, the launch reveal — the longest we go. */
  slow: 0.3,
} as const;
