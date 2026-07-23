import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

/** A titled content block with the standard mono eyebrow heading. */
export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col gap-3">
    <h2 className="font-mono text-label font-semibold uppercase tracking-widest text-textMuted">{title}</h2>
    {children}
  </section>
);

/** A bordered card surface used throughout the help pages. */
export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-lg border border-borderSubtle bg-panel ${className}`}>{children}</div>
);

/** A highlighted note — used to point at the disclaimer or drop a tip. */
export const Callout = ({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) => (
  <div
    className={`rounded-lg border px-4 py-3 flex gap-3 text-data leading-relaxed ${
      tone === 'warn'
        ? 'border-warn/30 bg-warn/[0.06] text-textSecondary'
        : 'border-borderSubtle bg-white/[0.02] text-textSecondary'
    }`}
  >
    <Info className={`w-4 h-4 shrink-0 mt-0.5 ${tone === 'warn' ? 'text-warn' : 'text-textMuted'}`} />
    <div>{children}</div>
  </div>
);

/** Inline keyboard key. */
export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded border border-borderMuted bg-inset font-mono text-label text-textPrimary align-middle">
    {children}
  </kbd>
);

/** Bulleted list with the terminal's muted-dot rhythm. */
export const Points = ({ items }: { items: ReactNode[] }) => (
  <ul className="flex flex-col gap-1.5">
    {items.map((it, i) => (
      <li key={i} className="flex gap-2.5 text-data text-textSecondary leading-relaxed">
        <span className="text-textMuted shrink-0">·</span>
        <span>{it}</span>
      </li>
    ))}
  </ul>
);
