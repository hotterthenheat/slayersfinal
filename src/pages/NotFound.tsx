import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Command, Compass as CompassIcon } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { NAV_ITEMS } from '../components/layout/nav';
import { SUITE } from '../components/layout/documentTitle';

/*
==================================================
  SLAYER TERMINAL - NOT FOUND (pages/NotFound.tsx)
  A typo'd URL used to redirect straight to the terminal index. That is a
  silent lie: the address bar changes under the visitor, and nothing ever says
  the page they asked for does not exist — a mistyped desk name and a working
  link become indistinguishable.

  This says what happened, keeps the bad URL visible so it can be corrected,
  and offers the desks as the way out.
==================================================
*/

const NotFound = () => {
  const { pathname } = useLocation();

  // Titled here rather than in the shared route→title table, because that table
  // cannot tell an unroutable path from one of the app's many redirect stubs
  // (/help, /workspace, /fracture …). Those render a <Navigate> for one commit
  // and would flash "Not found" in the tab on the way to a page that exists.
  // Only the page that actually renders knows it is the 404. Effects flush in
  // tree order, and this component is below the shell's title writer, so it
  // lands last on the commit that mounts it.
  useEffect(() => {
    document.title = `Not found — ${SUITE}`;
  }, [pathname]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader breadcrumb={['Terminal', 'Not found']} title="No desk at that address" />

      <div className="inst-surface rounded-lg px-5 py-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-label uppercase tracking-widest text-textMuted">Requested</span>
          {/* Wrapped, not truncated: a long path is exactly the case where the
              visitor needs to read it back to spot the typo. */}
          <code className="font-mono text-data text-warn break-all">{pathname}</code>
        </div>
        <p className="text-body leading-relaxed text-textSecondary max-w-[60ch]">
          Nothing is routed here. The link may be from an older build, or the address may have a typo in it. Every desk
          in the terminal is listed below, and{' '}
          <span className="font-mono text-label text-textPrimary">⌘K</span> opens the command palette from anywhere.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/terminal"
            className="inline-flex items-center gap-1.5 rounded-md border border-select/40 bg-select/10 px-3 py-1.5 font-mono text-label uppercase tracking-wider text-textPrimary transition-colors hover:bg-select/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select/60"
          >
            <CompassIcon className="h-3.5 w-3.5" /> Terminal index
          </Link>
          <span className="inline-flex items-center gap-1.5 font-mono text-label uppercase tracking-wider text-textMuted">
            <Command className="h-3.5 w-3.5" /> ⌘K to search
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-mono text-label uppercase tracking-widest text-textSecondary">Every desk</span>
        <div className="grid gap-px bg-borderSubtle rounded-md overflow-hidden sm:grid-cols-2 lg:grid-cols-3">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className="group bg-inset px-4 py-3 flex flex-col gap-1 transition-colors hover:bg-panelRaised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"
            >
              <span className="flex items-center gap-2">
                <item.icon className="h-3.5 w-3.5 text-textMuted group-hover:text-select" />
                <span className="font-mono text-data font-semibold text-textPrimary">{item.label}</span>
                <ArrowRight className="ml-auto h-3.5 w-3.5 text-textMuted opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="text-caption leading-snug text-textSecondary">{item.description}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NotFound;
