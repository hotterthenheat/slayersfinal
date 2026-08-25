/*
==================================================
  SLAYER TERMINAL - WIDGET TICKER PICKER
  Per-panel name selection for the desk, with the
  PIN (Noah, 2026-08-22: "a little pin next to the
  ticker on the left side... if you click the pin
  then when the ticker is changed on another
  subsection the pinned one doesn't change").

  Two states, one pin:
    UNPINNED — the panel follows the desk, and a
               name picked HERE moves the desk, so
               every other unpinned panel follows.
    PINNED   — the panel keeps its own name and
               ignores the desk until unpinned.

  Unpinned is the default and the quiet state; a
  pinned panel's pin wears the selection lime
  because the user deliberately set it apart. The
  parent decides what a pick does (broadcast vs
  pin) — this control only says which state it's in.
==================================================
*/

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Pin } from 'lucide-react';
import TickerLookup from '../../components/ui/TickerLookup';

interface WidgetTickerPickerProps {
  /** undefined = follows the desk; a name = pinned to it */
  value?: string;
  terminalTicker: string;
  /** A name was picked — the parent broadcasts it (unpinned) or pins it (pinned) */
  onPick: (ticker: string) => void;
  onToggleLink: () => void;
}

const WidgetTickerPicker = ({ value, terminalTicker, onPick, onToggleLink }: WidgetTickerPickerProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const pinned = value !== undefined;
  const shown = value ?? terminalTicker;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex items-center gap-0.5">
      {/* THE PIN — one click, left of the name. Lime = pinned (set apart
          on purpose); muted = following the desk. */}
      <button
        onClick={onToggleLink}
        aria-pressed={pinned}
        aria-label={pinned ? `Pinned to ${shown} — click to follow the desk` : `Follows the desk — click to pin this panel to ${shown}`}
        title={pinned ? `Pinned to ${shown} · click to follow the desk` : `Follows the desk · click to pin to ${shown}`}
        className={`inline-flex items-center justify-center w-5 h-5 rounded transition-colors ${
          pinned ? 'text-select hover:bg-select/[0.12]' : 'text-textMuted hover:text-textPrimary hover:bg-white/[0.06]'
        }`}
      >
        <Pin className={`w-3 h-3 transition-transform ${pinned ? '' : 'rotate-45'}`} fill={pinned ? 'currentColor' : 'none'} />
      </button>
      <button
        onClick={() => setOpen(o => !o)}
        title={pinned ? `Change the name this panel is pinned to` : `Change the desk's name (every unpinned panel follows)`}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold transition-colors ${
          pinned ? 'text-select hover:bg-select/[0.1]' : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.05]'
        }`}
      >
        {shown}
        <ChevronDown className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 w-72 border border-borderMuted bg-panel rounded-md shadow-2xl shadow-black/60 overflow-hidden animate-slide-in">
          {/* What a pick here will do — one line, the pin's state in words */}
          <div className="px-2.5 py-1.5 border-b border-borderSubtle font-mono text-[9px] uppercase tracking-wider text-textMuted">
            {pinned ? `Pinned — a name picked here stays on this panel` : `Following the desk — a name picked here moves every unpinned panel`}
          </div>
          <TickerLookup
            active={shown}
            onPick={t => {
              onPick(t);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default WidgetTickerPicker;
