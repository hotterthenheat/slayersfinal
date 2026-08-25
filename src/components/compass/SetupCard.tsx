import { ChevronDown, Info } from 'lucide-react';
import SignalBadge from '../ui/SignalBadge';
import StageBadge, { setupStage, hitLevel } from './setupStage';
import GreeksRow from './GreeksRow';
import type { Setup } from '../../types/compass';

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
  const stage = setupStage(setup);

  return (
    <div className={`border rounded-md overflow-hidden transition-colors ${
      isSelected
        ? 'border-borderMuted bg-white/[0.03] shadow-[inset_3px_0_0_0_rgba(237,237,237,0.7)]'
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
          {/* Only the EXCEPTIONS get a badge — TARGET HIT, BUILDING, FADED.
              The default working state shows nothing. (The score that used to
              sit here is engine-internal now — Noah, 2026-08-16.) */}
          {stage !== 'PRIMED' && (
            <span className="hidden sm:flex items-center font-mono text-[10px] text-textMuted uppercase tracking-wider">
              <StageBadge stage={stage} dot={false} hitLevel={hitLevel(setup)} />
            </span>
          )}
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
            <Info className="w-3.5 h-3.5 text-[#C7D3E8] shrink-0 mt-0.5" />
            <p className="text-[11px] text-textSecondary leading-relaxed">
              <span className="text-[#C7D3E8] font-semibold">WHY: </span>
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
            className="w-full rounded-md holo-bg hover:brightness-105 py-2 text-xs font-semibold text-[#0a0a0a] transition-[filter]"
          >
            Open Full Analysis →
          </button>
        </div>
      )}
    </div>
  );
};

export default SetupCard;
