import { useEffect, useRef, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import type { MarketSnapshot } from '../../types/market';

/*
  THE SCAN TIER, as a hook.

  Every Pinpoint desk rebuilds its book from a snapshot, and a book rebuilt
  on every tick vibrates: bars breathe, walls hop a strike and hop back,
  a reader cannot hold a number in their eye long enough to use it. The
  old desks each carried a private copy of the same ten-second gate; this
  is that gate, once. A ticker change is immediate — the reader asked for
  a different book and should not wait ten seconds to see it.
*/
export const SCAN_INTERVAL_MS = 10_000;

export function useScanSnapshot(intervalMs = SCAN_INTERVAL_MS): { snapshot: MarketSnapshot | null; scanAt: string } {
  const { marketData } = useMarketData();
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [scanAt, setScanAt] = useState('');
  const lastRef = useRef<MarketSnapshot | null>(null);
  const atRef = useRef(0);

  useEffect(() => {
    if (!marketData) return;
    const now = Date.now();
    const due = !lastRef.current || now - atRef.current >= intervalMs || lastRef.current.ticker !== marketData.ticker;
    if (!due) return;
    lastRef.current = marketData;
    atRef.current = now;
    setSnapshot(marketData);
    setScanAt(new Date(now).toLocaleTimeString('en-GB'));
  }, [marketData, intervalMs]);

  return { snapshot, scanAt };
}
