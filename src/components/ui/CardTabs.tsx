import { useId } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import type { TabOption } from './FilterTabs';

/** The CHILD tab tier (Noah, 2026-08-17: "parent and child should [not] be
    sharing button design" — page-level mode switches own the FilterTabs pill
    rail). Controls that live INSIDE a panel — card sections, layout toggles,
    metric pickers — wear this instead: mono caps whispers with a white
    hairline that GLIDES between them on the house ease. White = "where you
    are", one tier quieter than the parent's solid pill.

    `dense` closes the gaps for a panel head that holds several of these on
    one line — the board's families and expiries — same whisper, same line. */
const CardTabs = <V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  dense = false,
  className = '',
  attrs,
}: {
  options: readonly TabOption<V>[];
  value: V;
  onChange: (v: V) => void;
  ariaLabel?: string;
  dense?: boolean;
  className?: string;
  attrs?: Record<string, string>;
}) => {
  const scope = useId(); // isolates the line from other CardTabs instances
  return (
    <LayoutGroup id={scope}>
      <div role="group" aria-label={ariaLabel} className={`inline-flex items-center ${dense ? 'gap-2' : 'gap-4'} ${className}`} {...attrs}>
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
              className={`relative py-1 font-mono text-[10px] uppercase transition-colors whitespace-nowrap disabled:cursor-not-allowed ${dense ? 'tracking-[0.08em]' : 'tracking-widest'}`}
              {...opt.attrs}
            >
              <span className={active ? 'text-textPrimary' : opt.disabled ? 'text-textMuted/40 line-through' : 'text-textMuted hover:text-textSecondary'}>{opt.label}</span>
              {active && (
                <motion.span
                  layoutId="card-tab-line"
                  className="absolute left-0 right-0 bottom-0 h-px bg-[#ededed]"
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
};

export default CardTabs;
