import { useId } from 'react';
import { motion } from 'framer-motion';

interface SegmentedControlProps<V extends string> {
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
  ariaLabel?: string;
}

/** Compact segmented selector — a single pill glides to the active segment
    (shared-element via layoutId, one per instance so stacked controls don't
    trade pills), so the selection reads as one moving object, not a repaint. */
const SegmentedControl = <V extends string>({ options, value, onChange, ariaLabel }: SegmentedControlProps<V>) => {
  const pill = useId();
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center inst-surface rounded-md overflow-hidden max-w-full overflow-x-auto no-scrollbar"
    >
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`relative shrink-0 whitespace-nowrap px-3 py-1.5 font-mono text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60 active:scale-[0.98] ${
              active ? 'text-textPrimary' : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.03]'
            }`}
          >
            {active && (
              <motion.span
                layoutId={pill}
                className="absolute inset-0 bg-white/[0.12]"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
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
