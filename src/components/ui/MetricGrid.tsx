import React from 'react';

interface MetricGridProps {
  /** Each card's flex-basis before wrapping */
  min?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Responsive metric row. Uses flex-wrap rather than an auto-fit grid so that a
 * lone card on the last row grows to fill the width instead of orphaning at
 * half-width on a phone (the 2-column case). Even counts render identically to
 * the old grid — every card shares the row equally. `min` is the flex-basis.
 *
 * That growth is deliberate and is KEPT: an audit flagged the trailing card
 * rendering 2-4x the width of the row above as a rhythm break, but it is the
 * same behaviour as the orphan fix — a lone card either fills or sits stranded
 * at a fraction of the row, and filling was chosen on purpose. Changing it would
 * re-open the bug it was written for.
 *
 * The basis is capped at 45% so two cards ALWAYS pair on a phone, whatever a
 * page passes. Without the cap a caller's `min` decides the phone layout by
 * accident, and it decided it by four pixels: at 390px the row is 348px wide,
 * and `min="170px"` needs 170 + 12 + 170 = 352. Four over, so the cards went
 * one per row and a 94px strip became 568px — six screens-worth of headline
 * before the first row of data on the Dark Pool tape. 45% of 348 is 157, which
 * pairs with room to spare, and on any desk `min` is far below 45% so the cap
 * never binds.
 */
const MetricGrid = ({ min = '150px', className = '', children }: MetricGridProps) => {
  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      {React.Children.map(children, child =>
        child == null || child === false ? child : (
          // No h-full here. `align-items: stretch` (the flex default) already
          // sizes every track in a line to the tallest, and an explicit
          // height:100% resolves against the container's AUTO height instead —
          // which cancels the stretch rather than helping it. The card carries
          // h-full so it fills the track it is given.
          <div className="min-w-0" style={{ flex: `1 1 min(${min}, 45%)` }}>
            {child}
          </div>
        )
      )}
    </div>
  );
};

export default MetricGrid;
