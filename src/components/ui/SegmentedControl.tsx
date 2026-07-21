interface SegmentedControlProps<V extends string> {
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
  ariaLabel?: string;
}

/** Compact segmented selector — neutral white marks the selected state. */
const SegmentedControl = <V extends string>({ options, value, onChange, ariaLabel }: SegmentedControlProps<V>) => {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center inst-surface rounded-md overflow-hidden"
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`px-3 py-1.5 font-mono text-xs font-medium transition-colors ${i > 0 ? 'border-l border-borderSubtle' : ''} ${
              active
                ? 'bg-white/[0.08] text-textPrimary'
                : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.03]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

export default SegmentedControl;
