import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Scale } from 'lucide-react';
import Feed from '../../core/feed';
import {
  weighContract,
  weighContracts,
  betterAlternative,
  horizonForDte,
  type ContractVerdict,
} from '../../core/contractScore';
import { expiryFor } from '../../core/calendar';
import { buildChain, makeSetup } from '../../data/compass';
import type { MarketSnapshot } from '../../types/market';
import type { SleeveKey } from '../../types/compass';
import AnimatedNumber from '../ui/AnimatedNumber';
import Panel from '../ui/Panel';
import RichRead from '../ui/RichRead';
import SignalBadge from '../ui/SignalBadge';
import type { Tone } from '../ui/tones';
import ContractChainView, { type ChainSelection } from './ContractChain';
import ContractFacts from './ContractFacts';

/* States, not orders — same doctrine as Compass setups. The engine's
   BUY/WATCH/FADE verdicts are INTERNAL loop-scoring vocabulary (it chose
   that contract); users only ever see the state. */
const VERDICT_LABEL: Record<ContractVerdict, string> = {
  BUY: 'ACTIVE',
  WATCH: 'WATCH',
  FADE: 'FADING',
};

const verdictTone: Record<ContractVerdict, Tone> = {
  BUY: 'bull',
  WATCH: 'warn',
  FADE: 'bear',
};

/* Focus changes re-feed these rows in place (they're keyed by factor name, so
   the DOM persists) — the meter glides instead of snapping. House ease, same
   700ms as every other live meter. */
const METER_GLIDE = 'transition-[width,background-color] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]';

/** One factor of the composite — label, meter, prose. No numbers and no
    formula weights: the grade machinery is engine-internal (Noah, 2026-08-16);
    the meter's length and color carry each factor's pull, the prose says why.
    The row's DOM PERSISTS across contract switches (meters-glide doctrine):
    the meter glides; only the PROSE crossfades, keyed by `fadeKey` (the
    contract id — never the text, which drifts every tick). */
const FactorRow = ({
  label,
  score,
  detail,
  fadeKey,
}: {
  label: string;
  score: number;
  detail: string;
  fadeKey?: string;
}) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 font-mono text-[10px] uppercase tracking-wider text-textSecondary">{label}</span>
      <span className="flex-1 h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
        <span
          className={`block h-full rounded-full ${METER_GLIDE} ${score >= 60 ? 'bg-bull/85' : score >= 40 ? 'bg-white/30' : 'bg-bear/75'}`}
          style={{ width: `${score}%` }}
        />
      </span>
    </div>
    <p key={fadeKey} className={`pl-32 text-xs text-textPrimary leading-snug ${fadeKey ? 'animate-soft-in' : ''}`}>
      <RichRead text={detail} />
    </p>
  </div>
);

/** Borderless figure — label over value, GreeksRow idiom (not a stat card). */
const Fig = ({ label, value, tone = 'text-textPrimary' }: { label: string; value: string; tone?: string }) => (
  <span className="flex flex-col gap-0.5 min-w-0">
    <span className="font-mono text-[9px] uppercase tracking-wider text-textMuted">{label}</span>
    <span className={`font-mono text-[12px] font-semibold tnum ${tone}`}>{value}</span>
  </span>
);

/** A titled instrument in the work-the-contract matrix. h-full: cells in the
    same grid row stretch to ONE height — uneven cards read as vibe-coded
    spacing (Noah, 2026-08-09). */
const Instrument = ({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) => (
  <div className="h-full border border-borderSubtle bg-inset rounded-md px-3.5 py-3 flex flex-col gap-2 min-w-0">
    <div className="flex items-center justify-between gap-2">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-textMuted">{title}</span>
      {badge}
    </div>
    {children}
  </div>
);

/* The rail's expiry ladder — the REAL listed shape (Noah, 2026-08-09: 15
   chips on a full-width rail read sparse; Robinhood shows double): every
   session for the next two weeks, every Friday out to a quarter, one Friday
   a month out to a year, then the LEAPS calendar. ~35 chips; the wheel glide
   and edge arrows carry the overflow. */
const buildRailDtes = (): number[] => {
  const seen = new Set<string>();
  const out: number[] = [];
  const push = (d: number) => {
    const e = expiryFor(d);
    if (seen.has(e.label)) return;
    seen.add(e.label);
    out.push(d);
  };
  // Dailies — every session for ~two weeks
  for (let d = 0; d <= 10; d++) push(d);
  // Weeklies — every Friday out to ~a quarter
  for (let d = 11; d <= 95; d++) {
    if (expiryFor(d).weekday === 'Fri') push(d);
  }
  // Monthlies — one Friday per calendar month out to ~a year
  let lastMonth = -1;
  for (let d = 96; d <= 400; d++) {
    const e = expiryFor(d);
    if (e.weekday !== 'Fri') continue;
    const m = e.date.getFullYear() * 12 + e.date.getMonth();
    if (m === lastMonth) continue;
    lastMonth = m;
    push(d);
  }
  // LEAPS — the far calendar
  push(550);
  push(730);
  return out;
};

/** The analysis sleeve follows the CONTRACT's clock — a 3-day pick reads as a
    weekly, a 90-day pick as a swing. Pricing uses the exact DTE either way. */
const sleeveForDte = (dte: number): SleeveKey =>
  dte <= 1 ? 'odte' : dte <= 7 ? 'weekly' : dte <= 60 ? 'swing' : 'leaps';

interface RailChip {
  d: number;
  weekday: string;
  short: string;
  sessions: number;
}

/** The Robinhood move (Noah, 2026-08-09): expiries ride a horizontal rail on
    the chain itself — click one and the chain below re-prices for it. Tenor
    is terminal hardware, so the active chip wears the flat holo silver —
    except TODAY, which speaks in the terminal's own lime. The rail slides on
    the mouse WHEEL (up = later dates, down = earlier) with the scrollbar
    hidden, and each END grows an INVISIBLE ARROW: hover the edge and a
    chevron fades in, click to glide a page, leave and it fades out. An arrow
    only exists while there is rail left in that direction. */
const ExpiryRail = ({ chips, value, onChange }: { chips: RailChip[]; value: number; onChange: (d: number) => void }) => {
  const railRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef(0);
  const rafRef = useRef(0);
  const [can, setCan] = useState({ left: false, right: false });

  const updateCan = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCan(prev => {
      const next = { left: el.scrollLeft > 2, right: el.scrollLeft < max - 2 };
      return prev.left === next.left && prev.right === next.right ? prev : next;
    });
  }, []);

  /* Eased glide, not raw scrollLeft jumps — a wheel notch is ±120px and
     assigning it directly teleports the rail (Noah: "glitchy"). Deltas
     accumulate into a TARGET; a rAF loop approaches it exponentially, so
     rapid notches (or arrow clicks) chain into one continuous slide. Shared
     by the wheel and both arrows. */
  const glideBy = useCallback((dx: number) => {
    const el = railRef.current;
    if (!el) return;
    const step = () => {
      const diff = targetRef.current - el.scrollLeft;
      if (Math.abs(diff) < 0.5) {
        el.scrollLeft = targetRef.current;
        rafRef.current = 0;
        return;
      }
      el.scrollLeft += diff * 0.16;
      rafRef.current = requestAnimationFrame(step);
    };
    // Idle means the user may have dragged the bar themselves — re-sync
    // before applying the delta, or the rail lurches to a stale target.
    if (!rafRef.current) targetRef.current = el.scrollLeft;
    const max = el.scrollWidth - el.clientWidth;
    targetRef.current = Math.max(0, Math.min(max, targetRef.current + dx));
    if (!rafRef.current) rafRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    // Native non-passive listener: React's synthetic onWheel is passive and
    // cannot preventDefault the page scroll underneath.
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      // Wheel up (deltaY < 0) slides the rail RIGHT toward later expiries
      glideBy(-e.deltaY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [glideBy]);

  // Arrows need a first read after mount (and when the chips change)
  useEffect(() => {
    updateCan();
  }, [chips, updateCan]);

  const pageStep = () => (railRef.current?.clientWidth ?? 300) * 0.6;

  return (
    <div className="relative">
      <div
        ref={railRef}
        onScroll={updateCan}
        role="tablist"
        aria-label="Chain expiry"
        /* px-px/py-1: an overflow-x container clips BOTH axes, and the active
           chip's ring is drawn 1px OUTSIDE its button — flush chips got their
           outline sliced at the rail's top and left edges (Noah's screenshot:
           "the boxes are bleeding out"). */
        className="flex items-center gap-1 overflow-x-auto px-px py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {chips.map(chip => {
          const on = value === chip.d;
          const today = chip.sessions === 0;
          return (
            <button
              key={chip.d}
              role="tab"
              aria-selected={on}
              onClick={() => onChange(chip.d)}
              className={`shrink-0 px-2.5 py-1 rounded font-mono text-[11px] leading-tight text-center transition-colors ${
                today
                  ? on
                    ? 'holo-bg text-[#0a0a0a] font-semibold'
                    : 'text-[#C7D3E8] hover:bg-[#C7D3E8]/[0.08]'
                  : on
                    ? 'bg-[#C7D3E8]/[0.08] ring-1 ring-[#C7D3E8]/40 text-textPrimary font-semibold'
                    : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.03]'
              }`}
            >
              <span className="block tnum">{today ? 'Today' : `${chip.weekday} ${chip.short}`}</span>
              <span className={`block text-[9px] tnum ${today ? (on ? 'text-[#0a0a0a]/70' : 'text-[#C7D3E8]/70') : on ? 'text-textSecondary' : 'text-textMuted'}`}>
                {chip.sessions} session{chip.sessions === 1 ? '' : 's'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Edge arrows — QUIETLY VISIBLE whenever that direction has rail left
          (Noah: fully hidden was too hidden), full-bright on hover, gone
          entirely at a hard end. The gradient keeps the chevron legible over
          half-scrolled chips. */}
      {can.left && (
        <button
          aria-label="Earlier expiries"
          onClick={() => glideBy(-pageStep())}
          className="absolute inset-y-0 left-0 z-10 flex w-9 items-center justify-start pl-0.5 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/70 to-transparent opacity-45 hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-200"
        >
          <ChevronLeft className="w-4 h-4 text-textPrimary" />
        </button>
      )}
      {can.right && (
        <button
          aria-label="Later expiries"
          onClick={() => glideBy(pageStep())}
          className="absolute inset-y-0 right-0 z-10 flex w-9 items-center justify-end pr-0.5 bg-gradient-to-l from-[#0a0a0a] via-[#0a0a0a]/70 to-transparent opacity-45 hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-200"
        >
          <ChevronRight className="w-4 h-4 text-textPrimary" />
        </button>
      )}
    </div>
  );
};

interface ContractWeigherProps {
  snapshot: MarketSnapshot;
}

/** Compass's second mode: the scale. Browse the chain at any expiry, click a
    contract, and the desk weighs it — 6-factor composite, dollarized facts,
    and the working tools. The chain IS the picker: ticker via the page
    header's search, expiry via the rail, strike and right off the rows
    (Noah, 2026-08-09 — the old type-a-contract line duplicated all four). */
const ContractWeigher = ({ snapshot }: ContractWeigherProps) => {
  // The chain's tenor — which expiry the rail has selected
  const [railDte, setRailDte] = useState(0);
  // The open full analysis — a contract named by the chain or the search line.
  // gradedAt freezes which sweep first weighed it (provenance).
  const [analysis, setAnalysis] = useState<{
    strike: number;
    right: 'C' | 'P';
    dte: number;
    gradedAt: string;
  } | null>(null);


  // A new name is a fresh slate for the open analysis
  useEffect(() => {
    setAnalysis(null);
  }, [snapshot.ticker]);


  // ---- the chain + the analysis --------------------------------------------
  const tickerIv = Feed.TICKERS[snapshot.ticker]?.iv ?? 0.2;

  /* The rail's real expiries, clock-aware — the listed-calendar ladder,
     already deduped by the builder. */
  const railChips = useMemo(() => {
    const thisYear = new Date().getFullYear();
    return buildRailDtes().map(d => {
      const e = expiryFor(d);
      return { d, ...e, short: e.date.getFullYear() === thisYear ? e.label.slice(0, 5) : e.label };
    });
  }, []);

  /* The chain, priced at the rail's tenor — same builder the scanner view
     uses, so the Weigher's chain and the board's chain can never disagree. */
  const chain = useMemo(() => {
    const sessions = Math.max(expiryFor(railDte).sessions, 0.5);
    return buildChain(snapshot, tickerIv, sessions / 252);
  }, [snapshot, tickerIv, railDte]);

  /* The open analysis, WEIGHED live each tick on the weigher's OWN scale —
     the 6-factor composite, not the scanner's setup score. The scanner
     grades its proposals; this page grades YOURS. */
  const weighResult = useMemo(
    () => (analysis ? weighContract(snapshot, analysis.right, analysis.strike, analysis.dte) : null),
    [analysis, snapshot]
  );
  const focusC = weighResult?.contract ?? null;

  /* The dollarized facts come from the same pricer the rest of Compass uses —
     makeSetup at the EXACT dte the user named (never a sleeve's canonical
     tenor). Used ONLY for the facts strip; every judgment is the weigher's. */
  const analysisSetup = useMemo(() => {
    if (!analysis) return null;
    return makeSetup(
      snapshot.ticker,
      snapshot.spot,
      analysis.strike,
      analysis.right,
      'all',
      tickerIv,
      sleeveForDte(analysis.dte),
      analysis.dte
    );
  }, [analysis, snapshot, tickerIv]);

  /* "Stronger option?" compares within the contract's OWN sleeve — always
     apples-to-apples because the candidates are generated at its horizon. */
  const alt = useMemo(() => {
    if (!analysis || !focusC) return null;
    const candidates = weighContracts(snapshot, horizonForDte(analysis.dte));
    return betterAlternative(candidates, focusC);
  }, [analysis, focusC, snapshot]);

  /** Open the full weigh on a named contract, freezing the composite that
      earned the click (the provenance rule). */
  const openAnalysis = (strike: number, right: 'C' | 'P', dte: number) => {
    const graded = weighContract(snapshot, right, strike, dte);
    setAnalysis({ strike, right, dte, gradedAt: new Date().toLocaleTimeString('en-GB') });
  };

  const handleChainSelect = (sel: ChainSelection) => openAnalysis(sel.strike, sel.right, railDte);

  /* Contract switches BREATHE, never remount (the SamplePreview lesson): the
     analysis DOM persists so the composite rolls, the meters glide and the
     mid flashes — a keyed wrapper restarted every one of them from zero,
     which read as a glitchy pop. The dip announces "new contract" instead. */
  const weighBreath = useAnimationControls();
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (reducedMotion || !focusC) return;
    weighBreath.set({ opacity: 0.45, y: 4 });
    weighBreath.start({ opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusC?.id]);

  /* ---- the desk's reads ----------------------------------------------------
     NO INPUTS on this page (Noah, 2026-08-09: "users only see what we have
     available for them and what we think") — the what-if/size/hold dials are
     gone. What remains are the ENGINE's own judgments: what friction eats,
     and whether the expected move covers the breakeven. */
  const cost = focusC
    ? (() => {
        const expFill = focusC.mid + (focusC.mid * focusC.spreadPct) / 200;
        const frictionPct = focusC.spreadPct + focusC.thetaPerDayPct; // round-trip spread + one day theta, % of premium
        const tone: Tone = frictionPct < 8 ? 'bull' : frictionPct <= 16 ? 'warn' : 'bear';
        const state = frictionPct < 8 ? 'Edge survives costs' : frictionPct <= 16 ? 'Costs are a real drag' : 'Costs dominate the edge';
        const sentence = `A round trip plus a day of theta runs about ${frictionPct.toFixed(1)}% of the premium — a limit near $${focusC.mid.toFixed(2)} keeps the spread off your entry.`;
        return { expFill, frictionPct, tone, state, sentence };
      })()
    : null;

  /* The engine's verdict at ITS OWN number — the 1σ expected move vs the
     breakeven move. This was the old scale's "Needs / expected" column. */
  const covers = focusC
    ? (() => {
        const needs = focusC.breakevenMovePct;
        const expected = focusC.expectedMovePct;
        const clears = expected >= needs;
        const gap = Math.abs(expected - needs);
        // 50% mark = parity (expected == needs); full = 2x coverage
        const pct = Math.min(100, (expected / Math.max(needs, 0.05)) * 50);
        const sentence = clears
          ? `The 1σ expected move of ±${expected.toFixed(1)}% clears the ±${needs.toFixed(1)}% breakeven with ${gap.toFixed(1)}% to spare — the math works without a tail.`
          : `The 1σ expected move of ±${expected.toFixed(1)}% falls ${gap.toFixed(1)}% short of the ±${needs.toFixed(1)}% breakeven — this pays only on a tail.`;
        return { needs, expected, clears, gap, pct, sentence };
      })()
    : null;



  return (
    <div className="flex flex-col gap-4">
      {/* The chain, or the read — ONE surface below the search line
          (Noah, 2026-08-09: "the options chain suits the weigher more...
          users cannot go directly to the options chain and see the contract
          they want with a full analysis on it"). Browse: the expiry rail +
          the chain, full width. Named a contract (chain click or the search
          line): the prev full-analysis layout — SignalMonitor left, the
          chain kept at hand on the right. */}
      {analysis && focusC && analysisSetup ? (
        /* NO contract key here — switching contracts must breathe, not
           remount (remount restarted every meter and number from zero: the
           glitch Noah flagged). The slow soft-in covers only the browse→
           analysis MOUNT; contract changes dip-and-settle via weighBreath. */
        <motion.div animate={weighBreath} className="flex flex-col gap-4 animate-soft-in-slow">
          {/* Weigh header — verdict badge, contract name, and the composite
              as a bar-only meter (the grade number is engine-internal). */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setAnalysis(null)}
              className="group inline-flex items-center gap-1.5 border border-borderSubtle hover:border-borderMuted rounded-md px-2.5 py-1.5 font-mono text-[11px] text-textSecondary hover:text-textPrimary transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-200 ease-out group-hover:-translate-x-0.5" /> Back
            </button>
            <SignalBadge tone={verdictTone[focusC.verdict]} dot>
              {VERDICT_LABEL[focusC.verdict]}
            </SignalBadge>
            {/* Prose can't glide — the name and calendar crossfade, keyed by
                the contract; everything numeric around them rolls. */}
            <span key={focusC.id} className="font-mono text-sm font-bold text-textPrimary animate-soft-in">
              {focusC.ticker} {focusC.strike} {focusC.right}
            </span>
            <span key={`cal-${focusC.id}`} className="font-mono text-[10px] text-textMuted tnum animate-soft-in">
              {focusC.expiryWeekday} {focusC.expiryLabel} · {focusC.sessionsLeft} session{focusC.sessionsLeft === 1 ? '' : 's'}
            </span>
            {/* The composite as a METER — bar only, in the verdict's color.
                The figure itself is engine-internal (Noah, 2026-08-16): the
                bar's reach and the verdict badge are the whole read. */}
            <span className="ml-auto inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-2.5 border border-borderSubtle bg-panel rounded-md px-3 py-1.5">
                <span className="font-mono text-[9px] uppercase tracking-widest text-textSecondary">Weighs</span>
                <span className="w-24 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <span
                    className={`block h-full rounded-full transition-[width,background-color] duration-700 ease-out ${
                      focusC.verdict === 'BUY' ? 'bg-bull/90' : focusC.verdict === 'WATCH' ? 'bg-warn/80' : 'bg-bear/75'
                    }`}
                    style={{ width: `${focusC.composite}%` }}
                  />
                </span>
              </span>
              <span className="inline-flex items-center gap-2 border border-borderSubtle bg-panel rounded-md px-3 py-1.5">
                <span className="font-mono text-[9px] uppercase tracking-widest text-textSecondary">Premium</span>
                <span className="font-mono text-[13px] font-bold tnum text-textPrimary">
                  <AnimatedNumber value={focusC.mid} format={v => `$${v.toFixed(2)}`} flash />
                </span>
              </span>
            </span>
          </div>

          {/* Provenance — when the desk first weighed this contract. The
              composite itself is engine-internal (Noah, 2026-08-16). */}
          <p className="-mt-1 font-mono text-[11px] text-textSecondary">
            Weighed on the <span className="text-textPrimary tnum">{analysis.gradedAt}</span> sweep · reading live since
          </p>

          {/* items-STRETCH: both columns run to one bottom line — the tools
              absorb the left column's slack the way the chain fills the right
              (Noah, 2026-08-09: the void under the strip read as dead space). */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
            <div className="xl:col-span-7 min-w-0 flex flex-col gap-4">
              <Panel
                title={
                  <span className="inline-flex items-center gap-1.5">
                    <Scale className="w-3.5 h-3.5" /> Why it weighs what it weighs
                  </span>
                }
                subtitle="six reads, one verdict — each bar is one factor's pull"
                tone={verdictTone[focusC.verdict]}
              >
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2.5">
                    {focusC.factors.map(f => (
                      <FactorRow key={f.key} label={f.label} score={f.score} detail={f.detail} fadeKey={focusC.id} />
                    ))}
                  </div>
                  <div className="border-t border-borderSubtle pt-3 flex flex-col gap-2">
                    <p key={`edge-${focusC.id}`} className="text-[13px] leading-relaxed animate-soft-in">
                      <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-bull mr-2">Edge</span>
                      <span className="text-textPrimary">
                        <RichRead text={focusC.edge} />
                      </span>
                    </p>
                    <p key={`risk-${focusC.id}`} className="text-[13px] leading-relaxed animate-soft-in">
                      <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-bear mr-2">Risk</span>
                      <span className="text-textPrimary">
                        <RichRead text={focusC.risk} />
                      </span>
                    </p>
                  </div>
                </div>
              </Panel>

              <Panel title="The contract" subtitle="what it costs to hold and what has to happen">
                <ContractFacts setup={analysisSetup} spot={snapshot.spot} className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4" />
              </Panel>

              {/* WORK THE CONTRACT — the desk's own reads, NO INPUTS (Noah,
                  2026-08-09: users see what's available and what we think —
                  the what-if/size/hold dials are gone). Two judgments remain:
                  what friction eats, and whether the expected move covers the
                  breakeven. Rows share one height via Instrument h-full. */}
              <div className="flex-1 min-h-0 flex flex-col gap-2">
                <div className="flex items-baseline gap-2.5 flex-wrap">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-textSecondary">Work the contract</span>
                  <span className="font-mono text-[10px] text-textMuted tnum">
                    {focusC.ticker} {focusC.strike} {focusC.right} · {focusC.expiryWeekday} {focusC.expiryLabel}
                  </span>
                </div>
                {/* flex-1 + grid's default align-content:stretch — the card
                    row grows to eat the slack, so the cards and the stronger-
                    option strip land on the chain's bottom line. */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {cost && (
                    <Instrument title="Cost to capture" badge={<SignalBadge tone={cost.tone}>{cost.state}</SignalBadge>}>
                      <div className="grid grid-cols-3 gap-x-3">
                        <Fig label="Fill at ask" value={`$${cost.expFill.toFixed(2)}`} />
                        <Fig label="Spread r/t" value={`${focusC.spreadPct.toFixed(1)}%`} tone={focusC.spreadPct >= 4 ? 'text-warn' : 'text-textPrimary'} />
                        <Fig label="Theta / day" value={`${focusC.thetaPerDayPct.toFixed(1)}%`} tone={focusC.thetaPerDayPct >= 4 ? 'text-warn' : 'text-textPrimary'} />
                      </div>
                      <p className="text-[12px] text-textPrimary leading-snug">
                        <RichRead text={cost.sentence} />
                      </p>
                    </Instrument>
                  )}

                  {covers && (
                    <Instrument
                      title="Expected vs breakeven"
                      badge={
                        <SignalBadge tone={covers.clears ? 'bull' : 'bear'}>
                          {covers.clears ? 'Expected move covers it' : 'Needs a tail'}
                        </SignalBadge>
                      }
                    >
                      <div className="grid grid-cols-2 gap-x-3">
                        <Fig label="Needs" value={`±${covers.needs.toFixed(1)}%`} tone="text-warn" />
                        <Fig label="Expected (1σ)" value={`±${covers.expected.toFixed(1)}%`} tone={covers.clears ? 'text-bull' : 'text-bear'} />
                      </div>
                      {/* The old scale's covers-bar: the white tick is parity
                          (expected == needs); a bar past it clears breakeven
                          inside one expected move. */}
                      <span className="relative w-full h-[4px] rounded-full bg-white/[0.07] overflow-hidden">
                        <span
                          className={`block h-full rounded-full ${METER_GLIDE} ${covers.clears ? 'bg-bull/80' : 'bg-bear/70'}`}
                          style={{ width: `${covers.pct}%` }}
                        />
                        <span className="absolute inset-y-0 left-1/2 w-px bg-white/40" />
                      </span>
                      <p className="text-[12px] text-textPrimary leading-snug">
                        <RichRead text={covers.sentence} />
                      </p>
                    </Instrument>
                  )}
                </div>
            {/* Stronger option in the same direction — same sleeve, same clock */}
            <div className="border border-borderSubtle bg-inset rounded-md px-3.5 py-3 flex items-center gap-3 flex-wrap">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-textMuted shrink-0">Stronger option?</span>
              {alt ? (
                <button
                  onClick={() => openAnalysis(alt.strike, alt.right, alt.dte)}
                  className="flex items-center gap-2 rounded-md border border-bull/40 bg-bull/[0.07] px-3 py-2 text-left hover:bg-bull/[0.12] transition-colors"
                >
                  <span className="font-mono text-[12px] font-bold text-bull">
                    {alt.strike} {alt.right}
                  </span>
                  <span className="text-[11px] text-textPrimary leading-snug">
                    Stronger expression in this direction — clears its breakeven with more room.
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-bull shrink-0" />
                </button>
              ) : (
                <p className="text-[12px] text-textMuted leading-snug">Nothing on the scale outweighs the one you're looking at.</p>
              )}
            </div>
              </div>
            </div>

            <div className="xl:col-span-5 min-w-0 flex flex-col gap-2">
              <ExpiryRail chips={railChips} value={railDte} onChange={setRailDte} />
              {/* Same fast fade as the browse chain on expiry changes; flex-1
                  so the chain stretches when the LEFT column runs taller. */}
              <div key={`chain-${railDte}`} className="flex-1 min-h-0 flex flex-col animate-soft-in">
                <ContractChainView
                  data={chain}
                  selected={{ ticker: snapshot.ticker, strike: analysis.strike, right: analysis.right }}
                  onSelect={handleChainSelect}
                />
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        /* Two clocks, two keys (Noah, 2026-08-09 — both changes hard-cut and
           read as buffering): a TICKER change swaps the whole view on the
           slow soft-in; an EXPIRY change re-fades only the CHAIN on the fast
           one — the rail must never blink under the cursor that clicked it. */
        <div key={`browse-${snapshot.ticker}`} className="flex flex-col gap-2 animate-soft-in-slow">
          <ExpiryRail chips={railChips} value={railDte} onChange={setRailDte} />
          <div key={`chain-${railDte}`} className="animate-soft-in">
            <ContractChainView data={chain} selected={null} onSelect={handleChainSelect} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ContractWeigher;
