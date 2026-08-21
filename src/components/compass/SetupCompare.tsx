import { useMemo, type ReactNode } from 'react';
import { ArrowUpRight, Bookmark, BookmarkCheck, Scale } from 'lucide-react';
import Panel from '../ui/Panel';
import SignalBadge from '../ui/SignalBadge';
import DataTable, { type Column } from '../ui/DataTable';
import VerdictBadge from './VerdictBadge';
import { useTracker } from '../../context/TrackerContext';
import { expiryRead } from './setupHorizon';
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

/*
  Rows sit several across, not one per line.

  Stacked, each Row is as wide as the pane, and the pane is seven of twelve
  columns — 1400px at 2560, which put "Cost" 762px from what it costs on four
  rows in a row. A label and its figure are one fact; a monitor should not be
  able to pull them apart.

  `auto-fill` at an 18rem floor keeps one fact per line on a phone and fits
  three or four across a wide pane, so every label stays against its own number.

/*
  A block heading that names the block's unit, because two of them differ.

  The unit used to be pushed to the far edge with justify-between, which put it
  865px from the words it qualifies once the pane grew — "What it costs" at one
  end of the panel and "per contract" at the other, reading as two unrelated
  labels. A qualifier belongs against what it qualifies, so it now trails the
  heading on a middot, which is the separator the rest of Compass already uses.
*/
const Head = ({ children, unit }: { children: ReactNode; unit: string }) => (
  <div className="flex items-baseline gap-1.5">
    <span className="font-mono text-micro font-semibold uppercase tracking-widest text-textSecondary">{children}</span>
    <span aria-hidden className="font-mono text-micro text-textMuted">·</span>
    <span className="font-mono text-micro uppercase tracking-wider text-textMuted">{unit}</span>
  </div>
);

const SetupCompare = ({ setup, peers, scanner, onSelectPeer, onStudy }: SetupCompareProps) => {
  const { trackSetup, untrackSetup, isTracked } = useTracker();
  const tracked = isTracked(setup.id);
  const exp = expiryRead(setup.expiry);

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

  /* The two exit rungs, tallest first, drawn against the mid they are measured
     from. The tiles gave both the same width and so hid the one thing the pair
     is for: how much further the target is than the exit. */

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
        /* The read, not the grade. `setup.score` is a 0-100 figure with nothing
           measured behind its weights; the verdict is the same read at a
           precision three coarse bands can carry. The sort still runs on the
           number, because a board ordered by a tag alone collapses every
           QUALIFIED into one indistinguishable block — and a hidden ordering key
           is a far weaker claim than a printed grade. */
        key: 'score',
        header: 'Read',
        align: 'right',
        sortValue: s => s.score,
        render: s => <VerdictBadge verdict={s.verdict} />,
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
        <span className="inline-flex items-center gap-1.5 font-mono text-lead leading-6 font-bold text-textPrimary tracking-tight">
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
        {/* The verdict leads, and there is no number beside it — the same cut
            the Weigher's grade got, for the same reason. `setup.score` was a
            0-100 figure at 36px with nothing measured behind its weights. */}
        <div className="flex items-center gap-3 flex-wrap">
          <VerdictBadge verdict={setup.verdict} dot />
          <span className="ml-auto font-mono text-label text-textMuted tnum">
            IV {setup.greeks.iv}% · Δ {setup.greeks.delta.toFixed(2)}
          </span>
        </div>

        {/* The dossier moved to Analysis.

            Three blocks stood here — what it costs, what it pays, what kills it
            — a full read of one contract on a page whose job is to rank a field
            of them. Every figure in them is already on the analysis view, which
            is one click away through the button at the bottom of this pane and
            through the Analysis control on every card in the list beside it.

            What is left is what a list page is for: which contract this is, how
            it reads, and the others in the scan to weigh it against. */}

        {field.length > 1 && (
          <div className="flex flex-col gap-1.5 border-t border-borderSubtle pt-2.5">
            <Head unit={`${field.length} contracts`}>{fieldLabel}</Head>
            <div className="border-t border-borderSubtle overflow-hidden">
              <DataTable
                columns={columns}
                rows={field}
                rowKey={s => s.id}
                onRowClick={onSelectPeer}
                selectedKey={setup.id}
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
