import { Activity, Scale, Crosshair } from 'lucide-react';
import { useTickerNav } from '../../context/useTickerNav';
import type { Horizon } from '../../core/contractScore';

interface TickerJumpProps {
  ticker: string;
  /** Which destinations to offer */
  show?: ('pulse' | 'compass' | 'pinpoint')[];
  /** Horizon to open the Compass Weigher on */
  horizon?: Horizon;
  className?: string;
}

const btn =
  'inline-flex items-center gap-1 px-2 py-1 rounded border border-borderSubtle bg-white/[0.02] font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors';

/** Cross-module jump chips — send a research name straight into the terminals. */
const TickerJump = ({ ticker, show = ['pulse', 'compass', 'pinpoint'], horizon, className = '' }: TickerJumpProps) => {
  const nav = useTickerNav();
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {show.includes('pulse') && (
        <button className={btn} onClick={() => nav.openInPulse(ticker)} title={`Open ${ticker} in Pulse`}>
          <Activity className="w-3 h-3" /> Pulse
        </button>
      )}
      {show.includes('compass') && (
        <button className={btn} onClick={() => nav.openInCompass(ticker, { horizon })} title={`Weigh ${ticker} contracts`}>
          <Scale className="w-3 h-3" /> Weigh
        </button>
      )}
      {show.includes('pinpoint') && (
        <button className={btn} onClick={() => nav.openInPinpoint(ticker)} title={`${ticker} dealer positioning`}>
          <Crosshair className="w-3 h-3" /> Pinpoint
        </button>
      )}
    </span>
  );
};

export default TickerJump;
