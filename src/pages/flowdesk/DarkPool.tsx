import { useMemo, useState } from 'react';
import { ShieldCheck, ArrowDownToLine, ArrowUpFromLine, Scale, Search } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { EXECUTION_NOTE, buildDarkPoolView } from '../../data/darkpool';
import { buildDarkPoolFeed } from '../../data/darkpoolfeed';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import SignalBadge from '../../components/ui/SignalBadge';
import DataTable, { type Column } from '../../components/ui/DataTable';
import SegmentedControl from '../../components/ui/SegmentedControl';
import EmptyState from '../../components/ui/EmptyState';
import DarkPoolLadder from '../../components/flowdesk/DarkPoolLadder';
import type { DarkPoolExecution, DarkPoolIntent, DarkPoolLevel, DarkPoolPrint } from '../../types/darkpool';
import type { Tone } from '../../components/ui/tones';

const intentTone: Record<DarkPoolIntent, Tone> = {
  ACCUMULATION: 'bull',
  DISTRIBUTION: 'bear',
  'HEDGE FLOW': 'warn',
  ROTATION: 'neutral',
};

/**
 * Execution archetype colouring. The split is by what the print DOES to the
 * spread, not by whether it is bullish: an aggressor pays it, a passive cross
 * saves it, and a late report is neither because it already happened.
 */
const execTone: Record<DarkPoolExecution, Tone> = {
  'BLOCK CROSS': 'neutral',
  MIDPOINT: 'bull',
  ICEBERG: 'info',
  'VWAP SLICE': 'neutral',
  'SWEEP TO DARK': 'warn',
  'LATE PRINT': 'neutral',
};

const EXEC_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'BLOCK CROSS', label: 'Blocks' },
  { value: 'MIDPOINT', label: 'Midpoint' },
  { value: 'ICEBERG', label: 'Iceberg' },
  { value: 'VWAP SLICE', label: 'Slices' },
  { value: 'SWEEP TO DARK', label: 'Sweeps' },
  { value: 'LATE PRINT', label: 'Late' },
] as const;

const INTENT_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'ACCUMULATION', label: 'Accumulation' },
  { value: 'DISTRIBUTION', label: 'Distribution' },
  { value: 'HEDGE FLOW', label: 'Hedge' },
  { value: 'ROTATION', label: 'Rotation' },
] as const;

const SIZE_OPTIONS = [
  { value: '0', label: 'All' },
  { value: '1000000', label: '≥$1M' },
  { value: '10000000', label: '≥$10M' },
  { value: '50000000', label: '≥$50M' },
] as const;


/*
  THE SIZE METER IS GONE, and the reason is worth keeping because it is the
  argument for every inline bar on this page.

  A meter earns its column by making an outlier findable without reading a
  number. This one could not: block sizes on a liquid name cluster hard, so
  every bar in view rendered within a few pixels of every other and the column
  was sixty identical stubs. A bar that never varies is not a weak signal, it is
  a decoration that costs a column and teaches the eye to ignore the next one.

  The vs-spot meter below SURVIVES the same test — it is signed and diverging,
  so it draws a distribution around spot that a column of percentages does not.

  Where the sizes DO vary is across price, and that is now the desk's headline
  picture rather than a column: components/flowdesk/DarkPoolLadder.tsx.
*/

/** Where the print sits against spot. Centre is spot; the fill runs out to
    whichever side it printed on, so a column of these reads as a distribution. */
const VsSpotBar = ({ pct, max }: { pct: number; max: number }) => {
  const half = Math.max(2, Math.min(50, (Math.abs(pct) / (max || 1)) * 50));
  const up = pct >= 0;
  return (
    <span className="relative inline-block h-1 w-16 rounded-full bg-inset align-middle" aria-hidden="true">
      <span className="absolute inset-y-0 left-1/2 w-px bg-borderMuted" />
      <span
        className={`absolute inset-y-0 ${up ? 'left-1/2' : 'right-1/2'} rounded-full ${up ? 'bg-bull/70' : 'bg-bear/70'}`}
        style={{ width: `${half}%` }}
      />
    </span>
  );
};

/** Conviction as a bar rather than a bare percentage — the point of the column
    is comparing rows, and a number does that worse than a length. */
/*
  The column that used to print the conviction number and a bar proportional to
  it. Both encoded a precision the value does not have — see matchTier below —
  and a proportional bar is the strongest possible claim that two rows can be
  ranked against each other on it. The word alone, right-aligned like the number
  it replaced.
*/
const MatchCell = ({ conviction }: { conviction: number }) => {
  const { label, tone } = matchTier(conviction);
  return (
    <span
      className={`font-mono text-caption uppercase tracking-wider leading-4 ${
        tone === 'warn' ? 'text-warn' : 'text-textSecondary'
      }`}
    >
      {label}
    </span>
  );
};

const roleTone: Record<DarkPoolLevel['role'], Tone> = {
  SUPPORT: 'bull',
  RESISTANCE: 'bear',
  PIVOT: 'neutral',
};

/*
  How strongly a print matched the pattern it was filed under.

  This used to render as `Confidence High · 84%`, and the percentage was the
  problem. `conviction` is drawn by `hRange` from a band that the matched
  archetype picks (data/darkpool.ts classify: a sized cross below market in an
  up-tape draws 70-92, routine rotation draws 35-55). So the only real content
  in the number is WHICH BAND, and the two digits after it are a hash — fake
  resolution on a quantity nothing measured. Printing 84% invited a reader to
  compare it against an 81% on the row below, where no such ordering exists.

  The band survives because it is genuine: it separates a cross that met every
  condition of its archetype from one that merely leaned. It reads as a word
  now, and the word is MATCH, not confidence — the module is saying how well the
  print fits a pattern, which is not the same as how likely the pattern is to be
  right. Weak reads amber (caution); the rest stay neutral so a match strength
  can never be mistaken for a direction.
*/
const matchTier = (conviction: number): { label: string; tone: Tone } =>
  conviction >= 75
    ? { label: 'Textbook', tone: 'neutral' }
    : conviction >= 55
      ? { label: 'Partial', tone: 'neutral' }
      : { label: 'Weak', tone: 'warn' };

/** The honest alternative to each inferred read — same tape, a different story. */
const competingRead: Record<DarkPoolIntent, string> = {
  ACCUMULATION: 'Could equally be short-covering or a hedge being unwound rather than fresh conviction buying.',
  DISTRIBUTION: 'Could equally be routine profit-taking or a hedge being layered on, not a directional exit.',
  'HEDGE FLOW': 'Could turn directional if a desk is expressing a view through the shelf, not purely hedging.',
  ROTATION: 'Could be the opening leg of an accumulation or distribution program that has yet to cluster.',
};

/** The same alternative one level up: what else would produce this session shape. */
const competingPosture: Record<string, string> = {
  ACCUMULATING:
    'Size crossing under the market can just as easily be short covering, or an index hedge coming off, as it can be someone building.',
  DISTRIBUTING:
    'Size crossing over the market can just as easily be profit taking, or a hedge being layered on, as it can be someone leaving.',
  BALANCED:
    'A balanced tape can also be one side working quietly in small clips while the other crosses in size.',
};

/** Retests are counted with a hard ceiling in the engine, so the top of the scale
    has to read as "at least", not as an exact count. */
const retestLabel = (defended: number) => (defended >= 5 ? '5+ retests held' : `${defended} retest${defended > 1 ? 's' : ''} held`);

/** How cleanly this print fits the archetype it was filed under. No percentage. */
const MatchChip = ({ conviction }: { conviction: number }) => {
  const { label, tone } = matchTier(conviction);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-label uppercase tracking-wider text-textMuted">Match</span>
      <SignalBadge tone={tone}>{label}</SignalBadge>
    </span>
  );
};

/** Block prints rendered per page. See the `shownCount` note below. */
const PAGE = 60;

const DarkPool = () => {
  const { marketData } = useMarketData();
  const view = useMemo(() => (marketData ? buildDarkPoolView(marketData) : null), [marketData]);
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  const [selectedPrint, setSelectedPrint] = useState<number | null>(null);
  // Tape controls. The dark tape is read the same way the lit one is — filter
  // down to a kind of print, then look at what is left — so it carries the same
  // three filters and a free-text box rather than a different vocabulary.
  const [execFilter, setExecFilter] = useState<(typeof EXEC_OPTIONS)[number]['value']>('ALL');
  const [intentFilter, setIntentFilter] = useState<(typeof INTENT_OPTIONS)[number]['value']>('ALL');
  const [minNotional, setMinNotional] = useState<(typeof SIZE_OPTIONS)[number]['value']>('0');
  /*
    Mount a page, not the whole session.

    All 240 block prints were rendered at once, which put 11,499 DOM nodes on
    this route — 7.4x the next-densest Trace desk (live-tape at 1,263) — and made
    the page 13,324px tall at 1500 and 20,899px at 390. Nobody reads 240 rows;
    they read the top of a sorted list and then narrow it.

    The filters above still run over the FULL set, so nothing is ever hidden
    behind the cap — only the RENDERING is paged, and the desk says how many it
    is holding back.
  */
  const [shownCount, setShownCount] = useState(PAGE);
  const [query, setQuery] = useState('');

  // Universe scan read. buildDarkPoolFeed already returns its sectors ordered by
  // notional, so the leader is index 0 rather than a second ranking of its output.
  const universe = useMemo(() => {
    const sectors = buildDarkPoolFeed();
    if (!sectors.length) return null;
    const total = sectors.reduce((a, s) => a + s.notional, 0);
    return {
      /*
        The SECTORS, not their constituents.

        This used to render every tracked name under every sector: ten sector
        cards, ~150 ticker rows, four numeric columns each, filling 4,400px
        below a desk about ONE ticker. It answered "where else did the size go"
        at a resolution nobody asked the question at, and it did it after the
        page had already answered that question in the sentence above.

        Ten rows is the distribution. A reader who wants the names has a desk
        for that — Stocks — and the sector detail is still one click away in the
        stock drawer, which reads the same feed.
      */
      list: sectors,
      lead: sectors[0],
      total,
      sectors: sectors.length,
      names: sectors.reduce((a, s) => a + s.rows.length, 0),
      sharePct: (sectors[0].notional / (total || 1)) * 100,
    };
  }, []);

  if (!view) {
    return (
      <Panel title="Dark Pool">
        <div className="h-40 flex items-center justify-center font-mono text-caption text-textMuted leading-4">Connecting…</div>
      </Panel>
    );
  }

  const selected = view.levels.find(l => l.price === selectedPrice) ?? [...view.levels].sort((a, b) => b.notional - a.notional)[0];
  const postureTone: Tone = view.posture === 'ACCUMULATING' ? 'bull' : view.posture === 'DISTRIBUTING' ? 'bear' : 'neutral';
  const PostureIcon = view.posture === 'ACCUMULATING' ? ArrowDownToLine : view.posture === 'DISTRIBUTING' ? ArrowUpFromLine : Scale;

  const nextUp = view.levels.filter(l => l.price > view.spot).sort((a, b) => a.price - b.price)[0];
  const nextDown = view.levels.filter(l => l.price < view.spot).sort((a, b) => b.price - a.price)[0];

  // The tally behind the posture. It is the classifier's own output counted, which
  // is what makes the verdict above it checkable instead of asserted.
  const tally = view.prints.reduce<Record<DarkPoolIntent, number>>(
    (a, p) => {
      a[p.intent] += 1;
      return a;
    },
    { ACCUMULATION: 0, DISTRIBUTION: 0, 'HEDGE FLOW': 0, ROTATION: 0 }
  );

  const q = query.trim().toUpperCase();
  const rows = view.prints.filter(
    p =>
      (execFilter === 'ALL' || p.execution === execFilter) &&
      (intentFilter === 'ALL' || p.intent === intentFilter) &&
      p.notional >= Number(minNotional) &&
      (!q ||
        p.execution.includes(q) ||
        p.intent.includes(q) ||
        p.venue.includes(q) ||
        // The field offers "read", so it has to search the reasoning too —
        // typing a phrase visible in an expanded row was removing that row.
        p.read.toUpperCase().includes(q) ||
        String(p.price).includes(q)),
  );

  // Resolved from the rows ON SCREEN. Reading it off the full session left the
  // expanded detail open for a print the active filters had just removed, with
  // no row left to click to close it.
  const activePrint = rows.find(p => p.id === selectedPrint) ?? null;

  // Which tracked shelf did the selected print land on? Nearest by price — used to
  // surface that shelf's retest count as evidence behind the inferred read.
  const activePrintShelf =
    activePrint && activePrint.atLevel && view.levels.length
      ? view.levels.reduce((best, l) =>
          Math.abs(l.price - activePrint.price) < Math.abs(best.price - activePrint.price) ? l : best
        )
      : null;


  // Counted off the classifier's own output, like the intent tally below it, so
  // the summary line is checkable against the rows rather than asserted over
  // them. Dollars rather than prints: one LIS cross and forty algo slices are
  // the same row count and nothing like the same flow.
  const byExec = view.prints.reduce<Record<string, { n: number; usd: number }>>((a, p) => {
    const e = (a[p.execution] ??= { n: 0, usd: 0 });
    e.n += 1;
    e.usd += p.notional;
    return a;
  }, {});
  const leadExec = Object.entries(byExec).sort((a, b) => b[1].usd - a[1].usd)[0];
  const midUsd = view.prints.filter(p => p.atMid).reduce((a, p) => a + p.notional, 0);
  const midShare = view.totalNotional ? (midUsd / view.totalNotional) * 100 : 0;
  const sweepUsd = byExec['SWEEP TO DARK']?.usd ?? 0;
  const blockRead = leadExec
    ? `${leadExec[0]} carries the session at ${fmtUsd(leadExec[1].usd)} across ${leadExec[1].n} ${leadExec[1].n === 1 ? 'print' : 'prints'} · ${midShare.toFixed(0)}% of block dollars crossed at the midpoint · ${sweepUsd > 0 ? `${fmtUsd(sweepUsd)} came in as sweeps that finished off-exchange` : 'no sweeps finished off-exchange'}.`
    : 'Nothing crossed off-exchange this session.';

  // Scales for the inline meters, off the rows ON SCREEN. The comment here said
  // exactly that while the code read the whole session, so filtering out the
  // day's outliers left every remaining bar normalised against something
  // hidden — a column of identical stubs, which is the one thing a meter must
  // not be.
  /* Narrowing the filters shrinks `rows`; the page resets with it so a reader
     never lands mid-way down a list they just re-cut. Derived, not stateful —
     `Math.min` needs no effect and cannot fall out of step. */
  const shown = rows.slice(0, Math.min(shownCount, Math.max(rows.length, PAGE)));

  const maxVs = Math.max(...rows.map(p => Math.abs(p.vsSpotPct)), 0.01);

  /*
    Two groups, split by provenance rather than by subject.

    The table used to run Print / Execution / Read, and the split did not survive
    reading: Kind and Venue sat under **Print**, the heading that means "what the
    tape carried", and Clips sat under Execution among pure arithmetic. All three
    are the classifier's output. The consolidated tape reports an off-exchange
    trade as price, size, time and condition codes — it does not say which kind
    of pool crossed it, what sort of order worked it, or which prints belong to
    one parent. Those are inferences, and they were wearing a fact's heading.

    So Kind, Venue and Clips now sit in **Read**, beside the column already
    headed "Inferred", and Execution holds only what the tape reports or what is
    arithmetic on it — time, price, distance from spot, size, notional, session
    share, and the reporting lag the TRF publishes.

    Venue was already de-branded to an ARCHETYPE, never a venue name, for a
    separate reason recorded in data/darkpool.ts: hanging invented crosses on
    regulated venues real firms operate reads as a citation of those firms.
  */
  const columns: Column<DarkPoolPrint>[] = [
    {
      key: 'time',
      group: 'Execution',
      header: 'Time',
      width: '62px',
      sortValue: p => p.time,
      render: p => <span className="font-mono text-caption text-textSecondary tnum leading-4">{p.time}</span>,
    },
    {
      key: 'price',
      group: 'Execution',
      header: 'Price',
      align: 'right',
      width: '82px',
      sortValue: p => p.price,
      render: p => <span className="font-mono text-caption text-textPrimary tnum leading-4">${p.price.toFixed(2)}</span>,
    },
    {
      key: 'vs',
      group: 'Execution',
      header: 'vs Spot',
      align: 'right',
      sortValue: p => p.vsSpotPct,
      render: p => (
        <span className="inline-flex items-center gap-2 justify-end w-full">
          <span className={`font-mono text-caption tnum ${p.vsSpotPct >= 0 ? 'text-bull' : 'text-bear'} leading-4`}>
            {p.vsSpotPct >= 0 ? '+' : ''}
            {p.vsSpotPct.toFixed(2)}%
          </span>
          <VsSpotBar pct={p.vsSpotPct} max={maxVs} />
        </span>
      ),
    },
    {
      key: 'size',
      group: 'Execution',
      header: 'Size',
      align: 'right',
      sortValue: p => p.size,
      render: p => (
        <span className="font-mono text-caption text-textSecondary tnum leading-4">{p.size.toLocaleString()}</span>
      ),
    },
    /*
      NO NOTIONAL COLUMN. Notional is Size x Price, and Size and Price are each
      already their own column — the table was doing one multiplication in public
      and charging a column for it. The `Session` column beside it carries the
      same quantity in the form that answers a question: notional as a share of
      the session's off-exchange dollars, which is what says whether a print
      mattered. The raw figure is still in the row's read-out.
    */
    {
      key: 'share',
      group: 'Execution',
      header: 'Session',
      align: 'right',
      width: '70px',
      sortValue: p => p.notional,
      render: p => {
        const pct = view.totalNotional ? (p.notional / view.totalNotional) * 100 : 0;
        return (
          <span
            className={`font-mono text-caption tnum leading-4 ${pct >= 2 ? 'text-textSecondary' : 'text-textMuted'}`}
            title="Share of session off-exchange dollars"
          >
            {pct < 0.01 ? '<0.01%' : `${pct.toFixed(2)}%`}
          </span>
        );
      },
    },
    {
      key: 'lag',
      group: 'Execution',
      header: 'Lag',
      align: 'right',
      width: '58px',
      sortValue: p => p.reportLagSec,
      render: p => (
        <span
          className={`font-mono text-caption tnum leading-4 ${p.reportLagSec > 120 ? 'text-warn' : 'text-textMuted'}`}
          title="Time between the trade and its appearance on the tape"
        >
          {p.reportLagSec >= 60 ? `${Math.round(p.reportLagSec / 60)}m` : `${p.reportLagSec}s`}
        </span>
      ),
    },
    {
      key: 'exec',
      group: 'Read',
      header: 'Kind',
      sortValue: p => p.execution,
      render: p => (
        <span className="inline-flex items-center gap-1.5" title={EXECUTION_NOTE[p.execution]}>
          <SignalBadge tone={execTone[p.execution]}>{p.execution}</SignalBadge>
          {p.atMid && (
            <span className="font-mono text-micro uppercase tracking-wider text-bull" title="Crossed inside the spread">
              MID
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'venue',
      group: 'Read',
      header: 'Venue',
      help: 'ATS',
      width: '128px',
      sortValue: p => p.venue,
      render: p => <span className="font-mono text-caption text-textMuted leading-4">{p.venue}</span>,
    },
    {
      key: 'clips',
      group: 'Read',
      header: 'Clips',
      align: 'right',
      width: '62px',
      sortValue: p => p.clips,
      render: p => (
        <span
          className="font-mono text-caption text-textMuted tnum leading-4"
          title={p.clips === 1 ? 'A single fill' : `${p.clips} child fills behind this print`}
        >
          {p.clips === 1 ? '1' : `${p.clips}×`}
        </span>
      ),
    },
    {
      key: 'intent',
      group: 'Read',
      header: 'Inferred',
      sortValue: p => p.intent,
      render: p => (
        <span className="inline-flex items-center gap-2">
          <SignalBadge tone={intentTone[p.intent]}>{p.intent}</SignalBadge>
          {p.atLevel && (
            <span title="Printed on a tracked shelf">
              <ShieldCheck className="w-3.5 h-3.5 text-flip" aria-label="printed on a tracked shelf" />
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'shelf',
      group: 'Read',
      header: 'Shelf',
      align: 'right',
      width: '86px',
      sortValue: p => (p.atLevel ? 1 : 0),
      render: p => {
        if (!p.atLevel || !view.levels.length) {
          return <span className="font-mono text-caption text-textMuted leading-4">—</span>;
        }
        const near = view.levels.reduce((best, l) =>
          Math.abs(l.price - p.price) < Math.abs(best.price - p.price) ? l : best,
        );
        return (
          <span className="font-mono text-caption text-flip tnum leading-4" title={`${near.role} shelf`}>
            ${near.price.toFixed(2)}
          </span>
        );
      },
    },
    {
      key: 'conv',
      group: 'Read',
      header: 'Match',
      align: 'right',
      width: '92px',
      sortValue: p => p.conviction,
      render: p => <MatchCell conviction={p.conviction} />,
    },
  ];

  return (
    <>
      {/* The answer first. This tab used to open on a market-wide numeric matrix
          with no sentence in it, three screens above the one line that said what
          any of it meant. The ticker read leads now; the universe scan is the
          appendix at the bottom. */}
      {/* The tape leads, the way the lit tape does: strip, controls, prints.
          This page used to open on a five-paragraph verdict with the blocks
          themselves three screens down, which is backwards for a tape — the
          rows are the evidence and the verdict is the summary of them. */}
      <MetricGrid min="170px">
        <StatCard label="Block notional" value={fmtUsd(view.totalNotional)} sub={`${view.prints.length} prints · ${view.prints.filter(p => p.notional >= 1_000_000).length} over $1M`} />
        <StatCard
          label="Largest block"
          value={view.largest ? fmtUsd(view.largest.notional) : '--'}
          sub={view.largest ? `crossed at $${view.largest.price.toFixed(2)} on ${view.largest.venue}` : ''}
          tone={view.largest ? intentTone[view.largest.intent] : 'neutral'}
        />
        <StatCard
          label="Crossed at mid"
          value={`${midShare.toFixed(0)}%`}
          sub="of block dollars, inside the spread"
        />
        <StatCard
          label="Swept to dark"
          value={sweepUsd > 0 ? fmtUsd(sweepUsd) : '—'}
          sub={sweepUsd > 0 ? 'aggressors that finished off-exchange' : 'no sweeps finished off-exchange'}
          tone={sweepUsd > 0 ? 'warn' : undefined}
        />
        <StatCard
          label="Nearest shelves"
          value={
            <span className="text-body leading-5">
              {nextDown ? `$${nextDown.price.toFixed(2)}` : 'none'} / {nextUp ? `$${nextUp.price.toFixed(2)}` : 'none'}
            </span>
          }
          sub="below spot / above spot"
        />
      </MetricGrid>

      {/*
        THE PICTURE FIRST.

        This desk used to open on 240 rows of prints and put the shelf ladder
        four screens below them, which asked the reader to hold thirty prices in
        their head to see a cluster the eye finds in one look. Off-exchange
        dollars against the price axis IS the dark-pool question; the tape is the
        evidence for it, so the tape moved below.

        The ladder and the read are one statement, so they sit in one row: click
        a shelf on the left and the right says what to do about it.
      */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        <Panel
          title="Where the size crossed"
          subtitle={`${view.ticker} · off-exchange dollars by price · ${fmtUsd(view.totalNotional)} across ${view.prints.length} prints`}
          flush
          className="lg:col-span-3"
        >
          <div className="py-2">
            <DarkPoolLadder
              ticker={view.ticker}
              spot={view.spot}
              prints={view.prints}
              levels={view.levels}
              selectedPrice={selected.price}
              onSelectShelf={setSelectedPrice}
            />
          </div>
          <p className="px-4 py-2.5 border-t border-borderSubtle text-label leading-relaxed text-textMuted">
            <span className="font-mono uppercase tracking-wider text-textSecondary mr-2">Reading it</span>
            Bar length is dollars that crossed in that price band — price and size are what the consolidated
            tape reports for an off-exchange trade, so the shape is measured. SUPPORT, RESISTANCE and PIVOT
            are the engine&rsquo;s judgement about which of those peaks matter, which is why they label a bar
            instead of sizing one.
          </p>
        </Panel>

        {/*
          THE RIGHT COLUMN IS THE READ.

          Left is the picture and nothing else; right is what it means, at two
          scales — the shelf under the cursor, then the session as a whole. The
          posture verdict used to sit in a full-width panel of its own between
          the ladder and the tape, which put a five-line paragraph across 1,500px
          and left this column empty beside a twenty-row chart. One statement per
          column reads; two columns each half-used does not.
        */}
        <div className="lg:col-span-2 flex flex-col gap-4">
        {/* Usage — what to actually do with the selected shelf */}
        <Panel
          title="How to use it"
          subtitle={`$${selected.price.toFixed(2)} shelf`}
          tone={roleTone[selected.role]}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <SignalBadge tone={roleTone[selected.role]} dot>
                {selected.role}
              </SignalBadge>
              <span className="font-mono text-label uppercase tracking-wider text-textMuted">
                {selected.sharePct.toFixed(0)}% of session blocks ·{' '}
                {selected.defended > 0 ? retestLabel(selected.defended) : 'untested'}
              </span>
            </div>
            <p className="text-caption text-textSecondary leading-relaxed">{selected.usage}</p>
            {/*
              A label and its read, side by side.

              These were `justify-between` rows as wide as the panel, and the
              panel is `lg:col-span-2` — at 2560 that put "Above the shelf"
              837px from what happens above the shelf, on all three rows. A
              caption and its answer are one statement; they read as two
              unrelated columns once a monitor pulls them apart. The label now
              takes a fixed measure and the read sits against it.
            */}
            <div className="border-t border-borderSubtle pt-3 flex flex-col gap-2">
              <div className="flex items-baseline gap-3 font-mono text-caption leading-4">
                <span className="text-textMuted uppercase tracking-wider text-micro">Above the shelf</span>
                <span className="text-bull">
                  {selected.role === 'RESISTANCE' ? 'breakout confirms, supply cleared' : 'bias long against it'}
                </span>
              </div>
              <div className="flex items-baseline gap-3 font-mono text-caption leading-4">
                <span className="text-textMuted uppercase tracking-wider text-micro">Below the shelf</span>
                <span className="text-bear">
                  {selected.role === 'SUPPORT' ? 'read invalid, step aside' : 'supply in control'}
                </span>
              </div>
              <div className="flex items-baseline gap-3 font-mono text-caption leading-4">
                <span className="text-textMuted uppercase tracking-wider text-micro">Next shelf</span>
                <span className="text-textPrimary tnum">
                  {selected.distPct >= 0
                    ? nextUp && nextUp.price !== selected.price
                      ? `$${nextUp.price.toFixed(2)}`
                      : nextDown
                        ? `$${nextDown.price.toFixed(2)}`
                        : '--'
                    : nextDown && nextDown.price !== selected.price
                      ? `$${nextDown.price.toFixed(2)}`
                      : nextUp
                        ? `$${nextUp.price.toFixed(2)}`
                        : '--'}
                </span>
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          title="What the blocks say"
          subtitle={`${view.ticker} · session`}
          tone={postureTone}
          emphasis
        >
          <div className="flex flex-col gap-3">
            <p className="text-caption leading-relaxed text-textMuted">
              Dark pool prints are blocks crossed away from the lit exchanges. The only question they answer is
              whether size is being built or unloaded, and at what price.
            </p>

            <div className="flex items-center gap-3 flex-wrap">
              <span
                className={`inline-flex items-center gap-2 font-mono text-lg font-bold uppercase tracking-wide ${
                  postureTone === 'bull' ? 'text-bull' : postureTone === 'bear' ? 'text-bear' : 'text-textPrimary'
                }`}
              >
                <PostureIcon className="w-5 h-5" />
                {view.posture}
              </span>
              <SignalBadge tone={postureTone} dot>
                {view.netPosturePct >= 0 ? '+' : ''}
                {view.netPosturePct.toFixed(0)} skew
              </SignalBadge>
            </div>

            <p className="text-caption leading-relaxed text-textSecondary">{view.postureNote}</p>

            <div className="flex flex-col gap-1 border-t border-borderSubtle pt-3">
              <span className="font-mono text-label text-textMuted tnum">
                Across {view.prints.length} prints:{' '}
                <span className="text-bull">{tally.ACCUMULATION} accumulation</span>,{' '}
                <span className="text-bear">{tally.DISTRIBUTION} distribution</span>,{' '}
                <span className="text-warn">{tally['HEDGE FLOW']} hedge</span>,{' '}
                <span className="text-textSecondary">{tally.ROTATION} rotation</span>
              </span>
              <span className="text-label leading-relaxed text-textMuted">
                The skew above weights each block&rsquo;s notional by how cleanly it matched its archetype, so one large
                cross that only leans cannot carry the verdict on its own. That weight is a property of the pattern, not
                a probability that the read is correct &mdash; nothing here scores whether the print meant what it looked
                like.
              </span>
            </div>

            <div className="flex items-start gap-2 border-t border-borderSubtle pt-3">
              <span className="font-mono text-label uppercase tracking-wider text-textMuted whitespace-nowrap mt-px">
                Competing read
              </span>
              <p className="text-label leading-relaxed text-textMuted">{competingPosture[view.posture]}</p>
            </div>
          </div>
        </Panel>
        </div>
      </div>

      <Panel
        title="Dark tape"
        subtitle={`${view.ticker} · off-exchange prints, newest first`}
        flush
      >
        {/* Same controls as the lit tape, in the same order, because it is the
            same job: narrow to a kind of print, then read what is left. */}
        <div className="px-4 py-3 border-b border-borderSubtle flex flex-wrap items-center gap-2">
          <label className="relative flex items-center">
            <Search className="absolute left-2.5 w-3.5 h-3.5 text-textMuted pointer-events-none" aria-hidden="true" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Kind, read, venue, price…"
              aria-label="Filter dark pool prints"
              className="w-52 bg-inset border border-borderSubtle rounded-md pl-8 pr-2 py-1.5 font-mono text-caption text-textPrimary placeholder:text-textMuted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"
            />
          </label>
          <SegmentedControl
            options={EXEC_OPTIONS}
            value={execFilter}
            onChange={setExecFilter}
            ariaLabel="Filter by execution kind"
          />
          <SegmentedControl
            options={INTENT_OPTIONS}
            value={intentFilter}
            onChange={setIntentFilter}
            ariaLabel="Filter by inferred read"
          />
          <SegmentedControl
            options={SIZE_OPTIONS}
            value={minNotional}
            onChange={setMinNotional}
            ariaLabel="Filter by block notional"
          />
          <span className="ml-auto font-mono text-label uppercase tracking-wider text-textMuted tnum">
            {rows.length} of {view.prints.length} prints
          </span>
        </div>
        <p className="px-4 py-2.5 border-b border-borderSubtle flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-mono text-label uppercase tracking-wider text-textMuted">Block read</span>
          <span className="text-caption text-textSecondary leading-relaxed">{blockRead}</span>
        </p>
        {activePrint && (
          <div className="px-4 py-3 border-b border-borderSubtle bg-inset flex flex-col gap-2.5 animate-soft-in">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-label uppercase tracking-wider text-textMuted">Inferred as</span>
              <SignalBadge tone={intentTone[activePrint.intent]}>{activePrint.intent}</SignalBadge>
              <MatchChip conviction={activePrint.conviction} />
              {activePrintShelf && (
                <span className="inline-flex items-center gap-1 font-mono text-label uppercase tracking-wider text-flip">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {activePrintShelf.defended > 0
                    ? `shelf held, ${retestLabel(activePrintShelf.defended)}`
                    : 'on an untested shelf'}
                </span>
              )}
            </div>
            <p className="text-caption text-textSecondary leading-relaxed">{activePrint.read}</p>
            <div className="flex items-start gap-2 border-t border-borderSubtle pt-2.5">
              <span className="font-mono text-label uppercase tracking-wider text-textMuted whitespace-nowrap mt-px">
                Competing read
              </span>
              <p className="text-label text-textMuted leading-relaxed">{competingRead[activePrint.intent]}</p>
            </div>
          </div>
        )}
        {rows.length === 0 ? (
          <EmptyState
            title="No prints match"
            body="Every block this session sits outside these filters. Widen the kind, the read or the size floor."
          />
        ) : (
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={p => String(p.id)}
          onRowClick={p => setSelectedPrint(prev => (prev === p.id ? null : p.id))}
          selectedKey={activePrint ? String(activePrint.id) : null}
          /* `share`, not `notional` — the notional column is gone, and a sort
             pointed at a key no column carries silently sorts by nothing. Share
             is notional over the session total, so the ordering is identical. */
          initialSort={{ key: 'share', dir: 'desc' }}
        />
        )}
        {shown.length < rows.length && (
          <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-borderSubtle">
            <span className="font-mono text-micro uppercase tracking-wider text-textMuted tnum">
              Showing {shown.length} of {rows.length} prints
            </span>
            <button
              type="button"
              onClick={() => setShownCount(c => c + PAGE)}
              className="inline-flex items-center min-h-8 rounded-md border border-borderSubtle bg-panel px-3 py-1.5 font-mono text-label uppercase tracking-wider text-textSecondary transition-colors hover:border-borderMuted hover:text-textPrimary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select/60"
            >
              Show more
            </button>
          </div>
        )}
        {/* What each kind means, once, under the tape that uses them. */}
        <dl className="px-4 py-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3 border-t border-borderSubtle">
          {EXEC_OPTIONS.filter(o => o.value !== 'ALL').map(o => (
            <div key={o.value} className="flex items-baseline gap-2">
              <dt className="font-mono text-micro uppercase tracking-wider text-textSecondary whitespace-nowrap">
                {o.value}
              </dt>
              <dd className="text-label text-textMuted leading-relaxed">
                {EXECUTION_NOTE[o.value as DarkPoolExecution]}
              </dd>
            </div>
          ))}
        </dl>
      </Panel>

      {/* Classified prints */}

      {/* Appendix: the same question asked of the whole tracked list. It answers
          "where else is the size going", which is a different question to the one
          the panels above answer, so it is labelled as such and sits last. */}
      {universe && (
        <Panel title="Where else the size went" subtitle="off-exchange dollars across the tracked list, by sector" flush>
          <p className="px-4 py-2.5 border-b border-borderSubtle text-caption leading-relaxed text-textMuted">
            {universe.names} tracked names crossed {fmtUsd(universe.total)} off-exchange across {universe.sectors}{' '}
            sectors this session. {universe.lead.sector} leads on {fmtUsd(universe.lead.notional)},{' '}
            {universe.sharePct.toFixed(0)}% of the scanned total. None of it is tied to {view.ticker}: it is the
            session&rsquo;s shape across the list, not a running count.
          </p>
          <ul className="px-4 py-2 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
            {universe.list.map(sec => (
              <li key={sec.sector} className="flex items-center gap-3">
                {/* 190px, MEASURED in the browser rather than estimated twice.
                    "Consumer Discretionary" is the longest name the universe
                    carries and renders 182px at text-label with the house
                    uppercase tracking — 124 and then 164 were both guesses and
                    both clipped it. Two columns rather than three at xl for the
                    same reason: ten sectors fit five rows comfortably, and a
                    third column would have taken the width straight back off the
                    bar. `truncate` + `title` remain the backstop for a longer
                    name added later. */}
                <span
                  title={sec.sector}
                  className="min-w-0 flex-1 sm:flex-none sm:w-[190px] shrink truncate font-mono text-label uppercase tracking-wider text-textSecondary"
                >
                  {sec.sector}
                </span>
                <span className="relative hidden sm:block flex-1 h-[6px] rounded-full bg-white/[0.04] overflow-hidden">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-darkpool/60"
                    style={{ width: `${Math.max(2, (sec.notional / universe.lead.notional) * 100)}%` }}
                  />
                </span>
                <span className="w-[62px] shrink-0 text-right font-mono text-label tnum text-textPrimary">
                  {fmtUsd(sec.notional)}
                </span>
                {/* The print count is the first thing to go on a phone: four
                    fixed tracks plus a bar do not fit 390, and of the four this
                    is the one the sentence above already summarises. */}
                <span className="hidden sm:block w-[64px] shrink-0 text-right font-mono text-micro tnum text-textMuted">
                  {sec.prints} prints
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
};

export default DarkPool;
