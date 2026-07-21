import { Lock } from 'lucide-react';

/**
 * Explicit "this needs a real feed" state. The sim has no timestamped Level-2
 * depth and no genuine tick prints, so a real liquidity heatmap, DOM ladder,
 * order-flow footprint, or true time-&-sales CANNOT be shown honestly. Rather
 * than fabricate live-looking bands, these panels render this — the user sees
 * the module exists and exactly what data would light it up.
 */
const DataUnavailablePanel = ({ requires }: { requires: string }) => (
  <div className="h-full flex flex-col items-center justify-center gap-2 p-4 text-center">
    <span className="inline-flex w-8 h-8 rounded-md border border-borderSubtle bg-inset items-center justify-center">
      <Lock className="w-4 h-4 text-textMuted" />
    </span>
    <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-textSecondary">
      Live data unavailable
    </span>
    <span className="text-[11px] text-textMuted leading-relaxed max-w-[240px]">
      This module needs {requires} for the active symbol. It is intentionally left dark rather than filled with synthetic
      signals — wire the real feed and it activates behind the same contract.
    </span>
  </div>
);

export default DataUnavailablePanel;
