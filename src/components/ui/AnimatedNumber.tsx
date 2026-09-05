import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  /** Formats the in-flight value each frame (e.g. v => `$${v.toFixed(2)}`) */
  format?: (v: number) => string;
  className?: string;
  /** Robinhood-style change stamp (Noah, 2026-08-10): on a value change the
      ink jumps to bull/bear for a beat, then eases back to the inherited
      color while the number rolls. OPT-IN — a terminal where every number
      flashes is a terminal where none of them do. */
  flash?: boolean;
}

const FLASH_UP = '#30D158';
const FLASH_DOWN = '#FF3B30';
const FLASH_HOLD_MS = 240;

/*
==================================================
  WHICH NUMBERS MAY MOVE — the desk's motion policy
==================================================

  0.12 asks for this to be decided rather than left to whoever writes the
  next panel, because the failure is cumulative: any one rolling number is
  pleasant and forty of them at once is a screen nobody can read.

  THE RULE IS ABOUT WHAT THE READER IS DOING WITH THE NUMBER.

    A HEADLINE FACT MAY ROLL. Net GEX, net DEX, spot — a reader watches
    these, one at a time, and the roll carries information: which way it
    went, and how far. That is why ExposureProfile animates exactly three
    figures and its Exposure Matrix, a table of the same data, animates
    none.

    A TABLE CELL MAY NOT. In a grid the reader's job is comparison across
    rows, which needs every cell readable at the same instant. A column of
    rolling numbers is never all readable at once, and the eye is dragged to
    whichever cell moved last rather than to the biggest one. No table on
    this desk animates its cells, and none should start.

    A ROW-BASED RAIL IS THE ONE EXCEPTION, and it is deliberate rather than
    an oversight: ImpactLeaderboard rolls per row because its rows are keyed
    by RANK SLOT, so a ticker change transitions the whole rail in place
    instead of remounting it (Noah, 2026-08-19). The motion there is about a
    swap the reader asked for, not about ticks arriving underneath them.

  `flash` STAYS OPT-IN for the same reason, and its own note below says it:
  a terminal where every number flashes is a terminal where none of them do.

  REDUCED MOTION IS HONOURED WITHOUT ASKING each component to remember —
  `useReducedMotion` here, plus the opt-out blocks in index.css. Verified in
  a real browser rather than assumed: under `prefers-reduced-motion: reduce`
  the desk goes completely still — 0 animating elements on /pulse,
  /trace/live-tape and /pinpoint/exposure-profile, against 29, 4 and 5
  normally.

  TWO THINGS 0.12 ASKS FOR THAT ARE NOT BUILT, and why, so nobody has to
  rediscover it:

    FLASH-ON-CHANGE FOR TAPE ROWS. The obvious implementation — animate a
    row on mount — is WRONG here, and quietly so. The tape is an endless
    feed that backfills OLDER prints as the reader scrolls down, so those
    rows mount too and would tint exactly like a fresh arrival. A correct
    version has to distinguish the live head of the feed from the runway
    behind it and flash only the former.

    THROTTLE AND COALESCE. There is nothing to throttle: the tick is a fixed
    1500ms interval (MarketDataContext), so the 0DTE burst that bullet
    guards against cannot occur on this build. It becomes real the day a
    live stream replaces the interval, and not before.
*/

/**
 * Rolls smoothly between numeric values instead of snapping.
 * Mounts at its initial value (no entrance animation) — pair with `tnum`
 * on the parent so digits don't jitter horizontally while rolling.
 */
const AnimatedNumber = ({ value, format = v => v.toFixed(2), className, flash = false }: AnimatedNumberProps) => {
  const reduced = useReducedMotion();
  const raw = useMotionValue(value);
  const spring = useSpring(raw, { stiffness: 170, damping: 28 });
  const text = useTransform(spring, v => format(v));

  const [flashDir, setFlashDir] = useState<'up' | 'down' | null>(null);
  const prevRef = useRef(value);

  useEffect(() => {
    if (reduced) spring.jump(value);
    else raw.set(value);
  }, [value, reduced, raw, spring]);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;
    if (!flash || reduced) return;
    if (Math.abs(value - prev) < 1e-9) return;
    setFlashDir(value > prev ? 'up' : 'down');
    const id = setTimeout(() => setFlashDir(null), FLASH_HOLD_MS);
    return () => clearTimeout(id);
  }, [value, flash, reduced]);

  return (
    <motion.span
      className={`${className ?? ''} ${flash ? 'transition-colors duration-500' : ''}`}
      /* Stamp IN instantly (0ms), ease BACK through the class transition once
         the inline color is removed — back to whatever ink the parent wears. */
      style={
        flashDir
          ? { color: flashDir === 'up' ? FLASH_UP : FLASH_DOWN, transitionDuration: '0ms' }
          : undefined
      }
    >
      {text}
    </motion.span>
  );
};

export default AnimatedNumber;
