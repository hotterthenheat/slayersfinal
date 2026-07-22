import React, { useMemo, useState } from 'react';
import { Gauge, Newspaper, Sparkles, Star, BellOff, Eye, EyeOff, ChevronDown, ChevronRight, Clock, Link2 } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import TickerJump from '../components/ui/TickerJump';
import Panel from '../components/ui/Panel';
import StatCard from '../components/ui/StatCard';
import MetricGrid from '../components/ui/MetricGrid';
import SignalBadge from '../components/ui/SignalBadge';
import SegmentedControl from '../components/ui/SegmentedControl';
import { buildNewsFeed, marketMood, type NewsCategory, type NewsItem } from '../data/news';
import NewsIntel from '../components/news/NewsIntel';
import type { Tone } from '../components/ui/tones';

type CatFilter = 'ALL' | NewsCategory;
type Grouping = 'cluster' | 'flat';
type RightTab = 'outcome' | 'intel';

const CAT_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'Earnings', label: 'Earnings' },
  { value: 'Guidance', label: 'Guidance' },
  { value: 'Analyst', label: 'Analyst' },
  { value: 'Macro', label: 'Macro' },
] as const;

const GROUP_OPTIONS = [
  { value: 'cluster', label: 'Cluster' },
  { value: 'flat', label: 'Flat' },
] as const;

const RIGHT_OPTIONS = [
  { value: 'outcome', label: 'Outcome' },
  { value: 'intel', label: 'Deep read' },
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

const signedPct = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
const subjectOf = (n: NewsItem): string => n.ticker ?? 'MACRO';

/** One deduped wire story: a lead headline plus any near-identical prints. */
interface WireUnit {
  key: string;
  subject: string;
  lead: NewsItem;
  /** Members, newest first. */
  items: NewsItem[];
  firstSeen: NewsItem;
  lastUpdated: NewsItem;
  sources: string[];
}

/** Odds meter — the model's directional lean rendered as a two-sided bar. */
const OddsBar = ({ probUp }: { probUp: number }) => (
  <div>
    <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-textMuted">
      <span>Down {100 - probUp}%</span>
      <span>Up {probUp}%</span>
    </div>
    <div className="mt-1.5 flex h-1.5 rounded-full overflow-hidden bg-white/[0.06]">
      <span className="h-full bg-bear/80" style={{ width: `${100 - probUp}%` }} />
      <span className="h-full bg-bull/80" style={{ width: `${probUp}%` }} />
    </div>
  </div>
);

/** Small square icon toggle for the per-story watch / mute controls. */
const IconToggle = ({
  active,
  activeClass,
  title,
  onClick,
  children,
}: {
  active: boolean;
  activeClass: string;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-pressed={active}
    className={`inline-flex items-center justify-center w-6 h-6 rounded border transition-colors ${
      active ? activeClass : 'border-borderSubtle text-textMuted/60 hover:text-textPrimary hover:border-borderMuted'
    }`}
  >
    {children}
  </button>
);

const News = () => {
  const feed = useMemo(() => buildNewsFeed(), []);
  const mood = useMemo(() => marketMood(), []);
  const [filter, setFilter] = useState<CatFilter>('ALL');
  const [grouping, setGrouping] = useState<Grouping>('cluster');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>('outcome');
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [hideMuted, setHideMuted] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) =>
    setter(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const rows = useMemo(() => (filter === 'ALL' ? feed : feed.filter(n => n.category === filter)), [feed, filter]);

  // Cluster / dedupe: same name + catalyst type collapses into one story; macro
  // dedupes on identical text. "Flat" keeps every print as its own unit.
  const units = useMemo<WireUnit[]>(() => {
    const groups = new Map<string, NewsItem[]>();
    for (const n of rows) {
      const key = grouping === 'flat' ? n.id : n.ticker ? `${n.ticker}|${n.category}` : `macro|${n.headline}`;
      const arr = groups.get(key);
      if (arr) arr.push(n);
      else groups.set(key, [n]);
    }

    const list: WireUnit[] = [];
    for (const [key, items] of groups) {
      const byRecent = [...items].sort((a, b) => a.minutesAgo - b.minutesAgo);
      const lead = [...items].sort((a, b) => b.magnitude - a.magnitude)[0];
      const sources: string[] = [];
      for (const it of byRecent) if (!sources.includes(it.source)) sources.push(it.source);
      list.push({
        key,
        subject: subjectOf(lead),
        lead,
        items: byRecent,
        lastUpdated: byRecent[0],
        firstSeen: byRecent[byRecent.length - 1],
        sources,
      });
    }

    // Watched stories float up, muted sink; recency breaks ties.
    const rank = (u: WireUnit) => (watched.has(u.subject) ? 0 : muted.has(u.subject) ? 2 : 1);
    let ordered = list.sort((a, b) => rank(a) - rank(b) || a.lastUpdated.minutesAgo - b.lastUpdated.minutesAgo);
    if (hideMuted) ordered = ordered.filter(u => !muted.has(u.subject));
    return ordered;
  }, [rows, grouping, watched, muted, hideMuted]);

  const selected: NewsItem = rows.find(n => n.id === selectedId) ?? units[0]?.lead ?? feed[0];

  const moodTone: Tone = mood.label === 'RISK-ON' ? 'bull' : mood.label === 'RISK-OFF' ? 'bear' : 'neutral';
  const movers = [...feed]
    .filter(n => n.ticker)
    .sort((a, b) => Math.abs(b.prediction.expMove1dPct) - Math.abs(a.prediction.expMove1dPct))
    .slice(0, 3);

  const hasFilters = watched.size > 0 || muted.size > 0;

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'News']}
        title="News"
        subtitle="The wire on the left — what the model thinks it does to price on the right"
        actions={<SegmentedControl ariaLabel="Category filter" options={CAT_OPTIONS} value={filter} onChange={setFilter} />}
      />

      <MetricGrid min="170px">
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
            value={signedPct(m.prediction.expMove1dPct)}
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
          subtitle={grouping === 'cluster' ? `${units.length} stories · ${rows.length} on the wire` : `${rows.length} headlines`}
          flush
          className="lg:col-span-3"
          actions={<SegmentedControl ariaLabel="Wire grouping" options={GROUP_OPTIONS} value={grouping} onChange={setGrouping} />}
        >
          {hasFilters && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-borderSubtle bg-white/[0.02] flex-wrap">
              {watched.size > 0 && (
                <SignalBadge tone="select" dot>
                  {watched.size} watched
                </SignalBadge>
              )}
              {muted.size > 0 && <span className="font-mono text-[11px] uppercase tracking-wider text-textMuted">{muted.size} muted</span>}
              <div className="ml-auto flex items-center gap-2">
                {muted.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setHideMuted(v => !v)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded border font-mono text-[11px] uppercase tracking-wider transition-colors ${
                      hideMuted ? 'border-select/40 text-textPrimary bg-white/[0.05]' : 'border-borderSubtle text-textSecondary hover:text-textPrimary hover:border-borderMuted'
                    }`}
                  >
                    {hideMuted ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {hideMuted ? 'Muted hidden' : 'Hide muted'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setWatched(new Set());
                    setMuted(new Set());
                    setHideMuted(false);
                  }}
                  className="font-mono text-[11px] uppercase tracking-wider text-textMuted hover:text-textPrimary transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col max-h-[560px] overflow-auto">
            {units.map(unit => {
              const lead = unit.lead;
              const isMuted = muted.has(unit.subject);
              const isWatched = watched.has(unit.subject);
              const isSel = unit.items.some(i => i.id === selected?.id);
              const isCluster = unit.items.length > 1;
              const isExpanded = expanded.has(unit.key);
              return (
                <div
                  key={unit.key}
                  className={`border-b border-borderSubtle last:border-b-0 transition-colors ${isMuted ? 'opacity-45' : ''} ${
                    isSel ? 'bg-select/[0.05] shadow-[inset_2px_0_0_0_rgba(228,232,244,0.7)]' : isWatched ? 'bg-select/[0.02]' : ''
                  }`}
                >
                  <div className="flex items-stretch">
                    <button onClick={() => setSelectedId(lead.id)} className={`flex-1 min-w-0 text-left px-4 py-3 ${!isSel ? 'hover:bg-white/[0.02]' : ''}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] text-textMuted tnum">{lead.time}</span>
                        <span className="font-mono text-[11px] text-textMuted">{lead.source}</span>
                        {lead.ticker ? (
                          <span className="font-mono text-[11px] font-bold text-textPrimary">{lead.ticker}</span>
                        ) : (
                          <span className="font-mono text-[11px] uppercase tracking-wider text-textMuted">Macro</span>
                        )}
                        <SignalBadge tone={catTone[lead.category]}>{lead.category}</SignalBadge>
                      </div>
                      <p className="mt-1.5 text-[13px] text-textPrimary leading-snug">{lead.headline}</p>

                      {isCluster && (
                        <div className="mt-2 flex items-center gap-3 flex-wrap">
                          <SignalBadge tone="neutral" dot>
                            {unit.items.length} stories
                          </SignalBadge>
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-textMuted tnum">
                            <Clock className="w-3 h-3" /> {unit.firstSeen.time}
                            <span className="opacity-50">→</span>
                            {unit.lastUpdated.time}
                          </span>
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-textMuted">
                            <Link2 className="w-3 h-3" /> {unit.sources.join(' · ')}
                          </span>
                        </div>
                      )}
                    </button>

                    <div className="flex flex-col items-end justify-between gap-1.5 pr-4 py-3 shrink-0">
                      <span className={`font-mono text-[11px] font-semibold tnum ${lead.prediction.expMove1dPct >= 0 ? 'text-bull' : 'text-bear'}`}>
                        {signedPct(lead.prediction.expMove1dPct)} exp
                      </span>
                      <div className="flex items-center gap-1">
                        {isCluster && (
                          <button
                            type="button"
                            onClick={() => toggle(setExpanded, unit.key)}
                            title={isExpanded ? 'Collapse cluster' : 'Expand cluster'}
                            aria-pressed={isExpanded}
                            className="inline-flex items-center justify-center w-6 h-6 rounded border border-borderSubtle text-textMuted hover:text-textPrimary hover:border-borderMuted transition-colors"
                          >
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <IconToggle
                          active={isWatched}
                          activeClass="border-select/40 text-select bg-select/[0.08]"
                          title={isWatched ? `Unwatch ${unit.subject}` : `Watch ${unit.subject}`}
                          onClick={() => toggle(setWatched, unit.subject)}
                        >
                          <Star className={`w-3.5 h-3.5 ${isWatched ? 'fill-current' : ''}`} />
                        </IconToggle>
                        <IconToggle
                          active={isMuted}
                          activeClass="border-borderMuted text-textMuted bg-white/[0.06]"
                          title={isMuted ? `Unmute ${unit.subject}` : `Mute ${unit.subject}`}
                          onClick={() => toggle(setMuted, unit.subject)}
                        >
                          <BellOff className="w-3.5 h-3.5" />
                        </IconToggle>
                      </div>
                    </div>
                  </div>

                  {isCluster &&
                    isExpanded &&
                    unit.items
                      .filter(i => i.id !== lead.id)
                      .map(i => {
                        const iSel = i.id === selected?.id;
                        return (
                          <button
                            key={i.id}
                            onClick={() => setSelectedId(i.id)}
                            className={`w-full text-left pl-6 pr-3 py-2 border-t border-borderSubtle flex items-center gap-2 transition-colors ${
                              iSel ? 'bg-select/[0.05]' : 'hover:bg-white/[0.02]'
                            }`}
                          >
                            <span className="font-mono text-[10px] text-textMuted tnum shrink-0">{i.time}</span>
                            <span className="font-mono text-[10px] text-textMuted shrink-0">{i.source}</span>
                            <span className="flex-1 min-w-0 truncate text-[12px] text-textSecondary">{i.headline}</span>
                            <span className={`font-mono text-[11px] font-semibold tnum shrink-0 ${i.prediction.expMove1dPct >= 0 ? 'text-bull' : 'text-bear'}`}>
                              {signedPct(i.prediction.expMove1dPct)}
                            </span>
                          </button>
                        );
                      })}
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Selected headline — outcome + the integrated positioning-aware deep read */}
        {selected && (
          <Panel
            title={
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> {rightTab === 'outcome' ? 'Predicted outcome' : 'Deep read'}
              </span>
            }
            subtitle={selected.ticker ?? 'index-level'}
            tone={sentimentTone(selected.sentiment)}
            className="lg:col-span-2 lg:sticky lg:top-4"
            actions={<SegmentedControl ariaLabel="Selected view" options={RIGHT_OPTIONS} value={rightTab} onChange={setRightTab} />}
          >
            <p className="text-[13px] text-textPrimary leading-snug mb-4">{selected.headline}</p>

            {rightTab === 'outcome' ? (
              <div className="flex flex-col gap-4">
                {selected.ticker && <TickerJump ticker={selected.ticker} />}

                <OddsBar probUp={selected.prediction.probUpPct} />

                <div className="grid grid-cols-3 gap-2">
                  <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
                    <div className="font-mono text-[11px] uppercase tracking-wider text-textMuted">1-day exp</div>
                    <div className={`mt-1 font-mono text-sm font-semibold tnum ${selected.prediction.expMove1dPct >= 0 ? 'text-bull' : 'text-bear'}`}>
                      {signedPct(selected.prediction.expMove1dPct)}
                    </div>
                  </div>
                  <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
                    <div className="font-mono text-[11px] uppercase tracking-wider text-textMuted">5-day exp</div>
                    <div className={`mt-1 font-mono text-sm font-semibold tnum ${selected.prediction.expMove5dPct >= 0 ? 'text-bull' : 'text-bear'}`}>
                      {signedPct(selected.prediction.expMove5dPct)}
                    </div>
                  </div>
                  <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
                    <div className="font-mono text-[11px] uppercase tracking-wider text-textMuted">Confidence</div>
                    <div className="mt-1 font-mono text-sm font-semibold text-textPrimary tnum">{selected.prediction.confidencePct}%</div>
                  </div>
                </div>

                <div>
                  <div className="font-mono text-[11px] uppercase tracking-widest text-textMuted">Historical analog</div>
                  <p className="mt-1.5 text-xs text-textSecondary leading-relaxed">{selected.prediction.analog}</p>
                </div>

                <div className="border-t border-borderSubtle pt-3">
                  <div className="font-mono text-[11px] uppercase tracking-widest text-textMuted">Playbook</div>
                  <p className="mt-1.5 text-xs text-textSecondary leading-relaxed">{selected.prediction.playbook}</p>
                </div>
              </div>
            ) : (
              <NewsIntel selectedItem={selected} onSelect={setSelectedId} />
            )}
          </Panel>
        )}
      </div>
    </>
  );
};

export default News;
