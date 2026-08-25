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
import Feed from '../core/feed';
import { makeSetup } from '../data/compass';
import type { Setup, SleeveKey } from '../types/compass';
import type { TrackedSetup } from '../types/tracker';
import PageHeader from '../components/ui/PageHeader';
import SegmentedControl from '../components/ui/SegmentedControl';
import Panel from '../components/ui/Panel';
import SignalBadge from '../components/ui/SignalBadge';
import VerdictBadge from '../components/compass/VerdictBadge';
import DataTable, { type Column } from '../components/ui/DataTable';
import { etMonthDay } from '../core/etFormat';

const TAB_OPTIONS = [
  { value: 'setups', label: 'Tracked Setups' },
  { value: 'contracts', label: 'Tracked Contracts' },
] as const;

type TabKey = (typeof TAB_OPTIONS)[number]['value'];

/** Days-to-expiry per SLEEVE — the tenor owns the clock now (2026-08-04).
    Swings carry no calendar at all: they retire on level break, never a date. */
const DTE_BY_SLEEVE: Record<SleeveKey, number> = {
  odte: 0,
  weekly: 5,
  swing: Number.POSITIVE_INFINITY,
  leaps: 365,
};

/** Rows tracked before the sleeve axis carry no sleeve — treat as same-day. */
const sleeveOf = (tracked: TrackedSetup): SleeveKey => tracked.sleeve ?? 'odte';

/** A 0DTE contract dies at the end of its tracked day; a weekly a few days
    later. Swings never date-expire (Infinity DTE) — the floor is their clock. */
function isExpired(tracked: TrackedSetup): boolean {
  const dte = DTE_BY_SLEEVE[sleeveOf(tracked)] ?? 0;
  if (!Number.isFinite(dte)) return false;
  const expiryDay = new Date(tracked.trackedAt);
  expiryDay.setHours(0, 0, 0, 0);
  return Date.now() >= expiryDay.getTime() + (dte + 1) * 86_400_000;
}

/** Rebuild a tracked setup's live data from the simulator. */
function rebuildLive(tracked: TrackedSetup): Setup {
  Feed.ensureTicker(tracked.ticker);
  const cfg = Feed.TICKERS[tracked.ticker];
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
        <span className="ml-auto font-mono text-[9px] text-textMuted uppercase tracking-wider">
          Tracked {etMonthDay(new Date(tracked.trackedAt))}
        </span>
      </div>

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
            This contract expired {etMonthDay(new Date(tracked.trackedAt))} — tracking ended.
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
    render: r => (r.expired ? <SignalBadge tone="bear">EXPIRED</SignalBadge> : <VerdictBadge verdict={r.live.verdict} />),
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
        {etMonthDay(new Date(r.tracked.trackedAt))}
      </span>
    ),
  },
];

/*
  WHAT THE EMPTY STATE PROMISES IS WHAT THE TABLE ABOVE DELIVERS.

  A panel holding one icon and one sentence over 58vh is not a filled page —
  it is the same void with a border drawn round it, which reads worse because
  the frame draws the eye to the emptiness. So the empty state carries the
  three things tracking actually does, each one traceable to code on this
  page: liveData recomputes from the feed on every marketData change, and
  Premium / Exp. Move / the contracts tab are TABLE_COLUMNS above.
*/
const WHAT_TRACKING_GIVES: { label: string; detail: string }[] = [
  { label: 'Stays live', detail: 'Verdict and confidence recompute as price moves — not a snapshot of the moment you tracked it.' },
  { label: 'Keeps the entry', detail: 'Premium and expected move stay pinned to the level the setup was tracked at.' },
  { label: 'Two views', detail: 'Cards here, and the same setups as a sortable contract table under the second tab.' },
];

// ---- Main Page Component ---------------------------------------------------

const Tracker = () => {
  const navigate = useNavigate();
  const { trackedSetups, untrackSetup } = useTracker();
  const { marketData } = useMarketData();
  const [tab, setTab] = useState<TabKey>('setups');

  // Rebuild all tracked setups with live data
  const liveData = useMemo(() => {
    if (!marketData) return [];
    return trackedSetups.map(tracked => ({
      tracked,
      live: rebuildLive(tracked),
      expired: isExpired(tracked),
    }));
  }, [trackedSetups, marketData]);

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
        </span>
      </div>

      {/*
        THE EMPTY STATE NAMES THE CONTROL THAT EXISTS.

        It used to say "click Track Setup +". Grepping the repo for that string
        returned exactly one hit: this sentence. The real control is "Track
        campaign", and it is not on the card — it is inside a setup's Analysis
        (CampaignAnalysis.tsx:1167). So the instruction sent people looking for
        a button that has never existed, on a screen it would not have been on.

        And it is per TAB now. This branch ran before the tab check, so the
        Contracts tab rendered the Setups empty state — clicking "Tracked
        Contracts" changed nothing on screen, which reads as a broken tab
        rather than an empty one.
      */}
      {trackedSetups.length === 0 ? (
        <Panel className="w-full" bodyClassName="flex flex-col items-center gap-5 py-12">
          <Bookmark className="w-9 h-9 text-textMuted/40" />
          <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">
            {tab === 'setups' ? 'No tracked setups yet' : 'No tracked contracts yet'}
          </span>
          <p className="max-w-sm text-center text-[12px] leading-relaxed text-textSecondary">
            Open a setup&rsquo;s <strong className="text-textPrimary">Analysis</strong> in Compass and click{' '}
            <strong className="text-textPrimary">Track campaign</strong>. It lands here.
          </p>
          <button
            onClick={() => navigate('/compass')}
            className="inline-flex items-center gap-1.5 rounded-md border border-select/40 bg-select/[0.06] px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-select transition-colors hover:bg-select/[0.12]"
          >
            Go to Compass <ArrowUpRight className="h-3.5 w-3.5" />
          </button>

          <div className="mt-2 grid w-full max-w-3xl grid-cols-1 gap-3 border-t border-borderSubtle pt-6 sm:grid-cols-3">
            {WHAT_TRACKING_GIVES.map(item => (
              <div key={item.label} className="flex flex-col gap-1 px-2 text-center">
                <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">{item.label}</span>
                <span className="text-[12px] leading-snug text-textSecondary">{item.detail}</span>
              </div>
            ))}
          </div>
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
