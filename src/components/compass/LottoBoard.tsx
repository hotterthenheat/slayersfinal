import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Ticket, Clock, ShieldAlert, Pin } from 'lucide-react';
import { preserveGreek } from '../ui/greek';
import { weighContract, type WeighedContract, type ContractVerdict } from '../../core/contractScore';
import { pinStrike } from '../../data/gex';
import { VERDICT_LABEL, VERDICT_TONE } from './verdict';
import { computeClock, lottoGateArmed } from './mocClock';
import ContractTrack from './ContractTrack';
import { weighedToPlan } from './contractTrackModel';
import type { Verdict } from '../../types/compass';
import type { MarketSnapshot } from '../../types/market';
import Panel from '../ui/Panel';
import EmptyState from '../ui/EmptyState';
import StatCard from '../ui/StatCard';
import MetricGrid from '../ui/MetricGrid';
import SignalBadge from '../ui/SignalBadge';
import { interactiveRowProps, ROW_INTERACTIVE } from '../ui/interactiveRow';

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
  Two rewrites are recorded here, because both were the same mistake in
  different clothes: showing something the desk could not know, and then
  showing what it did know badly.

  1. The closing-auction engine. Every structural decision on this board was a
     function of a modelled auction imbalance — which side got listed, how names
     ranked, a ±18-point grade adjustment, a per-strike "auction covers 1.4x"
     chip and an evidence panel reporting absorption and reversal risk to two
     decimals. Unpaired auction interest and the indicative price come from an
     exchange imbalance feed (Nasdaq NOII, NYSE Order Imbalances) and the
     confirmation term wanted futures. The product carries options, equities and
     index quotes, so every one of those numbers was a hash of the ticker
     wearing a sigma. It is gone.

  2. The grey table that replaced it. Cutting the auction left a correct board
     that read as a spreadsheet: eight columns of monochrome digits, no
     direction colour, no evidence, nothing a reader could scan. That was
     subtraction, not design.

  The board is now built in the same language as the Setups board next door —
  cards, a direction-tinted contract pill, a four-metric row, evidence chips and
  an amber invalidation line — because they answer the same shape of question
  and a reader should not have to learn two dialects inside one desk.

  Every number on it comes off `weighContract`: strike grid, mid, IV, greeks,
  theta and open interest are all first-party option data.
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
 * The ratio is division, not a model.
 */
const sigmaReach = (c: WeighedContract) => c.expectedMovePct / Math.max(Math.abs(c.breakevenMovePct), 0.05);

/**
 * The card's evidence chips, in the vocabulary `data/compass.ts` already uses
 * for the Setups board — same strings, same order of appearance, so a reader
 * moving between the two panes is reading one language.
 *
 * Every one is a fact about the contract the scorer already carries. Nothing
 * here is a new measurement.
 */
function lottoChips(c: WeighedContract, spot: number, onPin: boolean): string[] {
  const moneyPct = ((c.right === 'C' ? spot - c.strike : c.strike - spot) / spot) * 100;
  const chips = [
    moneyPct > 0.15 ? `ITM ${moneyPct.toFixed(1)}%` : moneyPct < -0.15 ? `OTM ${(-moneyPct).toFixed(1)}%` : 'AT THE MONEY',
  ];
  if (sigmaReach(c) >= 1) chips.push('1σ CLEARS BREAKEVEN');
  if (c.spreadPct <= 2) chips.push('TIGHT BOOK');
  else if (c.spreadPct >= 5) chips.push('WIDE BOOK');
  // A far-OTM lotto is all time value by construction, but not every strike on
  // the ladder is far out, so it is tested rather than assumed.
  const intrinsic = Math.max(0, c.right === 'C' ? spot - c.strike : c.strike - spot);
  if (intrinsic <= 0) chips.push('ALL TIME VALUE');
  if (onPin) chips.push('AT THE PIN');
  return chips;
}

/* ---- one lotto ticket, as a card ---- */
const LottoCard = ({
  c,
  rank,
  spot,
  pin,
  selected,
  onSelect,
}: {
  c: WeighedContract;
  rank: number;
  spot: number;
  pin: number;
  selected: boolean;
  onSelect: () => void;
}) => {
  const isCall = c.right === 'C';
  // Direction is the market's own language, so it stays green/red, and it rides
  // the contract pill only — exactly as SetupScanCard does it next door.
  const pillTone = isCall ? 'border-bull/50 bg-bull/20' : 'border-bear/50 bg-bear/20';
  const covers = sigmaReach(c);
  const onPin = c.strike === pin;
  const chips = lottoChips(c, spot, onPin);

  return (
    <div
      role="listitem"
      onClick={onSelect}
      className={`flex flex-col gap-2.5 rounded-md border px-3 py-2.5 transition-colors ${
        selected
          ? 'border-select/40 bg-select/[0.04]'
          : 'border-borderSubtle bg-panel hover:border-borderMuted hover:bg-rowHover'
      }`}
    >
      <div
        {...interactiveRowProps(onSelect, selected, 'button')}
        aria-label={`Chart ${c.ticker} ${c.strike} ${isCall ? 'call' : 'put'}, rank ${rank}, grades ${c.composite}`}
        className={`${ROW_INTERACTIVE} flex flex-col gap-2.5 rounded-sm`}
      >
        {/* Identity */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-micro text-textMuted tnum">#{rank}</span>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-label font-semibold ${pillTone}`}>
            <span className="text-textPrimary">
              {c.ticker} {c.strike}
              {c.right}
            </span>
          </span>
          <span className="inline-flex items-center rounded border border-borderSubtle bg-inset px-1.5 py-0.5 font-mono text-micro uppercase tracking-wider text-textSecondary tnum">
            {c.dte === 0 ? '0DTE' : `${c.dte}DTE`}
          </span>
        </div>

        {/* Standing. A fixed row rather than `ml-auto` on the identity line, so
            the metric grids of two cards side by side start on the same line
            however many characters the contract happens to have. */}
        <div className="flex items-center gap-2">
          {rank === 1 && <SignalBadge tone="magenta">Top ticket</SignalBadge>}
          <span className="ml-auto">
            <SignalBadge tone={VERDICT_TONE[GRADE_VERDICT[c.verdict]]} dot>
              {VERDICT_LABEL[GRADE_VERDICT[c.verdict]]}
            </SignalBadge>
          </span>
        </div>

        {/* The four this desk is read on. Reach leads, because it is the only
            one that answers the long-shot question; the rest price it. */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { k: preserveGreek('±1σ reach'), v: `${covers.toFixed(1)}x`, tone: covers >= 1 ? 'text-bull' : 'text-warn' },
            { k: 'Needs', v: `${Math.abs(c.breakevenMovePct).toFixed(2)}%`, tone: 'text-textPrimary' },
            { k: preserveGreek('θ/day'), v: `−${c.thetaPerDayPct.toFixed(0)}%`, tone: 'text-warn' },
            { k: 'Mid', v: `$${c.mid.toFixed(2)}`, tone: 'text-textPrimary' },
          ].map((m, i) => (
            <div key={i} className="min-w-0">
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted truncate">{m.k}</div>
              <div className={`font-mono text-caption font-semibold tnum leading-4 ${m.tone}`}>{m.v}</div>
            </div>
          ))}
        </div>

        {/* Evidence. Neutral, not directional — the direction is on the pill. */}
        <div className="flex flex-wrap gap-1">
          {chips.map(chip => (
            /* preserveGreek at the point of render, never in the list: it
               returns a node array for any string carrying lowercase Greek, and
               a node array makes a poor React key. */
            <SignalBadge key={chip} tone="neutral">
              {preserveGreek(chip)}
            </SignalBadge>
          ))}
        </div>
      </div>

      {/* What kills it. Not a model: a call is worth nothing below its strike at
          expiry and a put nothing above it, which on a same-session ticket is
          hours away. That is the desk's whole risk, stated per card. */}
      <div className="flex items-center gap-2 border-t border-borderSubtle pt-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-label text-warn tnum min-w-0 truncate">
          {onPin ? <Pin className="w-3 h-3 shrink-0" /> : <AlertTriangle className="w-3 h-3 shrink-0" />}
          Worthless {isCall ? 'below' : 'above'} ${c.strike} at expiry
        </span>
        <span className="ml-auto inline-flex items-center gap-1 font-mono text-label font-semibold uppercase tracking-wider text-textSecondary">
          Chart <ArrowUpRight className="w-3 h-3" />
        </span>
      </div>
    </div>
  );
};

/* ---- one side of the board ---- */
const SideBoard = ({
  right,
  rows,
  spot,
  pin,
  trackedId,
  onSelect,
}: {
  right: 'C' | 'P';
  rows: WeighedContract[];
  spot: number;
  pin: number;
  trackedId: string | null;
  onSelect: (id: string) => void;
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-baseline gap-2">
      <span
        className={`font-mono text-label font-semibold uppercase tracking-widest ${right === 'C' ? 'text-bull' : 'text-bear'}`}
      >
        {sideWord(right)}
      </span>
      <span className="font-mono text-micro text-textMuted">
        {rows.filter(c => c.verdict === 'BUY').length} of {rows.length} qualify
      </span>
    </div>
    {rows.length === 0 ? (
      <p className="font-mono text-label text-textMuted leading-relaxed">
        Every listed {sideWord(right).toLowerCase().slice(0, -1)} on this expiry sits at the model&apos;s $0.02 floor. There is no
        grade to give.
      </p>
    ) : (
      <div role="list" className="grid grid-cols-1 xl:grid-cols-2 gap-2">
        {rows.map((c, i) => (
          <LottoCard
            key={c.id}
            c={c}
            rank={i + 1}
            spot={spot}
            pin={pin}
            selected={c.id === trackedId}
            onSelect={() => onSelect(c.id)}
          />
        ))}
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

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const clock = useMemo(() => computeClock(nowTick), [nowTick]);

  /*
    Which expiry the board prices, from the calendar and nothing else.

    A 0DTE ladder on a closed market is a ladder of contracts that have already
    settled, so with the bell gone the board prices the next session. This used
    to fall out of the auction classification, which put a modelled imbalance in
    charge of which expiry a reader was looking at.
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
  */
  const gateArmed = lottoGateArmed(clock);
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

  const priceable = rankedCalls.length + rankedPuts.length;
  const reaching = [...rankedCalls, ...rankedPuts].filter(c => sigmaReach(c) >= 1).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Three cards, not five. `Priceable` and `Qualify` were both counts of
          the board directly below them, which a reader can see; only the reach
          count says something the cards do not already show at a glance.
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
          clock.marketOpen
            ? `${snapshot.ticker} · both sides, ranked within each side`
            : `${snapshot.ticker} · ${clock.label}, these price the next session`
        }
      >
        {!acked ? (
          /* A bar, not a curtain. This used to be eight rows of centred
             padding around one paragraph, so the panel it gated was a hole in
             the page even in the states where it had no business firing. */
          <div className="-mx-3.5 -mt-3 mb-3 px-3.5 py-3 flex items-start gap-3 flex-wrap border-b border-warn/20 bg-warn/[0.05]">
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
          <div className="flex flex-col gap-4">
            <SideBoard
              right="C"
              rows={rankedCalls}
              spot={snapshot.spot}
              pin={pin}
              trackedId={trackedTicket?.id ?? null}
              onSelect={setPickedTicket}
            />
            <SideBoard
              right="P"
              rows={rankedPuts}
              spot={snapshot.spot}
              pin={pin}
              trackedId={trackedTicket?.id ?? null}
              onSelect={setPickedTicket}
            />
          </div>
        )}
      </Panel>

      {/* What the ticket has been doing, and what an hour of standing still costs
          it. On a same-session lotto that second half IS the trade: the forward
          curve holds spot at the last close and lets only time run, which is the
          honest picture of a contract whose theta is measured per hour. */}
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
