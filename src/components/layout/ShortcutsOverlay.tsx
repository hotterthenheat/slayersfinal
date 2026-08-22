import { X } from 'lucide-react';
import Overlay from '../ui/Overlay';
import { SHORTCUT_GROUPS as GROUPS } from '../../lib/shortcuts';

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

const Key = ({ children }: { children: string }) => (
  <kbd className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded border border-borderMuted bg-inset font-mono text-label text-textPrimary">
    {children}
  </kbd>
);

/** Keyboard-shortcut cheat sheet, opened with `?`. */
const ShortcutsOverlay = ({ open, onClose }: ShortcutsOverlayProps) => {
  return (
    <Overlay open={open} onClose={onClose} label="Keyboard shortcuts" className="max-w-lg">
      <>
            <header className="flex items-center justify-between px-4 py-3 border-b border-borderSubtle">
              <span className="font-mono text-label uppercase tracking-widest text-textSecondary">Keyboard shortcuts</span>
              <button
                onClick={onClose}
                aria-label="Close"
                className="inline-flex items-center justify-center w-7 h-7 rounded border border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </header>
            <div className="p-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
              {GROUPS.map(group => (
                <div key={group.title} className="flex flex-col gap-1.5">
                  <span className="font-mono text-micro uppercase tracking-widest text-textMuted">{group.title}</span>
                  <div className="flex flex-col divide-y divide-borderSubtle/60 rounded-md border border-borderSubtle overflow-hidden">
                    {group.rows.map(row => (
                      <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="text-caption text-textSecondary">{row.label}</span>
                        <span className="flex items-center gap-1 shrink-0">
                          {row.keys.map((k, i) => (
                            <Key key={i}>{k}</Key>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
      </>
    </Overlay>
  );
};

export default ShortcutsOverlay;
