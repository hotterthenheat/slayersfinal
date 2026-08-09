import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Ticket, AlertTriangle, Clock, ShieldAlert, Pin } from 'lucide-react';
import { preserveGreek } from '../ui/greek';
import { weighContract, type WeighedContract, type ContractVerdict } from '../../core/contractScore';
import { pinStrike } from '../../data/gex';
import { VERDICT_LABEL, VERDICT_TONE } from './verdict';
import { computeClock, lottoGateArmed } from './mocClock';
import useMediaQuery from '../../hooks/useMediaQuery';
import ContractTrack from './ContractTrack';
import { weighedToPlan } from './contractTrackModel';
import type { Verdict } from '../../types/compass';
import type { MarketSnapshot } from '../../types/market';
import { DUR, EASE } from '../../lib/motion';
import Panel from '../ui/Panel';
import EmptyState from '../ui/EmptyState';
import StatCard from '../ui/StatCard';
import MetricGrid from '../ui/MetricGrid';
import SignalBadge from '../ui/SignalBadge';
import { ROW_INTERACTIVE } from '../ui/interactiveRow';

/**
 * One grade lexicon across the terminal. The engine keeps BUY/WATCH/FADE; every
 * screen renders QUALIFIED / WATCH / FADED through verdict.ts. This board used
 * to carry a third private set (QUALIFIES / CONDITIONAL / REJECTED) with its own
 * tone map, so the same state was spoken three ways depending on the pane.
 */
const GRADE_VERDICT: Record<ContractVerdict, Verdict> = { BUY: 'ENTER', WATCH: 'WATCH', FADE: 'EXIT' };

const sideWord = (s: 'C' | 'P') => (s === 'C' ? 'Calls' : 'Puts');

/*
  ================================================================
  What this board used to be, and why it is not that any more.

  Every structural decision here was a function of a modelled closing-auction
  imbalance: which side got listed, how the names were ranked across the strip,
  a ±18-point grade adjustment, a per-strike "auction covers 1.4x" chip, and a
  whole evidence panel reporting normalized imbalance, indicative displacement,
  absorption and reversal risk to two decimals.

  None of that is sourceable. Unpaired auction interest and the indicative
  price come from an exchange imbalance feed — Nasdaq NOII, NYSE Order
  Imbalances — and the confirmation term claimed corroboration from futures.
  The product carries options, equities and index quotes. It carries no
  auction feed and no futures feed, so not one of those numbers had a path to
  a real value; each was a hash of the ticker wearing a σ suffix.

  What was always backed is the long-shot question itself: given the chain,
  does the one-sigma move to expiry cover this strike's breakeven, and what
  does an hour of standing still cost while you wait. Strike grid, mid, IV,
  greeks, theta and open interest are all first-party. That question is what
  the board asks now, on both sides, with no claim about which way the close
  is going to break.
  ================================================================
*/

/**
 * Black-Scholes floors its price at $0.02 (contractScore.ts). Past that floor the
 * number stops being a price: theta over premium collapses, so the decay factor
 * reads "carryable" precisely because there is nothing left to burn, and a dead
 * strike outscores a live one. Measured on this board's own ladder names, ORCL
 * 0DTE puts run 59 / 43 / 39 / 43 / 57 / 59 walking away from spot, so the two
 * worthless strikes outrank three live ones. Nothing floored is ever ranked here.
 */
const isPriceable = (c: WeighedContract) => c.mid > 0.02 && Math.abs(c.delta) >= 0.01;

/**
 * The board's ticket ladder: the nearest listed strikes on one side, walked out
 * from the money on the chain's own grid.
 *
 * Percentage offsets were the obvious alternative and they do not survive
 * contact with the grid. A fixed 0.2%/0.4%/0.7% sweep is one strike apart on SPY
 * at $502 but lands on the SAME strike three times on AVGO at $175, where a $1
 * grid is 0.57% wide. Walking the grid gives six distinct listed contracts on
 * every name, which is also what a chain actually looks like.
 */
function lottoLadder(snapshot: MarketSnapshot, right: 'C' | 'P', dte: number, want = 6): WeighedContract[] {
  const sorted = [...snapshot.chain].sort((a, b) => a.strike - b.strike);
  const step = sorted.length > 1 ? Math.abs(sorted[1].strike - sorted[0].strike) : Math.max(snapshot.spot * 0.005, 0.5);
  const atm = Math.round(snapshot.spot / step) * step;
  const lo = sorted[0]?.strike ?? atm;
  const hi = sorted[sorted.length - 1]?.strike ?? atm;
  const out: WeighedContract[] = [];
  for (let k = 0; k <= 12 && out.length < want; k++) {
    const strike = right === 'C' ? atm + k * step : atm - k * step;
    if (strike < lo || strike > hi) break;
    const c = weighContract(snapshot, right, strike, dte);
    if (isPriceable(c)) out.push(c);
  }
  return out;
}

/**
 * The long-shot question, per strike: does the one-sigma move to expiry cover
 * this contract's breakeven?
 *
 * Both terms come off the scorer that graded the row — `expectedMovePct` is the
 * one-sigma move to this expiry, `breakevenMovePct` is what the strike needs.
 * The ratio is division, not a model. It replaced an "auction covers 1.4x" chip
 * that multiplied the breakeven against a fabricated auction displacement.
 */
const sigmaReach = (c: WeighedContract) => c.expectedMovePct / Math.max(Math.abs(c.breakevenMovePct), 0.05);

/*
  One grid, declared once, used by the header and every row under it.

  The board used to be a flex row per ticket with `flex-1` on the left, which
  left roughly 600px of empty track down the middle of a 1440px board, and it
  carried its own inline labels on every cell — "±1σ", "θ/day", "mid" repeated
  down all twelve rows. Three columns of label text, twelve times over, for
  three headings that never change.

  Naming the columns once at the top removes 36 pieces of repeated text and
  gives the numbers a shared baseline, which is the whole reason a ladder is
  legible at a glance.
*/
const GRID = 'minmax(0,1fr) 62px 60px 56px 62px 60px 46px 92px';
const GRID_SM = 'minmax(0,1fr) 58px 46px 84px';

const HEAD = ['Contract', 'Reach', 'Needs', '±1σ', 'θ/day', 'Mid', 'Grade', ''];
const HEAD_SM = ['Contract', 'Reach', 'Grade', ''];

const HeadRow = ({ compact }: { compact: boolean }) => (
  <div
    className="grid gap-2 items-center px-3.5 py-1.5 border-b border-borderSubtle"
    style={{ gridTemplateColumns: compact ? GRID_SM : GRID }}
  >
    {(compact ? HEAD_SM : HEAD).map((h, i) => (
      <span
        key={h || `sp-${i}`}
        className={`font-mono text-micro uppercase tracking-widest text-textMuted ${i === 0 ? '' : 'text-right'}`}
      >
        {preserveGreek(h)}
      </span>
    ))}
  </div>
);

/* ---- one lotto ticket row ---- */
const LottoRow = ({
  c,
  pin,
  compact,
  best,
  selected,
  onSelect,
}: {
  c: WeighedContract;
  pin: number;
  compact: boolean;
  best: boolean;
  selected: boolean;
  onSelect: () => void;
}) => {
  const rightColor = c.right === 'C' ? 'text-bull' : 'text-bear';
  const covers = sigmaReach(c);
  const onPin = c.strike === pin;
  const num = 'font-mono text-caption tnum text-right leading-4';

  return (
    /* A row is the handle on the contract track below the board, so it is a real
       control rather than a div with a cursor. No selection rail: the wash is the
       marker the rest of this desk uses on a picked card. */
    <motion.button
      type="button"
      layout="position"
      transition={{ duration: DUR.reflow, ease: EASE }}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${c.ticker} ${c.strike}${c.right === 'C' ? ' call' : ' put'}, ${
        c.dte === 0 ? 'same session' : `${c.dte} day`
      }, mid $${c.mid.toFixed(2)}, grades ${c.composite}, a one-sigma move ${
        covers >= 1 ? 'covers' : 'falls short of'
      } the breakeven at ${covers.toFixed(1)} times. Chart this ticket.`}
      className={`w-full text-left grid gap-2 items-center px-3.5 py-2 transition-colors ${ROW_INTERACTIVE} ${
        selected ? 'bg-select/[0.06]' : 'hover:bg-rowHover'
      }`}
      style={{ gridTemplateColumns: compact ? GRID_SM : GRID }}
    >
      <span className="min-w-0 flex items-center gap-1.5">
        {/* The top ticket is marked by a rail, not a badge. A "TOP TICKET" pill
            on row one of two ladders is two pills making a claim the ordering
            already makes. */}
        <span
          className={`w-0.5 h-4 rounded-full shrink-0 ${best ? 'bg-select' : 'bg-transparent'}`}
          aria-hidden
        />
        <span className="font-mono text-data font-semibold text-textPrimary tnum truncate">
          {c.strike}
          <span className={rightColor}>{c.right}</span>
        </span>
        {onPin && (
          <Pin className="w-3 h-3 text-warn shrink-0" aria-label="dealers are heaviest on this strike" />
        )}
      </span>

      {/* The desk's one question, stated once. It used to be said three times on
          every row — a "±1σ covers 2.3x" chip, a sentence repeating both terms,
          and a ±1σ column carrying the same figure. */}
      <span className={`${num} ${covers >= 1 ? 'text-bull' : 'text-textMuted'}`}>{covers.toFixed(1)}x</span>

      {!compact && <span className={`${num} text-textSecondary`}>{Math.abs(c.breakevenMovePct).toFixed(2)}%</span>}
      {!compact && <span className={`${num} text-textSecondary`}>{c.expectedMovePct.toFixed(2)}%</span>}
      {!compact && <span className={`${num} text-warn`}>−{c.thetaPerDayPct.toFixed(0)}%</span>}
      {!compact && <span className={`${num} text-textPrimary`}>${c.mid.toFixed(2)}</span>}

      <span className="font-mono text-body font-bold text-textPrimary tnum text-right leading-4">{c.composite}</span>
      <SignalBadge tone={VERDICT_TONE[GRADE_VERDICT[c.verdict]]} className="justify-center">
        {VERDICT_LABEL[GRADE_VERDICT[c.verdict]]}
      </SignalBadge>
    </motion.button>
  );
};

/* ---- one side of the board ---- */
const SideLadder = ({
  right,
  rows,
  pin,
  compact,
  trackedId,
  onSelect,
}: {
  right: 'C' | 'P';
  rows: WeighedContract[];
  pin: number;
  compact: boolean;
  trackedId: string | null;
  onSelect: (id: string) => void;
}) => (
  <div className="flex flex-col">
    <div className="px-3.5 py-1.5 bg-inset border-b border-borderSubtle flex items-baseline gap-2">
      <span className={`font-mono text-label font-semibold uppercase tracking-widest ${right === 'C' ? 'text-bull' : 'text-bear'}`}>
        {sideWord(right)}
      </span>
      <span className="font-mono text-micro text-textMuted">
        {rows.filter(c => c.verdict === 'BUY').length} of {rows.length} qualify
      </span>
    </div>
    {rows.length === 0 ? (
      <p className="px-3.5 py-3 font-mono text-label text-textMuted leading-relaxed">
        Every listed {sideWord(right).toLowerCase().slice(0, -1)} on this expiry sits at the model&apos;s $0.02 floor. There is no
        grade to give.
      </p>
    ) : (
      <div className="flex flex-col divide-y divide-borderSubtle">
        <AnimatePresence initial={false}>
          {rows.map((c, i) => (
            <LottoRow
              key={c.id}
              c={c}
              pin={pin}
              compact={compact}
              best={i === 0}
              selected={c.id === trackedId}
              onSelect={() => onSelect(c.id)}
            />
          ))}
        </AnimatePresence>
      </div>
    )}
  </div>
);

/**
 * Compass's third mode: the long-shot desk.
 *
 * Both sides are listed, ranked within their own side and never interleaved.
 * Composite is a quality score with no direction in it, so a call and a put
 * sorted into one list would present a 504C above a 501P as if that were an
 * opinion. Ranking inside a fixed side is a comparison the score can carry;
 * ranking across sides is not, and the board no longer has an engine entitled
 * to name a direction.
 */
interface LottoBoardProps {
  snapshot: MarketSnapshot;
}

const LottoBoard = ({ snapshot }: LottoBoardProps) => {
  // The gate stores WHICH product was accepted, not merely that something was.
  // It used to be a bare boolean under a paragraph hard-coded to "same-session",
  // so a next-session board — held through the overnight gap — unlocked on an
  // acknowledgement of a risk it does not carry.
  const [ackedDte, setAckedDte] = useState<0 | 1 | null>(null);
  /** WeighedContract id of the ticket the track below the board is drawing. */
  const [pickedTicket, setPickedTicket] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  // Same breakpoint ContractTrack uses one file over, so the board and the
  // chart under it collapse together rather than at two different widths.
  const compact = useMediaQuery('(max-width: 639px)');

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const clock = useMemo(() => computeClock(nowTick), [nowTick]);

  /*
    Which expiry the board prices, from the calendar and nothing else.

    A 0DTE ladder on a closed market is a ladder of contracts that have already
    settled, so with the bell gone the board prices the next session. This used
    to fall out of the auction classification — DISLOCATION REVERSAL meant "the
    trade is after the cross", so it meant 1DTE — which put a modelled imbalance
    in charge of which expiry a reader was looking at.
  */
  const boardDte: 0 | 1 = clock.marketOpen ? 0 : 1;

  /*
    The acknowledgement is proportional to what it is acknowledging.

    Measured with the page clock faked to five market states, the wall fired in
    all five — pre-market, mid-session, the closing window, after the close, and
    on a Saturday — and the board was unreachable in every one. Two of those are
    states with nothing to trade at all, so the page was asking consent to a
    total loss on a session that had already settled. A gate that fires
    unconditionally trains people to dismiss it unread, which defeats the only
    thing it is for.

    So it fires in the window where it bites: the last quarter hour, when a
    same-session ticket is minutes from being worth its intrinsic or nothing.
    Outside it the board shows and the risk paragraph stays pinned above it,
    unchanged and unweakened — relocated, not softened.
  */
  const gateArmed = lottoGateArmed(clock);
  // Rolling from a same-session board to a next-session one re-arms the gate:
  // the paragraph the user accepted no longer describes the board behind it.
  const acked = !gateArmed || ackedDte === boardDte;
  const pin = useMemo(() => pinStrike(snapshot, 6), [snapshot]);

  const calls = useMemo(() => lottoLadder(snapshot, 'C', boardDte), [snapshot, boardDte]);
  const puts = useMemo(() => lottoLadder(snapshot, 'P', boardDte), [snapshot, boardDte]);

  // Ranking and filtering happen here, never inside weighContracts, which the
  // Weigher shares.
  const rank = (rows: WeighedContract[]) => [...rows].sort((a, b) => b.composite - a.composite);
  const rankedCalls = rank(calls);
  const rankedPuts = rank(puts);

  /* The ticket the track draws. Resolved rather than reset: switching name or
     session rebuilds the ladders, and a stale id simply stops matching, so the
     board falls back to its own top ticket without an effect chasing it. */
  const trackedTicket =
    [...rankedCalls, ...rankedPuts].find(c => c.id === pickedTicket) ?? rankedCalls[0] ?? rankedPuts[0] ?? null;
  const trackPlan = trackedTicket ? weighedToPlan(trackedTicket) : null;

  // The per-side qualify count stays on each ladder header, where it sits
  // beside the rows it counts; only the board-wide reach count needs hoisting.
  const priceable = rankedCalls.length + rankedPuts.length;
  const reaching = [...rankedCalls, ...rankedPuts].filter(c => sigmaReach(c) >= 1).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Three cards, not five. `Priceable` and `Qualify` were both counts of
          the table directly below them, which a reader can see; only the reach
          count says something the ladder does not already show at a glance.
          Plain strings: StatCard runs its own label through preserveGreek. */}
      <MetricGrid min="200px">
        <StatCard
          label="Time to close"
          value={clock.marketOpen ? clock.toClose : 'closed'}
          sub={clock.label}
          tone={clock.mocOpen ? 'warn' : clock.marketOpen ? 'select' : 'neutral'}
          emphasis
        />
        <StatCard
          label="Board"
          value={`${boardDte}DTE`}
          sub={clock.marketOpen ? 'same session' : 'next session'}
          tone="select"
        />
        <StatCard
          label="±1σ covers"
          value={`${reaching} of ${priceable}`}
          sub="strikes a one-sigma move reaches"
          tone={reaching > 0 ? 'bull' : 'neutral'}
        />
      </MetricGrid>

      <Panel tone="warn" bodyClassName="py-2.5">
        <p className="flex items-start gap-2 text-caption text-textSecondary leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" aria-hidden />
          <span>
            <span className="font-mono text-micro font-semibold uppercase tracking-widest text-warn mr-2">Lotto risk</span>
            Long-shot contracts are all-or-nothing. Theta is measured per hour on a same-session ticket, a contract can go to zero
            before the bell, and most of these expire worthless. Size for a total loss.
          </span>
        </p>
      </Panel>

      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Ticket className="w-3.5 h-3.5" /> {boardDte}DTE lotto board
          </span>
        }
        subtitle={
          // Computed, never hardcoded. The old title read "0DTE lotto board" over
          // a 0-and-1DTE mix. With the market shut the board is a read on a
          // session that has not opened, and saying so is the difference between
          // a stale page and a page about tomorrow.
          clock.marketOpen
            ? `${snapshot.ticker} · both sides, ranked within each side`
            : `${snapshot.ticker} · ${clock.label}, these price the next session`
        }
        flush
      >
        {!acked ? (
          /* A bar, not a curtain. This used to be eight rows of centred
             padding around one paragraph, so the panel it gated was a hole in
             the page even in the states where it had no business firing. */
          <div className="px-3.5 py-3 flex items-start gap-3 flex-wrap border-b border-warn/20 bg-warn/[0.05]">
            <ShieldAlert className="w-4 h-4 text-warn shrink-0 mt-0.5" aria-hidden />
            <p className="flex-1 min-w-[24ch] text-caption text-textSecondary leading-relaxed">
              The bell is minutes away.{' '}
              {boardDte === 0
                ? 'These are same-session lotto tickets, held into today’s close.'
                : 'These are next-session lotto tickets, carried through the close and the overnight gap.'}{' '}
              Most expire worthless. Only view the board if you accept that a full loss of the premium is the expected outcome.
            </p>
            <button
              onClick={() => setAckedDte(boardDte)}
              className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-warn/40 bg-warn/10 hover:bg-warn/15 font-mono text-label font-semibold uppercase tracking-wider text-warn transition-colors"
            >
              I accept a total loss, show the board
            </button>
          </div>
        ) : priceable === 0 ? (
          <EmptyState
            size="lg"
            title="NOTHING PRICEABLE"
            body={`Every listed strike on this expiry sits at the model's $0.02 floor. There is no grade to give.`}
          />
        ) : (
          <div className="flex flex-col">
            <HeadRow compact={compact} />
            <SideLadder
              right="C"
              rows={rankedCalls}
              pin={pin}
              compact={compact}
              trackedId={trackedTicket?.id ?? null}
              onSelect={setPickedTicket}
            />
            <SideLadder
              right="P"
              rows={rankedPuts}
              pin={pin}
              compact={compact}
              trackedId={trackedTicket?.id ?? null}
              onSelect={setPickedTicket}
            />
          </div>
        )}
      </Panel>

      {/* What the ticket has been doing, and what an hour of standing still costs
          it. On a same-session lotto that second half IS the trade: the forward
          curve holds spot at the last close and lets only time run, which is the
          honest picture of a contract whose theta is measured per hour.

          Priced by the same Black-Scholes that graded the row (weighedToPlan
          pins the model), so the line ends on the mid printed beside it. No
          take-profit ladder is drawn, because this desk has none to draw: the
          empty ladder is a first-class state on the plan, and the strike and the
          breakeven are what lane B marks instead. */}
      {acked && trackPlan && <ContractTrack key={trackPlan.key} plan={trackPlan} className="animate-soft-in" />}

      <Panel bodyClassName="py-3">
        <p className="flex items-start gap-2 font-mono text-label text-textMuted leading-relaxed">
          <Clock className="w-3 h-3 shrink-0 mt-0.5" aria-hidden />
          <span aria-live="polite">
            The board names no side. Which way the close breaks is an auction question, and the unpaired interest and indicative
            price that answer it come from an exchange imbalance feed this product does not carry — so both sides are graded on
            what the chain does say: what the strike needs, what a one-sigma move gives it, and what the wait costs.
          </span>
        </p>
      </Panel>
    </div>
  );
};

export default LottoBoard;
