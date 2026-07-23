import { Lock } from 'lucide-react';
import EmptyState from '../ui/EmptyState';

/**
 * Explicit "this needs a real feed" state. The sim has no timestamped Level-2
 * depth and no genuine tick prints, so a real liquidity heatmap, DOM ladder,
 * order-flow footprint, or true time-&-sales CANNOT be shown honestly. Rather
 * than fabricate live-looking bands, these panels render this — the user sees
 * the module exists and exactly what data would light it up. A preset of the
 * house EmptyState.
 */
const DataUnavailablePanel = ({ requires }: { requires: string }) => (
  <EmptyState
    fill
    icon={Lock}
    title="Live data unavailable"
    body={`This module needs ${requires} for the active symbol. It stays dark until the feed is connected — wire it and the module activates behind the same contract.`}
  />
);

export default DataUnavailablePanel;
