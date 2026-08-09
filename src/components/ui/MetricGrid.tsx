import React from 'react';

interface MetricGridProps {
  /** Each cell's flex-basis before wrapping */
  min?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * The desk header strip: one ruled row of metrics, no boxes.
 *
 * This used to lay its children out as free-standing rounded tiles, and that
 * row of tiles is the single most recognisable shape in machine-generated UI.
 * It is now a strip — hairline rules top and bottom, hairline dividers between
 * cells, and nothing else. The cells themselves carry no surface (see
 * StatCard), so the only ink on screen is the type.
 *
 * `flex-wrap` rather than an auto-fit grid so a lone cell on the last row grows
 * to fill the width instead of orphaning at half-width on a phone. That growth
 * is deliberate and is KEPT: an audit flagged the trailing cell rendering wider
 * than the row above as a rhythm break, but it is the same behaviour as the
 * orphan fix, and changing it would re-open the bug it was written for.
 *
 * The basis is capped at 45% so two cells ALWAYS pair on a phone, whatever a
 * page passes. Without the cap a caller's `min` decides the phone layout by
 * accident, and it decided it by four pixels: at 390px the row is 348px wide
 * and `min="170px"` needs 170 + 12 + 170 = 352. Four over, so the cells went
 * one per row and a 94px strip became 568px — six screens-worth of headline
 * before the first row of data on the Dark Pool tape.
 *
 * The gap is gone with the tiles: cells are separated by a rule and their own
 * padding now, which is what keeps the row reading as one instrument rather
 * than as a set of floating parts.
 */
const MetricGrid = ({ min = '150px', className = '', children }: MetricGridProps) => {
  return (
    <div className={`flex flex-wrap border-y border-borderSubtle divide-x divide-borderSubtle ${className}`}>
      {React.Children.map(children, child =>
        child == null || child === false ? child : (
          // No h-full here. `align-items: stretch` (the flex default) already
          // sizes every track in a line to the tallest, and an explicit
          // height:100% resolves against the container's AUTO height instead —
          // which cancels the stretch rather than helping it.
          <div className="min-w-0" style={{ flex: `1 1 min(${min}, 45%)` }}>
            {child}
          </div>
        )
      )}
    </div>
  );
};

export default MetricGrid;
