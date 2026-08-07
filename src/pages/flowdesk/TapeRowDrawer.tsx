import { Bookmark } from 'lucide-react';
import SignalBadge from '../../components/ui/SignalBadge';
import DrilldownDrawer, { Field, Section } from '../../components/flowdesk/DrilldownDrawer';
import CrossDeskLinks from '../../components/flowdesk/CrossDeskLinks';
import PrintSessionChart from './PrintSessionChart';
import { aggressorOf, competingRead, moneyness, printImplication, printRead, sizeVsOi } from './printRead';
import { sentimentOf } from '../../data/flowtape';
import { fmtUsd } from '../../data/gex';
import type { FlowPrint, PrintSentiment } from '../../types/flowdesk';
import type { Tone } from '../../components/ui/tones';

const SENT_TONE: Record<PrintSentiment, Tone> = {
  BULLISH: 'bull',
  BEARISH: 'bear',
  NEUTRAL: 'neutral',
};

interface TapeRowDrawerProps {
  print: FlowPrint | null;
  onClose: () => void;
  isMarked: boolean;
  onToggleMark: (id: number) => void;
}

/**
 * Right-hand detail for a single options print.
 *
 * The reader has just watched one line fly past the tape and wants four things:
 * whether it matters, who traded it, how hard they pressed, and what it implies.
 * So the drawer leads with the one number that answers the first — the premium,
 * with the arithmetic that makes it — then answers the rest in a sentence, then
 * puts the fill inside the only series a point event honestly belongs to.
 *
 * It used to open on five unrelated number layouts carrying twenty values, seven
 * of them printed twice, above two charts. Everything the sentence, the spread
 * rail or the chart already says has been taken out rather than restated: the
 * contract's aggressor split is the chart's to report, the strategy and the
 * sentiment are the header's, and volume, open interest and spot ride under the
 * ratios that use them.
 */
const TapeRowDrawer = ({ print, onClose, isMarked, onToggleMark }: TapeRowDrawerProps) => {
  const sent = print ? sentimentOf(print) : 'NEUTRAL';
  const agg = print ? aggressorOf(print) : null;
  const money = print ? moneyness(print) : null;

  // The rail is drawn from the three numbers printed at its ends, so the picture
  // can never disagree with its own labels. enrichPrint can quote a fill outside
  // the spread it also quotes; when it does, the caption says so instead of
  // parking the marker somewhere it never traded.
  const lo = print ? Math.min(print.bid, print.ask) : 0;
  const hi = print ? Math.max(print.bid, print.ask) : 0;
  const raw = print ? (print.fill - lo) / (hi - lo || 1) : 0;
  const outside = raw < 0 || raw > 1;
  const pos = Math.max(0, Math.min(1, raw));

  return (
    <DrilldownDrawer
      open={!!print}
      onClose={onClose}
      ariaLabel={print ? `${print.ticker} ${print.strike}${print.right} print detail` : 'print detail'}
      header={
        print && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-data font-semibold ${
                  print.right === 'C'
                    ? 'border-bull/30 bg-bull/10 text-bull'
                    : 'border-bear/30 bg-bear/10 text-bear'
                }`}
              >
                {print.ticker} {print.strike}
                {print.right}
              </span>
              {print.legs > 1 && <span className="font-mono text-label text-select">×{print.legs}</span>}
              <SignalBadge tone={SENT_TONE[sent]}>{sent}</SignalBadge>
            </div>
            <div className="mt-1 flex items-center gap-2 font-mono text-label text-textSecondary tnum">
              <span>{print.time}</span>
              <span className="text-textMuted">·</span>
              <span className={print.sweep ? 'text-warn font-semibold uppercase' : 'uppercase'}>
                {print.sweep ? 'SWEEP' : print.strat === '—' ? 'BLOCK' : print.strat}
              </span>
            </div>
          </>
        )
      }
    >
      {print && agg && money && (
        <>
          {/* The lead: what it cost, who pressed, and how far into the spread they
              reached. One object, because those three are one read. */}
          <div className="inst-surface rounded-md px-4 py-3 flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="font-mono text-label uppercase tracking-widest text-textMuted">Print premium</span>
                <span
                  className={`font-mono text-xl font-bold tnum ${
                    print.premium >= 1_000_000 ? 'text-king' : 'text-textPrimary'
                  }`}
                >
                  {fmtUsd(print.premium)}
                </span>
                <span className="font-mono text-label text-textSecondary tnum">
                  {print.size.toLocaleString()} × ${print.fill.toFixed(2)} × 100
                </span>
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                <span className="font-mono text-label uppercase tracking-widest text-textMuted">Aggressor</span>
                <span className={`font-mono text-base font-bold ${agg.tone}`}>{agg.label}</span>
                <span className="font-mono text-label text-textSecondary tnum">
                  {Math.abs(print.flowScore) < 15
                    ? 'no pressure either way'
                    : `${Math.abs(print.flowScore)} of 100 pressure`}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 border-t border-borderSubtle pt-3">
              <div className="flex items-center gap-3">
                <span className="font-mono text-label tnum text-textMuted">{lo.toFixed(2)}</span>
                <span className="relative flex-1 h-[4px] rounded-full bg-white/[0.07]">
                  <span
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[9px] h-[9px] rounded-full ${
                      print.side === 'ASK' ? 'bg-bull' : print.side === 'BID' ? 'bg-bear' : 'bg-white/60'
                    } ${outside ? 'ring-1 ring-warn' : ''}`}
                    style={{ left: `${pos * 100}%` }}
                  />
                </span>
                <span className="font-mono text-label tnum text-textMuted">{hi.toFixed(2)}</span>
              </div>
              <span className="text-micro leading-relaxed text-textMuted">
                {outside
                  ? `Printed at $${print.fill.toFixed(2)}, ${raw < 0 ? 'below the quoted bid' : 'above the quoted ask'} of $${(raw < 0 ? lo : hi).toFixed(2)}.`
                  : `Printed at $${print.fill.toFixed(2)}, ${Math.round(pos * 100)}% of the way from the bid to the ask.`}
              </span>
            </div>
          </div>

          {/* The read, and the story that fits the same fill just as well. */}
          <div className="inst-surface rounded-md px-4 py-3 flex flex-col gap-2">
            <span className="font-mono text-label uppercase tracking-widest text-textSecondary">What it reads as</span>
            <p className="text-caption leading-relaxed text-textSecondary">{printRead(print)}</p>
            <p className="text-caption leading-relaxed text-textMuted">{printImplication(print)}</p>
            <div className="flex items-start gap-2 border-t border-borderSubtle pt-2.5">
              <span className="font-mono text-label uppercase tracking-wider text-textMuted whitespace-nowrap mt-px">
                Competing read
              </span>
              <p className="text-label leading-relaxed text-textMuted">{competingRead(print)}</p>
            </div>
          </div>

          <PrintSessionChart print={print} />

          <Section title="Contract">
            <Field
              label="Expiry"
              value={print.expiry}
              sub={print.dte === 0 ? 'expires today' : `${print.dte}d left`}
            />
            <Field
              label="Moneyness"
              value={money.short}
              sub={`spot $${print.spot.toFixed(2)}`}
            />
            <Field
              label="Print vs OI"
              value={`${sizeVsOi(print).toFixed(1)}%`}
              sub={`${print.size.toLocaleString()} of ${print.oi.toLocaleString()} open`}
              tone={sizeVsOi(print) >= 25 ? 'text-warn' : 'text-textPrimary'}
            />
            <Field
              label="Vol / OI"
              value={`${print.volOverOI.toFixed(2)}x`}
              sub={`${print.volume.toLocaleString()} traded today`}
              tone={print.volOverOI >= 5 ? 'text-warn' : 'text-textPrimary'}
            />
            <Field
              label="ΔOI"
              value={
                print.deltaOI.value === 0
                  ? 'Unchanged'
                  : `${print.deltaOI.value > 0 ? '↑' : '↓'}${Math.abs(print.deltaOI.value).toLocaleString()}`
              }
              sub="vs the prior session"
              tone={print.deltaOI.value === 0 ? 'text-textMuted' : print.deltaOI.value > 0 ? 'text-bull' : 'text-bear'}
            />
            <Field label="IV" value={`${print.iv.toFixed(1)}%`} sub="annualized" />
          </Section>

          <button
            type="button"
            onClick={() => onToggleMark(print.id)}
            aria-pressed={isMarked}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded border font-mono text-caption uppercase tracking-wider transition-colors ${
              isMarked
                ? 'border-select/30 bg-select/10 text-select'
                : 'border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary hover:border-borderMuted'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" fill={isMarked ? 'currentColor' : 'none'} />
            {isMarked ? 'Tracking print' : 'Track print'}
          </button>

          {/* Cross-desk deep links — carry this exact contract to the next desk */}
          <CrossDeskLinks ticker={print.ticker} strike={print.strike} right={print.right} onNavigate={onClose} />
        </>
      )}
    </DrilldownDrawer>
  );
};

export default TapeRowDrawer;
