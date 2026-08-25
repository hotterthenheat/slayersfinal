/*
==================================================
  SLAYER TERMINAL - SESSION SPARK (SessionSpark.tsx)
  The Robinhood-style session preview (Noah,
  2026-08-17: his partner's cards carry zigzag
  decorations — ours draws the ACTUAL tape): the
  underlying's real session closes as a thin line,
  colored by its net direction, over a dashed
  baseline at the session open.

  SEEDING DISCIPLINE: reads bars via peekCandles,
  which never seeds. Names without history join one
  shared queue and forward-sim ~250ms apart in the
  background — a board of 18 cards must never
  synchronously seed 18 histories in one frame. The
  spark appears the moment its name's tape exists.
==================================================
*/

import { useEffect, useState } from 'react';
import Simulator from '../../core/simulator';

// ---- one shared seeding queue ----------------------------------------------
const queued = new Set<string>();
const queue: string[] = [];
const listeners = new Set<() => void>();
let pumping = false;

function requestSeed(sym: string): void {
  const key = sym.toUpperCase();
  if (queued.has(key)) return;
  queued.add(key);
  queue.push(key);
  if (pumping) return;
  pumping = true;
  const pump = () => {
    const next = queue.shift();
    if (!next) {
      pumping = false;
      return;
    }
    try {
      Simulator.ensureTicker(next);
    } catch {
      /* a name the sim can't build simply never gets a spark */
    }
    listeners.forEach(l => l());
    window.setTimeout(pump, 250);
  };
  window.setTimeout(pump, 50);
}

/** The latest session's closes: walk back from the newest bar until the
    overnight gap (bars are a fixed interval apart inside a session). */
function sessionCloses(bars: { time: number; close: number }[]): number[] {
  if (bars.length < 2) return bars.map(b => b.close);
  const interval = bars[bars.length - 1].time - bars[bars.length - 2].time || 60;
  let start = bars.length - 1;
  while (start > 0 && bars[start].time - bars[start - 1].time <= interval * 2) start--;
  return bars.slice(start).map(b => b.close);
}

interface SessionSparkProps {
  ticker: string;
  width?: number;
  height?: number;
}

const SessionSpark = ({ ticker, width = 96, height = 26 }: SessionSparkProps) => {
  const [, force] = useState(0);
  const bars = Simulator.peekCandles(ticker);

  useEffect(() => {
    if (bars) return;
    const bump = () => {
      if (Simulator.peekCandles(ticker)) force(n => n + 1);
    };
    listeners.add(bump);
    requestSeed(ticker);
    return () => {
      listeners.delete(bump);
    };
  }, [ticker, bars]);

  // Reserve the box while the tape seeds — cards must not resize when the
  // line arrives.
  if (!bars || bars.length < 2) return <span style={{ width, height }} className="shrink-0" aria-hidden />;

  const closes = sessionCloses(bars);
  // Downsample to ≤40 points, always keeping the latest close.
  const step = Math.max(1, Math.floor(closes.length / 40));
  const pts = closes.filter((_, i) => i % step === 0);
  if (pts[pts.length - 1] !== closes[closes.length - 1]) pts.push(closes[closes.length - 1]);
  if (pts.length < 2) return <span style={{ width, height }} className="shrink-0" aria-hidden />;

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const base = pts[0];
  const x = (i: number) => (i / (pts.length - 1)) * width;
  const y = (v: number) => height - 1 - ((v - min) / range) * (height - 2);
  const up = pts[pts.length - 1] >= base;
  const ink = up ? '#30D158' : '#FF3B30';
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0" aria-hidden>
      {/* the session open — the line reads above/below it at a glance */}
      <line
        x1={0}
        x2={width}
        y1={y(base)}
        y2={y(base)}
        stroke="rgba(237,237,237,0.18)"
        strokeWidth={1}
        strokeDasharray="2 3"
      />
      <path d={d} fill="none" stroke={ink} strokeOpacity={0.9} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

export default SessionSpark;
