import { useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  /** Formats the in-flight value each frame (e.g. v => `$${v.toFixed(2)}`) */
  format?: (v: number) => string;
  className?: string;
}

/**
 * Rolls smoothly between numeric values instead of snapping.
 * Mounts at its initial value (no entrance animation) — pair with `tnum`
 * on the parent so digits don't jitter horizontally while rolling.
 */
const AnimatedNumber = ({ value, format = v => v.toFixed(2), className }: AnimatedNumberProps) => {
  const reduced = useReducedMotion();
  const raw = useMotionValue(value);
  const spring = useSpring(raw, { stiffness: 170, damping: 28 });
  const text = useTransform(spring, v => format(v));

  useEffect(() => {
    if (reduced) spring.jump(value);
    else raw.set(value);
  }, [value, reduced, raw, spring]);

  return <motion.span className={className}>{text}</motion.span>;
};

export default AnimatedNumber;
