import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, Compass, Radio, Crosshair, Sigma, ArrowRight } from 'lucide-react';
import { EASE, DUR } from '../../lib/motion';

const STORAGE_KEY = 'slayer_onboarded_v1';

const DESKS = [
  { icon: LayoutDashboard, name: 'Pulse', desc: 'Your customizable live workspace' },
  { icon: Compass, name: 'Compass', desc: 'Finds the setup — scored contracts' },
  { icon: Radio, name: 'Trace', desc: 'Reads the flow — the live tape' },
  { icon: Crosshair, name: 'Pinpoint', desc: 'Dealer positioning & GEX' },
  { icon: Sigma, name: 'Prove It', desc: 'The receipts — quant modeling' },
];

const seen = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return true; // if storage is unavailable, don't nag
  }
};

/** First-run welcome — shows once, then remembers via local storage. */
const OnboardingOverlay = () => {
  const [open, setOpen] = useState(() => !seen());
  const { pathname } = useLocation();
  // The welcome greets you on a desk — not on the informational legal/guide
  // pages. It stays armed until dismissed, so it still fires on the next desk.
  const suppressed = /^\/(legal|guide)/.test(pathname);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  useEffect(() => {
    if (!open || suppressed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, suppressed]);

  return (
    <AnimatePresence>
      {open && !suppressed && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DUR.base }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Welcome to Slayer Terminal"
            className="relative w-full max-w-lg rounded-xl border border-borderMuted bg-panelRaised shadow-overlay overflow-hidden"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: DUR.slow, ease: EASE }}
          >
            <div className="px-6 pt-6 pb-4 border-b border-borderSubtle">
              <span className="font-mono text-[11px] uppercase tracking-widest text-textMuted">
                <span className="text-textMuted">&gt; </span>slayer_terminal
              </span>
              <h2 className="mt-2 text-xl font-bold text-textPrimary">Welcome to the terminal</h2>
              <p className="mt-1.5 text-[13px] text-textSecondary leading-relaxed">
                Five desks, one flow: Compass finds the setup, Pinpoint reads the dealer positioning behind it.
              </p>
            </div>

            <div className="px-6 py-4 flex flex-col gap-2">
              {DESKS.map(d => (
                <div key={d.name} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-borderSubtle bg-panel">
                    <d.icon className="w-4 h-4 text-textSecondary" />
                  </span>
                  <span className="min-w-0">
                    <span className="font-mono text-[12px] font-bold uppercase tracking-wider text-textPrimary">{d.name}</span>
                    <span className="ml-2 text-[12px] text-textMuted">{d.desc}</span>
                  </span>
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-borderSubtle flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                type="button"
                onClick={dismiss}
                className="inline-flex w-full sm:w-auto justify-center items-center gap-1.5 rounded-md bg-white/[0.08] hover:bg-white/[0.12] px-4 py-2 font-mono text-[12px] font-semibold uppercase tracking-wider text-textPrimary transition-colors active:scale-[0.98]"
              >
                Start exploring <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-center gap-4">
                <Link
                  to="/guide"
                  onClick={dismiss}
                  className="font-mono text-[11px] uppercase tracking-wider text-textMuted hover:text-textPrimary transition-colors"
                >
                  See the full guide
                </Link>
                <button
                  type="button"
                  onClick={dismiss}
                  className="ml-auto sm:ml-0 font-mono text-[11px] uppercase tracking-wider text-textMuted hover:text-textPrimary transition-colors"
                >
                  Skip
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OnboardingOverlay;
