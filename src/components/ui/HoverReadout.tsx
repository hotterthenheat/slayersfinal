import type { MouseEvent, ReactNode } from 'react';

/**
 * Cursor → nearest data index for a full-width SVG/area chart (works with
 * preserveAspectRatio="none" since it measures the rendered rect, not viewBox).
 */
export function svgHoverIndex(e: MouseEvent, count: number): number {
  const rect = (e.currentTarget as Element).getBoundingClientRect();
  const frac = (e.clientX - rect.left) / (rect.width || 1);
  return Math.max(0, Math.min(count - 1, Math.round(frac * (count - 1))));
}

interface HoverReadoutProps {
  /** Cursor client X/Y — the card floats just off the pointer and stays on-screen. */
  x: number;
  y: number;
  children: ReactNode;
}

/**
 * The house floating read-out — one styled card every chart/heatmap/bar hover
 * uses, so per-element detail reads identically across the terminal. Pointer
 * events pass through; the card clamps to the viewport so it never clips.
 */
const HoverReadout = ({ x, y, children }: HoverReadoutProps) => {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  return (
    <div
      className="pointer-events-none fixed z-[60] rounded-md border border-borderMuted bg-panelRaised px-3 py-2 shadow-overlay"
      style={{ left: Math.min(x + 14, vw - 240), top: Math.min(y + 14, vh - 130) }}
    >
      {children}
    </div>
  );
};

export default HoverReadout;
