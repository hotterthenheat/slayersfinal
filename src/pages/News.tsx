import React, { useMemo, useState } from 'react';
import { Gauge, Newspaper, Sparkles, Star, BellOff, Eye, EyeOff, ChevronDown, ChevronRight, Clock, Link2 } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import TickerJump from '../components/ui/TickerJump';
import Panel from '../components/ui/Panel';
import StatCard from '../components/ui/StatCard';
import MetricGrid from '../components/ui/MetricGrid';
import SignalBadge from '../components/ui/SignalBadge';
import SegmentedControl from '../components/ui/SegmentedControl';
import HoverReadout from '../components/ui/HoverReadout';
import Stat from '../components/ui/Stat';
import { buildNewsFeed, marketMood, newsLean, type NewsCategory, type NewsItem } from '../data/news';
import { lookup } from '../data/universe';
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

// One threshold for the whole surface — `newsLean` is the engine's cut, so a
// headline counted "bullish" in the tape mix is tinted bullish in the row.
const sentimentTone = (s: number): Tone => {
  const l = newsLean(s);
  return l === 'bullish' ? 'bull' : l === 'bearish' ? 'bear' : 'neutral';
};
const sentimentText = (s: number): string => {
  const l = newsLean(s);
  return l === 'bullish' ? 'text-bull' : l === 'bearish' ? 'text-bear' : 'text-textSecondary';
};

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
const dirText = (v: number): string => (v >= 0 ? 'text-bull' : 'text-bear');

/** Relative age off the feed's own `minutesAgo` — "how stale" at a glance. */
const ageLabel = (minutes: number): string => (minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`);

/** One labelled figure in a dense stat rail. */
const Fig = ({ label, value, valueClass = 'text-textPrimary' }: { label: string; value: string; valueClass?: string }) => (
  <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
    <span className="uppercase tracking-wider text-textMuted">{label}</span>
    <span className={`tnum font-semibold ${valueClass}`}>{value}</span>
  </span>
);

/**
 * The model read, on the row instead of in a hover. Every figure here was
 * already on the item and only reachable by pointing at it, which left the wire
 * reading as a list of titles. Direction takes bull/bear tone; magnitude
 * figures (impact, confidence, the prior base rate) stay neutral — they size a
 * move, they do not point one way.
 */
const RowStats = ({ n }: { n: NewsItem }) => {
  const p = n.prediction;
  return (
    <div className="mt-2 flex items-center gap-x-3.5 gap-y-1 flex-wrap font-mono text-micro text-textSecondary">
      <Fig label="P up" value={`${p.probUpPct}%`} valueClass={sentimentText(n.sentiment)} />
      <Fig label="1d" value={signedPct(p.expMove1dPct)} valueClass={dirText(p.expMove1dPct)} />
      <Fig label="5d" value={signedPct(p.expMove5dPct)} valueClass={dirText(p.expMove5dPct)} />
      <span className="w-px h-2.5 bg-borderSubtle" aria-hidden />
      <Fig label="impact" value={`${Math.round(n.magnitude * 100)}`} />
      <Fig label="conf" value={`${p.confidencePct}`} />
      <span className="w-px h-2.5 bg-borderSubtle" aria-hidden />
      <Fig label="priors" value={`${p.baseN}`} />
      <Fig label="hit" value={`${p.baseHitPct}%`} />
      <Fig label="median" value={`${p.baseMedianPct}%`} />
    </div>
  );
};

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
    <div className="flex items-center justify-between font-mono text-label uppercase tracking-wider text-textMuted">
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
    // aria-label as well as title: these are icon-only, so `title` was carrying
    // the whole name. It is the last resort in the accessible-name calculation
    // and several screen readers skip it, which left 36 buttons on this page
    // announcing nothing but "button".
    aria-label={title}
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
  const [hover, setHover] = useState<{ n: NewsItem; x: number; y: number } | null>(null);

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
  const moodTotal = Math.max(feed.length, 1);
  // One card per ticker — keep each ticker's biggest-move headline, then take
  // the top three. Sorting the raw feed let one ticker (e.g. NVDA) fill two
  // cards and labelled all three "Top catalyst"; this dedupes and ranks them.
  const moversByTicker = new Map<string, NewsItem>();
  for (const n of feed) {
    if (!n.ticker) continue;
    const cur = moversByTicker.get(n.ticker);
    if (!cur || Math.abs(n.prediction.expMove1dPct) > Math.abs(cur.prediction.expMove1dPct)) {
      moversByTicker.set(n.ticker, n);
    }
  }
  const movers = [...moversByTicker.values()]
    .sort((a, b) => Math.abs(b.prediction.expMove1dPct) - Math.abs(a.prediction.expMove1dPct))
    .slice(0, 3);

  const hasFilters = watched.size > 0 || muted.size > 0;

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'News']}
        title="News"
        subtitle="The wire on the left, what the model thinks it does to price on the right"
        actions={<SegmentedControl ariaLabel="Category filter" options={CAT_OPTIONS} value={filter} onChange={setFilter} />}
      />

      <MetricGrid min="170px">
        {/*
          The sub was a bare signed integer with no unit and no scale ("−14
          headline-weighted lean"), which is not something a reader can size.
          The counts behind the score are checkable against the wire below.
        */}
        <StatCard
          label="Tape mood"
          value={
            <span className="inline-flex items-center gap-2">
              <Gauge className="w-4 h-4" />
              {mood.label}
            </span>
          }
          sub={`${mood.mix.bullish} bullish · ${mood.mix.bearish} bearish${mood.mix.flat > 0 ? ` · ${mood.mix.flat} flat` : ''}`}
          tone={moodTone}
        />
        <StatCard label="Headlines tracked" value={feed.length} sub={`${mood.nameCount} single-name · ${mood.macroCount} macro`} />
        {movers.map((m, i) => (
          <StatCard
            key={m.id}
            label={`${['Top', '2nd', '3rd'][i]} catalyst · ${m.ticker}`}
            value={signedPct(m.prediction.expMove1dPct)}
            sub={m.category}
            tone={sentimentTone(m.sentiment)}
          />
        ))}
      </MetricGrid>

      {/*
        This block used to be a full-width prose banner headed "The read" whose
        only datum was a lean adjective. It now leads with the split the score
        is computed from and the catalyst mix, and the sentence follows as a
        caption instead of a headline. The heading also stopped colliding with
        the deep read's own "The read" two columns over.
      */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5" /> Tape composition
          </span>
        }
        subtitle={`${feed.length} headlines scored this session`}
        tone={moodTone}
        bodyClassName="py-3"
      >
        <div className="flex flex-col gap-3">
          <div>
            <div className="flex items-center justify-between font-mono text-label uppercase tracking-wider">
              <span className="text-bear tnum">{mood.mix.bearish} bearish</span>
              {mood.mix.flat > 0 && <span className="text-textMuted tnum">{mood.mix.flat} flat</span>}
              <span className="text-bull tnum">{mood.mix.bullish} bullish</span>
            </div>
            <div className="mt-1.5 flex h-1.5 rounded-full overflow-hidden bg-white/[0.06]">
              <span className="h-full bg-bear/80" style={{ width: `${(mood.mix.bearish / moodTotal) * 100}%` }} />
              <span className="h-full bg-white/20" style={{ width: `${(mood.mix.flat / moodTotal) * 100}%` }} />
              <span className="h-full bg-bull/80" style={{ width: `${(mood.mix.bullish / moodTotal) * 100}%` }} />
            </div>
          </div>

          <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap">
            <span className="font-mono text-label uppercase tracking-widest text-textMuted">Catalysts</span>
            {mood.byCategory.map(c => (
              <span key={c.category} className="inline-flex items-center gap-1.5">
                <SignalBadge tone={catTone[c.category]}>{c.category}</SignalBadge>
                <span className="font-mono text-label font-semibold text-textPrimary tnum">{c.count}</span>
              </span>
            ))}
          </div>

          <p className="text-caption text-textSecondary leading-relaxed border-t border-borderSubtle pt-2.5">{mood.note}</p>
        </div>
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
              {muted.size > 0 && <span className="font-mono text-label uppercase tracking-wider text-textMuted">{muted.size} muted</span>}
              <div className="ml-auto flex items-center gap-2">
                {muted.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setHideMuted(v => !v)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded border font-mono text-label uppercase tracking-wider transition-colors ${
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
                  className="font-mono text-label uppercase tracking-wider text-textMuted hover:text-textPrimary transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col max-h-[max(560px,62vh)] overflow-auto">
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
                    isSel ? 'bg-select/[0.05] rail-select' : isWatched ? 'bg-select/[0.02]' : ''
                  }`}
                >
                  <div className="flex items-stretch">
                    <button
                      onClick={() => setSelectedId(lead.id)}
                      onMouseEnter={e => setHover({ n: lead, x: e.clientX, y: e.clientY })}
                      onMouseMove={e => setHover({ n: lead, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHover(h => (h && h.n.id === lead.id ? null : h))}
                      className={`flex-1 min-w-0 text-left px-4 py-3 ${!isSel ? 'hover:bg-rowHover' : ''}`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-label text-textMuted tnum">{lead.time}</span>
                        <span className="font-mono text-label text-textMuted tnum">{ageLabel(lead.minutesAgo)} ago</span>
                        <span className="font-mono text-label text-textMuted">{lead.source}</span>
                        {lead.ticker ? (
                          <>
                            <span className="font-mono text-label font-bold text-textPrimary">{lead.ticker}</span>
                            <span className="font-mono text-label text-textMuted">{lookup(lead.ticker)?.sector}</span>
                          </>
                        ) : (
                          <span className="font-mono text-label uppercase tracking-wider text-textMuted">Macro</span>
                        )}
                        <SignalBadge tone={catTone[lead.category]}>{lead.category}</SignalBadge>
                      </div>
                      <p className="mt-1.5 text-data text-textPrimary leading-snug">{lead.headline}</p>

                      <RowStats n={lead} />

                      {isCluster && (
                        <div className="mt-2 flex items-center gap-3 flex-wrap">
                          <SignalBadge tone="neutral" dot>
                            {unit.items.length} stories
                          </SignalBadge>
                          <span className="inline-flex items-center gap-1 font-mono text-micro text-textMuted tnum">
                            <Clock className="w-3 h-3" /> {unit.firstSeen.time}
                            <span className="opacity-50">→</span>
                            {unit.lastUpdated.time}
                          </span>
                          <span className="inline-flex items-center gap-1 font-mono text-micro text-textMuted">
                            <Link2 className="w-3 h-3" /> {unit.sources.join(' · ')}
                          </span>
                        </div>
                      )}
                    </button>

                    <div className="flex flex-col items-end justify-between gap-1.5 pr-4 py-3 shrink-0">
                      <span className={`font-mono text-label font-semibold tnum ${lead.prediction.expMove1dPct >= 0 ? 'text-bull' : 'text-bear'}`}>
                        {signedPct(lead.prediction.expMove1dPct)} exp
                      </span>
                      <div className="flex items-center gap-1">
                        {isCluster && (
                          <button
                            type="button"
                            onClick={() => toggle(setExpanded, unit.key)}
                            title={isExpanded ? 'Collapse cluster' : 'Expand cluster'}
                            aria-label={isExpanded ? 'Collapse cluster' : 'Expand cluster'}
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
                            onMouseEnter={e => setHover({ n: i, x: e.clientX, y: e.clientY })}
                            onMouseMove={e => setHover({ n: i, x: e.clientX, y: e.clientY })}
                            onMouseLeave={() => setHover(h => (h && h.n.id === i.id ? null : h))}
                            className={`w-full text-left pl-6 pr-3 py-2 border-t border-borderSubtle flex items-center gap-2 transition-colors ${
                              iSel ? 'bg-select/[0.05]' : 'hover:bg-rowHover'
                            }`}
                          >
                            <span className="font-mono text-micro text-textMuted tnum shrink-0">{i.time}</span>
                            <span className="font-mono text-micro text-textMuted shrink-0">{i.source}</span>
                            <span className="flex-1 min-w-0 truncate text-caption text-textSecondary">{i.headline}</span>
                            <span className={`font-mono text-label font-semibold tnum shrink-0 ${i.prediction.expMove1dPct >= 0 ? 'text-bull' : 'text-bear'}`}>
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
            <div className="flex items-center gap-2 flex-wrap font-mono text-label text-textMuted mb-1.5">
              <span className="tnum">{selected.time}</span>
              <span className="tnum">{ageLabel(selected.minutesAgo)} ago</span>
              <span>{selected.source}</span>
              {selected.ticker && <span>{lookup(selected.ticker)?.sector}</span>}
              <SignalBadge tone={catTone[selected.category]}>{selected.category}</SignalBadge>
            </div>
            <p className="text-data text-textPrimary leading-snug mb-4">{selected.headline}</p>

            {rightTab === 'outcome' ? (
              <div className="flex flex-col gap-4">
                {selected.ticker && <TickerJump ticker={selected.ticker} />}

                <OddsBar probUp={selected.prediction.probUpPct} />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat
                    label="1-day exp"
                    value={signedPct(selected.prediction.expMove1dPct)}
                    tone={selected.prediction.expMove1dPct >= 0 ? 'bull' : 'bear'}
                    sub="next session"
                  />
                  <Stat
                    label="5-day exp"
                    value={signedPct(selected.prediction.expMove5dPct)}
                    tone={selected.prediction.expMove5dPct >= 0 ? 'bull' : 'bear'}
                    sub="five sessions"
                  />
                  <Stat label="Confidence" value={`${selected.prediction.confidencePct}%`} sub="model, in the read" />
                  <Stat label="Impact" value={`${Math.round(selected.magnitude * 100)}`} sub="how market-moving" />
                </div>

                <div>
                  <div className="font-mono text-label uppercase tracking-widest text-textMuted">Base rate behind it</div>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    <Stat label="Priors" value={`${selected.prediction.baseN}`} sub={`${selected.category.toLowerCase()} prints`} align="right" />
                    <Stat label="Hit" value={`${selected.prediction.baseHitPct}%`} sub="resolved the same way" align="right" />
                    <Stat label="Median" value={`${selected.prediction.baseMedianPct}%`} sub="typical move" align="right" />
                  </div>
                  {/* Sizes the model's own call against what the catalyst type usually does. */}
                  <p className="mt-2 font-mono text-label text-textMuted">
                    This call:{' '}
                    <span className={`tnum font-semibold ${dirText(selected.prediction.expMove1dPct)}`}>
                      {Math.abs(selected.prediction.expMove1dPct).toFixed(1)}%
                    </span>{' '}
                    against a {selected.prediction.baseMedianPct}% median,{' '}
                    {Math.abs(selected.prediction.expMove1dPct) >= selected.prediction.baseMedianPct ? 'bigger' : 'smaller'} than the type
                    usually delivers.
                  </p>
                  <p className="mt-1.5 text-caption text-textSecondary leading-relaxed">{selected.prediction.analog}</p>
                </div>

                <div className="border-t border-borderSubtle pt-3">
                  <div className="font-mono text-label uppercase tracking-widest text-textMuted">Playbook</div>
                  <p className="mt-1.5 text-caption text-textSecondary leading-relaxed">{selected.prediction.playbook}</p>
                </div>
              </div>
            ) : (
              <NewsIntel selectedItem={selected} onSelect={setSelectedId} />
            )}
          </Panel>
        )}
      </div>

      {/*
        The read-out used to repeat sentiment, magnitude, P(up) and the 5-day
        move — every one of which now sits on the row and stays there. What it
        carries instead is the one thing the row does not: what to do with the
        headline, plus the two sizing figures the collapsed cluster children
        have no room for.
      */}
      {hover && (
        <HoverReadout x={hover.x} y={hover.y}>
          <div className="flex items-baseline gap-3 font-mono text-micro uppercase tracking-wider text-textMuted">
            <span className="text-caption font-bold normal-case tracking-normal text-textPrimary">{hover.n.category}</span>
            <span>
              Impact <span className="text-textPrimary tnum">{Math.round(hover.n.magnitude * 100)}</span>
            </span>
            <span>
              Conf <span className="text-textPrimary tnum">{hover.n.prediction.confidencePct}</span>
            </span>
          </div>
          <p className="mt-1 text-label text-textSecondary leading-snug">{hover.n.prediction.playbook}</p>
        </HoverReadout>
      )}
    </>
  );
};

export default News;
