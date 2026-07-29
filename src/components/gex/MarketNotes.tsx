import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import type { MarketNote } from '../../types/gex';

interface MarketNotesProps {
  /** The current generated observation, or null when nothing is notable. */
  autoNote: string | null;
  /** Bumps per scan — a repeat of the same text is not a new entry. */
  revision: number;
}

const stamp = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

/**
 * Session log — the generated observation from each scan, newest first, with
 * room for your own line beside it. The engine only speaks when something is
 * notable (spot testing a wall, price at the flip), so an entry appearing is
 * itself the signal; a quiet log means the book hasn't done anything worth
 * saying. Repeats are suppressed — the same note re-firing every scan would
 * bury the moment it first fired.
 */
const MarketNotes = ({ autoNote, revision }: MarketNotesProps) => {
  const [notes, setNotes] = useState<MarketNote[]>([]);
  const [draft, setDraft] = useState('');
  const lastAutoRef = useRef<string | null>(null);

  useEffect(() => {
    if (!autoNote || autoNote === lastAutoRef.current) return;
    lastAutoRef.current = autoNote;
    setNotes(prev => [{ time: stamp(), text: autoNote }, ...prev].slice(0, 60));
  }, [autoNote, revision]);

  const addManual = () => {
    const text = draft.trim();
    if (!text) return;
    setNotes(prev => [{ time: stamp(), text, manual: true }, ...prev].slice(0, 60));
    setDraft('');
  };

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-borderSubtle">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') addManual();
          }}
          placeholder="Add a note…"
          aria-label="Add a market note"
          className="flex-grow min-w-0 bg-inset border border-borderSubtle rounded px-2 py-1 font-mono text-label text-textPrimary placeholder:text-textMuted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"
        />
        <button
          onClick={addManual}
          disabled={!draft.trim()}
          aria-label="Save note"
          className="shrink-0 inline-flex items-center gap-1 border border-borderSubtle hover:border-borderMuted disabled:opacity-40 disabled:hover:border-borderSubtle bg-panel rounded px-2 py-1 font-mono text-micro uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors active:scale-[0.98]"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      <div className="flex-grow overflow-y-auto min-h-0">
        {notes.length === 0 ? (
          <EmptyState size="sm" title="Nothing notable yet" body="Observations post here as the book moves" />
        ) : (
          notes.map((n, i) => (
            <div key={`${n.time}-${i}`} className="flex gap-2 px-2.5 py-1.5 border-b border-borderSubtle/30">
              <span className="shrink-0 font-mono text-micro text-textMuted tnum leading-5">{n.time}</span>
              <span
                className={`shrink-0 w-[3px] rounded-full ${n.manual ? 'bg-select/70' : 'bg-borderMuted'}`}
                aria-label={n.manual ? 'Your note' : 'Generated observation'}
              />
              <span className={`font-mono text-label leading-5 ${n.manual ? 'text-textPrimary' : 'text-textSecondary'}`}>
                {n.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MarketNotes;
