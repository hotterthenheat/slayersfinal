import Panel from '../ui/Panel';
import SignalBadge from '../ui/SignalBadge';
import { DEALER_BIAS_LABEL, type DealerBias } from '../../types/gex';
import type { Tone } from '../ui/tones';

interface ExposureInsightProps {
  bias: DealerBias;
  biasNote: string;
  insights: string[];
}

/* Regime tokens, not direction tokens — the same pair the map and the heatmap
   draw this quantity in. See DealerBias in types/gex.ts. */
const biasTone: Record<DealerBias, Tone> = {
  LONG_GAMMA: 'longGamma',
  SHORT_GAMMA: 'shortGamma',
  BALANCED: 'neutral',
};

/** Positioning narrative — the engine's levels translated into English. */
const ExposureInsight = ({ bias, biasNote, insights }: ExposureInsightProps) => (
  <Panel
    title="Positioning Insight"
    actions={<SignalBadge tone={biasTone[bias]} dot>{DEALER_BIAS_LABEL[bias]}</SignalBadge>}
    className="w-full h-full"
  >
    <div className="flex flex-col gap-2.5">
      <span className="font-mono text-micro uppercase tracking-wider text-textMuted">{biasNote}</span>
      <ul className="flex flex-col gap-2">
        {insights.map((line, i) => (
          <li key={i} className="flex items-start gap-2 text-label text-textSecondary leading-relaxed">
            <span className="text-textMuted mt-px select-none">›</span>
            <span className="tnum">{line}</span>
          </li>
        ))}
      </ul>
    </div>
  </Panel>
);

export default ExposureInsight;
