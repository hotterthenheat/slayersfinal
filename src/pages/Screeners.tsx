import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, TrendingUp, TrendingDown, CalendarClock, ThumbsUp, Activity, Layers, Coins, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import DataState from '../components/ui/DataState';
import ProvenanceChip from '../components/ui/ProvenanceChip';
import { SCREENERS, runScreener, type ScreenerKey } from '../data/screeners';

/*
==================================================
  SLAYER TERMINAL - SCREENERS (pages/Screeners.tsx)

  The board for when you do not have a name yet.
==================================================

  Every other desk here answers a question about ONE ticker. This answers
  questions about all of them: what moved, what reports, what is expensive
  to own, what is making new highs.

  NOT A COPY OF THE REFERENCE'S LAYOUT. The shape that app uses — a tall
  list of illustrated rows, one line of copy each, tapped through to a
  screen per list — is a phone's shape, and this is a desk. The INFORMATION
  is the same set of questions; the presentation is the house's: a rail of
  boards on the left, the selected board as a dense table on the right, and
  every row a door to that name's overview.

  THE HONESTY CHIPS ARE NOT DECORATION. Two of these boards are our
  opinion rather than anybody's data — the analyst rating has no analyst
  behind it and the dividend yield is generated, not filed. Those carry
  `model`; the rest carry `simulated`. When a feed lands, the kind changes
  and the surface does not.

  WHY THE COUNT IS ON THE RAIL. A board with nothing in it is a real
  answer — "nothing made a new 52-week low today" is information — and a
  reader should be able to see that before clicking rather than after.
*/

const ICONS: Record<ScreenerKey, typeof Search> = {
  gainers: TrendingUp,
  losers: TrendingDown,
  earnings: CalendarClock,
  analyst: ThumbsUp,
  iv: Activity,
  optionsVolume: Layers,
  dividend: Coins,
  high52: ArrowUpRight,
  low52: ArrowDownRight,
};

/** The two boards nobody supplies us — ours, and they say so. */
const MODELLED = new Set<ScreenerKey>(['analyst', 'dividend']);

const Screeners = () => {
  const [active, setActive] = useState<ScreenerKey>('gainers');
  const [query, setQuery] = useState('');

  /* Every board's length, so the rail can show what is empty before the
     reader spends a click finding out. */
  const counts = useMemo(() => {
    const out = {} as Record<ScreenerKey, number>;
    for (const s of SCREENERS) out[s.key] = runScreener(s.key, 99).length;
    return out;
  }, []);

  const screener = SCREENERS.find(s => s.key === active)!;
  const rows = useMemo(() => runScreener(active, 25), [active]);
  const shown = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter(r => r.ticker.includes(q) || r.name.toUpperCase().includes(q));
  }, [rows, query]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={['Terminal', 'Screeners']}
        title="Screeners"
        subtitle="Nine questions asked of the whole universe, not of one name"
        actions={
          <ProvenanceChip
            /* `sources` is the registry lookup and `kind` overrides what it
               derives. Both boards read the same simulated price series, so
               the source is `candles`; the two modelled boards override the
               KIND because a seeded opinion is not the same claim as a
               seeded price. */
            sources={['candles']}
            kind={MODELLED.has(active) ? 'model' : 'simulated'}
            state="ok"
            note={MODELLED.has(active)
              ? 'This board is our own read — no analyst and no filing behind it.'
              : 'The simulator produced these figures. No market was consulted.'}
          />
        }
      />

      <div className="flex flex-col lg:flex-row gap-4">
        {/* ── the rail of boards ───────────────────────────────────────── */}
        <div className="lg:w-[260px] shrink-0 flex flex-col gap-1">
          {SCREENERS.map(s => {
            const Icon = ICONS[s.key];
            const on = s.key === active;
            const n = counts[s.key];
            return (
              <button
                key={s.key}
                onClick={() => setActive(s.key)}
                aria-pressed={on}
                className={`group text-left flex items-start gap-2.5 px-3 py-2.5 rounded-md border transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-select ${
                  on
                    ? 'border-borderMuted bg-panelHover'
                    : 'border-borderSubtle bg-panel hover:bg-panelHover'
                }`}
              >
                <Icon size={14} className={`mt-0.5 shrink-0 ${on ? 'text-select' : 'text-textMuted group-hover:text-textSecondary'}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={`text-[12px] leading-tight ${on ? 'text-textPrimary' : 'text-textSecondary'}`}>{s.label}</span>
                    <span className="ml-auto font-mono text-[10px] tnum text-textMuted">{n}</span>
                  </span>
                  <span className="block text-[10px] leading-snug text-textMuted mt-0.5">{s.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* ── the selected board ───────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <Panel
            title={screener.label}
            subtitle={screener.blurb}
            id={`screener-${screener.key}`}
            collapsible
            actions={
              <label className="relative flex items-center">
                <Search size={12} className="absolute left-2 text-textMuted pointer-events-none" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Filter this board…"
                  aria-label={`Filter ${screener.label}`}
                  className="w-[180px] bg-inset border border-borderSubtle rounded pl-7 pr-2 py-1 font-mono text-[11px] text-textPrimary placeholder:text-textMuted focus:outline-none focus-visible:ring-1 focus-visible:ring-select"
                />
              </label>
            }
          >
            {shown.length === 0 ? (
              <DataState
                kind="empty"
                title={query ? 'Nothing on this board matches' : 'Nothing qualifies today'}
                /* An empty board is an ANSWER, and the copy says which kind:
                   a filter too tight is the reader's to widen, a board with
                   no qualifiers is the market's doing and not a fault. */
                body={query
                  ? 'Clear the filter to see the whole board.'
                  : `No name in the universe met this board's test in today's session.`}
                pad="lg"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[520px]">
                  <thead>
                    <tr className="border-b border-borderSubtle">
                      {['Symbol', 'Company', 'Last', 'Change', screener.metricLabel].map((h, i) => (
                        <th
                          key={h}
                          className={`px-2 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-textMuted ${
                            i > 1 ? 'text-right' : 'text-left'
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map(r => (
                      <tr key={r.ticker} className="border-b border-borderSubtle/40 last:border-0 hover:bg-panelHover transition-colors">
                        <td className="px-2 py-1.5">
                          <Link
                            to={`/stocks/${r.ticker}`}
                            title={`Open the ${r.ticker} overview`}
                            className="font-mono text-[12px] font-semibold text-textPrimary hover:text-select focus:outline-none focus-visible:ring-1 focus-visible:ring-select rounded"
                          >
                            {r.ticker}
                          </Link>
                        </td>
                        <td className="px-2 py-1.5 min-w-0">
                          <span className="block text-[11px] text-textSecondary truncate">{r.name}</span>
                          <span className="block text-[9px] text-textMuted truncate">{r.note}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-[11px] tnum text-textPrimary">
                          ${r.price.toFixed(2)}
                        </td>
                        <td className={`px-2 py-1.5 text-right font-mono text-[11px] tnum ${r.changePct >= 0 ? 'text-bull' : 'text-bear'}`}>
                          {r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%
                        </td>
                        <td className={`px-2 py-1.5 text-right font-mono text-[11px] tnum font-semibold ${
                          screener.tone === 'up' ? 'text-bull' : screener.tone === 'down' ? 'text-bear' : 'text-textPrimary'
                        }`}>
                          {r.metric}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
};

export default Screeners;
