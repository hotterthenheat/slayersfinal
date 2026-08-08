import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Star, GitCompare, Info, CalendarClock, Waves, Ruler } from 'lucide-react';
import DetailModal from '../components/ui/DetailModal';
import { useExpandPreference } from '../hooks/useExpandPreference';
import SignalBadge from '../components/ui/SignalBadge';
import SegmentedControl from '../components/ui/SegmentedControl';
import EmptyState from '../components/ui/EmptyState';
import Stat from '../components/ui/Stat';
import TickerJump from '../components/ui/TickerJump';
import Sparkline from '../components/compass/Sparkline';
import Simulator from '../core/simulator';
import { buildDarkPoolFeed } from '../data/darkpoolfeed';
import { buildEarningsCalendar, type EarningsEvent } from '../data/earnings';
import { FACTOR_GUIDE } from '../data/factorGuide';
import { fmtUsd } from '../data/gex';
import { buildFlowAlerts, buildPulseFlow } from '../data/pulseflow';
import { VERDICT_LABEL, VERDICT_TONE, scoreBand, type ScoreBand, type SectorRow, type StockPick } from '../data/stocks';
import { buildSwingModel } from '../data/swingModel';
import { toneText, type Tone } from '../components/ui/tones';

// A sleeve score is a magnitude, so the fill is `data-bar`; only the weak band
// takes a tone, because a sub-40 sleeve is the one reading that argues against
// the trade. Bands come from the engine so the board cannot disagree with this.
const BAND_FILL: Record<ScoreBand, string> = { strong: 'data-bar', mid: 'bg-white/30', weak: 'bg-bear/70' };
const BAND_TEXT: Record<ScoreBand, string> = { strong: 'text-textPrimary', mid: 'text-textSecondary', weak: 'text-bear' };

const signed = (v: number, dp = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(dp)}%`;
/** −1…+1 engine leans, restated on a −100…+100 index. Never a percent: nothing
    about a revision or flow lean is a fraction of anything. */
const leanIdx = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}`;
const moveTone = (v: number): Tone => (v > 0 ? 'bull' : v < 0 ? 'bear' : 'neutral');
const TABS = [
  { value: 'READ', label: 'Read' },
  { value: 'EARNINGS', label: 'Earnings' },
  { value: 'FLOW', label: 'Flow' },
  { value: 'LEVELS', label: 'Levels' },
] as const;
type DrawerTab = (typeof TABS)[number]['value'];

/** Section heading with an optional right-hand count/unit. */
const Section = ({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) => (
  <section className="flex flex-col gap-1.5">
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="font-mono text-label uppercase tracking-widest text-textSecondary">{title}</h3>
      {sub != null && <span className="font-mono text-micro text-textMuted tnum">{sub}</span>}
    </div>
    {children}
  </section>
);

const KV = ({ k, v, tone = 'neutral' }: { k: string; v: ReactNode; tone?: Tone }) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="font-mono text-label text-textMuted">{k}</span>
    <span className={`font-mono text-caption tnum ${toneText[tone]}`}>{v}</span>
  </div>
);

/** Full-width factor bar with a definition line — the drawer's richer sleeve. */
const FactorRow = ({ v, name, desc }: { v: number; name: string; desc: string }) => {
  const band = scoreBand(v);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-caption font-semibold text-textPrimary">{name}</span>
        <span className={`font-mono text-caption font-semibold tnum ${BAND_TEXT[band]}`}>{v}</span>
      </div>
      <span className="h-[5px] rounded-full bg-white/[0.06] overflow-hidden">
        <span className={`block h-full rounded-full ${BAND_FILL[band]}`} style={{ width: `${v}%` }} />
      </span>
      <span className="text-label text-textMuted leading-snug">{desc}</span>
    </div>
  );
};

/** The reporting record earnings.ts already models for this name. The verdict
    word is deliberately absent: the earnings desk owns that lexicon, and a
    second copy of it here is how two screens end up calling one state two
    different things. The observations below are what the verdict is made of.

    The record itself is generated — earnings.ts measures both the average
    reaction and the beat rate over the eight reports it models for the name —
    so the labels say so. "Avg of last 8" over a figure nothing had counted was
    the same claim about evidence that news.ts had to take out of its base
    rates. */
const EarningsBlock = ({ e }: { e: EarningsEvent }) => (
  <div className="flex flex-col gap-3">
    <div className="grid grid-cols-4 gap-1.5">
      <Stat label="Reports" value={e.dateLabel} sub={e.slot} />
      <Stat label="Sessions out" value={e.daysOut} sub={e.daysOut === 0 ? 'today' : 'until the print'} />
      <Stat label="Implied" value={`${e.impliedMovePct.toFixed(1)}%`} sub="straddle move" />
      <Stat label="Modeled avg" value={`${e.histAvgMovePct.toFixed(1)}%`} sub="8 modeled reports" />
    </div>
    <div className="inst-surface rounded-md px-3 py-2.5 flex flex-col gap-1">
      <KV
        k="Richness (implied ÷ modeled avg)"
        v={`${e.richness.toFixed(2)}×`}
        tone={e.richness >= 1.3 ? 'warn' : e.richness <= 0.9 ? 'select' : 'neutral'}
      />
      <KV k="Cleared consensus, those 8 reports" v={`${e.beatRate8q}%`} />
      <KV k="Estimate drift into the print" v={leanIdx(e.revisionTrend)} tone={moveTone(e.revisionTrend)} />
      <KV k="IV rank" v={`${e.ivRank}%`} />
      <KV k="Setup quality" v={e.technicalScore} />
      <KV k="Options lean" v={leanIdx(e.flowLean)} tone={moveTone(e.flowLean)} />
      <p className="mt-1 text-micro text-textMuted leading-snug">
        Drift and lean are engine indices on a −100 to +100 scale, not percentages. The average and the beat rate are measured
        over the eight reports this model generates for the name — no market history stands behind them.
      </p>
    </div>
    <div className="flex flex-col gap-1.5">
      {/* `strategy` names the structure the mispricing describes. It reads
          observationally because earnings.ts authors it that way; the earnings
          board dropped this field when it was still written as an order, which
          left the drawer rendering the instruction nobody had looked at. */}
      <p className="text-data text-textPrimary leading-snug inst-surface rounded-md px-3 py-2.5">
        <span className="font-mono text-label uppercase tracking-wider text-textMuted">Structure </span>
        {e.strategy}
      </p>
      <p className="text-label text-textMuted leading-snug">{e.rationale}</p>
    </div>
  </div>
);

interface StockDetailModalProps {
  pick: StockPick | null;
  onClose: () => void;
  isWatched: boolean;
  onToggleWatch: (ticker: string) => void;
  inCompare: boolean;
  onToggleCompare: (ticker: string) => void;
  /** Reference beta from the shared universe, shown as a risk/size lens */
  beta?: number;
  /** The name's own group from the same rotation board the page renders */
  sectorRow?: SectorRow | null;
  /** Standing inside that group, by composite */
  sectorRank?: { rank: number; of: number } | null;
}

/**
 * Right-hand deep view for one name. It used to render the StockPick and
 * nothing else — four sleeve bars and one generated sentence — which is why the
 * board's reasoning read as single-sourced.
 *
 * Every tab here is a different ENGINE answering for the same ticker: the wire
 * and its outcome model (data/news.ts), the reporting record (data/earnings.ts),
 * the off-exchange tape (data/darkpoolfeed.ts) and session option prints
 * (data/pulseflow.ts), the swing model (data/swingModel.ts) and the dealer book
 * (core/simulator.ts via data/gex.ts). Nothing is composed for the drawer; if a
 * module has nothing for this name the tab says so rather than filling the space.
 *
 * The book tabs are gated on their tab because the first buildSnapshot for a
 * name seeds a month of candles (~90ms). Everything else is cheap enough to
 * build the moment a row is clicked.
 */
const StockDetailModal = ({
  pick,
  onClose,
  isWatched,
  onToggleWatch,
  inCompare,
  onToggleCompare,
  beta,
  sectorRow = null,
  sectorRank = null,
}: StockDetailModalProps) => {
  const [tab, setTab] = useState<DrawerTab>('READ');
  // Held here rather than inside the modal because expanding this drilldown
  // means BUILDING more — the dark-pool read, the options book and the swing
  // model are memos below, above the point a render prop could reach.
  const [expanded, toggleExpanded] = useExpandPreference();
  const ticker = pick?.ticker ?? null;
  const price = pick?.price ?? 0;

  useEffect(() => {
    setTab('READ');
  }, [ticker]);

  // Both are whole-board builds. They stay eager because they are cheap and the
  // empty states quote their own sizes, so the copy can never state a count the
  // engine has since changed.
  const calendar = useMemo(() => (ticker ? buildEarningsCalendar() : []), [ticker]);
  const earnings = calendar.find(e => e.ticker === ticker) ?? null;

  // Expanded is the whole record at once, so everything is wanted. Collapsed
  // still builds only what the open tab needs — the dark-pool sweep and the
  // options book are not free.
  const wantsFlow = tab === 'FLOW' || expanded;
  const wantsBook = tab === 'FLOW' || tab === 'LEVELS' || expanded;

  // The feed is sector-grouped and ordered by notional, so the row's position
  // in its group IS its off-exchange rank — no second ranking pass.
  const darkPool = useMemo(() => {
    if (!ticker || !wantsFlow) return null;
    for (const s of buildDarkPoolFeed()) {
      const idx = s.rows.findIndex(r => r.ticker === ticker);
      if (idx >= 0) return { row: s.rows[idx], rank: idx + 1, of: s.rows.length, sectorNotional: s.notional };
    }
    return null;
  }, [ticker, wantsFlow]);

  const pulse = useMemo(() => (ticker && wantsFlow ? buildPulseFlow(ticker) : null), [ticker, wantsFlow]);
  const alerts = useMemo(() => (pulse && ticker ? buildFlowAlerts(pulse, ticker) : []), [pulse, ticker]);
  const snapshot = useMemo(() => (ticker && wantsBook ? Simulator.buildSnapshot(ticker) : null), [ticker, wantsBook]);
  const chainOI = useMemo(() => {
    if (!snapshot) return null;
    const call = snapshot.chain.reduce((a, n) => a + n.callOI.value, 0);
    const put = snapshot.chain.reduce((a, n) => a + n.putOI.value, 0);
    return { call, put, ratio: call ? put / call : 0 };
  }, [snapshot]);

  const swing = useMemo(
    () => (ticker && (tab === 'LEVELS' || expanded) ? buildSwingModel(ticker, price, Math.floor(Date.now() / 1000)) : null),
    [ticker, price, tab, expanded]
  );

  const topPrints = pulse ? [...pulse.prints].sort((a, b) => b.value - a.value).slice(0, 4) : [];

  return (
    <DetailModal
      open={!!pick}
      onClose={onClose}
      ariaLabel={pick ? `${pick.ticker} detail` : 'stock detail'}
      expanded={expanded}
      onToggleExpanded={toggleExpanded}
      header={
        pick && (
          <>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lead leading-6 font-bold text-textPrimary">{pick.ticker}</span>
              <SignalBadge tone={VERDICT_TONE[pick.verdict]}>{VERDICT_LABEL[pick.verdict]}</SignalBadge>
            </div>
            <div className="mt-0.5 text-caption text-textSecondary truncate">{pick.name}</div>
            <div className="mt-0.5 font-mono text-label uppercase tracking-wider text-textMuted">
              {pick.sector}
              {sectorRank && sectorRank.rank > 0 ? ` · #${sectorRank.rank} of ${sectorRank.of}` : ''}
            </div>
            {/* Expanded shows all four sections at once, so the picker would be
                choosing between things that are all already on screen. */}
            {!expanded && (
              <div className="mt-2">
                <SegmentedControl ariaLabel="Detail section" options={TABS} value={tab} onChange={setTab} />
              </div>
            )}
          </>
        )
      }
      footer={
        pick && (
          <>
            <button
              onClick={() => onToggleWatch(pick.ticker)}
              aria-pressed={isWatched}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded border font-mono text-caption uppercase tracking-wider transition-colors ${
                isWatched
                  ? 'border-select/30 bg-select/10 text-select'
                  : 'border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary hover:border-borderMuted'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${isWatched ? 'fill-current' : ''}`} />
              {isWatched ? 'Watching' : 'Watch'}
            </button>
            <button
              onClick={() => onToggleCompare(pick.ticker)}
              aria-pressed={inCompare}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded border font-mono text-caption uppercase tracking-wider transition-colors ${
                inCompare
                  ? 'border-select/30 bg-select/10 text-select'
                  : 'border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary hover:border-borderMuted'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              {inCompare ? 'Comparing' : 'Compare'}
            </button>
            <TickerJump ticker={pick.ticker} horizon="SWINGS" />
          </>
        )
      }
    >
      {pick && (
        <div className="flex flex-col gap-4">

              {/* Price / score / risk — carried on every tab so the number the
                  reader is reasoning about never leaves the screen. */}
              <div className="grid grid-cols-4 gap-1.5">
                <Stat
                  label="Last"
                  value={`$${pick.price.toFixed(2)}`}
                  sub={signed(pick.changePct, 2)}
                  tone={moveTone(pick.changePct)}
                />
                <Stat
                  label="Composite"
                  value={pick.composite}
                  sub={VERDICT_LABEL[pick.verdict].toLowerCase()}
                  tone={pick.composite >= 68 ? 'bull' : pick.composite <= 46 ? 'bear' : 'neutral'}
                />
                <Stat
                  label="Beta"
                  value={beta != null ? beta.toFixed(2) : '—'}
                  sub={beta == null ? 'risk lens' : beta < 1 ? 'defensive' : 'cyclical'}
                />
                <Stat
                  label="Group score"
                  value={sectorRow ? sectorRow.score : '—'}
                  sub={sectorRow ? sectorRow.phase.toLowerCase() : 'no group read'}
                />
              </div>

              {(tab === 'READ' || expanded) && (

                <>
                  <Section title="30d relative strength">
                    <div className="inst-surface rounded-md px-3 py-2.5 overflow-x-auto no-scrollbar">
                      <Sparkline
                        data={pick.trend}
                        up={pick.trend[pick.trend.length - 1] >= pick.trend[0]}
                        width={480}
                        height={44}
                      />
                    </div>
                  </Section>

                  <Section title="Thesis">
                    <p className="text-data text-textSecondary leading-relaxed inst-surface rounded-md px-3 py-2.5">
                      {pick.thesis}
                    </p>
                  </Section>

                  <Section
                    title="Factor breakdown"
                    sub={
                      <span className="inline-flex items-center gap-1">
                        <Info className="w-3 h-3" /> composite {pick.composite}
                      </span>
                    }
                  >
                    <div className="flex flex-col gap-3 inst-surface rounded-md px-3 py-3">
                      {FACTOR_GUIDE.map(f => (
                        <FactorRow key={f.key} v={pick.sleeves[f.key]} name={f.name} desc={f.desc} />
                      ))}
                    </div>
                  </Section>

                  {sectorRow && (
                    <Section title="Group context" sub={`${sectorRow.memberCount} names screened`}>
                      <div className="inst-surface rounded-md px-3 py-2.5 flex flex-col gap-1">
                        <KV k="Phase" v={sectorRow.phase} />
                        <KV k="1w relative strength" v={signed(sectorRow.rs1w)} tone={moveTone(sectorRow.rs1w)} />
                        <KV k="1m relative strength" v={signed(sectorRow.rs1m)} tone={moveTone(sectorRow.rs1m)} />
                        <KV k="Members above trend" v={`${sectorRow.breadthPct}%`} />
                        <KV k="Off-exchange dollars" v={`${fmtUsd(sectorRow.offExDollars)} · ${sectorRow.dollarSharePct}% of board`} />
                        <p className="mt-1 text-label text-textMuted leading-snug">{sectorRow.note}</p>
                      </div>
                    </Section>
                  )}
                </>
              )}

              {(tab === 'EARNINGS' || expanded) && (

                <Section title="Reporting record" sub={earnings ? earnings.dateLabel : undefined}>
                  {earnings ? (
                    <EarningsBlock e={earnings} />
                  ) : (
                    <div className="inst-surface rounded-md">
                      <EmptyState
                        icon={CalendarClock}
                        title={`${pick.ticker} is not in the modelled reporting window`}
                        body={`The earnings desk models ${calendar.length} reporters in the current window. Nothing is estimated for a name outside it, so nothing is shown for one.`}
                      />
                    </div>
                  )}
                </Section>
              )}

              {(tab === 'FLOW' || expanded) && (

                <>
                  <Section title="Off-exchange tape" sub={darkPool ? `#${darkPool.rank} of ${darkPool.of} by notional` : undefined}>
                    {darkPool ? (
                      <>
                        <div className="grid grid-cols-4 gap-1.5">
                          <Stat label="Notional" value={fmtUsd(darkPool.row.notional)} sub="dollars printed" />
                          <Stat
                            label="Vs own avg"
                            value={`${Math.round(darkPool.row.avgVolPct)}%`}
                            sub={darkPool.row.avgVolPct >= 140 ? 'running hot' : darkPool.row.avgVolPct <= 80 ? 'quiet' : 'normal pace'}
                          />
                          <Stat label="Largest cross" value={darkPool.row.size.toLocaleString()} sub="shares" />
                          <Stat label="Prints" value={darkPool.row.prints} sub="blocks today" />
                        </div>
                        <div className="mt-1.5 inst-surface rounded-md px-3 py-2.5">
                          <KV
                            k="Share of the group's off-exchange dollars"
                            v={`${((darkPool.row.notional / (darkPool.sectorNotional || 1)) * 100).toFixed(1)}%`}
                          />
                        </div>
                      </>
                    ) : (
                      <EmptyState icon={Waves} title="No off-exchange row for this name" size="sm" />
                    )}
                  </Section>

                  <Section title="Session option prints" sub={pulse ? `${pulse.prints.length} prints` : undefined}>
                    {pulse ? (
                      <>
                        <div className="grid grid-cols-4 gap-1.5">
                          <Stat label="Calls" value={pulse.calls} sub="prints" />
                          <Stat label="Puts" value={pulse.puts} sub="prints" />
                          <Stat label="Bull premium" value={fmtUsd(pulse.bullPrem)} tone="bull" sub="call lift / put hit" />
                          <Stat label="Bear premium" value={fmtUsd(pulse.bearPrem)} tone="bear" sub="put lift / call hit" />
                        </div>
                        <div className="mt-1.5 inst-surface rounded-md divide-y divide-borderSubtle">
                          {topPrints.map(p => (
                            <div key={p.id} className="px-3 py-1.5 flex items-center gap-2 font-mono text-label">
                              <span className="text-textMuted tnum shrink-0">{p.time}</span>
                              <span className={`shrink-0 ${p.pc === 'C' ? 'text-bull' : 'text-bear'}`}>
                                {p.strike} {p.pc}
                              </span>
                              <span className="text-textMuted tnum shrink-0">{p.dte}d</span>
                              <span className="text-textSecondary truncate">
                                {p.size.toLocaleString()} @ {p.price.toFixed(2)} {p.x}
                              </span>
                              <span className="ml-auto shrink-0 text-textPrimary tnum">{fmtUsd(p.value)}</span>
                            </div>
                          ))}
                        </div>
                        {alerts.length > 0 && (
                          <div className="mt-1.5 flex flex-col gap-1">
                            {alerts.slice(0, 4).map(a => (
                              <div key={a.id} className="flex items-center gap-2 font-mono text-label">
                                <SignalBadge tone="select" className="shrink-0">
                                  {a.kind}
                                </SignalBadge>
                                <span className="text-textSecondary truncate">
                                  {a.strike} {a.pc} {a.exp} · {a.prints} prints
                                </span>
                                <span className="ml-auto text-textPrimary tnum shrink-0">{fmtUsd(a.premium)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <EmptyState icon={Waves} title="No session prints for this name" size="sm" />
                    )}
                  </Section>

                  {chainOI && (
                    <Section title="Open interest in the book">
                      <div className="inst-surface rounded-md px-3 py-2.5 flex flex-col gap-1">
                        <KV k="Call OI" v={chainOI.call.toLocaleString()} />
                        <KV k="Put OI" v={chainOI.put.toLocaleString()} />
                        <KV
                          k="Put / call"
                          v={chainOI.ratio.toFixed(2)}
                          tone={chainOI.ratio >= 1.15 ? 'bear' : chainOI.ratio <= 0.85 ? 'bull' : 'neutral'}
                        />
                      </div>
                    </Section>
                  )}
                </>
              )}

              {(tab === 'LEVELS' || expanded) && (

                <>
                  {swing && (
                    <Section title="Swing zones" sub="daily model, anchored to last">
                      <div className="grid grid-cols-3 gap-1.5">
                        <Stat
                          label="Resistance"
                          value={`$${swing.resistance.mid.toFixed(2)}`}
                          sub={`${signed(swing.resistance.pct)} away`}
                        />
                        <Stat
                          label="Support"
                          value={`$${swing.support.mid.toFixed(2)}`}
                          sub={`${signed(swing.support.pct)} away`}
                        />
                        {/* Where inside its own range the name sits, which is
                            what decides which zone the projection points at.
                            The measured move itself is stated below rather than
                            tiled, because tiling it restates whichever zone Stat
                            it is already equal to. */}
                        <Stat
                          label="Range position"
                          value={`${Math.round(
                            ((price - swing.support.mid) / Math.max(0.01, swing.resistance.mid - swing.support.mid)) * 100
                          )}%`}
                          sub="support to resistance"
                        />
                      </div>
                      <p className="mt-1.5 text-label text-textMuted leading-snug">
                        The rail through the last two dominant swing lows is {swing.trend.dir === 'up' ? 'rising' : 'falling'}. The
                        measured move runs to ${swing.projection.to.toFixed(2)} ({signed(swing.projection.pct)}), the zone price sits
                        further from. This is the desk's own read of the daily range, not an analyst target.
                      </p>
                    </Section>
                  )}

                  {snapshot && (
                    <Section title="Technical state">
                      <div className="inst-surface rounded-md px-3 py-2.5 flex flex-col gap-1">
                        <KV
                          k="RSI (14)"
                          v={snapshot.indicators.rsi.toFixed(1)}
                          tone={snapshot.indicators.rsi >= 60 ? 'bull' : snapshot.indicators.rsi <= 40 ? 'bear' : 'neutral'}
                        />
                        <KV
                          k="EMA stack"
                          v={
                            snapshot.indicators.ema9 > snapshot.indicators.ema21 && snapshot.indicators.ema21 > snapshot.indicators.ema50
                              ? '9 > 21 > 50'
                              : snapshot.indicators.ema9 < snapshot.indicators.ema21 && snapshot.indicators.ema21 < snapshot.indicators.ema50
                                ? '9 < 21 < 50'
                                : 'crossed'
                          }
                        />
                        <KV k="Squeeze" v={snapshot.indicators.squeeze ? 'ON' : 'off'} tone={snapshot.indicators.squeeze ? 'warn' : 'neutral'} />
                      </div>
                      {/* Scale-free readings only. The dealer walls belong on
                          Pinpoint, not here: the options desk prices this name
                          off its own book while the board quotes the screened
                          last, so a call wall printed beside this drawer's Last
                          can land BELOW it. One name, one price on one screen. */}
                      <p className="mt-1.5 text-label text-textMuted leading-snug">
                        Dealer walls, the flip and the pin sit on Pinpoint, which reads them against the options book's own spot.
                      </p>
                    </Section>
                  )}

                  {!swing && !snapshot && <EmptyState icon={Ruler} title="Nothing modelled for this name" size="sm" />}
                </>
              )}

        </div>
      )}
    </DetailModal>
  );
};

export default StockDetailModal;
