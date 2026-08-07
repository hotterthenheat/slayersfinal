import { Bookmark } from 'lucide-react';
import SignalBadge from '../../components/ui/SignalBadge';
import DetailModal, { Field, Section, Block } from '../../components/ui/DetailModal';
import CrossDeskLinks from '../../components/flowdesk/CrossDeskLinks';
import PrintSessionChart from './PrintSessionChart';
import PayoffLadder from '../../components/flowdesk/PayoffLadder';
import { aggressorOf, competingRead, moneyness, printImplication, printRead, sizeVsOi } from './printRead';
import { sentimentOf } from '../../data/flowtape';
import { scorePrint } from '../../data/informedFlow';
import { dealerSignOf } from '../../data/gammatape';
import { math } from '../../core/mathProvider';
import { describeConditions, isDirectional } from '../../types/conditions';
import { fmtUsd } from '../../data/gex';
import type { FlowPrint, PrintSentiment } from '../../types/flowdesk';
import type { Tone } from '../../components/ui/tones';

const SENT_TONE: Record<PrintSentiment, Tone> = {
  BULLISH: 'bull',
  BEARISH: 'bear',
  NEUTRAL: 'neutral',
};

interface TapeRowModalProps {
  print: FlowPrint | null;
  onClose: () => void;
  isMarked: boolean;
  onToggleMark: (id: number) => void;
}

/** Signed dollars with an explicit + so an add reads as an add. */
const signed = (v: number): string => (v > 0 ? `+${fmtUsd(v)}` : fmtUsd(v));

/**
 * Full detail for a single options print, in a centred modal.
 *
 * The reader has just watched one line fly past the tape and wants four things:
 * whether it matters, who traded it, how hard they pressed, and what it implies.
 * So it leads with the one number that answers the first — the premium, with the
 * arithmetic that makes it — then answers the rest in a sentence, then puts the
 * fill inside the only series a point event honestly belongs to.
 *
 * This used to be a 520px right-hand drawer, and the width was doing real
 * damage: the print carries a stamped greek vector, its raw OPRA condition
 * codes, and everything needed to compute what it did to the dealer's book, and
 * NONE of that was shown because none of it fit in one narrow column. The modal
 * is wide enough to answer the question the tape actually raises — why is this
 * print classified the way it is, and what did it do to the book — so all of it
 * is here now:
 *
 *   - the stamped greeks (delta/gamma/theta/vega/rho), per contract and scaled
 *     to the size actually traded
 *   - the dealer-inventory change this one print caused, on the same convention
 *     the Gamma Tape uses
 *   - the decoded condition codes, which are the reason the desk calls this
 *     print a sweep / a spread leg / directional at all
 *   - its information score and the factors behind it, from the same scorer the
 *     Informed Flow desk runs
 *   - what the underlying has to do for the contract to break even
 */
const TapeRowModal = ({ print, onClose, isMarked, onToggleMark }: TapeRowModalProps) => {
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

  // Everything below is READ from the print, never re-derived: the greeks were
  // stamped at execution, and the dealer convention is gammatape's.
  const g = print?.greeks ?? null;
  const dealerSign = print ? dealerSignOf(print) : 0;
  const dGamma = print && g ? dealerSign * math.gammaDollars(g.gamma, print.size, print.spot) : 0;
  const dDelta = print && g ? dealerSign * math.deltaDollars(g.delta, print.size, print.spot) : 0;
  // Underlying-equivalent exposure the BUYER took on: shares the position moves
  // like, and what those shares are worth.
  const shareEquiv = print && g ? g.delta * print.size * 100 : 0;
  const notional = print ? shareEquiv * print.spot : 0;

  // Breakeven at expiry, and the move the underlying owes to get there.
  const breakeven = print ? (print.right === 'C' ? print.strike + print.fill : print.strike - print.fill) : 0;
  const beMovePct = print ? ((breakeven - print.spot) / print.spot) * 100 : 0;

  // Value split at the fill — definitional, not a valuation: intrinsic is what
  // the contract would be worth if expiry were now, and the rest is what the
  // buyer paid for the time and the vol.
  const intrinsic = print ? Math.max(print.right === 'C' ? print.spot - print.strike : print.strike - print.spot, 0) : 0;
  const extrinsic = print ? Math.max(print.fill - intrinsic, 0) : 0;
  const extrinsicPct = print && print.fill > 0 ? (extrinsic / print.fill) * 100 : 0;
  // The bid/ask IV pair the single-`iv` model collapses to a mid. Present only
  // once a provider supplies it (P0.1) — the snapshot simulator does not.
  const volSpread = print?.bidIv != null && print?.askIv != null ? print.askIv - print.bidIv : null;
  // 2nd/3rd order. The snapshot math ships 1st order only, so this is the seam
  // where a house model's extra columns appear the moment it is installed.
  const higher = print?.greeks
    ? ([
        ['Vanna', print.greeks.vanna, 'dΔ per vol point'],
        ['Charm', print.greeks.charm, 'dΔ per day'],
        ['Vomma', print.greeks.vomma, 'dVega per vol point'],
        ['Veta', print.greeks.veta, 'dVega per day'],
        ['Speed', print.greeks.speed, 'dΓ per $1'],
        ['Zomma', print.greeks.zomma, 'dΓ per vol point'],
      ] as const).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
    : [];

  const conditions = print ? describeConditions(print.conditions) : [];
  // sizePctile is a property of the whole tape, not the print; the drilldown
  // scores this print on its own, so the neutral 0.5 is passed rather than a
  // rank borrowed from a book this modal cannot see.
  const info = print ? scorePrint(print, 0.5) : null;

  return (
    <DetailModal
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
              {info && (
                <SignalBadge tone={info.klass === 'INFORMED' ? 'select' : info.klass === 'UNINFORMED' ? 'neutral' : 'neutral'}>
                  {info.klass === 'UNINFORMED' ? 'NOISE' : info.klass} {info.score}
                </SignalBadge>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 font-mono text-label text-textSecondary tnum">
              <span>{print.time}</span>
              <span className="text-textMuted">·</span>
              <span className={print.sweep ? 'text-warn font-semibold uppercase' : 'uppercase'}>
                {print.sweep ? 'SWEEP' : print.strat === '—' ? 'BLOCK' : print.strat}
              </span>
              <span className="text-textMuted">·</span>
              <span>{print.expiry}</span>
            </div>
          </>
        )
      }
      footer={
        print && (
          <>
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
        )
      }
    >
      {expanded =>
        print && agg && money && (
        <div className={`grid grid-cols-1 gap-4 ${expanded ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
          {/* ── left column: what happened ── */}
          <div className="flex flex-col gap-4 min-w-0">
            {/* The lead: what it cost, who pressed, and how far into the spread
                they reached. One object, because those three are one read. */}
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
          </div>

          {/* ── right column: what it is, and what it did ── */}
          <div className="flex flex-col gap-4 min-w-0">
            <Section title="Contract" cols={3}>
              <Field
                label="Expiry"
                value={print.expiry}
                sub={print.dte === 0 ? 'expires today' : `${print.dte}d left`}
              />
              <Field label="Moneyness" value={money.short} sub={`spot $${print.spot.toFixed(2)}`} />
              <Field label="IV" value={`${print.iv.toFixed(1)}%`} sub="annualized" />
              <Field
                label="Breakeven"
                value={`$${breakeven.toFixed(2)}`}
                sub={`${beMovePct >= 0 ? '+' : ''}${beMovePct.toFixed(1)}% from spot`}
                tone={Math.abs(beMovePct) >= 5 ? 'text-warn' : 'text-textPrimary'}
              />
              <Field
                label="Print vs OI"
                value={`${sizeVsOi(print).toFixed(1)}%`}
                sub={`${print.size.toLocaleString()} of ${print.oi.value.toLocaleString()} open`}
                tone={sizeVsOi(print) >= 25 ? 'text-warn' : 'text-textPrimary'}
              />
              <Field
                label="Vol / OI"
                value={`${print.volOverOI.toFixed(2)}x`}
                sub={`${print.volume.toLocaleString()} traded today`}
                tone={print.volOverOI >= 5 ? 'text-warn' : 'text-textPrimary'}
              />
            </Section>

            {/* Stamped at the instant of the print — not re-derived here, which
                is the whole point of carrying trade greeks. */}
            {g && (
              <Section title="Greeks at execution" cols={3}>
                <Field
                  label="Delta"
                  value={g.delta.toFixed(3)}
                  sub={`${shareEquiv >= 0 ? '+' : ''}${Math.round(shareEquiv).toLocaleString()} sh equiv`}
                  tone={g.delta >= 0 ? 'text-bull' : 'text-bear'}
                />
                <Field label="Gamma" value={g.gamma.toFixed(4)} sub="per $1 of spot" />
                <Field label="Theta" value={g.theta.toFixed(3)} sub="per calendar day" tone="text-bear" />
                <Field label="Vega" value={g.vega.toFixed(3)} sub="per 1 vol point" />
                <Field label="Rho" value={g.rho.toFixed(3)} sub="per 1 pct point" />
                <Field
                  label="Notional"
                  value={fmtUsd(Math.abs(notional))}
                  sub="underlying-equiv"
                  tone="text-textSecondary"
                />
              </Section>
            )}

            {/* What this one print did to the other side of the trade. Same sign
                convention as data/gammatape — a customer buy hands the dealer
                negative gamma. */}
            {g && (
              <Block title="What it did to the dealer">
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                  <span className="flex flex-col">
                    <span className="font-mono text-label uppercase tracking-widest text-textMuted">Δ dealer gamma</span>
                    <span
                      className={`font-mono text-data font-bold tnum ${
                        dealerSign === 0 ? 'text-textMuted' : dGamma > 0 ? 'text-bull' : 'text-bear'
                      }`}
                    >
                      {dealerSign === 0 ? 'no change' : signed(dGamma)}
                    </span>
                  </span>
                  <span className="flex flex-col">
                    <span className="font-mono text-label uppercase tracking-widest text-textMuted">Forced hedge</span>
                    <span
                      className={`font-mono text-data font-bold tnum ${
                        dealerSign === 0 ? 'text-textMuted' : dDelta < 0 ? 'text-bull' : 'text-bear'
                      }`}
                    >
                      {dealerSign === 0 ? '—' : `${signed(dDelta)} Δ`}
                    </span>
                  </span>
                </div>
                <p className="text-micro leading-relaxed text-textMuted">
                  {dealerSign === 0
                    ? 'Crossed at the mid, so the tape names no initiator and the print moves size without moving the dealer book.'
                    : `${dealerSign === -1 ? 'The customer bought, so the dealer sold and is shorter gamma' : 'The customer sold, so the dealer bought and is longer gamma'}. Flattening this print alone means ${dDelta < 0 ? 'buying' : 'selling'} the underlying.`}
                </p>
              </Block>
            )}

            {/* The score, and the factors behind it — the same scorer the
                Informed Flow desk runs, so the two desks cannot disagree. */}
            {info && (
              <Block title="Information score">
                <div className="flex items-center gap-3">
                  <span
                    className={`font-mono text-xl font-bold tnum ${
                      info.klass === 'INFORMED' ? 'text-select' : info.klass === 'UNINFORMED' ? 'text-textMuted' : 'text-textSecondary'
                    }`}
                  >
                    {info.score}
                  </span>
                  <span className="relative h-[5px] flex-1 rounded-full bg-white/[0.06] overflow-hidden">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-select/70"
                      style={{ width: `${info.score}%` }}
                    />
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {info.reasons.map(r => (
                    <span
                      key={r}
                      className="inline-flex items-center rounded border border-borderSubtle bg-white/[0.02] px-1.5 py-0.5 font-mono text-micro text-textSecondary"
                    >
                      {r}
                    </span>
                  ))}
                </div>
                <p className="text-micro leading-relaxed text-textMuted">
                  Scored on this print alone, against a neutral size rank — the Informed Flow desk ranks it against the
                  whole tape, so its score there can differ by the size term.
                </p>
              </Block>
            )}

            {/* The raw vendor payload. Every classification above is downstream
                of these codes, so this is the receipt for all of it. */}
            <Block title="Exchange conditions">
              {conditions.length === 0 ? (
                <p className="text-micro leading-relaxed text-textMuted">
                  No condition codes on this print — an untagged print is treated as a plain, directional single leg.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {conditions.map(c => (
                      <span
                        key={c.code}
                        title={c.family ? 'Named by family — the vendor table describes the range, not each code' : undefined}
                        className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-micro ${
                          c.known
                            ? 'border-borderSubtle bg-white/[0.02] text-textSecondary'
                            : 'border-warn/30 bg-warn/10 text-warn'
                        }`}
                      >
                        <span className="tnum text-textMuted">{c.code}</span>
                        {c.label}
                      </span>
                    ))}
                  </div>
                  <p className="text-micro leading-relaxed text-textMuted">
                    {isDirectional(print.conditions)
                      ? 'Single leg, un-hedged — a standalone directional bet, so it feeds the bull/bear read.'
                      : 'A spread leg or a delta-hedged print. It carries no standalone direction, so the desk excludes it from the directional read.'}
                    {print.exchange ? ` Reported by ${print.exchange}.` : ''}
                    {print.sequence != null ? ` Sequence ${print.sequence.toLocaleString()}.` : ''}
                  </p>
                </>
              )}
            </Block>

            <Section title="Open interest" cols={2}>
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
              <Field
                label="As of"
                value={print.oi.asOf}
                sub={`${print.oi.freshness.toLowerCase()} — OI publishes once a day`}
                tone="text-textSecondary"
              />
            </Section>
          </div>

          {/* ── third column: only at full width ──
              Everything here is a table or a ladder. In the drilldown they
              would push the read below the fold, which is why expanding shows
              MORE rather than the same content stretched. */}
          {expanded && (
            <div className="flex flex-col gap-4 min-w-0">
              <Section title="What the premium bought" cols={3}>
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
                  value={g ? fmtUsd(Math.abs(g.theta * print.size * 100)) : '—'}
                  sub="whole position"
                  tone="text-bear"
                />
              </Section>

              <PayoffLadder
                spot={print.spot}
                strike={print.strike}
                right={print.right}
                cost={print.fill}
                size={print.size}
              />

              <Block title="Vol at execution">
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                  <span className="flex flex-col">
                    <span className="font-mono text-label uppercase tracking-widest text-textMuted">Mid IV</span>
                    <span className="font-mono text-data font-bold tnum text-textPrimary">{print.iv.toFixed(1)}%</span>
                  </span>
                  {volSpread != null ? (
                    <>
                      <span className="flex flex-col">
                        <span className="font-mono text-label uppercase tracking-widest text-textMuted">Bid / ask IV</span>
                        <span className="font-mono text-data font-bold tnum text-textSecondary">
                          {print.bidIv?.toFixed(1)}% / {print.askIv?.toFixed(1)}%
                        </span>
                      </span>
                      <span className="flex flex-col">
                        <span className="font-mono text-label uppercase tracking-widest text-textMuted">Vol spread</span>
                        <span
                          className={`font-mono text-data font-bold tnum ${volSpread >= 4 ? 'text-warn' : 'text-textSecondary'}`}
                        >
                          {volSpread.toFixed(1)} pts
                        </span>
                      </span>
                    </>
                  ) : (
                    <p className="text-micro leading-relaxed text-textMuted max-w-[42ch]">
                      The feed publishes a vol BID and a vol ASK; this print carries a single mid. The pair appears here
                      as soon as a provider supplies it.
                    </p>
                  )}
                </div>
              </Block>

              <Block title="Higher-order greeks">
                {higher.length > 0 ? (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                    {higher.map(([label, v, unit]) => (
                      <span key={label} className="flex items-baseline justify-between gap-3">
                        <span className="font-mono text-label uppercase tracking-wider text-textMuted">{label}</span>
                        <span className="flex items-baseline gap-2">
                          <span className="font-mono text-caption tnum text-textPrimary">{(v as number).toFixed(4)}</span>
                          <span className="font-mono text-micro text-textMuted whitespace-nowrap">{unit}</span>
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-micro leading-relaxed text-textMuted">
                    The print carries first-order greeks only. Vanna, charm, vomma, veta, speed and zomma are typed and
                    read here, and fill in the moment a math provider returns them — nothing else on this card changes.
                  </p>
                )}
              </Block>
            </div>
          )}
        </div>
      )}
    </DetailModal>
  );
};

export default TapeRowModal;
