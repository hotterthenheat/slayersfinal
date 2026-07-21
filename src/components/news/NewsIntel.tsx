import { useMemo } from 'react';
import { Radar, Scale, Newspaper, Gauge } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import {
  buildNewsIntel,
  type CatalystNature,
  type HeadlineIntel,
  type PositioningAgreement,
} from '../../data/newsintel';
import type { NewsCategory } from '../../data/news';
import Panel from '../ui/Panel';
import StatCard from '../ui/StatCard';
import MetricGrid from '../ui/MetricGrid';
import SignalBadge from '../ui/SignalBadge';
import { toneText, type Tone } from '../ui/tones';

const signed1 = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;

const catTone: Record<NewsCategory, Tone> = {
  Earnings: 'magenta',
  Guidance: 'warn',
  Analyst: 'select',
  Macro: 'neutral',
  'M&A': 'magenta',
  Product: 'select',
  Regulatory: 'warn',
};

const agreeTone: Record<PositioningAgreement, Tone> = {
  CONFIRMS: 'bull',
  DIVERGES: 'warn',
  NEUTRAL: 'neutral',
};

const natureTone: Record<CatalystNature, Tone> = {
  INFORMATIONAL: 'select',
  MECHANICAL: 'magenta',
};

const pricedInTone = (pct: number): Tone => (pct >= 68 ? 'warn' : pct >= 42 ? 'select' : 'bull');
const sentimentTone = (s: number): Tone => (s > 0.08 ? 'bull' : s < -0.08 ? 'bear' : 'neutral');
const sentimentWord = (s: number): string => (s > 0.08 ? 'BULLISH' : s < -0.08 ? 'BEARISH' : 'NEUTRAL');

/** One −1…+1 lean rendered as a fill growing out from a hard center. */
const DivergingRow = ({ label, value, word, wordClass }: { label: string; value: number; word: string; wordClass: string }) => {
  const v = Math.max(-1, Math.min(1, value));
  const w = Math.abs(v) * 50;
  const left = v >= 0 ? 50 : 50 - w;
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-wider text-textMuted">{label}</span>
        <span className={`font-mono text-[9px] uppercase tracking-wider ${wordClass}`}>{word}</span>
      </div>
      <div className="relative mt-1 h-1.5 rounded-full bg-white/[0.06]">
        <span className="absolute top-0 bottom-0 left-1/2 w-px bg-white/25" aria-hidden />
        <span className="absolute top-0 bottom-0 rounded-full holo-bar" style={{ left: `${left}%`, width: `${w}%` }} />
      </div>
    </div>
  );
};

/** Compact bordered metric cell — the News-page idiom. */
const Cell = ({ label, value, valueClass = 'text-textPrimary', sub }: { label: string; value: string; valueClass?: string; sub?: string }) => (
  <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
    <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted truncate">{label}</div>
    <div className={`mt-1 font-mono text-sm font-semibold tnum ${valueClass}`}>{value}</div>
    {sub && <div className="mt-0.5 text-[10px] text-textMuted leading-tight truncate">{sub}</div>}
  </div>
);

/** One analog event row: match strength · when · how it resolved. */
const AnalogRow = ({ a }: { a: HeadlineIntel['analogs'][number] }) => (
  <div className="flex items-center gap-2 py-1.5">
    <span className="w-8 shrink-0 font-mono text-[12px] font-semibold text-textPrimary tnum text-right">{a.similarityPct}</span>
    <span className="w-14 shrink-0 font-mono text-[9px] text-textMuted">{a.when}</span>
    <span className="flex-1 min-w-0 truncate text-[11px] text-textSecondary leading-snug">{a.descriptor}</span>
    <span className={`w-12 shrink-0 text-right font-mono text-[11px] font-semibold tnum ${a.outcome1dPct >= 0 ? 'text-bull' : 'text-bear'}`}>
      {signed1(a.outcome1dPct)}%
    </span>
    <SignalBadge tone={a.followThrough ? 'bull' : 'neutral'}>{a.followThrough ? 'held' : 'faded'}</SignalBadge>
  </div>
);

/** Full intelligence card for one headline. */
const HeadlineCard = ({ h, positioningLean, positioningLabel }: { h: HeadlineIntel; positioningLean: number; positioningLabel: string }) => {
  const sentTone = sentimentTone(h.sentiment);
  const piTone = pricedInTone(h.pricedInPct);
  return (
    <Panel tone={sentTone} bodyClassName="flex flex-col gap-3.5">
      {/* header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[10px] text-textMuted tnum">{h.time}</span>
        <span className="font-mono text-[10px] text-textMuted">{h.source}</span>
        {h.scope === 'MACRO' ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-flip">Macro</span>
        ) : (
          <span className="font-mono text-[11px] font-bold text-textPrimary">{h.ticker}</span>
        )}
        <SignalBadge tone={catTone[h.category]}>{h.category}</SignalBadge>
        <span className={`ml-auto font-mono text-[11px] font-semibold tnum ${h.expMove1dPct >= 0 ? 'text-bull' : 'text-bear'}`}>
          {signed1(h.expMove1dPct)}% exp
        </span>
      </div>
      <p className="text-[13px] text-textPrimary leading-snug">{h.headline}</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* left: the numbers */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Cell label="Half-life" value={h.halfLifeLabel} sub={`${h.category.toLowerCase()} decay`} />
            <Cell label="Priced in" value={`${h.pricedInPct}%`} valueClass={toneText[piTone]} sub="already discounted" />
            <Cell label="Event vol" value={`±${h.eventVolPct.toFixed(1)}%`} valueClass="text-select" sub="implied move" />
            <Cell label="Prob up" value={`${h.probUpPct}%`} valueClass={toneText[sentTone]} sub="model, next session" />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-wider text-textMuted">Priced-in progress</span>
              <span className={`font-mono text-[10px] font-semibold tnum ${toneText[piTone]}`}>{h.pricedInPct}%</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <span className="block h-full rounded-full holo-bar" style={{ width: `${h.pricedInPct}%` }} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Narrative vs positioning</span>
              <SignalBadge tone={agreeTone[h.agreement]} dot>{h.agreement}</SignalBadge>
            </div>
            <DivergingRow label="Wire lean" value={Math.tanh(h.sentiment * 1.8)} word={sentimentWord(h.sentiment)} wordClass={toneText[sentTone]} />
            <DivergingRow label="Book" value={positioningLean} word={positioningLabel} wordClass="holo-text" />
            <p className="text-[11px] text-textSecondary leading-snug">{h.agreementNote}</p>
          </div>
        </div>

        {/* right: analogs, classification, invalidation */}
        <div className="flex flex-col gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-textMuted">
                <Radar className="w-3 h-3" /> Closest analogs
              </span>
              <span className="font-mono text-[9px] text-textMuted uppercase tracking-wider">sim · when · 1d</span>
            </div>
            <div className="flex flex-col divide-y divide-borderSubtle">
              {h.analogs.map((a, i) => (
                <AnalogRow key={i} a={a} />
              ))}
            </div>
          </div>

          <div className="border-t border-borderSubtle pt-3 flex items-start gap-2">
            <SignalBadge tone={natureTone[h.nature]}>{h.nature}</SignalBadge>
            <span className="text-[11px] text-textSecondary leading-snug">{h.natureNote}</span>
          </div>

          <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
            <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Invalidation</div>
            <p className="mt-1 text-[11px] text-textSecondary leading-snug">{h.invalidation}</p>
          </div>
        </div>
      </div>
    </Panel>
  );
};

const NewsIntel = () => {
  const { marketData } = useMarketData();
  const view = useMemo(() => (marketData ? buildNewsIntel(marketData) : null), [marketData]);

  if (!view) {
    return (
      <Panel className="h-40" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">Modeling news intel…</span>
      </Panel>
    );
  }

  const readTone: Tone = view.narrativeLean > 0.1 ? 'bull' : view.narrativeLean < -0.1 ? 'bear' : 'neutral';

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-widest holo-text">
          <Newspaper className="w-3.5 h-3.5" /> News Intel · {view.ticker}
        </h2>
        <span className="font-mono text-[10px] text-textSecondary uppercase tracking-wider">half-life · catalyst similarity · positioning</span>
      </div>

      <MetricGrid min="180px">
        <StatCard
          label="Priced in"
          value={`${view.aggPricedInPct}%`}
          sub="of the expected move discounted"
          tone={pricedInTone(view.aggPricedInPct)}
          emphasis
        />
        <StatCard
          label="Wire vs book"
          value={view.netAgreement}
          sub={`${view.agreementScore >= 0 ? '+' : ''}${view.agreementScore} lean gap`}
          tone={agreeTone[view.netAgreement]}
        />
        <StatCard label="Median half-life" value={view.medianHalfLifeLabel} sub="catalyst decay window" tone="neutral" />
        <StatCard label="Event vol" value={`±${view.eventVolPct.toFixed(1)}%`} sub="implied event move" tone="select" />
        <StatCard
          label="Live catalysts"
          value={`${view.nameCount}`}
          sub={view.hasNameHeadlines ? `${view.dominantCategory} dominant · +${view.macroCount} macro` : `macro only · ${view.macroCount} items`}
          tone="neutral"
        />
      </MetricGrid>

      <Panel tone={readTone} bodyClassName="py-3.5" emphasis>
        <p className="text-[15px] text-textPrimary leading-relaxed">
          <span className={`font-mono text-[10px] font-semibold uppercase tracking-widest mr-2.5 ${readTone === 'bull' ? 'text-bull' : readTone === 'bear' ? 'text-bear' : 'holo-text'}`}>
            The read
          </span>
          {view.headline}
        </p>
        <p className="mt-2 text-xs text-textSecondary leading-relaxed">{view.note}</p>
      </Panel>

      {view.headlines.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          {view.headlines.map(h => (
            <HeadlineCard key={h.id} h={h} positioningLean={view.positioningLean} positioningLabel={view.positioningLabel} />
          ))}
        </div>
      ) : (
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5" /> Positioning-only read
            </span>
          }
          subtitle="no live catalyst"
        >
          <p className="text-xs text-textSecondary leading-relaxed">
            No headline is moving {view.ticker} right now. Options are positioned{' '}
            <span className="holo-text font-mono">{view.positioningLabel}</span> with nothing on the wire behind it — the per-headline
            intelligence populates the moment a catalyst prints.
          </p>
        </Panel>
      )}

      <Panel bodyClassName="py-3">
        <p className="text-xs text-textSecondary leading-relaxed">
          <span className="font-mono font-semibold uppercase tracking-wider mr-2 holo-text">Beyond the headline</span>
          A headline tells you what happened; this reads what it usually <em>means</em>. Each catalyst gets a half-life (how long its
          type keeps moving price), a catalyst-similarity search against past analogs and how they resolved, an informational-vs-mechanical
          call, an implied event move, and a priced-in score — then it checks the options book: does positioning
          <Gauge className="inline w-3 h-3 mx-0.5 -mt-0.5" /> confirm the wire, or fade it? The feed and the direction/expected-move come from
          the news model; positioning is read off the live chain. Half-lives, analog base rates and event vols are modeled per catalyst type
          and swap for a real event-study feed behind the same contract — nothing here is a live exchange print.
        </p>
      </Panel>
    </section>
  );
};

export default NewsIntel;
