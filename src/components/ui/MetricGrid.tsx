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
 */
const MetricGrid = ({ min = '150px', className = '', children }: MetricGridProps) => {
  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      {React.Children.map(children, child =>
        child == null || child === false ? child : (
          <div className="min-w-0" style={{ flex: `1 1 ${min}` }}>
            {child}
          </div>
        )
      )}
    </div>
  );
};

export default MetricGrid;
