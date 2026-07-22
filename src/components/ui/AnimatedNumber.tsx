import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  /** Formats the in-flight value each frame (e.g. v => `$${v.toFixed(2)}`) */
  format?: (v: number) => string;
  className?: string;
}

/**
 * Rolls smoothly between numeric values, then settles — a data terminal wants
 * numbers at rest most of the time, so the spring is tuned to land well under
 * one 1.5s tick. Renders inline-block + tabular-nums so digits never shift
 * horizontally; when the formatted width changes (e.g. 99→100, $9.9M→$10.2M)
 * it JUMPS rather than rolling a value that would shove its neighbors sideways.
 */
const AnimatedNumber = ({ value, format = v => v.toFixed(2), className }: AnimatedNumberProps) => {
  const reduced = useReducedMotion();
  const raw = useMotionValue(value);
  const spring = useSpring(raw, { stiffness: 260, damping: 32 });
  const text = useTransform(spring, v => format(v));
  const prevLen = useRef(format(value).length);

  useEffect(() => {
    const len = format(value).length;
    // jump on reduced-motion OR when the character count changes (width would jump anyway)
    if (reduced || len !== prevLen.current) spring.jump(value);
    else raw.set(value);
    prevLen.current = len;
  }, [value, reduced, raw, spring, format]);

  return <motion.span className={`inline-block tabular-nums ${className ?? ''}`}>{text}</motion.span>;
};

export default AnimatedNumber;
