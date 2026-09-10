import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Copy, Plus, Trash2 } from 'lucide-react';
import Modal from '../ui/Modal';
import {
  compilePine, evaluatePine, FNS_INDEX, REFUSED, SLAYER_INDEX,
  type PineRun, type Refusal,
} from '../../data/pine';
import {
  MAX_SCRIPTS, MAX_SOURCE_CHARS, STARTER_SOURCE, newScriptId, type UserScript,
} from '../../data/pine/store';
import { PREMIER } from '../../data/pine/premier';
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

const blurbFor = (id: string): string | null => PREMIER.find(p => p.id === id)?.blurb ?? null;

/** "4 lines, 4 labels, 1 box" — what a run left standing on the chart. */
const drawnCount = (run: PineRun): string => {
  const by = new Map<string, number>();
  for (const d of run.drawings) by.set(d.what, (by.get(d.what) ?? 0) + 1);
  if (by.size === 0) return 'nothing';
  return [...by.entries()].map(([k, n]) => `${n} ${k}${n === 1 ? '' : k === 'box' ? 'es' : 's'}`).join(', ');
};

/** Did this run put ANYTHING on the chart? The question a verdict hides. */
const drewSomething = (run: PineRun): boolean =>
  run.drawings.length > 0 ||
  run.bands.some(Boolean) ||
  run.shapes.some(s => s.at.length > 0) ||
  run.plots.some(p => !p.offScale && p.display !== 'none' && p.values.some(v => v !== null));

const PineEditor = ({ open, onClose, scripts, onChange, ticker, timeframe }: Props) => {
  const [selected, setSelected] = useState<string | null>(scripts[0]?.id ?? null);
  const [draft, setDraft] = useState<string>(scripts[0]?.source ?? STARTER_SOURCE);
  const [name, setName] = useState<string>(scripts[0]?.name ?? 'My indicator');
  const [tab, setTab] = useState<'report' | 'reference'>('report');
  const [filter, setFilter] = useState('');
  const [probe, setProbe] = useState<Probe | null>(null);
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
    setTab('report');
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

  const rowItem = (s: UserScript) => (
    <li key={s.id}>
      <div
        className={`group flex items-start gap-2 pr-1.5 py-1.5 transition-colors ${
          selected === s.id ? 'bg-white/[0.05]' : 'hover:bg-white/[0.025]'
        }`}
      >
        <div className={`w-0.5 self-stretch shrink-0 ${selected === s.id ? 'bg-select' : 'bg-transparent'}`} aria-hidden />
        <button
          type="button"
          onClick={() => toggle(s.id)}
          aria-pressed={s.enabled}
          aria-label={`${s.enabled ? 'Hide' : 'Show'} ${s.name}`}
          title={s.enabled ? 'Drawing on the tape' : 'Off — saved, not drawing'}
          className={`w-4 h-4 mt-px shrink-0 rounded-[3px] border flex items-center justify-center transition-colors ${
            s.enabled ? 'border-select bg-select/20 text-select' : 'border-borderMuted text-transparent hover:border-textMuted'
          }`}
        >
          <Check className="w-2.5 h-2.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => pick(s)}
          className="flex-1 min-w-0 text-left"
        >
          <span className={`block font-mono text-[11px] truncate ${selected === s.id ? 'text-textPrimary' : 'text-textSecondary group-hover:text-textPrimary'}`}>
            {s.name}
          </span>
          {blurbFor(s.id) && (
            <span className="block text-[10px] text-textMuted leading-snug line-clamp-2 pt-0.5">{blurbFor(s.id)}</span>
          )}
        </button>
        {!s.builtin && (
          <button
            type="button"
            onClick={() => remove(s.id)}
            aria-label={`Delete ${s.name}`}
            className="text-textMuted hover:text-bear p-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
          >
            <Trash2 className="w-3 h-3" aria-hidden />
          </button>
        )}
      </div>
    </li>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel="Pine indicators"
      widthClass="max-w-[86rem]"
      header={<span className="font-mono text-[12px] tracking-wide">Script maker</span>}
      headerActions={
        <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">
          Pine v6 subset · {ticker} {timeframe}
        </span>
      }
    >
      <div
        /* ONE HEIGHT FOR ALL THREE COLUMNS. Each of them wants to size to
           its own content — a long script, four shipped indicators, a
           reference of ninety names — and left alone they leave the two
           shorter ones ending in mid-air. The panel sets the height; every
           column fills it and scrolls inside. */
        /* AND IT USES THE SCREEN IT IS ON. A fixed 40rem is a small box in
           the middle of a 4K display; the modal already allows 86vh, so the
           panel takes what is there and stops at a height a line of code is
           still findable in. */
        className="grid grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)_24rem] lg:h-[clamp(30rem,74vh,62rem)] border border-borderSubtle rounded-lg overflow-hidden bg-panel"
        data-pine-editor
      >
        {/* ── library ───────────────────────────────────────────────── */}
        <aside className="flex flex-col min-w-0 min-h-0 border-b lg:border-b-0 lg:border-r border-borderSubtle bg-inset/50">
          <div className="flex-1 min-h-0 overflow-y-auto max-h-[15rem] lg:max-h-none" data-pine-list>
            {/*
              THE SHIPPED FOUR LEAD. They are written in the same Pine, run
              by the same engine, and every one of them is built on the
              dealer book — which is the only reason this panel exists
              rather than a link to TradingView.
            */}
            <p className="px-2 pt-2 pb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-textMuted">
              Comes with the desk
            </p>
            <ul className="flex flex-col">{scripts.filter(s => s.builtin).map(rowItem)}</ul>

            <div className="flex items-center justify-between px-2 pt-3 pb-1">
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-textMuted">
                Mine {mine.length}/{MAX_SCRIPTS}
              </span>
              <button
                type="button"
                onClick={addNew}
                disabled={mine.length >= MAX_SCRIPTS}
                title="Start a new script"
                aria-label="New script"
                className="text-textMuted hover:text-select disabled:opacity-30 p-0.5"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden />
              </button>
            </div>
            {mine.length === 0 ? (
              <p className="px-2 pb-2 text-[10px] text-textMuted leading-snug">
                None yet. The starter is a working EMA cross — edit it and press Add, or duplicate one above.
              </p>
            ) : (
              <ul className="flex flex-col">{mine.map(rowItem)}</ul>
            )}
          </div>
        </aside>

        {/* ── code ──────────────────────────────────────────────────── */}
        <section className="flex flex-col min-w-0 min-h-0">
          <header className="flex items-center gap-2 px-2.5 h-10 border-b border-borderSubtle bg-panel">
            <input
              id="pine-name"
              aria-label="Script name"
              value={name}
              readOnly={readOnly}
              onChange={e => setName(e.target.value.slice(0, 60))}
              placeholder="Name"
              className="flex-1 min-w-0 bg-transparent font-mono text-[12px] text-textPrimary placeholder:text-textMuted focus:outline-none read-only:text-textSecondary"
            />
            <span className={`font-mono text-[10px] tabular-nums shrink-0 ${tooLong ? 'text-bear' : 'text-textMuted'}`}>
              {tooLong
                ? `${draft.length.toLocaleString()} / ${MAX_SOURCE_CHARS.toLocaleString()} — too long to save`
                : `${lines.length} lines`}
            </span>
            {readOnly ? (
              <button type="button" className={GHOST} onClick={fork} disabled={mine.length >= MAX_SCRIPTS} title="Make an editable copy of this script">
                <Copy className="w-3 h-3" aria-hidden />
                Duplicate
              </button>
            ) : (
              <button
                type="button"
                className={dirty && !tooLong ? PRIMARY : GHOST}
                onClick={save}
                disabled={!dirty || tooLong}
                title={tooLong ? 'Shorten the script — saving a trimmed copy would draw something that is not this script' : undefined}
              >
                {selected && !readOnly ? 'Save' : 'Add'}
              </button>
            )}
          </header>

          {readOnly && (
            <p className="px-2.5 py-1.5 border-b border-borderSubtle bg-white/[0.02] text-[10px] text-textMuted leading-snug">
              This one ships with the desk, so its code lives in the repo rather than in your browser — it keeps improving without you
              re-pasting it. Duplicate it to make it yours.
            </p>
          )}

          {/*
            LINE NUMBERS BESIDE THE CODE, SCROLLED TOGETHER.

            The HEIGHT LIVES ON THIS ROW, not on the textarea. Put it on the
            textarea alone and the gutter — which renders one div per logical
            line — grows to the length of the script and stretches the column
            with it, pushing the verdict off the bottom of the panel. The
            verdict is the most important thing here; it does not get to be
            below the fold because a script is long.
          */}
          <div className="flex min-h-0 h-[22rem] lg:h-auto lg:flex-1 bg-inset">
            <div
              ref={gutterRef}
              aria-hidden
              className="shrink-0 w-10 h-full overflow-hidden select-none border-r border-borderSubtle/60 py-2.5 text-right"
            >
              {lines.map((_, i) => (
                <div
                  key={i}
                  className={`px-1.5 font-mono text-[11px] leading-[1.55] tabular-nums ${
                    marked.has(i + 1) ? 'text-warn font-bold' : 'text-textMuted/50'
                  }`}
                >
                  {i + 1}
                </div>
              ))}
            </div>
            {/*
              TWO LAYERS, ONE GRID.

              The coloured code is a `<pre>` UNDER a textarea whose own text
              is transparent — the browser has no styled-text input, and this
              is the way every code editor in a browser does it. They must
              agree on the position of every glyph, so the font, the size,
              the leading, the padding and the wrapping are set identically
              on both and the textarea drives the scroll of the layer beneath.
              Get one of those wrong and the caret sits beside the letter it
              is supposed to be inside.
            */}
            <div className="relative flex-1 min-w-0 h-full">
              <pre
                ref={inkRef}
                aria-hidden
                className="absolute inset-0 m-0 px-3 py-2.5 font-mono text-[11px] leading-[1.55] whitespace-pre overflow-hidden pointer-events-none"
              >
                {ink.map((t, k) => (
                  <span key={k} className={t.ink ? undefined : TONE_CLASS[t.tone]} style={t.ink ? { color: t.ink } : undefined}>
                    {t.text}
                  </span>
                ))}
              </pre>
              <textarea
                ref={taRef}
                value={draft}
                readOnly={readOnly}
                onChange={e => setDraft(e.target.value)}
                spellCheck={false}
                data-pine-source
                aria-label="Pine source"
                /*
                  NO WRAPPING, and the gutter is why. A wrapped line occupies
                  two visual rows while the gutter draws one number per
                  LOGICAL line, so every number below a wrap points at the
                  wrong code — and every refusal in this panel is addressed
                  by line.
                */
                wrap="off"
                onScroll={e => {
                  if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                  if (inkRef.current) {
                    inkRef.current.scrollTop = e.currentTarget.scrollTop;
                    inkRef.current.scrollLeft = e.currentTarget.scrollLeft;
                  }
                }}
                className="absolute inset-0 w-full h-full bg-transparent px-3 py-2.5 font-mono text-[11px] leading-[1.55] text-transparent caret-select selection:bg-select/25 resize-none focus:outline-none whitespace-pre overflow-auto"
              />
            </div>
          </div>

          {/* the verdict — one word, then the consequence */}
          <div className="flex border-t border-borderSubtle bg-panel" data-pine-status>
            <div className={`w-[3px] shrink-0 ${toneEdge}`} aria-hidden />
            <div className="min-w-0 px-2.5 py-2">
              <span className={`font-mono text-[11px] font-bold ${toneText}`} data-pine-ok>{verdictWord}</span>
              <span className="text-[11px] text-textSecondary pl-2" data-pine-verdict>{verdictLine}</span>
              {!result.ok && result.stage === 'syntax' && (
                <button type="button" onClick={() => goToLine(result.line)} className="font-mono text-[10px] text-textMuted hover:text-textPrimary hover:underline pl-2" data-pine-syntax>
                  go to it
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── report / reference ────────────────────────────────────── */}
        <aside className="flex flex-col min-w-0 min-h-0 border-t lg:border-t-0 lg:border-l border-borderSubtle bg-inset/50">
          <header className="flex items-stretch h-10 border-b border-borderSubtle shrink-0">
            {(['report', 'reference'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className={`flex-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors border-b-2 ${
                  /* Colour on all four sides, width only on the bottom — the
                     side-specific colour utilities are not in this build's
                     token set, and dead-classes-proof catches them. */
                  tab === t ? 'text-textPrimary border-select bg-white/[0.04]' : 'text-textMuted border-transparent hover:text-textSecondary'
                }`}
              >
                {t === 'report' ? `Report${refusals.length ? ` · ${refusals.length}` : ''}` : 'Reference'}
              </button>
            ))}
          </header>

          {tab === 'report' ? (
            <div className="flex-1 min-h-0 overflow-y-auto p-2.5 max-h-[28rem] lg:max-h-none flex flex-col gap-3" data-pine-report>
              {!result.ok ? (
                result.stage === 'syntax' ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[11px] text-textSecondary leading-snug">
                      Line {result.line} could not be parsed. {result.message}
                    </p>
                    {/* THE LINE ITSELF. A line number sends a reader hunting;
                        the line in front of them is the thing they have to
                        look at, and seeing it beside the complaint is often
                        the whole diagnosis. */}
                    {lines[result.line - 1] !== undefined && (
                      <pre className="rounded border border-borderSubtle bg-canvas px-2 py-1.5 font-mono text-[10px] text-textPrimary whitespace-pre overflow-x-auto">
                        <span className="text-textMuted select-none">{result.line}  </span>
                        {lines[result.line - 1] || ' '}
                      </pre>
                    )}
                    <button type="button" onClick={() => goToLine(result.line)} className="self-start font-mono text-[10px] text-textMuted hover:text-textPrimary hover:underline">
                      go to it
                    </button>
                  </div>
                ) : (
                  <>
                    <ul className="flex flex-col gap-1" data-pine-refusals>
                      {refusals.map((r, i) => (
                        <li key={`${r.name}-${r.line}-${i}`}>
                          <button
                            type="button"
                            onClick={() => goToLine(r.line)}
                            className="w-full text-left rounded px-1 py-1 hover:bg-white/[0.05] focus:outline-none focus-visible:ring-1 focus-visible:ring-select"
                          >
                            <span className="flex items-center gap-1.5">
                              <ChevronRight className="w-3 h-3 text-textMuted shrink-0" aria-hidden />
                              <span className="font-mono text-[10px] text-textMuted tabular-nums shrink-0">{r.line}</span>
                              <span className="font-mono text-[11px] text-warn truncate">{r.name}</span>
                            </span>
                            <span className="block pl-[1.4rem] text-[10px] text-textSecondary leading-snug">{r.why}</span>
                            {/* A MISSPELLING AND A MISSING FEATURE look the
                                same in a list and need opposite responses:
                                one is a typo, the other is a wall. */}
                            {r.didYouMean && (
                              <span className="block pl-[1.4rem] text-[10px] text-select leading-snug">
                                did you mean <span className="font-mono">{r.didYouMean}</span>?
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[10px] text-textMuted leading-snug pt-2 border-t border-borderSubtle">
                      A subset that quietly skipped these would draw a chart that looks like TradingView&rsquo;s and is not — and you
                      would trade it.
                    </p>
                  </>
                )
              ) : probe === null ? (
                <p className="font-mono text-[10px] text-textMuted">running it…</p>
              ) : !probe.ok ? (
                <div className="rounded border border-bear/40 bg-bear/[0.08] p-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-bear pb-1">
                    Threw while running{probe.line ? ` · line ${probe.line}` : ''}
                  </p>
                  <p className="text-[11px] text-textSecondary leading-snug">{probe.message}</p>
                  {probe.line !== undefined && (
                    <button type="button" onClick={() => goToLine(probe.line as number)} className="font-mono text-[10px] text-textMuted hover:text-textPrimary hover:underline pt-1">
                      go to line {probe.line}
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* what it put on the chart */}
                  <section>
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-textMuted pb-1.5">On the chart</p>
                    {!drewSomething(probe.run) ? (
                      <p className="text-[11px] text-warn leading-snug">
                        Nothing. It parsed, it ran to the last bar without complaint, and it drew nothing — so the chart will look
                        exactly as though the script were switched off.
                      </p>
                    ) : (
                      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5" data-pine-drew>
                        {reportRows(probe.run).map(([k, v]) => (
                          <div key={k} className="contents">
                            <dt className="font-mono text-[10px] text-textMuted">{k}</dt>
                            <dd className="font-mono text-[10px] text-textSecondary tabular-nums text-right">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </section>

                  {/*
                    A SHAPE THAT NEVER FIRED is the quietest way a script
                    fails. `ta.crossover(close, slayer.callwall)` cannot ever
                    be true — the wall is measured from each bar's own spot,
                    so it sits above price by construction — and a reader
                    would watch an empty chart and blame the engine.
                  */}
                  {probe.run.shapes.some(s => s.at.length === 0) && (
                    <section>
                      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-textMuted pb-1">Never fired</p>
                      <ul className="flex flex-col gap-0.5" data-pine-dead>
                        {probe.run.shapes.filter(s => s.at.length === 0).map((s, i) => (
                          <li key={i} className="font-mono text-[10px] text-textSecondary truncate">{s.title}</li>
                        ))}
                      </ul>
                      <p className="text-[10px] text-textMuted leading-snug pt-1">
                        Over {probe.bars} bars, not once. Worth checking the condition can be true at all.
                      </p>
                    </section>
                  )}

                  {probe.run.notes.length > 0 && (
                    <section className="rounded border border-warn/40 bg-warn/[0.07] p-2">
                      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-warn pb-1">
                        What the picture will not show you
                      </p>
                      <ul className="flex flex-col gap-1.5" data-pine-notes>
                        {probe.run.notes.map((n, i) => (
                          <li key={i} className="text-[10px] text-textSecondary leading-snug">{n}</li>
                        ))}
                      </ul>
                    </section>
                  )}

                  <p className="text-[10px] text-textMuted leading-snug pt-1 border-t border-borderSubtle">
                    Run against <span className="font-mono text-textSecondary">{ticker} {timeframe}</span> — the same bars the candles
                    are built from, and the same dealer book the pane will hand it.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 max-h-[28rem] lg:max-h-none">
              <div className="p-1.5 border-b border-borderSubtle shrink-0">
                <input
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  placeholder="filter…"
                  aria-label="Filter the reference"
                  className="w-full bg-canvas border border-borderSubtle rounded px-2 h-7 font-mono text-[11px] text-textPrimary placeholder:text-textMuted focus:outline-none focus-visible:ring-1 focus-visible:ring-select"
                />
              </div>
              <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-3" data-pine-reference>
                {/*
                  `slayer.*` LEADS THE REFERENCE, and each entry is tagged,
                  because SERIES versus SNAPSHOT is the one thing a writer
                  has to know before they use one. A snapshot plots as a flat
                  line by construction; crossing it means nothing.
                */}
                {slayerRef.length > 0 && (
                  <section data-pine-slayer>
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-select pb-0.5">This desk&rsquo;s own data</p>
                    <p className="text-[10px] text-textMuted leading-snug pb-1.5">
                      The dealer book, as a Pine series. No other charting platform can compile these lines.
                    </p>
                    <ul className="flex flex-col gap-1">
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
                    <p className="text-[10px] text-textMuted leading-snug pt-1.5">
                      <span className="text-warn">snapshot</span> means today&rsquo;s chain, the same number on every bar — it is not
                      history, and a run that reads one says so in its report.
                    </p>
                  </section>
                )}

                <section>
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-textMuted pb-1">
                    Pine · implemented {reference.length}
                  </p>
                  <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {reference.map(f => (
                      <li key={f} className="font-mono text-[10px] text-textSecondary">{f}</li>
                    ))}
                  </ul>
                </section>

                <section>
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-textMuted pb-1 pt-1 border-t border-borderSubtle">
                    Not implemented
                  </p>
                  <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {REFUSED.map(r => (
                      <li key={r.prefix} className="font-mono text-[10px] text-textMuted line-through" title={r.why}>{r.prefix}</li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>
          )}
        </aside>
      </div>
    </Modal>
  );
};

/** The run, as rows — every output the engine can produce, including zero. */
function reportRows(run: PineRun): [string, string][] {
  const shapeMarks = run.shapes.reduce((n, sh) => n + sh.at.length, 0);
  const onPane = run.plots.filter(p => !p.offScale && (p.display === 'all' || p.display === 'pane')).length;
  const onScale = run.plots.filter(p => !p.offScale && p.display === 'price_scale').length;
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
