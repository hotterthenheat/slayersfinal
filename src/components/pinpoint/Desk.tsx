import { useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode, type RefObject, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';
import { ROW_INTERACTIVE, interactiveRowProps } from '../ui/interactiveRow';
import { Skeleton } from '../ui/Skeleton';

/*
==================================================
  SLAYER TERMINAL - PINPOINT WORKSPACE (components/pinpoint/Desk.tsx)
  One grammar for ten desks: a picture, an inspector, a strip of figures.
==================================================

  Four earlier versions of this file argued about containers — cards, no
  cards, panels, regions. Noah's verdict on the last of them: not a
  redesign. He is right: every one of them kept the same skeleton (a hero,
  a rail, benches of small regions), the same pictures, and the same wall
  of explanatory prose, and re-skinned around them.

  This is the section Noah named as the reference, Terrain, applied to
  Pinpoint. Terrain is ONE workspace: a picture that fills the screen,
  controls that are small and few, a slim rail beside it, and no prose at
  all — "i don't need to be told what page i'm on i know what i clicked".

  So a Pinpoint desk is:

    TOOLBAR     the few choices that change the picture. One row.
    PICTURE     one dominant drawing that fills the workspace. The strike
                axis is the spine of the whole section, so most desks draw
                a StrikeProfile; the rest draw a Series or a HeatField.
    INSPECTOR   the numbers, in groups of terse rows, beside the picture.
                It follows the pointer and the selection. It scrolls; the
                picture does not.
    STRIP       the desk's four to six headline figures under the picture,
                and at most ONE sentence of read.

  No region titles, no paragraphs, no method disclosures, no cards. A
  label is ten pixels of uppercase mono; a figure is thirteen pixels of
  tabular mono; definitions are on hover through Term, where a reader who
  wants one will look. Type stays at three sizes, space at one scale,
  radius at 4 on a control. Colour is ink.ts's business and this file adds
  none.

  The workspace is the viewport's height from `lg` — the picture gets the
  screen, the footer waits below the fold. On a phone it stacks and the
  page scrolls.
*/

/* ───────────────────────────── type ───────────────────────────────────── */

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

/** The control's shape without its size, so a dense head can set its own
    and still be the same control. */
export const CONTROL_BASE =
  'rounded inline-flex items-center gap-1 font-mono whitespace-nowrap ' +
  'transition-colors duration-150 outline-none hover:bg-white/[0.06] ' +
  'focus-visible:ring-1 focus-visible:ring-select/60 ' +
  'disabled:cursor-not-allowed disabled:hover:bg-transparent';
export const CONTROL = `${CONTROL_BASE} px-2 h-6 text-body`;
/**
 * The dense cut. A board panel's head holds a ticker, five families, four
 * expiries, the view toggles and a close in twenty-six pixels; at the
 * toolbar's height and size those do not fit five abreast. Same control,
 * label-sized and a hair shorter — not a second kind of button.
 */
export const CONTROL_DENSE = `${CONTROL_BASE} h-5 px-1 text-label uppercase font-semibold`;
/** A control that is one glyph. */
export const CONTROL_ICON = `${CONTROL_BASE} h-5 w-5 justify-center px-0`;
export const CONTROL_ON = 'bg-white/[0.09] text-textPrimary font-semibold';
export const CONTROL_OFF = 'text-textMuted hover:text-textPrimary';
export const CONTROL_OUTLINE = 'border border-borderSubtle hover:border-borderMuted';
/** A block that is a control — an inspector row a reader can pick. */
export const ROW =
  'w-full text-left rounded transition-colors duration-150 outline-none hover:bg-white/[0.04] ' +
  'focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60';

export interface Option<V extends string> {
  value: V;
  label: ReactNode;
  title?: string;
  disabled?: boolean;
}

export const Segmented = <V extends string>({ options, value, onChange, ariaLabel, className = '' }: { options: readonly Option<V>[]; value: V; onChange: (v: V) => void; ariaLabel: string; className?: string }) => (
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

export const Select = <V extends string>({ options, value, onChange, ariaLabel, className = '' }: { options: readonly { value: V; label: string }[]; value: V; onChange: (v: V) => void; ariaLabel: string; className?: string }) => (
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

export const Divider = () => <span aria-hidden className="h-4 w-px bg-borderSubtle" />;

export const Toolbar = ({ children, className = '', ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) => (
  <div className={`flex items-center gap-3 flex-wrap ${className}`} {...rest}>
    {children}
  </div>
);

/* ───────────────────────────── the workspace ──────────────────────────── */

/**
 * The desk. The picture takes the screen; the inspector scrolls beside it;
 * the strip sits under both. `drawer` is a short scrolling table under the
 * picture for the one thing that is a list of trades rather than a number
 * — the prints behind a picked strike.
 */
export const Workspace = ({ toolbar, picture, drawer, inspector, strip, className = '', ...rest }: { toolbar?: ReactNode; picture: ReactNode; drawer?: ReactNode; inspector: ReactNode; strip?: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) => (
  <div className={`flex flex-col gap-3 lg:h-[calc(100vh-11rem)] lg:min-h-[560px] ${className}`} data-workspace {...rest}>
    {toolbar}
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_288px] gap-x-6 gap-y-4">
      <div className="min-w-0 min-h-0 flex flex-col gap-3" data-picture>
        <div className="flex-1 min-h-[320px] lg:min-h-0 flex flex-col">{picture}</div>
        {drawer}
      </div>
      {/* The inspector scrolls; its left hairline is the picture's edge. */}
      <aside className="min-w-0 min-h-0 lg:overflow-y-auto lg:border-l lg:border-borderSubtle lg:pl-4 flex flex-col gap-4" data-inspector>
        {inspector}
      </aside>
    </div>
    {strip && (
      <div className="border-t border-borderSubtle pt-3 flex items-start gap-x-8 gap-y-3 flex-wrap" data-figure-strip>
        {strip}
      </div>
    )}
  </div>
);

/** A group of inspector rows. A ten-pixel name over a hairline; no box. */
export const Group = ({ title, actions, children, className = '', ...rest }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string } & HTMLAttributes<HTMLElement>) => (
  <section className={`flex flex-col min-w-0 ${className}`} data-group {...rest}>
    <header className="flex items-center gap-2 pb-1 border-b border-borderSubtle">
      <h2 className={`${TYPE.label} text-textMuted`}>{title}</h2>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </header>
    <div className="flex flex-col">{children}</div>
  </section>
);

/**
 * One inspector row: the word for a number, the number. `onSelect` makes it
 * a control the keyboard can reach; `sub` is a qualifier, never a sentence.
 */
export const Stat = ({ label, value, sub, ink, onSelect, selected = false, className = '', ...rest }: { label: ReactNode; value: ReactNode; sub?: ReactNode; ink?: string; onSelect?: () => void; selected?: boolean; className?: string } & HTMLAttributes<HTMLElement>) => {
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-3">
        <span className={`${TYPE.body} text-textSecondary min-w-0 truncate`}>{label}</span>
        <span className={`${TYPE.num} text-textPrimary shrink-0`} style={ink ? { color: ink } : undefined}>
          {value}
        </span>
      </span>
      {sub && <span className={`block ${TYPE.label} tracking-normal normal-case text-textMuted`}>{sub}</span>}
    </>
  );
  return onSelect ? (
    <button type="button" onClick={onSelect} aria-current={selected || undefined} className={`${ROW} py-1 -mx-1 px-1 border-b border-borderSubtle/40 last:border-0 ${selected ? 'bg-select/[0.06]' : ''} ${className}`} {...(rest as HTMLAttributes<HTMLButtonElement>)}>
      {body}
    </button>
  ) : (
    <div className={`py-1 border-b border-borderSubtle/40 last:border-0 ${className}`} {...rest}>
      {body}
    </div>
  );
};

/** A figure for the strip under the picture. */
export const Figure = ({ label, value, sub, ink, size = 'figure', className = '' }: { label: ReactNode; value: ReactNode; sub?: ReactNode; ink?: string; size?: 'sm' | 'figure' | 'lead'; className?: string }) => (
  <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
    <span className={`${TYPE.label} text-textMuted whitespace-nowrap`}>{label}</span>
    <span className={size === 'lead' ? TYPE.lead : size === 'sm' ? TYPE.num : TYPE.figure} style={ink ? { color: ink } : undefined}>
      {value}
    </span>
    {sub && <span className={`${TYPE.label} tracking-normal normal-case text-textMuted`}>{sub}</span>}
  </div>
);

/** The one sentence a desk is allowed. */
export const Read = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <p className={`${TYPE.body} text-textSecondary max-w-[72ch] self-end ml-auto ${className}`}>{children}</p>
);

export const Tag = ({ children, ink, title, className = '' }: { children: ReactNode; ink?: string; title?: string; className?: string }) => (
  <span title={title} className={`${TYPE.label} font-bold whitespace-nowrap ${ink ? '' : 'text-textSecondary'} ${className}`} style={ink ? { color: ink } : undefined}>
    {children}
  </span>
);

export const Legend = ({ items, className = '' }: { items: { ink: string; label: string; dashed?: boolean }[]; className?: string }) => (
  <div className={`flex items-center gap-x-4 gap-y-1 flex-wrap ${TYPE.label} text-textMuted ${className}`}>
    {items.map(it => (
      <span key={it.label} className="inline-flex items-center gap-1">
        <span className="inline-block w-3" style={it.dashed ? { backgroundImage: `repeating-linear-gradient(90deg, ${it.ink} 0 2px, transparent 2px 4px)`, height: 2 } : { background: it.ink, height: 2 }} />
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
  width?: string | number;
}

export const Table = ({ cols, children, sticky = false, className = '', ...rest }: { cols: Col[]; children: ReactNode; sticky?: boolean; className?: string } & HTMLAttributes<HTMLTableElement>) => (
  <div className="overflow-x-auto">
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
  <th scope="col" className={`${TYPE.label} text-textMuted font-normal px-2 py-1 border-b border-borderSubtle whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'} ${className}`} {...rest}>
    {children}
  </th>
);

export const Row = ({ onSelect, selected = false, className = '', children, ...rest }: { onSelect?: () => void; selected?: boolean; className?: string; children: ReactNode } & HTMLAttributes<HTMLTableRowElement>) => (
  <tr
    {...(onSelect ? interactiveRowProps(onSelect, selected, 'native') : {})}
    onClick={onSelect}
    className={`border-b border-borderSubtle/40 ${onSelect ? `${ROW_INTERACTIVE} hover:bg-white/[0.03]` : ''} ${selected ? 'bg-select/[0.06]' : ''} ${className}`}
    {...rest}
  >
    {children}
  </tr>
);

export const Cell = ({ num = false, className = '', children, ...rest }: { num?: boolean; className?: string; children?: ReactNode } & TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={`px-2 py-1 whitespace-nowrap ${num ? `${TYPE.num} text-right` : TYPE.body} ${className}`} {...rest}>
    {children}
  </td>
);

/** A drawer under the picture: a short list that scrolls, with its edge. */
export const Pane = ({ children, className = '', ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) => (
  <div className={`rounded-md border border-borderSubtle min-w-0 overflow-auto ${className}`} {...rest}>
    {children}
  </div>
);

/* ───────────────────────────── measuring ──────────────────────────────── */

/** A picture draws itself to the box it is given. */
export function useSize<T extends HTMLElement>(): [RefObject<T>, { w: number; h: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      setSize(p => (p.w === w && p.h === h ? p : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/* ───────────────────────────── loading ────────────────────────────────── */

export const DeskLoading = ({ children }: { children: ReactNode }) => (
  <Workspace
    picture={<div className="flex-1 min-h-[320px] flex items-center justify-center rounded-md border border-borderSubtle">{children}</div>}
    inspector={
      <div className="flex flex-col gap-4" aria-hidden>
        {[0, 1, 2].map(i => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton h={8} w="w-24" />
            <Skeleton h={9} w="w-full" />
            <Skeleton h={9} w="w-3/4" />
          </div>
        ))}
      </div>
    }
  />
);
