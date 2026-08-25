import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, LayoutGrid, Moon, Sunrise } from 'lucide-react';

/** The way back, and — when the dossier was opened from a desk — the way
    home (Noah, 2026-08-22: "a back button that takes you to the first page
    of earnings and a desk button that takes you to the pulse page"). Same
    grammar as the campaign page: Back names the calendar, Desk is Pulse. */
const NavRow = ({ fromDesk }: { fromDesk: boolean }) => (
  <div className="flex items-center gap-4 w-fit">
    <Link
      to="/earnings"
      className="group inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
    >
      <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-200 ease-out group-hover:-translate-x-0.5" /> Back
    </Link>
    {fromDesk && (
      <Link
        to="/pulse"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
      >
        <LayoutGrid className="w-3.5 h-3.5" /> Desk
      </Link>
    )}
  </div>
);
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import AnimatedNumber from '../components/ui/AnimatedNumber';
import Fact from '../components/ui/Fact';
import Panel from '../components/ui/Panel';
import CompanyLogo from '../components/ui/CompanyLogo';
import HoverReadout from '../components/ui/HoverReadout';
import Term from '../components/ui/Term';
import { StateTag, stateOf } from '../components/earnings/volState';
import ConfirmTag from '../components/earnings/ConfirmTag';
import { BULL } from '../components/gex/palette';
import { buildEarningsDossier, type ActiveContract, type EarningsDossier as Dossier } from '../data/earnings';

/*
  The per-company earnings dossier — /earnings/:ticker. Everything a user
  needs before a print, in reading order: what options charge (in dollars),
  the receipts (beats/misses + past moves), the probabilities the pricing
  implies, and which contracts screen strong vs against you. Charts are
  Recharts (statistical work); copy is plain English; states, not orders.
*/

// ---- chart theming ----------------------------------------------------------
const AXIS = { stroke: 'transparent', tick: { fill: '#a3a3a3', fontSize: 10, fontFamily: "'SF Pro', sans-serif" } };
const GRID = { stroke: 'rgba(255,255,255,0.05)', vertical: false };
const BEAR = '#FF3B30';
const WHITE_DIM = 'rgba(237,237,237,0.28)';

const TooltipShell = ({ children }: { children: React.ReactNode }) => (
  <div className="border border-borderMuted bg-panel rounded-md px-2.5 py-2 shadow-xl shadow-black/60 font-mono text-[11px] text-textPrimary">
    {children}
  </div>
);

// ---- today's price, replayed ------------------------------------------------
/*
  Third form for this slot; the first two (pill gauge + bell curve, then a
  price rail with zones) died in review as unreadable (Noah, 2026-08-19:
  "so simple yet unique... think deep"). The question a person actually asks
  is "is ±11.7% a fair price?" — so answer it with money, not statistics:
  take TODAY'S price for the move and replay it over the last 8 real prints.
  One bar per quarter: the actual move's dollar value minus today's cost.
  Green above the line = the move would have covered today's price; red
  below = it fell short. Mostly red = overpaying — read in one second, and
  distinct from the Past Moves panel below (that shows the moves themselves;
  this shows today's price tag applied to them).
*/
const PriceReplay = ({ d }: { d: Dossier }) => {
  const e = d.event;
  const px = e.price;
  /** What the ATM straddle charges for the print, per share */
  const cost = (px * e.impliedMovePct) / 100;

  const rows = useMemo(
    () =>
      d.quarters.map(q => {
        const moved = (px * Math.abs(q.movePct)) / 100;
        return { label: q.label, movePct: q.movePct, moved, pl: moved - cost };
      }),
    [d.quarters, px, cost]
  );
  const maxAbs = useMemo(() => Math.max(...rows.map(r => Math.abs(r.pl)), 0.01), [rows]);
  const winners = rows.filter(r => r.pl > 0).length;
  const avg = rows.reduce((a, r) => a + r.pl, 0) / (rows.length || 1);

  const [hover, setHover] = useState<{ r: (typeof rows)[number]; x: number; y: number } | null>(null);

  const H = 56; // px half-height of the tallest bar

  return (
    <div className="flex flex-col gap-3">
      {/* the price tag being tested */}
      <div className="flex items-baseline gap-2.5 flex-wrap font-mono tnum">
        <span className="text-[10px] uppercase tracking-wider text-textSecondary">Today's price for the move</span>
        <span className="text-[16px] font-bold text-textPrimary">${cost.toFixed(2)}</span>
        <span className="text-[11px] text-textSecondary">per share · ±{e.impliedMovePct.toFixed(1)}%</span>
      </div>

      {/* the replay — one bar per past print, from the breakeven line */}
      <div className="mx-auto w-full max-w-[620px] select-none">
        <div className="relative" style={{ height: 2 * H }} onMouseLeave={() => setHover(null)}>
          <span className="absolute inset-x-0 top-1/2 h-px bg-white/25" />
          <span className="absolute left-0 -translate-y-full top-1/2 pb-0.5 font-mono text-[9px] uppercase tracking-wider text-textMuted">
            move covered it
          </span>
          <span className="absolute left-0 top-1/2 pt-0.5 font-mono text-[9px] uppercase tracking-wider text-textMuted">
            fell short
          </span>
          <div className="absolute inset-y-0 left-24 right-0 flex items-stretch gap-1.5">
            {rows.map(r => (
              <button
                key={r.label}
                onMouseEnter={ev => setHover({ r, x: ev.clientX, y: ev.clientY })}
                onMouseMove={ev => setHover({ r, x: ev.clientX, y: ev.clientY })}
                className="relative flex-1 min-w-0 rounded hover:bg-white/[0.04] transition-colors cursor-default"
                aria-label={`${r.label}: moved ${r.movePct >= 0 ? '+' : ''}${r.movePct.toFixed(1)}%, ${
                  r.pl >= 0 ? 'covered' : 'fell short of'
                } today's price by $${Math.abs(r.pl).toFixed(2)} per share`}
              >
                <span
                  className={`absolute left-1/2 -translate-x-1/2 w-[22px] rounded-[2px] ${
                    r.pl >= 0 ? 'bg-bull/90' : 'bg-bear/80'
                  }`}
                  style={
                    r.pl >= 0
                      ? { bottom: '50%', height: Math.max(3, (Math.abs(r.pl) / maxAbs) * H) }
                      : { top: '50%', height: Math.max(3, (Math.abs(r.pl) / maxAbs) * H) }
                  }
                />
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1.5 mt-1 pl-24">
          {rows.map(r => (
            <span key={r.label} className="flex-1 min-w-0 text-center font-mono text-[9px] text-textMuted truncate">
              {r.label}
            </span>
          ))}
        </div>
      </div>

      {/* the count IS the verdict — then the small conclusion (Mo's format) */}
      <div className="flex items-center gap-2.5 flex-wrap font-mono tnum">
        <span className="text-[13px] font-bold text-textPrimary">
          covered today's price {winners} of {rows.length} times
        </span>
        <span className={`text-[11px] font-semibold ${avg >= 0 ? 'text-bull' : 'text-bear'}`}>
          avg {avg >= 0 ? '+' : '−'}${Math.abs(avg).toFixed(2)} per share
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-1.5 pt-1.5 border-t border-borderSubtle/60">
        <Fact label={`Closes inside ±${e.impliedMovePct.toFixed(1)}%`} value={`${d.probInsidePct}%`} />
        <Fact label="Moves beyond the band" value={`${d.probBeyondPct}%`} valueCls="text-textSecondary" />
        <Fact
          label="Direction skew · flow + revisions"
          value={`${d.probUpPct}% up / ${100 - d.probUpPct}% down`}
          valueCls={d.probUpPct >= 56 ? 'text-bull' : d.probUpPct <= 44 ? 'text-bear' : 'text-textPrimary'}
        />
      </div>
      <div className="flex items-center gap-2.5">
        <StateTag state={stateOf(e)} />
        <span className="font-mono text-[10px] text-textMuted tnum">options charge {e.richness.toFixed(2)}× the typical print</span>
      </div>

      {hover && (
        <HoverReadout x={hover.x} y={hover.y}>
          <div className="font-mono text-[11px] font-bold text-textPrimary tnum">
            {hover.r.label} · moved {hover.r.movePct >= 0 ? '+' : ''}
            {hover.r.movePct.toFixed(1)}%
          </div>
          <div className="font-mono text-[10px] text-textSecondary tnum">
            that move was worth ${hover.r.moved.toFixed(2)} · today's price ${cost.toFixed(2)}
          </div>
          <div className={`font-mono text-[11px] font-bold tnum ${hover.r.pl >= 0 ? 'text-bull' : 'text-bear'}`}>
            {hover.r.pl >= 0 ? '+' : '−'}${Math.abs(hover.r.pl).toFixed(2)} per share vs today's price
          </div>
        </HoverReadout>
      )}
    </div>
  );
};


// ---- most active contract row -----------------------------------------------
/* Facts only — no "why", no strong/against framing (Noah, 2026-08-19: "we
   simply provide information like bloomberg"). The volume meter ranks the
   row against the busiest contract on the name; everything else is the
   contract's own arithmetic. */
const ActiveRow = ({ c, maxVol }: { c: ActiveContract; maxVol: number }) => (
  <div className="border border-borderSubtle bg-inset rounded-md px-3.5 py-2.5 flex flex-col gap-1.5">
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-[13px] font-bold text-textPrimary">{c.label}</span>
      <span className="ml-auto font-mono text-[13px] font-semibold text-textPrimary tnum">
        ~<AnimatedNumber value={c.mid} format={v => `$${v.toFixed(2)}`} />
      </span>
    </div>
    <div className="flex items-center gap-2">
      <span className="font-mono text-[9px] uppercase tracking-wider text-textMuted shrink-0">vol</span>
      <span className="relative w-24 h-[4px] rounded-full bg-white/[0.06] shrink-0">
        {/* Refreshes on the 10s scan — the width GLIDES to the new share
            (data-settle duration) and the count rolls, so a refresh reads as
            the session accumulating, not the page blinking (Noah, 2026-08-19). */}
        <span
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out ${
            c.right === 'CALL' ? 'bg-bull/80' : 'bg-bear/70'
          }`}
          style={{ width: `${Math.max(6, (c.volume / maxVol) * 100)}%` }}
        />
      </span>
      <span className="font-mono text-[11px] font-semibold text-textPrimary tnum">
        <AnimatedNumber value={c.volume} format={v => Math.round(v).toLocaleString()} />
      </span>
      <span className="font-mono text-[10px] text-textSecondary tnum">
        OI {c.oi.toLocaleString()} · <AnimatedNumber value={c.volOverOi} format={v => `${v.toFixed(2)}×`} /> · IV {c.ivPct}%
      </span>
    </div>
    <span className="font-mono text-[10px] text-textMuted tnum">
      {c.fromSpotPct === 0 ? 'at the money' : `${c.fromSpotPct > 0 ? '+' : ''}${c.fromSpotPct}% from spot`} · breakeven{' '}
      {c.right === 'CALL' ? '+' : '−'}
      {c.breakevenPct}% by expiry
    </span>
  </div>
);

// ---- page -------------------------------------------------------------------
const EarningsDossier = () => {
  const { ticker = '' } = useParams();
  // The actives refresh on the scan tier (10s, the house engine cadence);
  // everything structural in the dossier is tick-stable, so only volume,
  // mid and IV actually move between scans.
  const [scanTick, setScanTick] = useState(0);
  const location = useLocation();
  const fromDesk = (location.state as { from?: string } | null)?.from === 'desk';
  useEffect(() => {
    const id = setInterval(() => setScanTick(t => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  const dossier = useMemo(() => buildEarningsDossier(ticker, scanTick), [ticker, scanTick]);

  if (!dossier) {
    return (
      <>
        <NavRow fromDesk={fromDesk} />
        <Panel className="mt-3">
          <div className="h-40 flex flex-col items-center justify-center gap-2">
            <span className="font-mono text-sm font-bold text-textPrimary">{ticker.toUpperCase()}</span>
            <span className="font-mono text-[11px] text-textSecondary uppercase tracking-wider">
              no report on the next two weeks' slate
            </span>
          </div>
        </Panel>
      </>
    );
  }

  const { event: e, quarters } = dossier;
  const state = stateOf(e);
  const epsBeats = quarters.filter(q => q.epsBeat).length;
  const revBeats = quarters.filter(q => q.revBeat).length;

  const moveData = quarters.map(q => ({ label: q.label, move: q.movePct }));
  const maxActiveVol = Math.max(...dossier.activeCalls.map(c => c.volume), ...dossier.activePuts.map(c => c.volume), 1);
  const epsData = quarters.map(q => ({ label: q.label, est: q.epsEst, actual: q.epsActual, beat: q.epsBeat }));

  return (
    <>
      {/* Back to the calendar — and Desk, when that's where you came from */}
      <NavRow fromDesk={fromDesk} />

      {/* Identity header */}
      <div className="flex items-center gap-4">
        <CompanyLogo ticker={e.ticker} size={40} />
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-textPrimary leading-tight">{e.name}</h1>
          <span className="flex items-center gap-2 flex-wrap font-mono text-[11px] text-textSecondary">
            {e.ticker} · reports {e.dateLabel}
            <span className={`inline-flex items-center gap-1 ${e.slot === 'BMO' ? 'text-warn' : 'text-flip'}`}>
              {e.slot === 'BMO' ? <Sunrise className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
              {e.slot === 'BMO' ? 'before open' : 'after close'}
            </span>
            <span className="text-textMuted">·</span>
            <ConfirmTag confirmed={e.confirmed} long />
          </span>
        </div>
      </div>

      {/* The vitals — full-width ledger strip: dot-leader entries and real
          data marks (the actual 8 quarters, the actual skew), no stat cards */}
      <div className="border border-borderSubtle bg-inset rounded-md px-4 py-3 font-mono">
        <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-borderSubtle">
          <StateTag state={state} />
          <span className="text-[10px] uppercase tracking-widest text-textMuted">at a glance</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-8 gap-y-3">
          {/* Every label is a Term — dotted underline, hover/focus for the
              plain-English definition (Noah, 2026-08-19: "what is revision?
              what is options vs history?... so abstract"). */}
          <span className="flex items-baseline gap-2 min-w-0">
            <Term k="Expected move" className="text-[10px] uppercase tracking-wider text-textSecondary shrink-0" />
            <span className="flex-1 self-center border-b border-dotted border-white/15" />
            <span className="text-[13px] font-bold text-textPrimary tnum">±{e.impliedMovePct.toFixed(1)}%</span>
          </span>
          <span className="flex items-baseline gap-2 min-w-0">
            <Term k="Typical move" className="text-[10px] uppercase tracking-wider text-textSecondary shrink-0" />
            <span className="flex-1 self-center border-b border-dotted border-white/15" />
            <span className="text-[13px] text-textSecondary tnum">±{e.histAvgMovePct.toFixed(1)}%</span>
          </span>
          <span className="flex items-baseline gap-2 min-w-0">
            <Term k="Priced vs typical" className="text-[10px] uppercase tracking-wider text-textSecondary shrink-0" />
            <span className="flex-1 self-center border-b border-dotted border-white/15" />
            <span
              className={`text-[13px] font-bold tnum ${
                state === 'RICH' ? 'text-warn' : state === 'CHEAP' ? 'text-bull' : 'text-textPrimary'
              }`}
            >
              {e.richness.toFixed(2)}×
            </span>
          </span>
          <span className="flex items-center gap-2 min-w-0">
            <Term k="Last 8 reports" className="text-[10px] uppercase tracking-wider text-textSecondary shrink-0" />
            <span className="flex gap-[3px] shrink-0" title="each square = one quarter, oldest first">
              {quarters.map(q => (
                <span key={q.label} className={`w-2 h-2 rounded-[2px] ${q.epsBeat ? 'bg-bull' : 'bg-bear/60'}`} />
              ))}
            </span>
            <span className="flex-1 self-center border-b border-dotted border-white/15" />
            <span className="text-[13px] font-bold text-textPrimary tnum">{e.beatRate8q}%</span>
          </span>
          <span className="flex items-center gap-2 min-w-0">
            <Term k="Up vs down" className="text-[10px] uppercase tracking-wider text-textSecondary shrink-0" />
            {/* Matched alphas — solid green beside 70% red read as two
                different SIZES (Noah, 2026-08-19); mirror-image weight only. */}
            <span className="flex h-[5px] w-16 rounded-full overflow-hidden shrink-0" title="odds the move is up vs down">
              <span className="h-full bg-bull/90" style={{ width: `${dossier.probUpPct}%` }} />
              <span className="h-full bg-bear/90" style={{ width: `${100 - dossier.probUpPct}%` }} />
            </span>
            <span className="flex-1 self-center border-b border-dotted border-white/15" />
            <span
              className={`text-[13px] font-bold tnum ${
                dossier.probUpPct >= 56 ? 'text-bull' : dossier.probUpPct <= 44 ? 'text-bear' : 'text-textPrimary'
              }`}
            >
              {dossier.probUpPct}% up
            </span>
          </span>
          {/* The evidence Mo's checklist named that only lived in prose
              (2026-08-19): what the vol costs vs itself, what the straddle
              charges in dollars, which way the street has been drifting. */}
          <span className="flex items-baseline gap-2 min-w-0">
            <Term k="IV rank" className="text-[10px] uppercase tracking-wider text-textSecondary shrink-0" />
            <span className="flex-1 self-center border-b border-dotted border-white/15" />
            <span className={`text-[13px] font-bold tnum ${e.ivRank >= 80 ? 'text-warn' : 'text-textPrimary'}`}>{e.ivRank}</span>
          </span>
          <span className="flex items-baseline gap-2 min-w-0">
            <Term k="Straddle cost" className="text-[10px] uppercase tracking-wider text-textSecondary shrink-0" />
            <span className="flex-1 self-center border-b border-dotted border-white/15" />
            <span className="text-[13px] font-bold text-textPrimary tnum">${((e.price * e.impliedMovePct) / 100).toFixed(2)}</span>
          </span>
          <span className="flex items-baseline gap-2 min-w-0">
            <Term k="Revisions" className="text-[10px] uppercase tracking-wider text-textSecondary shrink-0" />
            <span className="flex-1 self-center border-b border-dotted border-white/15" />
            <span
              className={`text-[13px] font-bold tnum ${
                e.revisionTrend > 0.15 ? 'text-bull' : e.revisionTrend < -0.15 ? 'text-bear' : 'text-textSecondary'
              }`}
            >
              {e.revisionTrend > 0.15
                ? `+${(e.revisionTrend * 100).toFixed(0)} drifting up`
                : e.revisionTrend < -0.15
                  ? `${(e.revisionTrend * 100).toFixed(0)} drifting down`
                  : 'flat'}
            </span>
          </span>
        </div>
      </div>

      {/* Today's price, replayed — the third form for this slot: money, not
          statistics (Noah, 2026-08-19) */}
      <Panel
        title="Today's price, replayed"
        subtitle="what options charge now, tested against the last 8 real prints — hover any bar"
      >
        <PriceReplay d={dossier} />
      </Panel>

      {/* The receipts: beats & misses + past moves */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
        <Panel
          title="Beats & misses"
          subtitle={`EPS — estimate vs actual · beat ${epsBeats} of 8 on earnings, ${revBeats} of 8 on revenue`}
        >
          <div className="h-[132px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={epsData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }} barGap={2}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} width={40} tickFormatter={(v: number) => `$${v}`} />
                <Tooltip
                  isAnimationActive={false}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <TooltipShell>
                        <div className="text-textSecondary">{label}</div>
                        <div>est ${Number(payload[0]?.value).toFixed(2)}</div>
                        <div>actual ${Number(payload[1]?.value).toFixed(2)}</div>
                      </TooltipShell>
                    ) : null
                  }
                />
                <Bar dataKey="est" fill={WHITE_DIM} radius={[2, 2, 0, 0]} barSize={9} isAnimationActive={false} />
                <Bar dataKey="actual" radius={[2, 2, 0, 0]} barSize={9} isAnimationActive={false}>
                  {epsData.map(q => (
                    <Cell key={q.label} fill={q.beat ? BULL : BEAR} fillOpacity={q.beat ? 0.9 : 0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-textMuted">
            gray = street estimate · <span className="text-bull">green = beat</span> ·{' '}
            <span className="text-bear">red = miss</span>
          </p>
        </Panel>

        <Panel title="Past moves" subtitle="the stock's reaction to each of its last 8 reports">
          <div className="h-[132px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={moveData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} width={40} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`} />
                <Tooltip
                  isAnimationActive={false}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <TooltipShell>
                        <div className="text-textSecondary">{label}</div>
                        <div>
                          {Number(payload[0]?.value) >= 0 ? '+' : ''}
                          {Number(payload[0]?.value).toFixed(1)}% next session
                        </div>
                      </TooltipShell>
                    ) : null
                  }
                />
                <ReferenceLine y={e.impliedMovePct} stroke="rgba(237,237,237,0.5)" strokeDasharray="4 3" />
                <ReferenceLine y={-e.impliedMovePct} stroke="rgba(237,237,237,0.5)" strokeDasharray="4 3" />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                <Bar dataKey="move" radius={[2, 2, 0, 0]} barSize={16} isAnimationActive={false}>
                  {moveData.map(q => (
                    <Cell key={q.label} fill={q.move >= 0 ? BULL : BEAR} fillOpacity={q.move >= 0 ? 0.9 : 0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-textMuted">
            dashed = the ±{e.impliedMovePct.toFixed(1)}% priced for this print
          </p>
        </Panel>
      </div>

      {/* IV crush — the numbers, then one short line (Mo, 2026-08-19) */}
      <Panel bodyClassName="py-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-x-8 gap-y-1.5">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-warn shrink-0">IV crush</span>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
            <Fact label="Options deflate overnight" value={`−${dossier.ivCrushPct}%`} valueCls="text-warn" />
            <Fact label="ATM extrinsic kept by next open" value={`~${100 - dossier.premiumLostPct}%`} />
          </div>
        </div>
        <p className="mt-2 font-mono text-[10px] text-textMuted">
          a long option has to beat the expected move and that deflation
        </p>
      </Panel>

      {/* Most active — market facts, not picks (Noah, 2026-08-19) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-bull" /> Most active calls
            </span>
          }
          subtitle="the 3 busiest by volume into the print · 10s scan"
        >
          <div className="flex flex-col gap-2.5">
            {dossier.activeCalls.map(c => (
              <ActiveRow key={c.id} c={c} maxVol={maxActiveVol} />
            ))}
          </div>
        </Panel>
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-bear" /> Most active puts
            </span>
          }
          subtitle="the 3 busiest by volume into the print · 10s scan"
        >
          <div className="flex flex-col gap-2.5">
            {dossier.activePuts.map(c => (
              <ActiveRow key={c.id} c={c} maxVol={maxActiveVol} />
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
};

export default EarningsDossier;
