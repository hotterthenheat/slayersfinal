/*
==================================================
  SLAYER TERMINAL - 4-WAY BOARD (/pulse/board)
  A dedicated page of nothing but four live charts,
  opened from the main chart's toolbar. Every cell
  is its own cockpit: its own ticker (the sim
  synthesizes unknowns), its own timeframe, its own
  overlays, the candle picker, and a fullscreen
  takeover — the same controls the main Pulse chart
  carries. Each chart derives its walls/flip/king
  and dark-pool prints from its OWN book. The back
  arrow returns to Pulse; the whole layout persists.
==================================================
*/

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Minimize2 } from 'lucide-react';
import Simulator from '../core/simulator';
import { useMarketData } from '../context/MarketDataContext';
import { buildLevelsFor, buildPrints } from '../data/gex';
import StrikeChart, { DEFAULT_OVERLAYS, type ChartOverlays } from '../components/gex/StrikeChart';
import ChartToolbar from '../components/gex/ChartToolbar';
import TickerQuickPick from '../components/gex/TickerQuickPick';
import SpotPrice from '../components/gex/SpotPrice';
import { TIMEFRAMES, type Timeframe } from '../data/timeframe';

const BOARD_KEY = 'slayer_pulse_board';

interface BoardCellCfg {
  ticker: string;
  timeframe: Timeframe;
  overlays: ChartOverlays;
}

const TF_VALUES = new Set<string>(TIMEFRAMES.map(t => t.value));

/** Self-healing load — anything malformed falls back to the default slot. */
function loadCells(): BoardCellCfg[] {
  const defaults: BoardCellCfg[] = Simulator.WATCHLIST.slice(0, 4).map(ticker => ({
    ticker,
    timeframe: '1m',
    overlays: { ...DEFAULT_OVERLAYS },
  }));
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaults;
    return defaults.map((def, i) => {
      const c = parsed[i] as Partial<BoardCellCfg> | undefined;
      if (!c || typeof c !== 'object') return def;
      return {
        ticker: typeof c.ticker === 'string' && c.ticker ? c.ticker : def.ticker,
        timeframe: typeof c.timeframe === 'string' && TF_VALUES.has(c.timeframe) ? (c.timeframe as Timeframe) : def.timeframe,
        overlays: { ...DEFAULT_OVERLAYS, ...(c.overlays && typeof c.overlays === 'object' ? c.overlays : {}) },
      };
    });
  } catch {
    return defaults;
  }
}

interface BoardCellProps {
  cfg: BoardCellCfg;
  onCfg: (next: Partial<BoardCellCfg>) => void;
  revision: number;
  expanded: boolean;
  onToggleExpand: () => void;
  /** Cell position — staggers the entrance so the board builds up smoothly */
  index: number;
}

const BoardCell = ({ cfg, onCfg, revision, expanded, onToggleExpand, index }: BoardCellProps) => {
  // Each cell reads its own book — revision keeps levels tracking the live sim
  const levels = useMemo(
    () => buildLevelsFor(cfg.ticker),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg.ticker, revision]
  );
  // Prints are deterministic per ticker — pinned so the lines don't wander
  const prints = useMemo(
    () => buildPrints(cfg.ticker, levels.spot),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg.ticker]
  );

  return (
    // 'contents' keeps the grid slot when docked; expanding lifts the same
    // cell into a viewport takeover without remounting the chart
    <div className={expanded ? 'fixed inset-0 z-[80] bg-canvas p-3 flex flex-col' : 'contents'}>
      <div
        className={`flex flex-col min-h-0 border border-borderSubtle bg-panel rounded-md overflow-hidden animate-soft-in ${
          expanded ? 'flex-1' : ''
        }`}
        style={{ animationDelay: `${index * 70}ms` }}
      >
        <div className="flex items-center gap-2.5 flex-wrap px-2.5 py-1.5 border-b border-borderSubtle shrink-0 select-none">
          <TickerQuickPick ticker={cfg.ticker} onPick={t => onCfg({ ticker: t })} />
          <SpotPrice value={levels.spot} />
          <div className="ml-auto">
            <ChartToolbar
              minimal
              candles
              timeframe={cfg.timeframe}
              onTimeframe={tf => onCfg({ timeframe: tf })}
              overlays={cfg.overlays}
              onOverlays={o => onCfg({ overlays: o })}
              fullscreen={expanded}
              onToggleFullscreen={onToggleExpand}
            />
          </div>
        </div>
        <div className={expanded ? 'flex-1 min-h-0' : 'h-[38vh] min-h-[300px]'}>
          <StrikeChart
            ticker={cfg.ticker}
            revision={revision}
            levels={levels}
            timeframe={cfg.timeframe}
            height={expanded ? 300 : 280}
            overlays={cfg.overlays}
            prints={prints}
          />
        </div>
      </div>
    </div>
  );
};

/** Standalone at /pulse/board (back = Link), or embedded in the desk's quad
    takeover (onBack provided — back = the takeover's fade-close). */
const PulseBoard = ({ onBack }: { onBack?: () => void }) => {
  const { marketData } = useMarketData();
  const revRef = useRef(0);
  const revision = useMemo(() => ++revRef.current, [marketData]);

  const [cells, setCells] = useState<BoardCellCfg[]>(loadCells);
  useEffect(() => {
    try {
      localStorage.setItem(BOARD_KEY, JSON.stringify(cells));
    } catch {
      /* non-fatal */
    }
  }, [cells]);
  const updateCell = (index: number, next: Partial<BoardCellCfg>) =>
    setCells(prev => prev.map((c, i) => (i === index ? { ...c, ...next } : c)));

  // One cell at a time takes the viewport — Esc collapses, scroll locks under
  const [expanded, setExpanded] = useState<number | null>(null);
  useEffect(() => {
    if (expanded === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(null);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [expanded]);

  return (
    <>
      {/* Slim header — a back arrow and the name; the charts are the page */}
      <div className="flex items-center gap-3">
        {onBack ? (
          <button
            onClick={onBack}
            title="Back"
            className="group inline-flex items-center justify-center w-8 h-8 rounded-md border border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors"
          >
            <ArrowLeft className="w-4 h-4 transition-transform duration-200 ease-out group-hover:-translate-x-0.5" />
          </button>
        ) : (
          <Link
            to="/pulse"
            title="Back"
            className="group inline-flex items-center justify-center w-8 h-8 rounded-md border border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors"
          >
            <ArrowLeft className="w-4 h-4 transition-transform duration-200 ease-out group-hover:-translate-x-0.5" />
          </Link>
        )}
        <div>
          <h1 className="font-mono text-[13px] font-bold uppercase tracking-wider text-textPrimary">
            4-way board
          </h1>
          <p className="font-mono text-[10px] text-textMuted uppercase tracking-widest">
            four books · every chart its own controls
          </p>
        </div>
        {expanded !== null && (
          <button
            onClick={() => setExpanded(null)}
            className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-borderSubtle font-mono text-[10px] uppercase tracking-wider text-textSecondary"
          >
            <Minimize2 className="w-3.5 h-3.5" /> Esc
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {cells.map((cfg, i) => (
          <BoardCell
            key={i}
            cfg={cfg}
            onCfg={next => updateCell(i, next)}
            revision={revision}
            expanded={expanded === i}
            onToggleExpand={() => setExpanded(cur => (cur === i ? null : i))}
            index={i}
          />
        ))}
      </div>
    </>
  );
};

export default PulseBoard;
