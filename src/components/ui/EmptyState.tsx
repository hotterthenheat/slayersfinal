import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  /** Optional icon chip above the title. */
  icon?: LucideIcon;
  /** Short headline — uppercase-tracked, the one line that's always shown. */
  title: React.ReactNode;
  /** Optional secondary explanation line. */
  body?: React.ReactNode;
  /** Vertical weight: sm (inline), md (default), lg (full panel). */
  size?: 'sm' | 'md' | 'lg';
  /** Fill + center in the parent (for full-height panel bodies). */
  fill?: boolean;
  /** Optional CTA / action row under the body. */
  children?: React.ReactNode;
  className?: string;
}

const PAD: Record<NonNullable<EmptyStateProps['size']>, string> = {
  sm: 'py-4',
  md: 'py-8',
  lg: 'py-12',
};

/**
 * The house empty / "nothing here yet" state. One look — a centered, mono,
 * uppercase-tracked line (optionally an icon chip + a body line + a CTA) —
 * instead of the same `text-center text-textMuted` markup re-spelled with a
 * different padding and casing on every desk.
 */
const EmptyState = ({ icon: Icon, title, body, size = 'md', fill = false, children, className = '' }: EmptyStateProps) => (
  <div
    className={`flex flex-col items-center justify-center text-center ${fill ? 'h-full p-4' : PAD[size]} ${className}`}
  >
    {Icon && (
      <span className="inline-flex w-8 h-8 mb-2 rounded-md border border-borderSubtle bg-inset items-center justify-center">
        <Icon className="w-4 h-4 text-textMuted" />
      </span>
    )}
    <span className="font-mono text-label font-semibold uppercase tracking-widest text-textSecondary">{title}</span>
    {body && <span className="mt-1 text-label text-textMuted leading-relaxed max-w-[260px]">{body}</span>}
    {children && <div className="mt-3">{children}</div>}
  </div>
);

export default EmptyState;
