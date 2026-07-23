import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Star, GitCompare, Info } from 'lucide-react';
import SignalBadge from '../components/ui/SignalBadge';
import TickerJump from '../components/ui/TickerJump';
import Sparkline from '../components/skyvision/Sparkline';
import type { StockPick, StockVerdict, StockSleeves } from '../data/stocks';
import type { Tone } from '../components/ui/tones';

const verdictTone: Record<StockVerdict, Tone> = {
  ACCUMULATE: 'bull',
  HOLD: 'neutral',
  AVOID: 'bear',
};

/**
 * Factor guide — plain-language definition of each scoring sleeve, drawn from
 * the engine's own thesis vocabulary. Shared by the drawer and the board-level
 * "Factors" popover so the definitions never drift between the two surfaces.
 */
export const FACTOR_GUIDE: {
  key: keyof StockSleeves;
  short: string;
  name: string;
  desc: string;
}[] = [
  {
    key: 'momentum',
    short: 'Mom',
    name: 'Momentum',
    desc: 'Trend & RSI posture — is price working with the trade or against it.',
  },
  {
    key: 'quality',
    short: 'Qual',
    name: 'Quality',
    desc: 'Fundamental screen — margins, growth and balance-sheet health.',
  },
  {
    key: 'flow',
    short: 'Flow',
    name: 'Flow',
    desc: 'Positioning — options flow and dark-pool lean, accumulation vs distribution.',
  },
  {
    key: 'news',
    short: 'News',
    name: 'News',
    desc: 'News-tape sentiment — headline tailwind against live headline risk.',
  },
];

const barClass = (v: number) => (v >= 60 ? 'holo-bar' : v >= 40 ? 'bg-white/30' : 'bg-bear/70');
const valueClass = (v: number) => (v >= 60 ? 'text-textPrimary' : v >= 40 ? 'text-textSecondary' : 'text-bear');

/** Full-width factor bar with a definition line — the drawer's richer sleeve. */
const FactorRow = ({ v, name, desc }: { v: number; name: string; desc: string }) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-baseline justify-between gap-2">
      <span className="font-mono text-caption font-semibold text-textPrimary">{name}</span>
      <span className={`font-mono text-caption font-semibold tnum ${valueClass(v)}`}>{v}</span>
    </div>
    <span className="h-[5px] rounded-full bg-white/[0.06] overflow-hidden">
      <span className={`block h-full rounded-full ${barClass(v)}`} style={{ width: `${v}%` }} />
    </span>
    <span className="text-label text-textMuted leading-snug">{desc}</span>
  </div>
);

interface StockDetailDrawerProps {
  pick: StockPick | null;
  onClose: () => void;
  isWatched: boolean;
  onToggleWatch: (ticker: string) => void;
  inCompare: boolean;
  onToggleCompare: (ticker: string) => void;
  /** Reference beta from the shared universe, shown as a risk/size lens */
  beta?: number;
}

/** Right-hand detail drawer — the full thesis, sleeve anatomy and factor guide
    for one name. Replaces the old inline thesis strip. */
const StockDetailDrawer = ({
  pick,
  onClose,
  isWatched,
  onToggleWatch,
  inCompare,
  onToggleCompare,
  beta,
}: StockDetailDrawerProps) => {
  useEffect(() => {
    if (!pick) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pick, onClose]);

  return createPortal(
    <AnimatePresence>
      {pick && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-label={`${pick.ticker} detail`}
            className="fixed inset-y-0 right-0 z-[60] w-full max-w-[440px] bg-panel border-l border-borderMuted shadow-overlay overflow-y-auto"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Header */}
            <header className="sticky top-0 z-10 flex items-start justify-between gap-3 px-4 h-auto py-3 border-b border-borderSubtle bg-panel/95 backdrop-blur">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold text-textPrimary">{pick.ticker}</span>
                  <SignalBadge tone={verdictTone[pick.verdict]}>{pick.verdict}</SignalBadge>
                </div>
                <div className="mt-0.5 text-caption text-textSecondary truncate">{pick.name}</div>
                <div className="mt-0.5 font-mono text-label uppercase tracking-wider text-textMuted">{pick.sector}</div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close detail"
                className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded border border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="px-4 py-4 flex flex-col gap-4">
              {/* Price + score row */}
              <div className="grid grid-cols-3 gap-px bg-borderSubtle rounded-md overflow-hidden">
                <div className="bg-inset px-3 py-2.5 flex flex-col gap-0.5">
                  <span className="font-mono text-micro uppercase tracking-widest text-textMuted">Last</span>
                  <span className="font-mono text-sm font-semibold text-textPrimary tnum">${pick.price.toFixed(2)}</span>
                  <span className={`font-mono text-label tnum ${pick.changePct >= 0 ? 'text-bull' : 'text-bear'}`}>
                    {pick.changePct >= 0 ? '+' : ''}
                    {pick.changePct.toFixed(2)}%
                  </span>
                </div>
                <div className="bg-inset px-3 py-2.5 flex flex-col gap-0.5">
                  <span className="font-mono text-micro uppercase tracking-widest text-textMuted">Score</span>
                  <span
                    className={`font-mono text-sm font-bold tnum ${
                      pick.composite >= 68 ? 'text-bull' : pick.composite <= 46 ? 'text-bear' : 'text-textPrimary'
                    }`}
                  >
                    {pick.composite}
                  </span>
                  <span className="font-mono text-label text-textMuted tnum">composite</span>
                </div>
                <div className="bg-inset px-3 py-2.5 flex flex-col gap-0.5">
                  <span className="font-mono text-micro uppercase tracking-widest text-textMuted">Beta</span>
                  <span className="font-mono text-sm font-semibold text-textPrimary tnum">
                    {beta != null ? beta.toFixed(2) : '—'}
                  </span>
                  <span className="font-mono text-label text-textMuted">{beta == null ? 'risk lens' : beta < 1 ? 'defensive' : 'cyclical'}</span>
                </div>
              </div>

              {/* Relative-strength trend */}
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-label uppercase tracking-widest text-textSecondary">30d relative strength</span>
                <div className="inst-surface rounded-md px-3 py-2.5 overflow-x-auto no-scrollbar">
                  <Sparkline data={pick.trend} up={pick.trend[pick.trend.length - 1] >= pick.trend[0]} width={360} height={40} />
                </div>
              </div>

              {/* Thesis */}
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-label uppercase tracking-widest text-textSecondary">Thesis</span>
                <p className="text-data text-textSecondary leading-relaxed inst-surface rounded-md px-3 py-2.5">{pick.thesis}</p>
              </div>

              {/* Sleeve anatomy + factor guide */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-textMuted" />
                  <span className="font-mono text-label uppercase tracking-widest text-textSecondary">Factor breakdown</span>
                </div>
                <div className="flex flex-col gap-3 inst-surface rounded-md px-3 py-3">
                  {FACTOR_GUIDE.map(f => (
                    <FactorRow key={f.key} v={pick.sleeves[f.key]} name={f.name} desc={f.desc} />
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onToggleWatch(pick.ticker)}
                    aria-pressed={isWatched}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded border font-mono text-caption uppercase tracking-wider transition-colors ${
                      isWatched
                        ? 'border-select/30 bg-select/10 text-select'
                        : 'border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary hover:border-borderMuted'
                    }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${isWatched ? 'fill-current' : ''}`} />
                    {isWatched ? 'Watching' : 'Watch'}
                  </button>
                  <button
                    onClick={() => onToggleCompare(pick.ticker)}
                    aria-pressed={inCompare}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded border font-mono text-caption uppercase tracking-wider transition-colors ${
                      inCompare
                        ? 'border-select/30 bg-select/10 text-select'
                        : 'border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary hover:border-borderMuted'
                    }`}
                  >
                    <GitCompare className="w-3.5 h-3.5" />
                    {inCompare ? 'Comparing' : 'Compare'}
                  </button>
                </div>
                <TickerJump ticker={pick.ticker} horizon="SWINGS" className="justify-center" />
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default StockDetailDrawer;
