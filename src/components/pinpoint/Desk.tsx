import { useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode, type RefObject, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';
import FilterTabs from '../ui/FilterTabs';
import { X, ChevronLeft } from 'lucide-react';
import { useIsBelowLg } from '../ui/useMediaQuery';
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
  /** Extra attributes on the option's button — a test hook, an id. */
  attrs?: Record<string, string>;
}

/**
 * The desk's page-level picker IS the terminal's tab rail.
 *
 * ══ ONE TAB GRAMMAR, NOT TWO ══════════════════════════════════════════════
 *
 * This drew its own boxed group — a border, a lit option — while Tracker,
 * Backtest and Pulse drew the FilterTabs pill rail, which is the control
 * Noah kept when he retired the boxed look (2026-07-19: "too common").
 * Pinpoint's ten desks had a second tab grammar of their own for no
 * reason but history. They render through the rail now; the API is
 * unchanged, so no call site moved. `dense` is the rail's dense cut.
 */
export const Segmented = <V extends string>({ options, value, onChange, ariaLabel, className = '', dense = false, attrs }: { options: readonly Option<V>[]; value: V; onChange: (v: V) => void; ariaLabel: string; className?: string; dense?: boolean; attrs?: Record<string, string> }) => (
  <FilterTabs options={options} value={value} onChange={onChange} ariaLabel={ariaLabel} className={className} dense={dense} attrs={attrs} />
);

export const Select = <V extends string>({ options, value, onChange, ariaLabel, className = '', dense = false, attrs, title }: { options: readonly { value: V; label: string }[]; value: V; onChange: (v: V) => void; ariaLabel: string; className?: string; dense?: boolean; attrs?: Record<string, string>; title?: string }) => (
  <select
    aria-label={ariaLabel}
    title={title}
    value={value}
    onChange={e => onChange(e.target.value as V)}
    className={`${dense ? 'h-5 px-1 text-label uppercase font-semibold' : 'h-6 pl-2 pr-1 text-body'} rounded-md border border-borderSubtle bg-canvas font-mono text-textPrimary outline-none cursor-pointer hover:border-borderMuted focus-visible:ring-1 focus-visible:ring-select/60 ${className}`}
    {...attrs}
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

/*
  ══ A CHOICE THE DESK REMEMBERS ═══════════════════════════════════════════

  The board keeps every view choice per panel; the other desks forgot
  theirs on every reload — metric, bars, lens, window, units back to the
  defaults each morning. One hook, keyed by desk and choice, on the
  board's contract: anything malformed or no longer offered falls back to
  the default rather than throwing on read.
*/
export function useDeskChoice<T>(desk: string, key: string, initial: T, valid?: (v: unknown) => boolean): [T, (v: T | ((p: T) => T)) => void] {
  const k = `slayer.pinpoint.${desk}.${key}`;
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(k);
      if (raw == null) return initial;
      const parsed = JSON.parse(raw) as unknown;
      return (valid ? valid(parsed) : true) ? (parsed as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* storage can be full, private, or switched off — never fatal */
    }
  }, [k, v]);
  return [v, setV];
}

/** The inspector's range and opening width. The floor is where a Stat's
    label and figure stop sharing a line; the ceiling where a column of
    inspector rows is a page. */
export const INSPECTOR_W = 288;
export const INSPECTOR_MIN_W = 240;
export const INSPECTOR_MAX_W = 560;

/**
 * The desk. The picture takes the screen; the inspector scrolls beside it;
 * the strip sits under both. `drawer` is a short scrolling table under the
 * picture for the one thing that is a list of trades rather than a number
 * — the prints behind a picked strike.
 *
 * ══ THE INSPECTOR HAS A DOOR AND A GRIP ═══════════════════════════════════
 *
 * The board's pane comes and goes on a pull, a chip and the `i` key, and
 * its width is the reader's on a grip; the eight other desks had a fixed
 * 288px column with no way to widen it or to give the picture the screen.
 * Same door, same grip, once, here: a pull at the picture's top-right
 * edge while the inspector is away, a close on the inspector while it is
 * out, `i` from anywhere that is not a field, a grip on the inspector's
 * table edge (drag; double-click for the opening width; ← → from the
 * keyboard), and both remembered per desk.
 */
export const Workspace = ({ toolbar, picture, drawer, inspector, strip, className = '', ...rest }: { toolbar?: ReactNode; picture: ReactNode; drawer?: ReactNode; inspector: ReactNode; strip?: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) => {
  const desk = typeof window !== 'undefined' ? window.location.pathname.replace(/^\/pinpoint\//, '').replace(/\W+/g, '-') || 'desk' : 'desk';
  const [open, setOpen] = useDeskChoice<boolean>(desk, 'inspector', true, v => typeof v === 'boolean');
  const [width, setWidth] = useDeskChoice<number | null>(desk, 'inspectorW', null, v => v === null || (typeof v === 'number' && v >= 100 && v <= 2000));
  const belowLg = useIsBelowLg();
  const [dragW, setDragW] = useState<number | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const clampW = (w: number) => Math.max(INSPECTOR_MIN_W, Math.min(INSPECTOR_MAX_W, Math.round(w)));
  const shownW = dragW ?? clampW(width ?? INSPECTOR_W);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if ((e.key === 'i' || e.key === 'I') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const onGripDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = asideRef.current?.getBoundingClientRect();
    const right = rect?.right ?? e.clientX + shownW;
    const grab = e.clientX - (rect?.left ?? e.clientX);
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    let last = shownW;
    const move = (ev: PointerEvent) => {
      last = clampW(right - (ev.clientX - grab));
      setDragW(last);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setDragW(null);
      if (last !== shownW) setWidth(last);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const onGripKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const next =
      e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? shownW + 16 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? shownW - 16 : e.key === 'Home' ? INSPECTOR_MIN_W : e.key === 'End' ? INSPECTOR_MAX_W : null;
    if (next == null) return;
    e.preventDefault();
    setWidth(clampW(next));
  };

  const showAside = belowLg || open;
  return (
    <div className={`flex flex-col gap-3 lg:h-[calc(100vh-11rem)] lg:min-h-[560px] ${className}`} data-workspace data-inspector-open={open ? 'true' : 'false'} {...rest}>
      {toolbar}
      <div
        className="flex-1 min-h-0 grid grid-cols-1 gap-x-6 gap-y-4"
        style={{ gridTemplateColumns: belowLg ? undefined : showAside ? `minmax(0,1fr) ${shownW}px` : 'minmax(0,1fr)' }}
      >
        <div className="relative min-w-0 min-h-0 flex flex-col gap-3" data-picture>
          <div className="flex-1 min-h-[320px] lg:min-h-0 flex flex-col">{picture}</div>
          {drawer}
          {!showAside && (
            <button
              data-desk-pull
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open the inspector"
              title="Open the inspector · i"
              className="absolute inset-y-0 right-0 z-10 flex w-4 items-center justify-center border-l border-white/[0.07] bg-white/[0.03] text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select/60"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
          )}
        </div>
        {showAside && (
          /* The inspector scrolls; its left hairline is the picture's edge. */
          <aside ref={asideRef} className={`relative min-w-0 min-h-0 lg:overflow-y-auto lg:border-l lg:border-borderSubtle lg:pl-4 flex flex-col gap-4 ${dragW != null ? 'select-none' : ''}`} data-inspector data-inspector-w={shownW}>
            {!belowLg && (
              <>
                <div
                  data-desk-grip
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize the inspector"
                  aria-valuemin={INSPECTOR_MIN_W}
                  aria-valuemax={INSPECTOR_MAX_W}
                  aria-valuenow={shownW}
                  tabIndex={0}
                  title="Drag to resize · double-click for the opening width · ← → from the keyboard"
                  onPointerDown={onGripDown}
                  onDoubleClick={() => setWidth(null)}
                  onKeyDown={onGripKey}
                  className="group/grip absolute inset-y-0 -left-1 z-10 flex w-2 cursor-ew-resize items-center justify-center outline-none focus-visible:bg-white/[0.06]"
                >
                  <span aria-hidden className={`h-10 w-[3px] rounded transition-colors ${dragW != null ? 'bg-white/70' : 'bg-white/20 group-hover/grip:bg-white/55'}`} />
                </div>
                <button
                  data-desk-close
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close the inspector"
                  title="Close the inspector · i"
                  className="absolute right-0 top-0 z-10 -m-1 rounded p-1 text-textMuted transition-colors hover:bg-white/[0.05] hover:text-textPrimary"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {inspector}
          </aside>
        )}
      </div>
      {strip && (
        <div className="border-t border-borderSubtle pt-3 flex items-start gap-x-8 gap-y-3 flex-wrap" data-figure-strip>
          {strip}
        </div>
      )}
    </div>
  );
};

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

/**
 * A table fits its box the way the board's ladder fits its box: by
 * arithmetic, not by a breakpoint. Given `fit` — the order in which columns
 * may go — it measures every column's natural width (the table takes its
 * content's width for one synchronous read, then hands it back), sums them
 * against the box, and collapses columns from the front of `fit` until the
 * sum fits. A column that goes keeps the width it needed, so it comes back
 * the moment the box can hold it. Without `fit` the table scrolls sideways
 * inside its box, as it always did.
 */
export const Table = ({ cols, children, sticky = false, className = '', fit, ...rest }: { cols: Col[]; children: ReactNode; sticky?: boolean; className?: string; fit?: readonly string[] } & HTMLAttributes<HTMLTableElement>) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const needRef = useRef(new Map<string, number>());
  const [hidden, setHidden] = useState<readonly string[]>([]);
  const fitting = !!fit && fit.length > 0;

  const measure = () => {
    const wrap = wrapRef.current;
    const table = tableRef.current;
    if (!fitting || !wrap || !table) return;
    const prev = table.style.width;
    table.style.width = 'max-content';
    for (const th of table.querySelectorAll<HTMLTableCellElement>('thead th[data-col]')) {
      const w = th.getBoundingClientRect().width;
      if (w > 0) needRef.current.set(th.dataset.col!, w);
    }
    table.style.width = prev;
    const box = wrap.clientWidth;
    let total = 0;
    for (const c of cols) total += needRef.current.get(c.key) ?? 0;
    const drop: string[] = [];
    for (const k of fit!) {
      if (total <= box) break;
      const need = needRef.current.get(k);
      if (need === undefined) continue;
      drop.push(k);
      total -= need;
    }
    setHidden(h => (h.length === drop.length && h.every((k, i) => k === drop[i]) ? h : drop));
  };
  const measureRef = useRef(measure);
  measureRef.current = measure;
  /* After every render — the data may have widened a column. */
  useLayoutEffect(() => {
    if (fitting) measureRef.current();
  });
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!fitting || !wrap) return;
    const ro = new ResizeObserver(() => measureRef.current());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [fitting]);

  return (
    <div ref={wrapRef} className="overflow-x-auto">
      <table ref={tableRef} className={`w-full ${className}`} data-table-hidden={fitting ? hidden.join(' ') : undefined} {...rest}>
        {fitting && (
          <colgroup>
            {cols.map(c => (
              <col key={c.key} style={hidden.includes(c.key) ? { visibility: 'collapse' } : undefined} />
            ))}
          </colgroup>
        )}
        <thead className={sticky ? 'sticky top-0 z-10 bg-canvas' : ''}>
          <tr>
            {cols.map(c => (
              <Th key={c.key} data-col={c.key} align={c.align} style={c.width !== undefined ? { width: c.width } : undefined}>
                {c.label}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
};

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
