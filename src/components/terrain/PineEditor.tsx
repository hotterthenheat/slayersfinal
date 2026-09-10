import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, BookOpen, ChevronDown, Code2, Copy, Map as MapIcon, Minus, MoreHorizontal, Play, Plus,
  TerminalSquare, Trash2, X,
} from 'lucide-react';
import {
  compilePine, evaluatePine, FNS_INDEX, REFUSED, SLAYER_INDEX,
  type PineRun, type Refusal,
} from '../../data/pine';
import {
  MAX_SCRIPTS, MAX_SOURCE_CHARS, STARTER_SOURCE, newScriptId, type UserScript,
} from '../../data/pine/store';
import { LIBRARY } from '../../data/pine/library';
import { displayBars, MAX_PINE_PANES } from '../../components/gex/StrikeChart';
import { tfMinutes, type Timeframe } from '../../data/timeframe';
import { buildSlayerFeed } from '../../data/slayerFeed';
import { highlightPine, TONE_CLASS } from './pineHighlight';

/*
==================================================
  SLAYER TERMINAL - SCRIPT MAKER (components/terrain/PineEditor.tsx)
  Write an indicator; be told the truth about it.
==================================================

  THREE COLUMNS, AND EACH ONE ANSWERS A QUESTION A WRITER ACTUALLY ASKS.

    LIBRARY   which scripts exist, which are drawing, and — first, at the
              top, before the reader's own — the four that SHIP with the
              desk. Those are the argument for this feature existing, so
              they lead rather than sitting in a list below the fold.
    CODE      the script, with line numbers, because every complaint is
              reported at a line and a reader has to find it.
    REPORT    what happened when it ran, and what this engine accepts.

  ─────────────────────────────────────────────────────────────────────────
  THE REPORT IS THE POINT OF THE WHOLE PANEL, and it is ordered by what
  costs a reader most to not know:

    1. did it run                 — one word, coloured
    2. what did it draw           — including "nothing", which is the
                                    failure a compiling script hides best
    3. what will it not show you  — the notes: a value read before its bar
                                    closed, a snapshot plotted as a series
    4. what did this engine refuse — at the line, clickable

  A refusal is a BUTTON: clicking one selects that line, because the
  reader's next move is always to go look at it.

  ─────────────────────────────────────────────────────────────────────────
  AND IT RUNS THE SCRIPT, not just parses it. "Compiles" is a weak promise:
  a script can compile and draw nothing, or throw on bar 900, or plot a
  number that is the same on every bar. After typing stops the draft runs
  against the FIRST PANE'S OWN BARS — with the same dealer book the chart
  will hand it — so the report is about the chart the reader is looking at.
  Deferred rather than per keystroke because a big script over two thousand
  bars is most of a second, and nobody wants that between two characters.
*/

interface Props {
  open: boolean;
  onClose: () => void;
  scripts: UserScript[];
  onChange: (next: UserScript[]) => void;
  /** The pane the run is measured against — the same tape it will draw on. */
  ticker: string;
  timeframe: string;
}

/** What a trial run came back with. */
type Probe =
  | { ok: true; run: PineRun; ms: number; bars: number }
  | { ok: false; message: string; line?: number };

const CTRL =
  'inline-flex items-center gap-1.5 rounded px-2.5 h-7 font-mono text-[11px] border transition-colors ' +
  'focus:outline-none focus-visible:ring-1 focus-visible:ring-select disabled:opacity-40 disabled:cursor-not-allowed';
const GHOST = `${CTRL} border-borderSubtle text-textSecondary hover:text-textPrimary hover:border-borderMuted`;
const PRIMARY = `${CTRL} border-select/50 bg-select/[0.12] text-select hover:bg-select/[0.18]`;

const blurbFor = (id: string): string | null => LIBRARY.find(p => p.id === id)?.blurb ?? null;

/** "4 lines, 4 labels, 1 box" — what a run left standing on the chart. */
/*
  WHAT THE RUN PUT ON THE CHART, in the reader's words.

  It used to count the `line`/`label`/`box` OBJECTS and nothing else, so an
  Ichimoku — five plots and a cloud, and plainly drawn — was reported as
  "drew nothing over 595 bars", one line above a row saying "lines on the
  pane 5". A verdict that contradicts the report beside it is worse than no
  verdict: the reader now has to work out which half to believe.
*/
const drawnCount = (run: PineRun): string => {
  const parts: string[] = [];
  const plots = run.plots.filter(p => !p.offScale && p.display !== 'none' && p.values.some(v => v !== null)).length;
  if (plots) parts.push(`${plots} plot${plots === 1 ? '' : 's'}`);
  if (run.fills.length) parts.push(`${run.fills.length} fill${run.fills.length === 1 ? '' : 's'}`);
  const by = new Map<string, number>();
  for (const d of run.drawings) by.set(d.what, (by.get(d.what) ?? 0) + 1);
  for (const [k, n] of by) parts.push(`${n} ${k}${n === 1 ? '' : k === 'box' ? 'es' : 's'}`);
  const marks = run.shapes.reduce((n, sh) => n + sh.at.length, 0);
  if (marks) parts.push(`${marks} mark${marks === 1 ? '' : 's'}`);
  const shaded = run.bands.filter(Boolean).length;
  if (shaded) parts.push(`${shaded} bar${shaded === 1 ? '' : 's'} shaded`);
  if (run.candles.length) parts.push(`${run.candles.length} candle series`);
  return parts.length === 0 ? 'nothing' : parts.join(', ');
};

/** Did this run put ANYTHING on the chart? The question a verdict hides. */
const drewSomething = (run: PineRun): boolean =>
  run.drawings.length > 0 ||
  run.bands.some(Boolean) ||
  run.fills.length > 0 ||
  run.candles.length > 0 ||
  run.barColors.some(Boolean) ||
  run.shapes.some(s => s.at.length > 0) ||
  run.plots.some(p => !p.offScale && p.display !== 'none' && p.values.some(v => v !== null));

const PineEditor = ({ open, onClose, scripts, onChange, ticker, timeframe }: Props) => {
  const [selected, setSelected] = useState<string | null>(scripts[0]?.id ?? null);
  const [draft, setDraft] = useState<string>(scripts[0]?.source ?? STARTER_SOURCE);
  const [name, setName] = useState<string>(scripts[0]?.name ?? 'My indicator');
  const [filter, setFilter] = useState('');
  const [probe, setProbe] = useState<Probe | null>(null);
  /*
    THE PANEL'S OWN FURNITURE.

    Docked rather than floated, and the width is the reader's: a 750-line
    levels indicator wants two thirds of a 4K screen, and a three-line EMA
    wants none of it. Kept in state rather than storage because it is a
    posture for this sitting, not a preference.
  */
  const [width, setWidth] = useState(() => Math.round(Math.min(880, Math.max(460, window.innerWidth * 0.42))));
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [refOpen, setRefOpen] = useState(false);
  const [minimap, setMinimap] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  /* THE MINIMAP'S ROW HEIGHT, chosen so the whole file fits its column
     rather than scrolling — a minimap that scrolls is just a second editor.
     Bounded below so a short file does not draw hairlines nobody can see. */
  const [viewRows, setViewRows] = useState(24);
  /* Bumped on every caret move so the status line and the current-line
     gutter mark re-read the textarea. Cheaper than mirroring the selection
     into state, and there is exactly one reader of it. */
  const [, setCaretNonce] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLPreElement>(null);

  const current = scripts.find(s => s.id === selected) ?? null;
  const readOnly = current?.builtin === true;

  useEffect(() => {
    if (!open) return;
    const s = scripts.find(x => x.id === selected) ?? scripts[0] ?? null;
    setSelected(s?.id ?? null);
    setDraft(s?.source ?? STARTER_SOURCE);
    setName(s?.name ?? 'My indicator');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* Compiled on every keystroke — a parse and a walk over an AST, with no
     bars touched, so the verdict can be immediate. */
  const result = useMemo(() => compilePine(draft), [draft]);
  const lines = useMemo(() => draft.split('\n'), [draft]);
  /* The coloured layer under the textarea — see pineHighlight.ts. A trailing
     newline gets a space so the last (empty) line still has a line box and
     the two layers keep the same height. */
  const ink = useMemo(() => highlightPine(draft.endsWith('\n') ? `${draft} ` : draft), [draft]);

  /* Which lines carry a complaint, so the gutter can mark them. */
  const marked = useMemo(() => {
    if (result.ok) return new Set<number>();
    if (result.stage === 'syntax') return new Set<number>([result.line]);
    return new Set<number>(result.refusals.map(r => r.line));
  }, [result]);

  /*
    THE TRIAL RUN. Deferred until typing stops, because it walks every bar —
    and cleared the moment the draft changes, so the panel never shows the
    last script's results beside this one's code.
  */
  useEffect(() => {
    setProbe(null);
    if (!open || !result.ok) return;
    const t = window.setTimeout(() => {
      const mins = tfMinutes(timeframe as Timeframe);
      const bars = displayBars(ticker, mins);
      if (bars.length === 0) return;
      const t0 = performance.now();
      const res = evaluatePine(draft, bars, {
        timeframe,
        ticker,
        chartMinutes: mins,
        resolveBars: (m: number) => displayBars(ticker, m),
        /* The same book the chart will hand it, so what the report says
           about a slayer.* script is what the pane will draw. */
        slayer: buildSlayerFeed(ticker, bars, mins) ?? undefined,
      });
      const ms = Math.round(performance.now() - t0);
      setProbe(res.ok ? { ok: true, run: res.run, ms, bars: bars.length } : { ok: false, message: res.message, line: res.line });
    }, 700);
    return () => window.clearTimeout(t);
  }, [draft, open, result.ok, ticker, timeframe]);

  const goToLine = (line: number) => {
    const ta = taRef.current;
    if (!ta) return;
    const before = lines.slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0);
    ta.focus();
    ta.setSelectionRange(before, before + (lines[line - 1]?.length ?? 0));
    /* Put the line near the middle rather than at the very top, so the
       reader can see what surrounds it. */
    const lineH = ta.scrollHeight / Math.max(lines.length, 1);
    ta.scrollTop = Math.max(0, (line - 1) * lineH - ta.clientHeight / 2);
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
  };

  const pick = (s: UserScript) => {
    setSelected(s.id);
    setDraft(s.source);
    setName(s.name);
  };

  /* A script too long to store is REFUSED, never trimmed: a half-saved
     script parses as garbage and draws nothing, and the reader would have no
     way to tell that from a bug in the engine. */
  const tooLong = draft.length > MAX_SOURCE_CHARS;
  const mine = scripts.filter(s => !s.builtin);

  const save = () => {
    if (tooLong || readOnly) return;
    const existing = scripts.find(s => s.id === selected && !s.builtin);
    if (existing) onChange(scripts.map(s => (s.id === existing.id ? { ...s, name, source: draft } : s)));
    else {
      if (mine.length >= MAX_SCRIPTS) return;
      const id = newScriptId();
      onChange([...scripts, { id, name, source: draft, enabled: true }]);
      setSelected(id);
    }
  };

  /* FORKING A SHIPPED SCRIPT is how a reader changes one. The copy is an
     ordinary script of their own from that moment — the original stays as
     the code defines it, and keeps updating with the desk. */
  const fork = () => {
    if (mine.length >= MAX_SCRIPTS) return;
    const id = newScriptId();
    const copyName = `${name} (mine)`;
    onChange([...scripts, { id, name: copyName, source: draft, enabled: true }]);
    setSelected(id);
    setName(copyName);
  };

  const addNew = () => {
    setSelected(null);
    setDraft(STARTER_SOURCE);
    setName(`Indicator ${mine.length + 1}`);
  };

  const remove = (id: string) => {
    const next = scripts.filter(s => s.id !== id);
    onChange(next);
    if (selected === id) {
      const fallback = next[0] ?? null;
      setSelected(fallback?.id ?? null);
      setDraft(fallback?.source ?? STARTER_SOURCE);
      setName(fallback?.name ?? 'My indicator');
    }
  };

  const toggle = (id: string) => onChange(scripts.map(s => (s.id === id ? { ...s, enabled: !s.enabled } : s)));

  const dirty = (() => {
    if (readOnly) return false;
    const s = scripts.find(x => x.id === selected);
    return !s || s.source !== draft || s.name !== name;
  })();

  const refusals: Refusal[] = !result.ok && result.stage === 'unsupported' ? result.refusals : [];
  const reference = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return FNS_INDEX.filter(f => !q || f.toLowerCase().includes(q));
  }, [filter]);
  const slayerRef = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return SLAYER_INDEX.filter(r => !q || r.name.toLowerCase().includes(q) || r.what.toLowerCase().includes(q));
  }, [filter]);

  /* The verdict's colour is its meaning: green runs, amber is a subset's
     honest edge, red is malformed. Nothing else on this panel is coloured. */
  const tone = result.ok ? (probe && !probe.ok ? 'bear' : 'bull') : result.stage === 'syntax' ? 'bear' : 'warn';
  const toneText = tone === 'bull' ? 'text-bull' : tone === 'bear' ? 'text-bear' : 'text-warn';
  /* The coloured edge is a DIV, not a side-specific border colour: those
     utilities are not in this build's token set (dead-classes-proof catches
     them), and colouring all four sides would repaint the panel's own top
     rule as well. */
  const toneEdge = tone === 'bull' ? 'bg-bull' : tone === 'bear' ? 'bg-bear' : 'bg-warn';

  const verdictWord = !result.ok
    ? result.stage === 'syntax' ? 'Will not parse' : `${refusals.length} not implemented`
    : probe === null ? 'Compiles' : probe.ok ? 'Runs' : 'Fails while running';

  const verdictLine = !result.ok
    ? result.stage === 'syntax'
      ? `Line ${result.line} · ${result.message}`
      : 'Refused rather than approximated — every one is listed, at its line'
    : probe === null
      ? `${result.program.body.length} statements · running it against ${ticker} ${timeframe}…`
      : probe.ok
        ? drewSomething(probe.run)
          ? `drew ${drawnCount(probe.run)} over ${probe.bars} bars in ${probe.ms}ms`
          : `ran clean over ${probe.bars} bars and put nothing on the chart`
        : probe.message;

  /* Where the caret is, for the status bar. Read from the textarea rather
     than tracked, because every path that moves it — typing, clicking, a
     refusal jumping to a line — would otherwise need its own bookkeeping. */
  const caret = (() => {
    const ta = taRef.current;
    const at = ta ? ta.selectionStart : 0;
    const before = draft.slice(0, at);
    const row = before.split('\n').length;
    const col = at - (before.lastIndexOf('\n') + 1) + 1;
    return { row, col };
  })();

  /* Grouped for the script menu the way the picker groups them: the reader's
     own first, because those are the ones they came here to edit. */
  const menuGroups = useMemo(() => {
    const byId = new Map(LIBRARY.map(l => [l.id, l] as const));
    const own = scripts.filter(s => !s.builtin);
    const slayer = scripts.filter(s => byId.get(s.id)?.kind === 'slayer');
    const classic = scripts.filter(s => byId.get(s.id)?.kind === 'classic');
    return [
      { title: 'My scripts', items: own },
      { title: 'Slayer', items: slayer },
      { title: 'Technicals', items: classic },
    ].filter(g => g.items.length > 0);
  }, [scripts]);

  const minimapRow = Math.max(1.2, Math.min(3, 460 / Math.max(lines.length, 1)));

  if (!open) return null;

  const statusInk = tone === 'bull' ? 'text-bull' : tone === 'bear' ? 'text-bear' : 'text-warn';

  return (
    <>
      {/* THE DESK MAKES ROOM. A panel that floats over the chart hides the
          very thing a writer is checking their script against, so the grid
          is padded by the panel's width instead — the editor and the tape
          are both fully visible, which is the whole point of docking it. */}
      <style>{`:root { --pine-dock: ${collapsed ? 40 : width}px; }`}</style>

      <aside
        data-pine-editor
        aria-label="Pine Editor"
        className="fixed right-0 top-14 bottom-0 z-[90] flex flex-col bg-panel border-l border-borderMuted shadow-[-18px_0_50px_-24px_rgba(0,0,0,0.9)]"
        style={{ width: collapsed ? 40 : width }}
      >
        {/* ── the drag handle, on the edge it moves ────────────────────── */}
        {!collapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the editor"
            onMouseDown={e => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = width;
              const move = (ev: MouseEvent) => {
                const next = Math.min(window.innerWidth - 320, Math.max(380, startW + (startX - ev.clientX)));
                setWidth(next);
              };
              const up = () => {
                window.removeEventListener('mousemove', move);
                window.removeEventListener('mouseup', up);
              };
              window.addEventListener('mousemove', move);
              window.addEventListener('mouseup', up);
            }}
            className="absolute left-0 top-0 bottom-0 w-1 -ml-0.5 cursor-col-resize hover:bg-select/40 transition-colors z-10"
          />
        )}

        {collapsed ? (
          <button
            onClick={() => setCollapsed(false)}
            title="Pine Editor"
            className="flex-1 flex flex-col items-center gap-2 pt-3 text-textMuted hover:text-textPrimary transition-colors"
          >
            <Code2 className="w-4 h-4" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] [writing-mode:vertical-rl]">Pine Editor</span>
          </button>
        ) : (
          <>
            {/* ── title bar ─────────────────────────────────────────────── */}
            <header className="shrink-0 h-9 flex items-center gap-2 px-3 border-b border-borderSubtle bg-inset">
              <Code2 className="w-3.5 h-3.5 text-textMuted" />
              <span className="text-[12px] text-textPrimary">Pine Editor</span>
              <span className="ml-auto flex items-center gap-0.5">
                <button
                  onClick={() => setCollapsed(true)}
                  aria-label="Minimise"
                  title="Minimise"
                  className="w-6 h-6 grid place-items-center rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.06] transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  title="Close"
                  className="w-6 h-6 grid place-items-center rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.06] transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            </header>

            {/* ── the toolbar: which script, and what to do with it ─────── */}
            <div className="shrink-0 h-12 flex items-center gap-2 px-3 border-b border-borderSubtle">
              <div className="relative min-w-0">
                <button
                  onClick={() => setMenuOpen(o => !o)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  data-pine-script-menu
                  className="flex items-center gap-1.5 max-w-[240px] px-1.5 py-1 rounded text-textPrimary hover:bg-white/[0.05] transition-colors"
                >
                  <Activity className="w-3.5 h-3.5 text-textMuted shrink-0" />
                  <span className="truncate text-[13px]">{name}</span>
                  {dirty && <span className="w-1.5 h-1.5 rounded-full bg-select shrink-0" title="Unsaved" />}
                  <ChevronDown className="w-3.5 h-3.5 text-textMuted shrink-0" />
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full mt-1 w-[300px] max-h-[60vh] overflow-y-auto rounded-md border border-borderMuted bg-panel shadow-[0_18px_50px_-18px_rgba(0,0,0,0.9)] z-30"
                  >
                    <button
                      onClick={() => {
                        addNew();
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 h-9 text-left text-[12px] text-textSecondary hover:text-textPrimary hover:bg-white/[0.05] border-b border-borderSubtle transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> New indicator
                    </button>
                    {menuGroups.map(g => (
                      <div key={g.title}>
                        <div className="px-3 pt-2 pb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-textMuted">{g.title}</div>
                        {g.items.map(s => (
                          <button
                            key={s.id}
                            onClick={() => {
                              pick(s);
                              setMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 h-8 text-left transition-colors ${
                              selected === s.id ? 'bg-white/[0.06] text-textPrimary' : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.04]'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.enabled ? 'bg-select' : 'bg-borderMuted'}`}
                              title={s.enabled ? 'On the chart' : 'Off'}
                            />
                            <span className="flex-1 truncate text-[12px]">{s.name}</span>
                            {!s.builtin && (
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={e => {
                                  e.stopPropagation();
                                  remove(s.id);
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.stopPropagation();
                                    remove(s.id);
                                  }
                                }}
                                aria-label={`Delete ${s.name}`}
                                className="text-textMuted hover:text-bear p-0.5 shrink-0"
                              >
                                <Trash2 className="w-3 h-3" />
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ADD TO CHART is the primary act, and it is disabled when the
                  script will not run — a button that puts a broken indicator
                  on the tape teaches nothing. */}
              <button
                onClick={() => {
                  save();
                  const s = scripts.find(x => x.id === selected);
                  if (s && !s.enabled) toggle(s.id);
                }}
                disabled={!result.ok || tooLong}
                title={result.ok ? 'Save and draw it on every pane' : 'Fix the complaints below first'}
                className={`shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] transition-colors ${
                  result.ok && !tooLong
                    ? 'bg-select/15 border border-select/40 text-select hover:bg-select/25'
                    : 'bg-white/[0.03] border border-borderSubtle text-textMuted cursor-not-allowed'
                }`}
              >
                <Play className="w-3 h-3" /> Add to chart
              </button>

              {!readOnly && (
                <button
                  onClick={save}
                  disabled={!dirty || tooLong}
                  className={`shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[12px] transition-colors ${
                    dirty && !tooLong
                      ? 'border-borderMuted text-textSecondary hover:text-textPrimary hover:border-textMuted'
                      : 'border-borderSubtle text-textMuted cursor-not-allowed'
                  }`}
                >
                  Save
                </button>
              )}

              {readOnly && (
                <button
                  onClick={fork}
                  title="Copy it into a script of your own, and edit that"
                  className="shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-borderMuted text-[12px] text-textSecondary hover:text-textPrimary hover:border-textMuted transition-colors"
                >
                  <Copy className="w-3 h-3" /> Make a copy
                </button>
              )}

              <div className="relative ml-auto shrink-0">
                <button
                  onClick={() => setOverflow(o => !o)}
                  aria-haspopup="menu"
                  aria-expanded={overflow}
                  aria-label="More"
                  className="w-7 h-7 grid place-items-center rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.06] transition-colors"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {overflow && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1 w-[240px] rounded-md border border-borderMuted bg-panel shadow-[0_18px_50px_-18px_rgba(0,0,0,0.9)] z-30 py-1"
                  >
                    <button
                      onClick={() => {
                        setRefOpen(r => !r);
                        setOverflow(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 h-8 text-left text-[12px] text-textSecondary hover:text-textPrimary hover:bg-white/[0.05] transition-colors"
                    >
                      <BookOpen className="w-3.5 h-3.5" /> {refOpen ? 'Hide' : 'Show'} reference
                    </button>
                    <button
                      onClick={() => {
                        setConsoleOpen(c => !c);
                        setOverflow(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 h-8 text-left text-[12px] text-textSecondary hover:text-textPrimary hover:bg-white/[0.05] transition-colors"
                    >
                      <TerminalSquare className="w-3.5 h-3.5" /> {consoleOpen ? 'Hide' : 'Show'} console
                    </button>
                    <button
                      onClick={() => {
                        setMinimap(m => !m);
                        setOverflow(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 h-8 text-left text-[12px] text-textSecondary hover:text-textPrimary hover:bg-white/[0.05] transition-colors"
                    >
                      <MapIcon className="w-3.5 h-3.5" /> {minimap ? 'Hide' : 'Show'} minimap
                    </button>
                    {!readOnly && (
                      <button
                        onClick={() => {
                          fork();
                          setOverflow(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 h-8 text-left text-[12px] text-textSecondary hover:text-textPrimary hover:bg-white/[0.05] transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" /> Duplicate
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── the code ──────────────────────────────────────────────── */}
            <div className="flex-1 min-h-0 flex">
              <div className="flex-1 min-w-0 relative flex bg-inset">
                {/* the gutter */}
                <div
                  ref={gutterRef}
                  aria-hidden
                  className="shrink-0 w-[52px] overflow-hidden select-none border-r border-borderSubtle bg-inset"
                >
                  <div className="py-3">
                    {lines.map((_, i) => (
                      <div
                        key={i}
                        className={`h-[19px] pr-2.5 text-right font-mono text-[11px] leading-[19px] tabular-nums ${
                          marked.has(i + 1) ? 'text-bear' : caret.row === i + 1 ? 'text-textSecondary' : 'text-textMuted/60'
                        }`}
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>
                </div>

                {/* the two stacked layers — colour underneath, caret on top */}
                <div className="relative flex-1 min-w-0">
                  <pre
                    ref={inkRef}
                    aria-hidden
                    className="absolute inset-0 m-0 py-3 px-3 overflow-hidden font-mono text-[12.5px] leading-[19px] whitespace-pre"
                  >
                    {ink.map((t, i) => (
                      <span key={i} className={t.ink ? undefined : TONE_CLASS[t.tone]} style={t.ink ? { color: t.ink } : undefined}>
                        {t.text}
                      </span>
                    ))}
                  </pre>
                  <textarea
                    ref={taRef}
                    value={draft}
                    readOnly={readOnly}
                    spellCheck={false}
                    onChange={e => setDraft(e.target.value)}
                    onKeyUp={() => setCaretNonce(n => n + 1)}
                    onClick={() => setCaretNonce(n => n + 1)}
                    onSelect={() => setCaretNonce(n => n + 1)}
                    onScroll={e => {
                      setViewRows(Math.max(4, Math.round(e.currentTarget.clientHeight / 19)));
                      const top = e.currentTarget.scrollTop;
                      const left = e.currentTarget.scrollLeft;
                      if (gutterRef.current) gutterRef.current.scrollTop = top;
                      if (inkRef.current) {
                        inkRef.current.scrollTop = top;
                        inkRef.current.scrollLeft = left;
                      }
                      setScrollTop(top);
                    }}
                    onKeyDown={e => {
                      /* TAB INDENTS, because Pine is an indentation language
                         and a tab that leaves the editor makes writing a
                         block impossible. */
                      if (e.key === 'Tab') {
                        e.preventDefault();
                        const ta = e.currentTarget;
                        const at = ta.selectionStart;
                        const next = `${draft.slice(0, at)}    ${draft.slice(ta.selectionEnd)}`;
                        setDraft(next);
                        requestAnimationFrame(() => ta.setSelectionRange(at + 4, at + 4));
                      }
                    }}
                    aria-label="Pine source"
                    className="absolute inset-0 w-full h-full resize-none bg-transparent py-3 px-3 font-mono text-[12.5px] leading-[19px] text-transparent caret-select selection:bg-select/25 outline-none whitespace-pre overflow-auto"
                  />
                </div>

                {/* THE MINIMAP, and it is a real one — a line per line, its
                    width the length of that line, marked where a complaint
                    sits. On a 750-line indicator the shape of the file is how
                    a reader finds the block they were just in. */}
                {minimap && lines.length > 40 && (
                  <div
                    className="shrink-0 w-[46px] relative border-l border-borderSubtle bg-inset overflow-hidden cursor-pointer"
                    onClick={e => {
                      const box = e.currentTarget.getBoundingClientRect();
                      const frac = (e.clientY - box.top) / box.height;
                      goToLine(Math.max(1, Math.round(frac * lines.length)));
                    }}
                    aria-hidden
                  >
                    <div className="absolute inset-0 py-1 px-1.5">
                      {lines.map((ln, i) => {
                        const len = Math.min(40, ln.replace(/^\s+/, '').length);
                        const indent = Math.min(10, (ln.length - ln.replace(/^\s+/, '').length) / 2);
                        if (len === 0) return <div key={i} style={{ height: minimapRow }} />;
                        return (
                          <div key={i} style={{ height: minimapRow, paddingLeft: `${indent}px` }}>
                            <div
                              className={`h-[1px] ${marked.has(i + 1) ? 'bg-bear' : ln.trimStart().startsWith('//') ? 'bg-[#6A9955]/45' : 'bg-textMuted/45'}`}
                              style={{ width: `${(len / 40) * 100}%` }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    {/* the viewport box */}
                    <div
                      className="absolute left-0 right-0 bg-white/[0.06] border-y border-white/10 pointer-events-none"
                      style={{
                        top: (scrollTop / 19) * minimapRow + 4,
                        height: Math.max(8, (viewRows || 20) * minimapRow),
                      }}
                    />
                  </div>
                )}
              </div>

              {/* THE REFERENCE, behind a switch rather than always up. It is
                  ninety names; a writer needs it on the day they learn the
                  namespace and not on every day after. */}
              {refOpen && (
                <div className="shrink-0 w-[280px] border-l border-borderSubtle bg-panel overflow-y-auto">
                  <div className="sticky top-0 bg-panel border-b border-borderSubtle px-3 py-2">
                    <input
                      value={filter}
                      onChange={e => setFilter(e.target.value)}
                      placeholder="Filter the reference…"
                      aria-label="Filter the reference"
                      className="w-full bg-inset border border-borderSubtle rounded px-2 py-1 text-[11px] text-textPrimary placeholder:text-textMuted outline-none focus:border-select/40"
                    />
                  </div>
                  <div className="p-3 space-y-4">
                    <section>
                      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#7DE3FF] pb-1.5">
                        slayer · the dealer book · {slayerRef.length}
                      </p>
                      <ul className="space-y-1.5">
                        {slayerRef.map(r => (
                          <li key={r.name} className="leading-snug">
                            <span className="flex items-baseline gap-1.5">
                              <span className="font-mono text-[10px] text-textPrimary">
                                {r.name}
                                {r.takes && <span className="text-textMuted">{r.takes}</span>}
                              </span>
                              <span
                                className={`font-mono text-[8px] uppercase tracking-wider px-1 rounded-sm shrink-0 ${
                                  r.kind === 'series' ? 'text-bull bg-bull/10' : 'text-warn bg-warn/10'
                                }`}
                              >
                                {r.kind}
                              </span>
                            </span>
                            <span className="block text-[10px] text-textMuted leading-snug">{r.what}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-textMuted pb-1.5">
                        Pine · implemented {reference.length}
                      </p>
                      <ul className="flex flex-wrap gap-x-2.5 gap-y-0.5">
                        {reference.map(f => (
                          <li key={f} className="font-mono text-[10px] text-textSecondary">{f}</li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-textMuted pb-1.5">
                        Not implemented — refused by name
                      </p>
                      <ul className="flex flex-wrap gap-x-2.5 gap-y-0.5">
                        {REFUSED.map(f => (
                          <li
                            key={f.prefix}
                            title={f.why}
                            className="font-mono text-[10px] text-textMuted line-through decoration-textMuted/40"
                          >
                            {f.prefix}
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>
                </div>
              )}
            </div>

            {/* ── the console ───────────────────────────────────────────── */}
            {consoleOpen && (
              <div className="shrink-0 max-h-[34%] overflow-y-auto border-t border-borderSubtle bg-panel">
                <div className="relative flex items-start gap-2 px-3 py-2">
                  <span className={`absolute left-0 top-0 bottom-0 w-[2px] ${toneEdge}`} aria-hidden />
                  <TerminalSquare className={`w-3.5 h-3.5 mt-px shrink-0 ${statusInk}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-[12px] ${toneText}`}>
                      {tooLong ? 'Too long to save' : verdictWord}
                    </p>
                    <p className="text-[11px] text-textMuted leading-snug">
                      {tooLong
                        ? `${draft.length.toLocaleString()} characters — the ceiling is ${MAX_SOURCE_CHARS.toLocaleString()}. It is refused rather than trimmed: half a script parses as garbage and draws nothing.`
                        : verdictLine}
                    </p>

                    {/* A syntax error shows the offending line, because the
                        message alone rarely locates it. */}
                    {!result.ok && result.stage === 'syntax' && lines[result.line - 1] !== undefined && (
                      <button
                        onClick={() => goToLine(result.line)}
                        className="mt-1.5 block w-full text-left font-mono text-[11px] bg-inset border border-borderSubtle rounded px-2 py-1 text-textSecondary hover:border-bear/40 transition-colors overflow-x-auto"
                      >
                        <span className="text-textMuted mr-2 tabular-nums">{result.line}</span>
                        {lines[result.line - 1]}
                      </button>
                    )}

                    {refusals.length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {refusals.map((r, i) => (
                          <li key={`${r.line}-${r.name}-${i}`}>
                            <button
                              onClick={() => goToLine(r.line)}
                              className="w-full text-left flex items-baseline gap-2 rounded px-1.5 py-1 hover:bg-white/[0.04] transition-colors"
                            >
                              <span className="font-mono text-[10px] text-textMuted tabular-nums shrink-0">line {r.line}</span>
                              <span className="min-w-0">
                                <span className="font-mono text-[11px] text-warn">{r.name}</span>
                                <span className="block text-[10.5px] text-textMuted leading-snug">{r.why}</span>
                                {r.didYouMean && (
                                  <span className="block text-[10.5px] text-textSecondary">
                                    did you mean <span className="font-mono text-select">{r.didYouMean}</span>?
                                  </span>
                                )}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {probe?.ok && probe.run.notes.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {probe.run.notes.map(n => (
                          <li key={n} className="text-[10.5px] text-warn/90 leading-snug">· {n}</li>
                        ))}
                      </ul>
                    )}

                    {probe?.ok && (
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
                        {reportRows(probe.run).map(([k, v]) => (
                          <span key={k} className="font-mono text-[10px] text-textMuted">
                            {k} <span className="text-textSecondary">{v}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setConsoleOpen(false)}
                    aria-label="Hide the console"
                    className="shrink-0 w-6 h-6 grid place-items-center rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.06] transition-colors"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* ── the status line ───────────────────────────────────────── */}
            <footer className="shrink-0 h-6 flex items-center gap-3 px-3 border-t border-borderSubtle bg-inset font-mono text-[10px] text-textMuted">
              {!consoleOpen && (
                <button
                  onClick={() => setConsoleOpen(true)}
                  className={`inline-flex items-center gap-1.5 ${statusInk} hover:underline`}
                >
                  <TerminalSquare className="w-3 h-3" /> {tooLong ? 'Too long to save' : verdictWord}
                </button>
              )}
              <span className="truncate">{ticker} · {timeframe}{readOnly ? ' · read-only' : ''}</span>
              <span className="ml-auto tabular-nums">Line {caret.row}, Col {caret.col}</span>
              <span className="text-textSecondary">Pine v6</span>
            </footer>
          </>
        )}
      </aside>
    </>
  );
};


/** The run, as rows — every output the engine can produce, including zero. */
function reportRows(run: PineRun): [string, string][] {
  const shapeMarks = run.shapes.reduce((n, sh) => n + sh.at.length, 0);
  /* PLOTS THAT CARRY VALUES, not plot declarations. A script can declare
     five and have every one come back `na` — counting the declarations told
     the reader five lines were on the pane when the pane was empty. */
  const has = (p: { values: (number | null)[] }) => p.values.some(v => v !== null);
  const onPane = run.plots.filter(p => !p.offScale && has(p) && (p.display === 'all' || p.display === 'pane')).length;
  const onScale = run.plots.filter(p => !p.offScale && has(p) && p.display === 'price_scale').length;
  const rows: [string, string][] = [];
  const off = run.plots.filter(p => p.offScale).length;
  if (onPane) rows.push(['lines on the pane', String(onPane)]);
  if (off) rows.push(['plots not in price', `${off} — left undrawn`]);
  if (onScale) rows.push(['tags on the price scale', String(onScale)]);
  if (shapeMarks) rows.push(['marks', String(shapeMarks)]);
  if (run.bands.some(Boolean)) rows.push(['bars shaded', String(run.bands.filter(Boolean).length)]);
  if (run.drawings.length) rows.push(['objects left standing', drawnCount(run)]);
  /* `overlay = false` USED TO MEAN "will not draw", and that was the single
     most misleading line in this report: most oscillators anyone writes
     declare it, and they were being told their script was fine and shown an
     empty chart. It now buys a pane below the tape, rationed like the
     built-in ones, so the row says where the picture went. */
  if (!run.overlay) rows.push(['pane', `its own, below the tape — up to ${MAX_PINE_PANES} scripts may have one`]);
  if (run.inputs.length) rows.push(['inputs', String(run.inputs.length)]);
  if (run.alerts.length) rows.push(['alerts', String(run.alerts.length)]);
  return rows;
}

export default PineEditor;
