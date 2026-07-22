/*
==================================================
  SLAYER TERMINAL - TRACKER PAGE
  One primary table over every bookmarked setup,
  with saved views (Active / Triggered / Invalidated
  / Expiring / Closed / Alerts / Journal), a per-item
  status + notes editor, and the Edge Ledger below.
  Statuses and notes are kept in this browser.
==================================================
*/

import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, Trash2, ArrowUpRight, Compass, Scale, Radar, CalendarClock, StickyNote } from 'lucide-react';
import { useTracker } from '../context/TrackerContext';
import EdgeLedger from '../components/tracker/EdgeLedger';
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
import StatCard from '../components/ui/StatCard';
import MetricGrid from '../components/ui/MetricGrid';
import type { Tone } from '../components/ui/tones';

// ---- Saved views -----------------------------------------------------------

const VIEWS = [
  { value: 'active', label: 'Active' },
  { value: 'triggered', label: 'Triggered' },
  { value: 'invalidated', label: 'Invalidated' },
  { value: 'expiring', label: 'Expiring' },
  { value: 'closed', label: 'Closed' },
  { value: 'alerts', label: 'Alerts' },
  { value: 'journal', label: 'Journal' },
] as const;

type ViewKey = (typeof VIEWS)[number]['value'];

const VIEW_HINT: Record<ViewKey, string> = {
  active: 'live watch — nothing flagged yet',
  triggered: 'engine currently reads ENTER',
  invalidated: 'engine currently reads EXIT',
  expiring: 'inside a day of expiry',
  closed: 'expired or marked closed',
  alerts: 'flags recomputed from the current read',
  journal: 'every item — status and notes',
};

/** A status the operator can pin on an item. `null` follows the live read. */
type UserStatus = 'active' | 'triggered' | 'invalidated' | 'closed';

const STATUS_TONE: Record<UserStatus, Tone> = {
  active: 'neutral',
  triggered: 'bull',
  invalidated: 'bear',
  closed: 'neutral',
};

const STATUS_LABEL: Record<UserStatus, string> = {
  active: 'Active',
  triggered: 'Triggered',
  invalidated: 'Invalidated',
  closed: 'Closed',
};

const STATUS_PICKS: { value: 'auto' | UserStatus; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'active', label: 'Active' },
  { value: 'triggered', label: 'Triggered' },
  { value: 'invalidated', label: 'Invalidated' },
  { value: 'closed', label: 'Closed' },
];

const STATUS_PICK_ACTIVE: Record<'auto' | UserStatus, string> = {
  auto: 'bg-white/[0.09] border-white/25 text-textPrimary',
  active: 'bg-white/[0.09] border-white/25 text-textPrimary',
  triggered: 'bg-bull/12 border-bull/35 text-bull',
  invalidated: 'bg-bear/12 border-bear/35 text-bear',
  closed: 'bg-white/[0.04] border-borderSubtle text-textMuted',
};

/** Days-to-expiry per scanner — mirrors the scanner profiles in data/skyvision. */
const DTE_BY_SCANNER: Record<ScannerKey, number> = {
  'top-setups': 0,
  'quick-scalp': 0,
  'whale-sweeps': 0,
  all: 0,
  discounted: 1,
  rebounds: 1,
};

const DAY_MS = 86_400_000;

/** Expiry read for a tracked contract — both derived from the tracked day + DTE. */
function expiryInfo(tracked: TrackedSetup): { expired: boolean; expiringSoon: boolean } {
  const dte = DTE_BY_SCANNER[tracked.scanner] ?? 0;
  const expiryDay = new Date(tracked.trackedAt);
  expiryDay.setHours(0, 0, 0, 0);
  const expiryTs = expiryDay.getTime() + (dte + 1) * DAY_MS;
  const now = Date.now();
  return { expired: now >= expiryTs, expiringSoon: now < expiryTs && expiryTs - now <= DAY_MS };
}

/** Rebuild a tracked setup's live data from the simulator. */
function rebuildLive(tracked: TrackedSetup): Setup {
  Simulator.ensureTicker(tracked.ticker);
  const cfg = Simulator.TICKERS[tracked.ticker];
  return makeSetup(tracked.ticker, cfg.currentPrice, tracked.strike, tracked.right, tracked.scanner, cfg.iv);
}

/** The item's lane when the operator hasn't pinned one — read straight off the engine. */
function autoStatus(live: Setup, expired: boolean): UserStatus {
  if (expired) return 'closed';
  if (live.verdict === 'ENTER') return 'triggered';
  if (live.verdict === 'EXIT') return 'invalidated';
  return 'active';
}

const truncate = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---- Local journal store (status + notes, this browser only) ---------------

interface JournalEntry {
  status: UserStatus | null;
  notes: string;
}
type JournalMap = Record<string, JournalEntry>;

const JOURNAL_KEY = 'slayer_tracker_journal';

function loadJournal(): JournalMap {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    return raw ? (JSON.parse(raw) as JournalMap) : {};
  } catch {
    return {};
  }
}

// ---- Enriched row model ----------------------------------------------------

interface Row {
  tracked: TrackedSetup;
  live: Setup;
  expired: boolean;
  expiringSoon: boolean;
  override: UserStatus | null;
  status: UserStatus;
  notes: string;
  scoreDelta: number;
  attention: string[];
}

function inView(row: Row, view: ViewKey): boolean {
  switch (view) {
    case 'active':
      return row.status === 'active';
    case 'triggered':
      return row.status === 'triggered';
    case 'invalidated':
      return row.status === 'invalidated';
    case 'expiring':
      return row.expiringSoon && row.status !== 'closed';
    case 'closed':
      return row.status === 'closed';
    case 'alerts':
      return row.status !== 'closed' && row.attention.length > 0;
    case 'journal':
      return true;
  }
}

// ---- Small pieces ----------------------------------------------------------

/** Lane chip for the Status column — muted plain text once an item is closed. */
const StatusChip = ({ status, pinned }: { status: UserStatus; pinned: boolean }) => {
  if (status === 'closed') {
    return (
      <span className="font-mono text-[11px] uppercase tracking-wider text-textMuted">
        {STATUS_LABEL.closed}
        {pinned && <span className="ml-1 text-select" title="Pinned by you">•</span>}
      </span>
    );
  }
  return (
    <SignalBadge tone={STATUS_TONE[status]} dot>
      {STATUS_LABEL[status]}
      {pinned && <span className="ml-0.5 text-select" title="Pinned by you">•</span>}
    </SignalBadge>
  );
};

const MiniStat = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="inst-surface rounded px-2.5 py-2">
    <div className="font-mono text-[10px] uppercase tracking-widest text-textSecondary">{label}</div>
    <div className="mt-0.5 font-mono text-[13px] font-semibold tnum text-textPrimary">{children}</div>
  </div>
);

interface ItemDetailProps {
  row: Row;
  onStatus: (id: string, status: UserStatus | null) => void;
  onNotes: (id: string, notes: string) => void;
  onReview: (t: TrackedSetup) => void;
  onUntrack: (id: string) => void;
}

/** The per-item status + notes editor. Reads live values, writes to the local journal. */
const ItemDetail = ({ row, onStatus, onNotes, onReview, onUntrack }: ItemDetailProps) => {
  const { tracked, live, expired, scoreDelta } = row;
  const moveUp = live.expectedMovePct >= 0;
  const current: 'auto' | UserStatus = row.override ?? 'auto';

  return (
    <div className="flex flex-col gap-4">
      {/* Identity */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-sm font-bold text-textPrimary tracking-tight">{live.contract}</span>
        {expired ? <SignalBadge tone="neutral">EXPIRED</SignalBadge> : <VerdictBadge verdict={live.verdict} dot />}
        {row.expiringSoon && !expired && <SignalBadge tone="warn">EXPIRING</SignalBadge>}
        <span className="ml-auto font-mono text-[11px] text-textMuted uppercase tracking-wider">
          Tracked {new Date(tracked.trackedAt).toLocaleDateString()}
        </span>
      </div>

      {/* Live read */}
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="Score">
          <span className="flex items-baseline gap-1.5">
            {live.score}
            {scoreDelta !== 0 && (
              <span className={`text-[11px] ${scoreDelta > 0 ? 'text-bull' : 'text-bear'}`}>
                {scoreDelta > 0 ? '+' : ''}
                {scoreDelta}
              </span>
            )}
          </span>
        </MiniStat>
        <MiniStat label="Premium">${live.mid.toFixed(2)}</MiniStat>
        <MiniStat label="Confidence">{live.confidence}%</MiniStat>
        <MiniStat label="Exp. Move">
          <span className={moveUp ? 'text-bull' : 'text-bear'}>
            {moveUp ? '+' : ''}
            {live.expectedMovePct}%
          </span>
        </MiniStat>
      </div>

      {/* Invalidation context — straight from the live setup */}
      {!expired && (
        <div className="border-l-2 border-borderSubtle pl-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-textSecondary">Invalidation</div>
          <p className="mt-0.5 text-[12px] text-textSecondary leading-snug">
            {live.invalidationReason}{' '}
            <span className="text-textMuted">— below ${live.invalidationPrice.toFixed(2)}</span>
          </p>
        </div>
      )}

      {/* Attention flags for this item */}
      {row.attention.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {row.attention.map(a => (
            <span
              key={a}
              className="inline-flex items-center rounded border border-warn/25 bg-warn/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warn"
            >
              {a}
            </span>
          ))}
        </div>
      )}

      {/* Status picker */}
      <div>
        <div className="font-mono text-[11px] uppercase tracking-widest text-textSecondary mb-1.5">Status</div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_PICKS.map(o => {
            const active = current === o.value;
            return (
              <button
                key={o.value}
                onClick={() => onStatus(tracked.id, o.value === 'auto' ? null : o.value)}
                aria-pressed={active}
                className={`px-2.5 py-1 rounded border font-mono text-[11px] uppercase tracking-wider transition-colors ${
                  active
                    ? STATUS_PICK_ACTIVE[o.value]
                    : 'border-borderSubtle text-textSecondary hover:text-textPrimary hover:bg-white/[0.03]'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 font-mono text-[10px] text-textMuted leading-relaxed">
          Auto follows the live engine read ({STATUS_LABEL[autoStatus(live, expired)].toLowerCase()}). Pin one to keep it in a
          view regardless.
        </p>
      </div>

      {/* Notes */}
      <div>
        <div className="font-mono text-[11px] uppercase tracking-widest text-textSecondary mb-1.5">Notes</div>
        <textarea
          value={row.notes}
          onChange={e => onNotes(tracked.id, e.target.value)}
          rows={4}
          placeholder="Your read on this setup — thesis, level to watch, why you're in or out…"
          className="w-full resize-none rounded-md bg-inset border border-borderSubtle px-3 py-2 font-mono text-[12px] leading-relaxed text-textPrimary placeholder:text-textMuted focus:outline-none focus:border-white/20"
        />
        <p className="mt-1 font-mono text-[10px] text-textMuted">Saved in this browser.</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-borderSubtle">
        {expired ? (
          <span className="font-mono text-[11px] text-textMuted uppercase tracking-wider">Expired — no live setup to review</span>
        ) : (
          <button
            onClick={() => onReview(tracked)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-borderSubtle bg-white/[0.03] hover:bg-white/[0.06] font-mono text-[11px] text-textSecondary hover:text-textPrimary uppercase tracking-wider transition-colors"
          >
            <ArrowUpRight className="w-3 h-3" /> Review in Compass
          </button>
        )}
        <button
          onClick={() => onUntrack(tracked.id)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-bear/20 bg-bear/5 hover:bg-bear/10 font-mono text-[11px] text-bear uppercase tracking-wider transition-colors ml-auto"
        >
          <Trash2 className="w-3 h-3" /> Untrack
        </button>
      </div>
    </div>
  );
};

// ---- Table columns ---------------------------------------------------------

const COLUMNS: Column<Row>[] = [
  {
    key: 'contract',
    header: 'Contract',
    render: r => (
      <span className="flex flex-col">
        <span className="font-semibold text-textPrimary">{r.live.contract}</span>
        <span className="text-[10px] text-textMuted uppercase tracking-wider">{r.tracked.scanner}</span>
      </span>
    ),
  },
  {
    key: 'signal',
    header: 'Signal',
    sortValue: r => (r.expired ? -1 : r.live.verdict === 'ENTER' ? 2 : r.live.verdict === 'WATCH' ? 1 : 0),
    render: r => (r.expired ? <SignalBadge tone="neutral">EXPIRED</SignalBadge> : <VerdictBadge verdict={r.live.verdict} />),
  },
  {
    key: 'status',
    header: 'Status',
    sortValue: r => r.status,
    render: r => (
      <span className="inline-flex items-center gap-1.5">
        <StatusChip status={r.status} pinned={r.override !== null} />
        {r.expiringSoon && r.status !== 'closed' && <SignalBadge tone="warn">EXPIRING</SignalBadge>}
      </span>
    ),
  },
  {
    key: 'score',
    header: 'Score',
    align: 'right',
    sortValue: r => r.live.score,
    render: r => (
      <span className="flex items-center justify-end gap-1.5">
        <span className="text-textPrimary tnum">{r.live.score}</span>
        {r.scoreDelta !== 0 && (
          <span className={`text-[10px] tnum ${r.scoreDelta > 0 ? 'text-bull' : 'text-bear'}`}>
            {r.scoreDelta > 0 ? '+' : ''}
            {r.scoreDelta}
          </span>
        )}
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
          {up ? '+' : ''}
          {r.live.expectedMovePct}%
        </span>
      );
    },
  },
  {
    key: 'notes',
    header: 'Notes',
    sortValue: r => (r.notes.trim() ? 1 : 0),
    render: r =>
      r.notes.trim() ? (
        <span className="inline-flex items-center gap-1.5 text-textSecondary">
          <StickyNote className="w-3 h-3 holo-text shrink-0" />
          {truncate(r.notes.trim(), 22)}
        </span>
      ) : (
        <span className="text-textMuted">—</span>
      ),
  },
  {
    key: 'tracked',
    header: 'Tracked',
    align: 'right',
    sortValue: r => r.tracked.trackedAt,
    render: r => <span className="text-textMuted">{new Date(r.tracked.trackedAt).toLocaleDateString()}</span>,
  },
];

// ---- Main Page Component ---------------------------------------------------

const Tracker = () => {
  const navigate = useNavigate();
  const { trackedSetups, untrackSetup } = useTracker();
  const { marketData } = useMarketData();
  const [view, setView] = useState<ViewKey>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [journal, setJournal] = useState<JournalMap>(loadJournal);

  useEffect(() => {
    try {
      localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
    } catch {
      // storage full or unavailable — the table still works this session
    }
  }, [journal]);

  const setStatus = (id: string, status: UserStatus | null) =>
    setJournal(prev => ({ ...prev, [id]: { notes: prev[id]?.notes ?? '', status } }));

  const setNotes = (id: string, notes: string) =>
    setJournal(prev => ({ ...prev, [id]: { status: prev[id]?.status ?? null, notes } }));

  const handleUntrack = (id: string) => {
    untrackSetup(id);
    setJournal(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

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

  // Rebuild each tracked setup with its live read + expiry state
  const liveData = useMemo(() => {
    if (!marketData) return [];
    return trackedSetups.map(tracked => {
      const { expired, expiringSoon } = expiryInfo(tracked);
      return { tracked, live: rebuildLive(tracked), expired, expiringSoon };
    });
  }, [trackedSetups, marketData]);

  // Fold in local status + notes and derive lane / attention flags
  const rows = useMemo<Row[]>(
    () =>
      liveData.map(({ tracked, live, expired, expiringSoon }) => {
        const entry = journal[tracked.id];
        const override = entry?.status ?? null;
        const notes = entry?.notes ?? '';
        const status = override ?? autoStatus(live, expired);
        const scoreDelta = live.score - tracked.scoreAtTrack;

        const attention: string[] = [];
        if (status !== 'closed') {
          if (live.verdict === 'EXIT') attention.push('Engine reads EXIT');
          if (expiringSoon) attention.push('Expires within a day');
          if (scoreDelta < 0) attention.push(`Score ${scoreDelta} vs track`);
        }

        return { tracked, live, expired, expiringSoon, override, status, notes, scoreDelta, attention };
      }),
    [liveData, journal]
  );

  const counts = useMemo(() => {
    const c: Record<ViewKey, number> = {
      active: 0,
      triggered: 0,
      invalidated: 0,
      expiring: 0,
      closed: 0,
      alerts: 0,
      journal: rows.length,
    };
    for (const r of rows) {
      (Object.keys(c) as ViewKey[]).forEach(k => {
        if (k !== 'journal' && inView(r, k)) c[k] += 1;
      });
    }
    return c;
  }, [rows]);

  const visibleRows = useMemo(() => rows.filter(r => inView(r, view)), [rows, view]);

  const selected = useMemo(
    () => visibleRows.find(r => r.tracked.id === selectedId) ?? visibleRows[0] ?? null,
    [visibleRows, selectedId]
  );

  const viewOptions = useMemo(() => VIEWS.map(v => ({ value: v.value, label: `${v.label} ${counts[v.value]}` })), [counts]);

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Tracker']}
        title="Setup Tracker"
        subtitle="Every tracked setup in one table — set a status, keep notes, and read each one's live signal. Saved in this browser."
      />

      {/* Empty state — a dense "get started" surface, not a blank panel */}
      {trackedSetups.length === 0 ? (
        <div className="flex flex-col gap-4 animate-view-in">
          <Panel className="w-full" bodyClassName="py-8 px-6 flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1 min-w-0">
              <div className="inline-flex w-11 h-11 rounded-lg border border-borderSubtle bg-inset items-center justify-center mb-3">
                <Bookmark className="w-5 h-5 holo-text" />
              </div>
              <h2 className="text-lg font-semibold text-textPrimary">Nothing on watch yet</h2>
              <p className="mt-1.5 text-[13px] text-textSecondary leading-relaxed max-w-xl">
                The Tracker keeps your best ideas in one table and re-reads each one's score, signal and confidence from the
                current market read every time you open it. Bookmark something from any desk below, then set a status and keep
                notes as your thesis plays out.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 shrink-0">
              {[
                { k: 'Setups', v: 'one table', s: 'seven saved views' },
                { k: 'Read', v: 'live', s: 'recomputed on open' },
                { k: 'Notes', v: 'saved', s: 'in this browser' },
              ].map(x => (
                <div key={x.k} className="border border-borderSubtle bg-inset rounded-lg px-3 py-2.5 text-center min-w-[92px]">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">{x.k}</div>
                  <div className="mt-1 font-mono text-sm font-semibold holo-text">{x.v}</div>
                  <div className="mt-0.5 text-[10px] text-textMuted">{x.s}</div>
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { icon: Compass, title: 'Compass setups', body: 'Graded ENTER / EXIT trade setups with a full plan.', to: '/compass', cta: 'Open Compass' },
              { icon: Scale, title: 'Contract Weigher', body: 'Weeklies, swings & LEAPS scored BUY / WATCH / FADE.', to: '/compass', cta: 'Weigh contracts' },
              { icon: Radar, title: 'Trace flow', body: 'Notable options prints and dark-pool blocks.', to: '/trace/tracker', cta: 'Open Trace' },
              { icon: CalendarClock, title: 'Earnings plays', body: 'Implied-vs-realized PLAY / FADE calls into prints.', to: '/earnings', cta: 'Open Earnings' },
            ].map(card => (
              <div key={card.title} className="inst-surface rounded-md p-4 flex flex-col gap-2.5">
                <span className="inline-flex w-8 h-8 rounded-md border border-borderSubtle bg-inset items-center justify-center">
                  <card.icon className="w-4 h-4 text-textSecondary" />
                </span>
                <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-textPrimary">{card.title}</h3>
                <p className="text-[11px] text-textMuted leading-relaxed flex-1">{card.body}</p>
                <button
                  onClick={() => navigate(card.to)}
                  className="mt-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-borderSubtle bg-white/[0.03] hover:bg-white/[0.06] text-textSecondary hover:text-textPrimary font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors"
                >
                  {card.cta} <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : !marketData ? (
        <Panel className="h-64" bodyClassName="flex items-center justify-center">
          <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">Reading tracked setups…</span>
        </Panel>
      ) : (
        <div className="flex flex-col gap-4 animate-view-in">
          {/* Summary strip — counts over the tracked book */}
          <MetricGrid min="150px">
            <StatCard label="Tracked" value={`${rows.length}`} sub="in your book" tone="neutral" />
            <StatCard
              label="Triggered"
              value={`${counts.triggered}`}
              sub="engine reads ENTER"
              tone={counts.triggered > 0 ? 'bull' : 'neutral'}
            />
            <StatCard
              label="Alerts"
              value={`${counts.alerts}`}
              sub="items to look at"
              tone={counts.alerts > 0 ? 'warn' : 'neutral'}
            />
            <StatCard
              label="Expiring"
              value={`${counts.expiring}`}
              sub="within a day"
              tone={counts.expiring > 0 ? 'warn' : 'neutral'}
            />
          </MetricGrid>

          {/* Saved-view tabs */}
          <div className="flex items-center gap-3 flex-wrap">
            <SegmentedControl ariaLabel="Tracker view" options={viewOptions} value={view} onChange={setView} />
            <span className="font-mono text-[11px] text-textMuted uppercase tracking-wider">{VIEW_HINT[view]}</span>
          </div>

          {/* One primary table + per-item editor */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
            <Panel title="Tracked setups" subtitle={VIEWS.find(v => v.value === view)?.label} flush className="xl:col-span-8">
              <DataTable
                columns={COLUMNS}
                rows={visibleRows}
                rowKey={r => r.tracked.id}
                onRowClick={r => setSelectedId(r.tracked.id)}
                selectedKey={selected?.tracked.id ?? null}
                maxHeight="560px"
                emptyText={`Nothing in ${VIEWS.find(v => v.value === view)?.label}`}
              />
            </Panel>

            <Panel
              title={
                <span className="inline-flex items-center gap-1.5">
                  <StickyNote className="w-3.5 h-3.5" /> Item review
                </span>
              }
              subtitle="status & notes"
              className="xl:col-span-4"
            >
              {selected ? (
                <ItemDetail
                  row={selected}
                  onStatus={setStatus}
                  onNotes={setNotes}
                  onReview={handleReview}
                  onUntrack={handleUntrack}
                />
              ) : (
                <div className="h-48 flex flex-col items-center justify-center gap-2 text-center">
                  <Bookmark className="w-5 h-5 text-textMuted" />
                  <span className="font-mono text-[11px] text-textSecondary uppercase tracking-wider">No item selected</span>
                  <span className="text-[11px] text-textMuted max-w-[220px] leading-relaxed">
                    Nothing in this view. Pick another tab, or select a row to set its status and notes.
                  </span>
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      <EdgeLedger />
    </>
  );
};

export default Tracker;
