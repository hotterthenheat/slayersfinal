import type { LucideIcon } from 'lucide-react';
import { Settings2 } from 'lucide-react';
import { FOCUS_RING } from './focusRing';

/*
==================================================
  SLAYER TERMINAL - LAYER TOGGLES (ui/LayerToggle.tsx)

  A row of switches that say what is drawn on the canvas
  underneath them.

  This is a different control from `SegmentedControl`, and
  the difference is worth stating because they look similar
  on the strip. A segmented control is a CHOICE — the
  options are exclusive and exactly one is always taken
  ("0DTE or 1D or 5D"). A layer toggle is a SET — any
  combination is legal, including none, and each one is
  independently on or off ("positioning and price, but not
  the shelves"). Rendering a set as a segmented control is
  how you end up with a control that cannot express what
  the reader wants to see.

  The switch is a real `role="switch"` button rather than a
  checkbox styled to look like one, so a screen reader
  announces "Positioning, switch, on" and the space bar does
  what the pointer does.

  THE LABEL IS ALWAYS LEGIBLE. The track alone carries the
  state for a sighted reader, and a track is a colour — so
  the label's own weight and ink move with it too. A layer
  that is off reads muted; on, it reads primary. Nobody has
  to compare two small rounded rectangles to find out what
  is on screen.
==================================================
*/

export interface LayerToggleProps {
  label: string;
  icon?: LucideIcon;
  checked: boolean;
  onChange: (next: boolean) => void;
  /**
   * Shown on the switch and to a screen reader when the layer cannot be turned
   * on. A layer with no data behind it is disabled and SAYS WHY — the
   * alternative is a switch that flips and changes nothing, which reads as a
   * broken control rather than an empty session.
   */
  unavailable?: string;
  /** Renders a settings affordance after the switch. */
  onSettings?: () => void;
  settingsLabel?: string;
}

const LayerToggle = ({
  label,
  icon: Icon,
  checked,
  onChange,
  unavailable,
  onSettings,
  settingsLabel,
}: LayerToggleProps) => {
  const off = !checked || !!unavailable;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked && !unavailable}
        aria-label={unavailable ? `${label} — ${unavailable}` : label}
        title={unavailable || undefined}
        disabled={!!unavailable}
        onClick={() => onChange(!checked)}
        className={`group inline-flex items-center gap-1.5 rounded px-1 py-1 -my-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
      >
        {Icon && (
          <Icon
            className={`w-3.5 h-3.5 shrink-0 transition-colors ${off ? 'text-textMuted' : 'text-textSecondary'}`}
            aria-hidden="true"
          />
        )}
        <span
          className={`font-mono text-micro uppercase tracking-wider whitespace-nowrap transition-colors ${
            off ? 'text-textMuted' : 'text-textPrimary'
          }`}
        >
          {label}
        </span>
        {/* The track. 22x12 with a 8px knob — small enough to sit on a 40px
            strip beside a tab rail, big enough that the knob's travel is
            visible rather than a 2px twitch. The whole button is the hit
            target, so the track never has to be one. */}
        <span
          aria-hidden="true"
          className={`relative h-3 w-[22px] shrink-0 rounded-full border transition-colors ${
            off
              ? 'border-borderSubtle bg-white/[0.04] group-hover:border-borderMuted'
              : 'border-transparent holo-bg'
          }`}
        >
          <span
            className={`absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full transition-all ${
              off ? 'left-[3px] bg-textMuted' : 'left-[11px] bg-ink'
            }`}
          />
        </span>
      </button>
      {onSettings && (
        <button
          type="button"
          onClick={onSettings}
          aria-label={settingsLabel ?? `${label} settings`}
          title={settingsLabel ?? `${label} settings`}
          /* -m-1.5/p-1.5 grows a 12px glyph to a 24px target without growing
             the row: the same trick Panel's focus button uses. */
          className={`-m-1.5 p-1.5 text-textMuted transition-colors hover:text-textPrimary ${FOCUS_RING}`}
        >
          <Settings2 className="w-3 h-3" />
        </button>
      )}
    </span>
  );
};

export default LayerToggle;
