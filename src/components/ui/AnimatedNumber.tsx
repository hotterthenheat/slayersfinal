import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  /** Formats the in-flight value each frame (e.g. v => `$${v.toFixed(2)}`) */
  format?: (v: number) => string;
  /** Flash a green/red cell tint on change (default on) — the tape feeling alive */
  flash?: boolean;
  className?: string;
}

/**
 * Rolls smoothly between numeric values, then settles — a data terminal wants
 * numbers at rest most of the time, so the spring is tuned to land well under
 * one 1.5s tick. Renders inline-block + tabular-nums so digits never shift
 * horizontally; when the formatted width changes (e.g. 99→100, $9.9M→$10.2M)
 * it JUMPS rather than rolling a value that would shove its neighbors sideways.
 *
 * On every change it also flashes a brief green-up / red-down cell tint behind
 * the digits (Bloomberg-style) — a tint overlay, never a text-color override,
 * so it can't fight a number's own sign color or shift layout. Honors
 * prefers-reduced-motion.
 */
const AnimatedNumber = ({ value, format = v => v.toFixed(2), flash = true, className }: AnimatedNumberProps) => {
  const reduced = useReducedMotion();
  const raw = useMotionValue(value);
  const spring = useSpring(raw, { stiffness: 260, damping: 32 });
  const text = useTransform(spring, v => format(v));
  const prevLen = useRef(format(value).length);
  const prevVal = useRef(value);
  const [pulse, setPulse] = useState<{ dir: 'up' | 'down'; n: number } | null>(null);

  useEffect(() => {
    const len = format(value).length;
    // jump on reduced-motion OR when the character count changes (width would jump anyway)
    if (reduced || len !== prevLen.current) spring.jump(value);
    else raw.set(value);
    if (flash && !reduced && value !== prevVal.current) {
      const dir = value > prevVal.current ? 'up' : 'down';
      setPulse(p => ({ dir, n: (p?.n ?? 0) + 1 }));
    }
    prevLen.current = len;
    prevVal.current = value;
  }, [value, reduced, raw, spring, format, flash]);

  return (
    <span className={`relative inline-block tabular-nums ${className ?? ''}`}>
      {pulse && (
        <span
          key={pulse.n}
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 -inset-x-[0.15em] rounded-[2px] ${
            pulse.dir === 'up' ? 'animate-tick-up' : 'animate-tick-down'
          }`}
        />
      )}
      <motion.span className="relative">{text}</motion.span>
    </span>
  );
};

export default AnimatedNumber;
