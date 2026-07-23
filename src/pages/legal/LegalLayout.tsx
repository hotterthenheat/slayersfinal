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
 * Readable prose column — sans body over the terminal's mono chrome — with a
 * consistent header, effective date and section rhythm.
 */
const slug = (i: number) => `section-${i + 1}`;

const LegalLayout = ({ title, intro, sections }: LegalLayoutProps) => (
  // Wider outer frame on desktop so the section TOC fills the left rail that a
  // centered prose column otherwise leaves empty; single column below lg.
  <div className="w-full max-w-6xl mx-auto lg:grid lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-12">
    {/* Sticky contents — desktop only; jumps to each section anchor */}
    <nav aria-label="Contents" className="hidden lg:block">
      <div className="sticky top-6 flex flex-col gap-1.5">
        <span className="font-mono text-micro font-semibold uppercase tracking-widest text-textMuted mb-1.5">
          Contents
        </span>
        {sections.map((s, i) => (
          <a
            key={s.heading}
            href={`#${slug(i)}`}
            className="group inline-flex gap-2 font-mono text-label text-textMuted hover:text-textPrimary transition-colors focus-visible:outline-none focus-visible:text-textPrimary"
          >
            <span className="tnum text-textMuted/70 group-hover:text-textSecondary">{String(i + 1).padStart(2, '0')}</span>
            <span className="capitalize leading-snug">{s.heading}</span>
          </a>
        ))}
      </div>
    </nav>

    <div className="max-w-3xl min-w-0">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 font-mono text-label uppercase tracking-widest text-textMuted hover:text-textPrimary transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to site
      </Link>

      <header className="mt-4 pb-5 border-b border-borderSubtle">
        <h1 className="text-2xl font-bold text-textPrimary">{title}</h1>
        <p className="mt-1 font-mono text-label uppercase tracking-widest text-textMuted">
          Effective {LEGAL_EFFECTIVE}
        </p>
        <p className="mt-4 text-body leading-relaxed text-textSecondary">{intro}</p>
      </header>

      <div className="mt-6 flex flex-col gap-6 pb-4">
        {sections.map((s, i) => (
          <section key={s.heading} id={slug(i)} className="scroll-mt-6">
            <h2 className="font-mono text-caption font-semibold uppercase tracking-wider text-textPrimary">
              <span className="text-textMuted mr-2 tnum">{String(i + 1).padStart(2, '0')}</span>
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
