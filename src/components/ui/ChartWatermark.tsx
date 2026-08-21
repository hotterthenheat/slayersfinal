import { SUITE } from '../layout/documentTitle';

/*
==================================================
  SLAYER TERMINAL - CHART WATERMARK (ui/ChartWatermark.tsx)
  The desk's name, behind the chart, for the screenshot.

  These charts open in a modal over the desk, and a modal is what people
  screenshot — the shot arrives somewhere else with no address bar, no top bar
  and nothing saying where it came from. The mark is for that second life.

  Three constraints it has to satisfy at once, which is why it is a primitive
  rather than a line of JSX at each site:

  - It must not compete with the data. `text-textMuted` at 30% is legible in a
    screenshot and disappears while you are reading the chart. Anything stronger
    reads as a label on the plot.
  - It must be BEHIND the marks, not over them. A watermark that crosses a line
    at full opacity has become chart junk.
  - It must survive a capture, so it is real DOM. A `::before` on a canvas parent
    would not composite into a canvas-based capture; every renderer here paints
    DOM or SVG above this layer.

  Two charts already use two different technologies — Contract Flow is recharts,
  Print Session is hand-rolled SVG — so the mark cannot live inside either one's
  drawing surface. It sits in a positioned layer underneath both, which works the
  same for any third.
==================================================
*/

export interface ChartWatermarkProps {
  /** The desk the chart belongs to — "Trace", "Pinpoint", "Compass". */
  desk: string;
  /**
   * Where in the plot the mark sits. Default is bottom-left: chart series run
   * left-to-right and finish at the right edge, so the newest and most-read part
   * of a plot is the last place to put anything.
   */
  corner?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
}

const CORNER: Record<NonNullable<ChartWatermarkProps['corner']>, string> = {
  'bottom-left': 'bottom-2 left-3',
  'bottom-right': 'bottom-2 right-3',
  'top-left': 'top-2 left-3',
  'top-right': 'top-2 right-3',
};

const ChartWatermark = ({ desk, corner = 'bottom-left' }: ChartWatermarkProps) => (
  <span
    // aria-hidden: a screen reader announcing the product name inside every
    // chart is noise. The heading above the chart already says which desk.
    aria-hidden="true"
    className={`pointer-events-none select-none absolute ${CORNER[corner]} z-0 font-mono text-micro uppercase tracking-widest text-textMuted/30 whitespace-nowrap`}
  >
    {desk} by {SUITE}
  </span>
);

export default ChartWatermark;
