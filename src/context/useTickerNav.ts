/*
==================================================
  SLAYER TERMINAL - CROSS-MODULE NAV (useTickerNav)
  One place that ties "I found a name here" to "show
  it to me over there." Sets the global active ticker
  and routes, so a Stocks pick, a News headline or an
  Earnings play can jump straight into Pulse or the
  Compass Weigher on the same symbol.
==================================================
*/

import { useNavigate } from 'react-router-dom';
import { useMarketData } from './MarketDataContext';
import type { Horizon } from '../core/contractScore';

export interface TickerNav {
  /** Switch the global feed without leaving the page */
  focus: (ticker: string) => void;
  /** Open the name in the live terminal */
  openInPulse: (ticker: string) => void;
  /** Open the name in Compass — optionally straight into the Weigher at a horizon */
  openInCompass: (ticker: string, weigh?: { horizon?: Horizon }) => void;
  /** Open the name's dealer positioning */
  openInPinpoint: (ticker: string) => void;
}

export function useTickerNav(): TickerNav {
  const navigate = useNavigate();
  const { changeTicker } = useMarketData();
  return {
    focus: ticker => changeTicker(ticker),
    openInPulse: ticker => {
      changeTicker(ticker);
      navigate('/pulse');
    },
    openInCompass: (ticker, weigh) => {
      changeTicker(ticker);
      navigate('/compass', weigh ? { state: { weigh: { ticker, horizon: weigh.horizon ?? 'WEEKLIES' } } } : undefined);
    },
    openInPinpoint: ticker => {
      changeTicker(ticker);
      navigate('/pinpoint');
    },
  };
}
