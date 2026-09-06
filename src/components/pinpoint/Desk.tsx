import type { HTMLAttributes, ReactNode } from 'react';

/*
==================================================
  SLAYER TERMINAL - PINPOINT FURNITURE (components/pinpoint/Desk.tsx)
  The few shapes a desk is made of.
==================================================

  ── THIS FILE HAS BEEN WRONG TWICE, IN OPPOSITE DIRECTIONS ────────────────

  VERSION ONE gave every section a rounded border, a panel fill, a coloured
  inset rule along its top edge and a coloured dot beside its title. Levels
  came out as eight identical floating boxes, each with its own stripe.

  VERSION TWO read that as "decoration is the problem" and deleted all of
  it: no border, no radius, no fill anywhere, a label and a hairline and the
  content, everything sitting directly on the canvas.

  Noah, on the result: "i still don't like the ui looks very ai slop and not
  polished". He is right, and the diagnosis in version two was wrong. The
  fault in version one was never that the cards HAD a border — it was that
  the border was UNIFORM: a hero chart and a three-line text card wore the
  same box, so the decoration distinguished nothing and the eye had no
  reason to land anywhere. Deleting it removed the noise and the structure
  together, and what was left was one flat black plane with grey text on it,
  which reads as a wireframe rather than as a product.

  ── WHAT ACTUALLY MAKES A DENSE UI LOOK FINISHED ──────────────────────────

  Not ornament. Four things, and this file now owes all four:

    FIGURE AND GROUND. Content sits on a surface that is not the page. One
    step — `panel` over `canvas`, already in the palette and used by every
    other section of this product except this one — is enough to tell a
    reader where a thing begins and ends without a single line of ornament.

    ONE RHYTHM. Version two's padding was ad hoc: pb-1.5 here, pt-2.5
    there, gap-7 between sections and py-0.5 inside them, chosen per call
    site. Inconsistent spacing is the single most legible sign that nobody
    drew the thing. There is one scale now — 8 / 12 / 14 / 16 / 24 — and
    the primitives are the only places allowed to spend it.

    ONE RADIUS. 8px on a panel, 6px on a control, and nothing else. A radius
    that varies by component is the same failure as spacing that varies.

    STATES. Every control gets the same hover, the same focus ring and the
    same transition, from one exported class. Bare text that changes colour
    on hover is a link; a control that a reader can tab to and see is what
    makes an interface feel built.

  Emphasis is still bought with size, weight, position and space, and never
  with a hue — that part of version two was right and survives. What changed
  is that the page now has surfaces to put things on.

  ── THE TYPE SCALE ────────────────────────────────────────────────────────

    10px  label   mono, uppercase, tracked — the word for what a number is
    11px  title   a section's name; body copy's louder sibling
    11px  body    the desk's small print
    13px  read    prose a reader is meant to actually read
          num     the same step in numerals — a fact inside a table or a row

  THE CEILING IS 13 and it is measured, not chosen: the largest type
  anywhere on Trace is 14px and on Terrain 13px, and this section sits
  between them in the same product. Pinpoint used to print a 28px regime and
  an 18px figure — twice the biggest thing on either neighbour, which is why
  it felt like a different application. `figure` and `lead` are weights at
  the same size rather than sizes of their own.

  Numbers are mono and tabular so columns align and a changing digit does
  not reflow its neighbours. Three weights: 400, 600, 700.
*/

/** The five sizes. Nothing on a Pinpoint desk sets a size outside this. */
export const TYPE = {
  label: 'font-mono text-[10px] uppercase tracking-[0.12em]',
  title: 'font-mono text-[11px] uppercase tracking-[0.1em] font-semibold',
  body: 'text-[11px] leading-snug',
  read: 'text-[13px] leading-relaxed',
  num: 'font-mono text-[13px] leading-none tnum font-semibold',
  figure: 'font-mono text-[13px] leading-none tnum font-semibold',
  lead: 'font-mono text-[13px] leading-none tnum font-bold',
} as const;

/*
  ONE CONTROL LOOK, EXPORTED ONCE.

  Every button on every desk imports this instead of spelling its own
  padding and hover. The focus ring is the half that was missing entirely: a
  keyboard reader could tab through the metric rail and the side selector
  with nothing on screen telling them where they were.

  `focus-visible`, not `focus`, so a mouse click does not leave a ring behind
  it — the reader who did not ask for one never sees one.
*/
export const CONTROL =
  'rounded-md px-2 py-1 transition-colors duration-150 outline-none ' +
  'hover:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-white/40 ' +
  'disabled:cursor-not-allowed disabled:hover:bg-transparent';

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
  /**
   * Content meets the panel's own edge instead of sitting inside its
   * padding. For a table or a grid that IS the section — a bordered grid
   * inside a bordered panel is two boxes drawn around one thing, and the
   * inner one always looks like a mistake.
   */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * A titled panel: a surface, a header, its content.
 *
 * The surface is one step off the canvas and the border is a hairline, so a
 * column of these reads as a set of things rather than as a set of boxes.
 */
export const Section = ({
  title,
  note,
  actions,
  flush = false,
  className = '',
  bodyClassName = '',
  children,
}: SectionProps) => (
  <section className={`flex flex-col min-w-0 rounded-lg border border-borderSubtle bg-panel ${className}`}>
    <header className="flex items-baseline gap-x-3 gap-y-1 flex-wrap px-3.5 pt-3 pb-2.5 border-b border-borderSubtle">
      <h2 className={`${TYPE.title} text-textPrimary shrink-0`}>{title}</h2>
      {/* min-w-[28ch] is load-bearing. With `min-w-0` the note shrinks to
          whatever is left over, and in a 320px rail that meant a 40px column
          setting one word per line — measured on Pain and Compare. A minimum
          measure makes flex-wrap drop it to its own line instead, which is
          what a subtitle should do when the title's line is full. */}
      {note && <p className={`${TYPE.body} text-textMuted min-w-[28ch] flex-1`}>{note}</p>}
      {actions && <div className="ml-auto flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
    <div className={`flex-1 min-h-0 ${flush ? '' : 'px-3.5 py-3'} ${bodyClassName}`}>{children}</div>
  </section>
);

/**
 * A region that scrolls inside itself.
 *
 * The rule is mechanical: if content is clipped to a height and scrolls, it
 * gets an edge, because otherwise a reader cannot tell a list that ended
 * from a list that was cut off. Inside a `flush` Section it needs no border
 * of its own — the panel is already the edge — so this draws the hairline
 * only where it is asked to.
 */
export const Pane = ({
  children,
  bordered = true,
  className = '',
  ...rest
}: { children: ReactNode; bordered?: boolean; className?: string } & HTMLAttributes<HTMLDivElement>) => (
  <div className={`${bordered ? 'border border-borderSubtle rounded-md' : ''} min-w-0 ${className}`} {...rest}>
    {children}
  </div>
);

/**
 * The desk's shape: one dominant thing, a subordinate column beside it, and
 * whatever else the desk needs underneath.
 *
 * The rail is narrower than a half and its type is smaller, so the hero wins
 * by construction rather than by decoration. The dividing rule that used to
 * separate them is gone: both columns are panels now and carry their own
 * edges, and a third line between two bordered things is one line too many.
 */
export const Deck = ({
  hero,
  rail,
  children,
  className = '',
}: {
  hero: ReactNode;
  rail: ReactNode;
  children?: ReactNode;
  className?: string;
}) => (
  <div className={`flex flex-col gap-4 ${className}`}>
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px] gap-4 items-start">
      <div className="min-w-0 flex flex-col gap-4">{hero}</div>
      <div className="min-w-0 flex flex-col gap-4">{rail}</div>
    </div>
    {children}
  </div>
);

/** Equal-weight sections in a row, on the same gutter as everything else. */
export const Bench = ({
  children,
  cols = 3,
  className = '',
}: {
  children: ReactNode;
  cols?: 1 | 2 | 3 | 4;
  className?: string;
}) => {
  const grid = cols === 1 ? '' : cols === 2 ? 'md:grid-cols-2' : cols === 4 ? 'md:grid-cols-2 2xl:grid-cols-4' : 'md:grid-cols-3';
  return <div className={`grid grid-cols-1 ${grid} gap-4 ${className}`}>{children}</div>;
};

/**
 * A number with the word for what it is.
 *
 * `lead` is the one figure a desk is about, `figure` is a fact worth
 * reading, `sm` a supporting count — all at one size, separated by weight.
 * The optional `sub` is for a unit or a qualifier, not a second sentence.
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
  <div className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
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
 * The word itself, in its ink, at label size. No pill and no ring: the ink
 * and the caps are already the signal, and a bordered chip around every
 * state was the third uniform decoration on the old cards.
 */
export const Tag = ({
  children,
  ink,
  title,
  className = '',
}: {
  children: ReactNode;
  ink?: string;
  title?: string;
  className?: string;
}) => (
  <span
    title={title}
    className={`${TYPE.label} font-bold whitespace-nowrap ${ink ? '' : 'text-textSecondary'} ${className}`}
    style={ink ? { color: ink } : undefined}
  >
    {children}
  </span>
);

/** What the inks on a chart mean. Only under charts that use more than two. */
export const Legend = ({
  items,
  className = '',
}: {
  items: { ink: string; label: string; dashed?: boolean }[];
  className?: string;
}) => (
  <div className={`flex items-center gap-x-4 gap-y-1 flex-wrap ${TYPE.label} text-textMuted ${className}`}>
    {items.map(it => (
      <span key={it.label} className="inline-flex items-center gap-1.5">
        <span
          className="inline-block w-2.5"
          style={
            it.dashed
              ? { backgroundImage: `repeating-linear-gradient(90deg, ${it.ink} 0 2px, transparent 2px 4px)`, height: '2px' }
              : { background: it.ink, height: '2px' }
          }
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
  <div className={`flex flex-wrap items-start gap-x-8 gap-y-4 ${className}`}>{children}</div>
);
