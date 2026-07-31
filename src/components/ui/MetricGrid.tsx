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
          <div className="min-w-0" style={{ flex: `1 1 ${min}` }}>
            {child}
          </div>
        )
      )}
    </div>
  );
};

export default MetricGrid;
