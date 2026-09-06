/*
==================================================
  SLAYER TERMINAL - TRACKER PAGE
  Dedicated page for all bookmarked setups.
  Live-updating metrics, two view tabs, and
  quick actions to untrack or review in Compass.
==================================================
*/

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, Trash2, ArrowUpRight } from 'lucide-react';
import { useTracker } from '../context/TrackerContext';
import { useMarketData } from '../context/MarketDataContext';
import Simulator from '../core/simulator';
import { makeSetup } from '../data/compass';
import type { Setup, SleeveKey } from '../types/compass';
import type { TrackedSetup } from '../types/tracker';
import { DTE_BY_SLEEVE, expiresAt, isExpired, labelRead, sleeveOf } from '../data/labelMaturity';
import PageHeader from '../components/ui/PageHeader';
import SegmentedControl from '../components/ui/SegmentedControl';
import Panel from '../components/ui/Panel';
import SignalBadge from '../components/ui/SignalBadge';
import VerdictBadge from '../components/compass/VerdictBadge';
import DataTable, { type Column } from '../components/ui/DataTable';

const TAB_OPTIONS = [
  { value: 'setups', label: 'Tracked Setups' },
  { value: 'contracts', label: 'Tracked Contracts' },
] as const;

type TabKey = (typeof TAB_OPTIONS)[number]['value'];

/* THE CLOCK MOVED TO data/labelMaturity (2026-09-06). The Prove It
   scoreboard grades the same rows, and a second copy of "when does this
   claim close" is how two boards end up disagreeing about whether a call
   has matured. `DTE_BY_SLEEVE`, `sleeveOf`, `expiresAt` and `isExpired` are
   imported from the module that owns the maturity rule. */

/**
 * WHEN THIS CONTRACT DIES — one function, so the date shown and the state
 * shown cannot disagree.
 *
 * The card printed `trackedAt` under the words "this contract expired", and
 * `trackedAt` is when the READER BOOKMARKED IT. For a 0DTE that is off by a
 * day and looks right; for a LEAPS it is off by a year, stated as a fact,
 * in the one sentence whose whole job is to say when something ended.
 *
 * Null for a swing, which never date-expires — the floor is its clock, and
 * a date on it would be an invention.
 */
/** Rebuild a tracked setup's live data from the simulator. */
function rebuildLive(tracked: TrackedSetup): Setup {
  Simulator.ensureTicker(tracked.ticker);
  const cfg = Simulator.TICKERS[tracked.ticker];
  return makeSetup(
    tracked.ticker,
    cfg.currentPrice,
    tracked.strike,
    tracked.right,
    tracked.scanner,
    cfg.iv,
    sleeveOf(tracked)
  );
}

// ---- Label maturity (Part 3) ------------------------------------------------

/* A tracked verdict is a CLAIM until its window closes; then it is a grade.
   PENDING while the claim can still come true; MATURED once it has been
   held against what happened. See data/labelMaturity. */
const readOf = (tracked: TrackedSetup, live: Setup, expired: boolean) =>
  labelRead(tracked.verdictAtTrack, live, expired, expiresAt(tracked) !== null);

const MaturityChip = ({ tracked, live, expired }: { tracked: TrackedSetup; live: Setup; expired: boolean }) => {
  const r = readOf(tracked, live, expired);
  const tone = r.maturity === 'pending' ? 'neutral' : r.heldUp === null ? 'neutral' : r.heldUp ? 'bull' : 'bear';
  return (
    <span title={r.note} data-label-maturity={r.maturity}>
      <SignalBadge tone={tone}>{r.chip}</SignalBadge>
    </span>
  );
};

const MaturityLine = ({ tracked, live, expired }: { tracked: TrackedSetup; live: Setup; expired: boolean }) => {
  const r = readOf(tracked, live, expired);
  return (
    <p className="px-4 py-2 border-b border-borderSubtle text-[11px] text-textMuted leading-snug">
      <span className="font-mono text-[9px] uppercase tracking-widest text-textSecondary mr-2">Label</span>
      {r.note}
    </p>
  );
};

// ---- Tracked Setup Card (grid view) ----------------------------------------

interface TrackedCardProps {
  tracked: TrackedSetup;
  live: Setup;
  expired: boolean;
  onUntrack: () => void;
  onReview: () => void;
}

const TrackedCard = ({ tracked, live, expired, onUntrack, onReview }: TrackedCardProps) => {
  const moveUp = live.expectedMovePct >= 0;

  return (
    <div className="border border-borderSubtle bg-panel rounded-lg overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-borderSubtle">
        <span className="font-mono text-sm font-bold text-textPrimary tracking-tight">{live.contract}</span>
        {expired ? <SignalBadge tone="bear">EXPIRED</SignalBadge> : <VerdictBadge verdict={live.verdict} dot />}
        <MaturityChip tracked={tracked} live={live} expired={expired} />
        <span className="ml-auto font-mono text-[9px] text-textMuted uppercase tracking-wider">
          Tracked {new Date(tracked.trackedAt).toLocaleDateString()}
        </span>
      </div>
      {/* Part 3 — the label's own line: what it SAID, and whether that can
          still change. The live state above is today's weather; this is the
          claim on record. */}
      <MaturityLine tracked={tracked} live={live} expired={expired} />

      {/* Live metrics grid — the score cell is gone: grades are
          engine-internal (Noah, 2026-08-16) */}
      <div className={`grid grid-cols-2 gap-px bg-borderSubtle/30 ${expired ? 'opacity-50' : ''}`}>
        <div className="bg-panel px-3 py-2.5">
          <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Premium</div>
          <div className="mt-0.5 font-mono text-sm font-semibold text-textPrimary tnum">${live.mid.toFixed(2)}</div>
        </div>
        <div className="bg-panel px-3 py-2.5">
          <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Exp. Move</div>
          <div className={`mt-0.5 font-mono text-sm font-semibold tnum ${moveUp ? 'text-bull' : 'text-bear'}`}>
            {moveUp ? '+' : ''}{live.expectedMovePct}%
          </div>
        </div>
      </div>

      {/* Confidence bar — or the expiry notice once the contract is dead */}
      {expired ? (
        <div className="px-4 py-2.5">
          <span className="font-mono text-[10px] text-textSecondary">
            This contract expired{' '}
            {(() => {
              const at = expiresAt(tracked);
              /* The EXPIRY, from the same function that decided this card
                 is expired — not the date the reader bookmarked it. */
              return at === null ? '' : new Date(at).toLocaleDateString();
            })()}{' '}
            — tracking ended. Bookmarked {new Date(tracked.trackedAt).toLocaleDateString()}.
          </span>
        </div>
      ) : (
        <div className="px-4 py-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted flex items-center gap-1.5">
              Confidence <SignalBadge tone="select" dot pulse>Live</SignalBadge>
            </span>
            <span className="font-mono text-[10px] font-semibold text-textPrimary tnum">{live.confidence}%</span>
          </div>
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <span className="block h-full rounded-full bg-bull/95 transition-all duration-500" style={{ width: `${live.confidence}%` }} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 mt-auto border-t border-borderSubtle">
        {expired ? (
          <span
            title="Expired contracts have no live setup to review"
            className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-borderSubtle bg-white/[0.02] font-mono text-[10px] text-textMuted uppercase tracking-wider cursor-not-allowed select-none"
          >
            Expired
          </span>
        ) : (
          <button
            onClick={onReview}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-borderSubtle bg-white/[0.03] hover:bg-white/[0.06] font-mono text-[10px] text-textSecondary hover:text-textPrimary uppercase tracking-wider transition-colors"
          >
            <ArrowUpRight className="w-3 h-3" /> Review
          </button>
        )}
        <button
          onClick={onUntrack}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-bear/20 bg-bear/5 hover:bg-bear/10 font-mono text-[10px] text-bear uppercase tracking-wider transition-colors ml-auto"
        >
          <Trash2 className="w-3 h-3" /> Untrack
        </button>
      </div>
    </div>
  );
};

// ---- Table columns for "Tracked Contracts" tab -----------------------------

const TABLE_COLUMNS: Column<{ tracked: TrackedSetup; live: Setup; expired: boolean }>[] = [
  {
    key: 'contract',
    header: 'Contract',
    render: r => <span className="font-semibold text-textPrimary">{r.live.contract}</span>,
  },
  {
    key: 'verdict',
    header: 'Verdict',
    render: r => (
      <span className="inline-flex items-center gap-1.5">
        {r.expired ? <SignalBadge tone="bear">EXPIRED</SignalBadge> : <VerdictBadge verdict={r.live.verdict} />}
        <MaturityChip tracked={r.tracked} live={r.live} expired={r.expired} />
      </span>
    ),
  },
  {
    key: 'premium',
    header: 'Premium',
    align: 'right',
    sortValue: r => r.live.mid,
    render: r => <span className="text-textPrimary tnum">${r.live.mid.toFixed(2)}</span>,
  },
  {
    key: 'confidence',
    header: 'Confidence',
    align: 'right',
    sortValue: r => r.live.confidence,
    render: r => <span className="text-textPrimary tnum">{r.live.confidence}%</span>,
  },
  {
    key: 'expMove',
    header: 'Exp. Move',
    align: 'right',
    sortValue: r => r.live.expectedMovePct,
    render: r => {
      const up = r.live.expectedMovePct >= 0;
      return (
        <span className={`tnum ${up ? 'text-bull' : 'text-bear'}`}>
          {up ? '+' : ''}{r.live.expectedMovePct}%
        </span>
      );
    },
  },
  {
    key: 'tracked',
    header: 'Tracked',
    render: r => (
      <span className="text-textMuted">
        {new Date(r.tracked.trackedAt).toLocaleDateString()}
      </span>
    ),
  },
];

type SortKey = 'newest' | 'oldest' | 'confidence' | 'moved' | 'ticker';

const SORT_LABEL: Record<SortKey, string> = {
  newest: 'newest',
  oldest: 'oldest',
  confidence: 'confidence',
  moved: 'moved most',
  ticker: 'ticker',
};

const SORT_NOTE: Record<SortKey, string> = {
  newest: 'Most recently bookmarked first.',
  oldest: 'Longest-held first — the ones that have had time to be right or wrong.',
  confidence: "The engine's current read, strongest first. Says nothing about what it read when you tracked it.",
  moved: 'Biggest change from the score this setup carried when you tracked it — up or down. The column that answers "has this held up".',
  ticker: 'Alphabetical, for a list you are scanning rather than ranking.',
};

// ---- Main Page Component ---------------------------------------------------

const Tracker = () => {
  const navigate = useNavigate();
  const { trackedSetups, untrackSetup } = useTracker();
  const { marketData } = useMarketData();
  const [tab, setTab] = useState<TabKey>('setups');
  const [sort, setSort] = useState<SortKey>('newest');

  // Rebuild all tracked setups with live data
  const liveData = useMemo(() => {
    if (!marketData) return [];
    const rows = trackedSetups.map(tracked => ({
      tracked,
      live: rebuildLive(tracked),
      expired: isExpired(tracked),
    }));
    /* 11 — SORT, AND DEAD CARDS SINK IN EVERY ORDER.

       An expired contract has no live confidence and no future, so leaving
       it interleaved by score puts a dead card above a live one and makes
       the reader check each badge to find what they can still act on.
       Whatever the chosen order, expired rows go last — the sort decides
       the arrangement of things that still matter. */
    const by: Record<SortKey, (a: typeof rows[number], b: typeof rows[number]) => number> = {
      newest: (a, b) => b.tracked.trackedAt - a.tracked.trackedAt,
      oldest: (a, b) => a.tracked.trackedAt - b.tracked.trackedAt,
      confidence: (a, b) => b.live.confidence - a.live.confidence,
      /* Against the score it carried when it was TRACKED — the reader's
         question here is "has this held up", which a live score alone
         cannot answer. */
      moved: (a, b) =>
        (b.live.score - b.tracked.scoreAtTrack) - (a.live.score - a.tracked.scoreAtTrack),
      ticker: (a, b) => a.tracked.ticker.localeCompare(b.tracked.ticker),
    };
    return rows.sort((a, b) => (a.expired === b.expired ? by[sort](a, b) : a.expired ? 1 : -1));
  }, [trackedSetups, marketData, sort]);

  // Straight into review mode on this exact setup — not the browse feed
  const handleReview = (tracked: TrackedSetup) => {
    navigate('/compass', {
      state: {
        monitor: {
          ticker: tracked.ticker,
          strike: tracked.strike,
          right: tracked.right,
          scanner: tracked.scanner,
        },
      },
    });
  };

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Tracker']}
        title="Setup Tracker"
        subtitle="Bookmarked setups with live-updating metrics — monitor your watchlist"
      />

      {/* Tabs */}
      <div className="flex items-center gap-3">
        <SegmentedControl
          ariaLabel="Tracker view"
          options={TAB_OPTIONS}
          value={tab}
          onChange={setTab}
        />
        <span className="font-mono text-[10px] text-textMuted uppercase tracking-wider">
          {trackedSetups.length} tracked
          {liveData.some(r => r.expired) && (
            <span className="ml-1.5 text-textMuted/70">
              · {liveData.filter(r => r.expired).length} expired
            </span>
          )}
        </span>
        {/* 11 — SORT. Kept to the right of the count so the reader's eye
            passes the number before the control that reorders it. */}
        {trackedSetups.length > 1 && (
          <span className="ml-auto inline-flex items-center gap-1 rounded border border-borderSubtle p-0.5" role="group" aria-label="Sort tracked setups">
            {(Object.keys(SORT_LABEL) as SortKey[]).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                aria-pressed={sort === k}
                title={SORT_NOTE[k]}
                className={`rounded px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-colors ${
                  sort === k ? 'bg-white/[0.08] text-textPrimary' : 'text-textMuted hover:text-textSecondary'
                }`}
              >
                {SORT_LABEL[k]}
              </button>
            ))}
          </span>
        )}
      </div>

      {/* Empty state */}
      {trackedSetups.length === 0 ? (
        <Panel className="w-full" bodyClassName="flex flex-col items-center justify-center py-16 gap-4">
          <Bookmark className="w-10 h-10 text-textMuted/40" />
          <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">
            No tracked setups yet
          </span>
          <p className="text-[12px] text-textSecondary text-center max-w-sm leading-relaxed">
            Go to{' '}
            <button
              onClick={() => navigate('/compass')}
              className="text-select hover:underline"
            >
              Compass
            </button>
            , pick a setup, and click <strong className="text-textPrimary">Track Setup +</strong> to bookmark it here.
          </p>
        </Panel>
      ) : tab === 'setups' ? (
        /* ---- Grid of tracked setup cards ---- */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-view-in">
          {liveData.map(({ tracked, live, expired }) => (
            <TrackedCard
              key={tracked.id}
              tracked={tracked}
              live={live}
              expired={expired}
              onUntrack={() => untrackSetup(tracked.id)}
              onReview={() => handleReview(tracked)}
            />
          ))}
        </div>
      ) : (
        /* ---- Table view of tracked contracts ---- */
        <Panel title="Tracked Contracts" flush className="w-full animate-view-in">
          <DataTable
            columns={TABLE_COLUMNS}
            rows={liveData}
            rowKey={r => r.tracked.id}
            maxHeight="520px"
          />
        </Panel>
      )}
    </>
  );
};

export default Tracker;
