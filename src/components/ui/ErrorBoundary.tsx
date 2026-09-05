/*
==================================================
  SLAYER TERMINAL - ERROR BOUNDARY
  A local catch so one bad panel degrades to a line
  of text instead of taking the page down with it.
  AppShell's RouteBoundary is the page-level net;
  this is for surfaces that read live feed data and
  must fail small — a drilldown, a widget, a chart.
==================================================
*/

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw, X } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Shown in place of the children when they throw. */
  label?: string;
  /** Changing this clears a shown fault (e.g. the row the panel is showing). */
  resetKey?: string | number | null;
  /**
   * FILL THE CELL rather than sit in it. A widget on the Pulse grid owns a box
   * whose height the desk has already decided; a fault card that shrink-wraps
   * its text leaves the rest of that box empty and the grid looks broken in a
   * second, unrelated way. With this the card takes the whole cell, the way
   * the panel it replaced did.
   */
  fill?: boolean;
  /**
   * Offer to try again. A render fault is often transient — a tick arrived
   * half-built, a ticker has no chain this second — and the panel is a pure
   * function of props, so re-rendering genuinely can succeed. Without this the
   * only way back is a page reload, which costs the reader every other panel
   * on the desk.
   */
  onRetry?: () => void;
  /** Offer to take the panel off the desk instead. */
  onRemove?: () => void;
}

interface State {
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the detail in the console — the UI stays calm, the cause stays findable
    console.error('[boundary]', this.props.label ?? 'panel', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  private retry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const { label, fill, onRetry, onRemove } = this.props;
    return (
      <div
        role="alert"
        className={`border border-bear/25 bg-bear/[0.04] rounded-md px-3 py-2.5 flex flex-col gap-1.5 ${
          fill ? 'h-full w-full justify-center items-center text-center' : ''
        }`}
      >
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-bear">
          {label ?? 'This panel'} hit an error
        </span>
        {/* The message stays, quietly. A reader cannot act on it, but the
            person they report it to can, and asking them to open a console is
            asking for the report never to arrive. */}
        <span className="font-mono text-[10px] text-textMuted break-all line-clamp-3">
          {this.state.error.message}
        </span>
        {(onRetry || onRemove) && (
          <span className="flex items-center gap-1.5 mt-0.5">
            {onRetry && (
              <button
                onClick={this.retry}
                className="inline-flex items-center gap-1 rounded border border-borderSubtle px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:bg-white/[0.05] transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Retry
              </button>
            )}
            {onRemove && (
              <button
                onClick={onRemove}
                className="inline-flex items-center gap-1 rounded border border-borderSubtle px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-bear hover:bg-white/[0.05] transition-colors"
              >
                <X className="w-3 h-3" /> Remove
              </button>
            )}
          </span>
        )}
      </div>
    );
  }
}

export default ErrorBoundary;
