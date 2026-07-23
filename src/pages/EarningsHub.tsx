import { useMemo, useState, useEffect } from 'react';
import { CalendarClock, Crosshair, Star, Bell, GitCompare, X, SlidersHorizontal } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import TickerJump from '../components/ui/TickerJump';
import Panel from '../components/ui/Panel';
import StatCard from '../components/ui/StatCard';
import MetricGrid from '../components/ui/MetricGrid';
import SignalBadge from '../components/ui/SignalBadge';
import SegmentedControl from '../components/ui/SegmentedControl';
import DataTable, { type Column } from '../components/ui/DataTable';
import { buildEarningsCalendar, type EarningsEvent, type EarningsVerdict } from '../data/earnings';
import EarningsIntel from '../components/earnings/EarningsIntel';
import { toneText, type Tone } from '../components/ui/tones';

type VerdictFilter = 'ALL' | EarningsVerdict;

const FILTER_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'PLAY', label: 'Plays' },
  { value: 'FADE', label: 'Fades' },
  { value: 'SKIP', label: 'Skips' },
] as const;

// Date/week windows read straight off the existing daysOut field — no new data.
type WindowFilter = 'ALL' | 'TODAY' | 'WK1' | 'WK2';
const WINDOW_OPTIONS = [
  { value: 'ALL', label: 'All dates' },
  { value: 'TODAY', label: 'Today' },
  { value: 'WK1', label: 'This wk' },
  { value: 'WK2', label: 'Next wk' },
] as const;
const inWindow = (e: EarningsEvent, w: WindowFilter): boolean => {
  if (w === 'ALL') return true;
  if (w === 'TODAY') return e.daysOut === 0;
  if (w === 'WK1') return e.daysOut <= 6;
  return e.daysOut >= 7; // WK2 — the back half of the two-week slate
};

const WATCHLIST_KEY = 'slayer.earnings.watchlist';

// PLAY = green (buy the event), FADE = amber caution (premium's too rich), SKIP = neutral.
// Magenta stays reserved for the king/standout signal, not a verdict.
const verdictTone: Record<EarningsVerdict, Tone> = {
  PLAY: 'bull',
  FADE: 'warn',
  SKIP: 'neutral',
};

/*
  Report-time confirmation is INFERRED from proximity: prints inside the near-term
  window carry a confirmed date/slot, further-out ones are still analyst-estimated
  until the company confirms. This is purely a read of the existing daysOut field,
  labeled honestly as inferred — no new datum invented.
*/
const CONFIRM_WINDOW = 4; // sessions
const reportConfirmed = (e: EarningsEvent): boolean => e.daysOut <= CONFIRM_WINDOW;

// ---- Trade-read framing, all off existing EarningsEvent fields ----------------

/** Edge = the straddle mispricing, straight off the existing richness field. */
const edgeRead = (e: EarningsEvent): { label: string; tone: Tone } => {
  if (e.richness <= 0.85) return { label: 'Vol cheap', tone: 'bull' };
  if (e.richness >= 1.3) return { label: 'Vol rich', tone: 'warn' };
  return { label: 'Vol fair', tone: 'neutral' };
};

/** Signed implied − realized gap, in points — the raw edge behind richness. */
const edgePtsLabel = (e: EarningsEvent): string => {
  const d = e.impliedMovePct - e.histAvgMovePct;
  return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}pt`;
};

/**
 * Conviction = how many directional sleeves already lean the same way. Reuses the
 * exact categorizations the board already renders (revisions >0.15, flow >0.2,
 * setup ≥62). A tally of existing signals, not a new score.
 */
const dirVote = (e: EarningsEvent): { rev: number; flow: number; setup: number; net: number; aligned: number } => {
  const rev = e.revisionTrend > 0.15 ? 1 : e.revisionTrend < -0.15 ? -1 : 0;
  const flow = e.flowLean > 0.2 ? 1 : e.flowLean < -0.2 ? -1 : 0;
  const setup = e.technicalScore >= 62 ? 1 : e.technicalScore <= 40 ? -1 : 0;
  const votes = [rev, flow, setup];
  const up = votes.filter(v => v > 0).length;
  const down = votes.filter(v => v < 0).length;
  return { rev, flow, setup, net: rev + flow + setup, aligned: Math.max(up, down) };
};

interface Conviction {
  label: string;
  tone: Tone;
  dir: 'UP' | 'DOWN' | 'MIXED';
  aligned: number;
}
const convictionRead = (e: EarningsEvent): Conviction => {
  const { net, aligned } = dirVote(e);
  const dir = net > 0 ? 'UP' : net < 0 ? 'DOWN' : 'MIXED';
  const dirTone: Tone = net > 0 ? 'bull' : net < 0 ? 'bear' : 'warn';
  if (aligned >= 3) return { label: 'High', tone: dirTone, dir, aligned };
  if (aligned === 2 && dir !== 'MIXED') return { label: 'Moderate', tone: dirTone, dir, aligned };
  return { label: 'Split', tone: 'warn', dir: 'MIXED', aligned };
};

/** The risk-defined structure the verdict + richness imply — mirrors the engine. */
const structureRead = (e: EarningsEvent): { label: string; risk: string; tone: Tone } => {
  const { net } = dirVote(e);
  if (e.richness <= 0.85) return { label: 'Long straddle', risk: 'risk = debit paid', tone: 'bull' };
  if (e.richness >= 1.3) {
    if (e.verdict === 'PLAY') return { label: net >= 0 ? 'Call vertical' : 'Put vertical', risk: 'risk = defined debit', tone: 'bull' };
    return { label: 'Iron condor', risk: 'risk = wings defined', tone: 'magenta' };
  }
  if (e.verdict === 'PLAY') return { label: net >= 0 ? 'Call spread' : 'Put spread', risk: 'risk = defined debit', tone: 'bull' };
  return { label: 'Day-2 continuation', risk: 'no pre-print risk', tone: 'neutral' };
};

/** Implied vs realized, drawn against each other — the whole edge in one glance. */
const MoveCompare = ({ implied, hist }: { implied: number; hist: number }) => {
  const max = Math.max(implied, hist, 1);
  return (
    <span className="flex flex-col gap-1 w-full py-0.5">
      <span className="flex items-center gap-1.5">
        <span className="w-7 font-mono text-micro uppercase text-textMuted">imp</span>
        <span className="flex-1 h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
          <span className="block h-full rounded-full holo-bar" style={{ width: `${(implied / max) * 100}%` }} />
        </span>
        <span className="w-11 font-mono text-label text-textPrimary tnum text-right">{implied.toFixed(1)}%</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-7 font-mono text-micro uppercase text-textMuted">real</span>
        <span className="flex-1 h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
          <span className="block h-full rounded-full bg-white/30" style={{ width: `${(hist / max) * 100}%` }} />
        </span>
        <span className="w-11 font-mono text-label text-textSecondary tnum text-right">{hist.toFixed(1)}%</span>
      </span>
    </span>
  );
};

/** Confirmed / estimated report-time indicator, inferred from proximity. */
const ReportTimeTag = ({ e }: { e: EarningsEvent }) => {
  const confirmed = reportConfirmed(e);
  return (
    <span
      title={
        confirmed
          ? 'Report date & slot inferred confirmed — inside the near-term window'
          : 'Report date estimated — further-out prints stay analyst-estimated until the company confirms'
      }
      className={`inline-flex items-center gap-1 font-mono text-label uppercase tracking-wider ${
        confirmed ? 'text-textSecondary' : 'text-warn'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${confirmed ? 'bg-textSecondary' : 'bg-warn'}`} />
      {confirmed ? 'confirmed' : 'est.'}
    </span>
  );
};

/** Tiny star toggle for the earnings watchlist — sits in the leading column. */
const WatchStar = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
  <button
    onClick={e => {
      e.stopPropagation();
      onClick();
    }}
    aria-pressed={on}
    aria-label={on ? 'Remove from watchlist' : 'Add to watchlist'}
    className={`inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
      on ? 'text-select' : 'text-textMuted hover:text-textSecondary'
    }`}
  >
    <Star className={`w-3.5 h-3.5 ${on ? 'fill-current' : ''}`} />
  </button>
);

/** Three signal chips (revisions / flow / setup) that back the conviction read. */
const VoteChips = ({ e }: { e: EarningsEvent }) => {
  const { rev, flow, setup } = dirVote(e);
  const chip = (label: string, v: number) => (
    <span className={`font-mono text-label ${v > 0 ? 'text-bull' : v < 0 ? 'text-bear' : 'text-textMuted'}`}>
      {label}
      {v > 0 ? '▲' : v < 0 ? '▼' : '—'}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-2">
      {chip('rev', rev)}
      {chip('flow', flow)}
      {chip('set', setup)}
    </span>
  );
};

// Slot maps to the US bell it prints around — BMO ≈ pre-open, AMC ≈ after the close.
const targetTime = (e: EarningsEvent): number => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + e.daysOut);
  d.setHours(e.slot === 'BMO' ? 8 : 16, e.slot === 'BMO' ? 30 : 0, 0, 0);
  return d.getTime();
};
const pad = (n: number) => String(n).padStart(2, '0');

/** Live countdown to the next tracked print, with a bell to arm/disarm the alert. */
const AlertCountdown = ({
  event,
  armed,
  watched,
  onArm,
  onOpen,
}: {
  event: EarningsEvent;
  armed: boolean;
  watched: boolean;
  onArm: () => void;
  onOpen: () => void;
}) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = targetTime(event) - now;
  const live = ms <= 0;
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const dd = Math.floor(totalSec / 86400);
  const hh = Math.floor((totalSec % 86400) / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  const st = structureRead(event);

  return (
    <div className="inst-surface rounded-md flex items-center gap-3 px-4 py-2.5 flex-wrap">
      <span
        className={`inline-flex w-8 h-8 rounded-md items-center justify-center shrink-0 border ${
          armed ? 'border-select/40 bg-select/10 text-select' : 'border-borderSubtle bg-white/[0.02] text-textMuted'
        }`}
      >
        <Bell className={`w-4 h-4 ${armed ? 'fill-current' : ''}`} />
      </span>
      <div className="flex flex-col min-w-0">
        <span className="font-mono text-label uppercase tracking-widest text-textMuted">
          {watched ? 'Next watched print · alert' : 'Next print · alert countdown'}
        </span>
        <button
          onClick={onOpen}
          className="text-left font-mono text-sm font-bold text-textPrimary hover:text-select transition-colors truncate"
        >
          {event.ticker} · {event.dateLabel} {event.slot} · {st.label}
        </button>
      </div>

      <div className="ml-auto flex items-center gap-3 flex-wrap">
        <ReportTimeTag e={event} />
        {live ? (
          <SignalBadge tone="warn" dot pulse>
            On the tape
          </SignalBadge>
        ) : (
          <span className="font-mono text-xl font-bold tnum text-textPrimary tabular-nums">
            {dd > 0 && <span className="text-select">{dd}d </span>}
            {pad(hh)}:{pad(mm)}:{pad(ss)}
          </span>
        )}
        <button
          onClick={onArm}
          aria-pressed={armed}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border font-mono text-label uppercase tracking-wider transition-colors ${
            armed
              ? 'border-select/40 bg-select/10 text-select'
              : 'border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary hover:border-borderMuted'
          }`}
        >
          <Bell className={`w-3 h-3 ${armed ? 'fill-current' : ''}`} />
          {armed ? 'Alert armed' : 'Arm alert'}
        </button>
      </div>
    </div>
  );
};

/** The three-part read that replaces a bare PLAY / FADE. */
const TradeRead = ({ e }: { e: EarningsEvent }) => {
  const edge = edgeRead(e);
  const conv = convictionRead(e);
  const st = structureRead(e);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <SignalBadge tone={verdictTone[e.verdict]}>{e.verdict}</SignalBadge>
        <span className="font-mono text-label text-textPrimary">{st.label}</span>
      </div>
      <div className="flex items-center gap-2 font-mono text-label whitespace-nowrap">
        <span className={toneText[edge.tone]}>{edge.label}</span>
        <span className="text-textMuted tnum">{edgePtsLabel(e)}</span>
        <span className="text-textMuted">·</span>
        <span className={toneText[conv.tone]}>
          {conv.dir === 'MIXED' ? 'split' : `${conv.dir.toLowerCase()} ${conv.label.toLowerCase()}`}
        </span>
      </div>
    </div>
  );
};

const EarningsHub = () => {
  const events = useMemo(() => buildEarningsCalendar(), []);
  const [filter, setFilter] = useState<VerdictFilter>('ALL');
  const [windowFilter, setWindowFilter] = useState<WindowFilter>('ALL');
  const [watchOnly, setWatchOnly] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSet, setCompareSet] = useState<Set<string>>(new Set());
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const [watchlist, setWatchlist] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(WATCHLIST_KEY);
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...watchlist]));
    } catch {
      /* storage unavailable — keep the session-only set */
    }
  }, [watchlist]);

  const toggleWatch = (ticker: string) =>
    setWatchlist(prev => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  const toggleCompare = (ticker: string) =>
    setCompareSet(prev => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });

  const rows = useMemo(
    () =>
      events.filter(
        e =>
          (filter === 'ALL' || e.verdict === filter) &&
          inWindow(e, windowFilter) &&
          (!watchOnly || watchlist.has(e.ticker))
      ),
    [events, filter, windowFilter, watchOnly, watchlist]
  );
  const selected = events.find(e => e.ticker === selectedTicker) ?? null;
  const compared = events.filter(e => compareSet.has(e.ticker));

  const plays = events.filter(e => e.verdict === 'PLAY');
  const fades = events.filter(e => e.verdict === 'FADE');
  const richest = [...events].sort((a, b) => b.richness - a.richness)[0];
  const cheapest = [...events].sort((a, b) => a.richness - b.richness)[0];
  const next = [...events].sort((a, b) => a.daysOut - b.daysOut)[0];
  const nextWatched = [...events].filter(e => watchlist.has(e.ticker)).sort((a, b) => a.daysOut - b.daysOut)[0];
  const alertEvent = nextWatched ?? next;

  // Group the next stretch of sessions into a calendar strip
  const byDay = useMemo(() => {
    const map = new Map<string, EarningsEvent[]>();
    for (const e of events) {
      const list = map.get(e.dateLabel) ?? [];
      list.push(e);
      map.set(e.dateLabel, list);
    }
    return [...map.entries()];
  }, [events]);

  const columns: Column<EarningsEvent>[] = [
    {
      key: 'watch',
      header: '',
      width: '34px',
      render: e => <WatchStar on={watchlist.has(e.ticker)} onClick={() => toggleWatch(e.ticker)} />,
    },
    ...(compareMode
      ? [
          {
            key: 'compare',
            header: 'Cmp',
            width: '44px',
            render: (e: EarningsEvent) => (
              <button
                onClick={ev => {
                  ev.stopPropagation();
                  toggleCompare(e.ticker);
                }}
                aria-pressed={compareSet.has(e.ticker)}
                aria-label={compareSet.has(e.ticker) ? 'Remove from compare' : 'Add to compare'}
                className={`inline-flex items-center justify-center w-5 h-5 rounded border transition-colors ${
                  compareSet.has(e.ticker)
                    ? 'border-select/40 bg-select/15 text-select'
                    : 'border-borderMuted text-textMuted hover:text-textSecondary'
                }`}
              >
                {compareSet.has(e.ticker) ? '✓' : ''}
              </button>
            ),
          } as Column<EarningsEvent>,
        ]
      : []),
    {
      key: 'ticker',
      header: 'Name',
      sortValue: e => e.ticker,
      render: e => (
        <span className="flex flex-col">
          <span className="font-mono text-xs font-bold text-textPrimary">{e.ticker}</span>
          <span className="text-label text-textMuted truncate">{e.name}</span>
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Reports',
      sortValue: e => e.daysOut,
      render: e => (
        <span className="flex flex-col gap-0.5">
          <span className="font-mono text-xs text-textPrimary">{e.dateLabel}</span>
          <span className="font-mono text-label text-textMuted">
            {e.slot} · {e.daysOut === 0 ? 'today' : `${e.daysOut}d out`}
          </span>
          <ReportTimeTag e={e} />
        </span>
      ),
    },
    {
      key: 'move',
      header: 'Implied vs realized',
      width: '190px',
      sortValue: e => e.richness,
      render: e => <MoveCompare implied={e.impliedMovePct} hist={e.histAvgMovePct} />,
    },
    {
      key: 'rich',
      header: 'Rich',
      align: 'right',
      sortValue: e => e.richness,
      render: e => (
        <span className={`font-mono text-xs font-semibold tnum ${e.richness >= 1.3 ? 'text-warn' : e.richness <= 0.85 ? 'text-bull' : 'text-textSecondary'}`}>
          {e.richness.toFixed(2)}×
        </span>
      ),
    },
    {
      key: 'beat',
      header: 'Beat 8q',
      align: 'right',
      sortValue: e => e.beatRate8q,
      render: e => <span className="font-mono text-xs text-textSecondary tnum">{e.beatRate8q}%</span>,
    },
    {
      key: 'rev',
      header: 'Revisions',
      align: 'right',
      sortValue: e => e.revisionTrend,
      render: e => (
        <span className={`font-mono text-xs tnum ${e.revisionTrend > 0.15 ? 'text-bull' : e.revisionTrend < -0.15 ? 'text-bear' : 'text-textMuted'}`}>
          {e.revisionTrend > 0.15 ? '▲ rising' : e.revisionTrend < -0.15 ? '▼ falling' : '— flat'}
        </span>
      ),
    },
    {
      key: 'tech',
      header: 'Setup',
      align: 'right',
      sortValue: e => e.technicalScore,
      render: e => (
        <span className={`font-mono text-xs tnum ${e.technicalScore >= 62 ? 'text-bull' : e.technicalScore <= 40 ? 'text-bear' : 'text-textSecondary'}`}>
          {e.technicalScore}
        </span>
      ),
    },
    {
      key: 'ivr',
      header: 'IVR',
      align: 'right',
      sortValue: e => e.ivRank,
      render: e => <span className="font-mono text-xs text-textSecondary tnum">{e.ivRank}</span>,
    },
    {
      key: 'call',
      header: 'Trade read',
      width: '210px',
      sortValue: e => e.verdict,
      render: e => <TradeRead e={e} />,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Earnings']}
        title="Earnings Hub"
        subtitle="Every upcoming print priced: implied vs what it actually moves — edge, conviction and the risk-defined structure for each"
        actions={<SegmentedControl ariaLabel="Verdict filter" options={FILTER_OPTIONS} value={filter} onChange={setFilter} />}
      />

      <MetricGrid min="170px">
        <StatCard label="Reports tracked" value={events.length} sub="next two weeks" />
        <StatCard label="Playable" value={plays.length} sub="edge worth taking" tone="bull" />
        <StatCard label="Fade list" value={fades.length} sub="premium overpriced" tone="magenta" />
        <StatCard
          label="Richest straddle"
          value={richest ? `${richest.ticker} ${richest.richness.toFixed(2)}×` : '--'}
          sub={richest ? `implied ${richest.impliedMovePct.toFixed(1)}% vs ${richest.histAvgMovePct.toFixed(1)}% real` : ''}
          tone="warn"
        />
        <StatCard
          label="Cheapest straddle"
          value={cheapest ? `${cheapest.ticker} ${cheapest.richness.toFixed(2)}×` : '--'}
          sub={cheapest ? `market under-pricing an ${cheapest.histAvgMovePct.toFixed(1)}% mover` : ''}
          tone="bull"
        />
      </MetricGrid>

      {/* Alert countdown — live clock to the next (or next watched) print */}
      {alertEvent && (
        <AlertCountdown
          event={alertEvent}
          watched={!!nextWatched}
          armed={watchlist.has(alertEvent.ticker)}
          onArm={() => toggleWatch(alertEvent.ticker)}
          onOpen={() => setSelectedTicker(alertEvent.ticker)}
        />
      )}

      {/* Calendar strip */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5" /> The slate
          </span>
        }
        subtitle="who reports when"
        flush
      >
        <div className="flex overflow-x-auto divide-x divide-borderSubtle">
          {byDay.map(([label, list]) => (
            <div key={label} className="min-w-[140px] flex-1 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-label font-semibold uppercase tracking-widest text-textMuted">{label}</span>
                {!reportConfirmed(list[0]) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-warn" title="Estimated date — not yet confirmed" />
                )}
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {list.map(e => (
                  <button
                    key={e.ticker}
                    onClick={() => setSelectedTicker(prev => (prev === e.ticker ? null : e.ticker))}
                    className={`flex items-center gap-2 rounded px-1.5 py-1 text-left transition-colors ${
                      selectedTicker === e.ticker ? 'bg-select/[0.08]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    {watchlist.has(e.ticker) && <Star className="w-3 h-3 shrink-0 text-select fill-current" />}
                    <span className="font-mono text-caption font-bold text-textPrimary">{e.ticker}</span>
                    <span className="font-mono text-micro text-textMuted">{e.slot}</span>
                    <SignalBadge tone={verdictTone[e.verdict]} className="ml-auto">
                      {e.verdict}
                    </SignalBadge>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Strategy comparison tray — selected prints, side by side */}
      {compared.length > 0 && (
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <GitCompare className="w-3.5 h-3.5" /> Strategy compare
            </span>
          }
          subtitle={`${compared.length} print${compared.length > 1 ? 's' : ''} · edge · conviction · structure`}
          tone="select"
          actions={
            <button
              onClick={() => setCompareSet(new Set())}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-borderSubtle bg-white/[0.02] font-mono text-label uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          }
          flush
        >
          <div className="flex gap-px bg-borderSubtle overflow-x-auto">
            {compared.map(e => {
              const edge = edgeRead(e);
              const conv = convictionRead(e);
              const st = structureRead(e);
              return (
                <div key={e.ticker} className="bg-panel px-3.5 py-3 flex flex-col gap-2.5 min-w-[220px]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-bold text-textPrimary">{e.ticker}</div>
                      <div className="text-label text-textMuted truncate">
                        {e.dateLabel} {e.slot}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleCompare(e.ticker)}
                      aria-label={`Remove ${e.ticker} from compare`}
                      className="shrink-0 text-textMuted hover:text-textSecondary transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <SignalBadge tone={verdictTone[e.verdict]}>{e.verdict}</SignalBadge>
                    <ReportTimeTag e={e} />
                  </div>

                  <div className="flex flex-col gap-1.5 pt-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-label uppercase tracking-wider text-textMuted">Edge</span>
                      <span className={`font-mono text-caption font-semibold ${toneText[edge.tone]}`}>
                        {edge.label} <span className="text-textMuted tnum">{e.richness.toFixed(2)}×</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-label uppercase tracking-wider text-textMuted">Conviction</span>
                      <span className={`font-mono text-caption font-semibold ${toneText[conv.tone]}`}>
                        {conv.dir === 'MIXED' ? 'Split' : `${conv.dir} ${conv.label}`}
                      </span>
                    </div>
                    <div className="flex items-center justify-end">
                      <VoteChips e={e} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-label uppercase tracking-wider text-textMuted">Structure</span>
                      <span className={`font-mono text-caption font-semibold ${toneText[st.tone]}`}>{st.label}</span>
                    </div>
                    <div className="text-right font-mono text-label text-textMuted">{st.risk}</div>
                  </div>

                  <div className="pt-1 border-t border-borderSubtle">
                    <MoveCompare implied={e.impliedMovePct} hist={e.histAvgMovePct} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Main table + selected trade plan */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Crosshair className="w-3.5 h-3.5" /> The board
          </span>
        }
        subtitle="click a row for the strategy"
        flush
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline font-mono text-label text-textMuted tnum">
              {rows.length}/{events.length}
            </span>
            <button
              onClick={() => setWatchOnly(w => !w)}
              aria-pressed={watchOnly}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded border font-mono text-label uppercase tracking-wider transition-colors ${
                watchOnly
                  ? 'border-select/40 bg-select/10 text-select'
                  : 'border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary hover:border-borderMuted'
              }`}
            >
              <Star className={`w-3 h-3 ${watchOnly ? 'fill-current' : ''}`} /> Watchlist
            </button>
            <button
              onClick={() => setCompareMode(m => !m)}
              aria-pressed={compareMode}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded border font-mono text-label uppercase tracking-wider transition-colors ${
                compareMode
                  ? 'border-select/40 bg-select/10 text-select'
                  : 'border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary hover:border-borderMuted'
              }`}
            >
              <GitCompare className="w-3 h-3" /> Compare
            </button>
          </div>
        }
      >
        {/* Filter toolbar — date window + watchlist scope */}
        <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-b border-borderSubtle bg-inset">
          <SlidersHorizontal className="w-3.5 h-3.5 text-textMuted shrink-0" />
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-label uppercase tracking-widest text-textMuted">Window</span>
            <SegmentedControl ariaLabel="Date window" options={WINDOW_OPTIONS} value={windowFilter} onChange={setWindowFilter} />
          </div>
          <span className="inline-flex items-center gap-1.5 font-mono text-label uppercase tracking-wider text-textMuted">
            <span className="w-1.5 h-1.5 rounded-full bg-textSecondary" /> confirmed
            <span className="w-1.5 h-1.5 rounded-full bg-warn ml-2" /> estimated
          </span>
        </div>

        {selected && (
          <div className="px-4 py-3 border-b border-borderSubtle bg-inset flex flex-col gap-2.5 animate-soft-in">
            <div className="flex items-center gap-2 flex-wrap">
              <WatchStar on={watchlist.has(selected.ticker)} onClick={() => toggleWatch(selected.ticker)} />
              <SignalBadge tone={verdictTone[selected.verdict]}>{selected.verdict}</SignalBadge>
              <span className="font-mono text-xs font-bold text-textPrimary">
                {selected.ticker} · {selected.dateLabel} {selected.slot}
              </span>
              <ReportTimeTag e={selected} />
              <span className="font-mono text-label text-textMuted">
                implied {selected.impliedMovePct.toFixed(1)}% · realized {selected.histAvgMovePct.toFixed(1)}% ·{' '}
                {selected.richness.toFixed(2)}×
              </span>
              <TickerJump ticker={selected.ticker} horizon="WEEKLIES" className="ml-auto" />
            </div>

            {/* Edge · conviction · structure — the read that replaces a bare call */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(() => {
                const edge = edgeRead(selected);
                const conv = convictionRead(selected);
                const st = structureRead(selected);
                return (
                  <>
                    <div className="inst-surface rounded-md px-3 py-2">
                      <div className="font-mono text-label uppercase tracking-widest text-textMuted">Edge</div>
                      <div className={`mt-1 font-mono text-sm font-semibold ${toneText[edge.tone]}`}>
                        {edge.label} <span className="text-textMuted tnum text-caption">{edgePtsLabel(selected)}</span>
                      </div>
                    </div>
                    <div className="inst-surface rounded-md px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-label uppercase tracking-widest text-textMuted">Conviction</span>
                        <VoteChips e={selected} />
                      </div>
                      <div className={`mt-1 font-mono text-sm font-semibold ${toneText[conv.tone]}`}>
                        {conv.dir === 'MIXED' ? 'Split signals' : `${conv.dir} · ${conv.label}`}
                      </div>
                    </div>
                    <div className="inst-surface rounded-md px-3 py-2">
                      <div className="font-mono text-label uppercase tracking-widest text-textMuted">Structure</div>
                      <div className={`mt-1 font-mono text-sm font-semibold ${toneText[st.tone]}`}>{st.label}</div>
                      <div className="font-mono text-label text-textMuted">{st.risk}</div>
                    </div>
                  </>
                );
              })()}
            </div>

            <p className="text-xs text-textPrimary leading-relaxed">{selected.strategy}</p>
            <p className="text-xs text-textSecondary leading-relaxed">{selected.rationale}</p>
          </div>
        )}
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={e => e.ticker}
          onRowClick={e => setSelectedTicker(prev => (prev === e.ticker ? null : e.ticker))}
          selectedKey={selectedTicker}
          initialSort={{ key: 'date', dir: 'asc' }}
          maxHeight="560px"
          emptyText="No prints match these filters"
        />
      </Panel>

      <EarningsIntel event={selected} />
    </>
  );
};

export default EarningsHub;
