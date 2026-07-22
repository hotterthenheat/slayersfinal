import { Component, type ErrorInfo, type ReactNode } from 'react';
import { TriangleAlert, RotateCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Changes to this value reset the boundary — pass the route path so a
      navigation away from the broken page recovers automatically. */
  resetKey?: string;
}
interface State {
  error: Error | null;
}

/**
 * Catches render/runtime errors from a route's tree so one broken desk never
 * blanks the whole terminal. Shows a recoverable fallback instead of a white
 * screen; navigating elsewhere (new resetKey) clears it.
 */
class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surfaced in the console for debugging; no telemetry backend yet.
    console.error('Route error boundary caught:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-lg border border-borderMuted bg-panel px-6 py-7 flex flex-col items-center text-center gap-4 shadow-2xl shadow-black/50">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-full border border-bear/30 bg-bear/10 text-bear">
            <TriangleAlert className="w-5 h-5" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h2 className="font-mono text-[13px] font-semibold uppercase tracking-widest text-textPrimary">
              This view hit an error
            </h2>
            <p className="text-[12px] leading-relaxed text-textSecondary">
              The rest of the terminal is fine. Reload this view, or head back to a working desk.
            </p>
            <p className="mt-1 font-mono text-[10px] text-textMuted break-words">{error.message || 'Unknown error'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-borderSubtle bg-white/[0.02] font-mono text-[11px] uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Retry
            </button>
            <a
              href="/pulse"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-select/30 bg-select/10 font-mono text-[11px] uppercase tracking-wider text-select hover:bg-select/15 transition-colors"
            >
              <Home className="w-3.5 h-3.5" /> Go to Pulse
            </a>
          </div>
        </div>
      </div>
    );
  }
}

export default RouteErrorBoundary;
