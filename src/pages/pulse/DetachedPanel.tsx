/**
 * A panel floating free of the grid, inside the workspace.
 *
 * The middle rung between docked and popped out: no 12-column snapping, no
 * separate OS window, no popup blocker. This is what you want for overlaying a
 * chart on top of the desk, or parking a tape in a corner while the grid
 * rearranges underneath it.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { GripHorizontal } from 'lucide-react';
import type { PixelBounds } from './presets';
import { MIN_DETACHED, clampBounds } from './detach';

interface DetachedPanelProps {
  bounds: PixelBounds;
  viewport: { w: number; h: number };
  z: number;
  title: string;
  onChange: (b: PixelBounds) => void;
  onFocus: () => void;
  children: ReactNode;
}

type Gesture = { mode: 'move' | 'resize'; startX: number; startY: number; from: PixelBounds };

const DetachedPanel = ({ bounds, viewport, z, title, onChange, onFocus, children }: DetachedPanelProps) => {
  /**
   * The box under the cursor mid-gesture. Kept local so a drag re-renders this
   * one panel instead of the whole workspace: the desk carries live charts and
   * a per-second heat pulse, and lifting every pointermove into workspace state
   * would rebuild all of them at pointer frequency.
   */
  const [live, setLive] = useState<PixelBounds | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const box = live ?? bounds;

  const begin = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    // Left button only, and never from a control inside the header.
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onFocus();
    gesture.current = { mode, startX: e.clientX, startY: e.clientY, from: bounds };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const move = useCallback(
    (e: React.PointerEvent) => {
      const g = gesture.current;
      if (!g) return;
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      const next =
        g.mode === 'move'
          ? { ...g.from, x: g.from.x + dx, y: g.from.y + dy }
          : { ...g.from, w: Math.max(MIN_DETACHED.w, g.from.w + dx), h: Math.max(MIN_DETACHED.h, g.from.h + dy) };
      setLive(clampBounds(next, viewport));
    },
    [viewport],
  );

  const end = useCallback(
    (e: React.PointerEvent) => {
      if (!gesture.current) return;
      gesture.current = null;
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      // Commit once, at the end. Everything in between was local.
      setLive(cur => {
        if (cur) onChange(cur);
        return null;
      });
    },
    [onChange],
  );

  /** Arrows move, Shift+arrows resize — the same contract as the docked panel's
      grip, so the keyboard story does not change when a panel detaches. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const d = step[e.key];
    if (!d) return;
    e.preventDefault();
    const px = e.shiftKey ? 24 : 16;
    const [ax, ay] = d;
    onChange(
      clampBounds(
        e.shiftKey
          ? { ...bounds, w: Math.max(MIN_DETACHED.w, bounds.w + ax * px), h: Math.max(MIN_DETACHED.h, bounds.h + ay * px) }
          : { ...bounds, x: bounds.x + ax * px, y: bounds.y + ay * px },
        viewport,
      ),
    );
  };

  return (
    <div
      className="absolute inst-surface rounded-md overflow-hidden flex flex-col shadow-overlay ring-1 ring-select/20"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, zIndex: z }}
      onPointerDown={onFocus}
    >
      {/* The drag strip sits BEHIND the panel's own header controls: the header
          is rendered as a child, so its buttons keep their own hit areas and
          this only claims the empty space around them. */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`Move or resize the floating ${title} panel. Arrow keys move, Shift plus arrow keys resize.`}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight"
        onPointerDown={begin('move')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onKeyDown}
        className="absolute inset-x-0 top-0 h-10 cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"
        style={{ zIndex: 1 }}
      />
      <div className="relative flex flex-col h-full" style={{ zIndex: 2, pointerEvents: 'none' }}>
        {/* Children re-enable pointer events on themselves; the wrapper stays
            transparent to the pointer so the drag strip above still receives
            presses on the header's empty space. */}
        <div className="contents [&>*]:pointer-events-auto">{children}</div>
      </div>
      <div
        role="button"
        tabIndex={-1}
        aria-hidden
        onPointerDown={begin('resize')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize text-textMuted hover:text-textPrimary"
        style={{ zIndex: 3 }}
      >
        <GripHorizontal className="w-3 h-3 rotate-45 absolute bottom-0.5 right-0.5" />
      </div>
    </div>
  );
};

export default DetachedPanel;
