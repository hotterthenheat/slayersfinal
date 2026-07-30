import { useState } from 'react';
import { preserveGreek } from '../ui/greek';
import { ChevronDown, Info, AlertTriangle } from 'lucide-react';
import SignalBadge from '../ui/SignalBadge';
import GreeksRow from './GreeksRow';
import HoverReadout from '../ui/HoverReadout';
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
  const isCall = setup.right === 'C';
  // Green for calls, red for puts (house tokens) — holographic-silver lettering on top.
  const pillTone = isCall ? 'border-bull/50 bg-bull/20 text-bull' : 'border-bear/50 bg-bear/20 text-bear';
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const momentumCls =
    setup.momentum === 'STRENGTHENING' ? 'text-bull' : setup.momentum === 'WEAKENING' ? 'text-bear' : 'text-textSecondary';
  const tp = setup.takeProfits[0];

  return (
    <div className={`border rounded-md overflow-hidden transition-colors ${
      isSelected
        ? 'border-select/40 bg-select/[0.03] rail-silver'
        : 'border-borderSubtle bg-panel'
    }`}>
      {/* Collapsed header row */}
      <button
        onClick={() => { onSelect?.(); onToggle(); }}
        onMouseEnter={e => setHover({ x: e.clientX, y: e.clientY })}
        onMouseMove={e => setHover({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setHover(null)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-rowHover transition-colors"
      >
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-label font-semibold ${pillTone}`}>
          <span className="text-textPrimary">{setup.contract}</span>
        </span>
        {isTop && <SignalBadge tone="magenta">TOP PICK</SignalBadge>}

        <span className="ml-auto flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-2 font-mono text-label text-textMuted uppercase tracking-wider">
            <span>
              Score <span className="text-textPrimary font-semibold">{setup.score}</span>
            </span>
          </span>
          <span className="text-right">
            <span className="block font-mono text-label text-textMuted uppercase tracking-wider">{preserveGreek('1σ Move')}</span>
            <span className="font-mono text-caption font-semibold tnum text-textPrimary leading-4">
              ±{setup.expectedMovePct}%
            </span>
          </span>
          <ChevronDown className={`w-4 h-4 text-textMuted transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {hover && (
        <HoverReadout x={hover.x} y={hover.y}>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-caption font-bold text-textPrimary tnum">{setup.confidence}%</span>
            <span className="font-mono text-micro uppercase tracking-wider text-textMuted">confidence</span>
            <span className={`font-mono text-micro font-bold uppercase tracking-wider ${momentumCls}`}>{setup.momentum}</span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-3 font-mono text-micro uppercase tracking-wider text-textMuted">
            <span>
              Health <span className="text-textPrimary tnum">{setup.health}</span>
            </span>
            <span>
              Liq <span className="text-textPrimary">{setup.liquidityLabel}</span> <span className="tnum">{setup.liquiditySpread}</span>
            </span>
          </div>
          {tp && (
            <div className="mt-0.5 font-mono text-micro text-textSecondary">
              TP1 <span className="text-textPrimary tnum">${tp.target.toFixed(2)}</span> <span className="tnum">+{tp.expectedPct}%</span>
            </div>
          )}
        </HoverReadout>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-borderSubtle px-3 py-3 flex flex-col gap-3 animate-slide-in">
          {/* Targets */}
          <div className="grid grid-cols-2 gap-2">
            <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2">
              <div className="font-mono text-label uppercase tracking-widest text-textMuted">Swing Target</div>
              <div className="mt-1 font-mono text-body font-semibold text-textPrimary tnum leading-5">${setup.swingTarget.price.toFixed(2)}</div>
              <div className="font-mono text-label text-bull">+{setup.swingTarget.pct}%</div>
            </div>
            <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2">
              <div className="font-mono text-label uppercase tracking-widest text-textMuted">Scalp Exit</div>
              <div className="mt-1 font-mono text-body font-semibold text-warn tnum leading-5">${setup.scalpExit.price.toFixed(2)}</div>
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
                  <SignalBadge key={chip} tone={isCall ? 'bull' : 'bear'}>
                    {chip}
                  </SignalBadge>
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
            className="w-full rounded-md border border-borderSubtle bg-panel hover:border-borderMuted hover:bg-[#141414] py-2 text-caption font-semibold text-textPrimary transition-colors leading-4"
          >
            Open Full Analysis →
          </button>
        </div>
      )}
    </div>
  );
};

export default SetupCard;
