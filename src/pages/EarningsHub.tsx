import { useMemo, useState, useEffect } from 'react';
import { CalendarClock, Crosshair, Star, Bell, GitCompare, X, SlidersHorizontal, Ticket, ChevronDown, ChevronRight, ArrowDown } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import TickerJump from '../components/ui/TickerJump';
import Panel from '../components/ui/Panel';
import StatCard from '../components/ui/StatCard';
import MetricGrid from '../components/ui/MetricGrid';
import SignalBadge from '../components/ui/SignalBadge';
import SegmentedControl from '../components/ui/SegmentedControl';
import Stat from '../components/ui/Stat';
import DataTable, { type Column } from '../components/ui/DataTable';
import {
  buildEarningsCalendar,
  buildEarningsPlays,
  directionVote,
  type EarningsEvent,
  type EarningsPlay,
  type EarningsVerdict,
} from '../data/earnings';
import { buildEarningsIntel, type EarningsIntelView } from '../data/earningsintel';
import EarningsIntel from '../components/earnings/EarningsIntel';
import { toneText, type Tone } from '../components/ui/tones';

type VerdictFilter = 'ALL' | EarningsVerdict;

const FILTER_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'PLAY', label: 'Qualified' },
  { value: 'FADE', label: 'Rich' },
  { value: 'SKIP', label: 'No edge' },
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
/** Anchor for the "full dossier" jump out of the selected-row read. */
const DOSSIER_ID = 'earnings-dossier';

// A verdict is a process state, so it takes the chrome tones — see the rule in
// compass/setupState.ts. QUALIFIED = silver (a structure qualifies), RICH =
// amber caution (premium favours the seller), NO EDGE = grey. Magenta stays
// reserved for the king/standout signal, not a verdict.
const verdictTone: Record<EarningsVerdict, Tone> = {
  PLAY: 'select',
  FADE: 'warn',
  SKIP: 'neutral',
};

/**
 * Observational labels, same rule as `compass/verdict.ts` and the Stocks
 * board: the engine keeps PLAY/FADE/SKIP, the screen states the condition.
 *
 * PLAY deliberately does NOT map to a price word — it fires on three different
 * conditions (rich premium with strong direction, cheap premium, fair premium
 * with direction), so anything about the premium would be wrong for two of the
 * three. What all three share is that a defined structure qualifies. FADE is
 * the one branch that IS a premium statement (richness >= 1.3 with no
 * direction), and SKIP is the absence of an edge.
 */
const VERDICT_LABEL: Record<EarningsVerdict, string> = {
  PLAY: 'QUALIFIED',
  FADE: 'RICH',
  SKIP: 'NO EDGE',
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

/**
 * Edge = the straddle mispricing, straight off the existing richness field.
 *
 * Cheap vol is silver, not green. Green on this page is the direction sleeves
 * (revisions, flow, setup, conviction) and nothing else; a straddle priced under
 * what the name realizes is a statement about the premium, not about which way
 * the print goes, and a cheap straddle is bought by bears as often as bulls. The
 * three tones here are the process vocabulary: select qualifies, warn cautions,
 * neutral is the absence of either.
 */
const edgeRead = (e: EarningsEvent): { label: string; tone: Tone } => {
  if (e.richness <= 0.85) return { label: 'Vol cheap', tone: 'select' };
  if (e.richness >= 1.3) return { label: 'Vol rich', tone: 'warn' };
  return { label: 'Vol fair', tone: 'neutral' };
};

/** Signed implied − realized gap, in points — the raw edge behind richness. */
const edgePtsLabel = (e: EarningsEvent): string => {
  const d = e.impliedMovePct - e.histAvgMovePct;
  return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}pt`;
};

interface Conviction {
  label: string;
  tone: Tone;
  dir: 'UP' | 'DOWN' | 'MIXED';
  aligned: number;
}
const convictionRead = (e: EarningsEvent): Conviction => {
  const { net, aligned } = directionVote(e);
  const dir = net > 0 ? 'UP' : net < 0 ? 'DOWN' : 'MIXED';
  const dirTone: Tone = net > 0 ? 'bull' : net < 0 ? 'bear' : 'warn';
  if (aligned >= 3) return { label: 'High', tone: dirTone, dir, aligned };
  if (aligned === 2 && dir !== 'MIXED') return { label: 'Moderate', tone: dirTone, dir, aligned };
  return { label: 'Split', tone: 'warn', dir: 'MIXED', aligned };
};

/**
 * The structure, read off the dossier instead of recomputed.
 *
 * This used to be a second derivation: the board re-scored richness and the
 * direction tally and named its own structure, while the dossier's
 * `buildEarningsIntel` named one from the skew and the state distribution. They
 * cut richness at different thresholds (0.85/1.3 vs 0.9/1.18) and picked a side
 * from different inputs, so the same print could read "Call spread" in the table
 * and "Put debit spread" in the dossier below it. Now there is one call and the
 * board is a projection of it.
 *
 * The tone stays chrome: a qualifying long structure is silver, the premium sale
 * keeps magenta, no structure is grey. Buying vol is not a bullish statement.
 */
const structureOf = (view: EarningsIntelView | undefined): { label: string; risk: string; tone: Tone } => {
  if (!view) return { label: 'no read', risk: '', tone: 'neutral' };
  if (view.recommended === 'LONG') return { label: view.longVol.name, risk: 'risk = debit paid', tone: 'select' };
  if (view.recommended === 'SHORT') return { label: view.shortVol.name, risk: 'risk = wings defined', tone: 'magenta' };
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
          <span className="block h-full rounded-full data-bar" style={{ width: `${(implied / max) * 100}%` }} />
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
          ? 'Report date and slot inferred confirmed: inside the near-term window'
          : 'Report date estimated: further-out prints stay analyst-estimated until the company confirms'
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
  const { rev, flow, setup } = directionVote(e);
  const chip = (label: string, v: number) => (
    <span className={`font-mono text-label ${v > 0 ? 'text-bull' : v < 0 ? 'text-bear' : 'text-textMuted'}`}>
      {label}
      {v > 0 ? '▲' : v < 0 ? '▼' : '·'}
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
  view,
  armed,
  watched,
  onArm,
  onOpen,
}: {
  event: EarningsEvent;
  view: EarningsIntelView | undefined;
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
  const st = structureOf(view);

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
          className="-my-1 py-1 text-left font-mono text-body font-bold text-textPrimary hover:text-select transition-colors truncate leading-5"
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

/** The three-part read that replaces a bare QUALIFIED / RICH badge. */
const TradeRead = ({ e, view }: { e: EarningsEvent; view: EarningsIntelView | undefined }) => {
  const edge = edgeRead(e);
  const conv = convictionRead(e);
  const st = structureOf(view);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <SignalBadge tone={verdictTone[e.verdict]}>{VERDICT_LABEL[e.verdict]}</SignalBadge>
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

/**
 * One earnings-lotto candidate: a contract you could type into a ticket, and
 * the odds the model and the tape each put on it landing there.
 *
 * The edge takes the silver accent, not green. It is a statement about who is
 * underpaying for an outcome, not about the market going up, and the semantic
 * green on this page belongs to direction.
 */
const PlayCard = ({ p, ticker, expiryLabel }: { p: EarningsPlay; ticker: string; expiryLabel: string }) => (
  <div className="inst-surface rounded-md px-3 py-2.5 flex flex-col gap-2">
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-mono text-body font-bold text-textPrimary leading-5">
        {ticker} {expiryLabel} {p.strike}
        {p.right}
      </span>
      <SignalBadge tone={p.kind === 'TAIL' ? 'magenta' : 'select'}>{p.kind === 'TAIL' ? 'Lotto strike' : 'Body strike'}</SignalBadge>
    </div>
    <div className="font-mono text-label text-textMuted">
      <span className="tnum text-textSecondary">
        {p.awayPct >= 0 ? '+' : '−'}
        {Math.abs(p.awayPct).toFixed(1)}%
      </span>{' '}
      away · {p.sigmas}× the implied move · {p.role}
    </div>
    <div className="grid grid-cols-3 gap-2">
      <Stat label="Model" value={`${p.modelProbPct.toFixed(0)}%`} sub={`lands ${p.stateLabel.toLowerCase()} or past`} align="right" />
      <Stat label="Priced" value={`${p.pricedProbPct.toFixed(0)}%`} sub="what the skew charges" align="right" />
      <Stat
        label="Edge"
        value={`${p.edgePts >= 0 ? '+' : '−'}${Math.abs(p.edgePts).toFixed(0)}pt`}
        tone={p.edgePts >= 0 ? 'select' : 'neutral'}
        sub="model less priced"
        align="right"
      />
    </div>
  </div>
);

const EarningsHub = () => {
  const events = useMemo(() => buildEarningsCalendar(), []);
  const [filter, setFilter] = useState<VerdictFilter>('ALL');
  const [windowFilter, setWindowFilter] = useState<WindowFilter>('ALL');
  const [watchOnly, setWatchOnly] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSet, setCompareSet] = useState<Set<string>>(new Set());
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);

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

  // One dossier per print, built once for the whole slate. Every structure the
  // page names now reads off this map, so the table, the compare tray and the
  // dossier at the bottom cannot disagree about the same ticker.
  const intelByTicker = useMemo(() => {
    const m = new Map<string, EarningsIntelView>();
    for (const e of events) m.set(e.ticker, buildEarningsIntel(e));
    return m;
  }, [events]);
  const selectedView = selected ? intelByTicker.get(selected.ticker) : undefined;
  const playsView = useMemo(
    () => (selected && selectedView ? buildEarningsPlays(selected, selectedView) : null),
    [selected, selectedView]
  );

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
            help: 'Cmp' as const,
            width: '44px',
            render: (e: EarningsEvent) => (
              <button
                onClick={ev => {
                  ev.stopPropagation();
                  toggleCompare(e.ticker);
                }}
                aria-pressed={compareSet.has(e.ticker)}
                aria-label={compareSet.has(e.ticker) ? 'Remove from compare' : 'Add to compare'}
                // The drawn box stays 20px so the 44px column keeps its width;
                // the padding rides on the button outside the border and the
                // negative margin takes it back off the layout, so the tappable
                // area is 28 and nothing moves.
                className="-m-1 p-1 inline-flex items-center justify-center"
              >
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 rounded border transition-colors ${
                    compareSet.has(e.ticker)
                      ? 'border-select/40 bg-select/15 text-select'
                      : 'border-borderMuted text-textMuted hover:text-textSecondary'
                  }`}
                >
                  {compareSet.has(e.ticker) ? '✓' : ''}
                </span>
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
          <span className="font-mono text-caption font-bold text-textPrimary leading-4">{e.ticker}</span>
          <span title={e.name} className="text-label text-textMuted truncate">{e.name}</span>
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Reports',
      sortValue: e => e.daysOut,
      render: e => (
        <span className="flex flex-col gap-0.5">
          <span className="font-mono text-caption text-textPrimary leading-4">{e.dateLabel}</span>
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
      // Same cut points and the same vocabulary as `edgeRead` above: rich warns,
      // cheap takes the accent, fair stays quiet. Never green — the column reads
      // the premium, not the direction.
      render: e => (
        <span className={`font-mono text-caption font-semibold tnum ${e.richness >= 1.3 ? 'text-warn' : e.richness <= 0.85 ? 'text-select' : 'text-textSecondary'} leading-4`}>
          {e.richness.toFixed(2)}×
        </span>
      ),
    },
    {
      key: 'beat',
      header: 'Beat 8q',
      align: 'right',
      sortValue: e => e.beatRate8q,
      render: e => <span className="font-mono text-caption text-textSecondary tnum leading-4">{e.beatRate8q}%</span>,
    },
    {
      key: 'rev',
      header: 'Revisions',
      align: 'right',
      sortValue: e => e.revisionTrend,
      render: e => (
        <span className={`font-mono text-caption tnum ${e.revisionTrend > 0.15 ? 'text-bull' : e.revisionTrend < -0.15 ? 'text-bear' : 'text-textMuted'} leading-4`}>
          {e.revisionTrend > 0.15 ? '▲ rising' : e.revisionTrend < -0.15 ? '▼ falling' : '· flat'}
        </span>
      ),
    },
    {
      key: 'tech',
      header: 'Setup',
      align: 'right',
      sortValue: e => e.technicalScore,
      render: e => (
        <span className={`font-mono text-caption tnum ${e.technicalScore >= 62 ? 'text-bull' : e.technicalScore <= 40 ? 'text-bear' : 'text-textSecondary'} leading-4`}>
          {e.technicalScore}
        </span>
      ),
    },
    {
      key: 'ivr',
      header: 'IVR',
      help: 'IVR',
      align: 'right',
      sortValue: e => e.ivRank,
      render: e => <span className="font-mono text-caption text-textSecondary tnum leading-4">{e.ivRank}</span>,
    },
    {
      key: 'call',
      header: 'Trade read',
      width: '210px',
      sortValue: e => e.verdict,
      render: e => <TradeRead e={e} view={intelByTicker.get(e.ticker)} />,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Earnings']}
        title="Earnings Hub"
        subtitle="Every upcoming print priced: implied vs what it actually moves, then edge, conviction and the risk-defined structure for each"
        actions={<SegmentedControl ariaLabel="Verdict filter" options={FILTER_OPTIONS} value={filter} onChange={setFilter} />}
      />

      <MetricGrid min="170px">
        <StatCard label="Reports tracked" value={events.length} sub="next two weeks" />
        <StatCard label="Qualified" value={plays.length} sub="a defined structure fits" tone="select" />
        <StatCard label="Premium rich" value={fades.length} sub="implied over realized" tone="magenta" />
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
          tone="select"
        />
      </MetricGrid>

      {/* Alert countdown — live clock to the next (or next watched) print */}
      {alertEvent && (
        <AlertCountdown
          event={alertEvent}
          view={intelByTicker.get(alertEvent.ticker)}
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
                  <span className="w-1.5 h-1.5 rounded-full bg-warn" title="Estimated date, not yet confirmed" />
                )}
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {list.map(e => (
                  <button
                    key={e.ticker}
                    onClick={() => setSelectedTicker(prev => (prev === e.ticker ? null : e.ticker))}
                    className={`-my-0.5 flex items-center gap-2 rounded px-1.5 py-1.5 text-left transition-colors ${
                      selectedTicker === e.ticker ? 'bg-select/[0.08]' : 'hover:bg-rowHover'
                    }`}
                  >
                    {watchlist.has(e.ticker) && <Star className="w-3 h-3 shrink-0 text-select fill-current" />}
                    <span className="font-mono text-caption font-bold text-textPrimary">{e.ticker}</span>
                    <span className="font-mono text-micro text-textMuted">{e.slot}</span>
                    <SignalBadge tone={verdictTone[e.verdict]} className="ml-auto">
                      {VERDICT_LABEL[e.verdict]}
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
              className="-my-0.5 inline-flex items-center gap-1 px-2 py-1.5 rounded border border-borderSubtle bg-white/[0.02] font-mono text-label uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors"
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
              const st = structureOf(intelByTicker.get(e.ticker));
              return (
                <div key={e.ticker} className="bg-panel px-3.5 py-3 flex flex-col gap-2.5 min-w-[220px]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-body font-bold text-textPrimary leading-5">{e.ticker}</div>
                      <div className="text-label text-textMuted truncate">
                        {e.dateLabel} {e.slot}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleCompare(e.ticker)}
                      aria-label={`Remove ${e.ticker} from compare`}
                      className="shrink-0 -m-1.5 p-1.5 text-textMuted hover:text-textSecondary transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <SignalBadge tone={verdictTone[e.verdict]}>{VERDICT_LABEL[e.verdict]}</SignalBadge>
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
              className={`-my-0.5 inline-flex items-center gap-1 px-2 py-1.5 rounded border font-mono text-label uppercase tracking-wider transition-colors ${
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
              className={`-my-0.5 inline-flex items-center gap-1 px-2 py-1.5 rounded border font-mono text-label uppercase tracking-wider transition-colors ${
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
              <SignalBadge tone={verdictTone[selected.verdict]}>{VERDICT_LABEL[selected.verdict]}</SignalBadge>
              <span className="font-mono text-caption font-bold text-textPrimary leading-4">
                {selected.ticker} · {selected.dateLabel} {selected.slot}
              </span>
              <ReportTimeTag e={selected} />
              <span className="font-mono text-label text-textMuted">
                implied {selected.impliedMovePct.toFixed(1)}% · realized {selected.histAvgMovePct.toFixed(1)}% ·{' '}
                {selected.richness.toFixed(2)}×
              </span>
              <span className="ml-auto flex items-center gap-2">
                {/*
                  The full dossier renders below the table, which is a long way
                  from the row that produced it. Clicking a name and then having
                  to hunt for its detail is half of why the detail felt like a
                  wall — the payload is now reachable from the click.
                */}
                <button
                  onClick={() => document.getElementById(DOSSIER_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="-my-0.5 inline-flex items-center gap-1 px-2 py-1.5 rounded border border-borderSubtle bg-white/[0.02] font-mono text-label uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors"
                >
                  <ArrowDown className="w-3 h-3" /> Full dossier
                </button>
                <TickerJump ticker={selected.ticker} horizon="WEEKLIES" />
              </span>
            </div>

            {/* Edge · conviction · structure — the read that replaces a bare call */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(() => {
                const edge = edgeRead(selected);
                const conv = convictionRead(selected);
                const st = structureOf(selectedView);
                return (
                  <>
                    <div className="inst-surface rounded-md px-3 py-2">
                      <div className="font-mono text-label uppercase tracking-widest text-textMuted">Edge</div>
                      <div className={`mt-1 font-mono text-body font-semibold ${toneText[edge.tone]} leading-5`}>
                        {edge.label} <span className="text-textMuted tnum text-caption">{edgePtsLabel(selected)}</span>
                      </div>
                    </div>
                    <div className="inst-surface rounded-md px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-label uppercase tracking-widest text-textMuted">Conviction</span>
                        <VoteChips e={selected} />
                      </div>
                      <div className={`mt-1 font-mono text-body font-semibold ${toneText[conv.tone]} leading-5`}>
                        {conv.dir === 'MIXED' ? 'Split signals' : `${conv.dir} · ${conv.label}`}
                      </div>
                    </div>
                    <div className="inst-surface rounded-md px-3 py-2">
                      <div className="font-mono text-label uppercase tracking-widest text-textMuted">Structure</div>
                      <div className={`mt-1 font-mono text-body font-semibold ${toneText[st.tone]} leading-5`}>{st.label}</div>
                      <div className="font-mono text-label text-textMuted">{st.risk}</div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/*
              This line used to render `EarningsEvent.strategy`, which is written
              as an order — "fade the move", "own the vol", "buy the call
              vertical". The desk observes and never instructs, and every other
              call on this page already obeys that: PLAY renders QUALIFIED, FADE
              renders RICH, the plays panel quotes odds rather than a ticket.

              It was also the last second derivation left here. `strategy` comes
              from the verdict engine's own prose, which cuts richness at
              0.85/1.3, while the structure named beside it comes from the
              dossier at 0.9/1.18 — the exact disagreement `structureOf` was
              rewritten to end. Reading the dossier's statement of what is
              mispriced fixes the voice and the split derivation in one move.
            */}
            {selectedView && (
              <p className="text-caption text-textPrimary leading-relaxed">{selectedView.mispricing.headline}</p>
            )}
            {/* `rationale` is the verdict engine's argument for the badge above,
                which is the one thing the dossier does not restate. Nobody needs
                it on every click, so it costs one tap. */}
            <div>
              <button
                onClick={() => setShowWhy(w => !w)}
                aria-expanded={showWhy}
                className="-my-1 py-1 inline-flex items-center gap-1 font-mono text-label uppercase tracking-wider text-textMuted hover:text-textPrimary transition-colors"
              >
                {showWhy ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Why this read
              </button>
              {showWhy && <p className="mt-1.5 text-caption text-textSecondary leading-relaxed">{selected.rationale}</p>}
            </div>
          </div>
        )}
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={e => e.ticker}
          onRowClick={e => setSelectedTicker(prev => (prev === e.ticker ? null : e.ticker))}
          selectedKey={selectedTicker}
          initialSort={{ key: 'date', dir: 'asc' }}
          maxHeight="max(560px, 62vh)"
          // "prints" is Trace vocabulary — this desk lists earnings reports, and
          // it had inherited the flow desk's empty state verbatim. Every other
          // table in the app names its own object (contracts, names, setups,
          // alternatives); this was the one that named someone else's.
          emptyText="No reports match these filters"
        />
      </Panel>

      {/*
        Earnings plays: the dossier names a structure, this names the contract.
        Strikes come off the dossier's own reaction nodes (±0.7σ / ±1.55σ of the
        implied move) rounded to the listed grid, and the odds beside each one
        are that distribution's model and priced legs, so nothing here is a
        second opinion about the same print.

        There is deliberately no premium. The contract weigher prices off a
        baseline vol surface with no earnings jump in it, so a debit taken from
        it would read cheap for exactly the contracts that are not.
      */}
      {selected && playsView && (
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Ticket className="w-3.5 h-3.5" /> Earnings plays
            </span>
          }
          subtitle={`${playsView.ticker} · expires ${playsView.expiryLabel} · ${playsView.dte}d`}
          tone={playsView.plays.length > 0 ? 'select' : 'neutral'}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <SignalBadge tone={playsView.plays.length > 0 ? 'select' : 'neutral'} dot>
                {playsView.condition}
              </SignalBadge>
              <span className="font-mono text-label text-textMuted">
                Structure <span className="text-textPrimary">{playsView.structure}</span>
              </span>
              <span className="ml-auto font-mono text-label text-textMuted tnum">implied ±{playsView.impliedMovePct.toFixed(1)}%</span>
            </div>

            {playsView.plays.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {playsView.plays.map(p => (
                  <PlayCard key={p.id} p={p} ticker={playsView.ticker} expiryLabel={playsView.expiryLabel} />
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Stat label="ATM IV now" value={`${playsView.frontIv.toFixed(0)}%`} sub="front expiry, carries the print" />
              <Stat label="Morning after" value={`${playsView.baseIv.toFixed(0)}%`} sub="post-crush baseline" />
              <Stat label="Crush" value={`${playsView.ivCrushPct.toFixed(0)}%`} tone="warn" sub="of the front IV, on the print" />
            </div>

            <p className="text-caption text-textSecondary leading-relaxed">{playsView.read}</p>
            <p className="font-mono text-label text-textMuted leading-relaxed">
              No premium quoted: the event vol that makes these contracts expensive is not in the terminal's baseline surface, so any debit
              shown here would be too low. The odds are what the model and the skew disagree about.
            </p>
          </div>
        </Panel>
      )}

      <div id={DOSSIER_ID}>
        <EarningsIntel event={selected} />
      </div>
    </>
  );
};

export default EarningsHub;
