import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import Modal from '../ui/Modal';
import { compilePine, type Refusal } from '../../data/pine';
import { MAX_SCRIPTS, MAX_SOURCE_CHARS, STARTER_SOURCE, newScriptId, type UserScript } from '../../data/pine/store';

/*
==================================================
  SLAYER TERMINAL - PINE EDITOR (components/terrain/PineEditor.tsx)
  Where a reader writes their own indicator, and where it is told the truth.
==================================================

  THIS PANEL IS THE ENGINE'S FACE, and its whole job is the bad news.

  The chart draws a working script and stays silent about a broken one — a
  half-drawn indicator is worse than an absent one, and the tape is not the
  place to learn that line 14 uses `request.security`. So every refusal
  lands HERE, with the line and the reason, before anything reaches the
  chart.

  Three outcomes, never two. A script can be malformed (a syntax error), it
  can be well-formed Pine the engine does not implement (a list of
  refusals), or it can run. The middle one is the interesting case and it
  gets the most room: it is the honest edge of a subset, and a reader who
  can see exactly which constructs are missing can rewrite around them.
*/

interface Props {
  open: boolean;
  onClose: () => void;
  scripts: UserScript[];
  onChange: (next: UserScript[]) => void;
}

const LABEL = 'font-mono text-[10px] uppercase tracking-widest text-textMuted';
const BTN =
  'inline-flex items-center gap-1 rounded px-2 h-6 font-mono text-[11px] border border-borderSubtle ' +
  'text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors ' +
  'focus:outline-none focus-visible:ring-1 focus-visible:ring-select disabled:opacity-40 disabled:cursor-not-allowed';

const RefusalList = ({ items }: { items: Refusal[] }) => (
  <ul className="flex flex-col gap-1" data-pine-refusals>
    {items.map((r, i) => (
      <li key={`${r.name}-${r.line}-${i}`} className="grid grid-cols-[3.5rem_10rem_1fr] gap-2 items-baseline">
        <span className="font-mono text-[10px] text-textMuted tabular-nums">line {r.line}</span>
        <span className="font-mono text-[11px] text-warn truncate" title={r.name}>{r.name}</span>
        <span className="text-[11px] text-textSecondary leading-snug">{r.why}</span>
      </li>
    ))}
  </ul>
);

const PineEditor = ({ open, onClose, scripts, onChange }: Props) => {
  const [selected, setSelected] = useState<string | null>(scripts[0]?.id ?? null);
  const [draft, setDraft] = useState<string>(scripts[0]?.source ?? STARTER_SOURCE);
  const [name, setName] = useState<string>(scripts[0]?.name ?? 'My indicator');

  useEffect(() => {
    if (!open) return;
    const s = scripts.find(x => x.id === selected) ?? scripts[0] ?? null;
    setSelected(s?.id ?? null);
    setDraft(s?.source ?? STARTER_SOURCE);
    setName(s?.name ?? 'My indicator');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* Compiled on every keystroke. The engine is a parse and a walk over an
     AST — no bars are touched here — so the feedback can be immediate
     without the editor having to decide when it is worth the work. */
  const result = useMemo(() => compilePine(draft), [draft]);

  const pick = (s: UserScript) => {
    setSelected(s.id);
    setDraft(s.source);
    setName(s.name);
  };

  const save = () => {
    const trimmed = draft.slice(0, MAX_SOURCE_CHARS);
    const existing = scripts.find(s => s.id === selected);
    if (existing) {
      onChange(scripts.map(s => (s.id === existing.id ? { ...s, name, source: trimmed } : s)));
    } else {
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

  const toggle = (id: string) =>
    onChange(scripts.map(s => (s.id === id ? { ...s, enabled: !s.enabled } : s)));

  const dirty = (() => {
    const s = scripts.find(x => x.id === selected);
    return !s || s.source !== draft || s.name !== name;
  })();

  return (
    <Modal open={open} onClose={onClose} ariaLabel="Pine indicators" widthClass="max-w-5xl" header={<span className="font-mono text-[12px] tracking-wide">Your indicators</span>}>
      <div className="grid grid-cols-1 lg:grid-cols-[15rem_1fr] gap-4" data-pine-editor>
        <aside className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center justify-between">
            <span className={LABEL}>Saved · {scripts.length}/{MAX_SCRIPTS}</span>
            <button type="button" className={BTN} onClick={addNew} disabled={scripts.length >= MAX_SCRIPTS}>
              <Plus className="w-3 h-3" aria-hidden /> New
            </button>
          </div>
          {scripts.length === 0 ? (
            <p className="text-[11px] text-textMuted leading-snug">Nothing saved yet. The starter on the right is a working EMA cross — edit it and save.</p>
          ) : (
            <ul className="flex flex-col" data-pine-list>
              {scripts.map(s => (
                <li key={s.id} className="flex items-center gap-1 border-b border-borderSubtle/40 py-1">
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    aria-pressed={s.enabled}
                    aria-label={`${s.enabled ? 'Hide' : 'Show'} ${s.name}`}
                    className={`w-4 h-4 shrink-0 rounded-sm border flex items-center justify-center ${s.enabled ? 'border-select text-select' : 'border-borderMuted text-transparent'}`}
                  >
                    <Check className="w-3 h-3" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => pick(s)}
                    className={`flex-1 min-w-0 text-left font-mono text-[11px] truncate px-1 py-0.5 rounded ${selected === s.id ? 'text-textPrimary bg-white/[0.06]' : 'text-textSecondary hover:text-textPrimary'}`}
                  >
                    {s.name}
                  </button>
                  <button type="button" onClick={() => remove(s.id)} aria-label={`Delete ${s.name}`} className="text-textMuted hover:text-bear p-0.5">
                    <Trash2 className="w-3 h-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-textMuted leading-snug pt-2 border-t border-borderSubtle">
            A script draws on the tape only when it declares <code className="text-textSecondary">overlay = true</code>. Everything runs against the same bars the candles are built from.
          </p>
        </aside>

        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-2">
            <label className={LABEL} htmlFor="pine-name">Name</label>
            <input
              id="pine-name"
              value={name}
              onChange={e => setName(e.target.value.slice(0, 60))}
              className="flex-1 bg-inset border border-borderSubtle rounded px-2 h-6 font-mono text-[11px] text-textPrimary focus:outline-none focus-visible:ring-1 focus-visible:ring-select"
            />
            <button type="button" className={BTN} onClick={save} disabled={!dirty}>
              {selected ? 'Save' : 'Add'}
            </button>
          </div>

          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            spellCheck={false}
            aria-label="Pine source"
            data-pine-source
            className="w-full h-[19rem] bg-inset border border-borderSubtle rounded p-2 font-mono text-[11px] leading-[1.45] text-textPrimary resize-none focus:outline-none focus-visible:ring-1 focus-visible:ring-select"
          />

          <div className="border border-borderSubtle rounded p-2 min-h-[6rem] max-h-[11rem] overflow-auto" data-pine-status>
            {result.ok ? (
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[11px] text-bull" data-pine-ok>Compiles · {result.program.body.length} statements</span>
                <span className="text-[11px] text-textMuted">
                  {result.program.declaration
                    ? 'Save it, then tick it in the list to draw it.'
                    : 'No indicator() declaration — it will draw with default settings.'}
                </span>
              </div>
            ) : result.stage === 'syntax' ? (
              <div className="flex flex-col gap-1" data-pine-syntax>
                <span className="font-mono text-[11px] text-bear">Syntax error · line {result.line}</span>
                <span className="text-[11px] text-textSecondary">{result.message}</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[11px] text-warn">
                  {result.refusals.length} construct{result.refusals.length === 1 ? '' : 's'} this engine does not implement
                </span>
                <RefusalList items={result.refusals} />
                <p className="text-[10px] text-textMuted leading-snug pt-1 border-t border-borderSubtle">
                  These are refused rather than approximated. A subset that quietly skipped them would draw a chart that looks like TradingView&rsquo;s and is not — and you would trade it.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default PineEditor;
