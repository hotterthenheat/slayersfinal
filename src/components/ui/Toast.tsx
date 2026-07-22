import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, AlertTriangle, Info, X, TriangleAlert } from 'lucide-react';

export type ToastTone = 'success' | 'error' | 'warn' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  toast: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warn: (message: string) => void;
  info: (message: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

/** Ephemeral feedback for actions the user takes (saved a view, reset data, …). */
export const useToast = (): ToastApi => {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
};

const TONE: Record<ToastTone, { icon: ReactNode; ring: string; text: string }> = {
  success: { icon: <Check className="w-3.5 h-3.5" />, ring: 'border-bull/40', text: 'text-bull' },
  error: { icon: <TriangleAlert className="w-3.5 h-3.5" />, ring: 'border-bear/40', text: 'text-bear' },
  warn: { icon: <AlertTriangle className="w-3.5 h-3.5" />, ring: 'border-warn/40', text: 'text-warn' },
  info: { icon: <Info className="w-3.5 h-3.5" />, ring: 'border-borderMuted', text: 'text-textSecondary' },
};

const DURATION = 3400;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: number) => {
    setItems(prev => prev.filter(t => t.id !== id));
    const timer = timers.current[id];
    if (timer) {
      clearTimeout(timer);
      delete timers.current[id];
    }
  }, []);

  const push = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = ++seq.current;
      setItems(prev => [...prev.slice(-3), { id, tone, message }]);
      timers.current[id] = setTimeout(() => dismiss(id), DURATION);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast: push,
      success: m => push(m, 'success'),
      error: m => push(m, 'error'),
      warn: m => push(m, 'warn'),
      info: m => push(m, 'info'),
    }),
    [push]
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {createPortal(
        <div className="fixed bottom-4 right-4 z-[80] flex flex-col gap-2 pointer-events-none" aria-live="polite">
          <AnimatePresence initial={false}>
            {items.map(t => {
              const tone = TONE[t.tone];
              return (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, x: 24, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 24, scale: 0.96 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className={`pointer-events-auto flex items-start gap-2.5 min-w-[240px] max-w-[360px] rounded-md border ${tone.ring} bg-panel/95 backdrop-blur px-3 py-2.5 shadow-overlay`}
                  role="status"
                >
                  <span className={`mt-0.5 shrink-0 ${tone.text}`}>{tone.icon}</span>
                  <span className="flex-1 text-[12px] leading-snug text-textPrimary">{t.message}</span>
                  <button
                    onClick={() => dismiss(t.id)}
                    aria-label="Dismiss"
                    className="shrink-0 text-textMuted hover:text-textPrimary transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  );
};
