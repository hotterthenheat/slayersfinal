/*
==================================================
  SLAYER TERMINAL - THE INDICATOR SEARCH
  (components/terrain/IndicatorSearch.tsx)
==================================================

  ONE PLACE TO ADD ANYTHING TO A CHART. Fifty shipped scripts, the desk's
  own two dozen built-ins, and whatever the reader has written — searched
  together, because a reader looking for "volume" does not know or care
  which of those three shelves the answer is sitting on.

  IT REPLACED A DROPDOWN, and it had to. A menu is fine for eight rows; at
  seventy-four it is a scrolling column with no search, no grouping and no
  way back to the one you saw a moment ago. The shape here is the one every
  reader already knows from every other charting tool: search at the top,
  shelves down the left, a scrolling list of rows, a star to keep the ones
  you use.

  THE TWO SCOPES ARE NOT BLURRED, which is the one place this design had to
  make a choice rather than copy. Pine scripts belong to the READER — tick
  one and every pane on the desk draws it. The built-ins belong to a PANE.
  Merging them into an undifferentiated list would be tidier and would lie:
  a reader ticking "RSI" and finding it on one chart out of four has been
  misled by the tidiness. So each row says which it is, and the footer says
  what the pane rows are being added to.
*/

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Layers, RotateCcw, Search, Settings2, Sparkles, Star, X } from 'lucide-react';
import { LIBRARY, type LibraryScript } from '../../data/pine/library';
import type { UserScript } from '../../data/pine/store';

/** One editable number on a row — a period, a multiplier, a length. */
export interface RowParam {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

/** A row the dialog can offer, whatever shelf it came from. */
export interface SearchRow {
  key: string;
  name: string;
  blurb: string;
  group: string;
  /** Which of the three shelves — decides the chip and the scope note. */
  shelf: 'slayer' | 'classic' | 'mine' | 'builtin';
  on: boolean;
  /** True when this row draws in a pane of its own rather than on the tape. */
  ownPane: boolean;
  toggle: () => void;
  /*
    THE NUMBERS THIS ROW IS DRAWN WITH, where it has any.

    They used to live in the dropdown this dialog replaced, and dropping them
    on the way across would have been a quiet downgrade — an RSI a reader had
    set to 9 with no way back to it. They open on the row rather than in a
    second dialog, which is also where every other charting tool puts them.
  */
  params?: RowParam[];
  /** True when the reader has changed them from the defaults. */
  edited?: boolean;
  onReset?: () => void;
  /** Set when the row cannot be turned on, and why — shown in place of the tick. */
  blocked?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** The reader's script list — the shipped fifty plus their own. */
  scripts?: readonly UserScript[];
  onScripts?: (next: UserScript[]) => void;
  /** The pane's own built-ins, offered alongside. */
  builtins?: readonly {
    key: string; label: string; hint: string; on: boolean; sub?: boolean;
    toggle: () => void; params?: RowParam[]; edited?: boolean; onReset?: () => void; blocked?: string;
  }[];
  /** What the pane rows are being added to, for the footer. */
  paneLabel?: string;
  /** Opens the editor on a script — the "write your own" door. */
  onWriteOwn?: () => void;
}

const FAV_KEY = 'slayer.pine.favourites.v1';

const loadFavourites = (): Set<string> => {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
};

const saveFavourites = (favs: Set<string>): void => {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));
  } catch {
    /* storage blocked — favourites last this session */
  }
};

/* The shelves down the left, in the order they are offered. Slayer leads on
   purpose: it is the half of this list that exists nowhere else, and burying
   it under "Technicals" would hide the reason the engine is here. */
const SHELVES = [
  { id: 'favourites', label: 'Favourites', section: 'Personal' },
  { id: 'mine', label: 'My scripts', section: 'Personal' },
  { id: 'slayer', label: 'Slayer', section: 'Built in' },
  { id: 'classic', label: 'Technicals', section: 'Built in' },
  { id: 'builtin', label: 'Chart tools', section: 'Built in' },
] as const;
type ShelfId = (typeof SHELVES)[number]['id'];

const CHIP: Record<SearchRow['shelf'], { text: string; cls: string }> = {
  slayer: { text: 'SLAYER', cls: 'text-[#7DE3FF] border-[#7DE3FF]/30 bg-[#7DE3FF]/[0.07]' },
  classic: { text: 'PINE', cls: 'text-textSecondary border-borderMuted bg-white/[0.03]' },
  mine: { text: 'MINE', cls: 'text-select border-select/30 bg-select/[0.07]' },
  builtin: { text: 'PANE', cls: 'text-warn border-warn/30 bg-warn/[0.07]' },
};

/** Rank a row against the typed query — name beats blurb, prefix beats middle. */
const score = (row: SearchRow, q: string): number => {
  if (q === '') return 0;
  const name = row.name.toLowerCase();
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;
  if (row.group.toLowerCase().includes(q)) return 40;
  if (row.blurb.toLowerCase().includes(q)) return 20;
  return -1;
};

const IndicatorSearch = ({ open, onClose, scripts, onScripts, builtins, paneLabel, onWriteOwn }: Props) => {
  const [query, setQuery] = useState('');
  const [shelf, setShelf] = useState<ShelfId>('slayer');
  const [favs, setFavs] = useState<Set<string>>(() => loadFavourites());
  const [cursor, setCursor] = useState(0);
  /** Which row has its numbers open. One at a time — this is a list, not a form. */
  const [tuning, setTuning] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /* Opened fresh every time. A search left over from yesterday is a dialog
     that opens onto three rows and looks broken. */
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    setTuning(null);
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  const toggleFav = (key: string) => {
    setFavs(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveFavourites(next);
      return next;
    });
  };

  /* Every shelf flattened into one list of rows. Built once per change of
     the things it reads, because the search re-filters on every keystroke. */
  const rows = useMemo<SearchRow[]>(() => {
    const out: SearchRow[] = [];
    const byId = new Map(LIBRARY.map(s => [s.id, s] as const));
    for (const s of scripts ?? []) {
      const lib: LibraryScript | undefined = byId.get(s.id);
      const flip = () => {
        onScripts?.((scripts ?? []).map(x => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)));
      };
      out.push({
        key: `script:${s.id}`,
        name: s.name,
        blurb: lib?.blurb ?? 'Your own script.',
        group: lib?.group ?? 'Mine',
        shelf: lib ? lib.kind : 'mine',
        on: s.enabled,
        ownPane: lib ? !lib.overlay : false,
        toggle: flip,
      });
    }
    for (const b of builtins ?? []) {
      out.push({
        key: `builtin:${b.key}`,
        name: b.label,
        blurb: b.hint,
        group: 'Chart built-ins',
        shelf: 'builtin',
        on: b.on,
        ownPane: !!b.sub,
        toggle: b.toggle,
        params: b.params,
        edited: b.edited,
        onReset: b.onReset,
        blocked: b.blocked,
      });
    }
    return out;
  }, [scripts, onScripts, builtins]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    /* A QUERY SEARCHES EVERYTHING. Filtering the typed search down to the
       selected shelf is the behaviour that makes a reader think the thing
       they wanted is missing, when it was one shelf over the whole time. */
    if (q !== '') {
      return rows
        .map(r => ({ r, s: score(r, q) }))
        .filter(x => x.s >= 0)
        .sort((a, b) => b.s - a.s || a.r.name.localeCompare(b.r.name))
        .map(x => x.r);
    }
    if (shelf === 'favourites') return rows.filter(r => favs.has(r.key));
    return rows.filter(r => r.shelf === shelf);
  }, [rows, q, shelf, favs]);

  /* Grouped for the eye, but only at rest — a search result is ranked, and
     re-sorting it into shelves would throw the ranking away. */
  const sections = useMemo(() => {
    if (q !== '') return [{ title: `${visible.length} match${visible.length === 1 ? '' : 'es'}`, items: visible }];
    const map = new Map<string, SearchRow[]>();
    for (const r of visible) {
      const list = map.get(r.group);
      if (list) list.push(r);
      else map.set(r.group, [r]);
    }
    return [...map.entries()].map(([title, items]) => ({ title, items }));
  }, [visible, q]);

  const flat = useMemo(() => sections.flatMap(s => s.items), [sections]);

  useEffect(() => {
    setCursor(c => Math.min(c, Math.max(0, flat.length - 1)));
  }, [flat.length]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(c => Math.min(flat.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      flat[cursor]?.toggle();
    }
  };

  /* The highlighted row is kept in view when the keys move it, and NOT when
     the mouse does — scrolling the list under a moving pointer is how a
     click lands on the wrong row. */
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor, open]);

  const counts = useMemo(() => ({
    slayer: rows.filter(r => r.shelf === 'slayer').length,
    classic: rows.filter(r => r.shelf === 'classic').length,
    mine: rows.filter(r => r.shelf === 'mine').length,
    builtin: rows.filter(r => r.shelf === 'builtin').length,
    favourites: rows.filter(r => favs.has(r.key)).length,
    on: rows.filter(r => r.on).length,
  }), [rows, favs]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', esc);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-black/70 backdrop-blur-[2px] px-4 py-[6vh]"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="Indicators"
        data-indicator-search
        onKeyDown={onKey}
        className="w-full max-w-[900px] h-[min(74vh,640px)] flex flex-col rounded-lg border border-borderMuted bg-panel shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9)] overflow-hidden"
      >
        {/* ── the search line, which is the whole header ────────────────── */}
        <div className="shrink-0 flex items-center gap-3 px-4 h-[46px] border-b border-borderSubtle">
          <span className="text-[15px] text-textPrimary">Indicators and metrics</span>
          <span className="ml-auto hidden sm:inline font-mono text-[9px] uppercase tracking-wider text-textMuted">
            {counts.on} on chart
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-7 h-7 grid place-items-center rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="shrink-0 px-4 py-2.5 border-b border-borderSubtle">
          <div className="flex items-center gap-2.5 h-9 px-3 rounded-md border border-borderSubtle bg-inset focus-within:border-select/40 transition-colors">
          <Search className="w-4 h-4 text-textMuted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            placeholder="Search"
            aria-label="Search indicators"
            className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-textPrimary placeholder:text-textMuted"
          />
          {query !== '' && (
            <button
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="Clear the search"
              className="shrink-0 w-5 h-5 grid place-items-center rounded text-textMuted hover:text-textPrimary transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          </div>
        </div>

        <div className="flex-1 min-h-0 flex">
          {/* ── the shelves ────────────────────────────────────────────── */}
          <nav className="hidden sm:flex w-[190px] shrink-0 flex-col gap-0.5 p-2 border-r border-borderSubtle bg-inset/60 overflow-y-auto">
            {SHELVES.map((s, i) => {
              const n = counts[s.id];
              const active = shelf === s.id && q === '';
              const heading = i === 0 || SHELVES[i - 1].section !== s.section
                ? <div key={`h-${s.section}`} className={`px-3 ${i === 0 ? 'pt-1' : 'pt-3'} pb-1 font-mono text-[9px] uppercase tracking-[0.16em] text-textMuted`}>{s.section}</div>
                : null;
              return (
                <div key={s.id} className="contents">
                {heading}
                <button
                  onClick={() => {
                    setShelf(s.id);
                    setQuery('');
                    setCursor(0);
                    inputRef.current?.focus();
                  }}
                  className={`group relative flex items-center gap-2 pl-3 pr-2 h-8 rounded text-left text-[12px] transition-colors ${
                    active ? 'bg-white/[0.07] text-textPrimary' : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.04]'
                  }`}
                >
                  {/* The selected shelf's edge, as its own element — a
                      side-specific border utility is not in this build. */}
                  <span
                    className={`absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full ${active ? 'bg-select' : 'bg-transparent'}`}
                    aria-hidden
                  />
                  {s.id === 'slayer' && <Sparkles className="w-3 h-3 text-[#7DE3FF]" />}
                  {s.id === 'favourites' && <Star className="w-3 h-3 text-warn" />}
                  {s.id === 'builtin' && <Layers className="w-3 h-3 text-warn" />}
                  <span className="flex-1 truncate">{s.label}</span>
                  <span className="font-mono text-[9px] text-textMuted tabular-nums">{n}</span>
                </button>
                </div>
              );
            })}

            {onWriteOwn && (
              <button
                onClick={() => {
                  onClose();
                  onWriteOwn();
                }}
                className="mt-auto flex items-center justify-center gap-1.5 h-8 rounded border border-borderMuted text-[11px] text-textSecondary hover:text-select hover:border-select/40 transition-colors"
              >
                Write your own
              </button>
            )}
          </nav>

          {/* ── the list ───────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {/* THE COLUMN HEADS, once. With seventy-odd rows the eye needs to
              be told what the right-hand columns mean exactly once, not on
              every row. */}
          <div className="shrink-0 flex items-center gap-3 pl-4 pr-3 h-7 border-b border-borderSubtle font-mono text-[9px] uppercase tracking-[0.14em] text-textMuted">
            <span className="w-[52px] shrink-0">Kind</span>
            <span className="flex-1">Name</span>
            <span className="w-[120px] shrink-0 hidden md:block">Shelf</span>
            <span className="w-[62px] shrink-0 text-right">On chart</span>
          </div>
          <div ref={listRef} className="flex-1 min-w-0 overflow-y-auto">
            {flat.length === 0 && (
              <div className="h-full grid place-items-center px-8 text-center">
                <div>
                  <p className="text-[13px] text-textSecondary">
                    {q ? <>Nothing matches “{query}”.</> : <>Nothing on this shelf yet.</>}
                  </p>
                  {q !== '' && (
                    <p className="mt-1.5 text-[11px] text-textMuted">
                      The search covers every shelf, so this is the whole library — not just {SHELVES.find(s => s.id === shelf)?.label}.
                    </p>
                  )}
                </div>
              </div>
            )}

            {sections.map(section => (
              <div key={section.title}>
                <div className="sticky top-0 z-10 px-4 py-1.5 bg-panel/95 backdrop-blur-[2px] border-b border-borderSubtle font-mono text-[9px] uppercase tracking-[0.14em] text-textMuted">
                  {section.title}
                </div>
                {section.items.map(row => {
                  const i = flat.indexOf(row);
                  const chip = CHIP[row.shelf];
                  const card = (
                    <div
                      data-row={i}
                      data-indicator-row
                      data-on={row.on ? 'yes' : 'no'}
                      /* HOOKS RATHER THAN LABEL TEXT for the browser sweep to
                         walk. A check that finds rows by name goes stale the
                         first time one is renamed and then asserts nothing,
                         quietly. */
                      data-shelf={row.shelf}
                      data-own-pane={row.ownPane ? 'yes' : 'no'}
                      data-blocked={row.blocked ?? ''}
                      onMouseEnter={() => setCursor(i)}
                      onClick={row.toggle}
                      role="button"
                      tabIndex={-1}
                      /* THE REASON OUTRANKS THE DESCRIPTION on a row that
                         cannot be turned on: a reader hovering a dead row
                         wants to know why it is dead, not what it would have
                         drawn. */
                      title={row.blocked ?? row.blurb}
                      className={`relative flex items-center gap-3 pl-4 pr-3 h-8 cursor-pointer transition-colors ${
                        i === cursor ? 'bg-white/[0.055]' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <span
                        className={`absolute left-0 top-0 bottom-0 w-[2px] ${row.on ? 'bg-select' : 'bg-transparent'}`}
                        aria-hidden
                      />
                      <span
                        className={`shrink-0 grid place-items-center w-[52px] h-[15px] rounded-sm border font-mono text-[8px] tracking-[0.1em] ${chip.cls}`}
                      >
                        {chip.text}
                      </span>
                      <span className="flex-1 min-w-0 flex items-baseline gap-2">
                        {/* THE NAME IS NOT THE PART THAT GIVES WAY. Sharing
                            one flex line with the blurb crushed it to "Flip
                            Di…", which is the one string on the row a reader
                            cannot do without — so the name takes what it
                            needs and the sentence takes the remainder. */}
                        <span className="shrink-0 max-w-[62%] truncate text-[12.5px] text-textPrimary">{row.name}</span>
                        {/* THE BLURB EARNS ITS ROOM ONLY WHERE THERE IS ROOM.
                            One line per entry is what makes seventy of them
                            scannable; the sentence rides the hover title, and
                            shows inline on the row the cursor is on. */}
                        <span
                          className={`min-w-0 truncate text-[11px] text-textMuted transition-opacity ${
                            i === cursor ? 'opacity-100' : 'opacity-0 lg:opacity-45'
                          }`}
                        >
                          {row.blurb}
                        </span>
                      </span>
                      {/* AT REST THE SHELF IS ALREADY THE HEADING ABOVE, so
                          repeating it on every row says nothing; what varies
                          there is WHERE the thing draws. Under a search there
                          are no headings, and then the shelf is the useful
                          column. One slot, filled with whichever is not
                          already on screen. */}
                      <span className="w-[120px] shrink-0 hidden md:flex items-center gap-1.5 font-mono text-[10px] text-textMuted">
                        {q !== '' ? (
                          <span className="truncate">{row.group}</span>
                        ) : (
                          <span className="truncate">{row.ownPane ? 'own pane' : 'on the tape'}</span>
                        )}
                      </span>
                      {row.params && row.params.length > 0 && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setTuning(t => (t === row.key ? null : row.key));
                          }}
                          aria-label={`Settings for ${row.name}`}
                          aria-expanded={tuning === row.key}
                          className={`shrink-0 w-5 h-5 grid place-items-center rounded transition-colors ${
                            tuning === row.key || row.edited ? 'text-select' : 'text-textMuted/40 hover:text-textPrimary'
                          }`}
                        >
                          <Settings2 className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          toggleFav(row.key);
                        }}
                        aria-label={favs.has(row.key) ? `Unstar ${row.name}` : `Star ${row.name}`}
                        className={`shrink-0 w-5 h-5 grid place-items-center rounded transition-colors ${
                          favs.has(row.key) ? 'text-warn' : 'text-textMuted/30 hover:text-warn'
                        }`}
                      >
                        <Star className="w-3 h-3" fill={favs.has(row.key) ? 'currentColor' : 'none'} />
                      </button>
                      <span className="w-[62px] shrink-0 flex justify-end">
                        <span
                          className={`w-5 h-5 grid place-items-center rounded border transition-colors ${
                            row.on ? 'border-select/50 bg-select/15 text-select' : 'border-borderMuted/60 text-transparent'
                          }`}
                          aria-hidden
                        >
                          <Check className="w-3 h-3" />
                        </span>
                      </span>

                      {/* THE ROW SAYS WHY IT WILL NOT TAKE, rather than
                          swallowing the click. A pane budget that is full and
                          a session indicator on a rule clock are both real
                          answers; silence is not one. */}
                      {row.blocked && i === cursor && (
                        <span className="absolute left-[72px] right-[86px] text-[10.5px] text-warn/90 truncate bg-panel/90 px-1 rounded">
                          {row.blocked}
                        </span>
                      )}
                    </div>
                  );
                  return (
                    <div key={row.key}>
                      {card}
                      {tuning === row.key && row.params && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-[72px] pr-4 py-2.5 bg-inset border-y border-borderSubtle/60">
                          {row.params.map(pm => (
                            <label key={pm.label} className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-textMuted">
                              {pm.label}
                              <input
                                type="number"
                                value={pm.value}
                                min={pm.min}
                                max={pm.max}
                                step={pm.step}
                                aria-label={`${row.name} ${pm.label}`}
                                onClick={e => e.stopPropagation()}
                                onChange={e => pm.onChange(Number(e.target.value))}
                                className="w-16 bg-panel border border-borderSubtle rounded px-1.5 py-1 font-mono text-[11px] tnum text-textPrimary normal-case focus:outline-none focus:border-select/50"
                              />
                            </label>
                          ))}
                          {row.edited && row.onReset && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                row.onReset?.();
                              }}
                              className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-textMuted hover:text-select transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" /> defaults
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          </div>
        </div>

        {/* ── the footer says which scope is which ──────────────────────── */}
        <div className="shrink-0 flex items-center gap-3 px-4 h-[38px] border-t border-borderSubtle bg-inset text-[10px] text-textMuted">
          <span className="font-mono uppercase tracking-wider">
            {counts.slayer + counts.classic} shipped · {counts.mine} of your own
          </span>
          <span className="hidden md:inline text-textMuted/70">
            <span className="text-[#7DE3FF]">Slayer</span> and <span className="text-textSecondary">Pine</span> rows are yours and draw on every pane
            {paneLabel ? <> · <span className="text-warn">Pane</span> rows are added to {paneLabel}</> : null}
          </span>
          <span className="ml-auto hidden sm:inline font-mono text-[9px] tracking-wider">↑↓ move · ⏎ toggle · esc close</span>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default IndicatorSearch;
