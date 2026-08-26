import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import Simulator from '../core/simulator';
import Ledger from '../core/ledger';
import { enrichPrint } from '../data/tape';
import type { FlowPrint } from '../types/trace';
import type { ExecuteResult, LedgerStats, MarketSnapshot, TickerSymbol, TradeRecord } from '../types/market';

/*
  THE TAPE ACCUMULATES HERE, AND ONLY HERE.

  Trace's desk built its own buffer in component state, which meant the tape
  existed only while a reader stood on /trace/live-tape. A flow pane on a chart
  cannot reach that, and giving the chart a second accumulator would be two
  generators for one fact — two surfaces quoting different numbers for the same
  session, which this codebase has been bitten by more than once.

  So it accumulates once, in the provider that already owns the tick, and both
  the tape desk and the chart read the same prints.
*/

/** Prints kept in memory. ~40 arrive a second across the watchlist at a 1.5s
    tick, so this is roughly half an hour of tape — enough to fill a 1m chart
    several times over, and small enough not to matter. */
const TAPE_CAP = 5000;

/** Nothing older than this is worth keeping for a chart pane. */
const TAPE_MAX_AGE_MS = 4 * 60 * 60 * 1000;

/** A print plus the instant it arrived.

    `FlowPrint.time` is a `toLocaleTimeString()` string with no date: it cannot
    be placed on an axis and it sorts wrongly across midnight. Stamping arrival
    is not a stand-in for a missing field — this tape is generated live, one
    tick at a time, so the moment a print arrives IS the moment it printed. */
export type StampedPrint = FlowPrint & { at: number };

interface LedgerState {
  activeTrades: TradeRecord[];
  closedTrades: TradeRecord[];
  stats: LedgerStats;
}

interface MarketDataContextValue {
  activeTicker: TickerSymbol;
  marketData: MarketSnapshot | null;
  ledgerState: LedgerState;
  /** Every option print since the app opened, newest FIRST — the one tape.
      Memory only: it starts empty on a cold load, because nothing recorded
      this session before the app was running. */
  flowTape: StampedPrint[];
  changeTicker: (ticker: string) => void;
  executeTrade: () => ExecuteResult;
  clearLedger: () => void;
}

const MarketDataContext = createContext<MarketDataContextValue | null>(null);

export const MarketDataProvider = ({ children }: { children: React.ReactNode }) => {
  const [activeTicker, setActiveTickerState] = useState<TickerSymbol>(Simulator.getActiveTicker());
  const [marketData, setMarketData] = useState<MarketSnapshot | null>(null);
  const [ledgerState, setLedgerState] = useState<LedgerState>({
    activeTrades: [],
    closedTrades: [],
    stats: { winRate: 0, profitFactor: 0, avgAccuracy: 0, totalPnL: 0, count: 0 }
  });

  const [flowTape, setFlowTape] = useState<StampedPrint[]>([]);
  /* The print id counter lives in a ref, not in state: it must never reset on a
     re-render, and a duplicate id would collapse two prints into one row on a
     keyed list. */
  const printIdRef = useRef(0);

  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize Ledger on Mount
  useEffect(() => {
    Ledger.loadFromStorage();
    updateLedgerState();

    // Start Ticking
    startSimulator();

    return () => {
      stopSimulator();
    };
  }, []);

  const updateLedgerState = () => {
    setLedgerState({
      activeTrades: [...Ledger.getActiveTrades()],
      closedTrades: [...Ledger.getClosedTrades()],
      stats: Ledger.getStats()
    });
  };

  /* One tick's prints, enriched and stamped, folded onto the front of the tape.
     Newest first, matching how the tape desk reads. */
  const absorbTape = (data: MarketSnapshot) => {
    if (!data.tape || data.tape.length === 0) return;
    const now = Date.now();
    const fresh: StampedPrint[] = data.tape.map(o => ({
      ...enrichPrint(o, ++printIdRef.current),
      at: now,
    }));
    setFlowTape(prev => {
      const next = [...fresh, ...prev];
      const cutoff = now - TAPE_MAX_AGE_MS;
      /* Age first, then the count cap. Age alone would let a busy session run
         unbounded; the count alone would keep yesterday's prints alive on a
         tab left open overnight. */
      const aged = next.length > TAPE_CAP || next[next.length - 1]?.at < cutoff
        ? next.filter(p => p.at >= cutoff)
        : next;
      return aged.length > TAPE_CAP ? aged.slice(0, TAPE_CAP) : aged;
    });
  };

  const processTick = () => {
    Simulator.tick((data) => {
      // 1. Update market state
      setMarketData(data);
      absorbTape(data);

      // 2. Evaluate open trades
      const currentActiveTicker = Simulator.getActiveTicker();
      Ledger.updateOpenTrades(currentActiveTicker, data.spot);

      // 3. Keep ledger stats in sync
      updateLedgerState();
    });
  };

  const startSimulator = () => {
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    processTick();
    tickIntervalRef.current = setInterval(processTick, 1500);
  };

  const stopSimulator = () => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  };

  const changeTicker = (ticker: string) => {
    const sym = Simulator.setActiveTicker(ticker);
    setActiveTickerState(sym);

    // Trigger instant tick for snappy UI transition
    Simulator.tick((data) => {
      setMarketData(data);
      absorbTape(data);
      updateLedgerState();
    });
  };

  const executeTrade = (): ExecuteResult => {
    if (!marketData || !marketData.plan) return { success: false, message: 'No active plan' };
    const res = Ledger.executePlan(marketData.plan);
    updateLedgerState();
    return res;
  };

  const clearLedger = () => {
    Ledger.clearHistory();
    updateLedgerState();
  };

  return (
    <MarketDataContext.Provider value={{
      activeTicker,
      marketData,
      ledgerState,
      flowTape,
      changeTicker,
      executeTrade,
      clearLedger
    }}>
      {children}
    </MarketDataContext.Provider>
  );
};

export const useMarketData = (): MarketDataContextValue => {
  const context = useContext(MarketDataContext);
  if (!context) {
    throw new Error('useMarketData must be used within a MarketDataProvider');
  }
  return context;
};
