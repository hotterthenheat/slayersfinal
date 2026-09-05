/*
==================================================
  SLAYER TERMINAL - VOL REGIME (pinpoint/VolRegime)
  Part 14 · the regime board.
==================================================

  THE PAGE IS ORGANISED AROUND WHAT IS MEASURABLE, not around the five
  things the checklist listed, because those five do not all exist here and
  arranging them as equals would be the lie. data/volRegime.ts carries the
  measurements that decided this; the short version:

    the active name's read, in full        — implied, realized, the premium
    the 52-week IV rank                    — ABSENT, with the reason
    the roster, ranked by implied          — real, cross-sectional
    the term slope                         — shown, explicitly not voting

  ONE NAME IS THE SUBJECT AND THE ROSTER IS CONTEXT. A board of 22 rows
  answers "who is expensive today"; it does not answer "what is the market
  I am about to trade doing", which is the question a reader arrives with.
  So the active ticker gets the top of the page and the rest is the field
  it is being read against.
*/

import { useMemo } from 'react';
import { Info } from 'lucide-react';
import Panel from '../../components/ui/Panel';
import DataState from '../../components/ui/DataState';
import StatCard from '../../components/ui/StatCard';
import SignalBadge from '../../components/ui/SignalBadge';
import type { Tone } from '../../components/ui/tones';
import { useMarketData } from '../../context/MarketDataContext';
import {
  IV_RANK_UNAVAILABLE,
  RR_DELTA,
  RV_WINDOWS,
  VERDICT_WORDS,
  buildVolRegime,
  regimeAllows,
  regimeGateNote,
  type RegimeVerdict,
} from '../../data/volRegime';

const READ_DTE = 30;

const VERDICT_TONE: Record<RegimeVerdict, Tone> = {
  quiet: 'bull',
  ordinary: 'neutral',
  strained: 'warn',
  unknown: 'neutral',
};

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const pts = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(2)}`;

const VolRegime = () => {
  const { activeTicker } = useMarketData();

  /* Recomputed only when the active name changes. The inputs are the
     roster's day-stable quotes and a candle history that grows one bar a
     minute; recomputing per tick would redraw 22 rows to move nothing. */
  const rows = useMemo(() => buildVolRegime(activeTicker, READ_DTE), [activeTicker]);
  const me = rows.find(r => r.ticker === activeTicker) ?? rows[0];

  if (!me) {
    return (
      <Panel className="w-full">
        <DataState kind="loading" title="Reading the roster" body="The first quote has not arrived yet." />
      </Panel>
    );
  }

  const words = VERDICT_WORDS[me.verdict];
  const ranked = [...rows].sort((a, b) => b.iv - a.iv);

  return (
    <div className="flex flex-col gap-4">
      {/* ---- the active name ------------------------------------------- */}
      <Panel
        title={`${me.ticker} · volatility regime`}
        subtitle={`${READ_DTE}-day tenor · implied against realized`}
        actions={<SignalBadge tone={VERDICT_TONE[me.verdict]}>{words.label}</SignalBadge>}
        className="w-full"
      >
        <div className="flex flex-col gap-4">
          <p className="text-[12px] text-textSecondary leading-relaxed max-w-[70ch]">{words.note}</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label={`Implied · ${READ_DTE}d`} value={pct(me.iv)} sub="at the money" />
            <StatCard
              label="Realized · 20d"
              value={me.rv[20] === null ? '—' : pct(me.rv[20])}
              sub={me.rv[20] === null ? 'no session history yet' : 'close to close, annualised'}
            />
            <StatCard
              label="Premium"
              value={me.premium === null ? '—' : `${pts(me.premium)} pts`}
              sub={me.premium === null ? 'needs realized' : 'implied minus realized'}
              tone={me.premium === null ? 'neutral' : me.premium > 0 ? 'bull' : 'warn'}
            />
            <StatCard
              label={`${RR_DELTA * 100}Δ risk reversal`}
              value={`${pts(me.rr)} pts`}
              sub="put wing over call wing"
            />
          </div>

          {/* Realized across the three windows — one number is a point, three
              are a direction, and the direction is what says whether the tape
              is speeding up or settling down. */}
          <div className="border border-borderSubtle rounded-md px-3 py-2.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Realized vol by window</span>
            <div className="mt-2 flex items-end gap-6">
              {RV_WINDOWS.map(w => (
                <div key={w}>
                  <span className="block font-mono text-[10px] text-textMuted tnum">{w}d</span>
                  <span className="block font-mono text-[14px] font-bold text-textPrimary tnum">
                    {me.rv[w] === null ? '—' : pct(me.rv[w])}
                  </span>
                </div>
              ))}
              {me.rv[20] === null && (
                <span className="text-[11px] text-textMuted leading-snug max-w-[40ch]">
                  This name has no seeded session history — the desk seeds a book the first time it is opened, one at
                  a time, rather than simulating the whole roster at load.
                </span>
              )}
            </div>
          </div>

          {/* The Compass hook the checklist asks for, stated rather than hidden. */}
          <div className="flex items-start gap-2 border-t border-borderSubtle pt-3">
            <Info size={13} className="mt-[2px] shrink-0 text-textMuted" aria-hidden />
            <p className="text-[11px] text-textSecondary leading-relaxed max-w-[74ch]">
              <span className="font-semibold text-textPrimary">
                Compass eligibility: {regimeAllows(me.verdict) ? 'open' : 'held'}.
              </span>{' '}
              {regimeGateNote(me.verdict)}
            </p>
          </div>
        </div>
      </Panel>

      {/* ---- the rank that does not exist -------------------------------- */}
      <Panel title="IV rank · 52 weeks" subtitle="what a year of implied levels would say" className="w-full">
        <DataState kind="unavailable" title="No implied history to rank against" body={IV_RANK_UNAVAILABLE} pad="sm" />
        <div className="mt-2 border-t border-borderSubtle pt-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">
            What can be answered instead
          </span>
          <p className="mt-1.5 text-[12px] text-textSecondary leading-relaxed max-w-[70ch]">
            {me.ticker}&rsquo;s {READ_DTE}-day implied sits at the{' '}
            <span className="font-mono font-bold text-textPrimary tnum">{me.crossSectionalIvPct.toFixed(0)}</span>
            <sup>th</sup> percentile <span className="text-textPrimary">of the roster today</span> — richer than{' '}
            {rows.filter(r => r.iv < me.iv).length} of the other {rows.length - 1} names. That is a comparison across
            names, not across time; it says nothing about whether this name is expensive by its own standards.
          </p>
        </div>
      </Panel>

      {/* ---- the roster --------------------------------------------------- */}
      <Panel
        title="The roster, by implied"
        subtitle={`${rows.length} names · ${READ_DTE}-day at the money`}
        className="w-full"
        flush
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-borderSubtle">
                {['Name', 'Implied', 'Realized 20d', 'Premium', `${RR_DELTA * 100}Δ RR`, 'Read'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-textMuted ${
                      i === 0 ? 'text-left' : 'text-right'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map(r => (
                <tr
                  key={r.ticker}
                  className={`border-b border-borderSubtle/50 ${r.ticker === me.ticker ? 'bg-select/[0.05]' : ''}`}
                >
                  <td className="px-3 py-1.5 font-mono text-[12px] font-bold text-textPrimary">{r.ticker}</td>
                  <td className="px-3 py-1.5 text-right font-mono tnum text-textPrimary">{pct(r.iv)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tnum text-textSecondary">
                    {r.rv[20] === null ? <span className="text-textMuted">—</span> : pct(r.rv[20])}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right font-mono tnum ${
                      r.premium === null ? 'text-textMuted' : r.premium > 0 ? 'text-bull' : 'text-warn'
                    }`}
                  >
                    {r.premium === null ? '—' : `${pts(r.premium)}`}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tnum text-textSecondary">{pts(r.rr)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <span
                      className={`font-mono text-[10px] uppercase tracking-wider ${
                        r.verdict === 'unknown' ? 'text-textMuted' : 'text-textSecondary'
                      }`}
                    >
                      {VERDICT_WORDS[r.verdict].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ---- the term slope, and why it is not a verdict ------------------ */}
      <Panel title="Term slope" subtitle="front tenor over back" className="w-full">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <span className="block font-mono text-[10px] uppercase tracking-widest text-textMuted">1d / 60d</span>
            <span className="block font-mono text-[18px] font-bold text-textPrimary tnum">{me.slope.toFixed(4)}</span>
          </div>
          <p className="min-w-0 flex-1 text-[11px] text-textMuted leading-relaxed max-w-[62ch]">
            The front tenor trades over the back on every name here by the same factor — the desk&rsquo;s smile lifts
            the front end as a function of time to expiry alone, with no name in it. The number is true and worth
            having beside the tenors; it is deliberately not turned into a contango or backwardation call, because a
            chip that reads identically on all {rows.length} names is decoration rather than a read.
          </p>
        </div>
      </Panel>
    </div>
  );
};

export default VolRegime;
