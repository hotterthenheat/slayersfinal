import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

export const LEGAL_EFFECTIVE = 'July 2026';

interface Section {
  heading: string;
  body: ReactNode;
}

interface LegalLayoutProps {
  title: string;
  intro: string;
  sections: Section[];
}

/**
 * Shared shell for the static legal pages (Disclaimer / Terms / Privacy).
 *
 * ================================================================
 * These were the last pages in the app still leaving an empty band.
 *
 * The previous version centred a `max-w-3xl` prose column inside the page,
 * which measured as 200px of untouched width at a 1440 viewport and 760px at
 * 2560 — a document parked in the middle of a black screen. The fix is NOT to
 * let the text span: a 2200px line is unreadable, and shipping that would be
 * worse UI rather than better.
 *
 * So the measure moved from the PAGE to the SECTION. These documents are seven
 * to nine short, numbered, independent blocks — one or two paragraphs each —
 * which is exactly the shape that sets well in columns. `auto-fill` with a
 * ~34rem floor makes as many columns as fit and grows them to consume the
 * remainder: one column on a phone, two on a laptop, four at 2560. Every line
 * stays inside a reading measure at every width, and no width is left empty.
 *
 * The header follows the same rule: title and intro on the left, effective date
 * and contact pinned right, so the top band is used edge to edge instead of
 * trailing off after the intro.
 * ================================================================
 */
const slug = (i: number) => `section-${i + 1}`;

const LegalLayout = ({ title, intro, sections }: LegalLayoutProps) => (
  <div className="w-full flex flex-col gap-7">
    <Link
      to="/"
      className="inline-flex w-fit items-center gap-1.5 font-mono text-label uppercase tracking-widest text-textMuted hover:text-textPrimary transition-colors"
    >
      <ArrowLeft className="w-3.5 h-3.5" /> Back to site
    </Link>

    {/* Title block left, document metadata right — the row spans the column so
        the header does not trail off into empty width after the intro. */}
    <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between pb-5 border-b border-borderSubtle">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-textPrimary">{title}</h1>
        {/* Capping the INTRO is a line-length measure on one paragraph, not a
            box: it is left-anchored, so it shortens the line without pushing
            the page into the middle of the screen. */}
        <p className="mt-3 max-w-[80ch] text-body leading-relaxed text-textSecondary">{intro}</p>
      </div>
      <dl className="shrink-0 flex flex-row gap-8 lg:flex-col lg:gap-3 lg:text-right">
        <div>
          <dt className="font-mono text-micro uppercase tracking-widest text-textMuted">Effective</dt>
          {/* The one fact on the page that goes stale. Amber is the house's
              data-freshness colour, and an effective date is exactly that: a
              stamp saying which version of the document you are reading. */}
          <dd className="mt-0.5 font-mono text-label uppercase tracking-widest text-warn">{LEGAL_EFFECTIVE}</dd>
        </div>
        <div>
          <dt className="font-mono text-micro uppercase tracking-widest text-textMuted">Questions</dt>
          <dd className="mt-0.5">
            <a
              href="mailto:info@slayerterminal.com"
              className="font-mono text-label text-textSecondary hover:text-textPrimary transition-colors"
            >
              info@slayerterminal.com
            </a>
          </dd>
        </div>
      </dl>
    </header>

    {/* Contents — a horizontal jump strip rather than a left rail. A rail would
        reintroduce a fixed-width column beside a capped one, which is the shape
        that left the band in the first place. */}
    <nav aria-label="Contents" className="flex flex-wrap gap-x-5 gap-y-2 pb-1">
      {sections.map((s, i) => (
        <a
          key={s.heading}
          href={`#${slug(i)}`}
          className="group inline-flex gap-2 font-mono text-label text-textMuted hover:text-textPrimary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60 focus-visible:text-textPrimary"
        >
          <span className="tnum text-select/70 group-hover:text-select">{String(i + 1).padStart(2, '0')}</span>
          <span className="capitalize leading-snug">{s.heading}</span>
        </a>
      ))}
    </nav>

    {/* One column on a phone, as many ~34rem columns as the width affords after
        that. `min(100%, …)` keeps the floor from overflowing a narrow screen. */}
    <div
      className="grid gap-x-10 gap-y-7 items-start"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 34rem), 1fr))' }}
    >
      {sections.map((s, i) => (
        <section key={s.heading} id={slug(i)} className="scroll-mt-6 border-l-2 border-select/20 pl-4">
          <h2 className="font-mono text-caption font-semibold uppercase tracking-wider text-textPrimary">
            <span className="text-select/70 mr-2 tnum">{String(i + 1).padStart(2, '0')}</span>
            {s.heading}
          </h2>
          <div className="mt-2 text-data leading-relaxed text-textSecondary space-y-2.5">{s.body}</div>
        </section>
      ))}
    </div>
  </div>
);

export default LegalLayout;
