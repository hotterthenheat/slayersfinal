import { SHORTCUT_GROUPS } from '../../lib/shortcuts';
import { Callout, Kbd } from './parts';

const Shortcuts = () => (
  <div className="flex flex-col gap-6">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {SHORTCUT_GROUPS.map(group => (
        <div key={group.title} className="flex flex-col gap-2">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-textMuted">
            {group.title}
          </span>
          <div className="rounded-lg border border-borderSubtle bg-panel divide-y divide-borderSubtle overflow-hidden">
            {group.rows.map(row => (
              <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-[13px] text-textSecondary">{row.label}</span>
                <span className="flex items-center gap-1 shrink-0">
                  {row.keys.map((k, i) => (
                    <Kbd key={i}>{k}</Kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>

    <Callout>
      Press <Kbd>?</Kbd> from anywhere to pull this sheet up as an overlay without leaving your desk.
    </Callout>
  </div>
);

export default Shortcuts;
