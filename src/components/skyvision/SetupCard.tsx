import { ChevronDown, Info } from 'lucide-react';
import SignalBadge from '../ui/SignalBadge';
import VerdictBadge from './VerdictBadge';
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
  const pillTone = isCall ? 'border-bull/30 bg-bull/10 text-bull' : 'border-bear/30 bg-bear/10 text-bear';

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
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold ${pillTone}`}>
          {setup.contract}
        </span>
        {isTop && <SignalBadge tone="magenta">TOP PICK</SignalBadge>}

        <span className="ml-auto flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-2 font-mono text-[10px] text-textMuted uppercase tracking-wider">
            <span>
              Score <span className="text-textPrimary font-semibold">{setup.score}</span>
            </span>
            <span className="text-textMuted/50">·</span>
            <VerdictBadge verdict={setup.verdict} />
          </span>
          <span className="text-right">
            <span className="block font-mono text-[9px] text-textMuted uppercase tracking-wider">Exp Move</span>
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
              <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Swing Target</div>
              <div className="mt-1 font-mono text-sm font-semibold text-textPrimary tnum">${setup.swingTarget.price.toFixed(2)}</div>
              <div className="font-mono text-[10px] text-bull">+{setup.swingTarget.pct}%</div>
            </div>
            <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2">
              <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Scalp Exit</div>
              <div className="mt-1 font-mono text-sm font-semibold text-warn tnum">${setup.scalpExit.price.toFixed(2)}</div>
              <div className="font-mono text-[10px] text-warn">+{setup.scalpExit.pct}%</div>
            </div>
          </div>

          {/* Why */}
          <div className="flex items-start gap-2 border border-borderSubtle bg-inset rounded-md px-3 py-2.5">
            <Info className="w-3.5 h-3.5 text-select shrink-0 mt-0.5" />
            <p className="text-[11px] text-textSecondary leading-relaxed">
              <span className="text-select font-semibold">WHY: </span>
              {setup.whyText}
            </p>
          </div>

          <GreeksRow greeks={setup.greeks} fourth="iv" />

          {/* Bid/ask + action */}
          <div className="flex items-center justify-between font-mono text-[10px] text-textMuted uppercase tracking-wider">
            <span>
              Bid/Ask <span className="text-textSecondary tnum">${setup.bid.toFixed(2)} – ${setup.ask.toFixed(2)}</span>
            </span>
            <span>
              Mid <span className="text-textPrimary tnum">${setup.mid.toFixed(2)}</span>
            </span>
          </div>

          <button
            onClick={onOpenAnalysis}
            className="relative w-full rounded-md bg-[#0a0a0a] hover:bg-[#141414] py-2 text-xs font-semibold text-textPrimary transition-colors"
          >
            {/* Beam tracing the true button perimeter — blurred halo under a glowing core */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" fill="none" aria-hidden>
              <rect
                x="0.5"
                y="0.5"
                rx="6"
                pathLength={100}
                className="animate-border-trace"
                style={{ width: 'calc(100% - 1px)', height: 'calc(100% - 1px)', filter: 'blur(4px)' }}
                stroke="rgba(255,255,255,0.5)"
                strokeWidth="3.5"
                strokeDasharray="16 84"
                strokeLinecap="round"
              />
              <rect
                x="0.5"
                y="0.5"
                rx="6"
                pathLength={100}
                className="animate-border-trace"
                style={{
                  width: 'calc(100% - 1px)',
                  height: 'calc(100% - 1px)',
                  filter: 'drop-shadow(0 0 3px rgba(255,255,255,0.8))',
                }}
                stroke="rgba(255,255,255,0.95)"
                strokeWidth="1"
                strokeDasharray="16 84"
                strokeLinecap="round"
              />
            </svg>
            Open Full Analysis →
          </button>
        </div>
      )}
    </div>
  );
};

export default SetupCard;
