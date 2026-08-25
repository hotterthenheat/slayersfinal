import Panel from '../../components/ui/Panel';

/*
==================================================
  SLAYER TERMINAL - TRACE › TRACKER (scaffold)

  Three modules that are not built. This page is
  reachable from the Trace sub-nav, so it must not
  read as a broken desk — it states what is coming,
  what each module will put on screen, and which
  data product supplies it.

  WHY IT SAYS THE FEED. The entitlements are now
  known, and every one of these is backed: holding
  trades AND quotes on the same instrument is what
  makes an aggressor-classified print possible, and
  that is the whole premise of following size. So
  "needs a feed" became "needs THIS feed", which is
  the difference between a promise and a plan.

  WHY THE READOUTS ARE LISTED. A card that is one
  paragraph tall over a min-height leaves a hole in
  its own middle — the first pass filled the page
  by pushing text apart, which is the same defect
  one level down. Naming the actual readouts fills
  the card with the spec instead of with air, and
  it is the part a reader can hold us to.
==================================================
*/

interface PlannedModule {
  title: string;
  code: string;
  detail: string;
  /** The readouts the module lands with — the spec, not a teaser. */
  shows: string[];
  /** The data product that backs it, named. */
  needs: string;
}

const PLANNED: PlannedModule[] = [
  {
    title: 'Tracked Flow',
    code: 'TRK_01',
    detail:
      'Bookmark a print off the live tape and follow it past the moment it crossed.',
    shows: [
      'Where the fill sat against the quote standing at that instant',
      'The side it took, and whether it swept or sat as a block',
      'What open interest did on that strike the next morning',
      'The mark on the contract now, against the print',
    ],
    needs: 'Options Advanced — per-print trades with quotes',
  },
  {
    title: 'Tracked Contracts',
    code: 'TRK_02',
    detail:
      'Watch a whole contract rather than one print, for as long as it stays interesting.',
    shows: [
      'Daily volume against open interest, session by session',
      'Net premium through the day — bought minus sold',
      'Sweep share of the day’s volume',
      'Every print above your size floor, in order',
    ],
    needs: 'Options Advanced + API Advanced — open interest and Net Premium',
  },
  {
    title: 'Contract Drilldown',
    code: 'TRK_03',
    detail: 'One contract, one day, everything that happened to it.',
    shows: [
      'Intraday flow plotted against the underlying',
      'Cumulative net premium across the session',
      'The volume and open-interest ledger underneath',
      'Implied vol on the contract through the day',
    ],
    needs: 'Options Advanced — 5+ years of per-contract history',
  },
];

/** Scaffold — the follow-the-whale workflow lands with the real tape feed. */
const FlowTracker = () => (
  <div className="flex flex-col gap-4">
    <p className="max-w-[72ch] text-[13px] leading-relaxed text-textSecondary">
      Nothing on this desk is built yet. Each module below is waiting on a live feed rather than on a
      decision — the entitlements cover all three, and what each one needs is named against it.
    </p>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {PLANNED.map(mod => (
        <Panel key={mod.code} title={mod.title} subtitle={mod.code} className="w-full">
          <div className="flex h-full flex-col gap-4 rounded-md border border-dashed border-borderSubtle px-4 py-4">
            <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Not built</span>
            <p className="text-[12.5px] leading-relaxed text-textSecondary">{mod.detail}</p>

            <div className="flex flex-col gap-2">
              <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Will show</span>
              <ul className="flex flex-col gap-1.5">
                {mod.shows.map(line => (
                  <li key={line} className="flex gap-2 text-[12px] leading-snug text-textSecondary">
                    <span aria-hidden="true" className="mt-[6px] h-[3px] w-[3px] shrink-0 rounded-full bg-textMuted" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-auto flex flex-col gap-1 border-t border-borderSubtle pt-3">
              <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Backed by</span>
              <span className="font-mono text-[11px] leading-snug text-textPrimary">{mod.needs}</span>
            </div>
          </div>
        </Panel>
      ))}
    </div>
  </div>
);

export default FlowTracker;
