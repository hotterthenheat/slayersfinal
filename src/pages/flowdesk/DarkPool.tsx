import { useMemo, useState } from 'react';
import { ShieldCheck, ArrowDownToLine, ArrowUpFromLine, Scale } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildDarkPoolView } from '../../data/darkpool';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import SignalBadge from '../../components/ui/SignalBadge';
import DataTable, { type Column } from '../../components/ui/DataTable';
import DarkPoolFeed from '../../components/flowdesk/DarkPoolFeed';
import SpotRule from '../../components/ui/SpotRule';
import type { DarkPoolIntent, DarkPoolLevel, DarkPoolPrint } from '../../types/darkpool';
import type { Tone } from '../../components/ui/tones';

const intentTone: Record<DarkPoolIntent, Tone> = {
  ACCUMULATION: 'bull',
  DISTRIBUTION: 'bear',
  'HEDGE FLOW': 'warn',
  ROTATION: 'neutral',
};

const roleTone: Record<DarkPoolLevel['role'], Tone> = {
  SUPPORT: 'bull',
  RESISTANCE: 'bear',
  PIVOT: 'neutral',
};

/** Notional meter for a shelf — support reads green, supply reads red. */
const ShelfBar = ({ level, max }: { level: DarkPoolLevel; max: number }) => (
  <span className="flex w-full h-[5px] rounded-full overflow-hidden bg-white/[0.05]">
    <span
      className={`h-full rounded-full ${
        level.role === 'SUPPORT' ? 'bg-bull/80' : level.role === 'RESISTANCE' ? 'bg-bear/80' : 'bg-white/25'
      }`}
      style={{ width: `${Math.max(6, (level.notional / max) * 100)}%` }}
    />
  </span>
);

/**
 * Confidence tier — a plain-language bucket over the classifier's OWN conviction
 * value. It relabels an existing number, it never fabricates one. Low reads amber
 * (caution), the rest stay neutral so confidence never masquerades as bullishness.
 */
const confidenceTier = (conviction: number): { label: string; tone: Tone } =>
  conviction >= 75
    ? { label: 'High', tone: 'neutral' }
    : conviction >= 55
      ? { label: 'Moderate', tone: 'neutral' }
      : { label: 'Low', tone: 'warn' };

/** The honest alternative to each inferred read — same tape, a different story. */
const competingRead: Record<DarkPoolIntent, string> = {
  ACCUMULATION: 'Could equally be short-covering or a hedge being unwound rather than fresh conviction buying.',
  DISTRIBUTION: 'Could equally be routine profit-taking or a hedge being layered on, not a directional exit.',
  'HEDGE FLOW': 'Could turn directional if a desk is expressing a view through the shelf, not purely hedging.',
  ROTATION: 'Could be the opening leg of an accumulation or distribution program that has yet to cluster.',
};

/** Confidence chip — surfaces the classifier's conviction as a tier plus the raw %. */
const ConfidenceChip = ({ conviction }: { conviction: number }) => {
  const { label, tone } = confidenceTier(conviction);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-label uppercase tracking-wider text-textMuted">Confidence</span>
      <SignalBadge tone={tone}>
        {label} · {conviction}%
      </SignalBadge>
    </span>
  );
};

const DarkPool = () => {
  const { marketData } = useMarketData();
  const view = useMemo(() => (marketData ? buildDarkPoolView(marketData) : null), [marketData]);
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  const [selectedPrint, setSelectedPrint] = useState<number | null>(null);

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
  // Which tracked shelf did the selected print land on? Nearest by price — used to
  // surface that shelf's retest count as evidence behind the inferred read.
  const activePrintShelf =
    activePrint && activePrint.atLevel && view.levels.length
      ? view.levels.reduce((best, l) =>
          Math.abs(l.price - activePrint.price) < Math.abs(best.price - activePrint.price) ? l : best
        )
      : null;

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
      render: p => <span className="font-mono text-xs text-textSecondary tnum">{p.size.toLocaleString()}</span>,
    },
    {
      key: 'notional',
      header: 'Notional',
      align: 'right',
      sortValue: p => p.notional,
      render: p => <span className="font-mono text-xs font-semibold text-textPrimary tnum">{fmtUsd(p.notional)}</span>,
    },
    { key: 'venue', header: 'Venue', render: p => <span className="font-mono text-xs text-textMuted">{p.venue}</span> },
    {
      key: 'intent',
      header: 'Inferred read',
      sortValue: p => p.intent,
      render: p => (
        <span className="inline-flex items-center gap-2">
          <SignalBadge tone={intentTone[p.intent]}>{p.intent}</SignalBadge>
          {p.atLevel && <ShieldCheck className="w-3.5 h-3.5 text-flip" aria-label="printed on a tracked shelf" />}
        </span>
      ),
    },
    {
      key: 'conv',
      header: 'Conf',
      align: 'right',
      sortValue: p => p.conviction,
      render: p => (
        <span className={`font-mono text-xs tnum ${p.conviction < 55 ? 'text-warn' : 'text-textSecondary'}`}>
          {p.conviction}%
        </span>
      ),
    },
  ];

  return (
    <>
      {/* Market-wide off-exchange flow first — scan the sectors, then drill the active name */}
      <DarkPoolFeed />

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
          sub={`inferred · ${view.netPosturePct >= 0 ? '+' : ''}${view.netPosturePct.toFixed(0)} conviction-weighted skew`}
          tone={postureTone}
        />
        <StatCard label="DP notional" value={fmtUsd(view.totalNotional)} sub={`${view.prints.length} sized prints tracked`} />
        <StatCard
          label="Largest print"
          value={view.largest ? fmtUsd(view.largest.notional) : '--'}
          sub={view.largest ? `$${view.largest.price.toFixed(2)} · ${view.largest.venue}` : ''}
          tone={view.largest ? intentTone[view.largest.intent] : 'neutral'}
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

      <Panel tone={postureTone} bodyClassName="py-3">
        <p className="text-xs text-textSecondary leading-relaxed">
          <span className={`font-mono font-semibold uppercase tracking-wider mr-2 ${postureTone === 'bull' ? 'text-bull' : postureTone === 'bear' ? 'text-bear' : 'text-textPrimary'}`}>
            Inferred read
          </span>
          {view.postureNote}
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
                    className={`w-full text-left px-4 py-2.5 grid grid-cols-[88px_92px_1fr_72px_64px] items-center gap-3 transition-colors ${
                      isSelected ? 'bg-select/[0.05] shadow-[inset_2px_0_0_0_rgba(228,232,244,0.7)]' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <span className="font-mono text-sm font-semibold text-textPrimary tnum">${level.price.toFixed(2)}</span>
                    <SignalBadge tone={roleTone[level.role]}>{level.role}</SignalBadge>
                    <span className="min-w-0">
                      <ShelfBar level={level} max={maxNotional} />
                      <span className="mt-1 block font-mono text-micro text-textMuted tnum">
                        {fmtUsd(level.notional)} · {level.prints} prints · {level.sharePct.toFixed(0)}% of DP
                      </span>
                    </span>
                    <span className={`font-mono text-xs tnum text-right ${level.distPct >= 0 ? 'text-bull' : 'text-bear'}`}>
                      {level.distPct >= 0 ? '+' : ''}
                      {level.distPct.toFixed(2)}%
                    </span>
                    <span className="font-mono text-label text-textMuted text-right">
                      {level.defended > 0 ? `${level.defended}× held` : '—'}
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
        <Panel
          title="How to use it"
          subtitle={`$${selected.price.toFixed(2)} shelf`}
          tone={roleTone[selected.role]}
          className="lg:col-span-2"
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <SignalBadge tone={roleTone[selected.role]} dot>
                {selected.role}
              </SignalBadge>
              <span className="font-mono text-label uppercase tracking-wider text-textMuted">
                {selected.sharePct.toFixed(0)}% of session DP · {selected.defended > 0 ? `${selected.defended} retest${selected.defended > 1 ? 's' : ''} held` : 'untested'}
              </span>
            </div>
            <p className="text-xs text-textSecondary leading-relaxed">{selected.usage}</p>
            <div className="border-t border-borderSubtle pt-3 flex flex-col gap-2">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-textMuted uppercase tracking-wider text-micro">Above the shelf</span>
                <span className="text-bull">
                  {selected.role === 'RESISTANCE' ? 'breakout confirms — supply cleared' : 'bias long against it'}
                </span>
              </div>
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-textMuted uppercase tracking-wider text-micro">Below the shelf</span>
                <span className="text-bear">
                  {selected.role === 'SUPPORT' ? 'read invalid — step aside' : 'supply in control'}
                </span>
              </div>
              <div className="flex items-center justify-between font-mono text-xs">
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
      </div>

      {/* Classified prints */}
      <Panel title="Sized prints" subtitle="inferred classification — a read, not a confirmed fact" flush>
        {activePrint && (
          <div className="px-4 py-3 border-b border-borderSubtle bg-inset flex flex-col gap-2.5 animate-soft-in">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-label uppercase tracking-wider text-textMuted">Inferred as</span>
              <SignalBadge tone={intentTone[activePrint.intent]}>{activePrint.intent}</SignalBadge>
              <ConfidenceChip conviction={activePrint.conviction} />
              {activePrintShelf && (
                <span className="inline-flex items-center gap-1 font-mono text-label uppercase tracking-wider text-flip">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {activePrintShelf.defended > 0
                    ? `shelf held ${activePrintShelf.defended}× on retest`
                    : 'on an untested shelf'}
                </span>
              )}
            </div>
            <p className="text-xs text-textSecondary leading-relaxed">{activePrint.read}</p>
            <div className="flex items-start gap-2 border-t border-borderSubtle pt-2.5">
              <span className="font-mono text-label uppercase tracking-wider text-textMuted whitespace-nowrap mt-px">
                Competing read
              </span>
              <p className="text-label text-textMuted leading-relaxed">{competingRead[activePrint.intent]}</p>
            </div>
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
    </>
  );
};

export default DarkPool;
