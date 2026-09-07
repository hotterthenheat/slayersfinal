/*
==================================================
  SLAYER TERMINAL - LANDING LIVE SECTIONS
  The marketing page mounts the real panels, running
  on the same simulator as the terminal: a heatmap
  that pulses, a tape that prints, a setup card that
  breathes. Nothing here is a screenshot.
==================================================
*/

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import ErrorBoundary from '../../components/ui/ErrorBoundary';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { buildGexView, fmtUsd, pulseMatrix } from '../../data/gex';
import { buildExposureProfile } from '../../data/exposure';
import { buildPulseView } from '../../data/pulse';
import { buildCompassView } from '../../data/compass';
import { enrichPrint } from '../../data/tape';
import GexMatrix from '../../components/gex/GexMatrix';
import PositioningMap from '../../components/gex/PositioningMap';
import KeyLevelsRail from '../../components/gex/KeyLevelsRail';
import StrikeChart from '../../components/gex/StrikeChart';
import TiltBox from './TiltBox';
import Reveal from './Reveal';
import WorkspaceLoop, { type WorkspaceTile } from './WorkspaceLoop';
import type { MarketSnapshot } from '../../types/market';
import type { PulseView, ExposureProfileData, GexMatrixData, GexView } from '../../types/gex';
import { VERDICT_LABEL, type Setup, type CompassView } from '../../types/compass';

const SCAN_INTERVAL_MS = 10_000;

interface LandingCtx {
  ticker: string;
  /** Bumps on every live tick — StrikeChart uses it to refresh candles */
  revision: number;
  /** Live 1.5s tick — feeds the tape demo */
  snapshot: MarketSnapshot;
  gex: GexView;
  /** Strike × expiry heat with the 1s live pulse applied */
  matrix: GexMatrixData;
  exposure: ExposureProfileData;
  pulse: PulseView;
  setups: CompassView;
}

/** True once the live block is near the viewport. A reader parked on the hero
    pays nothing: the demos' 1s pulse + market ticks re-render every section
    ~2x/sec (100ms+ of main-thread work each) — that was the periodic jolt on
    the hero. Real browsers get an IO callback immediately with the initial
    state, so the fallback timer only fires in embedded webviews where IO is
    dead (the preview pane) — there the demos run unconditionally, as before.
    Latches on: once awake, stays awake. */
function useNearViewport(ref: RefObject<HTMLDivElement | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }

    let sawCallback = false;
    let woken = false;
    const wake = () => {
      if (woken) return;
      woken = true;
      setNear(true);
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
    };

    /*
      AN OBSERVER REPORTS CHANGES, AND SCROLLING PAST A 1px SENTINEL IS NOT
      ONE.

      The `boundingClientRect.top < 0` arm below was written for "already
      above the viewport", and for the case it names — a mid-page reload —
      it works, because `observe()` delivers one callback with the initial
      state. What it could not catch was the reader ARRIVING there after
      mount: the sentinel goes from ratio 0 below the fold to ratio 0 above
      it, the ratio never changes, no callback is delivered, and the arm
      never runs. Measured on the built page: 200px wheel steps woke all
      seven panels; one jump to y=6000 woke none, 900px steps woke none, and
      scrolling to y=1000 and stopping woke none. So every reader who drags
      the scrollbar, presses End, flicks a trackpad or follows a link into
      the middle of the page got empty boxes under the sentence "Not
      screenshots. The actual panels, printing." — the page's whole claim,
      unrendered, on the surface where it does the most work.

      A scroll listener is the backstop the observer cannot be. It costs one
      passive handler that removes itself the first time it fires true, and
      it asks the only question that matters: is the block at or above the
      fold yet.
    */
    const passed = () => el.getBoundingClientRect().top < window.innerHeight * 0.85;
    const onScroll = () => {
      if (passed()) wake();
    };

    const io = new IntersectionObserver(
      entries => {
        sawCallback = true;
        if (entries.some(e => e.isIntersecting || e.boundingClientRect.top < 0)) wake();
      },
      // Ignore the sliver of this block that peeks above the fold at rest.
      { rootMargin: '0px 0px -15% 0px' }
    );
    io.observe(el);
    window.addEventListener('scroll', onScroll, { passive: true });
    /* Restoration can land past it before a single scroll event fires. */
    if (passed()) wake();

    const fallback = window.setTimeout(() => {
      if (!sawCallback) wake();
    }, 1600);
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      clearTimeout(fallback);
    };
  }, [ref]);
  return near;
}

/** Same two-tier cadence as the terminal: 10s scan structure, 1s heat pulse.
    Idle until `enabled` — see useNearViewport. */
function useLandingScan(enabled: boolean): LandingCtx | null {
  const { marketData } = useMarketData();

  const revRef = useRef(0);
  const revision = useMemo(() => ++revRef.current, [marketData]);

  const [scan, setScan] = useState<MarketSnapshot | null>(null);
  const scanRef = useRef<MarketSnapshot | null>(null);
  const lastScanRef = useRef(0);
  useEffect(() => {
    if (!enabled || !marketData) return;
    const now = Date.now();
    const due =
      !scanRef.current ||
      now - lastScanRef.current >= SCAN_INTERVAL_MS ||
      scanRef.current.ticker !== marketData.ticker;
    if (due) {
      scanRef.current = marketData;
      lastScanRef.current = now;
      setScan(marketData);
    }
  }, [marketData, enabled]);

  const [pulseTick, setPulseTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setPulseTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [enabled]);

  const base = useMemo(() => {
    if (!scan) return null;
    const gex = buildGexView(scan, 'GEX', 10);
    return {
      ticker: scan.ticker,
      gex,
      exposure: buildExposureProfile(scan, '0DTE', 10),
      pulse: buildPulseView(scan),
      setups: buildCompassView(scan, 'top-setups', Simulator.universeQuotes(scan.ticker)),
    };
  }, [scan]);

  return useMemo(() => {
    if (!base || !marketData) return null;
    return {
      ...base,
      revision,
      snapshot: marketData,
      matrix: pulseMatrix(base.gex.matrix, pulseTick),
    };
  }, [base, marketData, revision, pulseTick]);
}

/** Demo-only hotter color scale: the real page normalizes against the single
    largest cell, which leaves most of the matrix gray. Compressing maxAbs
    saturates the pastel ramp so the identity reads at marketing distance. */
const hotMatrix = (matrix: GexMatrixData): GexMatrixData => ({
  ...matrix,
  maxAbs: matrix.maxAbs * 0.32,
});

// ---- shared chrome ----------------------------------------------------------

/*
  13 — "RUNNING", NOT "LIVE".

  The pulse is honest: these panels really are updating in front of the
  reader, driven by the same engines the desk runs on. The WORD was not.
  "Live" beside a chart of prices is a claim about a market feed, and this
  page has none — the pricing FAQ two sections down says so in as many
  words, which made the pill the one thing on the landing contradicting the
  page's own answer.

  "Running · demo data" keeps what was true (it moves, by itself, now) and
  drops what was not. The dot stays because the dot was never the lie.
*/
const LivePill = () => (
  <span
    className="inline-flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-widest text-select"
    title="These panels run on the desk's own engines with demo data — there is no market feed on this page."
  >
    <span className="w-1.5 h-1.5 rounded-full bg-select animate-pulse" />
    Running · demo data
  </span>
);

interface EngineBoxProps {
  name: string;
  line: string;
  accent: string;
  to: string;
  children: React.ReactNode;
}

const EngineBox = ({ name, line, accent, to, children }: EngineBoxProps) => (
  <TiltBox quoted className="flex flex-col">
    <div className="flex items-center gap-2.5 px-4 h-11 border-b border-borderSubtle shrink-0">
      <span className={`w-1.5 h-1.5 rounded-full ${accent}`} />
      <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-textPrimary">{name}</span>
      <span className="hidden sm:block text-[11px] text-textSecondary truncate">{line}</span>
      <Link
        to={to}
        className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-select transition-colors"
      >
        Open <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
    <div className="flex-grow min-h-0 relative">{children}</div>
  </TiltBox>
);

// ---- box demos ---------------------------------------------------------------

/** Mini tape driven by the live 1.5s tick — rows slide in as prints land. */
const DemoTape = ({ snapshot }: { snapshot: MarketSnapshot }) => {
  const prints = useMemo(
    () => snapshot.tape.slice(0, 7).map((o, i) => enrichPrint(o, i)),
    [snapshot.tape]
  );
  return (
    <div className="h-full overflow-hidden select-none">
      <AnimatePresence initial={false} mode="popLayout">
        {prints.map(p => (
          <motion.div
            key={`${p.time}-${p.ticker}-${p.strike}${p.right}-${p.size}`}
            layout
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-2.5 px-4 h-[38px] border-b border-borderSubtle/40"
          >
            <span className="font-mono text-[10px] text-textMuted tnum shrink-0">{p.time}</span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold shrink-0 ${
                p.right === 'C' ? 'border-bull/30 bg-bull/10 text-bull' : 'border-bear/30 bg-bear/10 text-bear'
              }`}
            >
              {p.ticker} {p.strike}{p.right}
            </span>
            <span className="font-mono text-[11px] text-textPrimary tnum shrink-0">
              {p.size} <span className="text-textMuted">@</span> {p.fill.toFixed(2)}
            </span>
            <span className="ml-auto font-mono text-[11px] font-semibold text-textPrimary tnum shrink-0">
              {fmtUsd(p.premium)}
            </span>
            {p.sweep && (
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-warn shrink-0">Sweep</span>
            )}
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[9px] font-bold shrink-0 ${
                p.side === 'ASK'
                  ? 'bg-bull/90 text-[#0a0a0a]'
                  : p.side === 'BID'
                    ? 'bg-bear/80 text-[#0a0a0a]'
                    : 'bg-white/10 text-textSecondary'
              }`}
            >
              {p.side === 'ASK' ? 'BUY' : p.side === 'BID' ? 'SELL' : 'MID'}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

/** Compass top pick, confidence bar and all — the real grading, live. */
const DemoSetup = ({ setups }: { setups: CompassView }) => {
  const setup = useMemo<Setup | null>(() => {
    const flat = setups.groups.flatMap(g => g.setups);
    return flat.find(s => s.topRated) ?? flat[0] ?? null;
  }, [setups]);
  if (!setup) return null;
  const bull = setup.right === 'C';
  return (
    <div className="h-full p-4 flex flex-col gap-3 select-none">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold ${
            bull ? 'border-bull/30 bg-bull/10 text-bull' : 'border-bear/30 bg-bear/10 text-bear'
          }`}
        >
          {setup.contract}
        </span>
        <span className="inline-flex items-center rounded px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider bg-[#EA00FF]/10 text-[#EA00FF]">
          Top pick
        </span>
        <span
          className="ml-auto inline-flex items-center rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]"
          style={{ background: bull ? 'rgba(48,209,88,0.92)' : 'rgba(255,59,48,0.85)' }}
        >
          {VERDICT_LABEL[setup.verdict]}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Confidence', value: `${setup.confidence}%` },
          { label: 'Premium', value: `$${setup.mid.toFixed(2)}` },
          {
            label: 'Exp. move',
            value: `${setup.expectedMovePct >= 0 ? '+' : ''}${setup.expectedMovePct}%`,
            tone: setup.expectedMovePct >= 0 ? 'text-bull' : 'text-bear',
          },
        ].map(cell => (
          <div key={cell.label} className="border border-borderSubtle rounded-md px-2.5 py-2">
            <span className="block font-mono text-[9px] uppercase tracking-widest text-textMuted">{cell.label}</span>
            <span className={`block mt-0.5 font-mono text-[15px] font-bold tnum ${cell.tone ?? 'text-textPrimary'}`}>
              {cell.value}
            </span>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Confidence</span>
          <span className="font-mono text-[11px] font-semibold text-textPrimary tnum">{setup.confidence}%</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'rgba(48,209,88,0.92)' }}
            animate={{ width: `${setup.confidence}%` }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>

      <p className="text-[11px] text-textSecondary leading-relaxed line-clamp-3">{setup.whyText}</p>
    </div>
  );
};

// ---- the sections ------------------------------------------------------------

const SectionKicker = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-textSecondary">{children}</span>
);

/** "Same card, opposite call" — one real setup shown in both of its states. */
const EnterExitStory = ({ ctx }: { ctx: LandingCtx }) => {
  const [mode, setMode] = useState<'ACTIVE' | 'FADING'>('ACTIVE');
  const lockedRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      if (!lockedRef.current) setMode(m => (m === 'ACTIVE' ? 'FADING' : 'ACTIVE'));
    }, 4500);
    return () => clearInterval(id);
  }, []);

  const setup = useMemo<Setup | null>(() => {
    const flat = ctx.setups.groups.flatMap(g => g.setups);
    return flat.find(s => s.verdict === 'ENTER') ?? flat[0] ?? null;
  }, [ctx.setups]);
  if (!setup) return null;

  const entering = mode === 'ACTIVE';
  const bull = setup.right === 'C';
  const confidence = entering ? setup.confidence : Math.max(4, 100 - setup.confidence);

  return (
    <section className="px-6 md:px-10 py-20 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
      <Reveal>
        <SectionKicker>Finding trades is easy</SectionKicker>
        <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">It calls the fade, too.</h2>
        <p className="mt-4 text-[15px] text-textSecondary leading-relaxed max-w-md">
          Most tools flag a setup and go quiet. Here, the card that went ACTIVE keeps watching its own
          thesis — and when the structure under it breaks, it turns red and says FADING. This is one real
          card from the terminal, shown in both of its states.
        </p>
        <div className="mt-6 inline-flex rounded-md border border-borderSubtle overflow-hidden">
          {(['ACTIVE', 'FADING'] as const).map(m => (
            <button
              key={m}
              onClick={() => {
                lockedRef.current = true;
                setMode(m);
              }}
              className={`px-4 py-1.5 font-mono text-[12px] font-bold uppercase tracking-wider transition-colors ${
                mode === m ? 'text-[#0a0a0a]' : 'text-textSecondary hover:text-textPrimary'
              }`}
              style={
                mode === m
                  ? { background: m === 'ACTIVE' ? 'rgba(48,209,88,0.92)' : 'rgba(255,59,48,0.85)' }
                  : undefined
              }
            >
              {m}
            </button>
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.12}>
      <TiltBox quoted maxTilt={5} className="p-0">
        <div className="flex items-center gap-2.5 px-4 h-11 border-b border-borderSubtle">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-textMuted">The setup</span>
          <span className="font-mono text-[11px] font-semibold text-textPrimary">{setup.contract}</span>
          <span className="ml-auto">
            <LivePill />
          </span>
        </div>
        <div className="p-5 min-h-[290px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <h3
                className="font-mono text-[18px] font-bold tracking-tight"
                style={{ color: entering ? '#30D158' : '#FF3B30' }}
              >
                {entering ? `ACTIVE — STRONG ${bull ? 'CALL' : 'PUT'} STRUCTURE` : 'FADING — THESIS DEGRADING'}
              </h3>
              <p className="mt-3 text-[12px] text-textSecondary leading-relaxed">
                {entering
                  ? setup.whyText
                  : `${setup.invalidationReason} is gone below $${setup.invalidationPrice.toFixed(2)} — the floor this
                     entry stood on no longer holds. The engine downgrades the card and tells you to step aside.`}
              </p>

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Confidence</span>
                  <span className="font-mono text-[11px] font-semibold text-textPrimary tnum">{confidence}%</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    initial={false}
                    animate={{
                      width: `${confidence}%`,
                      background: entering ? 'rgba(48,209,88,0.92)' : 'rgba(255,59,48,0.85)',
                    }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2">
                {[
                  { label: 'Delta', value: setup.greeks.delta.toFixed(2) },
                  { label: 'Gamma', value: setup.greeks.gamma.toFixed(4) },
                  { label: 'Theta', value: setup.greeks.theta.toFixed(2), tone: 'text-warn' },
                  { label: 'IV', value: `${setup.greeks.iv.toFixed(1)}%` },
                ].map(g => (
                  <div key={g.label} className="border border-borderSubtle rounded-md px-2 py-1.5">
                    <span className="block font-mono text-[9px] uppercase tracking-widest text-textMuted">{g.label}</span>
                    <span className={`block mt-0.5 font-mono text-[12px] font-semibold tnum ${g.tone ?? 'text-textPrimary'}`}>
                      {g.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Thesis chips removed (Noah, 2026-08-17) — the landing demo
                  mirrors the real card, which no longer carries them. */}
            </motion.div>
          </AnimatePresence>
        </div>
      </TiltBox>
      </Reveal>
    </section>
  );
};

// ---- chart showcase (the "first product hit" right after the hero) ---------

/** Floating callout chip pinned over the showcase frame. */
const FloatChip = ({
  label,
  dot,
  className,
  delay = 0,
}: {
  label: string;
  dot: string;
  className: string;
  delay?: number;
}) => (
  <motion.span
    animate={{ y: [0, -6, 0] }}
    transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut', delay }}
    className={`absolute z-20 inline-flex items-center gap-2 rounded-full border border-borderMuted bg-[#0c0c0c]/90 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-textPrimary shadow-lg shadow-black/50 pointer-events-none ${className}`}
  >
    <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
    {label}
  </motion.span>
);

/** Skylit's "Atlas" pattern, done live: a big framed chart — actually running. */
const ChartShowcase = ({ ctx }: { ctx: LandingCtx | null }) => (
  <section id="showcase" className="px-6 md:px-10 pt-24 pb-20 max-w-6xl mx-auto">
    <Reveal className="text-center">
      <SectionKicker>Charting</SectionKicker>
      <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">
        The chart that knows where dealers stand.
      </h2>
      <p className="mt-4 text-[15px] text-textSecondary leading-relaxed max-w-xl mx-auto">
        Walls, the gamma flip, the supreme strike — drawn straight on the candles and repriced as the
        session moves. This isn&apos;t a screenshot; it&apos;s the terminal&apos;s chart, running here on
        demo data.
      </p>
    </Reveal>

    <Reveal delay={0.1} className="relative mt-10">
      {!ctx ? (
        <div className="h-[430px] border border-borderSubtle bg-panel rounded-lg animate-pulse" />
      ) : (
        <>
          <FloatChip label="Dealer walls" dot="#30D158" className="top-5 right-6" />
          <FloatChip label="Gamma flip" dot="#7DD3FC" className="top-1/2 -left-2 md:left-4" delay={1.4} />
          <FloatChip label="Supreme strike" dot="#EA00FF" className="bottom-8 right-10" delay={2.6} />
          <TiltBox quoted maxTilt={2} glare={false} className="p-3">
            <StrikeChart
              ticker={ctx.ticker}
              revision={ctx.revision}
              levels={ctx.gex.levels}
              timeframe="1m"
              height={400}
            />
          </TiltBox>
        </>
      )}
      <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-widest text-textMuted">
        live tick feed · levels on a 10s scan
      </p>
    </Reveal>
  </section>
);

// ---- marquee + pillars -------------------------------------------------------

const TERMS = [
  'Call wall',
  'Put wall',
  'Gamma flip',
  'Supreme strike',
  'Net GEX',
  'DEX',
  'VEX',
  'Pin zones',
  'Dark pool',
  '0DTE levels',
  'Ranked strikes',
  'Expected move',
  'Whale sweeps',
  'Options tape',
];

const MarqueeHalf = () => (
  <div className="flex shrink-0">
    {TERMS.map(t => (
      <span
        key={t}
        className="flex items-center font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-textMuted whitespace-nowrap"
      >
        <span className="px-6">{t}</span>
        <span className="text-borderMuted select-none">·</span>
      </span>
    ))}
  </div>
);

const Marquee = () => (
  <div className="border-y border-borderSubtle py-3.5 overflow-hidden" aria-hidden>
    <div className="flex w-max animate-marquee">
      <MarqueeHalf />
      <MarqueeHalf />
    </div>
  </div>
);

/*
  THREE COUNTERS, NOT THREE READINGS.

  These carried `text-select`, `text-flip` and `text-bear` — three of the
  desk's semantic tokens, on the numerals 01, 02 and 03. Only one of the
  three was true: the flip's blue is the flip's colour everywhere in the
  product. The other two were decoration wearing a uniform, and one of them
  said something false — "The flow" printed in bear red, on the page whose
  job is to teach a reader that red means price going down before they ever
  open a desk.

  A counter is not a direction. All three are ink now, and the pillars say
  what they are in words, which is what they were already doing.
*/
const PILLARS = [
  {
    n: '01',
    title: 'The walls',
    body: 'Dealer hedging piles up at a handful of strikes — the call and put walls that cap and floor the move.',
  },
  {
    n: '02',
    title: 'The flip',
    body: 'Above it, dealer hedging calms the market. Below it, it chases the move. Crossing it changes the whole day.',
  },
  {
    n: '03',
    title: 'The flow',
    body: 'Sweeps, blocks and dark-pool prints — positioning that shows up on the tape before it shows up in price.',
  },
];

const Pillars = () => (
  <section className="px-6 md:px-10 py-20 max-w-6xl mx-auto">
    <Reveal>
      <SectionKicker>What the terminal reads</SectionKicker>
      <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">Price doesn't move randomly.</h2>
      <p className="mt-4 text-[15px] text-textSecondary leading-relaxed max-w-2xl">
        Options dealers have to hedge, and their hedging concentrates around a few price levels every
        session — mechanically. That structure is what actually pushes and pins price. Slayer maps it
        live, then grades the contracts that trade it.
      </p>
    </Reveal>
    <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-8">
      {PILLARS.map((p, i) => (
        <Reveal key={p.n} delay={0.08 + i * 0.08} className="border-l border-borderSubtle pl-5">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-[10px] font-bold text-textMuted tnum">{p.n}</span>
            <h3 className="text-[15px] font-bold text-textPrimary tracking-tight">{p.title}</h3>
          </div>
          <p className="mt-2.5 text-[12px] text-textSecondary leading-relaxed">{p.body}</p>
        </Reveal>
      ))}
    </div>
  </section>
);

/** The whole live block: one scan context feeds every demo below the hero. */
/**
 * One landing section, on its own fuse.
 *
 * `resetKey` is the scan context rather than a counter: a section that threw
 * on one bad tick is given the next one, which is the shape of fault these
 * demos actually have — they re-render off a simulator that moves every
 * second, so a transient is far likelier than a permanent break.
 */
const SectionGuard = ({ label, ctx, children }: { label: string; ctx: unknown; children: ReactNode }) => (
  <ErrorBoundary label={label} resetKey={ctx ? 'scan' : 'cold'}>
    {children}
  </ErrorBoundary>
);

const LiveSections = () => {
  const wakeRef = useRef<HTMLDivElement | null>(null);
  const enabled = useNearViewport(wakeRef);
  const ctx = useLandingScan(enabled);

  return (
    <div className="relative">
      {/* Wake sentinel — the demos start ticking once the reader scrolls here */}
      <div ref={wakeRef} className="absolute top-0 h-px w-px" aria-hidden />
      {/*
        0.6 / 13 — ONE DEMO MUST NOT TAKE THE PAGE.

        The route already has a boundary around the whole landing, which
        means a throw anywhere inside these five sections replaces the
        ENTIRE page — the hero, the pricing, the sign-up — with a fault
        card. On a marketing page that is the most expensive possible
        failure: the reader is deciding whether to trust the product and
        they are shown a crash instead of it.

        These are the desk's real components running the desk's real
        engines, which is the point of the section and also the reason each
        one is a genuine place a render can throw. A boundary per section
        costs nothing when nothing throws and costs one section when one
        does. `resetKey` is the scan context, so a section that faulted on a
        bad tick recovers on the next one rather than staying broken until
        a reload.
      */}
      <SectionGuard label="The chart showcase" ctx={ctx}>
        <ChartShowcase ctx={ctx} />
      </SectionGuard>
      <Marquee />
      <Pillars />

      <SectionGuard label="The live panels" ctx={ctx}>
      <section id="live" className="px-6 md:px-10 py-20 max-w-6xl mx-auto">
        <Reveal>
          <div className="flex items-baseline gap-3 flex-wrap">
            <SectionKicker>The terminal, live</SectionKicker>
            {/* 13 — "Live sections MUST BE LABELED AS DEMO DATA."

                This read "live feed", which is a claim about the market and
                not one this page can make: the panels are genuinely the
                product's own, genuinely recomputing every second, and the
                numbers in them come from the desk's simulator rather than
                from an exchange. A visitor reading "live feed" on a pricing
                page will reasonably believe they are watching the market.

                The impressive part survives intact and is what the heading
                already says — these are the actual panels, running. The
                sentence just stops claiming the other thing. */}
            <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">
              these panels are running right now · <span className="text-warn/90">demo data</span>
            </span>
          </div>
          <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight max-w-2xl">
            Not screenshots. The actual panels, printing.
          </h2>
        </Reveal>

        {!ctx ? (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-5">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-[340px] border border-borderSubtle bg-panel rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <Reveal delay={0.1} className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="h-[340px]">
                <EngineBox
                  name="Pinpoint"
                  line="Strike × expiry heat — repriced every second"
                  accent="bg-select"
                  to="/pinpoint/levels"
                >
                  <div className="h-full p-2 pointer-events-none select-none">
                    <GexMatrix data={hotMatrix(ctx.matrix)} spot={ctx.gex.levels.spot} />
                  </div>
                </EngineBox>
              </div>
              <div className="h-[340px]">
                <EngineBox
                  name="Compass"
                  line="Setups graded 0–100, in plain English"
                  accent="bg-[#EA00FF]"
                  to="/compass"
                >
                  <DemoSetup setups={ctx.setups} />
                </EngineBox>
              </div>
              <div className="h-[340px]">
                <EngineBox
                  name="Trace"
                  line="The tape, with the noise removed"
                  accent="bg-darkpool"
                  to="/trace/live-tape"
                >
                  <DemoTape snapshot={ctx.snapshot} />
                </EngineBox>
              </div>
              <div className="h-[340px]">
                <EngineBox
                  name="Pulse"
                  line="Walls, pin, flip & supreme — with distance"
                  accent="bg-flip"
                  to="/pulse"
                >
                  <div className="h-full overflow-hidden select-none">
                    <KeyLevelsRail
                      rows={ctx.pulse.keyLevels}
                      maxPressure={ctx.pulse.keyLevels.reduce((a, l) => Math.max(a, l.pressure), 1)}
                    />
                  </div>
                </EngineBox>
              </div>
            </Reveal>

            {/* Full-width dealer positioning map — hover it, every strike answers */}
            <Reveal delay={0.05} className="mt-5 h-[440px]">
              <TiltBox quoted maxTilt={2.5} glare={false} className="flex flex-col">
                <div className="flex items-center gap-2.5 px-4 h-11 border-b border-borderSubtle shrink-0">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-textPrimary">
                    Dealer positioning map
                  </span>
                  <span className="hidden sm:block text-[11px] text-textSecondary">
                    net dealer pressure by strike — hover a bar, it answers
                  </span>
                  <span className="ml-auto">
                    <LivePill />
                  </span>
                </div>
                <div className="flex-grow min-h-0 p-2">
                  <PositioningMap data={ctx.exposure} />
                </div>
              </TiltBox>
            </Reveal>
          </>
        )}
      </section>
      </SectionGuard>

      {ctx && (
        <SectionGuard label="The trade walk-through" ctx={ctx}>
          <EnterExitStory ctx={ctx} />
        </SectionGuard>
      )}

      {/* ── Pulse — the real panels rearranging themselves (the Workspace
          merged into Pulse, 2026-08-17) ── */}
      {ctx && (
        <SectionGuard label="The Pulse demo" ctx={ctx}>
        <section id="pulse" className="px-6 md:px-10 py-20 max-w-6xl mx-auto">
          <Reveal className="flex flex-col md:flex-row md:items-end gap-4 mb-8">
            <div>
              <SectionKicker>Pulse</SectionKicker>
              <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">Your desk, your layout.</h2>
              {/* 13 — THE SECTION SAYS WHAT IT IS SHOWING. These are the real
                  components, and the copy is entitled to say so; what it must
                  not do is let "the live market desk" three words later read
                  as a claim that THIS page has a feed. The label rides with
                  the panels, the same way the `#live` section carries one. */}
              <p className="mt-4 text-[15px] text-textSecondary leading-relaxed max-w-xl">
                Pulse is the market desk — every panel in the terminal pulls into it. Drag,
                resize, duplicate; it saves the moment you touch it. These are the real panels,
                rearranging themselves so you don't have to imagine it — running here on{' '}
                <span className="text-warn/90">demo data</span>, not a market feed.
              </p>
            </div>
            <Link
              to="/pulse"
              className="md:ml-auto shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-borderMuted font-mono text-[12px] uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:bg-white/[0.03] transition-colors"
            >
              Open Pulse <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Reveal>
          <Reveal delay={0.1}>
          <WorkspaceLoop
            tiles={
              [
                {
                  key: 'heat',
                  title: 'GEX heatmap',
                  node: (
                    <div className="h-full p-2">
                      <GexMatrix data={hotMatrix(ctx.matrix)} spot={ctx.gex.levels.spot} />
                    </div>
                  ),
                },
                {
                  key: 'levels',
                  title: 'Key levels',
                  node: (
                    <KeyLevelsRail
                      rows={ctx.pulse.keyLevels}
                      maxPressure={ctx.pulse.keyLevels.reduce((a, l) => Math.max(a, l.pressure), 1)}
                    />
                  ),
                },
                { key: 'tape', title: 'Options tape', node: <DemoTape snapshot={ctx.snapshot} /> },
                { key: 'setup', title: 'Top setup', node: <DemoSetup setups={ctx.setups} /> },
              ] satisfies WorkspaceTile[]
            }
          />
          </Reveal>
        </section>
        </SectionGuard>
      )}
    </div>
  );
};

export default LiveSections;
