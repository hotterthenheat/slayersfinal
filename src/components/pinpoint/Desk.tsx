import { ChevronRight } from 'lucide-react';
import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { ROW_INTERACTIVE, interactiveRowProps } from '../ui/interactiveRow';
import { Skeleton } from '../ui/Skeleton';

/*
==================================================
  SLAYER TERMINAL - PINPOINT DESIGN SYSTEM (components/pinpoint/Desk.tsx)
  The few shapes a desk is made of, and the rules they are made under.
==================================================

  ── THIS FILE HAS BEEN WRONG THREE TIMES ─────────────────────────────────

  VERSION ONE boxed every section in a rounded card with a coloured
  stripe. VERSION TWO deleted every box and left grey text on a black
  plane. VERSION THREE put the boxes back, uniformly, and Noah's verdict
  was "looks very ai slop and not polished". The redesign brief he then
  wrote lists "everything inside a card" first among the things to avoid.

  Each version treated the container as the thing that makes a page look
  designed. None of them did the thing that actually does, which is
  HIERARCHY: a reader should know in three seconds which of the nine
  things on the screen is the one the desk is about. A box around each of
  nine things ranks none of them. So does no box around any of them.

  ── THE SYSTEM ───────────────────────────────────────────────────────────

  TYPE carries the hierarchy. Three sizes, three weights, two cases:

    label   10 · mono · UPPERCASE · muted    the word for what a number is
    body    11                               small print, table text
    title   13 · semibold · sentence case    a region's name
    read    13                               prose meant to be read
    num     13 · mono · tabular · semibold   a figure
    lead    13 · mono · tabular · bold       the ONE figure a desk is about

  A region title and a field label used to wear the same clothes — ten to
  eleven pixel uppercase mono — which is why nothing ranked. The title is
  sentence case now and the label stays uppercase, so the two levels are
  told apart by case and weight before size is even read.

  The ceiling is 13px, measured off Terrain, and the strip's identity word
  shares it. A desk has no headline: the data is the biggest thing on the
  screen and everything else points at it.

  SPACE is one scale: 4 · 8 · 12 · 16 · 24 · 32 (Tailwind 1 2 3 4 6 8).
  Nothing in a page spends a half-step. Regions are 24 apart; inside a
  region the rhythm is 8 and 12.

  RADIUS is two values: 4px on a control or a chip, 6px on the one kind of
  box this section draws. Nothing is a pill and nothing is a circle.

  SURFACES. The page is the surface. A REGION is a heading, a hairline
  and its content, with no border and no fill — it is separated from its
  neighbours by space and by the rule under its name, which is enough.
  Exactly one thing earns a box: the SURFACE that answers the reader's
  selection (the strike they clicked, the pair they compared), because it
  changes as a unit and a reader's eye should be able to find it as one.
  A PANE is a scroll region and draws its edge for the same reason a
  window has a frame — so a list that was cut off can be told from one
  that ended.

  COLOUR is ink.ts's business and this file adds none. The palette's
  roles, for the record: canvas is the page, panel is a surface, the three
  text tiers are the three text tiers, borderSubtle is every hairline,
  `select` is the interface's own accent, bull/bear/warn/flip are success,
  error, warning and information — in a market's own words.

  CONTROLS are one look. Every button in the section wears CONTROL; every
  choice-of-N is a Segmented; every choice from a long list is a Select.
  The active option is a tint and a weight, not a pill and not a shadow.
  Every control has a keyboard focus ring and every clickable row is a
  Row, which can be reached by Tab and pressed with Enter.

  MOTION is state change only: a control's colour, a row's tint, the route
  cross-fade. Nothing on a desk moves by itself.
*/

/* ───────────────────────────── type ───────────────────────────────────── */

/** The scale. Nothing on a Pinpoint desk sets a size outside these tokens. */
export const TYPE = {
  label: 'font-mono text-label uppercase',
  body: 'text-body',
  title: 'text-title font-semibold',
  read: 'text-read',
  num: 'font-mono text-num tnum font-semibold',
  figure: 'font-mono text-num tnum font-semibold',
  lead: 'font-mono text-num tnum font-bold',
} as const;

/* ───────────────────────────── controls ───────────────────────────────── */

/**
 * The one control look. Every button imports this instead of spelling its
 * own padding and hover; the focus ring is the product's, so a keyboard
 * reader sees the same mark here that they see everywhere else.
 */
export const CONTROL =
  'rounded px-2 h-6 inline-flex items-center gap-1 font-mono text-body whitespace-nowrap ' +
  'transition-colors duration-150 outline-none hover:bg-white/[0.06] ' +
  'focus-visible:ring-1 focus-visible:ring-select/60 ' +
  'disabled:cursor-not-allowed disabled:hover:bg-transparent';

/** The active option, on CONTROL. A tint and a weight — nothing else. */
export const CONTROL_ON = 'bg-white/[0.09] text-textPrimary font-semibold';
export const CONTROL_OFF = 'text-textMuted hover:text-textPrimary';
/** A control that stands alone — an action rather than a choice — draws its edge. */
export const CONTROL_OUTLINE = 'border border-borderSubtle hover:border-borderMuted';

/**
 * A block that is a control — a podium card, a level in a list. Same
 * hover, same ring as CONTROL, without the one-line geometry.
 */
export const ROW =
  'w-full text-left rounded transition-colors duration-150 outline-none ' +
  'hover:bg-white/[0.03] focus-visible:ring-1 focus-visible:ring-select/60';

export interface Option<V extends string> {
  value: V;
  label: ReactNode;
  title?: string;
  disabled?: boolean;
}

/**
 * A choice of N, N small. `role="group"` with `aria-pressed` on each option
 * — the shape the sweep drives and the shape a screen reader announces as
 * "pressed, GEX, button, 1 of 3".
 */
export const Segmented = <V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
}: {
  options: readonly Option<V>[];
  value: V;
  onChange: (v: V) => void;
  ariaLabel: string;
  className?: string;
}) => (
  <div role="group" aria-label={ariaLabel} className={`inline-flex items-center gap-0.5 rounded-md border border-borderSubtle p-0.5 ${className}`}>
    {options.map(o => (
      <button
        key={o.value}
        type="button"
        aria-pressed={o.value === value}
        disabled={o.disabled}
        title={o.title}
        onClick={() => onChange(o.value)}
        className={`${CONTROL} ${o.value === value ? CONTROL_ON : CONTROL_OFF} ${o.disabled ? 'line-through text-textMuted/40' : ''}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

/**
 * A choice from a longer list. Native, so it is reachable by keyboard and by
 * a screen reader without rebuilding a listbox, and so a phone opens its own
 * picker for it.
 */
export const Select = <V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
}: {
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  ariaLabel: string;
  className?: string;
}) => (
  <select
    aria-label={ariaLabel}
    value={value}
    onChange={e => onChange(e.target.value as V)}
    className={`h-6 rounded-md border border-borderSubtle bg-canvas pl-2 pr-1 font-mono text-body text-textPrimary outline-none cursor-pointer hover:border-borderMuted focus-visible:ring-1 focus-visible:ring-select/60 ${className}`}
  >
    {options.map(o => (
      <option key={o.value} value={o.value} className="bg-canvas text-textPrimary">
        {o.label}
      </option>
    ))}
  </select>
);

/** A hairline between two groups on a toolbar. */
export const Divider = () => <span aria-hidden className="h-4 w-px bg-borderSubtle" />;

/**
 * A desk's controls, on one line. The things a reader chooses BEFORE the
 * picture means anything: scenario, session, partner, lens. Controls that
 * belong to one picture go on that picture's heading instead — near the
 * data they affect.
 */
export const Toolbar = ({ children, className = '', ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) => (
  <div className={`flex items-center gap-3 flex-wrap ${className}`} {...rest}>
    {children}
  </div>
);

/* ───────────────────────────── regions ────────────────────────────────── */

interface RegionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Two to five words, sentence case. The region's whole identity. */
  title: ReactNode;
  /**
   * Only where a reader could not infer the answer from the title and the
   * thing itself. A note under every heading is a template.
   */
  note?: ReactNode;
  /** Controls or a count, on the heading's line. */
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * A titled region: the name, a hairline, the content. No border, no fill,
 * no radius. This is the default container and most of a desk is made of
 * it. Two regions side by side read as two columns of one page rather than
 * as two boxes.
 */
export const Region = ({ title, note, actions, className = '', bodyClassName = '', children, ...rest }: RegionProps) => (
  <section className={`flex flex-col min-w-0 ${className}`} {...rest}>
    <header className="flex items-baseline gap-x-3 gap-y-1 flex-wrap pb-2 border-b border-borderSubtle">
      {/* Not `shrink-0`: a title that cannot shrink cannot wrap, and in a
          narrow Bench column it pushes out of its region. The note's own
          minimum measure is what keeps the line from collapsing. */}
      <h2 className={`${TYPE.title} text-textPrimary`}>{title}</h2>
      {note && <p className={`${TYPE.body} text-textMuted min-w-[28ch] flex-1`}>{note}</p>}
      {actions && <div className="ml-auto flex items-center gap-2 flex-wrap">{actions}</div>}
    </header>
    <div className={`pt-3 flex-1 min-h-0 ${bodyClassName}`}>{children}</div>
  </section>
);

/**
 * The one box. For the thing that answers the reader's selection — it
 * changes as a unit, so it is drawn as one. Not for grouping content that
 * a heading already groups.
 */
export const Surface = ({ title, note, actions, className = '', bodyClassName = '', children, ...rest }: Partial<RegionProps> & { children: ReactNode }) => (
  <section className={`rounded-md border border-borderSubtle bg-panel flex flex-col min-w-0 ${className}`} {...rest}>
    {(title || actions) && (
      <header className="flex items-baseline gap-x-3 gap-y-1 flex-wrap px-3 pt-3 pb-2 border-b border-borderSubtle">
        {title && <h2 className={`${TYPE.title} text-textPrimary`}>{title}</h2>}
        {note && <p className={`${TYPE.body} text-textMuted min-w-[28ch] flex-1`}>{note}</p>}
        {actions && <div className="ml-auto flex items-center gap-2 flex-wrap">{actions}</div>}
      </header>
    )}
    <div className={`px-3 py-3 flex-1 min-h-0 ${bodyClassName}`}>{children}</div>
  </section>
);

/**
 * A region that scrolls inside itself. It draws its edge so a list that
 * was cut off can be told from one that ended, and it OWNS the overflow —
 * a height cap with visible overflow lets content paint straight through
 * whatever sits below, which is how the Flow tape once ran through the
 * site footer.
 */
export const Pane = ({
  children,
  className = '',
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) => (
  <div className={`rounded-md border border-borderSubtle min-w-0 overflow-auto ${className}`} {...rest}>
    {children}
  </div>
);

/**
 * The desk's shape: one dominant thing, a subordinate column beside it, and
 * whatever else the desk needs under the dominant thing.
 *
 * The rail joins the hero from `lg`, not `xl`: on a 1024 laptop the readout
 * that answers a click used to sit a whole screen below the row that was
 * clicked. The trailing children flow under the hero column, not under the
 * grid, so a long rail leaves no void.
 */
export const Deck = ({ hero, rail, children, className = '' }: { hero: ReactNode; rail: ReactNode; children?: ReactNode; className?: string }) => (
  <div className={`grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start ${className}`}>
    <div className="min-w-0 flex flex-col gap-6">
      {hero}
      {children}
    </div>
    <div className="min-w-0 flex flex-col gap-6">{rail}</div>
  </div>
);

/** Equal-weight regions in a row, on the same gutter as everything else. */
export const Bench = ({ children, cols = 3, className = '' }: { children: ReactNode; cols?: 1 | 2 | 3 | 4; className?: string }) => {
  const grid = cols === 1 ? '' : cols === 2 ? 'md:grid-cols-2' : cols === 4 ? 'md:grid-cols-2 2xl:grid-cols-4' : 'md:grid-cols-3';
  return <div className={`grid grid-cols-1 ${grid} gap-6 ${className}`}>{children}</div>;
};

/* ───────────────────────────── figures and words ───────────────────────── */

/**
 * A number with the word for what it is. `lead` is the one figure a desk is
 * about; `figure` a fact worth reading; `sm` a supporting count — one size,
 * separated by weight.
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
  /** A raw colour, and only for direction or identity. */
  ink?: string;
  size?: 'sm' | 'figure' | 'lead';
  className?: string;
}) => (
  <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
    <span className={`${TYPE.label} text-textMuted whitespace-nowrap`}>{label}</span>
    <span className={size === 'lead' ? TYPE.lead : size === 'sm' ? TYPE.num : TYPE.figure} style={ink ? { color: ink } : undefined}>
      {value}
    </span>
    {sub && <span className={`${TYPE.body} text-textMuted`}>{sub}</span>}
  </div>
);

/** The plain-English so-what. Prose, at reading size, on a measure. */
export const Read = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <p className={`${TYPE.read} text-textSecondary max-w-[68ch] ${className}`}>{children}</p>
);

/** A one-word state — a grade, a kind, an owner. The word in its ink, at label size. */
export const Tag = ({ children, ink, title, className = '' }: { children: ReactNode; ink?: string; title?: string; className?: string }) => (
  <span title={title} className={`${TYPE.label} font-bold whitespace-nowrap ${ink ? '' : 'text-textSecondary'} ${className}`} style={ink ? { color: ink } : undefined}>
    {children}
  </span>
);

/** What the inks on a chart mean. Only under charts that use more than two. */
export const Legend = ({ items, className = '' }: { items: { ink: string; label: string; dashed?: boolean }[]; className?: string }) => (
  <div className={`flex items-center gap-x-4 gap-y-1 flex-wrap ${TYPE.label} text-textMuted ${className}`}>
    {items.map(it => (
      <span key={it.label} className="inline-flex items-center gap-1">
        <span
          className="inline-block w-3"
          style={it.dashed ? { backgroundImage: `repeating-linear-gradient(90deg, ${it.ink} 0 2px, transparent 2px 4px)`, height: 2 } : { background: it.ink, height: 2 }}
        />
        {it.label}
      </span>
    ))}
  </div>
);

/* ───────────────────────────── tables ─────────────────────────────────── */

export interface Col {
  key: string;
  label: ReactNode;
  align?: 'left' | 'right';
  /** A CSS width. Columns without one share what is left. */
  width?: string | number;
}

/**
 * One table for the section's eight. Label-size uppercase headers, a
 * hairline under them, and every numeric column right-aligned — a number's
 * decimal point is what a column of numbers aligns on.
 */
export const Table = ({
  cols,
  children,
  sticky = false,
  className = '',
  ...rest
}: { cols: Col[]; children: ReactNode; sticky?: boolean; className?: string } & HTMLAttributes<HTMLTableElement>) => (
  /* A table cannot shrink below its columns' content, so on a phone it
     scrolls sideways INSIDE its region rather than pushing the page — the
     Targets composition table was 5px wider than a 390 screen. */
  <div className="overflow-x-auto min-w-0">
    <table className={`w-full ${className}`} {...rest}>
      <thead className={sticky ? 'sticky top-0 z-10 bg-canvas' : ''}>
        <tr>
          {cols.map(c => (
            <Th key={c.key} align={c.align} style={c.width !== undefined ? { width: c.width } : undefined}>
              {c.label}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

export const Th = ({ align = 'left', className = '', children, ...rest }: { align?: 'left' | 'right'; className?: string; children?: ReactNode } & ThHTMLAttributes<HTMLTableCellElement>) => (
  <th scope="col" className={`${TYPE.label} text-textMuted font-normal px-2 py-2 border-b border-borderSubtle whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'} ${className}`} {...rest}>
    {children}
  </th>
);

/**
 * A row. Given `onSelect` it becomes a control: reachable by Tab, pressed by
 * Enter or Space, its selection carried as `aria-current`. A row that a
 * mouse can click and a keyboard cannot is the section's oldest defect and
 * this is where it is fixed once.
 */
export const Row = ({
  onSelect,
  selected = false,
  className = '',
  children,
  ...rest
}: { onSelect?: () => void; selected?: boolean; className?: string; children: ReactNode } & HTMLAttributes<HTMLTableRowElement>) => (
  <tr
    {...(onSelect ? interactiveRowProps(onSelect, selected, 'native') : {})}
    onClick={onSelect}
    className={`border-b border-borderSubtle/40 ${onSelect ? `${ROW_INTERACTIVE} hover:bg-white/[0.03]` : ''} ${selected ? 'bg-select/[0.06]' : ''} ${className}`}
    {...rest}
  >
    {children}
  </tr>
);

/** A cell. `num` right-aligns it in the figure voice. */
export const Cell = ({ num = false, className = '', children, ...rest }: { num?: boolean; className?: string; children?: ReactNode } & TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={`px-2 py-1 ${num ? `${TYPE.num} text-right` : TYPE.body} ${className}`} {...rest}>
    {children}
  </td>
);

/* ───────────────────────────── method ─────────────────────────────────── */

/**
 * Where a desk explains itself — one disclosure per desk, at the foot.
 *
 * The section used to draw its method as content: two to four regions per
 * desk of provenance, definitions and caveats, each with its own heading,
 * sitting between the reader and the next picture. Documentation is not
 * hidden here — it is one click, native, keyboard-reachable, and it is
 * where a reader who wants it will look, which is after the data.
 */
export const Method = ({ title = 'Method', children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) => (
  <details className={`group ${className}`} data-method>
    <summary className={`${CONTROL} ${CONTROL_OFF} ${TYPE.label} -ml-2 cursor-pointer select-none list-none`}>
      <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" aria-hidden />
      {title}
    </summary>
    <dl className="pt-3 flex flex-col gap-3 max-w-[72ch]">{children}</dl>
  </details>
);

/** One term and its sentence, inside a Method. */
export const Note = ({ term, children }: { term: ReactNode; children: ReactNode }) => (
  <div className="grid grid-cols-1 sm:grid-cols-[132px_minmax(0,1fr)] gap-x-6 gap-y-1">
    <dt className={`${TYPE.label} font-bold text-textSecondary`}>{term}</dt>
    <dd className={`${TYPE.body} text-textMuted leading-relaxed`}>{children}</dd>
  </div>
);

/* ───────────────────────────── loading ────────────────────────────────── */

/**
 * The desk's shape, held open while the first scan lands. The structure is
 * known — a hero and a rail — so the placeholder claims it and nothing
 * more; the DataState inside is what announces the wait.
 */
export const DeskLoading = ({ children }: { children: ReactNode }) => (
  <Deck
    hero={
      <div className="min-h-[320px] flex flex-col gap-3" aria-busy="true">
        <Skeleton h={8} w="w-40" />
        <div className="flex-1 min-h-0 flex items-center justify-center rounded-md border border-borderSubtle">{children}</div>
      </div>
    }
    rail={
      <div className="flex flex-col gap-6" aria-hidden>
        {[0, 1].map(i => (
          <div key={i} className="flex flex-col gap-3">
            <Skeleton h={8} w="w-32" />
            <Skeleton h={9} w="w-3/4" />
            <Skeleton h={9} w="w-1/2" />
          </div>
        ))}
      </div>
    }
  />
);
