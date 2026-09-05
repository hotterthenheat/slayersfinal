import type { ReactNode } from 'react';
import { WifiOff, RefreshCw, AlertTriangle, Moon } from 'lucide-react';
import {
  STREAM_WORDS, MARKET_PHASE_WORDS, marketPhase, streamStateAt,
  isStreamFault, describeGap, resumePoint, pauseNotice, loadProgress,
  type StreamState as StreamStateKind, type MarketPhase,
} from '../../core/stream';

/*
==================================================
  SLAYER TERMINAL - SAYING WHAT THE STREAM IS DOING
  (components/ui/StreamState.tsx)
==================================================

  The rendering half of core/stream.ts. Every piece here takes its state as
  a PROP and none of them invents one — `StreamChip` is the only component
  that reaches for the clock, and only because the TopBar's answer really is
  "what time is it".

  WHY NOTHING HERE ANIMATES EXCEPT `reconnecting`. A spinner means "wait,
  this is about to change". Closed is not about to change; degraded is not
  about to change on its own either. Reconnecting is the one state where
  waiting is the correct behaviour, so it is the one that spins.
*/

const STREAM_ICON: Partial<Record<StreamStateKind, typeof WifiOff>> = {
  reconnecting: RefreshCw,
  degraded: AlertTriangle,
  disconnected: WifiOff,
  closed: Moon,
};

/* Full class strings, never interpolated — Tailwind's JIT reads this file as
   text and a class assembled at runtime never reaches the stylesheet. */
const STREAM_TONE: Record<StreamStateKind, string> = {
  live: 'text-bull',
  reconnecting: 'text-warn',
  degraded: 'text-warn',
  disconnected: 'text-bear',
  closed: 'text-textMuted',
};

const STREAM_DOT: Record<StreamStateKind, string> = {
  live: 'bg-bull',
  reconnecting: 'bg-warn',
  degraded: 'bg-warn',
  disconnected: 'bg-bear',
  closed: 'bg-textMuted',
};

/**
 * The TopBar indicator. Live / reconnecting / degraded / offline / closed.
 *
 * `feed` is whatever the transport reports about itself; leaving it out —
 * which is every caller today — gives the calendar's answer, which is the
 * honest one while nothing can disconnect.
 */
export const StreamChip = ({
  at = new Date(),
  feed,
  className = '',
}: { at?: Date; feed?: StreamStateKind; className?: string }) => {
  const state = streamStateAt(at, feed);
  const w = STREAM_WORDS[state];
  const Icon = STREAM_ICON[state];
  /* Closed says WHICH kind of closed. "CLOSED" alone on a Tuesday evening
     and on Thanksgiving are different facts, and the reader who is
     wondering whether something is broken deserves the difference. */
  const phase = marketPhase(at);
  const detail = state === 'closed' ? MARKET_PHASE_WORDS[phase].blurb : w.blurb;
  return (
    <span
      title={detail}
      role="status"
      aria-label={`Data stream: ${w.label}. ${detail}`}
      className={`inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider whitespace-nowrap ${STREAM_TONE[state]} ${className}`}
    >
      {Icon
        ? <Icon size={9} className={state === 'reconnecting' ? 'animate-spin' : ''} aria-hidden />
        : <span className={`h-1.5 w-1.5 rounded-full ${STREAM_DOT[state]}`} aria-hidden />}
      {state === 'closed' ? MARKET_PHASE_WORDS[phase].label : w.label}
    </span>
  );
};

/**
 * A hole in the tape, said out loud.
 *
 * Renders nothing below `GAP_FLOOR_SECONDS`, so a caller can hand it every
 * measured gap without deciding which ones are worth a banner.
 */
export const GapBanner = ({
  seconds,
  resumedAt,
  onDismiss,
}: { seconds: number; resumedAt?: Date; onDismiss?: () => void }) => {
  const text = describeGap(seconds);
  if (!text) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-warn/20 bg-warn/5 px-3 py-1.5 font-mono text-[10px] text-warn"
    >
      <AlertTriangle size={11} aria-hidden />
      <span className="uppercase tracking-wider">{text}</span>
      {resumedAt && (
        <span className="text-textMuted normal-case tracking-normal">
          resuming from {resumePoint(resumedAt)} ET
        </span>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="ml-auto text-textMuted transition-colors hover:text-textPrimary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select"
        >
          dismiss
        </button>
      )}
    </div>
  );
};

/**
 * Per-panel degraded mode: the LAST GOOD FRAME, dimmed, with a word for why.
 *
 * The checklist is specific that a degraded chart must keep its frame rather
 * than blank — and it is right for a reason worth writing down. A chart that
 * blanks destroys the only thing the reader still had (where price was when
 * the feed went), and it destroys it at the exact moment they most want to
 * look at it. Dimming says "this is old" without taking it away.
 *
 * The overlay does NOT sit on a transformed ancestor: a CSS transform makes
 * a containing block for fixed descendants, and this file's whole job is to
 * be a layer over somebody else's content.
 */
export const StaleFrame = ({
  state,
  since,
  children,
}: { state: StreamStateKind; since?: Date; children: ReactNode }) => {
  const stale = isStreamFault(state);
  return (
    <div className="relative">
      <div className={stale ? 'pointer-events-none opacity-40 saturate-50 transition-opacity' : ''}>
        {children}
      </div>
      {stale && (
        <div className="absolute inset-0 flex items-center justify-center" role="status">
          <span className="rounded border border-warn/25 bg-canvas/85 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-warn">
            {STREAM_WORDS[state].label}
            {since && <span className="ml-1.5 normal-case tracking-normal text-textMuted">last frame {resumePoint(since)} ET</span>}
          </span>
        </div>
      )}
    </div>
  );
};

/**
 * "Refresh paused — resumes in 14s" for a panel that hit its cap.
 * Null when nothing is capped, so it can sit unconditionally in a header.
 */
export const RefreshPaused = ({ secondsUntilReset }: { secondsUntilReset: number }) => {
  const text = pauseNotice(secondsUntilReset);
  if (!text) return null;
  return (
    <span role="status" className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-warn">
      <RefreshCw size={9} aria-hidden />
      {text}
    </span>
  );
};

/**
 * Backfill / bulk-load progress with a cancel.
 *
 * The bar reports a determinate fraction because a backfill KNOWS its total
 * — it is a date range. An indeterminate bar here would be a choice to
 * withhold information the caller already has.
 */
export const LoadProgress = ({
  label,
  done,
  total,
  onCancel,
}: { label: string; done: number; total: number; onCancel?: () => void }) => {
  const p = loadProgress(done, total);
  const pct = Math.round(p * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[9px] uppercase tracking-wider text-textMuted whitespace-nowrap">{label}</span>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${label}: ${pct}% complete`}
        className="h-1 flex-1 min-w-[80px] overflow-hidden rounded-full bg-borderSubtle"
      >
        <div className="h-full bg-select transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[9px] tabular-nums text-textMuted">{pct}%</span>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="font-mono text-[9px] uppercase tracking-wider text-textMuted transition-colors hover:text-bear focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select"
        >
          cancel
        </button>
      )}
    </div>
  );
};

/**
 * The Sunday rule, as a component.
 *
 * A panel with nothing in it calls this FIRST. If the market is shut, the
 * answer is "the market is shut" and not DataState's `empty` — `empty`
 * invites the reader to widen a filter that was never the problem.
 * Returns null when the market is open, so the caller falls through to
 * whatever its real empty state is.
 */
export const ClosedNotice = ({
  at = new Date(),
  what = 'prints',
  className = '',
}: { at?: Date; what?: string; className?: string }) => {
  const phase: MarketPhase = marketPhase(at);
  if (phase === 'rth') return null;
  const w = MARKET_PHASE_WORDS[phase];
  return (
    <div className={`flex flex-col items-center gap-1 py-6 text-center ${className}`} role="status">
      <Moon size={14} className="text-textMuted" aria-hidden />
      <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">{w.label}</span>
      <span className="max-w-[38ch] text-[11px] leading-snug text-textMuted">
        No {what} because the market is closed — {w.blurb.toLowerCase()}
      </span>
    </div>
  );
};
