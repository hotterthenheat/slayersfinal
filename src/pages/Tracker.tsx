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
import { makeSetup } from '../data/compass';
import { SLEEVE_BY_KEY } from '../types/compass';
import type { Setup } from '../types/compass';
import type { TrackedSetup, TrackedFill } from '../types/tracker';
import { isUsableFill, markPosition, bookTotals, MIN_BOOK_FOR_STATS, type PositionMark } from '../data/positionBook';
import PageHeader from '../components/ui/PageHeader';
import SegmentedControl from '../components/ui/SegmentedControl';
import Panel from '../components/ui/Panel';
import SignalBadge from '../components/ui/SignalBadge';
import VerdictBadge from '../components/compass/VerdictBadge';
import DataTable, { type Column } from '../components/ui/DataTable';
import StatCard from '../components/ui/StatCard';
import { useToast } from '../components/ui/Toast';
import MetricGrid from '../components/ui/MetricGrid';
import Skeleton, { SkeletonRows } from '../components/ui/Skeleton';
import HoverReadout from '../components/ui/HoverReadout';
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
  active: 'on watch — nothing flagged yet',
  triggered: 'engine currently reads QUALIFIED',
  invalidated: 'engine currently reads FADED',
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

/** Days-to-expiry per scanner — mirrors the scanner profiles in data/compass. */
const DAY_MS = 86_400_000;

/** Expiry read for a tracked contract — both derived from the tracked day + DTE. */
function expiryInfo(tracked: TrackedSetup): { expired: boolean; expiringSoon: boolean } {
  /*
    The SLEEVE's day count, not a table keyed on the scanner.

    That table read `discounted: 1, rebounds: 1` and zero for everything else,
    which was true back when the scanner chose the expiry. Once the horizon
    moved to its own axis it meant a tracked LEAP expired the day after it was
    tracked, and a tracked weekly expired the same day.
  */
  const dte = SLEEVE_BY_KEY[tracked.sleeve]?.dte ?? 0;
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
  // The sleeve is the sixth argument's job: makeSetup defaults to same-session,
  // so omitting it repriced every tracked weekly, swing and LEAP as a 0DTE.
  return makeSetup(
    tracked.ticker,
    cfg.currentPrice,
    tracked.strike,
    tracked.right,
    tracked.scanner,
    cfg.iv,
    true,
    tracked.sleeve
  );
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
  /**
   * What the operator actually paid, if they recorded it.
   *
   * Optional forever, and read through `??` everywhere, so the thousands of
   * rows already written to this key without it load unchanged — the same
   * free-migration property `sleeve ?? 'odte'` relies on in TrackerContext.
   */
  fill?: TrackedFill;
}
type JournalMap = Record<string, JournalEntry>;

/** A journal row for an id that has none yet. Spread, never assigned over. */
const EMPTY_ENTRY: JournalEntry = { status: null, notes: '' };

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
  /** What the operator paid, if they recorded it. Absent on a plain bookmark. */
  fill?: TrackedFill;
  /** The fill marked against the current mid. Absent unless `fill` is usable. */
  mark?: PositionMark;
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
      <span className="font-mono text-label uppercase tracking-wider text-textMuted">
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
    <div className="font-mono text-micro uppercase tracking-widest text-textSecondary">{label}</div>
    <div className="mt-0.5 font-mono text-data font-semibold tnum text-textPrimary">{children}</div>
  </div>
);

interface ItemDetailProps {
  row: Row;
  onStatus: (id: string, status: UserStatus | null) => void;
  onNotes: (id: string, notes: string) => void;
  onFill: (id: string, fill: TrackedFill | undefined) => void;
  onReview: (t: TrackedSetup) => void;
  onUntrack: (id: string) => void;
}

const usd = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}`;

/** One labelled number inside the position block. */
const FillStat = ({ label, value, tone = '' }: { label: string; value: string; tone?: string }) => (
  <div>
    <div className="font-mono text-micro uppercase tracking-widest text-textMuted">{label}</div>
    <div className={`mt-0.5 font-mono text-caption font-semibold tnum ${tone || 'text-textPrimary'}`}>{value}</div>
  </div>
);

const fillInputCls =
  'w-full rounded bg-inset border border-borderSubtle px-2 py-1 font-mono text-caption tnum text-textPrimary ' +
  'placeholder:text-textMuted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60 focus:border-white/20';

/**
 * Record what the position actually cost, and what it did.
 *
 * The Tracker stored a score and a verdict and nothing about the trade, so the
 * one thing a journal is FOR — what you paid and what came back — had nowhere
 * to go. Everything here is typed by the operator; nothing is fetched, inferred
 * or filled in from the desk.
 */
const PositionBlock = ({ row, onFill }: { row: Row; onFill: ItemDetailProps['onFill'] }) => {
  const { tracked, live, fill, mark } = row;
  const [draft, setDraft] = useState({
    entryPrice: fill ? String(fill.entryPrice) : '',
    size: fill ? String(fill.size) : '',
    exitPrice: fill?.exitPrice != null ? String(fill.exitPrice) : '',
    fees: fill?.fees != null ? String(fill.fees) : '',
  });
  // A different row is a different position — reset the form when it changes.
  useEffect(() => {
    setDraft({
      entryPrice: fill ? String(fill.entryPrice) : '',
      size: fill ? String(fill.size) : '',
      exitPrice: fill?.exitPrice != null ? String(fill.exitPrice) : '',
      fees: fill?.fees != null ? String(fill.fees) : '',
    });
  }, [tracked.id, fill]);

  const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
  const entryPrice = num(draft.entryPrice);
  const size = num(draft.size);
  const canSave = entryPrice != null && entryPrice > 0 && size != null && size > 0;

  const save = () => {
    if (!canSave) return;
    const exitPrice = num(draft.exitPrice);
    const fees = num(draft.fees);
    onFill(tracked.id, {
      entryPrice: entryPrice!,
      size: size!,
      // Recording an entry after the fact is normal; the tracked moment is the
      // only entry timestamp this app can honestly claim to know.
      entryAt: fill?.entryAt ?? tracked.trackedAt,
      ...(exitPrice != null && Number.isFinite(exitPrice) ? { exitPrice, exitAt: fill?.exitAt ?? Date.now() } : {}),
      ...(fees != null && Number.isFinite(fees) ? { fees } : {}),
    });
  };

  return (
    <div className="border-t border-borderSubtle pt-3">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-label uppercase tracking-widest text-textSecondary">Your position</span>
        {mark && (
          <SignalBadge tone={mark.state === 'OPEN' ? 'select' : 'neutral'}>
            {mark.state === 'OPEN' ? 'Open' : 'Closed'}
          </SignalBadge>
        )}
      </div>

      {mark && (
        <div className="mt-2 grid grid-cols-3 gap-2 inst-surface rounded px-2.5 py-2">
          <FillStat label="Cost" value={usd(mark.costBasis)} />
          {mark.state === 'OPEN' ? (
            <>
              <FillStat label="Value now" value={usd(mark.marketValue ?? 0)} />
              <FillStat
                label="Open P&L"
                value={usd(mark.openPnl ?? 0)}
                tone={(mark.openPnl ?? 0) >= 0 ? 'text-bull' : 'text-bear'}
              />
            </>
          ) : (
            <>
              <FillStat
                label="Realized"
                value={usd(mark.realizedPnl ?? 0)}
                tone={(mark.realizedPnl ?? 0) >= 0 ? 'text-bull' : 'text-bear'}
              />
              <FillStat
                label="Return"
                value={`${(mark.realizedPct ?? 0) >= 0 ? '+' : '−'}${Math.abs((mark.realizedPct ?? 0) * 100).toFixed(0)}%`}
                tone={(mark.realizedPct ?? 0) >= 0 ? 'text-bull' : 'text-bear'}
              />
            </>
          )}
        </div>
      )}

      {/* The absence, stated. See data/positionBook.ts. */}
      {mark && (
        <p className="mt-1.5 font-mono text-micro text-textMuted leading-relaxed">
          Best and worst this position reached are not shown because they are not knowable here — that needs the price
          path between your entry and your exit, and nothing records it. Cost and P&amp;L are arithmetic on what you
          typed.
        </p>
      )}

      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-micro uppercase tracking-widest text-textMuted">Entry / contract</span>
          <input
            inputMode="decimal"
            value={draft.entryPrice}
            onChange={e => setDraft(d => ({ ...d, entryPrice: e.target.value }))}
            placeholder={live.mid.toFixed(2)}
            className={fillInputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-micro uppercase tracking-widest text-textMuted">Contracts</span>
          <input
            inputMode="numeric"
            value={draft.size}
            onChange={e => setDraft(d => ({ ...d, size: e.target.value }))}
            placeholder="1"
            className={fillInputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-micro uppercase tracking-widest text-textMuted">Exit / contract</span>
          <input
            inputMode="decimal"
            value={draft.exitPrice}
            onChange={e => setDraft(d => ({ ...d, exitPrice: e.target.value }))}
            placeholder="still open"
            className={fillInputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-micro uppercase tracking-widest text-textMuted">Fees</span>
          <input
            inputMode="decimal"
            value={draft.fees}
            onChange={e => setDraft(d => ({ ...d, fees: e.target.value }))}
            placeholder="0.00"
            className={fillInputCls}
          />
        </label>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={save}
          disabled={!canSave}
          className="px-3 py-1.5 rounded-md border border-borderSubtle bg-white/[0.03] hover:bg-rowHover disabled:opacity-40 disabled:hover:bg-white/[0.03] font-mono text-label text-textSecondary hover:text-textPrimary disabled:hover:text-textSecondary uppercase tracking-wider transition-colors"
        >
          {fill ? 'Update' : 'Record'} fill
        </button>
        {fill && (
          <button
            onClick={() => onFill(tracked.id, undefined)}
            className="px-3 py-1.5 rounded-md border border-borderSubtle font-mono text-label text-textMuted hover:text-textPrimary uppercase tracking-wider transition-colors"
          >
            Clear
          </button>
        )}
        <span className="ml-auto font-mono text-micro text-textMuted">Saved in this browser.</span>
      </div>
    </div>
  );
};

/** The per-item status, position and notes editor. Writes to the local journal. */
const ItemDetail = ({ row, onStatus, onNotes, onFill, onReview, onUntrack }: ItemDetailProps) => {
  const { tracked, live, expired, scoreDelta } = row;
  const moveUp = live.expectedMovePct >= 0;
  const current: 'auto' | UserStatus = row.override ?? 'auto';

  return (
    <div className="flex flex-col gap-4">
      {/* Identity */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-body font-bold text-textPrimary tracking-tight leading-5">{live.contract}</span>
        {expired ? <SignalBadge tone="neutral">EXPIRED</SignalBadge> : <VerdictBadge verdict={live.verdict} dot />}
        {row.expiringSoon && !expired && <SignalBadge tone="warn">EXPIRING</SignalBadge>}
        <span className="ml-auto font-mono text-label text-textMuted uppercase tracking-wider">
          Tracked {new Date(tracked.trackedAt).toLocaleDateString()}
        </span>
      </div>

      {/* Live read */}
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="Score">
          <span className="flex items-baseline gap-1.5">
            {live.score}
            {scoreDelta !== 0 && (
              <span className={`text-label ${scoreDelta > 0 ? 'text-bull' : 'text-bear'}`}>
                {scoreDelta > 0 ? '+' : ''}
                {scoreDelta}
              </span>
            )}
          </span>
        </MiniStat>
        <MiniStat label="Premium">${live.mid.toFixed(2)}</MiniStat>
        {/* Was Confidence — `(score - 55) * 2.1`, the Score tile above it wearing
            a percent sign. Health reads moneyness, so it can disagree with the
            score, which is the only thing that makes a second number worth the
            space. */}
        <MiniStat label="Health">{live.health}/100</MiniStat>
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
          <div className="font-mono text-micro uppercase tracking-widest text-textSecondary">Invalidation</div>
          <p className="mt-0.5 text-caption text-textSecondary leading-snug">
            {live.invalidationReason}{' '}
            <span className="text-textMuted">— below ${live.invalidationPrice.toFixed(2)}</span>
          </p>
        </div>
      )}

      {/* Attention flags for this item */}
      {row.attention.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {row.attention.map(a => (
            <SignalBadge key={a} tone="warn">
              {a}
            </SignalBadge>
          ))}
        </div>
      )}

      {/* Status picker */}
      <div>
        <div className="font-mono text-label uppercase tracking-widest text-textSecondary mb-1.5">Status</div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_PICKS.map(o => {
            const active = current === o.value;
            return (
              <button
                key={o.value}
                onClick={() => onStatus(tracked.id, o.value === 'auto' ? null : o.value)}
                aria-pressed={active}
                className={`px-2.5 py-1 rounded border font-mono text-label uppercase tracking-wider transition-colors ${
                  active
                    ? STATUS_PICK_ACTIVE[o.value]
                    : 'border-borderSubtle text-textSecondary hover:text-textPrimary hover:bg-rowHover'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 font-mono text-micro text-textMuted leading-relaxed">
          Auto follows the current engine read ({STATUS_LABEL[autoStatus(live, expired)].toLowerCase()}). Pin one to keep it in a
          view regardless.
        </p>
      </div>

      {/* What it cost and what it did — the half a bookmark never carried. */}
      <PositionBlock row={row} onFill={onFill} />

      {/* Notes */}
      <div>
        <div className="font-mono text-label uppercase tracking-widest text-textSecondary mb-1.5">Notes</div>
        <textarea
          value={row.notes}
          onChange={e => onNotes(tracked.id, e.target.value)}
          rows={4}
          placeholder="Your read on this setup — thesis, level to watch, why you're in or out…"
          className="w-full resize-none rounded-md bg-inset border border-borderSubtle px-3 py-2 font-mono text-caption leading-relaxed text-textPrimary placeholder:text-textMuted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60 focus:border-white/20"
        />
        <p className="mt-1 font-mono text-micro text-textMuted">Saved in this browser.</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-borderSubtle">
        {expired ? (
          <span className="font-mono text-label text-textMuted uppercase tracking-wider">Expired — no current setup to review</span>
        ) : (
          <button
            onClick={() => onReview(tracked)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-borderSubtle bg-white/[0.03] hover:bg-rowHover font-mono text-label text-textSecondary hover:text-textPrimary uppercase tracking-wider transition-colors"
          >
            <ArrowUpRight className="w-3 h-3" /> Review in Compass
          </button>
        )}
        <button
          onClick={() => onUntrack(tracked.id)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-bear/20 bg-bear/5 hover:bg-bear/10 font-mono text-label text-bear uppercase tracking-wider transition-colors ml-auto"
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
        <span className="text-micro text-textMuted uppercase tracking-wider">{r.tracked.scanner}</span>
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
          <span className={`text-micro tnum ${r.scoreDelta > 0 ? 'text-bull' : 'text-bear'}`}>
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
    key: 'health',
    header: 'Health',
    align: 'right',
    sortValue: r => r.live.health,
    render: r => <span className="text-textPrimary tnum">{r.live.health}</span>,
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
          <StickyNote className="w-3 h-3 text-select shrink-0" />
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

// The four mutually-exclusive status lanes — every tracked item sits in exactly
// one, so their counts partition the book and stack cleanly into one bar.
const STATUS_LANES: { key: ViewKey; label: string; bar: string; dot: string }[] = [
  { key: 'active', label: 'Active', bar: 'bg-white/35', dot: 'bg-white/60' },
  { key: 'triggered', label: 'Triggered', bar: 'bg-bull/80', dot: 'bg-bull' },
  { key: 'invalidated', label: 'Invalidated', bar: 'bg-bear/70', dot: 'bg-bear' },
  { key: 'closed', label: 'Closed', bar: 'bg-white/12', dot: 'bg-textMuted' },
];

// ---- Main Page Component ---------------------------------------------------

const Tracker = () => {
  const navigate = useNavigate();
  const { trackedSetups, untrackSetup, restoreSetup } = useTracker();
  const { toast } = useToast();
  const { marketData } = useMarketData();
  const [view, setView] = useState<ViewKey>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [laneHover, setLaneHover] = useState<{ label: string; count: number; pct: number; x: number; y: number } | null>(null);
  const [journal, setJournal] = useState<JournalMap>(loadJournal);

  useEffect(() => {
    try {
      localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
    } catch {
      // storage full or unavailable — the table still works this session
    }
  }, [journal]);

  /*
    All three setters SPREAD the existing entry rather than rebuilding it.

    They used to name every field they kept — `{ notes: prev[id]?.notes ?? '',
    status }` — which is correct for exactly as long as the entry has two
    fields. Adding `fill` to a shape written that way means setting a status
    silently deletes the fill the operator typed in, and the only symptom is
    their trade quietly becoming a bookmark again.
  */
  const setStatus = (id: string, status: UserStatus | null) =>
    setJournal(prev => ({ ...prev, [id]: { ...EMPTY_ENTRY, ...prev[id], status } }));

  const setNotes = (id: string, notes: string) =>
    setJournal(prev => ({ ...prev, [id]: { ...EMPTY_ENTRY, ...prev[id], notes } }));

  const setFill = (id: string, fill: TrackedFill | undefined) =>
    setJournal(prev => ({ ...prev, [id]: { ...EMPTY_ENTRY, ...prev[id], fill } }));

  // Untrack is destructive (it also drops the journal notes) — snapshot both
  // before removal so the toast's Undo can restore them verbatim.
  const handleUntrack = (id: string) => {
    const removed = trackedSetups.find(t => t.id === id);
    const removedJournal = journal[id];
    untrackSetup(id);
    setJournal(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (removed) {
      toast(`Untracked ${removed.contract}${removedJournal?.notes ? ' — notes removed' : ''}`, 'info', {
        label: 'Undo',
        onClick: () => {
          restoreSetup(removed);
          if (removedJournal) setJournal(prev => ({ ...prev, [id]: removedJournal }));
        },
      });
    }
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
        const fill = entry?.fill;
        // A half-typed fill marks nothing — isUsableFill is the gate, so a row
        // with an entry price and no size stays a bookmark rather than a
        // position worth $NaN.
        const mark = isUsableFill(fill) ? markPosition(fill, live.mid) : undefined;
        const status = override ?? autoStatus(live, expired);
        const scoreDelta = live.score - tracked.scoreAtTrack;

        const attention: string[] = [];
        if (status !== 'closed') {
          if (live.verdict === 'EXIT') attention.push('Engine reads FADED');
          if (expiringSoon) attention.push('Expires within a day');
          if (scoreDelta < 0) attention.push(`Score ${scoreDelta} vs track`);
        }

        return { tracked, live, expired, expiringSoon, override, status, notes, fill, mark, scoreDelta, attention };
      }),
    [liveData, journal]
  );

  /** The operator's own book — only the rows that carry a recorded fill. */
  const book = useMemo(
    () => bookTotals(rows.map(r => r.mark).filter((m): m is PositionMark => m != null)),
    [rows]
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
        subtitle="Every tracked setup in one table — set a status, keep notes, and read each one's current signal. Saved in this browser."
      />

      {/* Empty state — a dense "get started" surface, not a blank panel */}
      {trackedSetups.length === 0 ? (
        <div className="flex flex-col gap-4 animate-view-in">
          <Panel className="w-full" bodyClassName="py-6 px-6 flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1 min-w-0">
              <div className="inline-flex w-11 h-11 rounded-lg border border-borderSubtle bg-inset items-center justify-center mb-3">
                <Bookmark className="w-5 h-5 text-select" />
              </div>
              <h2 className="text-lg font-semibold text-textPrimary">Nothing on watch yet</h2>
              <p className="mt-1.5 text-data text-textSecondary leading-relaxed max-w-xl">
                The Tracker keeps your best ideas in one table and re-reads each one's score, signal and health from the
                current market read every time you open it. Bookmark something from any desk below, then set a status and keep
                notes as your thesis plays out.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 shrink-0">
              {[
                { k: 'Setups', v: 'one table', s: 'seven saved views' },
                { k: 'Read', v: 'current', s: 'recomputed on open' },
                { k: 'Notes', v: 'saved', s: 'in this browser' },
              ].map(x => (
                <div key={x.k} className="border border-borderSubtle bg-inset rounded-lg px-3 py-2.5 text-center min-w-[92px]">
                  <div className="font-mono text-micro uppercase tracking-widest text-textMuted">{x.k}</div>
                  <div className="mt-1 font-mono text-body font-semibold text-textPrimary leading-5">{x.v}</div>
                  <div className="mt-0.5 text-micro text-textMuted">{x.s}</div>
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { icon: Compass, title: 'Compass setups', body: 'Graded QUALIFIED / WATCH / FADED setups with a full plan.', to: '/compass', cta: 'Open Compass' },
              { icon: Scale, title: 'Contract Weigher', body: 'Weeklies, swings & LEAPS scored STRONG / WATCH / WEAK.', to: '/compass', cta: 'Weigh contracts' },
              { icon: Radar, title: 'Trace flow', body: 'Notable options prints and dark-pool blocks.', to: '/trace/scanner', cta: 'Open Trace' },
              { icon: CalendarClock, title: 'Earnings prints', body: 'Implied-vs-realized reads graded QUALIFIED / RICH / NO EDGE.', to: '/earnings', cta: 'Open Earnings' },
            ].map(card => (
              <div key={card.title} className="inst-surface rounded-md p-4 flex flex-col gap-2.5">
                <span className="inline-flex w-8 h-8 rounded-md border border-borderSubtle bg-inset items-center justify-center">
                  <card.icon className="w-4 h-4 text-textSecondary" />
                </span>
                <h3 className="font-mono text-label font-semibold uppercase tracking-wider text-textPrimary">{card.title}</h3>
                <p className="text-label text-textMuted leading-relaxed flex-1">{card.body}</p>
                <button
                  onClick={() => navigate(card.to)}
                  className="mt-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-borderSubtle bg-white/[0.03] hover:bg-rowHover text-textSecondary hover:text-textPrimary font-mono text-micro font-semibold uppercase tracking-wider transition-colors"
                >
                  {card.cta} <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : !marketData ? (
        <div className="flex flex-col gap-4 animate-view-in">
          <MetricGrid min="150px">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[68px] rounded-md" />
            ))}
          </MetricGrid>
          <Panel flush bodyClassName="p-4">
            <SkeletonRows rows={6} />
          </Panel>
        </div>
      ) : (
        <div className="flex flex-col gap-4 animate-view-in">
          {/* Summary strip — counts over the tracked book */}
          <MetricGrid min="150px">
            <StatCard label="Tracked" value={`${rows.length}`} sub="in your book" tone="neutral" />
            <StatCard
              label="Triggered"
              value={`${counts.triggered}`}
              sub="engine reads QUALIFIED"
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

          {/*
            The real book, and only when there is one.

            It sits apart from the counts above because it is a different kind of
            number: those are the engine's read on setups, this is the operator's
            own record. The strip stays hidden until a fill exists rather than
            showing four zeroes, because an empty P&L reads as a flat book and
            what it actually means is that nothing has been entered.
          */}
          {book.recorded > 0 && (
            <MetricGrid min="150px">
              <StatCard label="Positions" value={`${book.recorded}`} sub={`${book.open} open · ${book.closed} closed`} tone="neutral" />
              <StatCard label="Committed" value={usd(book.committed)} sub="cost of what is open" tone="neutral" />
              <StatCard
                label="Open P&L"
                value={usd(book.openPnl)}
                sub="marked at the current mid"
                tone={book.openPnl === 0 ? 'neutral' : book.openPnl > 0 ? 'bull' : 'bear'}
              />
              <StatCard
                label="Realized"
                value={usd(book.realizedPnl)}
                sub={
                  book.statsReady
                    ? `over ${book.closed} closed`
                    : `${book.closed} of ${MIN_BOOK_FOR_STATS} closed — no win rate yet`
                }
                tone={book.realizedPnl === 0 ? 'neutral' : book.realizedPnl > 0 ? 'bull' : 'bear'}
              />
            </MetricGrid>
          )}

          {/* Saved-view tabs */}
          <div className="flex items-center gap-3 flex-wrap">
            <SegmentedControl ariaLabel="Tracker view" options={viewOptions} value={view} onChange={setView} />
            <span className="font-mono text-label text-textMuted uppercase tracking-wider">{VIEW_HINT[view]}</span>
          </div>

          {/* One primary table + per-item editor. items-stretch keeps the table
              panel as tall as the (inherently tall) item editor, so a quiet lane
              never leaves a void beside it — the book overview fills the base. */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
            <Panel title="Tracked setups" subtitle={VIEWS.find(v => v.value === view)?.label} flush className="xl:col-span-8" bodyClassName="flex flex-col">
              <DataTable
                columns={COLUMNS}
                rows={visibleRows}
                rowKey={r => r.tracked.id}
                onRowClick={r => setSelectedId(r.tracked.id)}
                selectedKey={selected?.tracked.id ?? null}
                maxHeight="max(560px, 62vh)"
                emptyText={`Nothing in ${VIEWS.find(v => v.value === view)?.label}`}
              />
              {/* Book across lanes — anchors the base of the panel and doubles as
                  cross-lane nav so a quiet view still points to where the book sits. */}
              <div className="mt-auto border-t border-borderSubtle px-4 py-3.5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-micro uppercase tracking-widest text-textMuted">Book across lanes</span>
                  <span className="font-mono text-micro tnum text-textMuted">{rows.length} tracked</span>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-white/[0.05]" role="img" aria-label="Distribution of tracked setups across status lanes">
                  {STATUS_LANES.map(s => {
                    const pct = (counts[s.key] / (rows.length || 1)) * 100;
                    return counts[s.key] > 0 ? (
                      <span
                        key={s.key}
                        onMouseEnter={e => setLaneHover({ label: s.label, count: counts[s.key], pct, x: e.clientX, y: e.clientY })}
                        onMouseMove={e => setLaneHover({ label: s.label, count: counts[s.key], pct, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setLaneHover(h => (h && h.label === s.label ? null : h))}
                        className={`${s.bar} cursor-crosshair`}
                        style={{ width: `${pct}%` }}
                      />
                    ) : null;
                  })}
                </div>
                {laneHover && (
                  <HoverReadout x={laneHover.x} y={laneHover.y}>
                    <div className="font-mono text-caption font-bold text-textPrimary">{laneHover.label}</div>
                    <div className="mt-0.5 font-mono text-micro uppercase tracking-wider text-textMuted">
                      <span className="text-textPrimary tnum">{laneHover.count}</span> tracked
                    </div>
                    <div className="mt-0.5 font-mono text-micro text-textSecondary">
                      <span className="tnum">{laneHover.pct.toFixed(0)}%</span> of book
                    </div>
                  </HoverReadout>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_LANES.map(s => (
                    <button
                      key={s.key}
                      onClick={() => setView(s.key)}
                      aria-pressed={view === s.key}
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border font-mono text-label uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60 ${
                        view === s.key
                          ? 'border-select/40 bg-select/[0.06] text-textPrimary'
                          : 'border-borderSubtle text-textSecondary hover:text-textPrimary hover:bg-rowHover'
                      }`}
                    >
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.dot}`} />
                      {s.label} <span className="tnum text-textMuted">{counts[s.key]}</span>
                    </button>
                  ))}
                </div>
              </div>
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
                  onFill={setFill}
                  onReview={handleReview}
                  onUntrack={handleUntrack}
                />
              ) : (
                <div className="h-48 flex flex-col items-center justify-center gap-2 text-center">
                  <Bookmark className="w-5 h-5 text-textMuted" />
                  <span className="font-mono text-label text-textSecondary uppercase tracking-wider">No item selected</span>
                  <span className="text-label text-textMuted max-w-[220px] leading-relaxed">
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
