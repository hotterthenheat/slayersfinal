/*
==================================================
  SLAYER TERMINAL - SHORTCUTS SHEET
  Part 15 · the `?` sheet.
==================================================

  WHAT GOES IN A SHORTCUTS SHEET IS THE HARD PART, and the temptation is to
  list everything the desk binds. That produces a wall nobody reads. This
  lists only what a reader can press ANYWHERE — the global bindings — plus
  a pointer to where the per-surface ones are documented, because a chart
  key that works on one page and nowhere else is a lie in a global sheet.

  EVERY ROW HERE IS VERIFIED AGAINST THE CODE by the proof: a sheet that
  lists a binding the app dropped is worse than no sheet, since the reader
  concludes the shortcut is broken rather than gone.
*/

import Modal from '../ui/Modal';

export interface Shortcut {
  keys: string[];
  what: string;
  /** Where it works. Global bindings say so; the rest name their surface. */
  where: string;
}

export const GLOBAL_SHORTCUTS: Shortcut[] = [
  { keys: ['⌘', 'K'], what: 'Search or jump to any ticker, page or action', where: 'Anywhere' },
  { keys: ['Ctrl', 'K'], what: 'The same, on a keyboard without a command key', where: 'Anywhere' },
  { keys: ['?'], what: 'This sheet', where: 'Anywhere' },
  { keys: ['Esc'], what: 'Close whatever is open — dialog, sheet, menu', where: 'Anywhere' },
];

/*
  WRITTEN FROM THE HANDLER, NOT FROM MEMORY. The first draft of this list
  said R reset the price scale; R toggles the strike rail. The proof caught
  it, which is the entire reason it reads the handler rather than trusting
  the sheet — a sheet that describes the wrong action is worse than a
  missing one, because the reader concludes the key is broken.

  Each `code` below is the literal `case` label in the surface's handler, so
  the proof can go and check that the binding still exists.
*/
export const SURFACE_SHORTCUTS: (Shortcut & { code: string })[] = [
  { keys: ['R'], code: "'r'", what: 'Show or hide the strike rail on the active chart', where: 'Terrain' },
  { keys: ['⇧', 'R'], code: "'R'", what: 'Show or hide the rail on every chart at once', where: 'Terrain' },
  { keys: ['P'], code: "'p'", what: 'Start or stop replay on the active chart', where: 'Terrain' },
  { keys: ['D'], code: "'d'", what: 'Draw mode — the pencil, without reaching for the toolbar', where: 'Terrain' },
];

const Keys = ({ keys }: { keys: string[] }) => (
  <span className="flex items-center gap-1 shrink-0">
    {keys.map(k => (
      <kbd
        key={k}
        className="font-mono text-[10px] border border-borderSubtle rounded px-1.5 py-0.5 text-textSecondary bg-inset"
      >
        {k}
      </kbd>
    ))}
  </span>
);

const Row = ({ s }: { s: Shortcut }) => (
  <div className="flex items-start gap-3 py-1.5">
    <Keys keys={s.keys} />
    <span className="min-w-0 flex-1 text-[12px] text-textSecondary leading-snug">{s.what}</span>
    <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-textMuted">{s.where}</span>
  </div>
);

const ShortcutsSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Modal
    open={open}
    onClose={onClose}
    ariaLabel="Keyboard shortcuts"
    widthClass="max-w-[520px]"
    header={<span className="text-[13px] font-semibold text-textPrimary">Keyboard shortcuts</span>}
  >
    <div className="flex flex-col gap-4">
      <div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Everywhere</span>
        <div className="mt-1 divide-y divide-borderSubtle/60">
          {GLOBAL_SHORTCUTS.map(s => (
            <Row key={s.keys.join('+')} s={s} />
          ))}
        </div>
      </div>
      <div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">On one surface</span>
        <div className="mt-1 divide-y divide-borderSubtle/60">
          {SURFACE_SHORTCUTS.map(s => (
            <Row key={`${s.where}-${s.keys.join('+')}`} s={s} />
          ))}
        </div>
      </div>
      <p className="border-t border-borderSubtle pt-3 text-[11px] text-textMuted leading-relaxed">
        Bindings that only work on one surface are listed with the surface, so nothing here reads as global when it is
        not. Charts also take the mouse wheel to zoom and drag to pan, which no sheet needs to teach.
      </p>
    </div>
  </Modal>
);

export default ShortcutsSheet;
