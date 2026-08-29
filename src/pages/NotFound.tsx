import { Link, useLocation } from 'react-router-dom';
import { Compass, LayoutGrid, LineChart, Radio, Search } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';

/*
==================================================
  SLAYER TERMINAL - NO SUCH SCREEN (pages/NotFound.tsx)

  The route that catches everything else.
==================================================

  WHAT THIS REPLACES. There was no catch-all. React Router matched nothing,
  rendered nothing, and the reader got a completely blank page inside the
  app chrome — no message, no error in the console, no way back except the
  browser's back button. A typo in the address bar and a dead bookmark both
  looked exactly like the desk having crashed.

  It is the same failure class as the dead colour classes this build kept
  shipping: the page is technically fine and says nothing, so the reader
  cannot tell a mistake from a breakage.

  WHY IT NAMES THE PATH. A 404 that only says "not found" leaves the reader
  guessing whether they mistyped or the link is stale. Printing the path
  they actually asked for answers that in one glance — and when a link
  inside the terminal is the culprit, it is the one detail worth reporting.

  WHY THESE FIVE DOORS and not a nav dump: they are the desks a lost reader
  is most likely to have been aiming at, and a short list gets read where a
  full sitemap gets skipped. The list is static on purpose — a 404 that
  tries to guess the intended route from a typo is a search feature wearing
  an error page's clothes, and it guesses wrong on exactly the paths that
  matter.

  This route lives INSIDE AppShell, so the top bar and the command palette
  are still there. Being lost should not also mean losing the navigation.
*/

const DOORS = [
  { to: '/pulse', label: 'Pulse', note: 'the market right now', Icon: Radio },
  { to: '/compass', label: 'Compass', note: 'find the setup', Icon: Compass },
  { to: '/terrain', label: 'Terrain', note: 'the chart desk', Icon: LineChart },
  { to: '/chain', label: 'Option chain', note: 'strikes and greeks', Icon: LayoutGrid },
  { to: '/stocks', label: 'Stocks', note: 'the board', Icon: Search },
];

const NotFound = () => {
  const { pathname } = useLocation();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={['Terminal', 'Not found']}
        title="No such screen"
        subtitle="The address is not a route on this terminal."
      />

      <div className="border border-borderSubtle bg-panel rounded-lg p-5 flex flex-col gap-5">
        {/* The path they actually asked for — the one fact that separates a
            typo from a stale link. `break-all` because a long pasted URL
            must wrap rather than push the panel sideways. */}
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-textMuted">
            You asked for
          </span>
          <code className="font-mono text-[13px] text-warn bg-inset border border-borderSubtle rounded px-2.5 py-1.5 break-all">
            {pathname}
          </code>
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-textMuted">
            Try one of these
          </span>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {DOORS.map(({ to, label, note, Icon }) => (
              <Link
                key={to}
                to={to}
                className="group flex items-center gap-2.5 border border-borderSubtle bg-inset hover:bg-panelHover hover:border-borderMuted rounded-md px-3 py-2.5 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-select"
              >
                <Icon size={14} className="text-textMuted group-hover:text-select shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[12px] text-textPrimary leading-tight">{label}</span>
                  <span className="block text-[10px] text-textMuted leading-tight">{note}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-textSecondary leading-snug border-t border-borderSubtle pt-4">
          If a link inside the terminal brought you here, that is a bug worth
          reporting — press <span className="font-mono text-textPrimary">⌘K</span> to search
          for the screen you wanted.
        </p>
      </div>
    </div>
  );
};

export default NotFound;
