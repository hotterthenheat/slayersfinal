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
const LegalLayout = ({ title, intro, sections }: LegalLayoutProps) => (
  <div className="max-w-3xl mx-auto w-full">
    <Link
      to="/"
      className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-textMuted hover:text-textPrimary transition-colors"
    >
      <ArrowLeft className="w-3.5 h-3.5" /> Back to site
    </Link>

    <header className="mt-4 pb-5 border-b border-borderSubtle">
      <h1 className="text-2xl font-bold text-textPrimary">{title}</h1>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-textMuted">
        Effective {LEGAL_EFFECTIVE}
      </p>
      <p className="mt-4 text-[14px] leading-relaxed text-textSecondary">{intro}</p>
    </header>

    <div className="mt-6 flex flex-col gap-6 pb-4">
      {sections.map((s, i) => (
        <section key={s.heading}>
          <h2 className="font-mono text-[12px] font-semibold uppercase tracking-wider text-textPrimary">
            <span className="text-textMuted mr-2 tnum">{String(i + 1).padStart(2, '0')}</span>
            {s.heading}
          </h2>
          <div className="mt-2 text-[13.5px] leading-relaxed text-textSecondary space-y-2.5">{s.body}</div>
        </section>
      ))}
    </div>

    <p className="mt-2 pt-5 border-t border-borderSubtle text-[12px] leading-relaxed text-textMuted">
      Questions about this document? Contact{' '}
      <a href="mailto:info@slayerterminal.com" className="text-textSecondary hover:text-textPrimary transition-colors">
        info@slayerterminal.com
      </a>
      .
    </p>
  </div>
);

export default LegalLayout;
