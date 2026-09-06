import type { ReactNode } from 'react';

/*
==================================================
  SLAYER TERMINAL - PINPOINT DESK FURNITURE (components/pinpoint/Desk.tsx)
  The few shapes every rebuilt Pinpoint desk is made of.
==================================================

  Noah on the old section: "some of the things i have i cant understand
  some of it and the placements are super bad." Two rules came out of
  that, and this file is where they are enforced.

  EVERY SECTION IS A QUESTION. A card titled "Exposure Matrix" tells a
  reader what the engine calls the thing; a card titled "Where the walls
  are" tells them why to look. The title is the plain phrase, the
  `question` line under it says what the numbers answer, and the jargon
  goes in the body where a glossary term can carry it.

  ONE PLACEMENT GRAMMAR. A desk is a HERO (the one picture that is the
  page), a RAIL beside it (the levels and the read — what to do with the
  picture), and BENCHES under both (the supporting reads, each a card of
  the same shape). The reader's eye lands on the hero, moves right to the
  numbers, then down. Every desk in the section is built this way, so the
  second desk is already familiar.
*/

interface SectionProps {
  title: ReactNode;
  /** What the section answers — plain words, one line. */
  question?: ReactNode;
  /** A colour for the top rule and the title dot: what this card is about. */
  accent?: string;
  actions?: ReactNode;
  /** No body padding — grids and charts bleed to the edges. */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export const Section = ({ title, question, accent, actions, flush = false, className = '', bodyClassName = '', children }: SectionProps) => (
  <section
    className={`relative flex flex-col min-w-0 rounded-lg border border-borderSubtle bg-panel overflow-hidden ${className}`}
    style={accent ? { boxShadow: `inset 0 2px 0 0 ${accent}` } : undefined}
  >
    <header className="flex items-start gap-3 px-3.5 pt-3 pb-2">
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-2 text-[13px] font-bold tracking-tight text-textPrimary leading-none">
          {accent && <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accent }} aria-hidden />}
          <span className="truncate">{title}</span>
        </h2>
        {question && <p className="mt-1 text-[11px] leading-snug text-textSecondary">{question}</p>}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </header>
    <div className={`flex-1 min-h-0 ${flush ? '' : 'px-3.5 pb-3.5'} ${bodyClassName}`}>{children}</div>
  </section>
);

/** Hero + rail + benches. */
export const Deck = ({ hero, rail, children, className = '' }: { hero: ReactNode; rail: ReactNode; children?: ReactNode; className?: string }) => (
  <div className={`flex flex-col gap-4 ${className}`}>
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
      <div className="xl:col-span-8 min-w-0 flex flex-col">{hero}</div>
      <div className="xl:col-span-4 min-w-0 flex flex-col gap-4">{rail}</div>
    </div>
    {children}
  </div>
);

/** A row of equal benches under the deck. */
export const Bench = ({ children, cols = 3, className = '' }: { children: ReactNode; cols?: 1 | 2 | 3 | 4; className?: string }) => {
  const grid = cols === 1 ? '' : cols === 2 ? 'lg:grid-cols-2' : cols === 4 ? 'lg:grid-cols-2 2xl:grid-cols-4' : 'lg:grid-cols-3';
  return <div className={`grid grid-cols-1 ${grid} gap-4 items-stretch ${className}`}>{children}</div>;
};

/** A figure with the question it answers under it. Big for a hero number. */
export const Figure = ({
  label,
  value,
  sub,
  ink = 'text-textPrimary',
  size = 'md',
  className = '',
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  /** A tailwind text class or a raw colour. */
  ink?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) => {
  const sz = size === 'xl' ? 'text-[32px] leading-none' : size === 'lg' ? 'text-[22px] leading-none' : size === 'sm' ? 'text-[12px] leading-tight' : 'text-[16px] leading-tight';
  const raw = ink.startsWith('#') || ink.startsWith('rgb');
  return (
    <div className={`flex flex-col gap-0.5 min-w-0 ${className}`}>
      <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted whitespace-nowrap">{label}</span>
      <span className={`font-mono font-bold tnum ${sz} ${raw ? '' : ink}`} style={raw ? { color: ink } : undefined}>
        {value}
      </span>
      {sub && <span className="text-[10px] text-textMuted leading-snug">{sub}</span>}
    </div>
  );
};

/** The plain-English "so what" — a lead in the accent's ink, then the body. */
export const Read = ({
  lead,
  children,
  ink = '#a3a3a3',
  className = '',
}: {
  lead?: ReactNode;
  children: ReactNode;
  ink?: string;
  className?: string;
}) => (
  <div className={`relative pl-3 ${className}`} style={{ boxShadow: `inset 3px 0 0 0 ${ink}` }}>
    {lead && (
      <p className="text-[12px] font-semibold leading-snug" style={{ color: ink }}>
        {lead}
      </p>
    )}
    <div className="text-[12px] text-textPrimary leading-relaxed">{children}</div>
  </div>
);

/** A small chip in an ink — a grade, an owner, a kind. */
export const Tag = ({ children, ink = '#a3a3a3', title, className = '' }: { children: ReactNode; ink?: string; title?: string; className?: string }) => (
  <span
    title={title}
    className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${className}`}
    style={{ color: ink, background: `${ink}1a`, boxShadow: `inset 0 0 0 1px ${ink}55` }}
  >
    {children}
  </span>
);

/** A legend row: swatch + word, for the ink a chart is using. */
export const Legend = ({ items, className = '' }: { items: { ink: string; label: string; dashed?: boolean }[]; className?: string }) => (
  <div className={`flex items-center gap-x-3 gap-y-1 flex-wrap font-mono text-[9px] uppercase tracking-wider text-textMuted ${className}`}>
    {items.map(it => (
      <span key={it.label} className="inline-flex items-center gap-1.5">
        <span
          className="inline-block w-3 h-[3px] rounded-sm"
          style={it.dashed ? { backgroundImage: `repeating-linear-gradient(90deg, ${it.ink} 0 3px, transparent 3px 5px)` } : { background: it.ink }}
        />
        {it.label}
      </span>
    ))}
  </div>
);
