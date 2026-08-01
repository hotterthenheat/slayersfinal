import { useMemo, useState } from 'react';
import { ShieldCheck, ArrowDownToLine, ArrowUpFromLine, Scale } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildDarkPoolView } from '../../data/darkpool';
import { buildDarkPoolFeed } from '../../data/darkpoolfeed';
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

  // Universe scan read. buildDarkPoolFeed already returns its sectors ordered by
  // notional, so the leader is index 0 rather than a second ranking of its output.
  const universe = useMemo(() => {
    const sectors = buildDarkPoolFeed();
    if (!sectors.length) return null;
    const total = sectors.reduce((a, s) => a + s.notional, 0);
    return {
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

  // The tally behind the posture. It is the classifier's own output counted, which
  // is what makes the verdict above it checkable instead of asserted.
  const tally = view.prints.reduce<Record<DarkPoolIntent, number>>(
    (a, p) => {
      a[p.intent] += 1;
      return a;
    },
    { ACCUMULATION: 0, DISTRIBUTION: 0, 'HEDGE FLOW': 0, ROTATION: 0 }
  );

  const columns: Column<DarkPoolPrint>[] = [
    { key: 'time', header: 'Time', width: '64px', render: p => <span className="font-mono text-caption text-textSecondary tnum leading-4">{p.time}</span> },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      sortValue: p => p.price,
      render: p => <span className="font-mono text-caption text-textPrimary tnum leading-4">${p.price.toFixed(2)}</span>,
    },
    {
      key: 'vs',
      header: 'vs Spot',
      align: 'right',
      sortValue: p => p.vsSpotPct,
      render: p => (
        <span className={`font-mono text-caption tnum ${p.vsSpotPct >= 0 ? 'text-bull' : 'text-bear'} leading-4`}>
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
      render: p => <span className="font-mono text-caption text-textSecondary tnum leading-4">{p.size.toLocaleString()}</span>,
    },
    {
      key: 'notional',
      header: 'Notional',
      align: 'right',
      sortValue: p => p.notional,
      render: p => <span className="font-mono text-caption font-semibold text-textPrimary tnum leading-4">{fmtUsd(p.notional)}</span>,
    },
    {
      key: 'venue',
      header: 'Venue',
      help: 'ATS',
      render: p => <span className="font-mono text-caption text-textMuted leading-4">{p.venue}</span>,
    },
    {
      key: 'intent',
      header: 'Inferred read',
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
      key: 'conv',
      header: 'Conf',
      align: 'right',
      sortValue: p => p.conviction,
      render: p => (
        <span className={`font-mono text-caption tnum ${p.conviction < 55 ? 'text-warn' : 'text-textSecondary'} leading-4`}>
          {p.conviction}%
        </span>
      ),
    },
  ];

  return (
    <>
      {/* The answer first. This tab used to open on a market-wide numeric matrix
          with no sentence in it, three screens above the one line that said what
          any of it meant. The ticker read leads now; the universe scan is the
          appendix at the bottom. */}
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
              Of {view.prints.length} sized prints:{' '}
              <span className="text-bull">{tally.ACCUMULATION} accumulation</span>,{' '}
              <span className="text-bear">{tally.DISTRIBUTION} distribution</span>,{' '}
              <span className="text-warn">{tally['HEDGE FLOW']} hedge</span>,{' '}
              <span className="text-textSecondary">{tally.ROTATION} rotation</span>
            </span>
            <span className="text-label leading-relaxed text-textMuted">
              The skew above weights each block&rsquo;s notional by the classifier&rsquo;s own confidence in it, so one
              large low-confidence cross cannot carry the verdict on its own.
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

      <MetricGrid min="170px">
        <StatCard
          label="Off-exchange share"
          value={`${view.dpSharePct.toFixed(1)}%`}
          sub="of today's volume printed away from the lit book"
        />
        <StatCard label="Block notional" value={fmtUsd(view.totalNotional)} sub={`${view.prints.length} sized prints classified`} />
        <StatCard
          label="Largest block"
          value={view.largest ? fmtUsd(view.largest.notional) : '--'}
          sub={view.largest ? `crossed at $${view.largest.price.toFixed(2)} on ${view.largest.venue}` : ''}
          tone={view.largest ? intentTone[view.largest.intent] : 'neutral'}
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        {/* Shelf ladder */}
        <Panel
          title="Liquidity shelves"
          subtitle="prices the blocks keep crossing at"
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
                    aria-pressed={isSelected}
                    aria-label={`Shelf at $${level.price.toFixed(2)}, ${level.role.toLowerCase()}`}
                    className={`w-full text-left px-4 py-2.5 grid grid-cols-[88px_92px_1fr_72px_64px] items-center gap-3 transition-colors ${
                      isSelected ? 'bg-select/[0.05] rail-select' : 'hover:bg-rowHover'
                    }`}
                  >
                    <span className="font-mono text-body font-semibold text-textPrimary tnum leading-5">${level.price.toFixed(2)}</span>
                    <SignalBadge tone={roleTone[level.role]}>{level.role}</SignalBadge>
                    <span className="min-w-0">
                      <ShelfBar level={level} max={maxNotional} />
                      <span className="mt-1 block font-mono text-micro text-textMuted tnum">
                        {fmtUsd(level.notional)} · {level.prints} prints · {level.sharePct.toFixed(0)}% of the session
                      </span>
                    </span>
                    <span
                      className={`font-mono text-caption tnum text-right leading-4 ${
                        // A shelf sitting on spot rounds to zero; signing it there
                        // printed "-0.00%", which reads as a rendering fault.
                        Math.abs(level.distPct) < 0.005 ? 'text-textMuted' : level.distPct > 0 ? 'text-bull' : 'text-bear'
                      }`}
                    >
                      {Math.abs(level.distPct) < 0.005
                        ? 'at spot'
                        : `${level.distPct > 0 ? '+' : ''}${level.distPct.toFixed(2)}%`}
                    </span>
                    <span className="font-mono text-label text-textMuted text-right">
                      {level.defended > 0 ? (level.defended >= 5 ? '5+ held' : `${level.defended}× held`) : 'untested'}
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
            <div className="border-t border-borderSubtle pt-3 flex flex-col gap-2">
              <div className="flex items-center justify-between font-mono text-caption leading-4">
                <span className="text-textMuted uppercase tracking-wider text-micro">Above the shelf</span>
                <span className="text-bull">
                  {selected.role === 'RESISTANCE' ? 'breakout confirms, supply cleared' : 'bias long against it'}
                </span>
              </div>
              <div className="flex items-center justify-between font-mono text-caption leading-4">
                <span className="text-textMuted uppercase tracking-wider text-micro">Below the shelf</span>
                <span className="text-bear">
                  {selected.role === 'SUPPORT' ? 'read invalid, step aside' : 'supply in control'}
                </span>
              </div>
              <div className="flex items-center justify-between font-mono text-caption leading-4">
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
      <Panel title="Sized prints" subtitle="inferred classification, a read and not a confirmed fact" flush>
        <p className="px-4 py-3 border-b border-borderSubtle text-caption leading-relaxed text-textMuted">
          One row is one block that crossed off-exchange. <span className="text-textSecondary">vs Spot</span> is where
          it printed against the current price, which is the whole tell: size under the market reads as building, size
          over it reads as leaving. <span className="text-textSecondary">Conf</span> is how hard the classifier
          committed to that read. Open a row for the reasoning behind it and the story that fits it just as well.
        </p>
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
        <DataTable
          columns={columns}
          rows={view.prints}
          rowKey={p => String(p.id)}
          onRowClick={p => setSelectedPrint(prev => (prev === p.id ? null : p.id))}
          selectedKey={activePrint ? String(activePrint.id) : null}
          initialSort={{ key: 'notional', dir: 'desc' }}
          maxHeight="max(420px, 48vh)"
        />
      </Panel>

      {/* Appendix: the same question asked of the whole tracked list. It answers
          "where else is the size going", which is a different question to the one
          the panels above answer, so it is labelled as such and sits last. */}
      {universe && (
        <p className="text-caption leading-relaxed text-textMuted">
          <span className="font-mono font-semibold uppercase tracking-wider text-textSecondary mr-2">Universe scan</span>
          {universe.names} tracked names crossed {fmtUsd(universe.total)} off-exchange across {universe.sectors} sectors
          this session. {universe.lead.sector} leads on {fmtUsd(universe.lead.notional)}, {universe.sharePct.toFixed(0)}%
          of the scanned total. None of it is tied to {view.ticker}: it is the session&rsquo;s shape across the list, not
          a running count, and it is here to answer where else the size went.
        </p>
      )}
      <DarkPoolFeed />
    </>
  );
};

export default DarkPool;
