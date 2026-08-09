import { SHORTCUT_GROUPS } from '../../lib/shortcuts';
import { Callout, Kbd } from './parts';

/*
  Two fixed columns became five fluid ones.

  `lg:grid-cols-2` meant the columns grew with the viewport instead of the
  count growing: at 2560 each group was 1231px wide, and every row inside it is
  a label pushed left and its key caps pushed right. Measured: 1013px of nothing
  between "Previous ticker in the watchlist" and the "[" cap, on five rows. A
  reader scanning the list had to cross a thousand pixels of black to find which
  key belongs to which action.

  `auto-fill` inverts that — the column WIDTH is pinned and the column COUNT
  absorbs the width, so a row stays about 370px whatever the monitor is and the
  label sits next to its keys. `min(100%, …)` keeps the floor from overflowing
  a phone.

  The floor is 21rem rather than 26. At 26 a tablet has room for exactly one
  column (736px of content, 416 needed for two plus the gap), so 768 kept the
  full-width rows and the audit measured 568px between a label and its key on
  ten of them. 21rem pairs them at 768 and still yields seven columns at 2560.

  The panel frame went with it: a rounded, filled, bordered card is the shape
  being removed app-wide, and the rows already read as a list from their own
  dividers.
*/
const Shortcuts = () => (
  <div className="flex flex-col gap-6">
    <div
      className="grid gap-x-10 gap-y-6 items-start"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 21rem), 1fr))' }}
    >
      {SHORTCUT_GROUPS.map(group => (
        <div key={group.title} className="flex flex-col gap-2">
          <span className="font-mono text-label font-semibold uppercase tracking-widest text-select/80">
            {group.title}
          </span>
          <div className="border-t border-borderSubtle divide-y divide-borderSubtle">
            {group.rows.map(row => (
              <div key={row.label} className="flex items-center justify-between gap-3 py-2">
                <span className="text-data text-textSecondary">{row.label}</span>
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
