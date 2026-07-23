import { ChevronDown, Info, AlertTriangle } from 'lucide-react';
import SignalBadge from '../ui/SignalBadge';
import GreeksRow from './GreeksRow';
import type { Setup } from '../../types/skyvision';

interface SetupCardProps {
  setup: Setup;
  expanded: boolean;
  isSelected?: boolean;
  /** Only the strongest setup in a group is marked, to keep the badge meaningful. */
  isTop?: boolean;
  onToggle: () => void;
  onSelect?: () => void;
  onOpenAnalysis: () => void;
}

const SetupCard = ({ setup, expanded, isSelected, isTop, onToggle, onSelect, onOpenAnalysis }: SetupCardProps) => {
  const moveUp = setup.expectedMovePct >= 0;
  const isCall = setup.right === 'C';
  // Green for calls, red for puts (house tokens) — holographic-silver lettering on top.
  const pillTone = isCall ? 'border-bull/50 bg-bull/20 text-bull' : 'border-bear/50 bg-bear/20 text-bear';

  return (
    <div className={`border rounded-md overflow-hidden transition-colors ${
      isSelected
        ? 'border-select/40 bg-select/[0.03] shadow-[inset_3px_0_0_0_rgba(199,211,232,0.5)]'
        : 'border-borderSubtle bg-panel'
    }`}>
      {/* Collapsed header row */}
      <button
        onClick={() => { onSelect?.(); onToggle(); }}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-label font-semibold ${pillTone}`}>
          <span className="holo-text">{setup.contract}</span>
        </span>
        {isTop && <SignalBadge tone="magenta">TOP PICK</SignalBadge>}

        <span className="ml-auto flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-2 font-mono text-label text-textMuted uppercase tracking-wider">
            <span>
              Score <span className="text-textPrimary font-semibold">{setup.score}</span>
            </span>
          </span>
          <span className="text-right">
            <span className="block font-mono text-label text-textMuted uppercase tracking-wider">Exp Move</span>
            <span className={`font-mono text-xs font-semibold tnum ${moveUp ? 'text-bull' : 'text-bear'}`}>
              {moveUp ? '+' : ''}
              {setup.expectedMovePct}%
            </span>
          </span>
          <ChevronDown className={`w-4 h-4 text-textMuted transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-borderSubtle px-3 py-3 flex flex-col gap-3 animate-slide-in">
          {/* Targets */}
          <div className="grid grid-cols-2 gap-2">
            <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2">
              <div className="font-mono text-label uppercase tracking-widest text-textMuted">Swing Target</div>
              <div className="mt-1 font-mono text-sm font-semibold text-textPrimary tnum">${setup.swingTarget.price.toFixed(2)}</div>
              <div className="font-mono text-label text-bull">+{setup.swingTarget.pct}%</div>
            </div>
            <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2">
              <div className="font-mono text-label uppercase tracking-widest text-textMuted">Scalp Exit</div>
              <div className="mt-1 font-mono text-sm font-semibold text-warn tnum">${setup.scalpExit.price.toFixed(2)}</div>
              <div className="font-mono text-label text-warn">+{setup.scalpExit.pct}%</div>
            </div>
          </div>

          {/* Why */}
          <div className="flex items-start gap-2 border border-borderSubtle bg-inset rounded-md px-3 py-2.5">
            <Info className="w-3.5 h-3.5 text-select shrink-0 mt-0.5" />
            <p className="text-label text-textSecondary leading-relaxed">
              <span className="text-select font-semibold">WHY: </span>
              {setup.whyText}
            </p>
          </div>

          {/* Evidence for / contradiction against — both read from existing fields */}
          {setup.whyChips.length > 0 && (
            <div>
              <div className="font-mono text-label uppercase tracking-widest text-textMuted mb-1.5">Evidence</div>
              <div className="flex flex-wrap gap-1.5">
                {setup.whyChips.map(chip => (
                  <span
                    key={chip}
                    className="inline-flex items-center rounded border border-bull/20 bg-bull/[0.06] px-1.5 py-0.5 font-mono text-label uppercase tracking-wider text-bull"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 border border-warn/20 bg-warn/[0.05] rounded-md px-3 py-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" />
            <p className="font-mono text-label text-textSecondary leading-relaxed">
              <span className="text-warn font-semibold uppercase tracking-wider">Contradiction: </span>
              Thesis breaks {isCall ? 'below' : 'above'}{' '}
              <span className="text-warn font-semibold tnum">${setup.invalidationPrice.toFixed(2)}</span> — {setup.invalidationReason}
            </p>
          </div>

          <GreeksRow greeks={setup.greeks} fourth="iv" />

          {/* Bid/ask + action */}
          <div className="flex items-center justify-between font-mono text-label text-textMuted uppercase tracking-wider">
            <span>
              Bid/Ask <span className="text-textSecondary tnum">${setup.bid.toFixed(2)} – ${setup.ask.toFixed(2)}</span>
            </span>
            <span>
              Mid <span className="text-textPrimary tnum">${setup.mid.toFixed(2)}</span>
            </span>
          </div>

          <button
            onClick={onOpenAnalysis}
            className="w-full rounded-md border border-borderSubtle bg-[#0a0a0a] hover:border-borderMuted hover:bg-[#141414] py-2 text-xs font-semibold text-textPrimary transition-colors"
          >
            Open Full Analysis →
          </button>
        </div>
      )}
    </div>
  );
};

export default SetupCard;
