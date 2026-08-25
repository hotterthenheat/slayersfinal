import { useMemo, useState } from 'react';
import { ShieldCheck, ArrowDownToLine, ArrowUpFromLine, Scale } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildDarkPoolLeaders, buildDarkPoolView } from '../../data/darkpool';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import RichRead from '../../components/ui/RichRead';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import DataTable, { type Column } from '../../components/ui/DataTable';
import SpotRule from '../../components/ui/SpotRule';
import type { DarkLeaderRow, DarkLeadersView, DarkPoolIntent, DarkPoolLevel, DarkPoolPrint } from '../../types/darkpool';
import type { Tone } from '../../components/ui/tones';
import { fmtNum } from '../../core/numFormat';

/*
  Two surfaces, one grammar:
    LEADERS — the market-wide view: off-exchange flow grouped by sector,
      sectors ranked by dark notional, top tickers inside each. Numbers carry
      the ranking; the sector dot is the only identity color.
    SINGLE TICKER — the deep dive that used to be the whole page: shelves,
      classified prints, posture. Color diet applied: role/intent read as
      dot + text, not badge walls; tone survives only where it IS the signal.
*/

type DpTab = 'leaders' | 'ticker';

// ---- shared micro-components ------------------------------------------------

const roleDot: Record<DarkPoolLevel['role'], string> = {
  SUPPORT: 'bg-bull',
  RESISTANCE: 'bg-bear',
  PIVOT: 'bg-white/40',
};

const RoleTag = ({ role }: { role: DarkPoolLevel['role'] }) => (
  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-textPrimary">
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${roleDot[role]}`} />
    {role}
  </span>
);

const intentDot: Record<DarkPoolIntent, string> = {
  ACCUMULATION: 'bg-bull',
  DISTRIBUTION: 'bg-bear',
  'HEDGE FLOW': 'bg-white/70',
  ROTATION: 'bg-white/25',
};

const IntentTag = ({ intent }: { intent: DarkPoolIntent }) => (
  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-textPrimary whitespace-nowrap">
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${intentDot[intent]}`} />
    {intent}
  </span>
);

/** Notional meter for a shelf — support rides the holo foil, supply reads red. */
const ShelfBar = ({ level, max }: { level: DarkPoolLevel; max: number }) => (
  <span className="flex w-full h-[5px] rounded-full overflow-hidden bg-white/[0.05]">
    <span
      className={`h-full rounded-full ${
        level.role === 'SUPPORT' ? 'holo-bar' : level.role === 'RESISTANCE' ? 'bg-bear/80' : 'bg-white/25'
      }`}
      style={{ width: `${Math.max(6, (level.notional / max) * 100)}%` }}
    />
  </span>
);

// ---- leaders ----------------------------------------------------------------
// NOT the card-wall — one instrument, master-detail. The tape bar shows the
// whole day's dark composition at a glance; the ranking rail orders sectors;
// the detail panel holds ONE full table for whichever sector you're reading.

const LeadersView = ({
  leaders,
  onOpenTicker,
}: {
  leaders: DarkLeadersView;
  onOpenTicker: (t: string) => void;
}) => {
  const [sel, setSel] = useState(0);
  const sector = leaders.sectors[Math.min(sel, leaders.sectors.length - 1)];
  const sectorMax = Math.max(...sector.rows.map(r => r.notional));
  const unusual = [...sector.rows].sort((a, b) => b.pctAvgVol - a.pctAvgVol)[0];

  const fmtSize = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${(n / 1e3).toFixed(0)}K`);
  const fmtAv = (v: number) => `${v >= 100 ? v.toFixed(0) : v.toFixed(1)}%`;

  const columns: Column<DarkLeaderRow>[] = [
    {
      key: 'ticker',
      header: 'Ticker',
      render: r => <span className="font-mono text-xs font-semibold text-textPrimary">{r.ticker}</span>,
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      sortValue: r => r.price,
      render: r => (
        <span className="font-mono text-xs text-textPrimary tnum whitespace-nowrap">
          ${r.price.toFixed(2)}
          <span className={`ml-1 ${r.dirUp ? 'text-bull' : 'text-bear'}`}>{r.dirUp ? '↑' : '↓'}</span>
        </span>
      ),
    },
    {
      key: 'share',
      header: 'Weight',
      width: '96px',
      sortValue: r => r.notional,
      render: r => (
        <span className="flex w-full h-[4px] rounded-full overflow-hidden bg-white/[0.05]">
          <span
            className="h-full rounded-full"
            style={{ width: `${Math.max(4, (r.notional / sectorMax) * 100)}%`, background: sector.color, opacity: 0.8 }}
          />
        </span>
      ),
    },
    {
      key: 'notional',
      header: 'Dark notional',
      align: 'right',
      sortValue: r => r.notional,
      render: r => <span className="font-mono text-xs font-semibold text-textPrimary tnum">{fmtUsd(r.notional)}</span>,
    },
    {
      key: 'av',
      header: '% Avg vol',
      align: 'right',
      sortValue: r => r.pctAvgVol,
      render: r => (
        <span className={`font-mono text-xs tnum ${r.pctAvgVol >= 20 ? 'text-select font-semibold' : 'text-textPrimary'}`}>
          {fmtAv(r.pctAvgVol)}
        </span>
      ),
    },
    {
      key: 'size',
      header: 'Size',
      align: 'right',
      sortValue: r => r.size,
      render: r => <span className="font-mono text-xs text-textSecondary tnum">{fmtSize(r.size)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Tape composition — the whole day's dark flow as one segmented bar */}
      <Panel bodyClassName="py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">
            Where today's dark tape printed
          </span>
          <span className="font-mono text-[11px] text-textSecondary tnum">
            {fmtUsd(leaders.totalNotional)} · {fmtNum(leaders.totalPrints)} prints
          </span>
        </div>
        <div className="flex h-2.5 rounded-sm overflow-hidden gap-px">
          {leaders.sectors.map((s, i) => (
            <button
              key={s.sector}
              onClick={() => setSel(i)}
              title={`${s.sector} · ${s.sharePct.toFixed(1)}%`}
              className="h-full transition-opacity duration-200 hover:opacity-100"
              style={{ width: `${Math.max(1.2, s.sharePct)}%`, background: s.color, opacity: i === sel ? 1 : 0.4 }}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 font-mono text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sector.color }} />
          <span className="text-textPrimary font-semibold">{sector.sector}</span>
          <span className="tnum text-textSecondary">{sector.sharePct.toFixed(1)}% of the dark tape</span>
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        {/* Ranking rail */}
        <Panel title="Sector leadership" subtitle="ranked by dark notional" flush className="lg:col-span-2">
          <div className="flex flex-col">
            {leaders.sectors.map((s, i) => {
              const isSel = i === sel;
              return (
                <button
                  key={s.sector}
                  onClick={() => setSel(i)}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                    isSel ? 'bg-select/[0.05] shadow-[inset_2px_0_0_0_rgba(228,232,244,0.7)]' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <span className="font-mono text-[10px] text-textMuted tnum w-5">{String(i + 1).padStart(2, '0')}</span>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="min-w-0 flex-1">
                    <span className={`block font-mono text-[13px] text-textPrimary truncate ${isSel ? 'font-semibold' : ''}`}>
                      {s.sector}
                    </span>
                    <span className="mt-1 flex h-[3px] w-full rounded-full overflow-hidden bg-white/[0.05]">
                      <span
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(2, (s.notional / leaders.sectors[0].notional) * 100)}%`,
                          background: s.color,
                          opacity: isSel ? 0.9 : 0.5,
                        }}
                      />
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block font-mono text-[13px] font-semibold text-textPrimary tnum">{fmtUsd(s.notional)}</span>
                    <span className="block font-mono text-[11px] text-textSecondary tnum">
                      {s.sharePct.toFixed(1)}% · {fmtNum(s.prints)} prints
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>

        {/* Sector detail — one table, full width, click a name to open it */}
        <Panel
          title={sector.sector}
          subtitle={`top names by dark notional · click to open in Single Ticker`}
          flush
          className="lg:col-span-3"
        >
          {unusual && unusual.pctAvgVol >= 20 && (
            <div className="px-4 py-2.5 border-b border-borderSubtle bg-inset flex items-center gap-2.5 font-mono text-xs">
              <span className="uppercase tracking-wider text-select font-semibold text-[11px]">Unusual</span>
              <span className="text-textPrimary">
                {unusual.ticker} printed <span className="font-semibold tnum">{fmtAv(unusual.pctAvgVol)}</span> of its average
                volume dark today
              </span>
            </div>
          )}
          <DataTable
            columns={columns}
            rows={sector.rows}
            rowKey={r => r.ticker}
            onRowClick={r => onOpenTicker(r.ticker)}
            initialSort={{ key: 'notional', dir: 'desc' }}
          />
        </Panel>
      </div>
    </div>
  );
};

// ---- page -------------------------------------------------------------------

const DarkPool = () => {
  const { activeTicker, marketData, changeTicker } = useMarketData();
  const [tab, setTab] = useState<DpTab>('leaders');

  const view = useMemo(() => (marketData ? buildDarkPoolView(marketData) : null), [marketData]);
  const leaders = useMemo(() => buildDarkPoolLeaders(), [marketData]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  const [selectedPrint, setSelectedPrint] = useState<number | null>(null);

  const openTicker = (t: string) => {
    changeTicker(t);
    setTab('ticker');
  };

  if (!view) {
    return (
      <Panel title="Dark Pool">
        <div className="h-40 flex items-center justify-center font-mono text-xs text-textMuted">Connecting…</div>
      </Panel>
    );
  }

  const maxNotional = Math.max(...view.levels.map(l => l.notional));
  const selected = view.levels.find(l => l.price === selectedPrice) ?? [...view.levels].sort((a, b) => b.notional - a.notional)[0];
  const activePrint = view.prints.find(p => p.id === selectedPrint) ?? null;

  const postureTone: Tone = view.posture === 'ACCUMULATING' ? 'bull' : view.posture === 'DISTRIBUTING' ? 'bear' : 'neutral';
  const PostureIcon = view.posture === 'ACCUMULATING' ? ArrowDownToLine : view.posture === 'DISTRIBUTING' ? ArrowUpFromLine : Scale;

  const nextUp = view.levels.filter(l => l.price > view.spot).sort((a, b) => a.price - b.price)[0];
  const nextDown = view.levels.filter(l => l.price < view.spot).sort((a, b) => b.price - a.price)[0];

  const columns: Column<DarkPoolPrint>[] = [
    { key: 'time', header: 'Time', width: '64px', render: p => <span className="font-mono text-xs text-textSecondary tnum">{p.time}</span> },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      sortValue: p => p.price,
      render: p => <span className="font-mono text-xs text-textPrimary tnum">${p.price.toFixed(2)}</span>,
    },
    {
      key: 'vs',
      header: 'vs Spot',
      align: 'right',
      sortValue: p => p.vsSpotPct,
      render: p => (
        <span className={`font-mono text-xs tnum ${p.vsSpotPct >= 0 ? 'text-bull' : 'text-bear'}`}>
          {p.vsSpotPct >= 0 ? '+' : ''}
          {p.vsSpotPct.toFixed(2)}%
        </span>
      ),
    },
    {
      key: 'size',
      header: 'Size',
      align: 'right',
      sortValue: p => p.size,
      render: p => <span className="font-mono text-xs text-textPrimary tnum">{fmtNum(p.size)}</span>,
    },
    {
      key: 'notional',
      header: 'Notional',
      align: 'right',
      sortValue: p => p.notional,
      render: p => <span className="font-mono text-xs font-semibold text-textPrimary tnum">{fmtUsd(p.notional)}</span>,
    },
    { key: 'venue', header: 'Venue', render: p => <span className="font-mono text-xs text-textSecondary">{p.venue}</span> },
    {
      key: 'intent',
      header: 'Read',
      sortValue: p => p.intent,
      render: p => (
        <span className="inline-flex items-center gap-2">
          <IntentTag intent={p.intent} />
          {p.atLevel && <ShieldCheck className="w-3.5 h-3.5 text-flip" aria-label="printed on a tracked shelf" />}
        </span>
      ),
    },
    {
      key: 'conv',
      header: 'Conf',
      align: 'right',
      sortValue: p => p.conviction,
      render: p => <span className="font-mono text-xs text-textPrimary tnum">{p.conviction}%</span>,
    },
  ];

  return (
    <>
      {/* View switch: market-wide leaders vs one name's book */}
      <div className="flex items-center gap-3 flex-wrap min-h-[34px]">
        <div role="group" aria-label="Dark pool view" className="inline-flex items-center gap-0.5">
          {(
            [
              { key: 'leaders' as DpTab, label: 'Leaders' },
              { key: 'ticker' as DpTab, label: 'Single Ticker' },
            ] as const
          ).map(t => (
            <button
              key={t.key}
              aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`px-2.5 py-1 rounded font-mono text-xs transition-colors ${
                tab === t.key
                  ? 'bg-white/[0.07] text-textPrimary font-semibold'
                  : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.03]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Single Ticker follows the page-level ticker search in the header */}
        {tab === 'leaders' && (
          <span className="ml-auto font-mono text-[11px] text-textSecondary uppercase tracking-wider tnum">
            {fmtUsd(leaders.totalNotional)} dark · {fmtNum(leaders.totalPrints)} prints · updated {leaders.updated}
          </span>
        )}
      </div>

      {tab === 'leaders' ? (
        <div key="leaders" className="animate-soft-in">
          <LeadersView leaders={leaders} onOpenTicker={openTicker} />
        </div>
      ) : (
        <div key="ticker" className="animate-soft-in flex flex-col gap-4">
          {/* Session posture at a glance */}
          <MetricGrid min="170px">
            <StatCard
              label="Off-exchange share"
              value={`${view.dpSharePct.toFixed(1)}%`}
              sub="of today's volume printed dark"
            />
            <StatCard
              label="Net posture"
              value={
                <span className="inline-flex items-center gap-2">
                  <PostureIcon className="w-4 h-4" />
                  {view.posture}
                </span>
              }
              sub={`${view.netPosturePct >= 0 ? '+' : ''}${view.netPosturePct.toFixed(0)} conviction-weighted skew`}
              tone={postureTone}
            />
            <StatCard label="DP notional" value={fmtUsd(view.totalNotional)} sub={`${view.prints.length} sized prints tracked`} />
            <StatCard
              label="Largest print"
              value={view.largest ? fmtUsd(view.largest.notional) : '--'}
              sub={view.largest ? `$${view.largest.price.toFixed(2)} · ${view.largest.venue}` : ''}
            />
            <StatCard
              label="Nearest shelves"
              value={
                <span className="text-sm">
                  {nextDown ? `$${nextDown.price.toFixed(2)}` : '--'} / {nextUp ? `$${nextUp.price.toFixed(2)}` : '--'}
                </span>
              }
              sub="support below / supply above"
            />
          </MetricGrid>

          <Panel bodyClassName="py-3">
            <p className="text-[13px] text-textPrimary leading-relaxed">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider mr-2 text-textSecondary">The read</span>
              <RichRead text={view.postureNote} />
            </p>
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
            {/* Shelf ladder */}
            <Panel
              title="Liquidity shelves"
              subtitle="where dark volume concentrates"
              flush
              className="lg:col-span-3"
            >
              <div className="flex flex-col">
                {view.levels.map((level, i) => {
                  const spotBetween =
                    i < view.levels.length - 1 && view.spot <= level.price && view.spot > view.levels[i + 1].price;
                  const isSelected = level.price === selected.price;
                  return (
                    <div key={level.price}>
                      <button
                        onClick={() => setSelectedPrice(level.price)}
                        className={`w-full text-left px-4 py-2.5 grid grid-cols-[88px_104px_1fr_72px_64px] items-center gap-3 transition-colors ${
                          isSelected ? 'bg-select/[0.05] shadow-[inset_2px_0_0_0_rgba(228,232,244,0.7)]' : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        <span className="font-mono text-sm font-semibold text-textPrimary tnum">${level.price.toFixed(2)}</span>
                        <RoleTag role={level.role} />
                        <span className="min-w-0">
                          <ShelfBar level={level} max={maxNotional} />
                          <span className="mt-1 block font-mono text-[11px] text-textSecondary tnum">
                            {fmtUsd(level.notional)} · {level.prints} prints · {level.sharePct.toFixed(0)}% of DP
                          </span>
                        </span>
                        <span className={`font-mono text-xs tnum text-right ${level.distPct >= 0 ? 'text-bull' : 'text-bear'}`}>
                          {level.distPct >= 0 ? '+' : ''}
                          {level.distPct.toFixed(2)}%
                        </span>
                        <span className="font-mono text-[11px] text-textSecondary text-right">
                          {level.defended > 0 ? `held ${level.defended}×` : '—'}
                        </span>
                      </button>
                      {spotBetween && (
                        <div className="px-4 py-1">
                          <SpotRule ticker={view.ticker} price={view.spot} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>

            {/* Usage — what to actually do with the selected shelf */}
            <Panel title="How to use it" subtitle={`$${selected.price.toFixed(2)} shelf`} className="lg:col-span-2">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2.5">
                  <RoleTag role={selected.role} />
                  <span className="font-mono text-[11px] uppercase tracking-wider text-textSecondary">
                    {selected.sharePct.toFixed(0)}% of session DP · {selected.defended > 0 ? `defended ${selected.defended}×` : 'untested'}
                  </span>
                </div>
                <p className="text-[13px] text-textPrimary leading-relaxed">
                  <RichRead text={selected.usage} />
                </p>
                <div className="border-t border-borderSubtle pt-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="text-textMuted uppercase tracking-wider text-[10px]">Above the shelf</span>
                    <span className="text-bull">
                      {selected.role === 'RESISTANCE' ? 'breakout confirms — supply cleared' : 'bias long against it'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="text-textMuted uppercase tracking-wider text-[10px]">Below the shelf</span>
                    <span className="text-bear">
                      {selected.role === 'SUPPORT' ? 'read invalid — step aside' : 'supply in control'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="text-textMuted uppercase tracking-wider text-[10px]">Next shelf</span>
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
          </div>

          {/* Classified prints */}
          <Panel title="Sized prints" subtitle="classified — not just the tape line" flush>
            {activePrint && (
              <div className="px-4 py-2.5 border-b border-borderSubtle bg-inset flex items-start gap-3 animate-soft-in">
                <IntentTag intent={activePrint.intent} />
                <p className="text-[13px] text-textPrimary leading-relaxed">
                  <RichRead text={activePrint.read} />
                </p>
              </div>
            )}
            <DataTable
              columns={columns}
              rows={view.prints}
              rowKey={p => String(p.id)}
              onRowClick={p => setSelectedPrint(prev => (prev === p.id ? null : p.id))}
              selectedKey={activePrint ? String(activePrint.id) : null}
              initialSort={{ key: 'notional', dir: 'desc' }}
              maxHeight="420px"
            />
          </Panel>
        </div>
      )}
    </>
  );
};

export default DarkPool;
