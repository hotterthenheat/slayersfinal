import { useMemo, useState } from 'react';
import { Gauge, Newspaper, Sparkles } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import StatRibbon from '../components/ui/StatRibbon';
import TickerJump from '../components/ui/TickerJump';
import Panel from '../components/ui/Panel';
import StatCard from '../components/ui/StatCard';
import MetricGrid from '../components/ui/MetricGrid';
import SignalBadge from '../components/ui/SignalBadge';
import SegmentedControl from '../components/ui/SegmentedControl';
import { buildNewsFeed, marketMood, type NewsCategory, type NewsItem } from '../data/news';
import type { Tone } from '../components/ui/tones';

type CatFilter = 'ALL' | NewsCategory;

const CAT_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'Earnings', label: 'Earnings' },
  { value: 'Guidance', label: 'Guidance' },
  { value: 'Analyst', label: 'Analyst' },
  { value: 'Macro', label: 'Macro' },
] as const;

const sentimentTone = (s: number): Tone => (s > 0.12 ? 'bull' : s < -0.12 ? 'bear' : 'neutral');

const catTone: Record<NewsCategory, Tone> = {
  Earnings: 'magenta',
  Guidance: 'warn',
  Analyst: 'select',
  Macro: 'neutral',
  'M&A': 'magenta',
  Product: 'select',
  Regulatory: 'warn',
};

/** Odds meter — the model's directional lean rendered as a two-sided bar. */
const OddsBar = ({ probUp }: { probUp: number }) => (
  <div>
    <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-textMuted">
      <span>Down {100 - probUp}%</span>
      <span>Up {probUp}%</span>
    </div>
    <div className="mt-1.5 flex h-1.5 rounded-full overflow-hidden bg-white/[0.06]">
      <span className="h-full bg-bear/80" style={{ width: `${100 - probUp}%` }} />
      <span className="h-full holo-bar" style={{ width: `${probUp}%` }} />
    </div>
  </div>
);

const News = () => {
  const feed = useMemo(() => buildNewsFeed(), []);
  const mood = useMemo(() => marketMood(), []);
  const [filter, setFilter] = useState<CatFilter>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(
    () => (filter === 'ALL' ? feed : feed.filter(n => n.category === filter)),
    [feed, filter]
  );
  const selected: NewsItem = rows.find(n => n.id === selectedId) ?? rows[0] ?? feed[0];

  const moodTone: Tone = mood.label === 'RISK-ON' ? 'bull' : mood.label === 'RISK-OFF' ? 'bear' : 'neutral';
  const movers = [...feed]
    .filter(n => n.ticker)
    .sort((a, b) => Math.abs(b.prediction.expMove1dPct) - Math.abs(a.prediction.expMove1dPct))
    .slice(0, 3);
  const bullN = feed.filter(n => n.sentiment > 0.12).length;
  const bearN = feed.filter(n => n.sentiment < -0.12).length;
  const macroN = feed.filter(n => !n.ticker).length;

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'News']}
        title="News"
        subtitle="The wire on the left — what the model thinks it does to price on the right"
        ribbon={
          <StatRibbon
            stats={[
              { label: 'Bullish', value: String(bullN), tone: 'bull' },
              { label: 'Bearish', value: String(bearN), tone: 'bear' },
              { label: 'Macro', value: String(macroN), tone: 'select' },
              { label: 'Top mover', value: movers[0] ? `${movers[0].ticker} ${movers[0].prediction.expMove1dPct >= 0 ? '+' : ''}${movers[0].prediction.expMove1dPct.toFixed(1)}%` : '--', tone: movers[0] && movers[0].sentiment >= 0 ? 'bull' : 'bear' },
            ]}
          />
        }
        actions={<SegmentedControl ariaLabel="Category filter" options={CAT_OPTIONS} value={filter} onChange={setFilter} />}
      />

      <MetricGrid min="180px">
        <StatCard
          label="Tape mood"
          value={
            <span className="inline-flex items-center gap-2">
              <Gauge className="w-4 h-4" />
              {mood.label}
            </span>
          }
          sub={`${(mood.score * 100).toFixed(0)} headline-weighted lean`}
          tone={moodTone}
        />
        <StatCard label="Headlines tracked" value={feed.length} sub="this session, model-scored" />
        {movers.map(m => (
          <StatCard
            key={m.id}
            label={`Top catalyst · ${m.ticker}`}
            value={`${m.prediction.expMove1dPct >= 0 ? '+' : ''}${m.prediction.expMove1dPct.toFixed(1)}%`}
            sub={m.category}
            tone={sentimentTone(m.sentiment)}
          />
        ))}
      </MetricGrid>

      <Panel tone={moodTone} bodyClassName="py-3">
        <p className="text-xs text-textSecondary leading-relaxed">
          <span className={`font-mono font-semibold uppercase tracking-wider mr-2 ${moodTone === 'bull' ? 'text-bull' : moodTone === 'bear' ? 'text-bear' : 'text-textPrimary'}`}>
            The read
          </span>
          {mood.note}
        </p>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        {/* The wire */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Newspaper className="w-3.5 h-3.5" /> The wire
            </span>
          }
          subtitle={`${rows.length} headlines`}
          flush
          className="lg:col-span-3"
        >
          <div className="flex flex-col max-h-[560px] overflow-auto">
            {rows.map(n => {
              const isSel = n.id === selected?.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setSelectedId(n.id)}
                  className={`text-left px-4 py-3 border-b border-borderSubtle last:border-b-0 transition-colors ${
                    isSel ? 'bg-select/[0.05] shadow-[inset_2px_0_0_0_rgba(228,232,244,0.7)]' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px] text-textMuted tnum">{n.time}</span>
                    <span className="font-mono text-[10px] text-textMuted">{n.source}</span>
                    {n.ticker ? (
                      <span className="font-mono text-[11px] font-bold text-textPrimary">{n.ticker}</span>
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-flip">Macro</span>
                    )}
                    <SignalBadge tone={catTone[n.category]}>{n.category}</SignalBadge>
                    <span
                      className={`ml-auto font-mono text-[11px] font-semibold tnum ${
                        n.prediction.expMove1dPct >= 0 ? 'text-bull' : 'text-bear'
                      }`}
                    >
                      {n.prediction.expMove1dPct >= 0 ? '+' : ''}
                      {n.prediction.expMove1dPct.toFixed(1)}% exp
                    </span>
                  </div>
                  <p className="mt-1.5 text-[13px] text-textPrimary leading-snug">{n.headline}</p>
                </button>
              );
            })}
          </div>
        </Panel>

        {/* Predictive read of the selected headline */}
        {selected && (
          <Panel
            title={
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Predicted outcome
              </span>
            }
            subtitle={selected.ticker ?? 'index-level'}
            tone={sentimentTone(selected.sentiment)}
            className="lg:col-span-2 lg:sticky lg:top-4"
          >
            <div className="flex flex-col gap-4">
              <p className="text-[13px] text-textPrimary leading-snug">{selected.headline}</p>

              {selected.ticker && <TickerJump ticker={selected.ticker} />}

              <OddsBar probUp={selected.prediction.probUpPct} />

              <div className="grid grid-cols-3 gap-2">
                <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">1-day exp</div>
                  <div
                    className={`mt-1 font-mono text-sm font-semibold tnum ${
                      selected.prediction.expMove1dPct >= 0 ? 'text-bull' : 'text-bear'
                    }`}
                  >
                    {selected.prediction.expMove1dPct >= 0 ? '+' : ''}
                    {selected.prediction.expMove1dPct.toFixed(1)}%
                  </div>
                </div>
                <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">5-day exp</div>
                  <div
                    className={`mt-1 font-mono text-sm font-semibold tnum ${
                      selected.prediction.expMove5dPct >= 0 ? 'text-bull' : 'text-bear'
                    }`}
                  >
                    {selected.prediction.expMove5dPct >= 0 ? '+' : ''}
                    {selected.prediction.expMove5dPct.toFixed(1)}%
                  </div>
                </div>
                <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Confidence</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-textPrimary tnum">
                    {selected.prediction.confidencePct}%
                  </div>
                </div>
              </div>

              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Historical analog</div>
                <p className="mt-1.5 text-xs text-textSecondary leading-relaxed">{selected.prediction.analog}</p>
              </div>

              <div className="border-t border-borderSubtle pt-3">
                <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Playbook</div>
                <p className="mt-1.5 text-xs text-textSecondary leading-relaxed">{selected.prediction.playbook}</p>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </>
  );
};

export default News;
