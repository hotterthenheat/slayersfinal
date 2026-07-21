import { useEffect, useMemo, useState } from 'react';
import { Search, Scale, Plus, Check, ArrowRight, TrendingUp, Wallet } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { useTracker } from '../../context/TrackerContext';
import {
  weighContract,
  betterAlternative,
  horizonForDte,
  HORIZONS,
  type ContractVerdict,
  type Horizon,
  type WeighedContract,
} from '../../core/contractScore';
import type { MarketSnapshot } from '../../types/market';
import Panel from '../ui/Panel';
import SignalBadge from '../ui/SignalBadge';
import type { Tone } from '../ui/tones';

const verdictTone: Record<ContractVerdict, Tone> = { BUY: 'bull', WATCH: 'warn', FADE: 'bear' };
const dteForHorizon: Record<Horizon, number> = { LOTTO: 0, WEEKLIES: 5, SWINGS: 30, LEAPS: 365 };
const DTE_PRESETS = [0, 7, 30, 365];

/** Nearest listed strike to spot. */
function atmStrike(snapshot: MarketSnapshot): number {
  const { chain, spot } = snapshot;
  if (!chain.length) return Math.round(spot);
  return chain.reduce((best, n) => (Math.abs(n.strike - spot) < Math.abs(best - spot) ? n.strike : best), chain[0].strike);
}

/** Parse "SPY 500C 7" | "500p 0" | "500 c 3" | "500C". Ticker & dte optional. */
function parseQuery(q: string): { ticker?: string; right?: 'C' | 'P'; strike?: number; dte?: number } {
  const s = q.trim().toUpperCase();
  const m = s.match(/^(?:([A-Z]{1,5})\s+)?(\d+(?:\.\d+)?)\s*([CP])(?:\s+(\d+))?/);
  if (!m) return {};
  return {
    ticker: m[1] || undefined,
    strike: parseFloat(m[2]),
    right: m[3] as 'C' | 'P',
    dte: m[4] !== undefined ? parseInt(m[4], 10) : undefined,
  };
}

/** One factor of the composite — label, weight, meter, score. */
const FactorRow = ({ label, weight, score, detail }: { label: string; weight: number; score: number; detail: string }) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 font-mono text-[10px] uppercase tracking-wider text-textSecondary">{label}</span>
      <span className="font-mono text-[9px] text-textMuted tnum">×{weight.toFixed(2)}</span>
      <span className="flex-1 h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
        <span
          className={`block h-full rounded-full ${score >= 60 ? 'holo-bar' : score >= 40 ? 'bg-white/30' : 'bg-bear/70'}`}
          style={{ width: `${score}%` }}
        />
      </span>
      <span className="w-7 shrink-0 font-mono text-[11px] font-semibold text-textPrimary tnum text-right">{score}</span>
    </div>
    <p className="pl-32 text-[10px] text-textMuted leading-snug">{detail}</p>
  </div>
);

/** Small label/value cell for the analysis stat grid. */
const Cell = ({ k, v, tone = 'neutral' }: { k: string; v: string; tone?: Tone }) => (
  <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
    <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">{k}</div>
    <div className={`mt-1 font-mono text-sm font-semibold tnum ${tone === 'bull' ? 'text-bull' : tone === 'bear' ? 'text-bear' : tone === 'warn' ? 'text-warn' : 'text-textPrimary'}`}>{v}</div>
  </div>
);

interface ContractWeigherProps {
  snapshot: MarketSnapshot;
  /** Deep-link entry point — seeds the horizon/expiry (e.g. from Earnings) */
  initialHorizon?: Horizon;
}

/**
 * Compass's second mode: search any contract you already have — we weigh it on
 * the exact same scale as the top setups, tell you everything about it, and if
 * a better risk/reward sits nearby in the same sleeve, we point you to it.
 */
const ContractWeigher = ({ snapshot, initialHorizon }: ContractWeigherProps) => {
  const { activeTicker, changeTicker } = useMarketData();
  const { trackContract, untrackSetup, isTracked } = useTracker();

  const [right, setRight] = useState<'C' | 'P'>('C');
  const [strike, setStrike] = useState<number>(() => atmStrike(snapshot));
  const [dte, setDte] = useState<number>(initialHorizon ? dteForHorizon[initialHorizon] : 5);
  const [query, setQuery] = useState('');

  const step = useMemo(() => {
    const s = [...snapshot.chain].sort((a, b) => a.strike - b.strike);
    return s.length > 1 ? Math.abs(s[1].strike - s[0].strike) : Math.max(snapshot.spot * 0.005, 0.5);
  }, [snapshot.chain, snapshot.spot]);

  // A ticker switch invalidates the old strike — snap back to the money.
  useEffect(() => {
    setStrike(atmStrike(snapshot));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.ticker]);

  const submitQuery = () => {
    const p = parseQuery(query);
    if (!p.strike) return;
    if (p.ticker && p.ticker !== activeTicker) changeTicker(p.ticker);
    setStrike(p.strike);
    if (p.right) setRight(p.right);
    if (p.dte !== undefined) setDte(p.dte);
  };

  const weighed = useMemo(() => weighContract(snapshot, right, strike, dte), [snapshot, right, strike, dte]);
  const better = useMemo(() => betterAlternative(snapshot, weighed), [snapshot, weighed]);
  const tone = verdictTone[weighed.verdict];
  const horizonLabel = HORIZONS.find(h => h.key === horizonForDte(dte))?.label ?? (dte <= 1 ? 'Lotto' : '');
  const tracked = isTracked(weighed.id);
  const coverage = weighed.expectedMovePct / Math.max(weighed.breakevenMovePct, 0.05);

  // ---- execution & expected value: can you actually capture the edge? ----
  const halfSpread = weighed.spreadPct / 2;
  const expFill = weighed.mid * (1 + halfSpread / 100);
  const flowScore = weighed.factors.find(f => f.key === 'flow')?.score ?? 50;
  const fillProb = Math.max(20, Math.min(96, Math.round(62 + Math.log10(Math.max(weighed.oi, 10)) * 9 - weighed.spreadPct * 6)));
  const adverse = weighed.spreadPct > 4 || flowScore < 42;
  // spread round-trip + one day of theta, as % of premium, vs the 1σ move
  const friction = weighed.spreadPct + weighed.thetaPerDayPct;
  const costEatsEdge = friction >= weighed.expectedMovePct;
  const evTone: Tone = !costEatsEdge && coverage >= 1 ? 'bull' : costEatsEdge ? 'bear' : 'warn';
  const evVerdict = !costEatsEdge && coverage >= 1 ? 'EDGE SURVIVES COSTS' : costEatsEdge ? 'COSTS EAT THE EDGE' : 'THIN AFTER COSTS';

  const toggleTrack = () => {
    if (tracked) untrackSetup(weighed.id);
    else
      trackContract({
        id: weighed.id,
        contract: `${weighed.ticker} ${weighed.strike}${weighed.right}`,
        ticker: weighed.ticker,
        strike: weighed.strike,
        right: weighed.right,
        score: weighed.composite,
        verdict: weighed.verdict === 'BUY' ? 'ENTER' : weighed.verdict === 'FADE' ? 'EXIT' : 'WATCH',
      });
  };

  const loadContract = (c: WeighedContract) => {
    setRight(c.right);
    setStrike(c.strike);
    setDte(c.dte);
    setQuery('');
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Search / build bar ---- */}
      <Panel bodyClassName="p-3" emphasis>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textMuted" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitQuery()}
              placeholder="Search any contract — e.g. SPY 500C 7  ·  strike · call/put · days"
              className="w-full bg-inputBg border border-borderSubtle focus:border-borderMuted rounded-md pl-8 pr-3 py-2 font-mono text-xs text-textPrimary placeholder:text-textMuted outline-none"
            />
          </div>
          <button
            onClick={submitQuery}
            className="px-3 py-2 rounded-md holo-bg text-[#0a0a0a] font-mono text-[11px] font-semibold uppercase tracking-wider"
          >
            Weigh it
          </button>
        </div>

        {/* Quick-adjust controls — the parsed contract, editable */}
        <div className="mt-3 flex items-center gap-2 flex-wrap font-mono text-[11px]">
          <span className="text-textMuted uppercase tracking-wider text-[10px]">{activeTicker}</span>
          {/* call / put */}
          <div className="inline-flex rounded-md overflow-hidden border border-borderSubtle">
            {(['C', 'P'] as const).map(r => (
              <button
                key={r}
                onClick={() => setRight(r)}
                className={`px-2.5 py-1 font-semibold transition-colors ${
                  right === r
                    ? r === 'C'
                      ? 'bg-[#15803d] text-white'
                      : 'bg-[#b91c1c] text-white'
                    : 'text-textMuted hover:text-textSecondary'
                }`}
              >
                {r === 'C' ? 'CALL' : 'PUT'}
              </button>
            ))}
          </div>
          {/* strike stepper */}
          <div className="inline-flex items-center rounded-md border border-borderSubtle overflow-hidden">
            <button onClick={() => setStrike(s => Math.max(step, s - step))} className="px-2 py-1 text-textMuted hover:text-textPrimary">−</button>
            <span className="px-2 py-1 text-textPrimary tnum tabular-nums">{strike}</span>
            <button onClick={() => setStrike(s => s + step)} className="px-2 py-1 text-textMuted hover:text-textPrimary">+</button>
          </div>
          {/* dte presets */}
          <div className="inline-flex items-center gap-1">
            {DTE_PRESETS.map(d => (
              <button
                key={d}
                onClick={() => setDte(d)}
                className={`px-2 py-1 rounded border transition-colors ${
                  dte === d ? 'border-borderMuted bg-white/[0.06] text-textPrimary' : 'border-borderSubtle text-textMuted hover:text-textSecondary'
                }`}
              >
                {d === 0 ? '0DTE' : `${d}d`}
              </button>
            ))}
            <span className="text-textMuted tnum">· {horizonLabel}</span>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* ---- Full analysis of the weighed contract ---- */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5" /> {weighed.ticker} {weighed.strike}
              {weighed.right} · full analysis
            </span>
          }
          subtitle={`${weighed.expiryLabel} · ${weighed.dte}d`}
          tone={tone}
          className="xl:col-span-7"
          actions={
            <button
              onClick={toggleTrack}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                tracked ? 'border-bull/40 bg-bull/10 text-bull' : 'border-borderSubtle text-textSecondary hover:text-textPrimary hover:border-borderMuted'
              }`}
            >
              {tracked ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              {tracked ? 'Tracked' : 'Add to Tracker'}
            </button>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`font-mono text-4xl font-bold tnum ${weighed.composite >= 70 ? 'holo-text' : weighed.composite < 52 ? 'text-bear' : 'text-textPrimary'}`}>
                {weighed.composite}
              </span>
              <SignalBadge tone={tone}>{weighed.verdict}</SignalBadge>
              <span className="ml-auto font-mono text-[11px] text-textMuted tnum">
                ${weighed.mid.toFixed(2)} mid · Δ{weighed.delta.toFixed(2)} · IV {weighed.ivPct.toFixed(0)}%
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Cell k="Mid" v={`$${weighed.mid.toFixed(2)}`} />
              <Cell k="Δ delta" v={weighed.delta.toFixed(2)} />
              <Cell k="θ / day" v={`−${weighed.thetaPerDayPct.toFixed(1)}%`} tone={weighed.thetaPerDayPct > 5 ? 'bear' : 'neutral'} />
              <Cell k="Spread" v={`${weighed.spreadPct.toFixed(1)}%`} />
              <Cell k="IV rank" v={`${weighed.ivRank}`} />
              <Cell k="Open int" v={weighed.oi.toLocaleString()} />
              <Cell k="1σ move" v={`${weighed.expectedMovePct.toFixed(1)}%`} tone="bull" />
              <Cell k="Breakeven" v={`${weighed.breakevenMovePct.toFixed(1)}%`} tone={coverage >= 1 ? 'bull' : 'warn'} />
            </div>

            <div className="border-t border-borderSubtle pt-3 flex flex-col gap-2.5">
              {weighed.factors.map(f => (
                <FactorRow key={f.key} label={f.label} weight={f.weight} score={f.score} detail={f.detail} />
              ))}
            </div>

            <div className="border-t border-borderSubtle pt-3 flex flex-col gap-2">
              <p className="text-xs leading-relaxed">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-bull mr-2">Edge</span>
                <span className="text-textSecondary">{weighed.edge}</span>
              </p>
              <p className="text-xs leading-relaxed">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-bear mr-2">Risk</span>
                <span className="text-textSecondary">{weighed.risk}</span>
              </p>
            </div>
          </div>
        </Panel>

        {/* ---- Better risk/reward suggestion ---- */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> Better risk / reward?
            </span>
          }
          subtitle="same direction, same sleeve"
          tone={better ? 'bull' : 'neutral'}
          className="xl:col-span-5"
        >
          {better ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-textSecondary leading-relaxed">
                <span className="text-bull font-semibold">{better.ticker} {better.strike}{better.right}</span> scores{' '}
                <span className="text-textPrimary font-semibold">{better.composite}</span> vs your{' '}
                <span className="text-textPrimary font-semibold">{weighed.composite}</span> — and clears its breakeven with more
                room ({better.expectedMovePct.toFixed(1)}% of 1σ against a {better.breakevenMovePct.toFixed(1)}% breakeven).
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Cell k="Score" v={`${better.composite}`} tone="bull" />
                <Cell k="Verdict" v={better.verdict} tone={verdictTone[better.verdict]} />
                <Cell k="Mid" v={`$${better.mid.toFixed(2)}`} />
                <Cell k="θ / day" v={`−${better.thetaPerDayPct.toFixed(1)}%`} />
                <Cell k="1σ move" v={`${better.expectedMovePct.toFixed(1)}%`} tone="bull" />
                <Cell k="Breakeven" v={`${better.breakevenMovePct.toFixed(1)}%`} />
              </div>
              <button
                onClick={() => loadContract(better)}
                className="inline-flex items-center justify-center gap-1.5 w-full py-2 rounded-md border border-bull/40 bg-bull/10 text-bull font-mono text-[11px] font-semibold uppercase tracking-wider hover:bg-bull/[0.16] transition-colors"
              >
                Weigh this instead <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <p className="text-xs text-textMuted leading-relaxed">
              Nothing nearby beats it on both score and reward-to-risk — the {weighed.right === 'C' ? 'call' : 'put'} you searched
              is the strongest expression in its sleeve right now.
            </p>
          )}
        </Panel>
      </div>

      {/* Execution & expected value — connect the grade to what you can capture */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5" /> Execution & expected value
          </span>
        }
        subtitle="can you actually capture the edge after costs?"
        tone={evTone}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <SignalBadge tone={evTone}>{evVerdict}</SignalBadge>
            {adverse && (
              <SignalBadge tone="warn" dot>
                Adverse selection
              </SignalBadge>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Cell k="Expected fill" v={`$${expFill.toFixed(2)}`} />
            <Cell k="Spread round-trip" v={`${weighed.spreadPct.toFixed(1)}%`} tone={weighed.spreadPct > 4 ? 'bear' : 'neutral'} />
            <Cell k="Exit slippage" v={`~${halfSpread.toFixed(1)}%`} />
            <Cell k="Fill probability" v={`${fillProb}%`} tone={fillProb >= 70 ? 'bull' : fillProb < 45 ? 'bear' : 'warn'} />
            <Cell k="Theta drag" v={`−${weighed.thetaPerDayPct.toFixed(1)}%/d`} tone={weighed.thetaPerDayPct > 5 ? 'bear' : 'neutral'} />
            <Cell k="1σ move" v={`${weighed.expectedMovePct.toFixed(1)}%`} tone="bull" />
            <Cell k="Breakeven" v={`${weighed.breakevenMovePct.toFixed(1)}%`} />
            <Cell k="Total friction" v={`${friction.toFixed(1)}%`} tone={costEatsEdge ? 'bear' : 'neutral'} />
          </div>
          <p className="text-xs text-textSecondary leading-relaxed">
            {costEatsEdge
              ? `Spread round-trip plus a day of theta (${friction.toFixed(1)}%) is wider than the 1σ move (${weighed.expectedMovePct.toFixed(1)}%) — you'd need a fast, above-expected move just to clear the toll.`
              : `The 1σ move (${weighed.expectedMovePct.toFixed(1)}%) clears the friction (${friction.toFixed(1)}%) — the edge is capturable if you work a limit near $${expFill.toFixed(2)} instead of paying the offer.`}
          </p>
          <p className="font-mono text-[10px] text-textMuted leading-relaxed border-t border-borderSubtle pt-2.5">
            Modeled fills & slippage from spread and open interest; swap in a real quote + fill feed behind the same contract.
          </p>
        </div>
      </Panel>
    </div>
  );
};

export default ContractWeigher;
