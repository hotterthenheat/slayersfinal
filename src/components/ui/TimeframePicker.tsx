import { TIMEFRAMES, type Timeframe } from '../../data/timeframe';

interface TimeframePickerProps {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
  className?: string;
}

/**
 * Chart-toolbar interval selector. Deliberately denser than SegmentedControl:
 * this sits in a row beside the legend and the reset button, so it carries
 * their weight rather than a page-level control's, and seven segments still
 * fit inside a Pulse tile.
 */
const TimeframePicker = ({ value, onChange, className = '' }: TimeframePickerProps) => (
  <div
    role="group"
    aria-label="Chart timeframe"
    className={`inline-flex shrink-0 items-center overflow-hidden rounded border border-borderSubtle bg-panel ${className}`}
  >
    {TIMEFRAMES.map(tf => {
      const active = tf.value === value;
      return (
        <button
          key={tf.value}
          onClick={() => onChange(tf.value)}
          aria-pressed={active}
          title={`${tf.label} bars`}
          className={`px-1.5 py-1 font-mono text-micro uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60 ${
            active ? 'bg-white/[0.12] text-textPrimary' : 'text-textSecondary hover:bg-rowHover hover:text-textPrimary'
          }`}
        >
          {tf.label}
        </button>
      );
    })}
  </div>
);

export default TimeframePicker;
