import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  /** When this value changes, a prior error is cleared and the child retried. */
  resetKey?: string;
  /** Panel title, for the console trace only. */
  label?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Isolates a single Pulse panel's render. If one widget throws, this catches it
 * and shows a compact fallback so the surrounding grid — every other panel, the
 * drag state, the saved layout — keeps running instead of unmounting the page.
 */
class PanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    // A new symbol / panel identity should get a clean attempt.
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the failure visible for debugging; the grid itself stays up.
    console.error('[Pulse panel error]', this.props.label ?? '', error, info);
  }

  private retry = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-2 p-4 text-center">
          <span className="inline-flex w-8 h-8 rounded-md border border-warn/30 bg-warn/[0.06] items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-warn" />
          </span>
          <span className="font-mono text-label font-semibold uppercase tracking-widest text-warn">
            Panel error
          </span>
          <span className="text-label text-textMuted leading-relaxed max-w-[240px]">
            This panel hit a runtime error and was isolated so the rest of your desk keeps running.
          </span>
          <button
            onClick={this.retry}
            className="mt-1 inline-flex items-center px-2.5 py-1 rounded border border-borderSubtle font-mono text-label uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:bg-white/[0.04] transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default PanelErrorBoundary;
