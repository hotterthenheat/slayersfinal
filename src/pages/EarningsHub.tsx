import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, CalendarClock, Crosshair, Moon, Rocket, Sunrise } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import ProvenanceChip from '../components/ui/ProvenanceChip';
import Panel from '../components/ui/Panel';
import {
  buildIpoCalendar, chainBlockedReason, isPending, isDead, LOCKUP_DAYS,
  IPO_STATUS_WORDS, IPO_STATUS_NOTES, type IpoDeal, type IpoStatus,
} from '../data/ipo';
import FilterTabs from '../components/ui/FilterTabs';
import CompanyLogo from '../components/ui/CompanyLogo';
import DataTable, { type Column } from '../components/ui/DataTable';
import Term from '../components/ui/Term';
import { StateTag, stateOf, type VolState } from '../components/earnings/volState';
import ConfirmTag from '../components/earnings/ConfirmTag';
import {
  buildEarningsCalendar, weekDayLabel,
  IMPLIED_MOVE_METHOD, IMPLIED_MOVE_METHOD_WORDS, IMPLIED_MOVE_NOTE,
  type EarningsEvent,
} from '../data/earnings';
import DataState from '../components/ui/DataState';
import { fmtUsd } from '../data/gex';

/*
  Calendar-first earnings hub. The week board is the hero: Mon–Fri columns,
  each split into before-open / after-close shelves, every report a LOGO CARD
  carrying one number — our straddle-derived expected move. Clicking any card
  (or board row) opens that company's earnings dossier page.
*/

type StateFilter = 'ALL' | VolState;

const FILTER_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'RICH', label: 'Rich' },
  { value: 'INLINE', label: 'Fair' },
  { value: 'CHEAP', label: 'Cheap' },
] as const;

const WEEK_OPTIONS = [
  { value: '0', label: 'This week' },
  { value: '1', label: 'Next week' },
] as const;

const WEEKDAYS = [1, 2, 3, 4, 5] as const;

/** Implied vs realized, drawn against each other — the whole edge in one glance. */
const MoveCompare = ({ implied, hist }: { implied: number; hist: number }) => {
  const max = Math.max(implied, hist, 1);
  return (
    <span className="flex flex-col gap-1 w-full py-0.5">
      <span className="flex items-center gap-1.5">
        <span className="w-7 font-mono text-[9px] uppercase text-textMuted">imp</span>
        <span className="flex-1 h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
          <span className="block h-full rounded-full holo-bar" style={{ width: `${(implied / max) * 100}%` }} />
        </span>
        <span className="w-10 font-mono text-[10px] text-textPrimary tnum text-right">{implied.toFixed(1)}%</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-7 font-mono text-[9px] uppercase text-textMuted">real</span>
        <span className="flex-1 h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
          <span className="block h-full rounded-full bg-white/30" style={{ width: `${(hist / max) * 100}%` }} />
        </span>
        <span className="w-10 font-mono text-[10px] text-textSecondary tnum text-right">{hist.toFixed(1)}%</span>
      </span>
    </span>
  );
};

/** Big logo card — the calendar's cell. Clicking opens the dossier page.
    The hover arrow exists because the click was invisible in review (Mo,
    2026-08-19, asked for clickable cards that already were). */
const Card = ({ e, onOpen }: { e: EarningsEvent; onOpen: (t: string) => void }) => (
  <button
    onClick={() => onOpen(e.ticker)}
    title={`Open the ${e.ticker} earnings dossier`}
    className="group relative flex flex-col items-center gap-1.5 rounded-md border border-borderSubtle bg-inset px-2 pt-3 pb-2.5 transition-colors hover:border-borderMuted hover:bg-white/[0.02]"
  >
    <ArrowUpRight className="absolute top-1.5 right-1.5 w-3 h-3 text-textMuted opacity-0 group-hover:opacity-100 transition-opacity" />
    <CompanyLogo ticker={e.ticker} size={30} />
    <span className="font-mono text-[13px] font-bold text-textPrimary leading-none mt-0.5">{e.ticker}</span>
    <span className="font-mono text-[11px] text-textSecondary tnum leading-none">±{e.impliedMovePct.toFixed(1)}%</span>
    <ConfirmTag confirmed={e.confirmed} dense />
  </button>
);

const Shelf = ({
  list,
  icon,
  title,
  tone,
  onOpen,
}: {
  list: EarningsEvent[];
  icon: React.ReactNode;
  title: string;
  /** dawn orange for before-open, moonlit blue for after-close */
  tone: string;
  onOpen: (t: string) => void;
}) =>
  list.length === 0 ? null : (
    <div>
      <span className={`flex items-center gap-1 px-1 font-mono text-[9px] uppercase tracking-wider ${tone}`}>
        {icon} {title}
      </span>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        {list.map(e => (
          <Card key={e.ticker} e={e} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );

type IpoView = 'ALL' | 'PENDING' | 'RESOLVED';
type IpoSize = 'ALL' | '250' | '750';

const IPO_VIEWS: { value: IpoView; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Ahead' },
  { value: 'RESOLVED', label: 'Done' },
];

/* Two cuts rather than a slider: a reader is asking "is this a big deal",
   not "is this deal between 412 and 613 million dollars". */
const IPO_SIZES: { value: IpoSize; label: string }[] = [
  { value: 'ALL', label: 'Any size' },
  { value: '250', label: '$250M+' },
  { value: '750', label: '$750M+' },
];

const EarningsHub = () => {
  const navigate = useNavigate();
  const events = useMemo(() => buildEarningsCalendar(), []);
  const [week, setWeek] = useState<'0' | '1'>('0');
  const [filter, setFilter] = useState<StateFilter>('ALL');

  const rows = useMemo(() => (filter === 'ALL' ? events : events.filter(e => stateOf(e) === filter)), [events, filter]);

  const rich = events.filter(e => stateOf(e) === 'RICH');
  const cheap = events.filter(e => stateOf(e) === 'CHEAP');
  const biggest = [...events].sort((a, b) => b.impliedMovePct - a.impliedMovePct)[0];

  // The fortnight as ten density bars — one per trading day, both weeks
  const slate = useMemo(
    () =>
      ([0, 1] as const).flatMap(weekIdx =>
        WEEKDAYS.map(weekday => {
          const { label, isToday } = weekDayLabel(weekIdx, weekday);
          return {
            weekIdx,
            weekday,
            label,
            isToday,
            count: events.filter(e => e.weekIdx === weekIdx && e.weekday === weekday).length,
          };
        })
      ),
    [events]
  );
  const slateMax = Math.max(...slate.map(d => d.count), 1);

  // The pricing filter scopes the WHOLE page — board and week alike
  const weekEvents = events.filter(e => e.weekIdx === Number(week) && (filter === 'ALL' || stateOf(e) === filter));
  const open = (t: string) => navigate(`/earnings/${t}`);

  const columns: Column<EarningsEvent>[] = [
    {
      key: 'ticker',
      header: 'Name',
      sortValue: e => e.ticker,
      render: e => (
        <span className="flex items-center gap-2.5">
          <CompanyLogo ticker={e.ticker} size={20} />
          <span className="flex flex-col">
            <span className="font-mono text-xs font-bold text-textPrimary">{e.ticker}</span>
            <span className="text-[11px] text-textSecondary truncate">{e.name}</span>
          </span>
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
          <span className="font-mono text-[11px] text-textSecondary">
            <span className={e.slot === 'BMO' ? 'text-warn' : 'text-flip'}>
              {e.slot === 'BMO' ? 'before open' : 'after close'}
            </span>{' '}
            · {e.daysOut === 0 ? 'today' : `${e.daysOut}d out`}
          </span>
          <ConfirmTag confirmed={e.confirmed} />
        </span>
      ),
    },
    {
      key: 'move',
      /* 9.2 — the column that carries the implied move names its
         convention. The two in use give different numbers for the same
         name on the same day; a reader comparing this against a figure
         elsewhere is looking at two conventions, not two opinions. */
      header: (
        <span className="inline-flex items-baseline gap-1.5">
          <Term k="Implied vs realized" />
          <span
            className="font-mono text-[8px] uppercase tracking-wider text-textMuted cursor-help"
            title={IMPLIED_MOVE_NOTE}
          >
            {IMPLIED_MOVE_METHOD_WORDS[IMPLIED_MOVE_METHOD]}
          </span>
        </span>
      ),
      width: '190px',
      sortValue: e => e.richness,
      render: e => <MoveCompare implied={e.impliedMovePct} hist={e.histAvgMovePct} />,
    },
    {
      key: 'rich',
      header: <Term k="Priced vs typical">Priced</Term>,
      align: 'right',
      sortValue: e => e.richness,
      render: e => (
        <span className={`font-mono text-xs font-semibold tnum ${e.richness >= 1.3 ? 'text-warn' : e.richness <= 0.85 ? 'text-bull' : 'text-textPrimary'}`}>
          {e.richness.toFixed(2)}×
        </span>
      ),
    },
    {
      key: 'beat',
      header: <Term k="Beat rate" />,
      align: 'right',
      sortValue: e => e.beatRate8q,
      render: e => <span className="font-mono text-xs text-textPrimary tnum">{e.beatRate8q}%</span>,
    },
    {
      key: 'rev',
      header: <Term k="Revisions" />,
      align: 'right',
      sortValue: e => e.revisionTrend,
      render: e => (
        <span className={`font-mono text-xs tnum ${e.revisionTrend > 0.15 ? 'text-bull' : e.revisionTrend < -0.15 ? 'text-bear' : 'text-textSecondary'}`}>
          {e.revisionTrend > 0.15 ? '▲ rising' : e.revisionTrend < -0.15 ? '▼ falling' : '— flat'}
        </span>
      ),
    },
    {
      key: 'ivr',
      header: <Term k="IV rank" />,
      align: 'right',
      sortValue: e => e.ivRank,
      render: e => <span className="font-mono text-xs text-textPrimary tnum">{e.ivRank}</span>,
    },
    {
      key: 'state',
      header: <Term k="Pricing" />,
      sortValue: e => stateOf(e),
      render: e => <StateTag state={stateOf(e)} />,
    },
  ];

  /* 9.3 — DISTINCT INK PER STATUS, full class strings so Tailwind's JIT
     sees them. Withdrawn is the loud one: it is the state a reader most
     needs to notice and the one a date-sorted calendar most easily hides. */
  const ipos = useMemo(() => buildIpoCalendar(), []);
  const [ipoView, setIpoView] = useState<IpoView>('ALL');
  const [ipoSize, setIpoSize] = useState<IpoSize>('ALL');
  const shownIpos = useMemo(
    () =>
      ipos.filter(d => {
        if (ipoView === 'PENDING' && !isPending(d.status)) return false;
        if (ipoView === 'RESOLVED' && isPending(d.status)) return false;
        if (ipoSize !== 'ALL' && d.raiseUsd < Number(ipoSize) * 1e6) return false;
        return true;
      }),
    [ipos, ipoView, ipoSize],
  );
  const ipoColumns = useMemo<Column<IpoDeal>[]>(() => {
    const STATUS_INK: Record<IpoStatus, string> = {
      upcoming: 'text-select',
      priced: 'text-bull',
      withdrawn: 'text-bear',
      postponed: 'text-warn',
    };
    return [
      {
        key: 'ticker',
        header: 'Listing',
        sortValue: d => d.ticker,
        render: d => (
          <span className="flex flex-col leading-tight">
            <span className={`font-mono text-[11px] font-bold ${isDead(d.status) ? 'text-textMuted line-through' : 'text-textPrimary'}`}>
              {d.ticker}
            </span>
            <span className="text-[10px] text-textMuted">{d.name}</span>
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        sortValue: d => (isPending(d.status) ? 0 : 1),
        render: d => (
          <span
            title={IPO_STATUS_NOTES[d.status]}
            className={`font-mono text-[9px] uppercase tracking-wider ${STATUS_INK[d.status]}`}
          >
            {IPO_STATUS_WORDS[d.status]}
          </span>
        ),
      },
      {
        key: 'date',
        header: 'Date',
        sortValue: d => d.daysOut,
        render: d => (
          <span className="font-mono text-[11px] tnum text-textSecondary">
            {d.date}
            {isPending(d.status) && <span className="ml-1.5 text-textMuted">in {d.daysOut}d</span>}
          </span>
        ),
      },
      {
        key: 'exchange',
        header: 'Where',
        sortValue: d => d.exchange,
        render: d => <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">{d.exchange}</span>,
      },
      {
        key: 'size',
        /* THE DEAL'S SIZE, IN BOTH UNITS. Shares offered is what the deal
           IS; the raise is what it is worth. A calendar that prints only
           the dollars cannot be compared across two very different share
           prices, and one that prints only the shares says nothing about
           how much stock is actually coming. */
        header: 'Size',
        align: 'right',
        sortValue: d => d.raiseUsd,
        render: d => (
          <span className="flex flex-col leading-tight items-end">
            <span className="font-mono text-[11px] tnum text-textSecondary">{fmtUsd(d.raiseUsd)}</span>
            <span className="font-mono text-[10px] tnum text-textMuted">{(d.shares / 1e6).toFixed(1)}M shares</span>
          </span>
        ),
      },
      {
        key: 'range',
        header: 'Range · priced',
        align: 'right',
        sortValue: d => d.pricedAt ?? d.rangeLow ?? 0,
        /* Both, side by side, because deals price outside their range often
           enough that replacing one with the other hides the interesting
           part. A withdrawn deal shows neither — a pulled filing has no
           live range and printing one invites a reader to price it. */
        render: d => (
          <span className="font-mono text-[11px] tnum">
            {d.rangeLow === null ? (
              <span className="text-textMuted">—</span>
            ) : (
              <span className="text-textSecondary">
                ${d.rangeLow}–{d.rangeHigh}
              </span>
            )}
            {d.pricedAt !== null && (
              <span className={`ml-2 font-semibold ${d.rangeHigh !== null && d.pricedAt > d.rangeHigh ? 'text-bull' : d.rangeLow !== null && d.pricedAt < d.rangeLow ? 'text-bear' : 'text-textPrimary'}`}>
                ${d.pricedAt.toFixed(2)}
              </span>
            )}
          </span>
        ),
      },
      {
        key: 'firstDay',
        /* 9.3 — THE POP, AGAINST THE OFFER. Measured on what the deal
           actually priced at rather than the range it filed: the range is
           an intention and the offer is the trade. A deal that has not
           traded has no first day, and says so rather than showing a zero. */
        header: 'First day',
        align: 'right',
        sortValue: d => d.firstDayPct ?? -Infinity,
        render: d =>
          d.firstDayPct === null || d.firstDayClose === null ? (
            <span className="font-mono text-[10px] text-textMuted/60" title={d.status === 'priced' ? 'Priced today — the first session has not closed yet.' : 'This deal has not traded.'}>
              —
            </span>
          ) : (
            <span className="flex flex-col leading-tight items-end">
              <span className={`font-mono text-[11px] tnum ${d.firstDayPct >= 0 ? 'text-bull' : 'text-bear'}`}>
                {d.firstDayPct >= 0 ? '+' : ''}
                {d.firstDayPct.toFixed(1)}%
              </span>
              <span className="font-mono text-[10px] tnum text-textMuted">closed ${d.firstDayClose.toFixed(2)}</span>
            </span>
          ),
      },
      {
        key: 'lockup',
        /* A DATED, TRADEABLE EVENT — the day a large block of insider stock
           becomes sellable is a day the tape notices, and a calendar of new
           listings without it is missing the one date on it a trader can
           position for. Named as the 180-day convention it is, because the
           real term lives in an underwriting agreement this desk does not
           read. */
        header: 'Lock-up',
        align: 'right',
        sortValue: d => d.lockupDaysOut ?? Infinity,
        render: d =>
          d.lockupDate === null || d.lockupDaysOut === null ? (
            <span className="font-mono text-[10px] text-textMuted/60">—</span>
          ) : (
            <span
              className="flex flex-col leading-tight items-end cursor-help"
              title={`The standard ${LOCKUP_DAYS}-day lock-up from the listing date — a convention, not a filed term. Insiders may sell from this date.`}
            >
              <span className="font-mono text-[11px] tnum text-textSecondary">{d.lockupDate}</span>
              <span className="font-mono text-[10px] tnum text-textMuted">
                {d.lockupDaysOut > 0 ? `in ${d.lockupDaysOut}d` : 'expired'}
              </span>
            </span>
          ),
      },
      {
        key: 'chain',
        header: 'Options',
        sortValue: d => (d.hasChain ? 0 : 1),
        /* The disabled state IS the feature. A link that opens an empty
           Weigher leaves the reader deciding whether the desk is broken or
           the deal is; this says which. */
        render: d =>
          d.hasChain ? (
            <button
              type="button"
              /* THE LINK USED TO DO NOTHING. It navigated to
                 `/weigher?ticker=X`, and the Weigher reads a name only from
                 router state — neither it nor its desk reads a search param.
                 So "open chain" opened the Weigher on whatever name was last
                 in localStorage, silently, which is worse than a dead link
                 because it looks like it worked. Router state is the pattern
                 the Trace drilldown already uses and the Weigher already
                 consumes. */
              onClick={() => navigate('/weigher', { state: { weigh: { ticker: d.ticker } } })}
              className="font-mono text-[10px] text-select underline decoration-dotted underline-offset-2 hover:text-textPrimary"
            >
              open chain
            </button>
          ) : (
            <span
              title={chainBlockedReason(d) ?? ''}
              className="font-mono text-[10px] text-textMuted cursor-help"
            >
              no chain yet
              {d.chainEta !== null && <span className="ml-1">· ~{d.chainEta}d</span>}
            </span>
          ),
      },
    ];
  }, [navigate]);

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Earnings']}
        title="Earnings"
        subtitle="Every upcoming print priced by us — our implied move against what the name typically does"
        /* Part 0 — the slate stands on the calendar and on the chain that
           prices each move; the chip reads the weaker of the two. */
        actions={<ProvenanceChip sources={['earnings', 'chain']} />}
      />

      {/* THE SLATE STRIP — the fortnight as an instrument, not stat cards:
          reports-per-day as density bars (today in lime), the biggest print as
          a clickable line, and how the whole slate is priced as a tug bar. */}
      <div className="border border-borderSubtle bg-inset rounded-md px-4 py-3 flex items-center gap-x-6 gap-y-3 flex-wrap">
        <span className="flex items-baseline gap-2.5 shrink-0">
          <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Slate</span>
          <span className="font-mono text-lg font-bold text-textPrimary tnum">{events.length}</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-textSecondary">reports · 2 weeks</span>
        </span>

        {/* Ten labeled day columns: count on top, bar in the middle, date
            underneath — readable at a glance, never anonymous blobs. */}
        <span className="flex items-end gap-1.5">
          {slate.map((d, i) => (
            <span key={`${d.weekIdx}-${d.weekday}`} className="flex items-end gap-1.5">
              {i === 5 && <span className="w-px h-9 bg-borderSubtle mx-0.5" />}
              <button
                onClick={() => setWeek(String(d.weekIdx) as '0' | '1')}
                title={`${d.label} · ${d.count} report${d.count === 1 ? '' : 's'} — show this week`}
                className="flex flex-col items-center gap-[3px] w-7 group"
              >
                <span
                  className={`font-mono text-[10px] tnum leading-none ${
                    d.count > 0 ? 'text-textPrimary font-semibold' : 'text-textMuted/60'
                  }`}
                >
                  {d.count > 0 ? d.count : '·'}
                </span>
                <span
                  className={`w-full rounded-[1px] transition-colors ${
                    d.isToday ? 'bg-select' : d.count > 0 ? 'bg-white/35 group-hover:bg-white/55' : 'bg-white/[0.07]'
                  }`}
                  style={{ height: d.count > 0 ? 5 + (d.count / slateMax) * 17 : 3 }}
                />
                <span
                  className={`font-mono text-[9px] leading-none tnum ${
                    d.isToday ? 'text-select font-bold' : 'text-textSecondary'
                  }`}
                >
                  {d.label.slice(-2)}
                </span>
              </button>
            </span>
          ))}
        </span>

        <span className="hidden lg:block w-px h-8 bg-borderSubtle" />

        {biggest && (
          <button onClick={() => open(biggest.ticker)} className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
            <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Biggest</span>
            <CompanyLogo ticker={biggest.ticker} size={18} />
            <span className="font-mono text-[13px] font-bold text-textPrimary">{biggest.ticker}</span>
            <span className="font-mono text-[13px] font-semibold text-textPrimary tnum">
              ±{biggest.impliedMovePct.toFixed(1)}%
            </span>
            {biggest.slot === 'BMO' ? (
              <Sunrise className="w-3 h-3 text-warn" aria-label="before open" />
            ) : (
              <Moon className="w-3 h-3 text-flip" aria-label="after close" />
            )}
            <span className="font-mono text-[10px] text-textSecondary">{biggest.dateLabel}</span>
          </button>
        )}

        <span className="hidden lg:block w-px h-8 bg-borderSubtle" />

        {/* THE MASTER FILTER — rich/cheap is the main reason to open this page
            (Mo, 2026-08-19), so it lives here at the top as lit toggle chips
            and scopes BOTH the week board and the table. Clicking a lit chip
            lets go — the tape-filter grammar. */}
        <span className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Pricing</span>
          <span className="flex h-[6px] w-24 rounded-full overflow-hidden bg-white/[0.06]" title="how the slate is priced vs history">
            <span className="h-full bg-warn/80" style={{ width: `${(rich.length / events.length) * 100}%` }} />
            <span
              className="h-full bg-white/25"
              style={{ width: `${((events.length - rich.length - cheap.length) / events.length) * 100}%` }}
            />
            <span className="h-full bg-bull" style={{ width: `${(cheap.length / events.length) * 100}%` }} />
          </span>
          {(
            [
              { state: 'RICH' as const, count: rich.length, word: 'rich', ink: 'text-warn', lit: 'border-warn/40 bg-warn/[0.08]' },
              {
                state: 'INLINE' as const,
                count: events.length - rich.length - cheap.length,
                word: 'fair',
                ink: 'text-textSecondary',
                lit: 'border-borderMuted bg-white/[0.05]',
              },
              { state: 'CHEAP' as const, count: cheap.length, word: 'cheap', ink: 'text-bull', lit: 'border-bull/40 bg-bull/[0.08]' },
            ]
          ).map(c => (
            <button
              key={c.state}
              onClick={() => setFilter(f => (f === c.state ? 'ALL' : c.state))}
              title={filter === c.state ? 'Show the whole slate' : `Show only ${c.word}ly priced reports`}
              className={`inline-flex items-baseline gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] tnum transition-colors ${
                filter === c.state ? c.lit : 'border-transparent hover:bg-white/[0.04]'
              }`}
            >
              <span className={`font-semibold ${c.ink}`}>{c.count}</span>
              <span className={filter === c.state ? c.ink : 'text-textSecondary'}>{c.word}</span>
            </button>
          ))}
        </span>
      </div>

      {/* The week board — the page's hero */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5" /> The week
          </span>
        }
        subtitle="who reports when · the number is our expected move · click a card for the dossier"
        actions={<FilterTabs ariaLabel="Week" options={WEEK_OPTIONS} value={week} onChange={setWeek} />}
        flush
      >
        {/* ONE MESSAGE, NOT FIVE. The per-day copy below is right for a mixed
            week — "no reports" under Wednesday is that column's own answer.
            But a filter that matches nothing puts the SAME sentence in all
            five columns at once, and five identical notices read as five
            faults rather than as one cut being too tight. When the whole
            board is empty the board says so once. */}
        {weekEvents.length === 0 ? (
          <DataState
            kind="empty"
            title={filter === 'ALL' ? 'No reports this week' : `Nothing priced ${FILTER_OPTIONS.find(o => o.value === filter)?.label ?? filter} this week`}
            body={filter === 'ALL' ? 'The slate picks up next week.' : 'Try All, or look at next week.'}
          />
        ) : (
          <div key={`${week}-${filter}`} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-px bg-borderSubtle animate-soft-in">
            {WEEKDAYS.map(wd => {
              const { label, isToday } = weekDayLabel(Number(week) as 0 | 1, wd);
              const dayEvents = weekEvents.filter(e => e.weekday === wd);
              const bmo = dayEvents.filter(e => e.slot === 'BMO');
              const amc = dayEvents.filter(e => e.slot === 'AMC');
              return (
                <div key={wd} className={`bg-panel px-2.5 py-2.5 min-h-[170px] ${isToday ? 'bg-select/[0.03]' : ''}`}>
                  <div className="px-1">
                    <div className="flex items-center justify-between">
                      <span className={`font-mono text-xs font-bold uppercase tracking-widest ${isToday ? 'text-select' : 'text-textPrimary'}`}>
                        {label}
                      </span>
                      {isToday && <span className="font-mono text-[9px] uppercase tracking-wider text-select">today</span>}
                    </div>
                    {/* today = lime (interface: you are here); other days = holo silver */}
                    <span className={`block h-[2px] rounded-full mt-1.5 ${isToday ? 'bg-select' : 'holo-bar opacity-80'}`} />
                  </div>
                  {dayEvents.length === 0 ? (
                    <div className="mt-7 text-center font-mono text-[10px] text-textMuted uppercase tracking-wider">
                      {filter === 'ALL' ? 'no reports' : 'none match the filter'}
                    </div>
                  ) : (
                    <div className="mt-2.5 flex flex-col gap-3">
                      <Shelf list={bmo} icon={<Sunrise className="w-3 h-3" />} title="before open" tone="text-warn" onOpen={open} />
                      <Shelf list={amc} icon={<Moon className="w-3 h-3" />} title="after close" tone="text-flip" onOpen={open} />
                    </div>
                )}
              </div>
            );
            })}
          </div>
        )}
      </Panel>

      {/* The board */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Crosshair className="w-3.5 h-3.5" /> The board
          </span>
        }
        subtitle="pricing states — the data's read, you make the call · click a row for the dossier"
        actions={<FilterTabs ariaLabel="Vol pricing filter" options={FILTER_OPTIONS} value={filter} onChange={setFilter} />}
        flush
      >
        <div key={filter} className="animate-soft-in">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={e => e.ticker}
            onRowClick={e => open(e.ticker)}
            initialSort={{ key: 'date', dir: 'asc' }}
            maxHeight="560px"
            /* Reachable: richness is a seeded draw per report and Cheap needs
               <= 0.85, so a slate where nothing is discounted empties that
               tab. Measured at 27 of 286 sampled sessions — Rich and Fair
               never emptied, but the copy covers whichever tab does. */
            emptyText={
              filter === 'ALL'
                ? 'No reports on this week.'
                : `Nothing is priced ${FILTER_OPTIONS.find(o => o.value === filter)?.label ?? filter} on this slate — the whole board is somewhere else. Try All.`
            }
          />
        </div>
      </Panel>

      {/* 9.3 — THE IPO CALENDAR, and the two refusals that make it honest.

          A withdrawn deal keeps its date, so any calendar sorted by date
          puts it among next week's live ones in the same ink. The status
          carries its own colour and the pending deals sort above every
          resolved one — a reader scanning the top of this list is looking
          only at things that can still happen.

          And a new listing has no options. Not few — none, for days to
          weeks. Every row says whether its chain exists and, when it does
          not, why, because a link that opens an empty Weigher is worse
          than one that explains itself. */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Rocket className="w-3.5 h-3.5" /> New listings
          </span>
        }
        subtitle="pending deals first — a pulled deal keeps its date and must never read as upcoming"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/*
              9.3 — TWO FILTERS, AND THE ONE THAT IS NOT HERE.

              Status is the filter this calendar is about: a reader looking
              for something to trade wants the pending deals, and a reader
              checking how the last month went wants the resolved ones. Size
              is the second, because a $60M deal and a $2B deal are different
              instruments wearing the same row.

              A DATE-RANGE filter is deliberately absent: the calendar holds
              one window, the rows already carry their distance in sessions,
              and a range picker over sixteen rows is chrome pretending to be
              a control.
            */}
            <FilterTabs
              ariaLabel="Listing status"
              options={IPO_VIEWS}
              value={ipoView}
              onChange={v => setIpoView(v)}
            />
            <FilterTabs
              ariaLabel="Deal size"
              options={IPO_SIZES}
              value={ipoSize}
              onChange={v => setIpoSize(v)}
            />
            <ProvenanceChip sources={['earnings']} note="Deal terms, first-day closes and lock-up dates come from the listings engine — no filings feed on this account. The lock-up is the standard 180-day convention, not a filed term." />
          </div>
        }
        flush
      >
        {ipos.length === 0 ? (
          <DataState kind="empty" title="No listings on the calendar" body="Nothing has filed or priced in this window." />
        ) : (
          <DataTable
            columns={ipoColumns}
            rows={shownIpos}
            rowKey={d => d.id}
            maxHeight="360px"
            emptyText={
              ipoView === 'ALL' && ipoSize === 'ALL'
                ? 'No listings on the calendar.'
                : `No ${ipoView === 'ALL' ? '' : `${ipoView.toLowerCase()} `}listings${ipoSize === 'ALL' ? '' : ` above $${ipoSize}M`} in this window — ${ipos.length} on the full calendar.`
            }
          />
        )}
      </Panel>
    </>
  );
};

export default EarningsHub;
