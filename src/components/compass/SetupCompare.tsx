import { useMemo } from 'react';
import { AlertTriangle, ArrowUpRight, Bookmark, BookmarkCheck, Scale } from 'lucide-react';
import Panel from '../ui/Panel';
import Stat from '../ui/Stat';
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
 * measures against the contracts it outranked. The story, the greeks, the live
 * confidence meter and the take-profit ladder stay in full analysis, which is
 * where a trader goes to watch one position rather than choose between several.
 *
 * The frame is the Weigher's: a title carrying the expiry, a composite headline
 * number, a Stat grid, then a comparison table.
 */
const SetupCompare = ({ setup, peers, scanner, onSelectPeer, onStudy }: SetupCompareProps) => {
  const { trackSetup, untrackSetup, isTracked } = useTracker();
  const tracked = isTracked(setup.id);
  const exp = expiryRead(setup.expiry);
  const horizon = horizonCopy(exp.bucketDte);
  const spreadPct = setup.mid > 0 ? ((setup.ask - setup.bid) / setup.mid) * 100 : 0;

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
      <div key={setup.id} className="flex flex-col gap-4 animate-soft-in">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-4xl font-bold text-textPrimary tnum leading-none">
            <AnimatedNumber value={setup.score} format={v => Math.round(v).toString()} />
          </span>
          <VerdictBadge verdict={setup.verdict} dot />
          <span className="ml-auto font-mono text-label text-textMuted tnum">
            IV {setup.greeks.iv}% · Δ {setup.greeks.delta.toFixed(2)}
          </span>
        </div>

        {/* What it costs and what it pays.

            There is no "Live mid" here any more. `Setup.liveMid` is
            `mid * (0.9 + rng() * 0.2)` — one seeded draw, fixed per contract, so
            it never moves and was never a second quote; printing it beside the
            real mid put a made-up price where a trader reads the market. The
            bid/ask that replaces it is the book this panel's own spread figure
            is computed from, so the three numbers now reconcile. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Stat label="Mid" value={`$${setup.mid.toFixed(2)}`} />
          <Stat label="Bid / Ask" value={`$${setup.bid.toFixed(2)} / $${setup.ask.toFixed(2)}`} />
          <Stat label="Spread" value={`${spreadPct.toFixed(1)}%`} sub={`${setup.liquidityLabel} book`} />
          <Stat label="Cost / contract" value={`$${(setup.mid * CONTRACT_MULTIPLIER).toFixed(0)}`} />
          <Stat label="1σ move" value={`±${setup.expectedMovePct}%`} />
          <Stat label="Health" value={`${setup.health}/100`} />
        </div>

        {/* Exit levels, named by the horizon that is actually on the contract.
            These two are aggressiveness tiers in the engine, so calling either
            of them a "swing" on a same-session contract was never true. */}
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label={horizon.target}
            value={`$${setup.swingTarget.price.toFixed(2)}`}
            sub={`+${setup.swingTarget.pct}% · ${horizon.hold}`}
          />
          <Stat label={horizon.exit} value={`$${setup.scalpExit.price.toFixed(2)}`} tone="warn" sub={`+${setup.scalpExit.pct}%`} />
        </div>

        <div className="flex items-start gap-2 border border-warn/20 bg-warn/[0.05] rounded-md px-3 py-2.5">
          <AlertTriangle className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" />
          <p className="font-mono text-label text-textSecondary leading-relaxed">
            <span className="text-warn font-semibold uppercase tracking-wider">Breaks </span>
            {setup.right === 'C' ? 'below' : 'above'}{' '}
            <span className="text-warn font-semibold tnum">${setup.invalidationPrice.toFixed(2)}</span>, at the{' '}
            {setup.invalidationReason.toLowerCase()}
          </p>
        </div>

        {field.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-micro uppercase tracking-widest text-textMuted">{fieldLabel}</span>
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
