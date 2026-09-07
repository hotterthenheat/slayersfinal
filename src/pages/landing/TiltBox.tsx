/*
==================================================
  SLAYER TERMINAL - TILT BOX (landing)
  Mouse-tracked perspective card with a moving glare
  and a lime edge on hover. Native replacement for
  the "Boxes Hover" Spline pattern — zero runtime
  cost, and the content inside keeps running live.
==================================================
*/

import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';

interface TiltBoxProps {
  children: ReactNode;
  className?: string;
  /*
    THE PAGE QUOTES THE PRODUCT, AND A QUOTATION KEEPS ITS OWN VOICE.

    "Not screenshots. The actual panels, printing." is the page's central
    claim, so a mounted panel speaks in a DESK's type scale rather than the
    page's six sizes — and `landing-restraint-proof` and the browser sweep
    both have to know which is which. That boundary used to be inferred from
    the fact that a demo sat in a TiltBox, which was wrong the moment the
    pricing cards used one too. It is declared here instead.
  */
  quoted?: boolean;
  /** Max rotation in degrees when the cursor sits at a card edge */
  maxTilt?: number;
  /** Moving light sheen that follows the cursor */
  glare?: boolean;
}

const TiltBox = ({ children, className = '', maxTilt = 7, glare = true, quoted = false }: TiltBoxProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [hover, setHover] = useState(false);

  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const gx = useMotionValue(50);
  const gy = useMotionValue(50);
  const springRx = useSpring(rx, { stiffness: 180, damping: 22 });
  const springRy = useSpring(ry, { stiffness: 180, damping: 22 });
  const glareBg = useMotionTemplate`radial-gradient(460px circle at ${gx}% ${gy}%, rgba(255,255,255,0.055), transparent 62%)`;

  const onMove = (e: MouseEvent) => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    ry.set((px - 0.5) * 2 * maxTilt);
    rx.set(-(py - 0.5) * 2 * maxTilt);
    gx.set(px * 100);
    gy.set(py * 100);
  };

  const onLeave = () => {
    rx.set(0);
    ry.set(0);
    setHover(false);
  };

  return (
    <div style={{ perspective: 1100 }} className="h-full" data-quoted-panel={quoted ? '' : undefined}>
      <motion.div
        ref={ref}
        onMouseMove={onMove}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={onLeave}
        style={{ rotateX: springRx, rotateY: springRy, transformStyle: 'preserve-3d' }}
        className={`relative h-full rounded-lg border bg-panel overflow-hidden transition-[border-color,box-shadow] duration-300 ${
          hover
            ? 'border-select/40 shadow-[0_0_44px_-14px_rgba(210,255,0,0.28)]'
            : 'border-borderSubtle'
        } ${className}`}
      >
        {children}
        {glare && (
          <motion.div aria-hidden className="absolute inset-0 pointer-events-none z-10" style={{ background: glareBg }} />
        )}
      </motion.div>
    </div>
  );
};

export default TiltBox;
