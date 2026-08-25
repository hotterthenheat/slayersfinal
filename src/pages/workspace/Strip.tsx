/** Bare strip in the chart-toolbar grammar — active earns a soft chip, the
    rest are ghost text. No box, no dividers. Shared by the desk widgets. */
const Strip = <T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) => (
  <div role="group" aria-label={label} className="inline-flex items-center gap-0.5 flex-wrap">
    {options.map(opt => {
      const active = opt.value === value;
      return (
        <button
          key={String(opt.value)}
          aria-pressed={active}
          onClick={() => onChange(opt.value)}
          className={`px-1.5 py-1 rounded font-mono text-[10px] transition-colors ${
            active
              ? 'bg-white/[0.07] text-textPrimary font-semibold'
              : 'text-textMuted hover:text-textPrimary hover:bg-white/[0.03]'
          }`}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

export default Strip;
