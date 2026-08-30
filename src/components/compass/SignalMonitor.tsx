import { ArrowLeft, Check } from 'lucide-react';
import Panel from '../ui/Panel';
import AnimatedNumber from '../ui/AnimatedNumber';
import SignalBadge from '../ui/SignalBadge';
import { toneText, type Tone } from '../ui/tones';
import VerdictBadge from './VerdictBadge';
import GreeksRow from './GreeksRow';
import RichRead from '../ui/RichRead';
import ContractFacts from './ContractFacts';
import { estimatePremium } from '../../data/compass';
import { spotForPremium } from './trackModel';
import type { Setup, TakeProfit, Verdict } from '../../types/compass';

const verdictTone: Record<Verdict, Tone> = {
  ENTER: 'bull',
  EXIT: 'bear',
  WATCH: 'warn',
};

interface SignalMonitorProps {
  setup: Setup;
  /** The underlying, live — the facts strip speaks in its terms. */
  spot: number;
  /** Provenance: the sweep this row was opened with. The monitor reads LIVE. */
  gradedAt?: string;
  onBack: () => void;
}

/*
  The take-profit ladder reads like a ladder now: each card carries a top rail
  that FILLS as the campaign climbs — solid green once banked, live lime fill
  on the rung price is working toward, empty while pending. One glance says
  how far up the ladder this trade is.

    HIT          — banked. Green tint, a check, rail full. Done is a fact,
                   so it wears the market's green, calmly.
    IN PROGRESS  — the working rung. The old design was a filled neon box
                   (loud, said nothing); now the selection edge marks it and
                   the rail shows LIVE progress toward the target, with the
                   distance still to travel spelled out.
    PENDING      — dim. Its turn hasn't come.

  Progress baseline: targets are built as mid × (1 + pct), so the entry-side
  price is recoverable as target / (1 + pct) — the bar starts at 0 where the
  trade started, not at some arbitrary fraction.
*/
const TakeProfitCard = ({ tp, liveMid, needs }: { tp: TakeProfit; liveMid: number; needs: string | null }) => {
  const hit = tp.status === 'HIT';
  const working = tp.status === 'IN PROGRESS';
  const start = tp.target / (1 + tp.expectedPct / 100);
  const span = Math.max(tp.target - start, 0.01);
  const progress = hit ? 1 : working ? Math.min(1, Math.max(0, (liveMid - start) / span)) : 0;
  const awayPct = Math.max(0, ((tp.target - liveMid) / Math.max(liveMid, 0.01)) * 100);

  return (
    <div
      className={`relative rounded-md border transition-colors ${
        hit ? 'border-bull/30 bg-bull/[0.05]' : 'border-borderSubtle bg-inset'
      }`}
    >
      {/* The working rung wears a lit segment lapping its border — the house
          border-beam (SVG dash on a normalized perimeter), finally earning its
          keep. One card moves; that is the one price is working on. */}
      {working && (
        <svg className="absolute -inset-px pointer-events-none" width="100%" height="100%" aria-hidden>
          {/* Geometry via style, not attributes — calc() is CSS, and only the
              style path parses it reliably. */}
          <rect
            style={{ x: '0.75px', y: '0.75px', width: 'calc(100% - 1.5px)', height: 'calc(100% - 1.5px)' }}
            rx="6"
            fill="none"
            stroke="#D2FF00"
            strokeWidth="1.5"
            strokeOpacity="0.9"
            pathLength={100}
            strokeDasharray="16 84"
            className="animate-border-trace"
          />
        </svg>
      )}

      <div className={`relative px-3 pt-3 pb-2.5 flex flex-col gap-1.5 overflow-hidden rounded-md ${hit ? 'opacity-35' : ''}`}>
        {/* The ladder rail — banked cards only. The working card used to show
            a partial lime fill here too, but next to the orbiting beam it read
            as a stray static line (Noah flagged it); "% of the way" carries
            the progress in words, the beam carries "current". */}
        {hit && <span className="absolute top-0 left-0 right-0 h-[3px] bg-bull/85" />}

        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Take Profit {tp.level}</span>
          {hit ? (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-bull">
              <Check className="w-3 h-3" /> Hit
            </span>
          ) : working ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-select">
              <span className="w-1.5 h-1.5 rounded-full bg-select animate-pulse" /> In progress
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted/70">Pending</span>
          )}
        </div>

        <div className="flex items-end justify-between">
          <span className={`font-mono text-lg font-semibold tnum leading-none ${hit ? 'text-bull' : working ? 'text-textPrimary' : 'text-textSecondary'}`}>
            +{tp.expectedPct}%
          </span>
          {working && (
            <span className="font-mono text-[10px] text-textSecondary tnum">{Math.round(progress * 100)}% of the way</span>
          )}
        </div>

        {/* Targets and needed levels are DATA — a pending rung dims one shade,
            never to unreadable (the Dark Pool lesson, again). */}
        <div className={`font-mono text-[11px] tnum ${working ? 'text-textPrimary' : 'text-textSecondary'}`}>
          Target ${tp.target.toFixed(2)}
          {working && awayPct > 0 && ` · ${awayPct.toFixed(0)}% away`}
        </div>
        {/* The underlying level that pays this rung — a premium target the
            user can't watch, inverted into a price they can. */}
        {needs && (
          <div className={`font-mono text-[11px] tnum ${working ? 'text-textPrimary' : 'text-textSecondary'}`}>
            {needs}
          </div>
        )}
      </div>

      {/* Banked: the word stamps over the dimmed card — the ladder has moved
          on, and the beam is already lapping the next rung. */}
      {hit && (
        <span className="absolute inset-0 z-10 grid place-items-center rounded-md animate-soft-in">
          <span className="font-mono text-[13px] font-bold uppercase tracking-[0.3em] text-bull pl-[0.3em]">Complete</span>
        </span>
      )}
    </div>
  );
};

const SignalMonitor = ({ setup, spot, gradedAt, onBack }: SignalMonitorProps) => {
  const tone = verdictTone[setup.verdict];

  /* The pricer that minted the mid — the TP ladder inverts targets through it */
  const iv = setup.greeks.iv / 100;
  const sessions = Math.max(setup.sessionsLeft, 0.5);
  const priceAt = (s: number, sess: number) =>
    estimatePremium(s, setup.strike, setup.right, iv, Math.max(sess, 0.05) / 252);

  return (
    <div className="flex flex-col gap-4">
      {/* Header bar */}
      <Panel className="w-full">
        <div className="flex items-center gap-3">
          {/* "Back", not "Scanner" — where a back button goes is the previous
              view by definition; naming the destination just made it read as a
              navigation tab. The arrow leans into the direction on hover. */}
          <button
            onClick={onBack}
            className="group inline-flex items-center gap-1.5 border border-borderSubtle hover:border-borderMuted rounded-md px-2.5 py-1.5 font-mono text-[11px] text-textSecondary hover:text-textPrimary transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-200 ease-out group-hover:-translate-x-0.5" /> Back
          </button>
          <VerdictBadge verdict={setup.verdict} dot />
          <span className="font-mono text-sm font-bold text-textPrimary">{setup.contract}</span>
          <div className="ml-auto text-right border border-borderSubtle bg-inset rounded-md px-3 py-1.5">
            <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Live premium</div>
            <div className="font-mono text-sm font-semibold text-textPrimary tnum">
              <AnimatedNumber value={setup.liveMid} format={v => `$${v.toFixed(2)}`} />
            </div>
          </div>
        </div>
        {/* Provenance without freezing: this monitor reads LIVE, and says so.
            The grade itself is engine-internal (Noah, 2026-08-16) — only the
            sweep that surfaced the row is named. */}
        {gradedAt != null && (
          <p className="mt-2 font-mono text-[11px] text-textSecondary">
            Found on the <span className="text-textPrimary tnum">{gradedAt}</span> scan · watching live since
          </p>
        )}
      </Panel>

      {/* Setup + confidence/greeks — keyed so switching contracts soft-fades
          the content while the header bar above stays put */}
      <div key={setup.id} className="contents">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch animate-soft-in">
        <Panel title="The Setup" tone={tone} className="w-full">
          <div className="flex flex-col gap-3 h-full">
            <h3 className={`text-base font-semibold leading-snug ${toneText[tone]}`}>{setup.headline}</h3>
            {/* The thesis is CONTENT — 13px primary ink with RichRead's number
                coloring, not an 11px gray whisper (the Dark Pool lesson). */}
            <p className="text-[13px] text-textPrimary leading-relaxed">
              <RichRead text={setup.whyText} />
            </p>
            {/* Thesis chips removed (Noah, 2026-08-17: redundant) */}
          </div>
        </Panel>

        {/* ONE live chip, on the panel — it covers everything inside. Both
            Confidence and Expected Move used to carry their own pulsing LIVE
            badge, which is saying the same thing twice inside a panel that is
            already titled Live Read. */}
        <Panel title="Live Read" className="w-full" actions={<SignalBadge tone="select" dot pulse>Live</SignalBadge>}>
          <div className="flex flex-col gap-4 h-full">
            {/* Confidence meter */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Confidence</span>
                <span className="font-mono text-xs font-semibold text-textPrimary tnum">
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
              <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted mb-2">Greeks</div>
              <GreeksRow greeks={setup.greeks} fourth="vega" />
            </div>

            <div className="mt-auto flex items-center justify-between border-t border-borderSubtle pt-3">
              <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Expected Move</span>
              {/* Direction wears the market's colours — this was lime, and lime
                  is never data. */}
              <span className={`font-mono text-sm font-semibold tnum ${setup.expectedMovePct >= 0 ? 'text-bull' : 'text-bear'}`}>
                <AnimatedNumber value={setup.expectedMovePct} format={v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`} />
              </span>
            </div>
          </div>
        </Panel>
      </div>

      {/* The contract, in dollars — read it, not the grade */}
      <Panel title="The contract" subtitle="what it costs to hold and what has to happen" className="animate-soft-in">
        <ContractFacts setup={setup} spot={spot} />
      </Panel>

      {/* Take-profit ladder */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 animate-soft-in">
        {setup.takeProfits.map(tp => {
          const need = spotForPremium(tp.target, setup.right, priceAt, sessions, spot);
          return (
            <TakeProfitCard
              key={tp.level}
              tp={tp}
              liveMid={setup.liveMid}
              needs={need != null ? `${setup.ticker} needs ${need.toFixed(2)}` : null}
            />
          );
        })}
      </div>
      </div>
    </div>
  );
};

export default SignalMonitor;
