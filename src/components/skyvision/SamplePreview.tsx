/*
==================================================
  SLAYER TERMINAL - SAMPLE PREVIEW CARD
  Compact "at a glance" preview shown on the right
  column while browsing the setup feed. Two actions:
  Review Setup → (full analysis) and Track Setup +.
==================================================
*/

import { Info, Droplets, AlertTriangle, ArrowUpRight, Bookmark, BookmarkCheck } from 'lucide-react';
import Panel from '../ui/Panel';
import AnimatedNumber from '../ui/AnimatedNumber';
import VerdictBadge from './VerdictBadge';
import GreeksRow from './GreeksRow';
import type { Setup, ScannerKey } from '../../types/skyvision';
import { useTracker } from '../../context/TrackerContext';

interface SamplePreviewProps {
  setup: Setup;
  scanner: ScannerKey;
  onReviewSetup: () => void;
}

const SamplePreview = ({ setup, scanner, onReviewSetup }: SamplePreviewProps) => {
  const { trackSetup, untrackSetup, isTracked } = useTracker();
  const tracked = isTracked(setup.id);
  const bullish = setup.right === 'C';

  const liquidityTone = setup.liquidityLabel === 'Tight' ? 'bull' : setup.liquidityLabel === 'Normal' ? 'warn' : 'bear';

  return (
    <Panel
      title={
        <span className="font-mono text-base font-bold text-textPrimary tracking-tight">
          {setup.contract}
        </span>
      }
      className="w-full h-full"
      bodyClassName="flex flex-col"
    >
      <div key={setup.id} className="flex flex-col gap-4 flex-1 animate-soft-in">
        {/* Direction + conviction subtitle */}
        <div className="flex items-center gap-2">
          <VerdictBadge verdict={setup.verdict} dot />
          <span className="font-mono text-[11px] uppercase tracking-wider text-textSecondary">
            {bullish ? 'Bullish' : 'Bearish'} · {setup.score >= 93 ? 'High' : setup.score >= 85 ? 'Medium' : 'Low'} Conviction
          </span>
        </div>

        {/* Top metrics grid: Score / Confidence / Conviction */}
        <div className="grid grid-cols-3 gap-2">
          <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Score</div>
            <div className="mt-1 font-mono text-lg font-bold text-textPrimary tnum">
              <AnimatedNumber value={setup.score} format={v => Math.round(v).toString()} />
            </div>
          </div>
          <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Confidence</div>
            <div className="mt-1 font-mono text-lg font-bold text-textPrimary tnum">
              <AnimatedNumber value={setup.confidence} format={v => `${Math.round(v)}%`} />
            </div>
          </div>
          <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Conviction</div>
            <div className="mt-1 font-mono text-sm font-semibold text-textPrimary">
              {setup.score >= 93 ? 'High' : setup.score >= 85 ? 'Medium' : 'Low'}
            </div>
          </div>
        </div>

        {/* Second metrics grid: Premium / Live Mid / Exp. Move */}
        <div className="grid grid-cols-3 gap-2">
          <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Premium</div>
            <div className="mt-1 font-mono text-sm font-semibold text-textPrimary tnum">
              <AnimatedNumber value={setup.mid} format={v => `$${v.toFixed(2)}`} />
            </div>
          </div>
          <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Live Mid</div>
            <div className="mt-1 font-mono text-sm font-semibold text-textPrimary tnum">
              <AnimatedNumber value={setup.liveMid} format={v => `$${v.toFixed(2)}`} />
            </div>
          </div>
          <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Exp. Move</div>
            <div className={`mt-1 font-mono text-sm font-semibold tnum ${bullish ? 'text-bull' : 'text-bear'}`}>
              <AnimatedNumber value={setup.expectedMovePct} format={v => `${bullish ? '+' : '−'}${Math.abs(v).toFixed(1)}%`} />
            </div>
          </div>
        </div>

        {/* Greeks */}
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted mb-1.5">Greeks</div>
          <GreeksRow greeks={setup.greeks} fourth="iv" />
        </div>

        {/* Targets */}
        <div className="grid grid-cols-2 gap-2">
          <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Swing Target</div>
            <div className="mt-1 font-mono text-sm font-semibold text-textPrimary tnum">${setup.swingTarget.price.toFixed(2)}</div>
            <div className="font-mono text-[10px] text-bull">+{setup.swingTarget.pct}%</div>
          </div>
          <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Scalp Exit</div>
            <div className="mt-1 font-mono text-sm font-semibold text-warn tnum">${setup.scalpExit.price.toFixed(2)}</div>
            <div className="font-mono text-[10px] text-warn">+{setup.scalpExit.pct}%</div>
          </div>
        </div>

        {/* Why this ranked */}
        <div className="flex items-start gap-2 border border-borderSubtle bg-inset rounded-md px-3 py-2.5">
          <Info className="w-3.5 h-3.5 text-select shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-select font-semibold">Why This Ranked</span>
            <p className="text-[11px] text-textSecondary leading-relaxed">{setup.whyText}</p>
          </div>
        </div>

        {/* Footer cards: Liquidity + Invalidation */}
        <div className="grid grid-cols-2 gap-2">
          <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Droplets className="w-3 h-3 text-textMuted" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Liquidity</span>
            </div>
            <div className={`font-mono text-sm font-semibold ${liquidityTone === 'bull' ? 'text-bull' : liquidityTone === 'warn' ? 'text-warn' : 'text-bear'}`}>
              {setup.liquidityLabel}
            </div>
            <div className="font-mono text-[10px] text-textMuted tnum">{setup.liquiditySpread}</div>
          </div>
          <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertTriangle className="w-3 h-3 text-warn" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Invalidation</span>
            </div>
            <div className="font-mono text-sm font-semibold text-warn tnum">
              {bullish ? 'Below' : 'Above'} ${setup.invalidationPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="font-mono text-[10px] text-textMuted">{setup.invalidationReason}</div>
          </div>
        </div>

        {/* Action buttons — pinned to the bottom of the card */}
        <div className="grid grid-cols-2 gap-2 pt-1 mt-auto">
          <button
            onClick={onReviewSetup}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-md border border-borderSubtle bg-white/[0.03] hover:bg-white/[0.06] text-textPrimary text-xs font-semibold font-mono uppercase tracking-wider transition-colors"
          >
            Review Setup <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => tracked ? untrackSetup(setup.id) : trackSetup(setup, scanner)}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-md text-xs font-semibold font-mono uppercase tracking-wider transition-all ${
              tracked
                ? 'border border-select/30 bg-select/[0.08] text-select hover:bg-select/[0.12]'
                : 'border border-borderSubtle bg-white/[0.03] text-textSecondary hover:bg-white/[0.06] hover:text-textPrimary'
            }`}
          >
            {tracked ? (
              <><BookmarkCheck className="w-3.5 h-3.5" /> Tracked</>
            ) : (
              <><Bookmark className="w-3.5 h-3.5" /> Track Setup +</>
            )}
          </button>
        </div>
      </div>
    </Panel>
  );
};

export default SamplePreview;
