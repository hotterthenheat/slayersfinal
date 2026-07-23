import type { MouseEvent } from 'react';

/**
 * Cursor → nearest data index for a full-width SVG/area chart (works with
 * preserveAspectRatio="none" since it measures the rendered rect, not viewBox).
 * Lives apart from the HoverReadout component so the component file only exports
 * a component (keeps fast-refresh happy).
 */
export function svgHoverIndex(e: MouseEvent, count: number): number {
  const rect = (e.currentTarget as Element).getBoundingClientRect();
  const frac = (e.clientX - rect.left) / (rect.width || 1);
  return Math.max(0, Math.min(count - 1, Math.round(frac * (count - 1))));
}
