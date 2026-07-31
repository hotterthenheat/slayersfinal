import { useId, useRef, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { PILL } from '../../lib/motion';

interface SegmentedControlProps<V extends string> {
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
  ariaLabel?: string;
}

/** Compact segmented selector — a single pill glides to the active segment
    (shared-element via layoutId, one per instance so stacked controls don't
    trade pills), so the selection reads as one moving object, not a repaint.

    Keyboard follows the radio-group pattern (adapted from ddoemonn/interior,
    MIT): the group is ONE tab stop and the arrows move between segments, rather
    than every segment being its own stop. Three of these in a toolbar used to
    cost nine presses to walk past. Arrowing also selects — these switch a view,
    never submit anything, so there is nothing to guard against.

    `role="radio"` + `aria-checked` over `aria-pressed`: the choice here is
    exclusive, and the radio role is what makes a screen reader say "2 of 4". */
const SegmentedControl = <V extends string>({ options, value, onChange, ariaLabel }: SegmentedControlProps<V>) => {
  const pill = useId();
  const groupRef = useRef<HTMLDivElement>(null);

  const focusAt = (i: number) => {
    const next = options[(i + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    // Move focus with the selection so the next arrow press continues from here.
    groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[(i + options.length) % options.length]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step) {
      e.preventDefault();
      focusAt(i + step);
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      focusAt(e.key === 'Home' ? 0 : options.length - 1);
    }
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center inst-surface rounded-md overflow-hidden max-w-full overflow-x-auto no-scrollbar"
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            // Roving tabindex: only the checked segment is reachable by Tab, and
            // if nothing matches `value` the first segment keeps the group from
            // dropping out of the tab order entirely.
            tabIndex={active || (i === 0 && !options.some(o => o.value === value)) ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={e => onKeyDown(e, i)}
            className={`relative shrink-0 whitespace-nowrap px-3 py-1.5 font-mono text-caption font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60 active:scale-[0.98] ${
              active ? 'text-textPrimary' : 'text-textSecondary hover:text-textPrimary hover:bg-rowHover'
            } leading-4`}
          >
            {active && (
              <motion.span
                layoutId={pill}
                className="absolute inset-0 bg-white/[0.12]"
                transition={PILL}
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default SegmentedControl;
