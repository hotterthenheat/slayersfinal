import { useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { overnightFor, quoteFor } from '../data/futures';
import { overnightRiskRead, readCrossAssets, type CrossAssetRead } from '../data/crossAsset';
import { macroCards, nextEvent, pastRecord, type MacroDetail } from '../data/macroDetail';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import StatCard from '../components/ui/StatCard';
import MetricGrid from '../components/ui/MetricGrid';
import ProvenanceChip from '../components/ui/ProvenanceChip';
import DataState from '../components/ui/DataState';
import Modal from '../components/ui/Modal';
import { SPOT as INK } from '../components/gex/palette';

/*
==================================================
  SLAYER TERMINAL - MACRO & CROSS-ASSET
  (pages/MacroDesk.tsx)
==================================================

  §14 and §16 on one desk, because they answer the same question in two
  timeframes: what decided the open, and what is about to.

  THE STRIP IS FOUR INSTRUMENTS, WORDED FOR EQUITIES. A reader should not
  have to remember that a rising yen pair is risk-on and a rising gold is
  risk-off — the card says RISK-ON or RISK-OFF directly, and the verdict
  above them needs a MAJORITY before it will call a side. Two against two
  reads MIXED, because that is what it is.

  A FUTURE EVENT SHOWS ITS CONSENSUS AND NOTHING ELSE. No actual, no
  surprise, no reaction — those are drawn as em-dashes, never as zeros. A
  zero surprise reads as "came in exactly on target", which is a different
  and much stronger claim than "has not happened yet".

  THE SURPRISE IS THE HEADLINE ON A PAST CARD, not the print: a CPI of 3.1%
  means nothing on its own, and 3.1% against a 2.9% consensus is the whole
  trade. The raw figures sit underneath it.
*/

const fmtNum = (v: number, unit: string) => (unit === 'k jobs' ? `${v}k` : `${v}${unit}`);

/** One instrument's overnight path — the same axis as the futures session. */
const Spark = ({ read }: { read: CrossAssetRead }) => {
  const vals = read.bars.map(b => b.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pts = read.bars.map(b => `${b.min},${30 - ((b.value - lo) / span) * 30}`).join(' ');
  return (
    <svg viewBox="0 0 930 30" preserveAspectRatio="none" className="w-full h-8 mt-1" aria-hidden>
      <polyline fill="none" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" points={pts} opacity="0.75" />
    </svg>
  );
};

const MacroDesk = () => {
  const now = useMemo(() => new Date(), []);
  const dateIso = now.toISOString().slice(0, 10);
  const [open, setOpen] = useState<MacroDetail | null>(null);

  const quote = useMemo(() => quoteFor('ES', now), [now]);
  const session = useMemo(
    () => (quote ? overnightFor('ES', dateIso, quote.settlement) : null),
    [quote?.settlement, dateIso]
  );
  const reads = useMemo(
    () => (session ? readCrossAssets(dateIso, session.bars) : []),
    [session, dateIso]
  );
  const verdict = useMemo(() => overnightRiskRead(reads), [reads]);
  const cards = useMemo(() => macroCards(now), [now]);
  const next = nextEvent(cards);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={['Terminal', 'Macro']}
        title="Macro & Cross-Asset"
        subtitle="What decided the open overnight, and what is about to"
      />

      {/* §14 — the cross-asset strip */}
      <Panel
        title="Overnight risk"
        subtitle="USD/JPY · EUR/USD · BTC · Gold — 18:00 ET to the open"
        className="w-full"
        actions={<ProvenanceChip sources={['candles']} note="Cross-asset paths are modelled on the same overnight axis as the futures session." />}
      >
        {reads.length === 0 ? (
          <DataState kind="loading" title="Building the overnight" body="Waiting for the futures session to anchor the cross-asset paths." />
        ) : (
          <div className="flex flex-col gap-3">
            <StatCard
              label="The overnight read"
              value={verdict.verdict}
              sub={verdict.detail}
              tone={verdict.tone}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {reads.map(r => (
                <div key={r.spec.key} className="border border-borderSubtle rounded-md p-3 bg-inset/40">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">{r.spec.label}</span>
                    <span className={`font-mono text-[9px] uppercase tracking-wider ${
                      r.risk === 'RISK-ON' ? 'text-bull' : r.risk === 'RISK-OFF' ? 'text-bear' : 'text-textMuted'
                    }`}>{r.risk}</span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-mono text-[15px] text-textPrimary tnum">
                      {r.last.toLocaleString(undefined, { minimumFractionDigits: r.spec.decimals, maximumFractionDigits: r.spec.decimals })}
                    </span>
                    <span className={`font-mono text-[11px] ${r.changePct >= 0 ? 'text-bull' : 'text-bear'}`}>
                      {r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%
                    </span>
                  </div>
                  <Spark read={r} />
                  <p className="text-[10px] text-textMuted leading-snug mt-1">{r.spec.role}</p>
                  <p className="font-mono text-[9px] text-textMuted mt-1">
                    ρ vs ES {r.corr >= 0 ? '+' : ''}{r.corr.toFixed(2)} · over {r.samples} bars
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* §16 — the economic calendar */}
      <Panel
        title="Economic calendar"
        subtitle={next ? `Next: ${next.label} in ${next.daysOut}d` : 'Nothing scheduled in the window'}
        className="w-full"
        actions={<ProvenanceChip sources={['macro']} note="FOMC dates are the published calendar; CPI is approximated until a calendar feed lands." />}
      >
        {cards.length === 0 ? (
          <DataState kind="empty" title="No events in this window" body="The calendar reaches 45 days either side of today." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {cards.map(c => {
              const rec = pastRecord(cards, c.kind);
              return (
                <button
                  key={`${c.iso}-${c.kind}`}
                  onClick={() => setOpen(c)}
                  className={`text-left border rounded-md p-3 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-select ${
                    c.past ? 'border-borderSubtle bg-inset/30 hover:bg-white/[0.03]' : 'border-borderSubtle/70 bg-inset/60 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-textPrimary">{c.label}</span>
                    <span className={`font-mono text-[9px] uppercase tracking-wider ${c.past ? 'text-textMuted' : 'text-select'}`}>
                      {c.past ? `${Math.abs(c.daysOut)}d ago` : c.daysOut === 0 ? 'today' : `in ${c.daysOut}d`}
                    </span>
                  </div>
                  <p className="text-[10px] text-textMuted mt-0.5">{c.blurb}</p>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div>
                      <div className="font-mono text-[9px] uppercase tracking-wider text-textMuted">Consensus</div>
                      <div className="font-mono text-[12px] text-textSecondary tnum">{fmtNum(c.consensus, c.unit)}</div>
                    </div>
                    <div>
                      <div className="font-mono text-[9px] uppercase tracking-wider text-textMuted">Actual</div>
                      <div className="font-mono text-[12px] text-textPrimary tnum">
                        {c.actual === null ? <span className="text-textMuted">—</span> : fmtNum(c.actual, c.unit)}
                      </div>
                    </div>
                    <div>
                      <div className="font-mono text-[9px] uppercase tracking-wider text-textMuted">Surprise</div>
                      <div className={`font-mono text-[12px] tnum ${
                        c.surprise === null ? 'text-textMuted' : c.surprise > 0 ? 'text-warn' : c.surprise < 0 ? 'text-flip' : 'text-textSecondary'
                      }`}>
                        {c.surprise === null ? '—' : `${c.surprise > 0 ? '+' : ''}${fmtNum(c.surprise, c.unit)}`}
                      </div>
                    </div>
                  </div>
                  {c.reaction !== null && (
                    <p className="font-mono text-[10px] mt-2 text-textMuted">
                      SPX in the hour after:{' '}
                      <span className={c.reaction >= 0 ? 'text-bull' : 'text-bear'}>
                        {c.reaction >= 0 ? '+' : ''}{c.reaction.toFixed(2)}%
                      </span>
                      {rec.avgReaction !== null && <span className="text-textMuted"> · {c.kind} average {rec.avgReaction >= 0 ? '+' : ''}{rec.avgReaction}%</span>}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      {/* The event drawer */}
      {open && (
        <Modal open onClose={() => setOpen(null)} ariaLabel={`${open.label} detail`} header={open.label}>
          <div className="flex flex-col gap-3 min-w-[320px]">
            <div className="flex items-center gap-2 text-textMuted">
              <CalendarClock size={14} />
              <span className="font-mono text-[11px]">{open.iso} · {open.past ? `${Math.abs(open.daysOut)} days ago` : `in ${open.daysOut} days`}</span>
            </div>
            <p className="text-[12px] text-textSecondary leading-snug">{open.blurb}</p>
            <MetricGrid min="130px">
              <StatCard label="Consensus" value={fmtNum(open.consensus, open.unit)} sub="what the street expected" />
              <StatCard
                label="Actual"
                value={open.actual === null ? '—' : fmtNum(open.actual, open.unit)}
                sub={open.actual === null ? 'has not been released' : 'what printed'}
              />
              <StatCard
                label="Surprise"
                value={open.surprise === null ? '—' : `${open.surprise > 0 ? '+' : ''}${fmtNum(open.surprise, open.unit)}`}
                sub={open.surprise === null ? 'nothing to compare yet' : open.surprise > 0 ? 'hotter than expected' : open.surprise < 0 ? 'cooler than expected' : 'exactly on target'}
                tone={open.surprise === null ? 'neutral' : open.surprise > 0 ? 'warn' : 'neutral'}
              />
              <StatCard
                label="SPX reaction"
                value={open.reaction === null ? '—' : `${open.reaction >= 0 ? '+' : ''}${open.reaction.toFixed(2)}%`}
                sub={open.reaction === null ? 'the session has not happened' : 'in the hour after the print'}
                tone={open.reaction === null ? 'neutral' : open.reaction >= 0 ? 'bull' : 'bear'}
              />
            </MetricGrid>
            {(() => {
              const rec = pastRecord(cards, open.kind);
              const n = rec.hot + rec.cold + rec.inline;
              return n > 0 ? (
                <p className="text-[11px] text-textMuted leading-snug border-t border-borderSubtle pt-3">
                  Across {n} past {open.kind} print{n === 1 ? '' : 's'} in this window: {rec.hot} hot, {rec.cold} cool, {rec.inline} on target
                  {rec.avgReaction !== null && <> — SPX averaged {rec.avgReaction >= 0 ? '+' : ''}{rec.avgReaction}% after them.</>}
                </p>
              ) : (
                <p className="text-[11px] text-textMuted border-t border-borderSubtle pt-3">
                  No past {open.kind} prints in this window to compare against.
                </p>
              );
            })()}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default MacroDesk;
