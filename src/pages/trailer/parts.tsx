/*
  Scene vocabulary.

  Small, dense primitives shared by every scene so the film reads as one
  instrument rather than seventeen designs. Everything here is paint-only and
  driven by a scalar `progress`: no component owns a timer, and nothing animates
  a layout property.
*/

import React, { useEffect, useRef, useState } from 'react';
import type { Tone } from '../../components/ui/tones';
import { toneBar, toneText } from '../../components/ui/tones';
import { at, clamp01, ease } from './useTrailerState';

// ---- fill ------------------------------------------------------------------
/**
 * Hands its children the height it was actually given.
 *
 * The charts used to take a hard-coded height, which left a 300px void under
 * every one of them on a tall stage — the panel stretched and its instrument did
 * not. Stretching the SVG with preserveAspectRatio instead would have worked for
 * the paths and distorted every axis label with them, so the height is measured
 * and passed down as a number.
 */
export const FillBox: React.FC<{ className?: string; min?: number; children: (h: number) => React.ReactNode }> = ({
  className = '',
  min = 90,
  children,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const next = Math.round(entries[0].contentRect.height);
      setH(prev => (Math.abs(prev - next) > 1 ? next : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className={`min-h-0 ${className}`}>
      {h > 0 ? children(Math.max(min, h)) : null}
    </div>
  );
};

// ---- staged reveal ----------------------------------------------------------
/**
 * A beat inside a scene.
 *
 * Wraps children in an opacity/translate that resolves over `[from, to]` of the
 * scene's own progress. Under reduced motion the translate is dropped and only
 * the opacity remains, so the narrative order still reads without movement.
 */
export const Beat: React.FC<{
  p: number;
  from: number;
  to?: number;
  reduced?: boolean;
  y?: number;
  className?: string;
  children: React.ReactNode;
}> = ({ p, from, to, reduced = false, y = 8, className = '', children }) => {
  const e = ease(at(p, from, to ?? from + 0.12));
  return (
    <div
      className={className}
      style={{ opacity: e, transform: reduced ? undefined : `translate3d(0, ${(1 - e) * y}px, 0)` }}
    >
      {children}
    </div>
  );
};

// ---- header / footer --------------------------------------------------------
export const SceneHead: React.FC<{
  product: string;
  line: string;
  p: number;
  reduced?: boolean;
}> = ({ product, line, p, reduced }) => (
  <Beat p={p} from={0} to={0.1} reduced={reduced} className="flex items-baseline gap-3 min-w-0">
    <span className="inst-eyebrow holo-bar" aria-hidden />
    <h2 className="font-mono text-label sm:text-caption font-semibold uppercase tracking-[0.28em] text-textPrimary shrink-0">
      {product}
    </h2>
    <p className="font-mono text-label text-textSecondary truncate">{line}</p>
  </Beat>
);

/** The one key statement a scene is allowed. Never more than one. */
export const SceneStatement: React.FC<{ p: number; from: number; reduced?: boolean; children: React.ReactNode }> = ({
  p,
  from,
  reduced,
  children,
}) => (
  <Beat p={p} from={from} to={from + 0.14} reduced={reduced}>
    <p className="font-mono text-caption sm:text-data text-textPrimary leading-snug max-w-[62ch]">{children}</p>
  </Beat>
);

/**
 * The honesty line.
 *
 * Present on every scene that shows a number. Modelled values say modelled,
 * inferred values say inferred, and nothing on screen claims to have observed a
 * dealer's book or a counterparty's intent.
 */
export const Caveat: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="font-mono text-micro uppercase tracking-wider text-textMuted leading-relaxed">{children}</p>
);

// ---- readouts ---------------------------------------------------------------
export const Cell: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
  className?: string;
}> = ({ label, value, sub, tone = 'neutral', className = '' }) => (
  <div className={`inst-surface rounded px-2.5 py-1.5 min-w-0 ${className}`}>
    <div className="font-mono text-micro uppercase tracking-widest text-textMuted truncate">{label}</div>
    <div className={`mt-0.5 font-mono text-caption sm:text-data font-semibold tnum truncate ${toneText[tone]}`}>{value}</div>
    {sub && <div className="mt-0.5 font-mono text-micro text-textMuted truncate">{sub}</div>}
  </div>
);

export const KeyValue: React.FC<{ k: React.ReactNode; v: React.ReactNode; tone?: Tone }> = ({ k, v, tone = 'neutral' }) => (
  <div className="flex items-baseline justify-between gap-3 py-[3px] border-b border-borderSubtle/60 last:border-0">
    <span className="font-mono text-micro uppercase tracking-wider text-textMuted truncate">{k}</span>
    <span className={`font-mono text-micro sm:text-label tnum ${toneText[tone]}`}>{v}</span>
  </div>
);

/**
 * A proportional bar that fills to its value.
 *
 * `grow` is the scene's own progress through the bar's window, so a row of these
 * settles in sequence rather than all snapping at once — the readout arriving,
 * not the UI responding to a click.
 */
export const Bar: React.FC<{ value: number; grow?: number; tone?: Tone; height?: number; className?: string }> = ({
  value,
  grow = 1,
  tone = 'neutral',
  height = 4,
  className = '',
}) => (
  <div className={`w-full rounded-sm bg-white/[0.06] overflow-hidden ${className}`} style={{ height }}>
    <div
      className={`h-full rounded-sm ${toneBar[tone]}`}
      style={{ width: `${clamp01(Math.abs(value)) * clamp01(grow) * 100}%`, transformOrigin: 'left' }}
    />
  </div>
);

/** A signed bar that grows from a centre line — exposure, not magnitude. */
export const SignedBar: React.FC<{ value: number; grow?: number; height?: number }> = ({ value, grow = 1, height = 6 }) => {
  const w = (clamp01(Math.abs(value)) * clamp01(grow) * 100) / 2;
  return (
    <div className="relative w-full bg-white/[0.05] rounded-sm overflow-hidden" style={{ height }}>
      <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
      <div
        className={`absolute inset-y-0 ${value >= 0 ? 'bg-longGamma/80' : 'bg-shortGamma/80'}`}
        style={value >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
      />
    </div>
  );
};

// ---- verdict chip -----------------------------------------------------------
const VERDICT_TONE: Record<string, Tone> = {
  SELECTED: 'select',
  ALTERNATIVE: 'neutral',
  REJECTED: 'bear',
  'NO TRADE': 'warn',
  CONSIDERED: 'info',
  FAVOURED: 'select',
  AGAINST: 'bear',
  NEUTRAL: 'neutral',
  'LIVE READ': 'info',
  UNCONFIRMED: 'warn',
  DECAYING: 'neutral',
};

export const Verdict: React.FC<{ children: string; className?: string }> = ({ children, className = '' }) => {
  const tone = VERDICT_TONE[children] ?? 'neutral';
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-px font-mono text-micro font-semibold uppercase tracking-wider ${
        tone === 'select'
          ? 'bg-select/10 text-select border-select/25'
          : tone === 'bear'
            ? 'bg-bear/10 text-bear border-bear/25'
            : tone === 'warn'
              ? 'bg-warn/10 text-warn border-warn/25'
              : tone === 'info'
                ? 'bg-flip/10 text-flip border-flip/25'
                : 'bg-white/[0.04] text-textSecondary border-borderSubtle'
      } ${className}`}
    >
      {children}
    </span>
  );
};

// ---- price field ------------------------------------------------------------
export interface FieldLevel {
  price: number;
  label: string;
  kind: 'support' | 'resistance' | 'flip' | 'shelf';
}

const LEVEL_STROKE: Record<FieldLevel['kind'], string> = {
  support: '#30D158',
  resistance: '#FF3B30',
  flip: '#7DD3FC',
  shelf: '#2dd4bf',
};

/**
 * The price field.
 *
 * The one chart the trailer reuses, so the same structural level sits at the
 * same height every time it appears. Draws as a single path with a clipped
 * reveal rather than per-point elements — a 200-point series is one node, not
 * two hundred.
 */
export const PriceField: React.FC<{
  points: { t: number; px: number }[];
  reveal: number;
  levels?: FieldLevel[];
  height?: number;
  /** Marks where the live edge is, with a breathing dot. */
  markLive?: boolean;
  /**
   * Scale the time axis to the session so far rather than to the whole series.
   *
   * Without it a partial reveal draws into the left fifth of the frame and leaves
   * the rest blank, which reads as an unfinished chart rather than a session in
   * progress. With it the drawn path fills the width and the live edge sits just
   * inside the right margin — the way an intraday chart actually behaves.
   */
  follow?: boolean;
  pulse?: number;
  className?: string;
  ariaLabel: string;
}> = ({ points, reveal, levels = [], height = 180, markLive = true, follow = false, pulse = 0, className = '', ariaLabel }) => {
  const W = 1000;
  const H = height;
  const shown = Math.max(2, Math.round(points.length * clamp01(reveal)));
  const slice = points.slice(0, shown);
  const all = points.map(p => p.px).concat(levels.map(l => l.price));
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const pad = span * 0.12;
  const y = (v: number) => H - ((v - (lo - pad)) / (span + pad * 2)) * H;
  // Following keeps a slice of headroom past the live edge so the dot never sits
  // flush against the frame.
  const lastIdx = follow ? Math.max(1, (shown - 1) / 0.88) : points.length - 1;
  const x = (i: number) => (i / lastIdx) * W;
  const d = slice.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.px).toFixed(1)}`).join('');
  const last = slice[slice.length - 1];
  const lastX = x(shown - 1);
  const lastY = y(last.px);
  const rising = slice.length > 4 && last.px >= slice[slice.length - 5].px;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
    >
      {levels.map(l => (
        <g key={l.label}>
          <line
            x1={0}
            x2={W}
            y1={y(l.price)}
            y2={y(l.price)}
            stroke={LEVEL_STROKE[l.kind]}
            strokeWidth={l.kind === 'shelf' ? 1.6 : 1}
            strokeDasharray={l.kind === 'flip' ? '6 5' : l.kind === 'shelf' ? undefined : '3 6'}
            opacity={0.55}
          />
          <text
            x={8}
            y={y(l.price) - 5}
            fill={LEVEL_STROKE[l.kind]}
            fontSize={11}
            fontFamily="ui-monospace, monospace"
            opacity={0.85}
          >
            {l.label}
          </text>
        </g>
      ))}
      <path d={d} fill="none" stroke="#E4E8F4" strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {markLive && (
        <>
          <line x1={lastX} x2={lastX} y1={0} y2={H} stroke="#E4E8F4" strokeWidth={0.5} opacity={0.28} />
          <circle
            cx={lastX}
            cy={lastY}
            r={3 + Math.sin(pulse * Math.PI * 2) * 0.9}
            fill={rising ? '#30D158' : '#FF3B30'}
            opacity={0.95}
          />
        </>
      )}
    </svg>
  );
};

// ---- dense row list ---------------------------------------------------------
/**
 * Rows that arrive.
 *
 * `arrivals` is a list of scene-progress thresholds; a row is not rendered until
 * its threshold passes, so the tape fills at the rhythm the story dictates
 * rather than all at once or on a metronome.
 */
export const ArrivalList: React.FC<{
  p: number;
  arrivals: number[];
  reduced?: boolean;
  className?: string;
  children: React.ReactNode[];
}> = ({ p, arrivals, reduced, className = '', children }) => (
  <div className={className}>
    {React.Children.map(children, (child, i) => {
      const from = arrivals[i] ?? 0;
      if (p < from) return null;
      const e = ease(at(p, from, from + 0.05));
      return (
        <div style={{ opacity: e, transform: reduced ? undefined : `translate3d(${(1 - e) * -10}px, 0, 0)` }}>{child}</div>
      );
    })}
  </div>
);

/** Column header strip for the dense tables. */
export const HeadRow: React.FC<{ cols: string[]; grid: string; className?: string }> = ({ cols, grid, className = '' }) => (
  <div
    className={`grid gap-2 pb-1 border-b border-borderSubtle font-mono text-micro uppercase tracking-wider text-textMuted ${className}`}
    style={{ gridTemplateColumns: grid }}
  >
    {cols.map(c => (
      <span key={c} className="truncate">
        {c}
      </span>
    ))}
  </div>
);
