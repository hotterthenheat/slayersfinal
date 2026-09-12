import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface HoverReadoutProps {
  /** Cursor client X/Y — the card floats just off the pointer and stays on-screen. */
  x: number;
  y: number;
  /** A box the card must not cover — the row it is about. Given this, the
      card sits just under the box (or just over it when there is no room
      beneath), and `y` is not used. */
  avoid?: { top: number; bottom: number };
  /** The horizontal room the card may use — a panel's own box rather than
      the viewport, so it flips before it runs onto a neighbour or a pane. */
  within?: { left: number; right: number };
  children: ReactNode;
}

const GAP = 14;
const EDGE = 8;

/**
 * The house floating read-out — one styled card for per-element hover detail,
 * so it reads identically wherever it appears. Pointer events pass through;
 * the card clamps to the viewport so it never clips. Portaled to <body>:
 * inside transformed containers (the Pulse grid tiles position with CSS
 * transforms) `fixed` would anchor to the tile and clip.
 *
 * The clamp measures the card rather than assuming it: a hard-coded size
 * either clips a wider card or slides the clamp back *under* the cursor near
 * the right edge — covering the cell being read. It flips to the other side
 * of the pointer when there is no room, and a max-width keeps the card's
 * shape stable wherever it lands.
 */
const HoverReadout = ({ x, y, avoid, within, children }: HoverReadoutProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 240, h: 130 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setSize(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
  }, [children]);

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;

  const roomL = within ? Math.max(EDGE, within.left) : EDGE;
  const roomR = within ? Math.min(vw - EDGE, within.right) : vw - EDGE;
  const flipX = x + GAP + size.w > roomR;
  const left = Math.max(roomL, flipX ? x - GAP - size.w : x + GAP);
  let top: number;
  if (avoid) {
    /* Under the row, unless that runs off the screen; then over it. Two
       pixels of air either way, and never a pixel of the row itself. */
    const below = avoid.bottom + 2;
    top = below + size.h <= vh - EDGE ? below : Math.max(EDGE, avoid.top - 2 - size.h);
  } else {
    const flipY = y + GAP + size.h > vh - EDGE;
    top = Math.max(EDGE, flipY ? y - GAP - size.h : y + GAP);
  }

  return createPortal(
    <div
      ref={ref}
      className="pointer-events-none fixed z-[60] max-w-[320px] rounded-md border border-borderMuted bg-[#0c0c0c] px-3 py-2 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.75),0_4px_10px_-6px_rgba(0,0,0,0.55)]"
      style={{ left, top }}
    >
      {children}
    </div>,
    document.body
  );
};

export default HoverReadout;
