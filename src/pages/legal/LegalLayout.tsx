import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { PROSE_MEASURE } from '../../components/layout/container';

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
 * Readable prose column — sans body over the terminal's mono chrome — with a
 * consistent header, effective date and section rhythm.
 */
const slug = (i: number) => `section-${i + 1}`;

const LegalLayout = ({ title, intro, sections }: LegalLayoutProps) => (
  /*
    A document, so it keeps a readable measure — but it is CENTRED on the page,
    not pinned to the left of it.

    This used to be `max-w-6xl mx-auto` wrapping a `[190px, 1fr]` grid whose
    prose cell then capped itself at `max-w-3xl` and left-aligned. The outer box
    was centred; the words inside it were not, so the text sat left of the
    page's midline while the bar above and the footer below were symmetric.

    Now the page container owns the width (see layout/container.ts), the pair is
    centred within it, and the prose is centred in its own cell. Everything on
    the page shares one midline.
  */
  <div className="w-full lg:grid lg:grid-cols-[190px_minmax(0,auto)] lg:justify-center lg:gap-12">
    {/* Sticky contents — desktop only; jumps to each section anchor */}
    <nav aria-label="Contents" className="hidden lg:block">
      <div className="sticky top-6 flex flex-col gap-1.5">
        <span className="font-mono text-micro font-semibold uppercase tracking-widest text-select/80 mb-1.5">
          Contents
        </span>
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
      </div>
    </nav>

    <div className={`${PROSE_MEASURE} min-w-0`}>
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 font-mono text-label uppercase tracking-widest text-textMuted hover:text-textPrimary transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to site
      </Link>

      <header className="mt-4 pb-5 border-b border-borderSubtle">
        <h1 className="text-2xl font-bold text-textPrimary">{title}</h1>
        {/* The one fact on the page that goes stale. Amber is the house's
            data-freshness colour, and an effective date is exactly that: a
            stamp saying which version of the document you are reading. */}
        <p className="mt-1 inline-flex items-center gap-1.5 rounded border border-warn/25 bg-warn/[0.06] px-2 py-0.5 font-mono text-label uppercase tracking-widest text-warn">
          Effective {LEGAL_EFFECTIVE}
        </p>
        <p className="mt-4 text-body leading-relaxed text-textSecondary">{intro}</p>
      </header>

      <div className="mt-6 flex flex-col gap-6 pb-4">
        {sections.map((s, i) => (
          <section key={s.heading} id={slug(i)} className="scroll-mt-6 border-l-2 border-select/20 pl-4 -ml-4">
            <h2 className="font-mono text-caption font-semibold uppercase tracking-wider text-textPrimary">
              <span className="text-select/70 mr-2 tnum">{String(i + 1).padStart(2, '0')}</span>
              {s.heading}
            </h2>
            <div className="mt-2 text-data leading-relaxed text-textSecondary space-y-2.5">{s.body}</div>
          </section>
        ))}
      </div>

      <p className="mt-2 pt-5 border-t border-borderSubtle text-caption leading-relaxed text-textMuted">
        Questions about this document? Contact{' '}
        <a href="mailto:info@slayerterminal.com" className="text-textSecondary hover:text-textPrimary transition-colors">
          info@slayerterminal.com
        </a>
        .
      </p>
    </div>
  </div>
);

export default LegalLayout;
