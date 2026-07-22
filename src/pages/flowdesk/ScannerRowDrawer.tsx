import { lazy, Suspense } from 'react';
import SignalBadge from '../../components/ui/SignalBadge';
import DrilldownDrawer, { Field, Section } from '../../components/flowdesk/DrilldownDrawer';
import { fmtUsd } from '../../data/gex';
import type { ContractRef } from '../../data/contractflow';
import type { ScannerRow, FlowSentiment } from '../../data/flowscan';
import type { Tone } from '../../components/ui/tones';

const ContractFlowChart = lazy(() => import('./ContractFlowChart'));

const SENT_TONE: Record<FlowSentiment, Tone> = {
  BULLISH: 'bull',
  BEARISH: 'bear',
  NEUTRAL: 'neutral',
};

/**
 * A scanner row is one aggregated contract, so it maps cleanly onto the shared
 * ContractRef the drilldown chart consumes. Aggregate rows have no single print
 * size (size:0), and the dominant aggressor is read off the day's bid-side
 * share — both are the row's own values, nothing invented.
 */
function scannerToRef(r: ScannerRow, spot: number): ContractRef {
  return {
    ticker: r.ticker,
    strike: r.strike,
    right: r.right,
    expiry: r.expiry,
    fill: r.avgFill,
    ratioBidPct: r.bidPct,
    spot,
    side: r.bidPct >= 55 ? 'BID' : r.bidPct <= 45 ? 'ASK' : 'MID',
    size: 0,
    volume: r.volume,
    oi: r.oi,
    premium: r.premium,
    otmPct: r.otmPct,
    volOverOI: r.volOverOi,
    legs: 1,
  };
}

interface ScannerRowDrawerProps {
  row: ScannerRow | null;
  spot: number;
  onClose: () => void;
}

/** Right-hand drilldown for one scanned contract — the same contract-flow chart
    the tape print detail uses, wrapped around the scanner's aggregated reads. */
const ScannerRowDrawer = ({ row, spot, onClose }: ScannerRowDrawerProps) => {
  return (
    <DrilldownDrawer
      open={!!row}
      onClose={onClose}
      ariaLabel={row ? `${row.ticker} ${row.strike}${row.right} contract detail` : 'contract detail'}
      header={
        row && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[13px] font-semibold ${
                  row.right === 'C'
                    ? 'border-bull/30 bg-bull/10 text-bull'
                    : 'border-bear/30 bg-bear/10 text-bear'
                }`}
              >
                {row.ticker} {row.strike}
                {row.right}
              </span>
              <SignalBadge tone={SENT_TONE[row.sentiment]}>{row.sentiment}</SignalBadge>
            </div>
            <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-textSecondary tnum">
              <span>{row.expiry} · {row.dte}d</span>
              <span className="text-textMuted">·</span>
              <span className="uppercase">last {row.last}</span>
            </div>
          </>
        )
      }
    >
      {row && (
        <>
          {/* Headline premium + conviction */}
          <div className="inst-surface rounded-md px-4 py-3 flex items-end justify-between gap-3">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-mono text-[11px] uppercase tracking-widest text-textMuted">Contract Premium</span>
              <span
                className={`font-mono text-xl font-bold tnum ${
                  row.premium >= 1_000_000 ? 'text-king' : 'text-textPrimary'
                }`}
              >
                {fmtUsd(row.premium)}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <span className="font-mono text-[11px] uppercase tracking-widest text-textMuted">Conviction</span>
              <span
                className={`font-mono text-base font-bold tnum ${
                  row.bullScore > 15 ? 'text-bull' : row.bullScore < -15 ? 'text-bear' : 'text-textMuted'
                }`}
              >
                {row.bullScore >= 0 ? '+' : ''}
                {row.bullScore}
              </span>
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
            <ContractFlowChart contract={scannerToRef(row, spot)} />
          </Suspense>

          {/* Contract */}
          <Section title="Contract">
            <Field label="Expiry" value={row.expiry} sub={`${row.dte}d to expiry`} />
            <Field
              label="OTM"
              value={`${row.otmPct >= 0 ? '+' : ''}${row.otmPct.toFixed(1)}%`}
              tone={row.otmPct >= 0 ? 'text-bull' : 'text-bear'}
            />
            <Field label="Spot" value={`$${spot.toFixed(2)}`} />
          </Section>

          {/* Activity */}
          <Section title="Activity">
            <Field label="Volume" value={row.volume.toLocaleString()} />
            <Field label="Open Int." value={row.oi.toLocaleString()} />
            <Field
              label="Est ΔOI/d"
              value={`${row.deltaOi >= 0 ? '+' : ''}${row.deltaOi.toLocaleString()}`}
              tone={row.deltaOi >= 0 ? 'text-bull' : 'text-bear'}
            />
            <Field
              label="Vol / OI"
              value={`${row.volOverOi.toFixed(2)}x`}
              tone={row.volOverOi >= 5 ? 'text-warn' : 'text-textPrimary'}
            />
            <Field label="IV" value={`${row.iv.toFixed(1)}%`} />
            <Field
              label="Sweeps"
              value={row.sweeps > 0 ? row.sweeps.toLocaleString() : '—'}
              tone={row.sweeps > 0 ? 'text-warn' : 'text-textMuted'}
            />
          </Section>

          {/* Conviction */}
          <Section title="Conviction">
            <Field
              label="Bull Score"
              value={`${row.bullScore >= 0 ? '+' : ''}${row.bullScore}`}
              tone={row.bullScore > 15 ? 'text-bull' : row.bullScore < -15 ? 'text-bear' : 'text-textMuted'}
            />
            <Field
              label="Bid-side"
              value={`${row.bidPct}%`}
              tone={row.bidPct >= 55 ? 'text-bear' : row.bidPct <= 45 ? 'text-bull' : 'text-textMuted'}
            />
            <Field
              label="Read"
              value={row.sentiment}
              tone={`text-${SENT_TONE[row.sentiment] === 'neutral' ? 'textMuted' : SENT_TONE[row.sentiment]}`}
            />
          </Section>
        </>
      )}
    </DrilldownDrawer>
  );
};

export default ScannerRowDrawer;
