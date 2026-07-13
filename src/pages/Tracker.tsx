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
import { makeSetup } from '../data/skyvision';
import type { ScannerKey, Setup } from '../types/skyvision';
import type { TrackedSetup } from '../types/tracker';
import PageHeader from '../components/ui/PageHeader';
import SegmentedControl from '../components/ui/SegmentedControl';
import Panel from '../components/ui/Panel';
import SignalBadge from '../components/ui/SignalBadge';
import VerdictBadge from '../components/skyvision/VerdictBadge';
import DataTable, { type Column } from '../components/ui/DataTable';

const TAB_OPTIONS = [
  { value: 'setups', label: 'Tracked Setups' },
  { value: 'contracts', label: 'Tracked Contracts' },
] as const;

type TabKey = (typeof TAB_OPTIONS)[number]['value'];

/** Days-to-expiry per scanner — mirrors the scanner profiles in data/skyvision. */
const DTE_BY_SCANNER: Record<ScannerKey, number> = {
  'top-setups': 0,
  'quick-scalp': 0,
  'whale-sweeps': 0,
  all: 0,
  discounted: 1,
  rebounds: 1,
};

/** A 0DTE contract dies at the end of its tracked day; 1DTE the day after. */
function isExpired(tracked: TrackedSetup): boolean {
  const dte = DTE_BY_SCANNER[tracked.scanner] ?? 0;
  const expiryDay = new Date(tracked.trackedAt);
  expiryDay.setHours(0, 0, 0, 0);
  return Date.now() >= expiryDay.getTime() + (dte + 1) * 86_400_000;
}

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
    cfg.iv
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
  const scoreDelta = live.score - tracked.scoreAtTrack;

  return (
    <div className="border border-borderSubtle bg-panel rounded-lg overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-borderSubtle">
        <span className="font-mono text-sm font-bold text-textPrimary tracking-tight">{live.contract}</span>
        {expired ? <SignalBadge tone="bear">EXPIRED</SignalBadge> : <VerdictBadge verdict={live.verdict} dot />}
        <span className="ml-auto font-mono text-[9px] text-textMuted uppercase tracking-wider">
          Tracked {new Date(tracked.trackedAt).toLocaleDateString()}
        </span>
      </div>

      {/* Live metrics grid */}
      <div className={`grid grid-cols-3 gap-px bg-borderSubtle/30 ${expired ? 'opacity-50' : ''}`}>
        <div className="bg-panel px-3 py-2.5">
          <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Score</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="font-mono text-lg font-bold text-textPrimary tnum">{live.score}</span>
            {scoreDelta !== 0 && (
              <span className={`font-mono text-[10px] tnum ${scoreDelta > 0 ? 'text-bull' : 'text-bear'}`}>
                {scoreDelta > 0 ? '+' : ''}{scoreDelta}
              </span>
            )}
          </div>
        </div>
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
            This contract expired {new Date(tracked.trackedAt).toLocaleDateString()} — tracking ended.
          </span>
        </div>
      ) : (
        <div className="px-4 py-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted flex items-center gap-1.5">
              Confidence <SignalBadge tone="bull" dot pulse>Live</SignalBadge>
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
    key: 'score',
    header: 'Score',
    align: 'right',
    sortValue: r => r.live.score,
    render: r => {
      const delta = r.live.score - r.tracked.scoreAtTrack;
      return (
        <span className="flex items-center justify-end gap-1.5">
          <span className="text-textPrimary tnum">{r.live.score}</span>
          {delta !== 0 && (
            <span className={`text-[10px] tnum ${delta > 0 ? 'text-bull' : 'text-bear'}`}>
              {delta > 0 ? '+' : ''}{delta}
            </span>
          )}
        </span>
      );
    },
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
