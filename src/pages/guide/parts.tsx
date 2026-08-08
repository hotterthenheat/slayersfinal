import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

/*
  THE RULE FOR EVERY PAGE IN THIS DIRECTORY. It lives here because every guide
  page imports this file, and it used to live in Desks.tsx alone — which is
  precisely how it failed: two waves corrected the desk descriptions in that
  file and left the identical, now-false strings standing in Overview.tsx and
  Faq.tsx, where nobody was looking at the rule.

  Every claim in the guide is a claim about code that ships, so it goes stale
  the moment a desk moves. Four rules keep it honest.

  1. Name only panels, controls and routes that exist in the registries and
     subnavs: pulseRegistry, gex/subnav, flowdesk/subnav, proveit/ProveIt, and
     the route table in App.tsx. Routing failures here are SILENT — the
     catch-all sends an unmatched URL to a real page and a wrong `?view=` falls
     back to the first pane, so a broken link renders as a working one. Resolve
     a destination by reading the table, never by assuming the path works.
  2. Describe what an engine derives, not what a number looks like it means.
  3. Name the population before quoting a rate. A modeled analog is not a
     historical one and the difference is the whole of the claim.
  4. Keep worked reads mechanical. A printed level here would be a second
     derivation of gex.ts and would be wrong by the next tick.

  When a desk changes, grep the whole directory for the old wording. The pages
  overlap: Overview.tsx and Desks.tsx describe the same desks in different
  words, and Faq.tsx answers questions about both.

  Standing instruction, from two rounds of spot-fixes that left the guide
  contradicting itself: re-read the code path, not the previous paragraph. The
  board's score comes from data/compass.ts rankOf and the Weigher's from
  core/contractScore.ts, and they are different scales that happen to share one
  spoken lexicon.
*/

/**
 * A titled content block with the standard mono eyebrow heading.
 *
 * The eyebrow carries the interface accent rather than muted grey. It is the
 * one thing on a prose page that is chrome rather than content, which is
 * exactly what `select` is for, and it gives a page of text a spine the eye can
 * skim. Grey-on-grey headings made every guide page read as one undivided wall.
 */
export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col gap-3">
    <h2 className="font-mono text-label font-semibold uppercase tracking-widest text-select/80">{title}</h2>
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

/**
 * Inline keyboard key. Wears the interface accent, because a keycap IS the
 * interface talking — and because a page whose only visual events are keycaps
 * needs them to register as something rather than as more grey.
 */
export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded border border-select/30 bg-select/[0.07] font-mono text-label text-select align-middle">
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
