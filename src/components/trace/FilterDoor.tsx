/*
  THE filters door (Noah, 2026-08-30: "these can all be grouped in one
  'Filters' button somewhere noticable and this goes for any other section
  of trace with similar setups"). One noticeable button per flow page; every
  cut/side/shape chip lives behind it in a glass popover. The button lights
  lime while anything deviates from the page's default, so hidden filters
  can never silently shape the table. Esc and click-away close.
*/

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';

interface FilterDoorProps {
  /** True while any filter deviates from the default — lights the button */
  live: boolean;
  children: ReactNode;
}

const DOOR_W = 320;

const FilterDoor = ({ live, children }: FilterDoorProps) => {
  const [open, setOpen] = useState(false);
  /* EDGE-AWARE (Noah, 2026-08-30: "all my filters are literally bleeding
     outside of the page"): the door used to hang from the button's RIGHT
     edge, and the button lives at the far left of the controls row — so a
     320px popover ran 320px leftward, off the page. It now opens toward
     the side with room: from the button's left edge by default, flipping
     to its right edge only when that would cross the viewport. */
  const [align, setAlign] = useState<'left' | 'right'>('left');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const toggle = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setAlign(r.left + DOOR_W + 8 > window.innerWidth ? 'right' : 'left');
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        onClick={toggle}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border font-mono text-[10px] uppercase tracking-wider transition-colors ${
          live
            ? 'border-select/40 text-select bg-select/[0.06]'
            : 'border-borderSubtle text-textSecondary hover:text-textPrimary hover:bg-white/[0.04]'
        }`}
      >
        <SlidersHorizontal className="w-3 h-3" />
        Filters
      </button>
      {open && (
        <div
          style={{ width: DOOR_W }}
          className={`absolute top-full mt-1.5 z-[60] border border-borderMuted bg-panel/80 backdrop-blur-xl backdrop-saturate-150 rounded-md shadow-2xl shadow-black/60 p-3 animate-slide-in ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
};

/** A labeled section inside the door — whisper caption over wrapping chips. */
export const FilterSection = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="mb-2.5 last:mb-0">
    <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted mb-1">{label}</div>
    <div className="flex flex-wrap gap-1">{children}</div>
  </div>
);

export default FilterDoor;
