import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Plus, Trash2 } from 'lucide-react';
import Modal from '../ui/Modal';
import { compilePine, FNS_INDEX, REFUSED, type Refusal } from '../../data/pine';
import { MAX_SCRIPTS, MAX_SOURCE_CHARS, STARTER_SOURCE, newScriptId, type UserScript } from '../../data/pine/store';

/*
==================================================
  SLAYER TERMINAL - PINE EDITOR (components/terrain/PineEditor.tsx)
  Write an indicator; be told the truth about it.
==================================================

  THREE COLUMNS, AND EACH ONE ANSWERS A QUESTION A WRITER ACTUALLY ASKS.

    WHICH        the scripts they have, and which are drawing
    WHAT         the code, with line numbers, because every refusal is
                 reported at a line and a reader has to find it
    WHY / WHAT'S THERE
                 the verdict when there is one to give, and otherwise the
                 list of what this engine implements — which for a SUBSET
                 is the single most useful thing on the screen. A writer
                 working against an engine that refuses things needs to
                 know what it accepts, and hunting for that in a refusal
                 message one construct at a time is the slow way to learn.

  THE VERDICT IS THE LOUDEST THING HERE. It sits under the code, it takes
  a colour that means something (green compiles, amber a refusal, red a
  syntax error), and its refusals are BUTTONS: clicking one selects that
  line in the editor, because the reader's next move is always to go look
  at it.
*/

interface Props {
  open: boolean;
  onClose: () => void;
  scripts: UserScript[];
  onChange: (next: UserScript[]) => void;
}

const CTRL =
  'inline-flex items-center gap-1 rounded px-2 h-[26px] font-mono text-[11px] border transition-colors ' +
  'focus:outline-none focus-visible:ring-1 focus-visible:ring-select disabled:opacity-40 disabled:cursor-not-allowed';
const GHOST = `${CTRL} border-borderSubtle text-textSecondary hover:text-textPrimary hover:border-borderMuted`;
const PRIMARY = `${CTRL} border-select/50 bg-select/[0.12] text-select hover:bg-select/[0.18]`;

const PineEditor = ({ open, onClose, scripts, onChange }: Props) => {
  const [selected, setSelected] = useState<string | null>(scripts[0]?.id ?? null);
  const [draft, setDraft] = useState<string>(scripts[0]?.source ?? STARTER_SOURCE);
  const [name, setName] = useState<string>(scripts[0]?.name ?? 'My indicator');
  const [tab, setTab] = useState<'verdict' | 'reference'>('verdict');
  const [filter, setFilter] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const s = scripts.find(x => x.id === selected) ?? scripts[0] ?? null;
    setSelected(s?.id ?? null);
    setDraft(s?.source ?? STARTER_SOURCE);
    setName(s?.name ?? 'My indicator');
    setTab('verdict');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* Compiled on every keystroke — a parse and a walk over an AST, with no
     bars touched, so the verdict can be immediate. */
  const result = useMemo(() => compilePine(draft), [draft]);
  const lines = useMemo(() => draft.split('\n'), [draft]);

  /* Which lines carry a complaint, so the gutter can mark them. */
  const marked = useMemo(() => {
    if (result.ok) return new Set<number>();
    if (result.stage === 'syntax') return new Set<number>([result.line]);
    return new Set<number>(result.refusals.map(r => r.line));
  }, [result]);

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

  const save = () => {
    const trimmed = draft.slice(0, MAX_SOURCE_CHARS);
    const existing = scripts.find(s => s.id === selected);
    if (existing) onChange(scripts.map(s => (s.id === existing.id ? { ...s, name, source: trimmed } : s)));
    else {
      const id = newScriptId();
      onChange([...scripts, { id, name, source: trimmed, enabled: true }].slice(0, MAX_SCRIPTS));
      setSelected(id);
    }
  };

  const addNew = () => {
    setSelected(null);
    setDraft(STARTER_SOURCE);
    setName(`Indicator ${scripts.length + 1}`);
  };

  const remove = (id: string) => {
    const next = scripts.filter(s => s.id !== id);
    onChange(next);
    if (selected === id) {
      setSelected(next[0]?.id ?? null);
      setDraft(next[0]?.source ?? STARTER_SOURCE);
      setName(next[0]?.name ?? 'My indicator');
    }
  };

  const toggle = (id: string) => onChange(scripts.map(s => (s.id === id ? { ...s, enabled: !s.enabled } : s)));

  const dirty = (() => {
    const s = scripts.find(x => x.id === selected);
    return !s || s.source !== draft || s.name !== name;
  })();

  const refusals: Refusal[] = !result.ok && result.stage === 'unsupported' ? result.refusals : [];
  const reference = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return FNS_INDEX.filter(f => !q || f.toLowerCase().includes(q));
  }, [filter]);

  /* The verdict's colour is its meaning: green runs, amber is a subset's
     honest edge, red is malformed. Nothing else on this panel is coloured. */
  const tone = result.ok ? 'bull' : result.stage === 'syntax' ? 'bear' : 'warn';
  const toneRing = tone === 'bull' ? 'border-bull/40' : tone === 'bear' ? 'border-bear/40' : 'border-warn/40';
  const toneText = tone === 'bull' ? 'text-bull' : tone === 'bear' ? 'text-bear' : 'text-warn';

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel="Pine indicators"
      widthClass="max-w-[76rem]"
      header={<span className="font-mono text-[12px] tracking-wide">Script maker</span>}
      headerActions={
        <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Pine v6 subset</span>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[13rem_minmax(0,1fr)_20rem] gap-0 border border-borderSubtle rounded-md overflow-hidden" data-pine-editor>
        {/* ── which ─────────────────────────────────────────────────── */}
        <aside className="flex flex-col min-w-0 border-b lg:border-b-0 lg:border-r border-borderSubtle bg-inset/40">
          <header className="flex items-center justify-between px-2 h-8 border-b border-borderSubtle">
            <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Scripts {scripts.length}/{MAX_SCRIPTS}</span>
            <button type="button" className={GHOST} onClick={addNew} disabled={scripts.length >= MAX_SCRIPTS} title="Start a new script">
              <Plus className="w-3 h-3" aria-hidden />
            </button>
          </header>
          {scripts.length === 0 ? (
            <p className="p-2 text-[11px] text-textMuted leading-snug">
              Nothing saved. The starter is a working EMA cross — edit it and press Add.
            </p>
          ) : (
            <ul className="flex flex-col overflow-y-auto max-h-[26rem]" data-pine-list>
              {scripts.map(s => (
                <li key={s.id} className={`flex items-center gap-1 px-1.5 py-1 border-b border-borderSubtle/40 ${selected === s.id ? 'bg-white/[0.05]' : ''}`}>
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    aria-pressed={s.enabled}
                    aria-label={`${s.enabled ? 'Hide' : 'Show'} ${s.name}`}
                    title={s.enabled ? 'Drawing on the tape' : 'Saved, not drawing'}
                    className={`w-[15px] h-[15px] shrink-0 rounded-[3px] border flex items-center justify-center ${s.enabled ? 'border-select bg-select/20 text-select' : 'border-borderMuted text-transparent hover:border-textMuted'}`}
                  >
                    <Check className="w-2.5 h-2.5" aria-hidden />
                  </button>
                  <button type="button" onClick={() => pick(s)} className={`flex-1 min-w-0 text-left font-mono text-[11px] truncate px-1 py-0.5 rounded ${selected === s.id ? 'text-textPrimary' : 'text-textSecondary hover:text-textPrimary'}`}>
                    {s.name}
                  </button>
                  <button type="button" onClick={() => remove(s.id)} aria-label={`Delete ${s.name}`} className="text-textMuted hover:text-bear p-0.5 shrink-0">
                    <Trash2 className="w-3 h-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* ── what ──────────────────────────────────────────────────── */}
        <section className="flex flex-col min-w-0">
          <header className="flex items-center gap-2 px-2 h-8 border-b border-borderSubtle">
            <input
              id="pine-name"
              aria-label="Script name"
              value={name}
              onChange={e => setName(e.target.value.slice(0, 60))}
              placeholder="Name"
              className="flex-1 min-w-0 bg-transparent font-mono text-[11px] text-textPrimary placeholder:text-textMuted focus:outline-none"
            />
            <span className="font-mono text-[10px] text-textMuted tabular-nums">{lines.length} lines</span>
            <button type="button" className={dirty ? PRIMARY : GHOST} onClick={save} disabled={!dirty}>
              {selected ? 'Save' : 'Add'}
            </button>
          </header>

          {/* line numbers beside the code, scrolled together */}
          <div className="flex min-h-0 flex-1 bg-inset/60">
            <div
              ref={gutterRef}
              aria-hidden
              className="w-9 shrink-0 overflow-hidden border-r border-borderSubtle/60 py-2 text-right select-none"
            >
              {lines.map((_, i) => (
                <div
                  key={i}
                  className={`px-1.5 font-mono text-[11px] leading-[1.5] tabular-nums ${marked.has(i + 1) ? `${toneText} font-bold` : 'text-textMuted/50'}`}
                >
                  {i + 1}
                </div>
              ))}
            </div>
            <textarea
              ref={taRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onScroll={e => { if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop; }}
              spellCheck={false}
              aria-label="Pine source"
              data-pine-source
              /*
                NO WRAPPING, and the gutter is why. A wrapped line occupies
                two visual rows while the gutter draws one number per LOGICAL
                line, so every number below a wrap pointed at the wrong code
                — on a panel whose whole job is to say "line 4". One line per
                row and a horizontal scrollbar is what an editor does anyway.
              */
              wrap="off"
              className="flex-1 min-w-0 h-[22rem] bg-transparent px-2 py-2 font-mono text-[11px] leading-[1.5] text-textPrimary resize-none focus:outline-none whitespace-pre overflow-x-auto"
            />
          </div>

          {/* the verdict */}
          <div className={`border-t-2 ${toneRing} px-2 py-1.5 flex items-center gap-2`} data-pine-status>
            {result.ok ? (
              <>
                <span className={`font-mono text-[11px] font-bold ${toneText}`} data-pine-ok>Compiles</span>
                <span className="text-[11px] text-textSecondary">
                  {result.program.body.length} statements · save it, then tick it to draw
                </span>
              </>
            ) : result.stage === 'syntax' ? (
              <>
                <button type="button" onClick={() => goToLine(result.line)} className={`font-mono text-[11px] font-bold ${toneText} hover:underline`} data-pine-syntax>
                  Syntax error · line {result.line}
                </button>
                <span className="text-[11px] text-textSecondary truncate">{result.message}</span>
              </>
            ) : (
              <>
                <span className={`font-mono text-[11px] font-bold ${toneText}`}>
                  {refusals.length} not implemented
                </span>
                <span className="text-[11px] text-textMuted truncate">
                  refused rather than approximated — see the list
                </span>
              </>
            )}
          </div>
        </section>

        {/* ── why, or what's there ──────────────────────────────────── */}
        <aside className="flex flex-col min-w-0 border-t lg:border-t-0 lg:border-l border-borderSubtle bg-inset/40">
          <header className="flex items-stretch h-8 border-b border-borderSubtle">
            {(['verdict', 'reference'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className={`flex-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${tab === t ? 'text-textPrimary bg-white/[0.05]' : 'text-textMuted hover:text-textSecondary'}`}
              >
                {t === 'verdict' ? `Report${refusals.length ? ` ${refusals.length}` : ''}` : 'Reference'}
              </button>
            ))}
          </header>

          {tab === 'verdict' ? (
            <div className="flex-1 overflow-y-auto p-2 min-h-[12rem] max-h-[27rem]">
              {result.ok ? (
                <p className="text-[11px] text-textMuted leading-snug">
                  Nothing to report. Every construct in this script is implemented, and it runs against the same bars the candles are built from.
                </p>
              ) : result.stage === 'syntax' ? (
                <p className="text-[11px] text-textSecondary leading-snug">
                  Line {result.line} could not be parsed. {result.message}
                </p>
              ) : (
                <>
                  <ul className="flex flex-col gap-1.5" data-pine-refusals>
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
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-textMuted leading-snug pt-2 mt-2 border-t border-borderSubtle">
                    A subset that quietly skipped these would draw a chart that looks like TradingView&rsquo;s and is not — and you would trade it.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-[12rem] max-h-[27rem]">
              <div className="p-1.5 border-b border-borderSubtle">
                <input
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  placeholder="filter…"
                  aria-label="Filter the reference"
                  className="w-full bg-canvas border border-borderSubtle rounded px-1.5 h-6 font-mono text-[11px] text-textPrimary placeholder:text-textMuted focus:outline-none focus-visible:ring-1 focus-visible:ring-select"
                />
              </div>
              <div className="flex-1 overflow-y-auto p-2" data-pine-reference>
                <p className="font-mono text-[10px] uppercase tracking-widest text-textMuted pb-1">Implemented · {reference.length}</p>
                <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {reference.map(f => (
                    <li key={f} className="font-mono text-[10px] text-textSecondary">{f}</li>
                  ))}
                </ul>
                <p className="font-mono text-[10px] uppercase tracking-widest text-textMuted pt-3 pb-1 border-t border-borderSubtle mt-2">Not implemented</p>
                <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {REFUSED.map(r => (
                    <li key={r.prefix} className="font-mono text-[10px] text-textMuted line-through" title={r.why}>{r.prefix}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </aside>
      </div>
    </Modal>
  );
};

export default PineEditor;
