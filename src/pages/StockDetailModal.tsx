import { useMemo, type ReactNode } from 'react';
import { Star, GitCompare, Info, Waves, Ruler } from 'lucide-react';
import CompanyLogo from '../components/ui/CompanyLogo';
import DetailModal from '../components/ui/DetailModal';
import { useExpandPreference } from '../hooks/useExpandPreference';
import SignalBadge from '../components/ui/SignalBadge';
import EmptyState from '../components/ui/EmptyState';
import Stat from '../components/ui/Stat';
import TickerJump from '../components/ui/TickerJump';
import Sparkline from '../components/compass/Sparkline';
import Simulator from '../core/simulator';
import { buildDarkPoolFeed } from '../data/darkpoolfeed';
import { FACTOR_GUIDE } from '../data/factorGuide';
import { fmtUsd } from '../data/gex';
import { buildFlowAlerts, buildPulseFlow } from '../data/pulseflow';
import { VERDICT_LABEL, VERDICT_TONE, scoreBand, type StockPick } from '../data/stocks';
import { buildSwingModel } from '../data/swingModel';
import { toneText, type Tone, scoreBandFill, scoreBandText } from '../components/ui/tones';

// A sleeve score is a magnitude, so the fill is `data-bar`; only the weak band
// takes a tone, because a sub-40 sleeve is the one reading that argues against
// the trade. Bands come from the engine so the board cannot disagree with this.

const signed = (v: number, dp = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(dp)}%`;
/** −1…+1 engine leans, restated on a −100…+100 index. Never a percent: nothing
    about a revision or flow lean is a fraction of anything. */
const moveTone = (v: number): Tone => (v > 0 ? 'bull' : v < 0 ? 'bear' : 'neutral');

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
        <span className={`font-mono text-caption font-semibold tnum ${scoreBandText[band]}`}>{v}</span>
      </div>
      <span className="h-[5px] rounded-full bg-white/[0.06] overflow-hidden">
        <span className={`block h-full rounded-full ${scoreBandFill[band]}`} style={{ width: `${v}%` }} />
      </span>
      <span className="text-label text-textMuted leading-snug">{desc}</span>
    </div>
  );
};


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
  /** Standing inside that group, by composite */
  sectorRank?: { rank: number; of: number } | null;
}

/**
 * Right-hand deep view for one name. It used to render the StockPick and
 * nothing else — four sleeve bars and one generated sentence — which is why the
 * board's reasoning read as single-sourced.
 *
 * Every tab here is a different ENGINE answering for the same ticker: the wire
 * and its outcome model (data/news.ts),
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
  sectorRank = null,
}: StockDetailModalProps) => {
  // Held here rather than inside the modal because expanding this drilldown
  // means BUILDING more — the dark-pool read, the options book and the swing
  // model are memos below, above the point a render prop could reach.
  const [expanded, toggleExpanded] = useExpandPreference();
  const ticker = pick?.ticker ?? null;
  const price = pick?.price ?? 0;

  // Both are whole-board builds. They stay eager because they are cheap and the
  // empty states quote their own sizes, so the copy can never state a count the
  // engine has since changed.

  // Expanded is the whole record at once, so everything is wanted. Collapsed
  // still builds only what the open tab needs — the dark-pool sweep and the
  // options book are not free.
  /*
    Everything, on open. There is no tab to gate on any more.

    The drawer used to land on a READ tab carrying six figures — last, composite,
    beta, a sparkline, one sentence and two factor bars — with the off-exchange
    tape, the session option prints, the dealer book and the swing zones behind
    two more tabs. A reader clicking a row saw the six and concluded the page had
    nothing; that was the complaint, and it was a fair reading of what was on
    screen.

    The cost is real and worth stating: the first `buildSnapshot` for a name
    seeds a month of candles, about 90ms. That is a one-time cost per ticker on a
    click, it is what the expand control already paid, and it buys a drawer whose
    contents are not hidden behind furniture.
  */
  const wantsFlow = true;
  const wantsBook = true;

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
    () => (ticker ? buildSwingModel(ticker, price, Math.floor(Date.now() / 1000)) : null),
    [ticker, price]
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
              <CompanyLogo ticker={pick.ticker} size={24} />
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
              <div className="grid grid-cols-3 gap-1.5">
                <Stat
                  label="Last"
                  value={`$${pick.price.toFixed(2)}`}
                  sub={signed(pick.changePct, 2)}
                  tone={moveTone(pick.changePct)}
                />
                {/* The read, not the figure — and not in a direction hue.
                    `composite` was rendered here as a 0-100 number toned
                    bull/bear, which is both of the things this PR has been
                    removing everywhere else: a hand-weighted score printed as a
                    grade, and a magnitude wearing the market's language for a
                    sign. The verdict was already sitting underneath it as the
                    sub-line; it is the value now. */}
                <Stat label="Read" value={VERDICT_LABEL[pick.verdict]} sub="momentum + flow" />
                <Stat
                  label="Beta"
                  value={beta != null ? beta.toFixed(2) : '—'}
                  sub={beta == null ? 'risk lens' : beta < 1 ? 'defensive' : 'cyclical'}
                />
              </div>

              {(

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
                        <Info className="w-3 h-3" /> two sleeves, renormalised
                      </span>
                    }
                  >
                    <div className="flex flex-col gap-3 inst-surface rounded-md px-3 py-3">
                      {FACTOR_GUIDE.map(f => (
                        <FactorRow key={f.key} v={pick.sleeves[f.key]} name={f.name} desc={f.desc} />
                      ))}
                    </div>
                  </Section>

                </>
              )}

              {(

                <>
                  <Section title="Off-exchange tape" sub={darkPool ? `#${darkPool.rank} of ${darkPool.of} by notional` : undefined}>
                    {darkPool ? (
                      <>
                        <div className="grid grid-cols-3 gap-1.5">
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
                        <div className="grid grid-cols-3 gap-1.5">
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

              {(

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
