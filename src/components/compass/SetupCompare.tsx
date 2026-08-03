import { useMemo, type ReactNode } from 'react';
import { AlertTriangle, ArrowUpRight, Bookmark, BookmarkCheck, Scale } from 'lucide-react';
import Panel from '../ui/Panel';
import SignalBadge from '../ui/SignalBadge';
import AnimatedNumber from '../ui/AnimatedNumber';
import DataTable, { type Column } from '../ui/DataTable';
import VerdictBadge from './VerdictBadge';
import { useTracker } from '../../context/TrackerContext';
import { expiryRead, horizonCopy } from './setupHorizon';
import { CONTRACT_MULTIPLIER } from './contractFacts';
import type { ScannerKey, Setup } from '../../types/compass';

interface SetupCompareProps {
  setup: Setup;
  /** The rest of the scan, so the pick can be read against what it beat. */
  peers: Setup[];
  /**
   * The underlying's price in the sweep that built this setup — SetupGroup.spot,
   * which is the same `name.spot` makeSetup priced and invalidated against. Zero
   * when the sweep has no row for the name, and then no distance is claimed.
   */
  spot: number;
  scanner: ScannerKey;
  onSelectPeer: (setup: Setup) => void;
  onStudy: () => void;
}

/**
 * The compare layer.
 *
 * Three panes used to print the same contract three times: an expandable row, a
 * card beside it, and full analysis. This one keeps only the job the other two
 * cannot do — what the contract costs, what it pays, what kills it, and how it
 * measures against the contracts it outranked.
 *
 * It used to say all of that in eight identical tiles, and the tiles were the
 * problem: "Session target $8.58" and "Breaks above $807.91" sat in the same
 * bordered rectangle at the same size in the same grey, and they are not the
 * same kind of number. One is the premium this contract might be worth; the
 * other is a price the underlying has to hold. A layout that renders dollars of
 * option and dollars of stock identically is asking the reader to already know
 * which is which.
 *
 * So the pane is three blocks now, each stating its own unit in the header, and
 * each block is rows rather than tiles — the same label-left / value-right
 * idiom the Read panel uses, so the desk says this once instead of twice.
 */

/** One fact: name on the left, figure on the right, the sentence underneath. */
const Row = ({
  label,
  value,
  note,
  tone = 'text-textPrimary',
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: string;
}) => (
  <div className="flex items-baseline justify-between gap-3 py-2 first:pt-0">
    <span className="font-mono text-micro uppercase tracking-widest text-textMuted shrink-0">{label}</span>
    <span className="min-w-0 text-right">
      <span className={`block font-mono text-caption font-semibold tnum leading-4 ${tone}`}>{value}</span>
      {note && <span className="block font-mono text-micro text-textMuted leading-snug">{note}</span>}
    </span>
  </div>
);

/** A block heading that names the block's unit, because two of them differ. */
const Head = ({ children, unit }: { children: ReactNode; unit: string }) => (
  <div className="flex items-baseline justify-between gap-2">
    <span className="font-mono text-micro font-semibold uppercase tracking-widest text-textSecondary">{children}</span>
    <span className="font-mono text-micro uppercase tracking-wider text-textMuted">{unit}</span>
  </div>
);

const SetupCompare = ({ setup, peers, spot, scanner, onSelectPeer, onStudy }: SetupCompareProps) => {
  const { trackSetup, untrackSetup, isTracked } = useTracker();
  const tracked = isTracked(setup.id);
  const exp = expiryRead(setup.expiry);
  const horizon = horizonCopy(exp.bucketDte);
  const spreadPct = setup.mid > 0 ? ((setup.ask - setup.bid) / setup.mid) * 100 : 0;
  const crossCost = (setup.ask - setup.bid) * CONTRACT_MULTIPLIER;

  /* The invalidation is a price on the UNDERLYING, so it only means anything
     next to where the underlying is — and it has to be the SAME spot the engine
     invalidated against, not merely a recent one. It arrives as a prop, off the
     sweep's own group, because both ways of fetching it here are wrong:

     Simulator.getCandles(ticker) is a different number — measured on LIN it
     read $454.50 against a scan spot near $439, and the pane printed "breaks
     above $445.81, 1.9% below the $454.50 spot", a sentence that contradicts
     itself in eleven words.

     scanNameFor(ticker) looks right and is worse, because reading it is not
     free: getCandles calls ensureTicker, so the first component to ask the
     simulator about a name MATERIALISES it, and from then on scanNameFor
     returns the simulator's price instead of the synthetic walk it returned a
     moment earlier. Measured on REGN inside one sweep: 1073.50, then 1041.52.
     A pane that changes the scanner's own inputs by rendering is not a pane. */
  const invalidationGapPct = spot > 0 ? ((setup.invalidationPrice - spot) / spot) * 100 : null;

  /* The two exit rungs, tallest first, drawn against the mid they are measured
     from. The tiles gave both the same width and so hid the one thing the pair
     is for: how much further the target is than the exit. */
  const rungs = useMemo(
    () =>
      [
        { label: horizon.target, level: setup.swingTarget },
        { label: horizon.exit, level: setup.scalpExit },
      ].sort((a, b) => b.level.pct - a.level.pct),
    [horizon.target, horizon.exit, setup.swingTarget, setup.scalpExit]
  );
  const topPct = Math.max(...rungs.map(r => r.level.pct), 1);

  /* The pick sits inside its own comparison rather than above it — a rank means
     nothing until you can see the row it beat. Same underlying first, because
     that is the comparison a trader is actually making (which strike, which
     side); the field only tops it up when the name has nothing else in the
     scan. Ranking against seven other names that all scored 99 tells nobody
     anything. */
  const { field, fieldLabel } = useMemo(() => {
    const rest = peers.filter(p => p.id !== setup.id);
    const sameName = rest.filter(p => p.ticker === setup.ticker);
    const filler = sameName.length >= 3 ? [] : rest.filter(p => p.ticker !== setup.ticker).slice(0, 6 - sameName.length);
    return {
      field: [setup, ...sameName, ...filler].sort((a, b) => b.score - a.score).slice(0, 7),
      fieldLabel: sameName.length >= 3 ? `Other ${setup.ticker} contracts in this scan` : 'Nearest ranked in this scan',
    };
  }, [setup, peers]);

  const columns: Column<Setup>[] = useMemo(
    () => [
      {
        key: 'contract',
        header: 'Contract',
        sortValue: s => s.strike,
        render: s => (
          <span className="inline-flex items-center gap-2">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.right === 'C' ? 'bg-bull' : 'bg-bear'}`} />
            <span className={s.id === setup.id ? 'text-select font-semibold' : 'text-textPrimary font-semibold'}>
              {s.contract}
            </span>
            {s.id === setup.id && <SignalBadge tone="select">Yours</SignalBadge>}
          </span>
        ),
      },
      {
        key: 'expiry',
        header: 'Exp',
        help: 'DTE',
        sortValue: s => expiryRead(s.expiry).dte,
        render: s => <span className="text-textSecondary">{expiryRead(s.expiry).chip}</span>,
      },
      {
        key: 'score',
        header: 'Score',
        align: 'right',
        sortValue: s => s.score,
        render: s => <span className="text-textPrimary font-semibold">{s.score}</span>,
      },
      {
        key: 'mid',
        header: 'Mid',
        align: 'right',
        sortValue: s => s.mid,
        render: s => <span className="text-textSecondary">${s.mid.toFixed(2)}</span>,
      },
      {
        key: 'move',
        header: '1σ Move',
        align: 'right',
        sortValue: s => s.expectedMovePct,
        render: s => <span className="text-textSecondary">±{s.expectedMovePct}%</span>,
      },
    ],
    [setup.id]
  );

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-1.5 font-mono text-base font-bold text-textPrimary tracking-tight">
          <Scale className="w-3.5 h-3.5 shrink-0" /> {setup.contract}
        </span>
      }
      subtitle={exp.sentence}
      className="w-full"
      actions={
        <button
          onClick={() => (tracked ? untrackSetup(setup.id) : trackSetup(setup, scanner))}
          aria-label={tracked ? `Untrack ${setup.contract}` : `Track ${setup.contract}`}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-mono text-label font-semibold uppercase tracking-wider transition-colors ${
            tracked
              ? 'border-select/40 bg-select/[0.08] text-select'
              : 'border-borderSubtle text-textSecondary hover:text-textPrimary hover:border-borderMuted'
          }`}
        >
          {tracked ? <BookmarkCheck className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
          {tracked ? 'Tracked' : 'Track'}
        </button>
      }
    >
      <div key={setup.id} className="flex flex-col gap-3.5 animate-soft-in">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-4xl font-bold text-textPrimary tnum leading-none">
            <AnimatedNumber value={setup.score} format={v => Math.round(v).toString()} />
          </span>
          <VerdictBadge verdict={setup.verdict} dot />
          <span className="ml-auto font-mono text-label text-textMuted tnum">
            IV {setup.greeks.iv}% · Δ {setup.greeks.delta.toFixed(2)}
          </span>
        </div>

        {/* WHAT IT COSTS.

            There is no "Live mid" here. `Setup.liveMid` is `mid * (0.9 + rng()
            * 0.2)` — one seeded draw, fixed per contract, so it never moves and
            was never a second quote; printing it beside the real mid put a
            made-up price where a trader reads the market. The bid and ask that
            replace it are the book this pane's own spread is computed from, so
            the numbers reconcile. */}
        <div className="flex flex-col gap-1 border-t border-borderSubtle pt-2.5">
          <Head unit="per contract">What it costs</Head>
          <div className="flex flex-col divide-y divide-borderSubtle">
            <Row
              label="Cost"
              value={`$${(setup.mid * CONTRACT_MULTIPLIER).toFixed(0)}`}
              note={`${CONTRACT_MULTIPLIER} shares' worth at the $${setup.mid.toFixed(2)} mid`}
            />
            <Row
              label="Book"
              value={`$${setup.bid.toFixed(2)} / $${setup.ask.toFixed(2)}`}
              note={`${spreadPct.toFixed(1)}% wide · $${crossCost.toFixed(0)} to cross · ${setup.liquidityLabel.toLowerCase()} book`}
            />
            <Row
              label="1σ move"
              value={`±${setup.expectedMovePct}%`}
              note={`what the option market prices ${setup.ticker} to travel by expiry`}
            />
            {/* Health is moneyness on a 0-100 scale — data/compass.ts healthFor
                reads nothing but the strike against spot. Saying so is the
                difference between a number and a mystery. */}
            <Row
              label="Health"
              value={`${setup.health}/100`}
              note="50 is at the money · higher is deeper in the money"
            />
          </div>
        </div>

        {/* WHAT IT PAYS — premium, and the bars are what the tiles could not
            say: the target is not a little further than the exit, it is twice
            as far. Green because this is money made, which is the one thing
            bull ink is for. */}
        <div className="flex flex-col gap-2 border-t border-borderSubtle pt-2.5">
          <Head unit="premium">What it pays</Head>
          <div className="flex flex-col gap-1.5">
            {rungs.map((r, i) => (
              <div key={r.label} className="flex items-center gap-2.5">
                <span className="font-mono text-micro uppercase tracking-widest text-textMuted min-w-0 flex-1 truncate">
                  {r.label}
                </span>
                {/* A fixed track, not a full-bleed bar. Stretched to the row the
                    longer rung always filled it edge to edge and read as a rule
                    under the text; against a track with a visible remainder the
                    shorter rung can be seen to be half the distance, which is
                    the only thing the pair is worth drawing for. */}
                <span
                  className="block h-1 w-24 shrink-0 rounded-full bg-white/[0.06] overflow-hidden"
                  title={`${r.level.pct}% of the ${topPct}% furthest rung`}
                >
                  <span
                    className="block h-full rounded-full bg-bull"
                    style={{ width: `${(r.level.pct / topPct) * 100}%`, opacity: i === 0 ? 0.85 : 0.55 }}
                  />
                </span>
                <span className="shrink-0 w-[104px] text-right font-mono text-caption font-semibold text-textPrimary tnum leading-4">
                  ${r.level.price.toFixed(2)}
                  <span className="ml-2 text-bull">+{r.level.pct}%</span>
                </span>
              </div>
            ))}
          </div>
          <span className="font-mono text-micro text-textMuted leading-snug">
            Both measured from the ${setup.mid.toFixed(2)} mid · {horizon.hold.toLowerCase()}
          </span>
        </div>

        {/* WHAT KILLS IT — the underlying. Different scale, different block, and
            the gap spelled out, because $807.91 beside a $6.22 premium is only
            legible if you already knew which one was the stock. */}
        <div className="flex flex-col gap-1.5 border-t border-borderSubtle pt-2.5">
          <Head unit="underlying">What kills it</Head>
          <div className="flex items-start gap-2 border border-warn/20 bg-warn/[0.05] rounded-md px-3 py-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" />
            <p className="font-mono text-label text-textSecondary leading-relaxed">
              <span className="text-warn font-semibold uppercase tracking-wider">Breaks </span>
              {setup.right === 'C' ? 'below' : 'above'}{' '}
              <span className="text-warn font-semibold tnum">${setup.invalidationPrice.toFixed(2)}</span>
              {invalidationGapPct !== null && (
                <>
                  , {Math.abs(invalidationGapPct).toFixed(1)}% {invalidationGapPct >= 0 ? 'above' : 'below'} the{' '}
                  <span className="tnum">${spot.toFixed(2)}</span> spot
                </>
              )}
              , at the {setup.invalidationReason.toLowerCase()}
            </p>
          </div>
        </div>

        {field.length > 1 && (
          <div className="flex flex-col gap-1.5 border-t border-borderSubtle pt-2.5">
            <Head unit={`${field.length} contracts`}>{fieldLabel}</Head>
            <div className="border border-borderSubtle rounded-md overflow-hidden">
              <DataTable
                columns={columns}
                rows={field}
                rowKey={s => s.id}
                onRowClick={onSelectPeer}
                selectedKey={setup.id}
                maxHeight="240px"
              />
            </div>
          </div>
        )}

        <button
          onClick={onStudy}
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-md border border-borderSubtle bg-white/[0.03] hover:bg-rowHover text-textPrimary text-caption font-semibold font-mono uppercase tracking-wider transition-colors leading-4"
        >
          Open full analysis <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </Panel>
  );
};

export default SetupCompare;
