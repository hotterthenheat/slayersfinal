import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import Simulator from '../../core/simulator';
import Panel from '../ui/Panel';
import AnimatedNumber from '../ui/AnimatedNumber';
import SignalBadge from '../ui/SignalBadge';
import { toneText } from '../ui/tones';
import VerdictBadge from './VerdictBadge';
import { VERDICT_TONE } from './verdict';
import GreeksRow from './GreeksRow';
import ContractTrack from './ContractTrack';
import { buildTrack, setupToPlan, tpStatusTone, type TrackRung } from './contractTrackModel';
import { contractFacts } from './contractFacts';
import type { Setup, TakeProfit } from '../../types/compass';

interface SignalMonitorProps {
  setup: Setup;
  onBack: () => void;
}

/**
 * A rung of the ladder. The engine still supplies the level and the target; the
 * STATUS comes from the track above, which reached it or didn't. Sharing one
 * derivation is the point: a green HIT badge sitting four inches under a curve
 * that never touched it would indict the whole panel.
 */
const TakeProfitCard = ({ tp, rung, ticker }: { tp: TakeProfit; rung: TrackRung; ticker: string }) => (
  <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2.5 flex flex-col gap-1">
    <div className="flex items-center justify-between">
      <span className="font-mono text-micro uppercase tracking-widest text-textMuted">Take Profit {tp.level}</span>
      <span className="font-mono text-micro uppercase tracking-wider text-textMuted">Expected</span>
    </div>
    <div className="flex items-end justify-between">
      <SignalBadge tone={tpStatusTone[rung.status]}>{rung.status}</SignalBadge>
      <span className={`font-mono text-lg font-semibold tnum leading-none ${rung.status === 'HIT' ? 'text-bull' : 'text-textPrimary'}`}>
        +{tp.expectedPct}%
      </span>
    </div>
    <div className="font-mono text-micro text-textSecondary tnum">
      Target ${tp.target.toFixed(2)}
      {rung.spotNeeded != null && ` · needs ${ticker} ${rung.spotNeeded.toFixed(2)}`}
    </div>
  </div>
);

const SignalMonitor = ({ setup, onBack }: SignalMonitorProps) => {
  const tone = VERDICT_TONE[setup.verdict];

  const plan = useMemo(() => setupToPlan(setup), [setup]);
  const bars = Simulator.getCandles(setup.ticker) ?? [];
  const spotQ = bars.length ? Math.round(bars[bars.length - 1].close * 100) : 0;
  // getCandles returns the live buffer, mutated in place — the array identity is
  // stable while its contents are not, so memoising on it yields a frozen chart.
  // `setup` itself is rebuilt from live prices every 1.5s tick, so the key has to
  // be the primitives that actually move.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const track = useMemo(() => buildTrack(plan, bars), [plan.key, plan.sessionsLeft, plan.entry, bars.length, spotQ]);

  /* The facts read against the SAME spot the setup was priced at, not a fresher
     one — a breakeven distance measured from a different price than the premium
     beside it is the two-panel disagreement this whole pass is about. */
  const spot = spotQ / 100;
  const facts = useMemo(() => contractFacts(setup, spot), [setup, spot]);

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
          {/* setup.mid, not setup.liveMid. liveMid is mid * (0.9 + rng() * 0.2):
              one seeded draw, fixed per contract, so it never even moves. It was
              a jitter wearing a price label, printed beside the real mid. */}
          <div className="ml-auto text-right border border-borderSubtle bg-inset rounded-md px-3 py-1.5">
            <div className="font-mono text-micro uppercase tracking-widest text-textMuted">Mid</div>
            <div className="font-mono text-body font-semibold text-textPrimary tnum leading-5">
              <AnimatedNumber value={setup.mid} format={v => `$${v.toFixed(2)}`} />
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

        {/*
          The Read panel used to open with a confidence meter. `Setup.confidence`
          is `(score - 55) * 2.1` — the score with a percent sign — so a user
          reading "97, and 88% confident" believed two numbers agreed when they
          were one number twice. SetupScanCard had already reached that
          conclusion and left it off the card, which meant the desk both featured
          and excluded it depending on the pane.

          What replaces it is the contract: what it costs, where it starts making
          money, how much of the price is already real, what a session takes, and
          what the book charges for the round trip. None of it can be recovered
          from the score, which is the whole test for whether it belongs here.
        */}
        <Panel title="Read" subtitle="the contract, not the grade" className="w-full">
          <div className="flex flex-col gap-3 h-full">
            <div className="flex flex-col divide-y divide-borderSubtle">
              {facts.map(f => (
                <div key={f.label} className="flex items-baseline justify-between gap-3 py-2 first:pt-0">
                  <span className="font-mono text-micro uppercase tracking-widest text-textMuted shrink-0">
                    {f.label}
                  </span>
                  <span className="min-w-0 text-right">
                    <span
                      className={`block font-mono text-caption font-semibold tnum leading-4 ${
                        f.warn ? 'text-warn' : 'text-textPrimary'
                      }`}
                    >
                      {f.value}
                    </span>
                    {f.note && (
                      <span className="block font-mono text-micro text-textMuted leading-snug">{f.note}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-auto pt-3 border-t border-borderSubtle">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-micro uppercase tracking-widest text-textMuted">Greeks</span>
                <span className="font-mono text-micro uppercase tracking-widest text-textMuted">
                  1σ{' '}
                  <span className="text-textPrimary tnum">
                    <AnimatedNumber
                      value={setup.expectedMovePct}
                      format={v => `${v >= 0 ? '±' : ''}${v.toFixed(1)}%`}
                    />
                  </span>
                </span>
              </div>
              <GreeksRow greeks={setup.greeks} fourth="vega" />
            </div>
          </div>
        </Panel>
      </div>

      <ContractTrack plan={plan} bars={bars} track={track} className="animate-soft-in" />

      {/* Take-profit ladder — now the chart's legend: same four rungs, same
          order, same tones, same derivation of what has been reached */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 animate-soft-in">
        {setup.takeProfits.map((tp, i) => (
          <TakeProfitCard key={tp.level} tp={tp} rung={track.rungs[i]} ticker={setup.ticker} />
        ))}
      </div>
      </div>
    </div>
  );
};

export default SignalMonitor;
