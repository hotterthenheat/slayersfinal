import { useId, type ReactNode } from 'react';
import { LayoutGroup, motion } from 'framer-motion';

export interface TabOption<V extends string> {
  value: V;
  label: ReactNode;
  title?: string;
  disabled?: boolean;
  /** Extra attributes on the option's button — a test hook, an id. */
  attrs?: Record<string, string>;
}

interface FilterTabsProps<V extends string> {
  options: readonly TabOption<V>[];
  value: V;
  onChange: (value: V) => void;
  ariaLabel?: string;
  /** The dense cut — mono caps at ten pixels, for a toolbar that holds
      several of these on one line. Same rail, same pill. */
  dense?: boolean;
  className?: string;
  /** Extra attributes on the rail. */
  attrs?: Record<string, string>;
}

/** Soft tab strip (shadcn grammar): sentence-case labels in a faint grouped
    rail, the active option inverted to a solid white pill with black text —
    "white = where you are" at full contrast, without boxes or dividers.
    The pill GLIDES between options (shared-layout), never teleports.

    This is the terminal's ONE page-level tab control (2026-07-19, Noah: the
    boxed segmented look is "too common"); the Pinpoint desk's Segmented
    renders through it. */
const FilterTabs = <V extends string>({ options, value, onChange, ariaLabel, dense = false, className = '', attrs }: FilterTabsProps<V>) => {
  const scope = useId(); // isolates the pill from other FilterTabs instances

  return (
    <LayoutGroup id={scope}>
      <div role="group" aria-label={ariaLabel} className={`inline-flex items-center gap-0.5 rounded-lg bg-white/[0.04] p-0.5 ${className}`} {...attrs}>
        {options.map(opt => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              disabled={opt.disabled}
              title={opt.title}
              onClick={() => onChange(opt.value)}
              className={`relative rounded-md font-medium transition-colors whitespace-nowrap disabled:cursor-not-allowed ${
                dense ? 'px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]' : 'px-3 py-1 text-xs'
              }`}
              {...opt.attrs}
            >
              {active && (
                <motion.span
                  layoutId="filter-pill"
                  className="absolute inset-0 rounded-md bg-[#ededed] shadow-sm shadow-black/40"
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              <span
                className={`relative z-10 ${
                  active ? 'text-[#0a0a0a] font-semibold' : opt.disabled ? 'text-textMuted/40 line-through' : 'text-textSecondary hover:text-textPrimary'
                }`}
              >
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
};

export default FilterTabs;
