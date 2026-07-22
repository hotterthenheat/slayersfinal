import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Search,
  Scale,
  Plus,
  Check,
  TrendingUp,
  Wallet,
  Terminal,
  Calendar,
  Target,
  Percent,
  DollarSign,
  Layers,
  SlidersHorizontal,
} from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { useTracker } from '../../context/TrackerContext';
import {
  weighContract,
  weighContracts,
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
import TickerSearch from '../ui/TickerSearch';
import DataTable, { type Column } from '../ui/DataTable';
import type { Tone } from '../ui/tones';

const verdictTone: Record<ContractVerdict, Tone> = { BUY: 'bull', WATCH: 'warn', FADE: 'bear' };
// Observational grade, never a directive — describes the contract's quality.
const verdictLabel: Record<ContractVerdict, string> = { BUY: 'STRONG', WATCH: 'WATCH', FADE: 'WEAK' };
const dteForHorizon: Record<Horizon, number> = { LOTTO: 0, WEEKLIES: 5, SWINGS: 30, LEAPS: 365 };
const DTE_PRESETS = [0, 7, 30, 365];
/** Standard equity-option contract multiplier (shares per contract). */
const CONTRACT_MULTIPLIER = 100;
const MS_DAY = 86_400_000;

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

// ---- calendar helpers (plain date arithmetic, no pricing) -------------------
function startOfToday(): number {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
}
function isoFromDte(dte: number): string {
  const d = new Date(startOfToday() + Math.max(0, dte) * MS_DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dteFromISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return 0;
  return Math.round((new Date(y, m - 1, d).getTime() - startOfToday()) / MS_DAY);
}

/** One factor of the composite — label, weight, meter, score. */
const FactorRow = ({ label, weight, score, detail }: { label: string; weight: number; score: number; detail: string }) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 font-mono text-[11px] uppercase tracking-wider text-textSecondary">{label}</span>
      <span className="font-mono text-[10px] text-textMuted tnum">×{weight.toFixed(2)}</span>
      <span className="flex-1 h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
        <span
          className={`block h-full rounded-full ${score >= 60 ? 'holo-bar' : score >= 40 ? 'bg-white/30' : 'bg-bear/70'}`}
          style={{ width: `${score}%` }}
        />
      </span>
      <span className="w-7 shrink-0 font-mono text-[12px] font-semibold text-textPrimary tnum text-right">{score}</span>
    </div>
    <p className="pl-32 text-[11px] text-textMuted leading-snug">{detail}</p>
  </div>
);

/** Small label/value cell for the analysis stat grid. */
const Cell = ({ k, v, tone = 'neutral' }: { k: string; v: string; tone?: Tone }) => (
  <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
    <div className="font-mono text-[11px] uppercase tracking-widest text-textMuted">{k}</div>
    <div className={`mt-1 font-mono text-sm font-semibold tnum ${tone === 'bull' ? 'text-bull' : tone === 'bear' ? 'text-bear' : tone === 'warn' ? 'text-warn' : 'text-textPrimary'}`}>{v}</div>
  </div>
);

/** A single labelled control in the build form. */
const Field = ({
  label,
  icon,
  hint,
  className = '',
  children,
}: {
  label: string;
  icon?: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) => (
  <div className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-textSecondary">
      {icon}
      {label}
    </span>
    {children}
    {hint != null && <span className="font-mono text-[10px] text-textMuted leading-tight tnum">{hint}</span>}
  </div>
);

const inputBase =
  'w-full bg-inputBg border border-borderSubtle focus:border-borderMuted rounded-md px-2.5 py-1.5 font-mono text-[12px] text-textPrimary placeholder:text-textMuted outline-none tnum';

interface ContractWeigherProps {
  snapshot: MarketSnapshot;
  /** Deep-link entry point — seeds the horizon/expiry (e.g. from Earnings) */
  initialHorizon?: Horizon;
}

/**
 * Compass's second mode: build a contract in a structured form — we weigh it on
 * the exact same scale as the top setups, tell you everything about it, and lay
 * the whole sleeve of same-direction alternatives beside it in one table.
 */
const ContractWeigher = ({ snapshot, initialHorizon }: ContractWeigherProps) => {
  const { activeTicker, changeTicker } = useMarketData();
  const { trackContract, untrackSetup, isTracked } = useTracker();

  const initialDte = initialHorizon ? dteForHorizon[initialHorizon] : 5;

  const [right, setRight] = useState<'C' | 'P'>('C');
  const [strike, setStrike] = useState<number>(() => atmStrike(snapshot));
  const [dte, setDte] = useState<number>(initialDte);
  const [query, setQuery] = useState('');
  const [showCmd, setShowCmd] = useState(false);

  // Planning inputs — echoed against values the engine already computes.
  const [targetISO, setTargetISO] = useState<string>(() => isoFromDte(initialDte));
  const [expMoveInput, setExpMoveInput] = useState('');
  const [budgetInput, setBudgetInput] = useState('');

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

  // Every same-direction contract in the sleeve, the searched one folded in.
  const altRows = useMemo(() => {
    const sleeve = weighContracts(snapshot, horizonForDte(dte)).filter(c => c.right === right);
    return sleeve.some(c => c.id === weighed.id) ? sleeve : [weighed, ...sleeve];
  }, [snapshot, dte, right, weighed]);

  // ---- planning readouts: user inputs read against existing engine values ----
  const expiryISO = isoFromDte(dte);
  const todayISO = isoFromDte(0);
  const daysToTarget = Math.max(0, Math.min(dte, dteFromISO(targetISO)));
  const runway = dte - daysToTarget;
  const parsedExpMove = parseFloat(expMoveInput);
  const effExpMove = Number.isFinite(parsedExpMove) && parsedExpMove > 0 ? parsedExpMove : weighed.expectedMovePct;
  const clearsBreakeven = effExpMove >= weighed.breakevenMovePct;
  const costPerContract = weighed.mid * CONTRACT_MULTIPLIER;
  const parsedBudget = parseFloat(budgetInput);
  const budget = Number.isFinite(parsedBudget) && parsedBudget > 0 ? parsedBudget : null;
  const contractsInBudget = budget != null ? Math.floor(budget / costPerContract) : null;
  const outlay = contractsInBudget != null ? contractsInBudget * costPerContract : null;

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

  const setExpiryDte = (next: number) => {
    const clamped = Math.max(0, next);
    setDte(clamped);
    // keep the target inside the new expiry window
    if (dteFromISO(targetISO) > clamped) setTargetISO(isoFromDte(clamped));
  };

  // ---- alternatives comparison table ----------------------------------------
  const rr = (c: WeighedContract) => c.expectedMovePct / Math.max(c.breakevenMovePct, 0.05);
  const altColumns: Column<WeighedContract>[] = [
    {
      key: 'contract',
      header: 'Contract',
      align: 'left',
      sortValue: c => c.strike,
      render: c => (
        <span className="inline-flex items-center gap-2">
          <span className={c.id === weighed.id ? 'text-select font-semibold' : 'text-textPrimary font-semibold'}>
            {c.strike}
            {c.right}
          </span>
          {c.id === weighed.id && <SignalBadge tone="select">Yours</SignalBadge>}
          {better && c.id === better.id && (
            <SignalBadge tone="bull" dot>
              Better R/R
            </SignalBadge>
          )}
        </span>
      ),
    },
    { key: 'dte', header: 'DTE', align: 'right', sortValue: c => c.dte, render: c => <span className="text-textSecondary">{c.dte}d</span> },
    {
      key: 'score',
      header: 'Score',
      align: 'right',
      sortValue: c => c.composite,
      render: c => (
        <span className={`font-semibold ${c.verdict === 'BUY' ? 'text-bull' : c.verdict === 'FADE' ? 'text-bear' : 'text-textPrimary'}`}>
          {c.composite}
        </span>
      ),
    },
    { key: 'verdict', header: 'Verdict', align: 'right', sortValue: c => c.composite, render: c => <SignalBadge tone={verdictTone[c.verdict]}>{verdictLabel[c.verdict]}</SignalBadge> },
    { key: 'mid', header: 'Mid', align: 'right', sortValue: c => c.mid, render: c => `$${c.mid.toFixed(2)}` },
    { key: 'delta', header: 'Δ', align: 'right', sortValue: c => Math.abs(c.delta), render: c => c.delta.toFixed(2) },
    {
      key: 'theta',
      header: 'θ / day',
      align: 'right',
      sortValue: c => c.thetaPerDayPct,
      render: c => <span className={c.thetaPerDayPct > 5 ? 'text-bear' : 'text-textSecondary'}>−{c.thetaPerDayPct.toFixed(1)}%</span>,
    },
    { key: 'move', header: '1σ move', align: 'right', sortValue: c => c.expectedMovePct, render: c => <span className="text-bull">{c.expectedMovePct.toFixed(1)}%</span> },
    { key: 'be', header: 'Breakeven', align: 'right', sortValue: c => c.breakevenMovePct, render: c => `${c.breakevenMovePct.toFixed(1)}%` },
    {
      key: 'rr',
      header: 'Reward / risk',
      align: 'right',
      sortValue: c => rr(c),
      render: c => {
        const v = rr(c);
        return <span className={v >= 1 ? 'text-bull' : 'text-warn'}>{v.toFixed(2)}×</span>;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Structured build form (primary interface) ---- */}
      <Panel
        emphasis
        title={
          <span className="inline-flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Build a contract
          </span>
        }
        subtitle="scored live on the same scale as the top setups"
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3.5">
            {/* Ticker */}
            <Field label="Ticker" hint={`Spot $${snapshot.spot.toFixed(2)}`}>
              <TickerSearch value={activeTicker} onChange={changeTicker} />
            </Field>

            {/* Side */}
            <Field label="Side">
              <div className="inline-flex w-full rounded-md overflow-hidden border border-borderSubtle font-mono text-[12px]">
                {(['C', 'P'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setRight(r)}
                    className={`flex-1 px-2.5 py-1.5 font-semibold transition-colors ${
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
            </Field>

            {/* Strike */}
            <Field label="Strike" hint={`${step} strike grid`}>
              <div className="inline-flex w-full items-center rounded-md border border-borderSubtle overflow-hidden bg-inputBg">
                <button onClick={() => setStrike(s => Math.max(step, s - step))} className="px-2.5 py-1.5 text-textMuted hover:text-textPrimary" aria-label="Lower strike">
                  −
                </button>
                <input
                  type="number"
                  value={strike}
                  step={step}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    if (Number.isFinite(v)) setStrike(v);
                  }}
                  className="min-w-0 flex-1 bg-transparent text-center font-mono text-[12px] text-textPrimary outline-none tnum"
                />
                <button onClick={() => setStrike(s => s + step)} className="px-2.5 py-1.5 text-textMuted hover:text-textPrimary" aria-label="Raise strike">
                  +
                </button>
              </div>
            </Field>

            {/* Expiry */}
            <Field
              label="Expiry"
              icon={<Calendar className="w-3 h-3" />}
              hint={`${dte}d out · ${horizonLabel} sleeve`}
            >
              <div className="flex flex-col gap-1.5">
                <input
                  type="date"
                  value={expiryISO}
                  min={todayISO}
                  onChange={e => e.target.value && setExpiryDte(dteFromISO(e.target.value))}
                  className={inputBase}
                />
                <div className="inline-flex items-center gap-1 flex-wrap">
                  {DTE_PRESETS.map(d => (
                    <button
                      key={d}
                      onClick={() => setExpiryDte(d)}
                      className={`px-2 py-0.5 rounded border font-mono text-[11px] transition-colors ${
                        dte === d ? 'border-borderMuted bg-white/[0.06] text-textPrimary' : 'border-borderSubtle text-textMuted hover:text-textSecondary'
                      }`}
                    >
                      {d === 0 ? '0DTE' : `${d}d`}
                    </button>
                  ))}
                </div>
              </div>
            </Field>

            {/* Target date */}
            <Field
              label="Target date"
              icon={<Target className="w-3 h-3" />}
              hint={runway > 0 ? `${daysToTarget}d hold · ${runway}d runway to expiry` : `${daysToTarget}d hold · at expiry`}
            >
              <input
                type="date"
                value={targetISO}
                min={todayISO}
                max={expiryISO}
                onChange={e => setTargetISO(e.target.value)}
                className={inputBase}
              />
            </Field>

            {/* Expected move */}
            <Field
              label="Expected move"
              icon={<Percent className="w-3 h-3" />}
              hint={`Modeled 1σ ${weighed.expectedMovePct.toFixed(1)}% · BE ${weighed.breakevenMovePct.toFixed(1)}%`}
            >
              <div className="relative">
                <input
                  type="number"
                  value={expMoveInput}
                  placeholder={weighed.expectedMovePct.toFixed(1)}
                  onChange={e => setExpMoveInput(e.target.value)}
                  className={`${inputBase} pr-6`}
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] text-textMuted">%</span>
              </div>
            </Field>

            {/* Risk budget */}
            <Field
              label="Risk budget"
              icon={<DollarSign className="w-3 h-3" />}
              hint={`$${costPerContract.toFixed(0)} / contract at mid`}
            >
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] text-textMuted">$</span>
                <input
                  type="number"
                  value={budgetInput}
                  placeholder="0"
                  onChange={e => setBudgetInput(e.target.value)}
                  className={`${inputBase} pl-6`}
                />
              </div>
            </Field>
          </div>

          {/* ---- Command shortcut (secondary, power-user) ---- */}
          <div className="border-t border-borderSubtle pt-3">
            <button
              onClick={() => setShowCmd(s => !s)}
              className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-textMuted hover:text-textSecondary transition-colors"
            >
              <Terminal className="w-3 h-3" />
              Command shortcut
              <span className="text-textMuted/60 normal-case tracking-normal">— type a contract instead</span>
            </button>
            {showCmd && (
              <div className="mt-2.5 flex items-center gap-2 flex-wrap animate-slide-in">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textMuted" />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitQuery()}
                    placeholder="e.g. SPY 500C 7  ·  strike · call/put · days"
                    className="w-full bg-inputBg border border-borderSubtle focus:border-borderMuted rounded-md pl-8 pr-3 py-2 font-mono text-[12px] text-textPrimary placeholder:text-textMuted outline-none"
                  />
                </div>
                <button
                  onClick={submitQuery}
                  className="px-3 py-2 rounded-md border border-borderMuted bg-white/[0.04] text-textPrimary font-mono text-[11px] font-semibold uppercase tracking-wider hover:bg-white/[0.07] transition-colors"
                >
                  Parse
                </button>
              </div>
            )}
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
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors ${
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
              <span className={`font-mono text-4xl font-bold tnum ${weighed.composite >= 70 ? 'text-bull' : weighed.composite < 52 ? 'text-bear' : 'text-textPrimary'}`}>
                {weighed.composite}
              </span>
              <SignalBadge tone={tone}>{verdictLabel[weighed.verdict]}</SignalBadge>
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
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-bull mr-2">Edge</span>
                <span className="text-textSecondary">{weighed.edge}</span>
              </p>
              <p className="text-xs leading-relaxed">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-bear mr-2">Risk</span>
                <span className="text-textSecondary">{weighed.risk}</span>
              </p>
            </div>
          </div>
        </Panel>

        {/* ---- Your plan: form inputs read against engine values ---- */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" /> Your plan
            </span>
          }
          subtitle="thesis, timing & sizing"
          className="xl:col-span-5"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <SignalBadge tone={clearsBreakeven ? 'bull' : 'warn'} dot>
                {clearsBreakeven ? 'Clears breakeven' : 'Short of breakeven'}
              </SignalBadge>
              <span className="font-mono text-[11px] text-textMuted tnum">
                your {effExpMove.toFixed(1)}% vs {weighed.breakevenMovePct.toFixed(1)}% BE
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Cell k="Days to expiry" v={`${dte}d`} />
              <Cell k="Hold to target" v={`${daysToTarget}d`} />
              <Cell k="Runway to expiry" v={`${runway}d`} tone={runway <= 0 ? 'warn' : 'neutral'} />
              <Cell k="Your exp. move" v={`${effExpMove.toFixed(1)}%`} tone={clearsBreakeven ? 'bull' : 'warn'} />
              <Cell k="Cost / contract" v={`$${costPerContract.toFixed(0)}`} />
              <Cell k="Contracts in budget" v={contractsInBudget != null ? `${contractsInBudget}` : '—'} tone={contractsInBudget === 0 ? 'warn' : 'neutral'} />
              <Cell k="Est. outlay" v={outlay != null ? `$${outlay.toFixed(0)}` : '—'} />
              <Cell k="Modeled 1σ" v={`${weighed.expectedMovePct.toFixed(1)}%`} tone="bull" />
            </div>

            <p className="text-xs text-textSecondary leading-relaxed">
              {clearsBreakeven
                ? `A ${effExpMove.toFixed(1)}% move clears the ${weighed.breakevenMovePct.toFixed(1)}% breakeven with room to spare.`
                : `A ${effExpMove.toFixed(1)}% move falls short of the ${weighed.breakevenMovePct.toFixed(1)}% breakeven — you're leaning on the tail.`}
              {budget != null &&
                (contractsInBudget && contractsInBudget > 0
                  ? ` Your $${budget.toFixed(0)} budget clears ${contractsInBudget} contract${contractsInBudget > 1 ? 's' : ''} at the $${costPerContract.toFixed(0)} mid.`
                  : ` Your $${budget.toFixed(0)} budget is under the $${costPerContract.toFixed(0)} single-contract mid.`)}
            </p>
            <p className="font-mono text-[10px] text-textMuted leading-relaxed border-t border-borderSubtle pt-2.5">
              Sizing off the modeled mid × {CONTRACT_MULTIPLIER}-share multiplier. Expected-move field defaults to the modeled 1σ; override it to stress your own thesis.
            </p>
          </div>
        </Panel>
      </div>

      {/* ---- Alternatives in the same sleeve & direction ---- */}
      <Panel
        flush
        title={
          <span className="inline-flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" /> Same-sleeve alternatives
          </span>
        }
        subtitle={`${weighed.right === 'C' ? 'calls' : 'puts'} · ${horizonLabel}`}
        tone={better ? 'bull' : 'neutral'}
      >
        <div className="px-4 pt-3">
          <p className="text-xs text-textSecondary leading-relaxed">
            {better ? (
              <>
                <span className="inline-flex items-center gap-1 text-bull font-semibold">
                  <TrendingUp className="w-3.5 h-3.5" />
                  {better.ticker} {better.strike}
                  {better.right}
                </span>{' '}
                scores <span className="text-textPrimary font-semibold">{better.composite}</span> vs your{' '}
                <span className="text-textPrimary font-semibold">{weighed.composite}</span> and clears its breakeven with more room
                ({better.expectedMovePct.toFixed(1)}% of 1σ against a {better.breakevenMovePct.toFixed(1)}% breakeven). Click any row to weigh it.
              </>
            ) : (
              <>
                Nothing in the {horizonLabel} sleeve beats your {weighed.right === 'C' ? 'call' : 'put'} on both score and
                reward-to-risk — it's the strongest expression in its lane right now. Click any row to weigh it.
              </>
            )}
          </p>
        </div>
        <div className="mt-2">
          <DataTable
            columns={altColumns}
            rows={altRows}
            rowKey={c => c.id}
            onRowClick={loadContract}
            selectedKey={weighed.id}
            initialSort={{ key: 'score', dir: 'desc' }}
            emptyText="No alternatives in this sleeve"
          />
        </div>
      </Panel>

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
