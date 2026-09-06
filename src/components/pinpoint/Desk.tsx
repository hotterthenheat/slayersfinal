import type { HTMLAttributes, ReactNode } from 'react';

/*
==================================================
  SLAYER TERMINAL - PINPOINT FURNITURE (components/pinpoint/Desk.tsx)
  The few shapes a desk is made of — after the cards came off.
==================================================

  ── WHAT THIS FILE USED TO DO, AND WHY IT WAS WRONG ───────────────────────

  Version one gave every section a rounded border, a panel fill, a coloured
  inset rule along its top edge and a coloured dot beside its title. The
  Levels desk came out as eight identical floating boxes, each with its own
  stripe. Three problems, all the same problem:

    · Nothing could dominate. A hero chart and a three-line text card wore
      the same border, the same radius, the same fill — so the eye had no
      reason to land on the chart first.
    · The stripe informed nothing. A decoration applied to every card
      distinguishes no card; it is a system that has stopped being one.
    · The boxes ate the space. Eight borders, eight paddings and eight gaps
      is a column of chrome down a page whose whole job is density.

  ── WHAT REPLACED THEM ────────────────────────────────────────────────────

  A terminal is a continuous surface divided by rules, not a scatter of
  cards. A section is now a LABEL, a HAIRLINE and its CONTENT. That is the
  whole vocabulary. Sections sit on the page's own background; the frame
  belongs to the page, not to each thing on it.

  Emphasis is bought with size, weight, position and space — never with a
  border and never with a hue. The one exception is `Pane`, and it is not
  emphasis at all: content that scrolls inside a fixed height is being CUT
  OFF, and an edge a reader cannot see is a usability bug rather than a
  minimalism win. `Pane` draws that edge and nothing else claims a box.

  ── THE TYPE SCALE ────────────────────────────────────────────────────────

  FIVE SIZES. Version one used eleven: 8, 9, 10, 11, 12, 13, 14, 15, 18, 22
  and 28 px, most of them a pixel apart from a neighbour and none of them
  chosen against the others. A step a reader cannot perceive is not a level of
  hierarchy, it is noise with an invoice.

    10px  label   mono, uppercase, tracked — the word for what a number is
    11px  body    the desk's small print
    13px  read    prose a reader is meant to actually read
          num     the same step in numerals — a fact inside a table or a row
    18px  figure  a number that matters
    28px  lead    the ONE number a desk is about

  `read` and `num` are one size in two faces, so a sentence and the number
  it is about sit on the same line without either winning.

  Numbers are mono and tabular so columns align and a changing digit does
  not reflow its neighbours. Three weights: 400, 600, 700. Not 500, and not
  900 — `font-black` on a 22px mono numeral was two escalations at once.
*/

/** The five sizes. Nothing on a Pinpoint desk sets a size outside this. */
export const TYPE = {
  label: 'font-mono text-[10px] uppercase tracking-[0.12em]',
  body: 'text-[11px] leading-snug',
  read: 'text-[13px] leading-relaxed',
  num: 'font-mono text-[13px] leading-none tnum font-semibold',
  figure: 'font-mono text-[18px] leading-none tnum font-semibold',
  lead: 'font-mono text-[28px] leading-none tnum font-bold',
} as const;

interface SectionProps {
  /** Two or three words. The section's whole identity. */
  title: ReactNode;
  /**
   * Only where a reader could not infer the answer from the title and the
   * thing itself. A subtitle under every heading is a template, not a
   * hierarchy — if it restates the title or repeats the chart's legend, it
   * does not go here.
   */
  note?: ReactNode;
  /** Controls or a count, on the title's line. */
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * A label, a hairline, the content.
 *
 * No border, no radius, no fill — the page is the surface, and space is what
 * separates one section from the next.
 */
export const Section = ({ title, note, actions, className = '', bodyClassName = '', children }: SectionProps) => (
  <section className={`flex flex-col min-w-0 ${className}`}>
    <header className="flex items-baseline gap-x-4 gap-y-1 flex-wrap border-b border-borderSubtle pb-1.5">
      <h2 className={`${TYPE.label} text-textPrimary font-semibold shrink-0`}>{title}</h2>
      {/* min-w-[28ch] is load-bearing. With `min-w-0` the note would shrink to
          whatever was left over, and in the 320px rail that meant a 40px column
          setting one word per line — measured on Pain and Compare. A minimum
          measure makes flex-wrap drop it to its own line instead, which is what
          a subtitle should do when the title's line is full. */}
      {note && <p className={`${TYPE.body} text-textMuted min-w-[28ch] flex-1`}>{note}</p>}
      {actions && <div className="ml-auto flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
    <div className={`flex-1 min-h-0 pt-2.5 ${bodyClassName}`}>{children}</div>
  </section>
);

/**
 * A region that scrolls inside itself.
 *
 * The only box on a Pinpoint desk, and the rule is mechanical: if the
 * content is clipped to a height and scrolls, it gets the border, because
 * otherwise the reader cannot tell a list that ended from a list that was
 * cut off. Square, unfilled, one hairline. Anything that fits its space
 * does not get one — that includes every chart on the section.
 */
export const Pane = ({ children, className = '', ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) => (
  <div className={`border border-borderSubtle min-w-0 ${className}`} {...rest}>
    {children}
  </div>
);

/**
 * The desk's shape: one dominant thing, a subordinate column beside it, and
 * whatever else the desk needs underneath.
 *
 * The rail is narrower than a half and its type is smaller, so the hero wins
 * by construction rather than by decoration.
 */
export const Deck = ({ hero, rail, children, className = '' }: { hero: ReactNode; rail: ReactNode; children?: ReactNode; className?: string }) => (
  <div className={`flex flex-col gap-7 ${className}`}>
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-x-8 gap-y-7 items-start">
      <div className="min-w-0 flex flex-col">{hero}</div>
      <div className="min-w-0 flex flex-col gap-6 xl:border-l xl:border-borderSubtle xl:pl-6">{rail}</div>
    </div>
    {children}
  </div>
);

/** Equal-weight sections in a row, divided by the same hairline as everything else. */
export const Bench = ({ children, cols = 3, className = '' }: { children: ReactNode; cols?: 1 | 2 | 3 | 4; className?: string }) => {
  const grid = cols === 1 ? '' : cols === 2 ? 'md:grid-cols-2' : cols === 4 ? 'md:grid-cols-2 2xl:grid-cols-4' : 'md:grid-cols-3';
  return <div className={`grid grid-cols-1 ${grid} gap-x-8 gap-y-6 ${className}`}>{children}</div>;
};

/**
 * A number with the word for what it is.
 *
 * Three sizes, and the size IS the hierarchy: `lead` is the one figure a
 * desk is about, `figure` is a fact worth reading, `sm` is a supporting
 * count. The optional `sub` is for a unit or a qualifier — not for a second
 * sentence.
 */
export const Figure = ({
  label,
  value,
  sub,
  ink,
  size = 'figure',
  className = '',
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  /** A raw colour, and only for direction or identity. Omit for the default ink. */
  ink?: string;
  size?: 'sm' | 'figure' | 'lead';
  className?: string;
}) => (
  <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
    <span className={`${TYPE.label} text-textMuted whitespace-nowrap`}>{label}</span>
    <span
      className={size === 'lead' ? TYPE.lead : size === 'sm' ? TYPE.num : TYPE.figure}
      style={ink ? { color: ink } : undefined}
    >
      {value}
    </span>
    {sub && <span className={`${TYPE.body} text-textMuted`}>{sub}</span>}
  </div>
);

/** The plain-English so-what. Prose, at reading size, with nothing drawn on it. */
export const Read = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <p className={`${TYPE.read} text-textSecondary max-w-[68ch] ${className}`}>{children}</p>
);

/**
 * A one-word state — a grade, a kind, an owner.
 *
 * The word itself, in its ink, at label size. No pill, no tint, no ring:
 * the ink and the caps are already the signal, and a bordered chip around
 * every state was the third uniform decoration on the old cards.
 */
export const Tag = ({ children, ink, title, className = '' }: { children: ReactNode; ink?: string; title?: string; className?: string }) => (
  <span title={title} className={`${TYPE.label} font-bold whitespace-nowrap ${ink ? '' : 'text-textSecondary'} ${className}`} style={ink ? { color: ink } : undefined}>
    {children}
  </span>
);

/** What the inks on a chart mean. Only under charts that use more than two. */
export const Legend = ({ items, className = '' }: { items: { ink: string; label: string; dashed?: boolean }[]; className?: string }) => (
  <div className={`flex items-center gap-x-4 gap-y-1 flex-wrap ${TYPE.label} text-textMuted ${className}`}>
    {items.map(it => (
      <span key={it.label} className="inline-flex items-center gap-1.5">
        <span
          className="inline-block w-2.5 h-px"
          style={it.dashed ? { backgroundImage: `repeating-linear-gradient(90deg, ${it.ink} 0 2px, transparent 2px 4px)`, height: '2px' } : { background: it.ink, height: '2px' }}
        />
        {it.label}
      </span>
    ))}
  </div>
);

/**
 * A row of figures under a chart or across a section — the desk's one way of
 * putting several numbers on a line. Columns, not cards.
 */
export const FigureRow = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`flex flex-wrap items-start gap-x-10 gap-y-4 ${className}`}>{children}</div>
);
