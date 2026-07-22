import { lazy, Suspense } from 'react';
import { Bookmark } from 'lucide-react';
import SignalBadge from '../../components/ui/SignalBadge';
import DrilldownDrawer, { Field, Section } from '../../components/flowdesk/DrilldownDrawer';
import CrossDeskLinks from '../../components/flowdesk/CrossDeskLinks';

// recharts is heavy — keep it out of the initial bundle; the drilldown only
// mounts when a print is opened.
const ContractFlowChart = lazy(() => import('./ContractFlowChart'));
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

/** Right-hand detail drawer for a single options print — the full anatomy of one
    fill drawn entirely from values the tape already computes. */
const TapeRowDrawer = ({ print, onClose, isMarked, onToggleMark }: TapeRowDrawerProps) => {
  const sent = print ? sentimentOf(print) : 'NEUTRAL';
  const sideLabel = print ? (print.side === 'ASK' ? 'BUY' : print.side === 'BID' ? 'SELL' : 'MID') : '';
  const sideTone =
    print?.side === 'ASK' ? 'text-bull' : print?.side === 'BID' ? 'text-bear' : 'text-textMuted';

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
                className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[13px] font-semibold ${
                  print.right === 'C'
                    ? 'border-bull/30 bg-bull/10 text-bull'
                    : 'border-bear/30 bg-bear/10 text-bear'
                }`}
              >
                {print.ticker} {print.strike}
                {print.right}
              </span>
              {print.legs > 1 && <span className="font-mono text-[11px] text-select">×{print.legs}</span>}
              <SignalBadge tone={sent === 'BULLISH' ? 'bull' : sent === 'BEARISH' ? 'bear' : 'neutral'}>
                {sent}
              </SignalBadge>
            </div>
            <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-textSecondary tnum">
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
      {print && (
        <>
          {/* Headline premium */}
          <div className="inst-surface rounded-md px-4 py-3 flex items-end justify-between gap-3">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-mono text-[11px] uppercase tracking-widest text-textMuted">Print Premium</span>
              <span
                className={`font-mono text-xl font-bold tnum ${
                  print.premium >= 1_000_000 ? 'text-king' : 'text-textPrimary'
                }`}
              >
                {fmtUsd(print.premium)}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <span className="font-mono text-[11px] uppercase tracking-widest text-textMuted">Aggressor</span>
              <span className={`font-mono text-base font-bold ${sideTone}`}>{sideLabel}</span>
            </div>
          </div>

          {/* Contract drilldown — this contract's flow + underlying net premium */}
          <Suspense
            fallback={
              <div className="h-[380px] rounded-md inst-surface flex items-center justify-center font-mono text-[11px] text-textMuted uppercase tracking-widest">
                Loading drilldown…
              </div>
            }
          >
            <ContractFlowChart contract={print} />
          </Suspense>

          {/* Contract */}
          <Section title="Contract">
            <Field label="Expiry" value={print.expiry} sub={`${print.dte}d to expiry`} />
            <Field
              label="OTM"
              value={`${print.otmPct >= 0 ? '+' : ''}${print.otmPct.toFixed(1)}%`}
              tone={print.otmPct >= 0 ? 'text-bull' : 'text-bear'}
            />
            <Field label="Spot" value={`$${print.spot.toFixed(2)}`} />
          </Section>

          {/* Execution */}
          <Section title="Execution">
            <Field label="Fill" value={`$${print.fill.toFixed(2)}`} />
            <Field label="Bid / Ask" value={`${print.bid.toFixed(2)} / ${print.ask.toFixed(2)}`} />
            <Field label="Size" value={print.size.toLocaleString()} />
          </Section>

          {/* Spread fill position */}
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-widest text-textSecondary">Fill in spread</span>
            <div className="inst-surface rounded-md px-3 py-3 flex items-center gap-3">
              <span className="font-mono text-[11px] tnum text-textMuted">{print.bid.toFixed(2)}</span>
              <span className="relative flex-1 h-[4px] rounded-full bg-white/[0.07]">
                <span
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[9px] h-[9px] rounded-full ${
                    print.side === 'ASK' ? 'bg-bull' : print.side === 'BID' ? 'bg-bear' : 'bg-white/60'
                  }`}
                  style={{ left: `${print.fillPos * 100}%` }}
                />
              </span>
              <span className="font-mono text-[11px] tnum text-textMuted">{print.ask.toFixed(2)}</span>
            </div>
          </div>

          {/* Conviction */}
          <Section title="Conviction">
            <Field
              label="Flow Score"
              value={`${print.flowScore > 0 ? '+' : ''}${print.flowScore}`}
              tone={print.flowScore > 15 ? 'text-bull' : print.flowScore < -15 ? 'text-bear' : 'text-textMuted'}
            />
            <Field
              label="Day Ratio"
              value={print.ratioLabel}
              tone={
                print.ratioLabel === 'MID'
                  ? 'text-textMuted'
                  : print.ratioBidPct >= 50
                    ? 'text-bear'
                    : 'text-bull'
              }
            />
            <Field label="Sentiment" value={sent} tone={`text-${SENT_TONE[sent] === 'neutral' ? 'textMuted' : SENT_TONE[sent]}`} />
          </Section>

          {/* Activity */}
          <Section title="Activity">
            <Field label="Volume" value={print.volume.toLocaleString()} />
            <Field label="Open Int." value={print.oi.toLocaleString()} />
            <Field
              label="ΔOI"
              value={
                print.deltaOI === 0
                  ? '—'
                  : `${print.deltaOI > 0 ? '↑' : '↓'}${Math.abs(print.deltaOI).toLocaleString()}`
              }
              tone={print.deltaOI === 0 ? 'text-textMuted' : print.deltaOI > 0 ? 'text-bull' : 'text-bear'}
            />
            <Field
              label="Vol / OI"
              value={`${print.volOverOI.toFixed(2)}x`}
              tone={print.volOverOI >= 5 ? 'text-warn' : 'text-textPrimary'}
            />
            <Field label="IV" value={`${print.iv.toFixed(1)}%`} />
            <Field label="Strategy" value={print.strat === '—' ? 'Single leg' : print.strat} />
          </Section>

          {/* Mark action */}
          <button
            onClick={() => onToggleMark(print.id)}
            aria-pressed={isMarked}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded border font-mono text-[12px] uppercase tracking-wider transition-colors ${
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
