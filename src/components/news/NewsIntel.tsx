import { useMemo } from 'react';
import { Radar } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import {
  buildNewsIntel,
  type CatalystNature,
  type HeadlineIntel,
  type NewsIntelView,
  type PositioningAgreement,
} from '../../data/newsintel';
import type { NewsCategory, NewsItem } from '../../data/news';
import SignalBadge from '../ui/SignalBadge';
import Stat from '../ui/Stat';
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
        <span className="font-mono text-label uppercase tracking-wider text-textMuted">{label}</span>
        <span className={`font-mono text-label uppercase tracking-wider ${wordClass}`}>{word}</span>
      </div>
      <div className="relative mt-1 h-1.5 rounded-full bg-white/[0.06]">
        <span className="absolute top-0 bottom-0 left-1/2 w-px bg-white/25" aria-hidden />
        <span className="absolute top-0 bottom-0 rounded-full holo-bar" style={{ left: `${left}%`, width: `${w}%` }} />
      </div>
    </div>
  );
};

/** One analog event row: match strength · when · how it resolved. */
const AnalogRow = ({ a }: { a: HeadlineIntel['analogs'][number] }) => (
  <div className="flex items-center gap-2 py-1.5">
    <span className="w-8 shrink-0 font-mono text-caption font-semibold text-textPrimary tnum text-right">{a.similarityPct}</span>
    <span className="w-14 shrink-0 font-mono text-micro text-textMuted">{a.when}</span>
    <span className="flex-1 min-w-0 truncate text-label text-textSecondary leading-snug">{a.descriptor}</span>
    <span className={`w-12 shrink-0 text-right font-mono text-label font-semibold tnum ${a.outcome1dPct >= 0 ? 'text-bull' : 'text-bear'}`}>
      {signed1(a.outcome1dPct)}%
    </span>
    <SignalBadge tone={a.followThrough ? 'bull' : 'neutral'}>{a.followThrough ? 'held' : 'faded'}</SignalBadge>
  </div>
);

/** Full per-headline breakdown, laid out for the narrow right column. */
const DeepBreakdown = ({ h, positioningLean, positioningLabel }: { h: HeadlineIntel; positioningLean: number; positioningLabel: string }) => {
  const sentTone = sentimentTone(h.sentiment);
  const piTone = pricedInTone(h.pricedInPct);
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2 flex-wrap">
        <SignalBadge tone={catTone[h.category]}>{h.category}</SignalBadge>
        <span className="font-mono text-label text-textMuted tnum">seen {h.time}</span>
        <span className={`ml-auto font-mono text-label font-semibold tnum ${h.expMove1dPct >= 0 ? 'text-bull' : 'text-bear'}`}>
          {signed1(h.expMove1dPct)}% exp
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Half-life" value={h.halfLifeLabel} sub={`${h.category.toLowerCase()} decay`} />
        <Stat label="Priced in" value={`${h.pricedInPct}%`} tone={piTone} sub="already discounted" />
        <Stat label="Event vol" value={`±${h.eventVolPct.toFixed(1)}%`} tone="select" sub="implied move" />
        <Stat label="Prob up" value={`${h.probUpPct}%`} tone={sentTone} sub="model, next session" />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-label uppercase tracking-wider text-textMuted">Priced-in progress</span>
          <span className={`font-mono text-label font-semibold tnum ${toneText[piTone]}`}>{h.pricedInPct}%</span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <span className="block h-full rounded-full holo-bar" style={{ width: `${h.pricedInPct}%` }} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-label uppercase tracking-widest text-textMuted">Narrative vs positioning</span>
          <SignalBadge tone={agreeTone[h.agreement]} dot>{h.agreement}</SignalBadge>
        </div>
        <DivergingRow label="Wire lean" value={Math.tanh(h.sentiment * 1.8)} word={sentimentWord(h.sentiment)} wordClass={toneText[sentTone]} />
        <DivergingRow label="Book" value={positioningLean} word={positioningLabel} wordClass="holo-text" />
        <p className="text-label text-textSecondary leading-snug">{h.agreementNote}</p>
      </div>

      <div className="border-t border-borderSubtle pt-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="inline-flex items-center gap-1.5 font-mono text-label uppercase tracking-widest text-textMuted">
            <Radar className="w-3 h-3" /> Closest analogs
          </span>
          <span className="font-mono text-micro text-textMuted uppercase tracking-wider">sim · when · 1d</span>
        </div>
        <div className="flex flex-col divide-y divide-borderSubtle">
          {h.analogs.map((a, i) => (
            <AnalogRow key={i} a={a} />
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2">
        <SignalBadge tone={natureTone[h.nature]}>{h.nature}</SignalBadge>
        <span className="text-label text-textSecondary leading-snug">{h.natureNote}</span>
      </div>

      <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
        <div className="font-mono text-label uppercase tracking-widest text-textMuted">Invalidation</div>
        <p className="mt-1 text-label text-textSecondary leading-snug">{h.invalidation}</p>
      </div>
    </div>
  );
};

/** Shown when the selected wire item is outside the terminal's covered chain. */
const NoBreakdown = ({ view, selectedItem, onSelect }: { view: NewsIntelView; selectedItem: NewsItem | null; onSelect?: (id: string) => void }) => (
  <div className="flex flex-col gap-3">
    <p className="text-caption text-textSecondary leading-relaxed">
      No positioning breakdown for{' '}
      {selectedItem?.ticker ? <span className="font-mono text-textPrimary">{selectedItem.ticker}</span> : 'this macro print'} yet — the deep
      read needs the live options chain, which the terminal keeps for the active name{' '}
      <span className="font-mono holo-text">{view.ticker}</span> and the macro tape. Open a covered catalyst:
    </p>
    {view.headlines.length > 0 ? (
      <div className="flex flex-wrap gap-1.5">
        {view.headlines.map(h => (
          <button
            key={h.id}
            onClick={() => onSelect?.(h.id)}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-borderSubtle bg-white/[0.02] hover:border-borderMuted hover:bg-white/[0.04] transition-colors"
          >
            <span className="font-mono text-label font-semibold text-textPrimary">{h.scope === 'MACRO' ? 'Macro' : h.ticker}</span>
            <SignalBadge tone={catTone[h.category]}>{h.category}</SignalBadge>
            <span className={`font-mono text-label font-semibold tnum ${h.expMove1dPct >= 0 ? 'text-bull' : 'text-bear'}`}>{signed1(h.expMove1dPct)}%</span>
          </button>
        ))}
      </div>
    ) : (
      <span className="font-mono text-label text-textMuted">No live catalyst on {view.ticker} today — positioning reads {view.positioningLabel}.</span>
    )}
  </div>
);

interface NewsIntelProps {
  /** The wire headline currently selected on the page. */
  selectedItem: NewsItem | null;
  /** Jump to another headline (chips for headlines that carry a deep read). */
  onSelect?: (id: string) => void;
}

/**
 * Positioning-aware deep read, embedded inside the selected-headline panel.
 * When the selected wire item is one the terminal holds a live chain for
 * (the active name or the macro tape), its full per-headline breakdown shows;
 * otherwise the aggregate read plus jump-chips to covered catalysts.
 */
const NewsIntel = ({ selectedItem, onSelect }: NewsIntelProps) => {
  const { marketData } = useMarketData();
  const view = useMemo(() => (marketData ? buildNewsIntel(marketData) : null), [marketData]);

  if (!view) {
    return (
      <div className="flex items-center justify-center h-32">
        <span className="font-mono text-label text-textMuted uppercase tracking-widest">Reading positioning…</span>
      </div>
    );
  }

  const readTone: Tone = view.narrativeLean > 0.1 ? 'bull' : view.narrativeLean < -0.1 ? 'bear' : 'neutral';
  const matched = selectedItem ? view.headlines.find(h => h.id === selectedItem.id) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 font-mono text-label font-semibold uppercase tracking-widest holo-text">
          <Radar className="w-3.5 h-3.5 text-select" /> Positioning read
        </span>
        <span className="font-mono text-label font-bold text-textPrimary">{view.ticker}</span>
        <SignalBadge tone="neutral" className="ml-auto">
          {view.nameCount} live · {view.macroCount} macro
        </SignalBadge>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Priced in" value={`${view.aggPricedInPct}%`} tone={pricedInTone(view.aggPricedInPct)} sub="of move discounted" />
        <Stat
          label="Wire vs book"
          value={view.netAgreement}
          tone={agreeTone[view.netAgreement]}
          sub={`${view.agreementScore >= 0 ? '+' : ''}${view.agreementScore} lean gap`}
        />
        <Stat label="Median half-life" value={view.medianHalfLifeLabel} sub="catalyst decay" />
        <Stat label="Event vol" value={`±${view.eventVolPct.toFixed(1)}%`} tone="select" sub="implied event move" />
      </div>

      <div className={`border-l-2 pl-3 ${readTone === 'bull' ? 'border-bull/40' : readTone === 'bear' ? 'border-bear/40' : 'border-borderMuted'}`}>
        <span className={`font-mono text-label font-semibold uppercase tracking-widest ${readTone === 'bull' ? 'text-bull' : readTone === 'bear' ? 'text-bear' : 'holo-text'}`}>
          The read
        </span>
        <p className="mt-1 text-caption text-textSecondary leading-relaxed">{view.headline}</p>
      </div>

      <div className="border-t border-borderSubtle pt-3.5">
        {matched ? (
          <DeepBreakdown h={matched} positioningLean={view.positioningLean} positioningLabel={view.positioningLabel} />
        ) : (
          <NoBreakdown view={view} selectedItem={selectedItem} onSelect={onSelect} />
        )}
      </div>
    </div>
  );
};

export default NewsIntel;
