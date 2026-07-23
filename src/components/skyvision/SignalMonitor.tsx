import { ArrowLeft } from 'lucide-react';
import Panel from '../ui/Panel';
import AnimatedNumber from '../ui/AnimatedNumber';
import SignalBadge from '../ui/SignalBadge';
import { toneText, type Tone } from '../ui/tones';
import VerdictBadge from './VerdictBadge';
import GreeksRow from './GreeksRow';
import type { Setup, TakeProfit, Verdict } from '../../types/skyvision';

const verdictTone: Record<Verdict, Tone> = {
  ENTER: 'bull',
  EXIT: 'bear',
  WATCH: 'warn',
};

interface SignalMonitorProps {
  setup: Setup;
  onBack: () => void;
}

// Only achievement is green; activity is blue; waiting is quiet.
const tpStatusTone = {
  HIT: 'bull',
  'IN PROGRESS': 'select',
  PENDING: 'neutral',
} as const;

const TakeProfitCard = ({ tp }: { tp: TakeProfit }) => (
  <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2.5 flex flex-col gap-1">
    <div className="flex items-center justify-between">
      <span className="font-mono text-micro uppercase tracking-widest text-textMuted">Take Profit {tp.level}</span>
      <span className="font-mono text-micro uppercase tracking-wider text-textMuted">Expected</span>
    </div>
    <div className="flex items-end justify-between">
      <SignalBadge tone={tpStatusTone[tp.status]}>{tp.status}</SignalBadge>
      <span className={`font-mono text-lg font-semibold tnum leading-none ${tp.status === 'HIT' ? 'text-bull' : 'text-textPrimary'}`}>
        +{tp.expectedPct}%
      </span>
    </div>
    <div className="font-mono text-micro text-textSecondary tnum">Target ${tp.target.toFixed(2)}</div>
  </div>
);

const SignalMonitor = ({ setup, onBack }: SignalMonitorProps) => {
  const tone = verdictTone[setup.verdict];

  return (
    <div className="flex flex-col gap-4">
      {/* Header bar */}
      <Panel className="w-full">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 border border-borderSubtle hover:border-borderMuted rounded-md px-2.5 py-1.5 font-mono text-label text-textSecondary hover:text-textPrimary transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Scanner
          </button>
          <VerdictBadge verdict={setup.verdict} dot />
          <span className="font-mono text-body font-bold text-textPrimary leading-5">{setup.contract}</span>
          <div className="ml-auto text-right border border-borderSubtle bg-inset rounded-md px-3 py-1.5">
            <div className="font-mono text-micro uppercase tracking-widest text-textMuted">Live Mid</div>
            <div className="font-mono text-body font-semibold text-textPrimary tnum leading-5">
              <AnimatedNumber value={setup.liveMid} format={v => `$${v.toFixed(2)}`} />
            </div>
          </div>
        </div>
      </Panel>

      {/* Setup + confidence/greeks — keyed so switching contracts soft-fades
          the content while the header bar above stays put */}
      <div key={setup.id} className="contents">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch animate-soft-in">
        <Panel title="The Setup" tone={tone} className="w-full">
          <div className="flex flex-col gap-3 h-full">
            <h3 className={`text-base font-semibold leading-snug ${toneText[tone]}`}>{setup.headline}</h3>
            <p className="text-label text-textSecondary leading-relaxed">{setup.whyText}</p>
            <div className="mt-auto pt-2 border-t border-borderSubtle">
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-2">Why</div>
              <div className="flex flex-wrap gap-1.5">
                {setup.whyChips.map(chip => (
                  <SignalBadge key={chip} tone="neutral">
                    {chip}
                  </SignalBadge>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Live Read" className="w-full">
          <div className="flex flex-col gap-4 h-full">
            {/* Confidence meter */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-micro uppercase tracking-widest text-textMuted flex items-center gap-1.5">
                  Confidence <SignalBadge tone="bull" dot pulse>Live</SignalBadge>
                </span>
                <span className="font-mono text-caption font-semibold text-textPrimary tnum leading-4">
                  <AnimatedNumber value={setup.confidence} format={v => `${Math.round(v)}%`} />
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <span
                  className={`block h-full rounded-full transition-[width] duration-700 ease-out ${tone === 'bull' ? 'bg-bull/95' : tone === 'warn' ? 'bg-warn/80' : 'bg-bear/80'}`}
                  style={{ width: `${setup.confidence}%` }}
                />
              </div>
            </div>

            <div>
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-2">Greeks</div>
              <GreeksRow greeks={setup.greeks} fourth="vega" />
            </div>

            <div className="mt-auto flex items-center justify-between border-t border-borderSubtle pt-3">
              <span className="font-mono text-micro uppercase tracking-widest text-textMuted flex items-center gap-1.5">
                Expected Move <SignalBadge tone="bull" dot pulse>Live</SignalBadge>
              </span>
              <span className="font-mono text-body font-semibold text-select tnum leading-5">
                <AnimatedNumber value={setup.expectedMovePct} format={v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`} />
              </span>
            </div>
          </div>
        </Panel>
      </div>

      {/* Take-profit ladder */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 animate-soft-in">
        {setup.takeProfits.map(tp => (
          <TakeProfitCard key={tp.level} tp={tp} />
        ))}
      </div>
      </div>
    </div>
  );
};

export default SignalMonitor;
