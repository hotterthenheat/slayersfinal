import type { LucideIcon } from 'lucide-react';

/*
  The three community tabs were spelling the same submit button, the same
  labelled input and the same ghost row action out longhand, three times each.
  They live here rather than in components/ui/ because nothing outside this
  section uses them, and the house primitives (Panel, SegmentedControl,
  SignalBadge, EmptyState) still do the heavy lifting on these pages.
*/

const FOCUS = 'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60';

const FIELD = `w-full bg-inputBg border border-borderSubtle rounded-md px-2.5 py-1.5 text-caption text-textPrimary placeholder:text-textMuted focus:border-borderMuted transition-colors ${FOCUS}`;

interface TextProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** Visible caption above the control. */
  label?: string;
  /** Visually hidden label, for fields with no visible one. */
  srLabel?: string;
  mono?: boolean;
  className?: string;
}

export const TextInput = ({ value, onChange, placeholder, label, srLabel, mono = false, className = '' }: TextProps) => (
  <label className={`block ${className}`}>
    {label && <span className="block mb-1 font-mono text-label uppercase tracking-wider text-textMuted">{label}</span>}
    {srLabel && <span className="sr-only">{srLabel}</span>}
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${FIELD} ${mono ? 'font-mono' : ''}`}
    />
  </label>
);

export const TextArea = ({
  value,
  onChange,
  placeholder,
  label,
  srLabel,
  rows = 2,
}: TextProps & { rows?: number }) => (
  <label className="block">
    {label && <span className="block mb-1 font-mono text-label uppercase tracking-wider text-textMuted">{label}</span>}
    {srLabel && <span className="sr-only">{srLabel}</span>}
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`${FIELD} py-2 resize-y`}
    />
  </label>
);

/** Small labelled text field. `hint` carries a derived read-out under the input
    (never a suggestion of what to type). */
export const Field = ({
  label,
  value,
  onChange,
  placeholder,
  hint,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hint?: React.ReactNode;
  className?: string;
}) => (
  <label className={`flex flex-col gap-1 min-w-0 ${className}`}>
    <span className="font-mono text-label uppercase tracking-wider text-textMuted">{label}</span>
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${FIELD} font-mono`}
    />
    {hint && <span className="font-mono text-micro text-textMuted leading-tight">{hint}</span>}
  </label>
);

/** The one filled button on these pages: post, request, save. */
export const PrimaryButton = ({
  icon: Icon,
  children,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-select/40 bg-select/[0.06] hover:bg-select/[0.12] font-mono text-label font-semibold uppercase tracking-wider text-select transition-colors disabled:opacity-60 disabled:pointer-events-none ${FOCUS}`}
  >
    <Icon className="w-3.5 h-3.5" aria-hidden="true" />
    {children}
  </button>
);

/**
 * Ghost action on a card row. `-my-1 py-1` is the house trick: the hit box
 * reaches 24px without the row growing. The label is the accessible name even
 * when it is hidden below `sm`.
 */
export const RowAction = ({
  icon: Icon,
  label,
  onClick,
  href,
  danger = false,
  labelAlways = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  labelAlways?: boolean;
}) => {
  const cls = `inline-flex items-center gap-1 min-h-6 -my-1 py-1 px-1.5 rounded font-mono text-micro uppercase tracking-wider transition-colors ${
    danger ? 'text-textMuted hover:text-bear' : 'text-textMuted hover:text-textPrimary'
  } hover:bg-rowHover ${FOCUS}`;
  const inner = (
    <>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span className={labelAlways ? '' : 'hidden sm:inline'} aria-hidden="true">
        {label}
      </span>
    </>
  );
  return href ? (
    <a href={href} className={cls} title={label} aria-label={label}>
      {inner}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={cls} title={label} aria-label={label}>
      {inner}
    </button>
  );
};
