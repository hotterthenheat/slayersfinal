import { X } from 'lucide-react';

/*
==================================================
  SLAYER TERMINAL - DATA WINDOW (gex/DataWindow.tsx)

  Every number the pane is drawing, at the bar
  under the pointer.
==================================================

  WHY THIS EXISTS WHEN THERE IS ALREADY A READOUT.

  The T-8 crosshair readout lives in the pane's identity row and is bounded by
  it: one line, a measured width budget, and — by `READOUT_INDICATOR_KEYS` —
  only the single-line overlays. That is the right call for a header. It also
  means a reader running a MACD, a Bollinger band and three Pine scripts can
  see none of their values anywhere, because the only surface that reports
  values cannot afford the rows.

  So this is the surface that can. It is the one panel on the desk whose job
  is completeness rather than restraint: every indicator part, every plot a
  script draws under its own title, every compared symbol.

  AND THE BOOK AT THAT BAR, which is the half no other charting package can
  print. Hovering a candle from Tuesday and reading the dealer's net gamma,
  the walls and the flip AS THEY STOOD THEN is the whole argument for reading
  a chart here instead of somewhere else. It is a per-bar record, not today's
  chain projected backwards — `slayer.*` scripts read the same lane.

  NULL IS A VALUE AND IT PRINTS AS ONE. A wall that does not qualify reads
  "none", never a blank and never a fallback to spot: this desk's rule is
  that an absent structural price is an answer, and a panel that hid it would
  be inventing agreement between the chart and the book.
*/

export interface DataWindowRow {
  label: string;
  value: string;
  /** The series' own colour, so a row is findable from the line it names. */
  ink?: string;
  /** Renders in the bull/bear inks — for changes, which have a sign. */
  tone?: 'up' | 'down' | null;
}

export interface DataWindowGroup {
  name: string;
  rows: DataWindowRow[];
}

interface Props {
  /** The bar's own stamp, already in the exchange's zone. */
  when: string;
  groups: DataWindowGroup[];
  /** True while the pointer is off the plot — the panel then reads the last
      bar, and says so rather than implying a hover that is not happening. */
  live: boolean;
  onClose: () => void;
}

const DataWindow = ({ when, groups, live, onClose }: Props) => (
  <div
    data-data-window
    /*
      IT OPENS WHERE ITS DOOR WAS — bottom-right, growing upward.

      The first version opened top-right while the button that opens it sat
      bottom-right, so a reader pressed one corner and a panel appeared in
      another. (The comment beside that button claimed the two were in one
      place, which is how a wrong arrangement survives: the note said what was
      intended rather than what was there.) Anchored to the same corner, the
      button is replaced by the thing it summons.

      Narrow on purpose. The price axis is the one column of the chart nobody
      reads for shape, so a panel tucked against it costs the least tape.
      `pointer-events-auto` because the wrapper below the crosshair layer
      would otherwise swallow the close button.
    */
    className="absolute right-1 bottom-1 z-30 w-[200px] max-h-[calc(100%-1rem)] overflow-y-auto rounded-md border border-borderMuted bg-panel/95 backdrop-blur-[2px] shadow-xl shadow-black/50 pointer-events-auto select-none"
  >
    {/*
      TWO LINES, NOT ONE. The state and the stamp shared a row and the row
      lost: at 186px "Sep 9, 19:45" came out as "ep 9, 19:45", which is a
      date a reader has to decode rather than read. They are two different
      facts — WHICH bar, and WHEN it was — and the second is the longer one.

    */}
    <div className="sticky top-0 z-10 border-b border-borderSubtle bg-panel/95 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-textMuted">
          {live ? 'Last bar' : 'At cursor'}
        </span>
        <button
          onClick={onClose}
          title="Close the data window"
          aria-label="Close the data window"
          className="-mr-0.5 ml-auto inline-flex h-4 w-4 items-center justify-center rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.06] transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="font-mono text-[10px] leading-[13px] text-textSecondary tabular-nums">{when}</div>
    </div>

    {groups.map(g => (
      <div key={g.name} className="border-b border-borderSubtle/60 last:border-b-0">
        <div className="px-2 pt-1.5 pb-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-textMuted">
          {g.name}
        </div>
        <div className="pb-1">
          {g.rows.map(r => (
            <div key={`${g.name}:${r.label}`} className="flex items-baseline gap-1.5 px-2 py-[1px]">
              {r.ink && (
                <span
                  aria-hidden
                  className="h-[6px] w-[6px] shrink-0 rounded-full"
                  style={{ background: r.ink }}
                />
              )}
              <span className="truncate font-mono text-[10px] text-textSecondary">{r.label}</span>
              <span
                className={`ml-auto shrink-0 font-mono text-[10px] tabular-nums ${
                  r.tone === 'up' ? 'text-bull' : r.tone === 'down' ? 'text-bear' : 'text-textPrimary'
                }`}
              >
                {r.value}
              </span>
            </div>
          ))}
          {g.rows.length === 0 && (
            <div className="px-2 py-[1px] font-mono text-[10px] text-textMuted">nothing drawn</div>
          )}
        </div>
      </div>
    ))}
  </div>
);

export default DataWindow;
