import { Component, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';

/*
==================================================
  SLAYER TERMINAL - PAGE FAULT (ui/PageFault.tsx)

  The page-level net. ErrorBoundary next door is the
  small one, for a panel that must fail without
  taking its page down; this is the one that catches
  a whole page and still leaves something readable.
==================================================

  IT LIVES HERE BECAUSE IT HAS TWO CALLERS, AND THE SECOND ONE MATTERS.

  It was defined inside AppShell and wrapped the <Outlet />, which covers every
  desk. Two things sat outside it and were caught by nothing:

      the landing page      it is routed OUTSIDE AppShell entirely
      the shell's own chrome  TopBar and the command palette render
                              ABOVE the Outlet, not inside it

  Both were verified rather than reasoned about — a throw wired to a query
  parameter, built, and loaded. A desk page throwing rendered this panel with
  the header intact. The landing page throwing and TopBar throwing each gave a
  white screen: 0 characters, 15 elements, nothing to read and nothing to
  click. So App wraps the whole route tree in it as well.
*/
class PageFault extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prevProps: { resetKey: string }) {
    // Navigating anywhere clears a shown fault so the next page gets a clean try
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="border border-bear/30 bg-bear/[0.04] rounded-lg p-8 flex flex-col items-start gap-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-bear">Page fault</span>
        <p className="text-[13px] text-textSecondary leading-relaxed max-w-lg">
          This page hit an error and stopped rendering. The rest of the terminal is fine — reload the
          page, or head back to Pulse. If it keeps happening, tell us in Community → Feedback.
        </p>
        <code className="font-mono text-[11px] text-textMuted break-all">{this.state.error.message}</code>
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-borderMuted font-mono text-[11px] uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:bg-white/[0.03] transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Reload
          </button>
          <Link
            to="/pulse"
            onClick={() => this.setState({ error: null })}
            className="inline-flex items-center px-3 py-1.5 rounded-md font-mono text-[11px] font-semibold uppercase tracking-wider text-[#0a0a0a] bg-[#D2FF00]"
          >
            Back to Pulse
          </Link>
        </div>
      </div>
    );
  }
}

export default PageFault;
