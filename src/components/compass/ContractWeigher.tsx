/*
==================================================
  SLAYER TERMINAL - WEIGH YOUR OWN (Compass pane)

  The page is a search bar. Type a contract the way
  you say it out loud and it comes back graded, with
  the arithmetic that produced the grade laid out so
  you can add it up yourself.

  What this replaced: a seven-field data-entry form
  with the search hidden inside a collapse labelled
  "Command shortcut", a strike stepper, a free
  <input type="date"> that accepted Saturdays, and two
  paragraphs that were verbatim reprints of two factor
  rows already on screen.
==================================================
*/

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Scale, Plus, Check, Target, ChevronDown, CornerDownLeft } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { useTracker } from '../../context/TrackerContext';
import {
  weighContract,
  betterAlternative,
  horizonForDte,
  type ContractVerdict,
  type Horizon,
  type WeighedContract,
} from '../../core/contractScore';
import { parseContractQuery, expiryLadder, slotValue, type QuerySlot } from '../../core/contractQuery';
import { expiryFor, type Expiry } from '../../core/calendar';
import Simulator from '../../core/simulator';
import { buildSkyVision, makeSetup } from '../../data/skyvision';
import { VERDICT_LABEL, VERDICT_TONE } from '../skyvision/verdict';
import { setupState } from '../skyvision/setupState';
import { StateBadge } from '../skyvision/StateBadge';
import type { Verdict } from '../../types/skyvision';
import type { MarketSnapshot } from '../../types/market';
import { DUR, EASE, PILL } from '../../lib/motion';
import Panel from '../ui/Panel';
import SignalBadge from '../ui/SignalBadge';
import Stat from '../ui/Stat';
import EmptyState from '../ui/EmptyState';
import SegmentedControl from '../ui/SegmentedControl';
import AnimatedNumber from '../ui/AnimatedNumber';
import SpotRule from '../ui/SpotRule';
import type { Tone } from '../ui/tones';

/**
 * One grade lexicon across the terminal. The engine keeps BUY/WATCH/FADE as
 * identifiers; every screen renders QUALIFIED / WATCH / FADED through
 * skyvision/verdict.ts. This replaced a third local map that spoke
 * STRONG/WATCH/WEAK, so one idea had three vocabularies.
 */
const GRADE_VERDICT: Record<ContractVerdict, Verdict> = { BUY: 'ENTER', WATCH: 'WATCH', FADE: 'EXIT' };

/** Why each sleeve weighs what it weighs. The weights change under the user at
    1, 10 and 90 days, and nothing on screen used to say so. */
const HORIZON_NOTE: Record<Horizon, string> = {
  LOTTO: 'On a same-day ticket the arithmetic is close to a coin flip, so the tape and the cost of getting out carry the vote.',
  WEEKLIES: 'Days, not weeks. Theta is the landlord, so decay and the math split most of the weight.',
  SWINGS: 'Two to six weeks. Math, flow and the story all get a real vote.',
  LEAPS: 'A year out. Vol pricing and the story decide it, and decay barely votes.',
};

const SLEEVE_LABEL: Record<Horizon, string> = {
  LOTTO: 'Lotto', WEEKLIES: 'Weeklies', SWINGS: 'Swings', LEAPS: 'LEAPS',
};

const dteForHorizon: Record<Horizon, number> = { LOTTO: 0, WEEKLIES: 5, SWINGS: 30, LEAPS: 365 };

/** Standard equity-option contract multiplier (shares per contract). */
const CONTRACT_MULTIPLIER = 100;
/** Listed strikes either side of spot the neighbour rail reaches for. */
const RAIL_REACH = 8;
const RECENT_KEY = 'slayer_weigher_recent';
const RECENT_MAX = 5;

/**
 * Re-price cadence. The pane owns its own beat rather than re-pricing on
 * whatever it is handed: the market snapshot republishes every 1500ms, and a
 * grade card that re-prices four hundred times a minute is the jitter the whole
 * surface was rated on. The scan tier is the honest rate for a graded contract.
 */
const REPRICE_MS = 10_000;

/**
 * Black-Scholes floors its price at $0.02 (core/contractScore.ts). Past that
 * floor the number stops being a price and starts being the floor, and
 * everything derived from it goes with it: theta over premium collapses toward
 * zero, so the decay factor reads "carryable" precisely because there is nothing
 * left to burn, and a dead strike outscores a live one. Measured on SPY at 502.80
 * today: 505C grades 73, 510C grades 59, and 520C grades 79 with a mid of $0.02
 * and a delta of 0.00.
 *
 * So the screen refuses to print a grade it cannot justify. This predicate
 * belongs on the engine as a `priceable` field, and reads only fields
 * WeighedContract already returns so it can move there without changing meaning.
 */
function isPriceable(c: WeighedContract): boolean {
  return c.mid > 0.02 && Math.abs(c.delta) >= 0.01;
}

function fmtStrike(v: number): string {
  return v % 1 === 0 ? String(v) : String(Number(v.toFixed(2)));
}

/**
 * The six contributions have to add to the headline, or the ledger is another
 * assertion rather than the arithmetic it claims to be.
 *
 * Rounding each `score × weight` on its own drifts: measured on SPY 505C at the
 * 08/03 expiry, the six rounded shares foot to 68 against a composite of 67,
 * because the engine rounds the SUM and this would round the PARTS. Largest
 * remainder settles it: floor every share, then hand the leftover points to the
 * biggest fractions. Total is exact by construction, and the point always lands
 * on the row with the strongest claim to it.
 */
function apportion(exact: number[], total: number): number[] {
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const byFraction = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; left > 0 && k < byFraction.length; k++, left--) out[byFraction[k].i] += 1;
  return out;
}

/** The canonical form of a resolution. Every picker writes one of these back
    into the field, so the text is always the address of what is on screen. */
function canonicalQuery(ticker: string, strike: number | null, right: 'C' | 'P', expiry: Expiry): string {
  return `${ticker} ${strike == null ? '' : fmtStrike(strike)}${right} ${expiry.label}`.replace(/\s+/g, ' ').trim();
}

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function writeRecents(list: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // localStorage full or unavailable — the field still works without history
  }
}

// ---- shared bits -------------------------------------------------------------

/**
 * One factor of the composite: label, weight, meter, score, and the number it
 * actually contributed. The contribution column is the point. Six rows that each
 * print `score × weight` and foot to the headline turn an asserted grade into
 * arithmetic the user can add up.
 */
const FactorRow = ({
  label,
  weight,
  score,
  detail,
  contribution,
  muted = false,
}: {
  label: string;
  weight: number;
  score: number;
  detail: string;
  contribution: number;
  muted?: boolean;
}) => (
  <div className={`flex flex-col gap-1 ${muted ? 'opacity-45' : ''}`}>
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 font-mono text-label uppercase tracking-wider text-textSecondary">{label}</span>
      <span className="font-mono text-micro text-textMuted tnum">×{weight.toFixed(2)}</span>
      <span className="flex-1 h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
        <motion.span
          className={`block h-full rounded-full ${
            muted ? 'bg-white/10' : score >= 60 ? 'data-bar' : score >= 40 ? 'bg-white/30' : 'bg-white/12'
          }`}
          initial={false}
          animate={{ width: `${score}%` }}
          transition={{ duration: DUR.data, ease: EASE }}
        />
      </span>
      <span className="w-7 shrink-0 font-mono text-caption font-semibold text-textPrimary tnum text-right">{score}</span>
      <span className="w-[4ch] shrink-0 font-mono text-caption text-textSecondary tnum text-right">
        {muted ? '—' : contribution}
      </span>
    </div>
    <p className="pl-32 text-label text-textMuted leading-snug">{detail}</p>
  </div>
);

/** Anchored picker. Closes on outside pointer-down and on Escape. */
const Popover = ({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          aria-label={label}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: DUR.quick, ease: EASE }}
          className="absolute left-0 top-full mt-1.5 z-40 min-w-[220px] border border-borderMuted bg-panel rounded-lg shadow-overlay overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const CHIP_BASE = '-my-1 py-1 px-2 rounded border font-mono text-label transition-colors';
const CHIP_TONE: Record<'typed' | 'assumed' | 'warn', string> = {
  typed: 'border-borderMuted bg-white/[0.04] text-textPrimary hover:border-borderMuted',
  assumed: 'border-dashed border-borderSubtle text-textSecondary hover:text-textPrimary',
  warn: 'border-warn/40 bg-warn/10 text-warn',
};

const toneOfSlot = (s: QuerySlot<unknown>): 'typed' | 'assumed' | 'warn' =>
  s.state === 'typed' ? 'typed' : s.state === 'assumed' ? 'assumed' : 'warn';

// ---- the neighbour rail ------------------------------------------------------

interface LadderProps {
  rows: WeighedContract[];
  spot: number;
  ticker: string;
  selectedId: string | null;
  deskPickId: string | null;
  onSelect: (c: WeighedContract) => void;
  outOfRange: { strike: number; pctFromSpot: number; low: number; high: number } | null;
}

/**
 * Listed strikes on the resolved expiry and side, spot anchored. This is a new,
 * smaller component rather than a lift of ContractChain: that one takes
 * ContractChainData from buildSkyVision rather than a MarketSnapshot, and it is
 * currently rendering at zero height in Compass review mode at xl. Only the
 * SpotRule idiom is reused.
 */
const ContractLadder = ({ rows, spot, ticker, selectedId, deskPickId, onSelect, outOfRange }: LadderProps) => {
  const crossing = rows.findIndex(r => r.strike > spot);

  return (
    <div className="flex flex-col gap-1.5">
      {outOfRange && (
        <p className="px-2 py-1.5 rounded border border-warn/40 bg-warn/10 font-mono text-label text-warn leading-snug">
          {fmtStrike(outOfRange.strike)} sits {outOfRange.pctFromSpot.toFixed(1)}%{' '}
          {outOfRange.strike > outOfRange.high ? 'above' : 'below'} the listed chain ({fmtStrike(outOfRange.low)} to{' '}
          {fmtStrike(outOfRange.high)}).
        </p>
      )}
      <div
        role="listbox"
        aria-label={`Listed strikes on ${ticker}`}
        className="flex sm:flex-col overflow-x-auto sm:overflow-x-visible sm:overflow-y-auto sm:max-h-[520px] gap-1 sm:gap-0 no-scrollbar"
      >
        {rows.map((r, i) => {
          const hasPremium = isPriceable(r);
          const selected = r.id === selectedId;
          return (
            <div key={r.id} className="contents sm:block">
              {i === crossing && (
                <div className="hidden sm:block py-1">
                  <SpotRule ticker={ticker} price={spot} />
                </div>
              )}
              <button
                role="option"
                aria-selected={selected}
                onClick={() => onSelect(r)}
                aria-label={`${fmtStrike(r.strike)} ${r.right === 'C' ? 'call' : 'put'}, mid $${r.mid.toFixed(2)}, ${
                  hasPremium ? `grades ${r.composite}` : 'not priceable'
                }`}
                className="relative shrink-0 w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-rowHover transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"
              >
                {selected && (
                  <motion.span
                    layoutId="weigher-rail-pill"
                    transition={PILL}
                    className="absolute inset-0 rounded-md bg-white/[0.06]"
                  />
                )}
                <span className="relative z-10 w-[5ch] font-mono text-caption font-semibold text-textPrimary tnum">
                  {fmtStrike(r.strike)}
                </span>
                <span className="relative z-10 w-[5ch] font-mono text-label text-textMuted tnum text-right">
                  ${r.mid.toFixed(2)}
                </span>
                <span className="relative z-10 hidden sm:block flex-1 h-[3px] rounded-full bg-white/[0.05] overflow-hidden">
                  {hasPremium && <span className="block h-full rounded-full data-bar" style={{ width: `${r.composite}%` }} />}
                </span>
                {hasPremium ? (
                  <span className="relative z-10 w-[3ch] font-mono text-caption font-semibold text-textPrimary tnum text-right">
                    {r.composite}
                  </span>
                ) : (
                  <span className="relative z-10 font-mono text-micro text-textMuted whitespace-nowrap">not priceable</span>
                )}
                {r.id === deskPickId && (
                  <SignalBadge tone="select" className="relative z-10 hidden sm:inline-flex">
                    Desk pick
                  </SignalBadge>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---- the pane ----------------------------------------------------------------

interface ContractWeigherProps {
  /**
   * Cadence source only. The pane re-prices off its own scan-tier beat and
   * builds its own snapshot for the resolved ticker, so whatever rate this
   * arrives at, the grade card does not move at it.
   */
  snapshot: MarketSnapshot;
  /** Deep-link entry point — seeds the sleeve (e.g. from Earnings). */
  initialHorizon?: Horizon;
  /** Deep-link seed, e.g. "SPY 505C 08/07". */
  initialQuery?: string;
  /** Written back on every resolve so a searched contract has an address. */
  onQueryChange?: (q: string) => void;
}

const ContractWeigher = ({ snapshot, initialHorizon, initialQuery, onQueryChange }: ContractWeigherProps) => {
  const { activeTicker, changeTicker } = useMarketData();
  const { trackContract, untrackSetup, isTracked } = useTracker();
  const listId = useId();

  const [query, setQuery] = useState(() => {
    if (initialQuery) return initialQuery;
    if (!initialHorizon) return '';
    // A sleeve deep-link is a request to see that sleeve graded, so it commits.
    const e = expiryFor(dteForHorizon[initialHorizon]);
    const atm = Math.round(snapshot.spot);
    return canonicalQuery(snapshot.ticker, atm, 'C', e);
  });
  const [picker, setPicker] = useState<'ticker' | 'strike' | 'side' | 'expiry' | null>(null);
  const [tickerQuery, setTickerQuery] = useState('');
  const [recents, setRecents] = useState<string[]>(readRecents);
  const [budgetInput, setBudgetInput] = useState('');
  const [targetLabel, setTargetLabel] = useState<string | null>(null);
  const [typeaheadOpen, setTypeaheadOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const committed = query.trim().length > 0;

  // ---- the listed universe, lazily. ------------------------------------------
  // Until the listing lands nothing is declared unknown: under-reporting an
  // unknown symbol beats telling a user their ticker does not exist because a
  // 6,300-row JSON had not finished loading.
  const [tickerMod, setTickerMod] = useState<typeof import('../../data/tickers') | null>(null);
  useEffect(() => {
    let alive = true;
    import('../../data/tickers').then(m => alive && setTickerMod(m));
    return () => {
      alive = false;
    };
  }, []);
  const knownSet = useMemo(
    () => (tickerMod ? new Set(tickerMod.NASDAQ_TICKERS.map(t => t.symbol)) : null),
    [tickerMod]
  );
  const knownTicker = useCallback((s: string) => (knownSet ? knownSet.has(s) : true), [knownSet]);
  const suggest = useCallback(
    (s: string) => (tickerMod ? tickerMod.searchTickers(s, 3).map(t => t.symbol) : []),
    [tickerMod]
  );

  // ---- the pane's own snapshot ------------------------------------------------
  const [paneSnap, setPaneSnap] = useState<MarketSnapshot>(snapshot);
  const paneStep = useMemo(() => {
    const s = [...paneSnap.chain].sort((a, b) => a.strike - b.strike);
    return s.length > 1 ? Number(Math.abs(s[1].strike - s[0].strike).toFixed(4)) : Math.max(paneSnap.spot * 0.005, 0.5);
  }, [paneSnap.chain, paneSnap.spot]);

  const parsed = useMemo(() => {
    const base = { defaultTicker: activeTicker, knownTicker, suggest };
    const first = parseContractQuery(query, { ...base, strikeStep: paneStep });
    // The grid belongs to the ticker that was typed, not to whatever the pane
    // last priced. Re-read once when they disagree so the very first render
    // after a name switch still snaps to the right increment.
    const sym = slotValue(first.ticker);
    const step = sym ? Simulator.TICKERS[sym]?.step ?? paneStep : paneStep;
    return step === paneStep ? first : parseContractQuery(query, { ...base, strikeStep: step });
  }, [query, activeTicker, knownTicker, suggest, paneStep]);

  const rTicker = slotValue(parsed.ticker);
  const rStrike = slotValue(parsed.strike);
  const rRight = slotValue(parsed.right) ?? 'C';
  const rExpiry = slotValue(parsed.expiry);
  // The rail still renders while a date is being argued over. Identity is held
  // stable so it cannot re-key anything downstream on every render.
  const fallbackExpiry = useMemo(() => expiryFor(0), []);
  const railExpiry = rExpiry ?? fallbackExpiry;
  const snapTicker = rTicker ?? activeTicker;

  const tickerRef = useRef(snapTicker);
  tickerRef.current = snapTicker;
  const lastPriced = useRef(Date.now());

  // A resolution change re-prices immediately. Throttling without this is what
  // makes a search box feel dead under the fingers.
  useEffect(() => {
    lastPriced.current = Date.now();
    setPaneSnap(Simulator.buildSnapshot(snapTicker));
  }, [snapTicker]);

  // The cadence beat, held to the scan tier no matter how fast it arrives.
  useEffect(() => {
    const now = Date.now();
    if (now - lastPriced.current < REPRICE_MS) return;
    lastPriced.current = now;
    setPaneSnap(Simulator.buildSnapshot(tickerRef.current));
  }, [snapshot]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 120);
    return () => clearTimeout(t);
  }, [query]);

  // Held in a ref on purpose. The caller writes this into the URL, and an inline
  // lambda would otherwise re-fire the effect on every render, which is a
  // setParams loop waiting to happen. The query is the only thing that should
  // publish an address.
  const publishRef = useRef(onQueryChange);
  publishRef.current = onQueryChange;
  useEffect(() => {
    publishRef.current?.(query);
  }, [query]);

  // ---- grading ----------------------------------------------------------------
  const railDte = railExpiry.dte;
  const rail = useMemo(() => {
    const listed = [...paneSnap.chain].map(n => n.strike).sort((a, b) => a - b);
    if (!listed.length) return [];
    const atmIdx = listed.reduce((best, s, i) => (Math.abs(s - paneSnap.spot) < Math.abs(listed[best] - paneSnap.spot) ? i : best), 0);
    return listed
      .slice(Math.max(0, atmIdx - RAIL_REACH), atmIdx + RAIL_REACH + 1)
      .map(k => weighContract(paneSnap, rRight, k, railDte));
  }, [paneSnap, rRight, railDte]);

  const weighed = useMemo(
    () => (rStrike == null || !rExpiry ? null : weighContract(paneSnap, rRight, rStrike, rExpiry.dte)),
    [paneSnap, rRight, rStrike, rExpiry]
  );
  const better = useMemo(
    () => (weighed && isPriceable(weighed) ? betterAlternative(paneSnap, weighed) : null),
    [paneSnap, weighed]
  );

  // betterAlternative sweeps the sleeve's own DTE shape, which need not be the
  // expiry on screen, so the badge is only hung on a row the rail actually has.
  const deskPickId = better && rail.some(r => r.id === better.id) ? better.id : null;

  const chainLow = rail.length ? rail[0].strike : paneSnap.spot;
  const chainHigh = rail.length ? rail[rail.length - 1].strike : paneSnap.spot;
  const outOfRange =
    rStrike != null && (rStrike < chainLow || rStrike > chainHigh)
      ? {
          strike: rStrike,
          pctFromSpot: Math.abs((rStrike - paneSnap.spot) / paneSnap.spot) * 100,
          low: chainLow,
          high: chainHigh,
        }
      : null;

  // Walking back toward spot from a dead strike: the closest listed neighbour
  // that still has a premium to lose.
  const nearestPriceable = useMemo(() => {
    if (rStrike == null) return null;
    return rail
      .filter(isPriceable)
      .sort((a, b) => Math.abs(a.strike - rStrike) - Math.abs(b.strike - rStrike))[0] ?? null;
  }, [rail, rStrike]);

  const nearestListed = useMemo(() => {
    if (rStrike == null || !paneSnap.chain.length) return null;
    return paneSnap.chain.reduce(
      (best, n) => (Math.abs(n.strike - rStrike) < Math.abs(best - rStrike) ? n.strike : best),
      paneSnap.chain[0].strike
    );
  }, [paneSnap.chain, rStrike]);

  const priceable = weighed ? isPriceable(weighed) : false;
  const horizon = horizonForDte(railExpiry.dte);
  const sleeve = SLEEVE_LABEL[horizon];

  // The ledger order is established per contract, not per re-price. Sorting six
  // rows live means they trade places under the cursor every beat, which is the
  // churn this pane was rated on; the scores inside them stay current.
  const ledger = useMemo(() => {
    if (!weighed) return [];
    return [...weighed.factors].sort((a, b) => Math.abs(b.score - 50) * b.weight - Math.abs(a.score - 50) * a.weight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weighed?.id]);
  const ledgerRows = useMemo(() => {
    if (!weighed) return [];
    const shares = apportion(weighed.factors.map(f => f.score * f.weight), weighed.composite);
    const byKey = new Map(weighed.factors.map((f, i) => [f.key, { ...f, contribution: shares[i] }]));
    return ledger.map(f => byKey.get(f.key)).filter((f): f is NonNullable<typeof f> => f != null);
  }, [ledger, weighed]);

  // ---- the setups feed, the only entry point that teaches the grammar --------
  const feedSeeds = useMemo(() => {
    if (committed) return [];
    try {
      return buildSkyVision(snapshot, 'top-setups')
        .groups.flatMap(g => g.setups)
        .slice(0, 3)
        .map(s => canonicalQuery(s.ticker, s.strike, s.right, fallbackExpiry));
    } catch {
      return [];
    }
  }, [snapshot, committed, fallbackExpiry]);

  // ---- Compass evidence, only where the horizons genuinely match -------------
  const evidence = useMemo(() => {
    if (!weighed || railExpiry.dte > 1) return null;
    const cfg = Simulator.TICKERS[weighed.ticker];
    if (!cfg) return null;
    return makeSetup(weighed.ticker, paneSnap.spot, weighed.strike, weighed.right, 'top-setups', cfg.iv);
  }, [weighed, railExpiry.dte, paneSnap.spot]);

  // ---- writing back -----------------------------------------------------------
  const write = useCallback(
    (over: { ticker?: string; strike?: number | null; right?: 'C' | 'P'; expiry?: Expiry }) => {
      const next = canonicalQuery(
        over.ticker ?? snapTicker,
        over.strike !== undefined ? over.strike : rStrike,
        over.right ?? rRight,
        over.expiry ?? railExpiry
      );
      setQuery(next);
      setPicker(null);
      setTypeaheadOpen(false);
    },
    [snapTicker, rStrike, rRight, railExpiry]
  );

  const commitRecent = useCallback(() => {
    if (!weighed) return;
    const entry = canonicalQuery(weighed.ticker, weighed.strike, weighed.right, railExpiry);
    setRecents(prev => {
      const next = [entry, ...prev.filter(r => r !== entry)].slice(0, RECENT_MAX);
      writeRecents(next);
      return next;
    });
  }, [weighed, railExpiry]);

  // ---- typeahead: a strike autocomplete over rows already graded -------------
  // 120ms after the last keystroke, not during it: a list that re-ranks on every
  // character is unreadable, and the rows carry grades that cost real work.
  const settled = debouncedQuery === query;
  const suggestions = useMemo(() => {
    if (!settled || !committed || rStrike == null || rTicker == null) return [];
    const prefix = fmtStrike(rStrike);
    const rows = rail.filter(r => fmtStrike(r.strike).startsWith(prefix)).slice(0, 8);
    // Once the typed strike IS a listed strike the rail already shows it.
    return rows.length === 1 && fmtStrike(rows[0].strike) === prefix ? [] : rows;
  }, [rail, rStrike, rTicker, committed, settled]);

  useEffect(() => setHighlight(0), [suggestions.length]);

  // ---- keyboard ---------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        write({ right: 'C' });
      } else if (e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        write({ right: 'P' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [write]);

  const walkRail = (dir: 1 | -1) => {
    if (!rail.length) return;
    const idx = rail.findIndex(r => r.strike === rStrike);
    const next = rail[Math.max(0, Math.min(rail.length - 1, (idx < 0 ? 0 : idx) + dir))];
    if (next) write({ strike: next.strike });
  };

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (typeaheadOpen && suggestions.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight(h => Math.min(h + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight(h => Math.max(h - 1, 0));
        return;
      }
      if (e.key === 'Enter' && suggestions[highlight]) {
        e.preventDefault();
        write({ strike: suggestions[highlight].strike });
        return;
      }
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      walkRail(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      setTypeaheadOpen(false);
      commitRecent();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (typeaheadOpen) setTypeaheadOpen(false);
      else setQuery('');
    }
  };

  // ---- plan readouts ----------------------------------------------------------
  const ladder = useMemo(() => expiryLadder(), []);
  const targetExpiry = useMemo(
    () => ladder.find(e => e.label === targetLabel) ?? railExpiry,
    [ladder, targetLabel, railExpiry]
  );
  const daysToTarget = Math.max(0, Math.min(railExpiry.dte, targetExpiry.dte));
  const runway = railExpiry.dte - daysToTarget;

  const coverage = weighed ? weighed.expectedMovePct / Math.max(weighed.breakevenMovePct, 0.05) : 0;
  const effExpMove = weighed?.expectedMovePct ?? 0;
  const clearsBreakeven = weighed ? effExpMove >= weighed.breakevenMovePct : false;
  const costPerContract = (weighed?.mid ?? 0) * CONTRACT_MULTIPLIER;
  const parsedBudget = parseFloat(budgetInput);
  const budget = Number.isFinite(parsedBudget) && parsedBudget > 0 ? parsedBudget : null;
  const contractsInBudget = budget != null && costPerContract > 0 ? Math.floor(budget / costPerContract) : null;
  const outlay = contractsInBudget != null ? contractsInBudget * costPerContract : null;
  const halfSpread = (weighed?.spreadPct ?? 0) / 2;
  const expFill = (weighed?.mid ?? 0) * (1 + halfSpread / 100);
  const flowScore = weighed?.factors.find(f => f.key === 'flow')?.score ?? 50;
  const fillProb = Math.max(20, Math.min(96, Math.round(62 + Math.log10(Math.max(weighed?.oi ?? 10, 10)) * 9 - (weighed?.spreadPct ?? 0) * 6)));
  const adverse = (weighed?.spreadPct ?? 0) > 4 || flowScore < 42;
  const friction = (weighed?.spreadPct ?? 0) + (weighed?.thetaPerDayPct ?? 0);
  const costEatsEdge = weighed ? friction >= weighed.expectedMovePct : false;
  // Grade and process are chrome, never direction. Silver, amber, grey.
  const evTone: Tone = !costEatsEdge && coverage >= 1 ? 'select' : costEatsEdge ? 'warn' : 'neutral';
  const evVerdict = !costEatsEdge && coverage >= 1 ? 'EDGE SURVIVES COSTS' : costEatsEdge ? 'COSTS EAT THE EDGE' : 'THIN AFTER COSTS';

  const tracked = weighed ? isTracked(weighed.id) : false;
  const toggleTrack = () => {
    if (!weighed) return;
    if (tracked) untrackSetup(weighed.id);
    else
      trackContract({
        id: weighed.id,
        contract: `${weighed.ticker} ${fmtStrike(weighed.strike)}${weighed.right}`,
        ticker: weighed.ticker,
        strike: weighed.strike,
        right: weighed.right,
        score: weighed.composite,
        verdict: GRADE_VERDICT[weighed.verdict],
      });
  };

  // ---- side picker grades, one read across both rights -----------------------
  const sideGrades = useMemo(() => {
    if (rStrike == null) return null;
    return {
      C: weighContract(paneSnap, 'C', rStrike, railExpiry.dte).composite,
      P: weighContract(paneSnap, 'P', rStrike, railExpiry.dte).composite,
    };
  }, [paneSnap, rStrike, railExpiry.dte]);

  const tickerMatches = useMemo(
    () => (tickerMod ? tickerMod.searchTickers(tickerQuery, 40) : []),
    [tickerMod, tickerQuery]
  );

  // ==== render ================================================================

  const searchField = (
    <div className="relative w-full max-w-[620px]">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted pointer-events-none" />
      <input
        ref={inputRef}
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          setTypeaheadOpen(true);
        }}
        onFocus={() => setTypeaheadOpen(true)}
        onKeyDown={onInputKeyDown}
        role="combobox"
        aria-expanded={typeaheadOpen && suggestions.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={typeaheadOpen && suggestions[highlight] ? `${listId}-opt-${highlight}` : undefined}
        aria-label="Search a contract"
        placeholder="SPY 505C 0DTE"
        className="w-full bg-inputBg border border-borderSubtle focus:border-borderMuted rounded-md pl-9 pr-9 py-2.5 font-mono text-body text-textPrimary placeholder:text-textMuted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"
      />
      {committed && (
        <button
          onClick={() => {
            setQuery('');
            inputRef.current?.focus();
          }}
          aria-label="Clear the search"
          className="absolute right-2 top-1/2 -translate-y-1/2 -m-1 p-1 text-textMuted hover:text-textPrimary transition-colors"
        >
          <CornerDownLeft className="w-3.5 h-3.5 rotate-180" />
        </button>
      )}
      <AnimatePresence>
        {typeaheadOpen && suggestions.length > 0 && (
          <motion.div
            id={listId}
            role="listbox"
            aria-label="Matching strikes"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: DUR.quick, ease: EASE }}
            className="absolute left-0 right-0 top-full mt-1.5 z-40 border border-borderMuted bg-panel rounded-lg shadow-overlay overflow-hidden py-1"
          >
            {suggestions.map((s, i) => (
              <button
                key={s.id}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === highlight}
                tabIndex={-1}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => write({ strike: s.strike })}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left font-mono text-caption transition-colors ${
                  i === highlight ? 'bg-white/[0.05]' : ''
                }`}
              >
                <span className="text-textPrimary font-semibold">
                  {s.ticker} {fmtStrike(s.strike)}
                  {s.right}
                </span>
                <span className="text-textMuted tnum">
                  · {railExpiry.label} · {railExpiry.dte}d
                </span>
                <span className="ml-auto text-textSecondary tnum">
                  {isPriceable(s) ? `${s.composite} ${VERDICT_LABEL[GRADE_VERDICT[s.verdict]]}` : 'not priceable'}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // ---- STATE 0: at rest -------------------------------------------------------
  if (!committed) {
    return (
      <div className="mx-auto w-full max-w-[1180px] flex flex-col gap-4">
        <div className="min-h-[46vh] flex flex-col items-center justify-center gap-5">
          {searchField}
          <p className="font-mono text-label text-textMuted text-center">
            ticker · strike · call or put · expiry, in any order
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {['07/27 spy 747C', 'SPY 505C 7/31', 'spy 505 call aug 7'].map(ex => (
              <button
                key={ex}
                onClick={() => setQuery(ex)}
                className={`${CHIP_BASE} ${CHIP_TONE.assumed}`}
                aria-label={`Try the example ${ex}`}
              >
                {ex}
              </button>
            ))}
          </div>

          {feedSeeds.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="font-mono text-micro uppercase tracking-widest text-textMuted">From the setups feed</span>
              {feedSeeds.map(q => (
                <button key={q} onClick={() => setQuery(q)} className={`${CHIP_BASE} ${CHIP_TONE.typed}`} aria-label={`Weigh ${q}`}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {recents.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="font-mono text-micro uppercase tracking-widest text-textMuted">Recent</span>
              {recents.map(q => (
                <button key={q} onClick={() => setQuery(q)} className={`${CHIP_BASE} ${CHIP_TONE.assumed}`} aria-label={`Weigh ${q} again`}>
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- resolution strip -------------------------------------------------------
  const notesFor = (slot: 'ticker' | 'strike' | 'right' | 'expiry') =>
    parsed.notes.filter(n => n.slot === slot).map(n => n.text);

  const chip = (
    key: 'ticker' | 'strike' | 'side' | 'expiry',
    tone: 'typed' | 'assumed' | 'warn',
    label: ReactNode,
    ariaLabel: string,
    notes: string[],
    body: ReactNode,
    tail?: ReactNode
  ) => (
    <div className="relative flex flex-col gap-0.5">
      <button
        onClick={() => setPicker(p => (p === key ? null : key))}
        aria-label={ariaLabel}
        aria-expanded={picker === key}
        className={`${CHIP_BASE} ${CHIP_TONE[tone]} inline-flex items-center gap-1.5`}
      >
        {label}
        {tail}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {notes.map(n => (
        <span key={n} className="text-micro text-textMuted leading-tight max-w-[240px]">
          {n}
        </span>
      ))}
      <Popover open={picker === key} onClose={() => setPicker(null)} label={`${key} picker`}>
        {body}
      </Popover>
    </div>
  );

  const strip = (
    <div role="status" aria-live="polite" className="flex flex-wrap items-start gap-x-2 gap-y-2">
      {chip(
        'ticker',
        parsed.ticker.state === 'unknown' ? 'warn' : toneOfSlot(parsed.ticker),
        parsed.ticker.state === 'unknown' ? `No listing for ${parsed.ticker.raw}` : rTicker,
        parsed.ticker.state === 'unknown'
          ? `Ticker: ${parsed.ticker.raw}, no listing. Change.`
          : `Ticker: ${rTicker}${parsed.ticker.state === 'assumed' ? ', assumed' : ''}. Change.`,
        notesFor('ticker'),
        <div className="w-72">
          <div className="flex items-center gap-2 px-3 border-b border-borderSubtle">
            <Search className="w-3.5 h-3.5 text-textMuted" />
            <input
              autoFocus
              value={tickerQuery}
              onChange={e => setTickerQuery(e.target.value)}
              aria-label="Search all tickers"
              placeholder="Search all tickers…"
              className="w-full bg-transparent py-2.5 text-body text-textPrimary placeholder:text-textMuted focus-visible:outline-none"
            />
          </div>
          <div role="listbox" aria-label="Tickers" className="max-h-72 overflow-y-auto py-1">
            {tickerMatches.map(t => (
              <button
                key={t.symbol}
                role="option"
                aria-selected={t.symbol === rTicker}
                tabIndex={-1}
                onClick={() => {
                  setTickerQuery('');
                  write({ ticker: t.symbol });
                }}
                className="w-full flex items-center gap-3 px-3 py-1.5 text-left hover:bg-rowHover transition-colors"
              >
                <span className={`font-mono text-caption font-semibold w-16 shrink-0 ${t.symbol === rTicker ? 'text-select' : 'text-textPrimary'}`}>
                  {t.symbol}
                </span>
                <span className="text-label text-textSecondary truncate">{t.name}</span>
              </button>
            ))}
          </div>
        </div>,
        parsed.ticker.state === 'assumed' ? <span className="text-micro text-textMuted">assumed</span> : undefined
      )}

      {chip(
        'strike',
        parsed.strike.state === 'missing' ? 'warn' : toneOfSlot(parsed.strike),
        parsed.strike.state === 'missing' ? 'Add a strike' : fmtStrike(rStrike as number),
        parsed.strike.state === 'missing'
          ? 'Strike: none yet. Change.'
          : `Strike: ${fmtStrike(rStrike as number)}, on the $${paneStep.toFixed(2)} grid. Change.`,
        notesFor('strike'),
        <div className="max-h-[320px] overflow-y-auto p-1.5 w-[260px]">
          <ContractLadder
            rows={rail}
            spot={paneSnap.spot}
            ticker={paneSnap.ticker}
            selectedId={weighed?.id ?? null}
            deskPickId={deskPickId}
            onSelect={c => write({ strike: c.strike })}
            outOfRange={null}
          />
        </div>
      )}

      {chip(
        'side',
        toneOfSlot(parsed.right),
        rRight === 'C' ? 'Call' : 'Put',
        `Side: ${rRight === 'C' ? 'Call' : 'Put'}${parsed.right.state === 'assumed' ? ', assumed' : ''}. Change.`,
        notesFor('right'),
        <div className="p-2">
          <SegmentedControl
            ariaLabel="Contract side"
            options={[
              { value: 'C', label: sideGrades ? `Call ${sideGrades.C}` : 'Call' },
              { value: 'P', label: sideGrades ? `Put ${sideGrades.P}` : 'Put' },
            ]}
            value={rRight}
            onChange={v => write({ right: v as 'C' | 'P' })}
          />
        </div>,
        parsed.right.state === 'assumed' ? <span className="text-micro text-textMuted">assumed</span> : undefined
      )}

      {chip(
        'expiry',
        parsed.expired ? 'warn' : toneOfSlot(parsed.expiry),
        parsed.expired
          ? `${parsed.expired.label} expired ${parsed.expired.daysAgo} day${parsed.expired.daysAgo === 1 ? '' : 's'} ago.`
          : `${railExpiry.label} ${railExpiry.weekday} · ${railExpiry.dte}d · ${railExpiry.sessions} session${
              railExpiry.sessions === 1 ? '' : 's'
            } · ${sleeve}`,
        parsed.expired
          ? `Expiry: ${parsed.expired.label}, expired ${parsed.expired.daysAgo} days ago. Change.`
          : `Expiry: ${railExpiry.label}, ${railExpiry.weekday}, ${railExpiry.dte} days, ${railExpiry.sessions} sessions. Change.`,
        notesFor('expiry'),
        <div className="max-h-[320px] overflow-y-auto py-1 w-[260px]" role="listbox" aria-label="Listed expiries">
          {ladder.map(e => (
            <button
              key={e.label}
              role="option"
              aria-selected={e.label === railExpiry.label}
              tabIndex={-1}
              onClick={() => write({ expiry: e })}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left font-mono text-label hover:bg-rowHover transition-colors"
            >
              <span className="text-textPrimary tnum w-[8ch]">{e.label}</span>
              <span className="text-textMuted w-[3ch]">{e.weekday}</span>
              <span className="text-textSecondary tnum w-[4ch] text-right">{e.dte}d</span>
              <span className="text-textMuted tnum">{e.sessions} sess</span>
              <span className="ml-auto text-textMuted">{SLEEVE_LABEL[horizonForDte(e.dte)]}</span>
            </button>
          ))}
        </div>,
        parsed.expiry.state === 'assumed' ? <span className="text-micro text-textMuted">assumed</span> : undefined
      )}

      {parsed.expired && (
        <div className="flex items-center gap-2">
          <button onClick={() => write({ expiry: fallbackExpiry })} className={`${CHIP_BASE} ${CHIP_TONE.typed}`}>
            {fallbackExpiry.label} (nearest listed)
          </button>
        </div>
      )}

      {parsed.leftovers.length > 0 && (
        <span className="self-center font-mono text-micro text-textMuted">Ignored: {parsed.leftovers.join(', ')}</span>
      )}

      {rTicker && rTicker !== activeTicker && (
        <button
          onClick={() => changeTicker(rTicker)}
          aria-label={`Make ${rTicker} the active ticker across the terminal`}
          className={`${CHIP_BASE} ${CHIP_TONE.assumed} self-center`}
        >
          Make {rTicker} the active ticker
        </button>
      )}
    </div>
  );

  // ---- the grade panel body ---------------------------------------------------
  const identity = weighed ? (
    <p className="font-mono text-label text-textSecondary tnum">
      {weighed.ticker} {fmtStrike(weighed.strike)}
      {weighed.right} · {railExpiry.label} {railExpiry.weekday} · {railExpiry.dte} day
      {railExpiry.dte === 1 ? '' : 's'} · {railExpiry.sessions} session{railExpiry.sessions === 1 ? '' : 's'} · {sleeve} sleeve
    </p>
  ) : null;

  const statGrid = weighed ? (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Stat label="Mid" value={`$${weighed.mid.toFixed(2)}`} />
      <Stat label="Δ delta" value={weighed.delta.toFixed(2)} />
      {/* At the premium floor these two are model output, not readings, so they
          say so on the tile rather than in a tooltip nobody hovers. */}
      <Stat
        label="θ / day"
        value={priceable ? `−${weighed.thetaPerDayPct.toFixed(1)}%` : '—'}
        sub={priceable ? undefined : 'not a reading at the premium floor'}
        tone={priceable && weighed.thetaPerDayPct > 5 ? 'bear' : 'neutral'}
      />
      <Stat
        label="Spread"
        value={priceable ? `${weighed.spreadPct.toFixed(1)}%` : '—'}
        sub={priceable ? undefined : 'not a reading at the premium floor'}
      />
      <Stat label="IV rank" value={`${weighed.ivRank}`} />
      <Stat label="Open int" value={weighed.oi.toLocaleString()} />
      <Stat label="1σ move" value={`${weighed.expectedMovePct.toFixed(1)}%`} />
      <Stat label="Breakeven" value={`${weighed.breakevenMovePct.toFixed(1)}%`} tone={coverage >= 1 ? 'select' : 'warn'} />
    </div>
  ) : null;

  const factorLedger =
    weighed && ledgerRows.length ? (
      <div className="border-t border-borderSubtle pt-3 flex flex-col gap-2.5">
        {!priceable && (
          <p className="text-label text-textMuted leading-snug">
            Two of the six factors are the model&apos;s floor, so the six do not sum to a grade.
          </p>
        )}
        {ledgerRows.map(f => (
          <FactorRow
            key={f.key}
            label={f.label}
            weight={f.weight}
            score={f.score}
            detail={f.detail}
            contribution={f.contribution}
            muted={!priceable && (f.key === 'decay' || f.key === 'liq')}
          />
        ))}
        {priceable && (
          <div className="flex items-center gap-2 border-t border-borderSubtle pt-2">
            <span className="w-32 shrink-0 font-mono text-label uppercase tracking-wider text-textMuted">Σ six rows</span>
            <span className="flex-1" />
            <span className="w-7 shrink-0" />
            <span className="w-[4ch] shrink-0 font-mono text-caption font-semibold text-textPrimary tnum text-right">
              {ledgerRows.reduce((a, f) => a + f.contribution, 0)}
            </span>
          </div>
        )}
        <details className="mt-1">
          <summary className="cursor-pointer font-mono text-label uppercase tracking-wider text-textMuted hover:text-textSecondary">
            Why these weights
          </summary>
          <div className="mt-2 flex flex-col gap-1.5">
            <p className="font-mono text-micro text-textMuted tnum">
              {weighed.factors.map(f => `${f.label.toLowerCase()} ×${f.weight.toFixed(2)}`).join(' · ')}
            </p>
            <p className="text-label text-textMuted leading-snug">{HORIZON_NOTE[horizon]}</p>
            <p className="text-label text-textMuted leading-snug">
              The weights change at 1, 10 and 90 days. A 30 day contract is graded with a different set.
            </p>
          </div>
        </details>
      </div>
    ) : null;

  const gradePanelBody = () => {
    if (parsed.expired) {
      return (
        <EmptyState
          size="lg"
          title="THAT DATE HAS PASSED"
          body={`${parsed.expired.label} was ${parsed.expired.daysAgo} days ago. Pick a listed expiry above.`}
        />
      );
    }
    if (parsed.ticker.state === 'unknown') {
      return (
        <EmptyState size="lg" title={`NO LISTING FOR ${parsed.ticker.raw}`} body="Every other part of your text still binds.">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {parsed.ticker.suggestions.map(s => (
              <button key={s} onClick={() => write({ ticker: s })} className={`${CHIP_BASE} ${CHIP_TONE.typed}`} aria-label={`Use ${s} instead`}>
                {s}
              </button>
            ))}
          </div>
        </EmptyState>
      );
    }
    if (parsed.strike.state === 'missing' || !weighed) {
      return <EmptyState size="lg" title="ADD A STRIKE" body="Type a number, or pick one from the rail." />;
    }

    if (!priceable) {
      return (
        <div className="flex flex-col gap-4">
          {identity}
          <div className="flex items-center gap-3 flex-wrap">
            <SignalBadge tone="warn" className="min-w-[96px] justify-center">
              NOT PRICEABLE
            </SignalBadge>
            <span className="ml-auto font-mono text-label text-textMuted tnum">
              ${weighed.mid.toFixed(2)} mid · Δ{weighed.delta.toFixed(2)} · IV {weighed.ivPct.toFixed(0)}%
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-caption text-textSecondary leading-relaxed">
              {weighed.ticker} {fmtStrike(weighed.strike)}
              {weighed.right} expiring {railExpiry.label} prices at the model&apos;s $0.02 floor with a delta of{' '}
              {weighed.delta.toFixed(2)}.
            </p>
            <p className="text-caption text-textSecondary leading-relaxed">
              It needs a {weighed.breakevenMovePct.toFixed(1)}% move by the bell. The 1σ move is{' '}
              {weighed.expectedMovePct.toFixed(1)}%.
            </p>
            <p className="text-caption text-textSecondary leading-relaxed">
              There is no grade here: theta and liquidity at the floor are model output, not a reading.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {nearestPriceable && (
              <button onClick={() => write({ strike: nearestPriceable.strike })} className={`${CHIP_BASE} ${CHIP_TONE.typed}`}>
                Nearest priceable {weighed.right === 'C' ? 'call' : 'put'} on this expiry: {fmtStrike(nearestPriceable.strike)}
                {nearestPriceable.right}, grades {nearestPriceable.composite}
              </button>
            )}
            {nearestListed != null && nearestListed !== weighed.strike && (
              <button onClick={() => write({ strike: nearestListed })} className={`${CHIP_BASE} ${CHIP_TONE.assumed}`}>
                Nearest listed strike: {fmtStrike(nearestListed)}
              </button>
            )}
          </div>
          {statGrid}
          {factorLedger}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        {identity}
        <div className="flex items-center gap-3 flex-wrap">
          <AnimatedNumber
            value={weighed.composite}
            format={v => String(Math.round(v))}
            flash={false}
            className="font-mono text-4xl font-bold text-textPrimary w-[3ch] text-right"
          />
          <SignalBadge tone={VERDICT_TONE[GRADE_VERDICT[weighed.verdict]]} className="min-w-[96px] justify-center">
            {VERDICT_LABEL[GRADE_VERDICT[weighed.verdict]]}
          </SignalBadge>
          <span className="ml-auto font-mono text-label text-textMuted tnum">
            ${weighed.mid.toFixed(2)} mid · Δ{weighed.delta.toFixed(2)} · IV {weighed.ivPct.toFixed(0)}%
          </span>
        </div>

        <p className="text-caption text-textSecondary leading-relaxed">
          {better ? (
            <>
              <span className="text-textPrimary font-semibold">
                {better.ticker} {fmtStrike(better.strike)}
                {better.right}
              </span>{' '}
              grades <span className="text-textPrimary font-semibold tnum">{better.composite}</span> against your{' '}
              <span className="text-textPrimary font-semibold tnum">{weighed.composite}</span>, and clears its breakeven with
              more room ({better.breakevenMovePct.toFixed(2)}% of {better.expectedMovePct.toFixed(2)}% against{' '}
              {weighed.breakevenMovePct.toFixed(2)}% of {weighed.expectedMovePct.toFixed(2)}%).
            </>
          ) : (
            `Nothing in the ${sleeve} sleeve beats this on both grade and reward to risk.`
          )}
        </p>

        {factorLedger}
        {statGrid}

        <div className="border-t border-borderSubtle pt-3 flex flex-col gap-2">
          {evidence ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <StateBadge state={setupState(evidence)} />
                {evidence.whyChips.map(c => (
                  <SignalBadge key={c} tone="neutral">
                    {c}
                  </SignalBadge>
                ))}
              </div>
              <p className="text-caption text-textSecondary leading-relaxed">
                Contradicted below ${evidence.invalidationPrice.toFixed(2)}. {evidence.invalidationReason}
              </p>
              <div className="flex flex-wrap gap-2">
                {evidence.takeProfits.map(tp => (
                  <span key={tp.level} className="font-mono text-micro text-textMuted tnum">
                    TP{tp.level} ${tp.target.toFixed(2)} · {tp.status}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-caption text-textSecondary leading-relaxed">
              Compass grades same-session setups. This one has {railExpiry.dte} days, so it carries the sleeve grade only.
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1180px] flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {searchField}
        {strip}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={weighed?.id ?? 'empty'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.base, ease: EASE }}
            className="xl:col-span-8 min-w-0"
          >
            <Panel
              emphasis
              title={
                <span className="inline-flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5" /> Weigh your own
                </span>
              }
              subtitle={weighed ? `${weighed.ticker} ${fmtStrike(weighed.strike)}${weighed.right}` : 'nothing graded yet'}
              tone={weighed && priceable ? VERDICT_TONE[GRADE_VERDICT[weighed.verdict]] : 'neutral'}
              actions={
                weighed && priceable ? (
                  <button
                    onClick={toggleTrack}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-mono text-label font-semibold uppercase tracking-wider transition-colors ${
                      tracked
                        ? 'border-select/40 bg-select/[0.08] text-select'
                        : 'border-borderSubtle text-textSecondary hover:text-textPrimary hover:border-borderMuted'
                    }`}
                  >
                    {tracked ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                    {tracked ? 'Tracked' : 'Add to Tracker'}
                  </button>
                ) : undefined
              }
            >
              {gradePanelBody()}
            </Panel>
          </motion.div>
        </AnimatePresence>

        <Panel
          title="Neighbours"
          subtitle={`${rRight === 'C' ? 'calls' : 'puts'} · ${railExpiry.label}`}
          className="xl:col-span-4 min-w-0"
        >
          <ContractLadder
            rows={rail}
            spot={paneSnap.spot}
            ticker={paneSnap.ticker}
            selectedId={weighed?.id ?? null}
            deskPickId={deskPickId}
            onSelect={c => write({ strike: c.strike })}
            outOfRange={outOfRange}
          />
        </Panel>
      </div>

      {weighed && priceable && (
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" /> If you take it
            </span>
          }
          subtitle="timing, sizing and what the costs leave behind"
          tone={evTone}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <SignalBadge tone={evTone} className="min-w-[96px] justify-center">
                {evVerdict}
              </SignalBadge>
              <SignalBadge tone={clearsBreakeven ? 'select' : 'warn'} dot>
                {clearsBreakeven ? 'Clears breakeven' : 'Short of breakeven'}
              </SignalBadge>
              {adverse && (
                <SignalBadge tone="warn" dot>
                  Adverse selection
                </SignalBadge>
              )}

              <label className="ml-auto inline-flex items-center gap-1.5 font-mono text-label text-textMuted">
                Risk budget
                <span className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 font-mono text-label text-textMuted">$</span>
                  <input
                    type="number"
                    value={budgetInput}
                    placeholder="0"
                    aria-label="Risk budget in dollars"
                    onChange={e => setBudgetInput(e.target.value)}
                    className="w-24 bg-inputBg border border-borderSubtle focus:border-borderMuted rounded-md pl-5 pr-2 py-1 font-mono text-caption text-textPrimary tnum focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"
                  />
                </span>
              </label>
              <label className="inline-flex items-center gap-1.5 font-mono text-label text-textMuted">
                Target date
                <select
                  value={targetExpiry.label}
                  aria-label="Target date"
                  onChange={e => setTargetLabel(e.target.value)}
                  className="bg-inputBg border border-borderSubtle focus:border-borderMuted rounded-md px-2 py-1 font-mono text-caption text-textPrimary tnum focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"
                >
                  {ladder
                    .filter(e => e.dte <= railExpiry.dte)
                    .map(e => (
                      <option key={e.label} value={e.label}>
                        {e.label} · {e.weekday}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Days to expiry" value={`${railExpiry.dte}d`} sub={`${railExpiry.sessions} sessions`} />
              <Stat label="Hold to target" value={`${daysToTarget}d`} />
              <Stat label="Runway to expiry" value={`${runway}d`} tone={runway <= 0 ? 'warn' : 'neutral'} />
              <Stat label="1σ move" value={`${effExpMove.toFixed(1)}%`} />
              <Stat label="Cost / contract" value={`$${costPerContract.toFixed(0)}`} />
              <Stat
                label="Contracts in budget"
                value={contractsInBudget != null ? `${contractsInBudget}` : '—'}
                tone={contractsInBudget === 0 ? 'warn' : 'neutral'}
              />
              <Stat label="Est. outlay" value={outlay != null ? `$${outlay.toFixed(0)}` : '—'} />
              <Stat label="Expected fill" value={`$${expFill.toFixed(2)}`} sub={`~${halfSpread.toFixed(1)}% exit slippage`} />
              <Stat label="Spread round-trip" value={`${weighed.spreadPct.toFixed(1)}%`} tone={weighed.spreadPct > 4 ? 'warn' : 'neutral'} />
              <Stat label="Fill probability" value={`${fillProb}%`} tone={fillProb >= 70 ? 'select' : fillProb < 45 ? 'warn' : 'neutral'} />
              <Stat label="Theta drag" value={`−${weighed.thetaPerDayPct.toFixed(1)}%/d`} tone={weighed.thetaPerDayPct > 5 ? 'bear' : 'neutral'} />
              <Stat label="Total friction" value={`${friction.toFixed(1)}%`} tone={costEatsEdge ? 'warn' : 'neutral'} />
            </div>

            <p className="text-caption text-textSecondary leading-relaxed">
              {costEatsEdge
                ? `Spread round-trip plus a day of theta (${friction.toFixed(1)}%) is wider than the 1σ move (${weighed.expectedMovePct.toFixed(1)}%), so you would need a fast, above-expected move just to clear the toll.`
                : `The 1σ move (${weighed.expectedMovePct.toFixed(1)}%) clears the friction (${friction.toFixed(1)}%). The edge is capturable if you work a limit near $${expFill.toFixed(2)} instead of paying the offer.`}
              {budget != null &&
                (contractsInBudget && contractsInBudget > 0
                  ? ` Your $${budget.toFixed(0)} budget clears ${contractsInBudget} contract${contractsInBudget > 1 ? 's' : ''} at the $${costPerContract.toFixed(0)} mid.`
                  : ` Your $${budget.toFixed(0)} budget is under the $${costPerContract.toFixed(0)} single-contract mid.`)}
            </p>
            <p className="font-mono text-micro text-textMuted leading-relaxed border-t border-borderSubtle pt-2.5">
              Sizing off the mid × {CONTRACT_MULTIPLIER}-share multiplier. Fills and slippage read from the modelled spread and
              open interest.
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
};

export default ContractWeigher;
