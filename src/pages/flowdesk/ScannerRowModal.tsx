import { lazy, Suspense } from 'react';
import { SkeletonRows } from '../../components/ui/Skeleton';
import SignalBadge from '../../components/ui/SignalBadge';
import DetailModal, { Field, Section, Block } from '../../components/ui/DetailModal';
import CrossDeskLinks from '../../components/flowdesk/CrossDeskLinks';
import PayoffLadder from '../../components/flowdesk/PayoffLadder';
import { math } from '../../core/mathProvider';
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

interface ScannerRowModalProps {
  row: ScannerRow | null;
  spot: number;
  onClose: () => void;
}

/**
 * Full detail for one scanned contract, in a centred modal — the same
 * contract-flow chart the tape print detail uses, wrapped around the scanner's
 * aggregated reads.
 *
 * The drawer this replaces was 520px wide, which forced the chart and every
 * field into one column and left no room for the numbers a reader actually
 * asks a scanner row for: what the contract is WORTH per lot, what the
 * underlying has to do for it to pay, and what greeks the position carries.
 * Those are here now, modelled through the math seam (core/mathProvider) so a
 * house model replaces them along with everything else.
 */
const ScannerRowModal = ({ row, spot, onClose }: ScannerRowModalProps) => {
  // Greeks for the contract as the scanner sees it — the row's own IV and DTE,
  // priced on the one shared pricer rather than a second model here.
  const g = row ? math.optionGreeks(spot, row.strike, row.iv / 100, math.yearsToExpiry(row.dte), row.right) : null;
  // Breakeven at expiry off the day's average fill, and the move it needs.
  const breakeven = row ? (row.right === 'C' ? row.strike + row.avgFill : row.strike - row.avgFill) : 0;
  const beMovePct = row ? ((breakeven - spot) / spot) * 100 : 0;
  // What one lot costs, and what the open interest is worth at that fill.
  const perLot = row ? row.avgFill * 100 : 0;
  const oiNotional = row ? row.oi * perLot : 0;
  const askPct = row ? 100 - row.bidPct : 0;
  // Definitional split of the day's average fill: what the contract is already
  // worth against what is being paid for time and vol.
  const intrinsic = row ? Math.max(row.right === 'C' ? spot - row.strike : row.strike - spot, 0) : 0;
  const extrinsic = row ? Math.max(row.avgFill - intrinsic, 0) : 0;
  const extrinsicPct = row && row.avgFill > 0 ? (extrinsic / row.avgFill) * 100 : 0;

  return (
    <DetailModal
      open={!!row}
      onClose={onClose}
      ariaLabel={row ? `${row.ticker} ${row.strike}${row.right} contract detail` : 'contract detail'}
      header={
        row && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`font-mono text-data font-semibold ${
                  row.right === 'C' ? 'text-bull' : 'text-bear'
                }`}
              >
                {row.ticker} {row.strike}
                {row.right}
              </span>
              <SignalBadge tone={SENT_TONE[row.sentiment]}>{row.sentiment}</SignalBadge>
            </div>
            <div className="mt-1 flex items-center gap-2 font-mono text-label text-textSecondary tnum">
              <span>{row.expiry} · {row.dte}d</span>
              <span className="text-textMuted">·</span>
              <span className="uppercase">last {row.last}</span>
            </div>
          </>
        )
      }
      footer={
        row && <CrossDeskLinks ticker={row.ticker} strike={row.strike} right={row.right} onNavigate={onClose} />
      }
    >
      {expanded =>
        row && (
        <div className={`grid grid-cols-1 gap-4 ${expanded ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
          <div className="flex flex-col gap-4 min-w-0">
          {/* Headline premium + lean */}
          <div className="inst-surface rounded-md px-4 py-3 flex items-end justify-between gap-3">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-mono text-label uppercase tracking-widest text-textMuted">Contract Premium</span>
              <span
                className={`font-mono text-xl font-bold tnum ${
                  row.premium >= 1_000_000 ? 'text-king' : 'text-textPrimary'
                }`}
              >
                {fmtUsd(row.premium)}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <span className="font-mono text-label uppercase tracking-widest text-textMuted">Lean</span>
              <span
                className={`font-mono text-lead leading-6 font-bold tnum ${
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
              <SkeletonRows rows={6} className="h-[380px] rounded-md inst-surface p-3" />
            }
          >
            <ContractFlowChart contract={scannerToRef(row, spot)} />
          </Suspense>
          </div>

          <div className="flex flex-col gap-4 min-w-0">
          {/* Contract */}
          <Section title="Contract" cols={3}>
            <Field label="Expiry" value={row.expiry} sub={`${row.dte}d to expiry`} />
            <Field
              label="OTM"
              value={`${row.otmPct >= 0 ? '+' : ''}${row.otmPct.toFixed(1)}%`}
              tone={row.otmPct >= 0 ? 'text-bull' : 'text-bear'}
            />
            <Field label="Spot" value={`$${spot.toFixed(2)}`} />
            <Field label="Avg fill" value={`$${row.avgFill.toFixed(2)}`} sub={`${fmtUsd(perLot)} per lot`} />
            <Field
              label="Breakeven"
              value={`$${breakeven.toFixed(2)}`}
              sub={`${beMovePct >= 0 ? '+' : ''}${beMovePct.toFixed(1)}% from spot`}
              tone={Math.abs(beMovePct) >= 5 ? 'text-warn' : 'text-textPrimary'}
            />
            <Field label="OI notional" value={fmtUsd(oiNotional)} sub="open interest at this fill" tone="text-textSecondary" />
          </Section>

          {/* Greeks — modelled at the row's own IV and tenor, on the shared seam. */}
          {g && (
            <Section title="Greeks · modeled" cols={3}>
              <Field
                label="Delta"
                value={g.delta.toFixed(3)}
                sub={`${Math.round(g.delta * 100).toLocaleString()} sh per lot`}
                tone={g.delta >= 0 ? 'text-bull' : 'text-bear'}
              />
              <Field label="Gamma" value={g.gamma.toFixed(4)} sub="per $1 of spot" />
              <Field label="Theta" value={g.theta.toFixed(3)} sub="per calendar day" tone="text-bear" />
              <Field label="Vega" value={g.vega.toFixed(3)} sub="per 1 vol point" />
              <Field label="Rho" value={g.rho.toFixed(3)} sub="per 1 pct point" />
              <Field
                label="Daily decay"
                value={fmtUsd(Math.abs(g.theta) * 100 * row.volume)}
                sub="across today's volume"
                tone="text-bear"
              />
            </Section>
          )}

          {/* Activity */}
          <Section title="Activity" cols={3}>
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

          {/* Lean — the split that produces the read, drawn as well as stated
              so the bar and the badge cannot disagree. Named for the signed
              call-vs-put skew it actually is; see FlowScanner's ScoreBar. */}
          <Block title="Lean">
            <div className="flex items-baseline justify-between gap-3">
              <span
                className={`font-mono text-xl font-bold tnum ${
                  row.bullScore > 15 ? 'text-bull' : row.bullScore < -15 ? 'text-bear' : 'text-textMuted'
                }`}
              >
                {row.bullScore >= 0 ? '+' : ''}
                {row.bullScore}
              </span>
              <SignalBadge tone={SENT_TONE[row.sentiment]}>{row.sentiment}</SignalBadge>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between font-mono text-micro uppercase tracking-wider text-textMuted tnum">
                <span>Bid-hit {row.bidPct}%</span>
                <span>Ask-lifted {askPct}%</span>
              </div>
              <span className="flex h-[5px] w-full overflow-hidden rounded-full bg-white/[0.06]">
                <span className="h-full bg-bear/80" style={{ width: `${row.bidPct}%` }} />
                <span className="h-full bg-bull/80" style={{ width: `${askPct}%` }} />
              </span>
            </div>
            <p className="text-micro leading-relaxed text-textMuted">
              {row.right === 'C'
                ? 'Calls lifted on the ask are buyers paying up; calls hit on the bid are sellers. The score reads the call/put right together with the side.'
                : 'Puts lifted on the ask are buyers paying up for downside; puts hit on the bid are sellers. The score reads the call/put right together with the side.'}
              {row.sweeps > 0
                ? ` ${row.sweeps.toLocaleString()} of the day's prints swept across venues, which is urgency rather than patience.`
                : ' Nothing swept today, so nothing here paid up for immediacy.'}
            </p>
          </Block>
          </div>

          {/* ── third column: only at full width ── */}
          {expanded && (
            <div className="flex flex-col gap-4 min-w-0">
              <Section title="What the premium buys" cols={3}>
                <Field
                  label="Intrinsic"
                  value={`$${intrinsic.toFixed(2)}`}
                  sub={intrinsic > 0 ? 'already in the money' : 'nothing yet'}
                  tone={intrinsic > 0 ? 'text-bull' : 'text-textMuted'}
                />
                <Field
                  label="Time & vol"
                  value={`$${extrinsic.toFixed(2)}`}
                  sub={`${extrinsicPct.toFixed(0)}% of the fill`}
                  tone={extrinsicPct >= 80 ? 'text-warn' : 'text-textPrimary'}
                />
                <Field
                  label="Theta / day"
                  value={g ? `$${Math.abs(g.theta * 100).toFixed(2)}` : '—'}
                  sub="one lot, per day"
                  tone="text-bear"
                />
              </Section>

              <PayoffLadder
                spot={spot}
                strike={row.strike}
                right={row.right}
                cost={row.avgFill}
                size={1}
              />

              <Block title="Scale">
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                  <span className="flex flex-col">
                    <span className="font-mono text-label uppercase tracking-widest text-textMuted">Per lot</span>
                    <span className="font-mono text-data font-bold tnum text-textPrimary">{fmtUsd(perLot)}</span>
                  </span>
                  <span className="flex flex-col">
                    <span className="font-mono text-label uppercase tracking-widest text-textMuted">Open interest</span>
                    <span className="font-mono text-data font-bold tnum text-textSecondary">
                      {row.oi.toLocaleString()} lots
                    </span>
                  </span>
                  <span className="flex flex-col">
                    <span className="font-mono text-label uppercase tracking-widest text-textMuted">OI notional</span>
                    <span className="font-mono text-data font-bold tnum text-textSecondary">{fmtUsd(oiNotional)}</span>
                  </span>
                </div>
                <p className="text-micro leading-relaxed text-textMuted">
                  Open interest valued at today&rsquo;s average fill — what the whole outstanding position would cost to
                  put on at this price, not what it was paid for.
                </p>
              </Block>
            </div>
          )}
        </div>
      )}
    </DetailModal>
  );
};

export default ScannerRowModal;
