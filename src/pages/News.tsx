import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Newspaper, Sparkles } from 'lucide-react';
import CatTag, { CAT_COLOR } from '../components/news/CatTag';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import RichRead from '../components/ui/RichRead';
import SegmentedControl from '../components/ui/SegmentedControl';
import FilterTabs from '../components/ui/FilterTabs';
import AnimatedNumber from '../components/ui/AnimatedNumber';
import { buildNewsDeepRead, buildNewsFeed, marketMood, type NewsCategory, type NewsItem } from '../data/news';
import type { Tone } from '../components/ui/tones';

type CatFilter = 'ALL' | NewsCategory;
type ReadTab = 'outcome' | 'deep';

const TAB_OPTIONS = [
  { value: 'outcome', label: 'Outcome' },
  { value: 'deep', label: 'Deep read' },
] as const;

const CAT_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'Earnings', label: 'Earnings' },
  { value: 'Guidance', label: 'Guidance' },
  { value: 'Analyst', label: 'Analyst' },
  { value: 'Macro', label: 'Macro' },
] as const;

const sentimentTone = (s: number): Tone => (s > 0.12 ? 'bull' : s < -0.12 ? 'bear' : 'neutral');

// The beat's identity colours and tag live in components/news/CatTag — the
// desk's News widget wears the same ones.

/** House easing — the same curve every other transition on the terminal uses. */
const EASE = 'cubic-bezier(0.16,1,0.3,1)';

/** Odds meter — the model's directional lean rendered as a two-sided bar.
    Mint vs red: the market's colors, same tug-bar grammar as Earnings.
    The split SLIDES between headlines rather than jumping, so switching
    stories reads as one meter moving instead of a new one appearing. It must
    stay mounted across selections for that to work — never key it by headline. */
const OddsBar = ({ probUp }: { probUp: number }) => (
  <div>
    <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wider tnum">
      <span className={`transition-colors duration-300 ${probUp < 50 ? 'text-bear font-semibold' : 'text-textSecondary'}`}>
        Down <AnimatedNumber value={100 - probUp} format={v => `${Math.round(v)}%`} />
      </span>
      <span className={`transition-colors duration-300 ${probUp >= 50 ? 'text-bull font-semibold' : 'text-textSecondary'}`}>
        Up <AnimatedNumber value={probUp} format={v => `${Math.round(v)}%`} />
      </span>
    </div>
    <div className="mt-1.5 flex h-1.5 rounded-full overflow-hidden bg-white/[0.06]">
      <span
        className="h-full bg-bear/80"
        style={{ width: `${100 - probUp}%`, transition: `width 520ms ${EASE}` }}
      />
      <span className="h-full bg-bull" style={{ width: `${probUp}%`, transition: `width 520ms ${EASE}` }} />
    </div>
  </div>
);

/** One figure in the card's metric strip — same shell both tabs use. */
const Metric = ({ label, value, sub, tone = 'text-textPrimary' }: { label: string; value: React.ReactNode; sub?: string; tone?: string }) => (
  <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2 min-w-0">
    <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted truncate">{label}</div>
    <div className={`mt-1 font-mono text-sm font-semibold tnum ${tone}`}>{value}</div>
    {sub && <div className="font-mono text-[9px] text-textMuted truncate">{sub}</div>}
  </div>
);

/** Wire-vs-book agreement as a signed bar — centre is "no opinion". */
const AlignmentBar = ({ alignment }: { alignment: number }) => {
  const pct = Math.min(Math.abs(alignment), 1) * 50;
  const confirms = alignment > 0;
  return (
    <span className="relative flex h-1.5 w-full rounded-full overflow-hidden bg-white/[0.06] mt-1.5">
      <span className="absolute left-1/2 top-0 bottom-0 w-px bg-white/25 z-10" />
      {Math.abs(alignment) > 0.02 && (
        <span
          className={`absolute top-0 bottom-0 ${confirms ? 'bg-bull' : 'bg-bear/80'}`}
          style={{
            [confirms ? 'left' : 'right']: '50%',
            width: `${pct}%`,
            transition: `width 520ms ${EASE}`,
          }}
        />
      )}
    </span>
  );
};

const News = () => {
  const location = useLocation();
  const feed = useMemo(() => buildNewsFeed(), []);
  const mood = useMemo(() => marketMood(), []);
  const [filter, setFilter] = useState<CatFilter>('ALL');
  // A headline clicked on the desk's News widget arrives already selected
  const [selectedId, setSelectedId] = useState<string | null>(
    () => (location.state as { selectedId?: string } | null)?.selectedId ?? null
  );
  const [tab, setTab] = useState<ReadTab>('outcome');

  const rows = useMemo(
    () => (filter === 'ALL' ? feed : feed.filter(n => n.category === filter)),
    [feed, filter]
  );
  const selected: NewsItem = rows.find(n => n.id === selectedId) ?? rows[0] ?? feed[0];
  // The positioning layer behind the selected headline — every item has one, so
  // the deep read never has to apologise for a name it can't cover.
  const deep = useMemo(() => buildNewsDeepRead(selected), [selected]);

  const moodTone: Tone = mood.score > 0.15 ? 'bull' : mood.score < -0.15 ? 'bear' : 'neutral';
  const movers = [...feed]
    .filter(n => n.ticker)
    .sort((a, b) => Math.abs(b.prediction.expMove1dPct) - Math.abs(a.prediction.expMove1dPct))
    .slice(0, 3);

  // Tape strip: tick heights normalize against the session's biggest expected
  // move; the counts are the same lean the mood word summarizes.
  const tickMax = Math.max(...feed.map(n => Math.abs(n.prediction.expMove1dPct)), 0.1);
  const leanCounts = feed.reduce(
    (acc, n) => {
      if (n.sentiment > 0.12) acc.up++;
      else if (n.sentiment < -0.12) acc.down++;
      else acc.flat++;
      return acc;
    },
    { up: 0, flat: 0, down: 0 }
  );

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'News']}
        title="News"
        subtitle="The wire on the left — what the model thinks it does to price on the right"
        actions={<SegmentedControl ariaLabel="Category filter" options={CAT_OPTIONS} value={filter} onChange={setFilter} />}
      />

      {/* THE TAPE — the session's balance as a compact equalizer: every
          headline a tick, sized by its expected move, colored by its lean.
          Same single-row instrument grammar as the Earnings slate — a
          fixed-width cluster, never a full-width stretch. */}
      <div className="border border-borderSubtle bg-inset rounded-md px-4 py-3 flex items-center gap-x-6 gap-y-3 flex-wrap">
        <span className="flex items-baseline gap-2.5 shrink-0">
          <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Today</span>
          <span
            className={`font-mono text-lg font-bold ${
              moodTone === 'bull' ? 'text-bull' : moodTone === 'bear' ? 'text-bear' : 'text-textPrimary'
            }`}
          >
            {mood.label}
          </span>
        </span>

        {/* Fixed-width tick cluster + the lean it reads */}
        <span className="flex items-center gap-3 shrink-0">
          <span className="flex items-end gap-[3px] h-8">
            {feed.map(n => {
              const mag = Math.abs(n.prediction.expMove1dPct);
              const h = 26 + (mag / tickMax) * 74;
              const up = n.sentiment > 0.12;
              const down = n.sentiment < -0.12;
              return (
                <span
                  key={n.id}
                  title={`${n.ticker ? `${n.ticker} · ` : ''}${n.headline}`}
                  className={`w-2 rounded-[1px] ${up ? 'bg-bull' : down ? 'bg-bear/85' : 'bg-white/25'}`}
                  style={{ height: `${h}%` }}
                />
              );
            })}
          </span>
          <span className="flex items-center gap-2 font-mono text-[11px] tnum whitespace-nowrap">
            <span className="text-bull font-semibold">{leanCounts.up} bullish</span>
            <span className="text-textMuted">·</span>
            <span className="text-textSecondary">{leanCounts.flat} neutral</span>
            <span className="text-textMuted">·</span>
            <span className="text-bear font-semibold">{leanCounts.down} bearish</span>
          </span>
        </span>

        <span className="hidden lg:block w-px h-8 bg-borderSubtle" />

        {/* Biggest catalysts */}
        <span className="flex items-center gap-x-5 gap-y-2 flex-wrap min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted shrink-0">Biggest</span>
          {movers.map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedId(m.id)}
              className="inline-flex items-baseline gap-2 hover:opacity-80 transition-opacity"
            >
              <span className="font-mono text-[12px] font-bold text-textPrimary">{m.ticker}</span>
              <span
                className={`font-mono text-[12px] font-semibold tnum ${
                  m.prediction.expMove1dPct >= 0 ? 'text-bull' : 'text-bear'
                }`}
              >
                {m.prediction.expMove1dPct >= 0 ? '+' : ''}
                {m.prediction.expMove1dPct.toFixed(1)}%
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: CAT_COLOR[m.category] }}>
                {m.category}
              </span>
            </button>
          ))}
        </span>

        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-textMuted tnum shrink-0">
          {feed.length} headlines
        </span>
      </div>

      <Panel tone={moodTone} bodyClassName="py-3">
        <p className="text-xs text-textSecondary leading-relaxed">
          <span className={`font-mono font-semibold uppercase tracking-wider mr-2 ${moodTone === 'bull' ? 'text-bull' : moodTone === 'bear' ? 'text-bear' : 'text-textPrimary'}`}>
            The read
          </span>
          <span className="text-textPrimary">
            <RichRead text={mood.note} />
          </span>
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
                    isSel ? 'bg-white/[0.04] shadow-[inset_2px_0_0_0_rgba(237,237,237,0.7)]' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px] text-textMuted tnum">{n.time}</span>
                    <span className="font-mono text-[10px] text-textMuted">{n.source}</span>
                    {n.ticker && <span className="font-mono text-[11px] font-bold text-textPrimary">{n.ticker}</span>}
                    <CatTag category={n.category} />
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
                <Sparkles className="w-3.5 h-3.5" /> {tab === 'deep' ? 'Deep read' : 'Predicted outcome'}
              </span>
            }
            subtitle={selected.ticker ?? 'index-level'}
            tone={sentimentTone(selected.sentiment)}
            className="lg:col-span-2 lg:sticky lg:top-4"
            actions={<FilterTabs ariaLabel="Read depth" options={TAB_OPTIONS} value={tab} onChange={setTab} />}
          >
            <div className="flex flex-col gap-4">
              <p key={`hl-${selected.id}`} className="text-[13px] text-textPrimary leading-snug animate-soft-in">
                {selected.headline}
              </p>

              {/* Keyed by TAB only. Switching headlines must not remount this
                  subtree — that is what lets the odds bar slide and the numbers
                  roll instead of snapping. Switching tabs does remount, so the
                  two views cross-fade into each other. */}
              {tab === 'outcome' ? (
                <div key="outcome" className="flex flex-col gap-4 animate-soft-in">
                  <OddsBar probUp={selected.prediction.probUpPct} />

                  <div className="grid grid-cols-3 gap-2">
                    <Metric
                      label="1-day exp"
                      tone={selected.prediction.expMove1dPct >= 0 ? 'text-bull' : 'text-bear'}
                      value={
                        <AnimatedNumber
                          value={selected.prediction.expMove1dPct}
                          format={v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
                        />
                      }
                    />
                    <Metric
                      label="5-day exp"
                      tone={selected.prediction.expMove5dPct >= 0 ? 'text-bull' : 'text-bear'}
                      value={
                        <AnimatedNumber
                          value={selected.prediction.expMove5dPct}
                          format={v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
                        />
                      }
                    />
                    <Metric
                      label="Confidence"
                      value={<AnimatedNumber value={selected.prediction.confidencePct} format={v => `${Math.round(v)}%`} />}
                    />
                  </div>

                  <div key={`an-${selected.id}`} className="animate-soft-in">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Historical analog</div>
                    <p className="mt-1.5 text-xs text-textSecondary leading-relaxed">
                      <RichRead text={selected.prediction.analog} />
                    </p>
                  </div>

                  <div key={`pb-${selected.id}`} className="border-t border-borderSubtle pt-3 animate-soft-in">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Playbook</div>
                    <p className="mt-1.5 text-xs text-textSecondary leading-relaxed">
                      <RichRead text={selected.prediction.playbook} />
                    </p>
                  </div>
                </div>
              ) : (
                <div key="deep" className="flex flex-col gap-4 animate-soft-in">
                  {/* Positioning read — what is already in the price, and whether
                      the options book is backing the story or leaning against it */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Positioning read</span>
                    <span className="font-mono text-[11px] font-bold text-textPrimary">{selected.ticker ?? 'Index-level'}</span>
                    <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-textSecondary">
                      {deep.driver === 'MECHANICAL' ? 'Positioning-driven' : 'Story-driven'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Metric
                      label="Priced in"
                      sub="of the move discounted"
                      tone={deep.pricedInPct >= 70 ? 'text-warn' : 'text-bull'}
                      value={<AnimatedNumber value={deep.pricedInPct} format={v => `${Math.round(v)}%`} />}
                    />
                    <Metric
                      label="Catalyst half-life"
                      sub="until the pull halves"
                      value={<AnimatedNumber value={deep.halfLifeSessions} format={v => `${v.toFixed(1)} sess`} />}
                    />
                    <Metric
                      label="Event move"
                      sub="what options charge"
                      value={<AnimatedNumber value={deep.eventVolPct} format={v => `±${v.toFixed(1)}%`} />}
                    />
                    <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2 min-w-0">
                      <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted truncate">Wire vs book</div>
                      <div
                        className={`mt-1 font-mono text-sm font-semibold ${
                          deep.bookLabel === 'CONFIRMS' ? 'text-bull' : deep.bookLabel === 'FADES' ? 'text-bear' : 'text-textPrimary'
                        }`}
                      >
                        {deep.bookLabel === 'CONFIRMS' ? 'Confirms' : deep.bookLabel === 'FADES' ? 'Fades it' : 'No lean'}
                      </div>
                      <AlignmentBar alignment={deep.bookAlignment} />
                    </div>
                  </div>

                  <div key={`rd-${selected.id}`} className="animate-soft-in">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">The read</div>
                    <p className="mt-1.5 text-xs text-textSecondary leading-relaxed">
                      <RichRead text={deep.read} />
                    </p>
                  </div>

                  <div key={`iv-${selected.id}`} className="border-t border-borderSubtle pt-3 animate-soft-in">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">What kills it</div>
                    <p className="mt-1.5 text-xs text-textSecondary leading-relaxed">
                      <RichRead text={deep.invalidation} />
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Panel>
        )}
      </div>
    </>
  );
};

export default News;
