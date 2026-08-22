import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Trash2, Database, ShieldCheck } from 'lucide-react';
import Overlay from '../ui/Overlay';
import { useToast } from '../ui/Toast';
import { LOCAL_DATA_GROUPS, clearGroup, clearAllLocalData, groupStoredCount } from '../../core/localData';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

/** Settings + local-data management. Everything the terminal stores lives in
    this browser only; this panel lists it and lets you clear it. */
const SettingsPanel = ({ open, onClose }: SettingsPanelProps) => {
  const toast = useToast();
  // bump to re-read stored counts after a clear
  const [, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);
  const [confirmAll, setConfirmAll] = useState(false);
  // Which group's clear is armed — clears are permanent, so they two-step too.
  const [confirmGroupId, setConfirmGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmAll(false);
    setConfirmGroupId(null);
  }, [open]);

  const onClearGroup = (id: string) => {
    const group = LOCAL_DATA_GROUPS.find(g => g.id === id);
    if (!group) return;
    if (confirmGroupId !== id) {
      setConfirmGroupId(id);
      return;
    }
    setConfirmGroupId(null);
    const n = clearGroup(group);
    refresh();
    if (n > 0) toast.success(`Cleared ${group.label.toLowerCase()}`);
    else toast.info(`No ${group.label.toLowerCase()} stored`);
  };

  const onClearAll = () => {
    if (!confirmAll) {
      setConfirmAll(true);
      return;
    }
    const n = clearAllLocalData();
    setConfirmAll(false);
    refresh();
    toast.success(n > 0 ? `Reset ${n} local ${n === 1 ? 'item' : 'items'}` : 'Nothing to reset');
  };

  const totalStored = LOCAL_DATA_GROUPS.reduce((sum, g) => sum + groupStoredCount(g), 0);

  return (
    /* Centred like every other overlay in the terminal. Settings was the last
       right-hand slide-in; a panel that arrives from the edge reads as a side
       tab you have to go and find, and the shortcuts sheet and the command
       palette already open in the middle. */
    <Overlay
      open={open}
      onClose={onClose}
      label="Settings"
      className="max-w-xl max-h-[calc(100vh-1.5rem)] sm:max-h-[85vh]"
    >
      <>
            <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 border-b border-borderSubtle bg-panelRaised">
              <span className="font-mono text-caption font-semibold uppercase tracking-widest text-textPrimary">Settings</span>
              <button
                onClick={onClose}
                aria-label="Close settings"
                className="inline-flex items-center justify-center w-7 h-7 rounded border border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5 sm:px-5">
              {/* Privacy note */}
              <div className="inst-surface rounded-md px-3.5 py-3 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-bull" />
                <p className="text-caption leading-relaxed text-textSecondary">
                  Your watchlists, layouts, tracked setups and notes are stored in{' '}
                  <span className="text-textPrimary">this browser only</span> — nothing is sent to a server. Clearing here
                  is permanent and cannot be undone.
                </p>
              </div>

              {/* Local data */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 font-mono text-label uppercase tracking-widest text-textSecondary">
                    <Database className="w-3.5 h-3.5" /> Local data
                  </span>
                  <span className="font-mono text-micro text-textMuted tnum">
                    {totalStored} {totalStored === 1 ? 'item' : 'items'} stored
                  </span>
                </div>

                <div className="flex flex-col gap-px bg-borderSubtle rounded-md overflow-hidden">
                  {LOCAL_DATA_GROUPS.map(group => {
                    const count = groupStoredCount(group);
                    const armed = confirmGroupId === group.id;
                    return (
                      <div key={group.id} className="flex items-center gap-3 bg-inset px-3.5 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-caption font-semibold text-textPrimary">{group.label}</div>
                          <div className="text-label text-textMuted truncate">{group.description}</div>
                        </div>
                        {armed && (
                          <button
                            onClick={() => setConfirmGroupId(null)}
                            className="shrink-0 font-mono text-micro uppercase tracking-wider text-textMuted hover:text-textPrimary transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={() => onClearGroup(group.id)}
                          disabled={count === 0}
                          className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border font-mono text-micro uppercase tracking-wider transition-colors ${
                            count === 0
                              ? 'border-borderSubtle text-textMuted cursor-not-allowed opacity-50'
                              : armed
                                ? 'border-bear/50 bg-bear/15 text-bear'
                                : 'border-borderSubtle text-textSecondary hover:text-bear hover:border-bear/40'
                          }`}
                        >
                          <Trash2 className="w-3 h-3" /> {armed ? 'Confirm' : 'Clear'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Reset all */}
              <div className="flex flex-col gap-2 border-t border-borderSubtle pt-4">
                <button
                  onClick={onClearAll}
                  className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded border font-mono text-label uppercase tracking-wider transition-colors ${
                    confirmAll
                      ? 'border-bear/50 bg-bear/15 text-bear'
                      : 'border-borderMuted bg-white/[0.02] text-textSecondary hover:text-bear hover:border-bear/40'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {confirmAll ? 'Click again to confirm — this wipes everything' : 'Reset all local data'}
                </button>
                {confirmAll && (
                  <button
                    onClick={() => setConfirmAll(false)}
                    className="self-center font-mono text-micro uppercase tracking-wider text-textMuted hover:text-textPrimary transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {/* Legal — the not-financial-advice line and legal pages live here,
                  reachable from every desk, instead of stapled to a footer bar. */}
              <div className="flex flex-col gap-2.5 border-t border-borderSubtle pt-4">
                <p className="font-mono text-micro uppercase tracking-wider text-textMuted leading-relaxed">
                  Not investment advice · research &amp; education only
                </p>
                <nav className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Legal">
                  {[
                    { to: '/guide', label: 'Guide' },
                    { to: '/legal/disclaimer', label: 'Disclaimer' },
                    { to: '/legal/terms', label: 'Terms' },
                    { to: '/legal/privacy', label: 'Privacy' },
                  ].map(l => (
                    <Link
                      key={l.to}
                      to={l.to}
                      onClick={onClose}
                      className="font-mono text-micro uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
                    >
                      {l.label}
                    </Link>
                  ))}
                  <span className="font-mono text-micro uppercase tracking-wider text-textMuted">© 2026 Slayer Terminal</span>
                </nav>
              </div>
            </div>
      </>
    </Overlay>
  );
};

export default SettingsPanel;
