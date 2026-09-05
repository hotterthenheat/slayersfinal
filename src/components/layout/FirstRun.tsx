/*
==================================================
  SLAYER TERMINAL - FIRST RUN PANEL
  Part 15 · onboarding, in the flow rather than
  over it. The reasoning is in data/firstRun.ts.
==================================================
*/

import { ArrowRight, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  FIRST_MOVES,
  WORKFLOW_GROUPS,
  dismissFirstRun,
  useFirstRunSeen,
} from '../../data/firstRun';

const FirstRun = () => {
  const seen = useFirstRunSeen();
  if (seen) return null;

  return (
    <section
      /* `region` with a name rather than a bare div: a screen reader lands
         on a labelled landmark it can skip past in one keystroke, which is
         the auditory version of the one scroll this costs everybody else. */
      role="region"
      aria-label="Getting started"
      className="relative border border-borderSubtle bg-panel rounded-lg px-5 py-4"
    >
      <button
        onClick={dismissFirstRun}
        aria-label="Dismiss the getting started panel"
        className="absolute top-3 right-3 p-1 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.04] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-select"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-textMuted">
        First time here
      </span>
      <h2 className="mt-1.5 text-[15px] font-bold tracking-tight text-textPrimary">
        Three places worth starting
      </h2>
      <p className="mt-1 text-[12px] text-textSecondary leading-relaxed max-w-[74ch]">
        The tabs are ordered by the pipeline a trader runs, not by product name — so nothing here is hidden, it is
        just arranged. If you only do one of these, do the last one.
      </p>

      <div className="mt-3.5 grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {FIRST_MOVES.map(m => (
          <Link
            key={m.path}
            to={m.path}
            className="group border border-borderSubtle rounded-md px-3 py-2.5 hover:border-borderMuted hover:bg-white/[0.03] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-select"
          >
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-textPrimary">
              {m.label}
              <ArrowRight className="w-3 h-3 text-textMuted group-hover:text-textSecondary transition-colors" />
            </span>
            <span className="block mt-1 text-[11px] text-textMuted leading-snug">{m.why}</span>
          </Link>
        ))}
      </div>

      <div className="mt-3.5 border-t border-borderSubtle pt-3 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
        {WORKFLOW_GROUPS.map(g => (
          <div key={g.group}>
            <span className="font-mono text-[10px] uppercase tracking-widest text-textSecondary">{g.group}</span>
            <span className="block mt-0.5 text-[11px] text-textMuted leading-snug">{g.what}</span>
          </div>
        ))}
      </div>

      <p className="mt-3 font-mono text-[10px] text-textMuted">
        Press <kbd className="border border-borderSubtle rounded px-1 py-0.5 bg-inset">?</kbd> for shortcuts, or{' '}
        <kbd className="border border-borderSubtle rounded px-1 py-0.5 bg-inset">⌘K</kbd> to jump anywhere. This panel
        goes away for good once you close it — Settings brings it back.
      </p>
    </section>
  );
};

export default FirstRun;
