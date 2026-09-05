import { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark, ChevronDown, Trash2 } from 'lucide-react';
import {
  loadScreens, saveScreens, upsertScreen, removeScreen, savedAgo, cleanName,
  MAX_NAME, MAX_SAVED, type SavedScreen,
} from './savedScreens';

/*
  6.2 · SAVED SCREENS — the door, following the ColumnChooser's grammar
  exactly: a counted button, a popover, All-and-None style actions at the
  top, a list below. A reader who has learned one of these doors has learned
  all of them, which is the point of having a grammar at all.

  THE PAGE OWNS THE STATE and this owns the shelf. `current` is whatever the
  page needs to rebuild itself, opaque here; `onRestore` hands it back. That
  keeps a new filter on any Trace page from needing a change in this file.
*/

export function useSavedScreens<S>(storeKey: string) {
  const [screens, setScreens] = useState<SavedScreen<S>[]>(() => loadScreens<S>(storeKey));
  useEffect(() => { saveScreens(storeKey, screens); }, [storeKey, screens]);
  const save = useCallback((name: string, state: S) => setScreens(s => upsertScreen(s, name, state)), []);
  const remove = useCallback((id: string) => setScreens(s => removeScreen(s, id)), []);
  return { screens, save, remove };
}

function SavedScreens<S>({
  screens,
  current,
  onSave,
  onRemove,
  onRestore,
}: {
  screens: readonly SavedScreen<S>[];
  /** The page's state right now — what a save would capture. */
  current: S;
  onSave: (name: string, state: S) => void;
  onRemove: (id: string) => void;
  onRestore: (state: S) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const commit = () => {
    const n = cleanName(draft);
    if (!n) return;
    onSave(n, current);
    setDraft('');
  };

  /* A name already on the shelf will REPLACE rather than duplicate, and the
     button says so before the click instead of after — two screens the
     reader cannot tell apart is the failure, and a surprise overwrite is
     the other one. */
  const clash = screens.some(s => s.name.toLowerCase() === (cleanName(draft) ?? '').toLowerCase());
  const full = screens.length >= MAX_SAVED;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title="Save this screen, or restore one you kept"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border font-mono text-[10px] uppercase tracking-wider transition-colors ${
          open ? 'border-borderMuted bg-white/[0.05] text-textPrimary' : 'border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary'
        }`}
      >
        <Bookmark className="w-3 h-3" />
        screens {screens.length > 0 && <span className="tnum text-textMuted">{screens.length}</span>}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-64 rounded-md border border-borderMuted bg-panel p-1.5 shadow-xl">
          <div className="flex items-center gap-1 px-1 pb-1.5">
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit(); }}
              maxLength={MAX_NAME}
              placeholder="name this screen"
              aria-label="Name this screen"
              className="min-w-0 flex-1 rounded border border-borderSubtle bg-inset px-2 py-1 font-mono text-[11px] text-textPrimary placeholder:text-textMuted focus:border-borderMuted focus:outline-none"
            />
            <button
              type="button"
              onClick={commit}
              disabled={!cleanName(draft) || (full && !clash)}
              title={full && !clash ? `The shelf holds ${MAX_SAVED}. Remove one first.` : undefined}
              className="rounded px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-select transition-colors hover:bg-select/10 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              {clash ? 'replace' : 'save'}
            </button>
          </div>

          {screens.length === 0 ? (
            <p className="px-2 py-3 text-center text-[11px] leading-snug text-textMuted">
              Nothing saved yet. A screen keeps the whole question — the cut, the filters, the columns
              and the sort — so tomorrow starts where today ended.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {screens.map(s => (
                <div key={s.id} className="group flex items-center gap-1 rounded transition-colors hover:bg-white/[0.03]">
                  <button
                    type="button"
                    onClick={() => { onRestore(s.state); setOpen(false); }}
                    className="min-w-0 flex-1 px-2 py-1.5 text-left"
                  >
                    <span className="block truncate font-mono text-[11px] text-textPrimary">{s.name}</span>
                    <span className="block font-mono text-[9px] text-textMuted">{savedAgo(s.savedAt)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(s.id)}
                    aria-label={`Remove ${s.name}`}
                    className="mr-1 rounded p-1 text-textMuted opacity-0 transition-opacity hover:text-bear focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SavedScreens;
