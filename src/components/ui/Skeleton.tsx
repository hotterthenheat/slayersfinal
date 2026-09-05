import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

/*
==================================================
  SLAYER TERMINAL - THE PLACEHOLDER
  (components/ui/Skeleton.tsx)
==================================================

  DataState answers "there is no number." This answers "the number is on its
  way, and here is the shape it will arrive in."

  THE TWO ARE NOT INTERCHANGEABLE, and the rule between them is worth stating
  once because every panel will have to pick:

    FIRST PAINT      → Skeleton. Nothing has ever been on screen, so the job
                       is to hold the layout that is about to exist.
    REFETCH          → DataState kind="loading". Something IS on screen and
                       the reader is looking at it; replacing it with grey
                       bars would be a regression in information.

  Never both at once, and never a skeleton over content a reader can already
  read.

  WHY THE GEOMETRY MATTERS MORE THAN THE SHIMMER. A skeleton that is the wrong
  size is worse than no skeleton, because the content lands and everything
  jumps — the reader's eye is already travelling to where a row was and the
  row is now 40px lower. So these variants take the same measurements the real
  components use (the 40px panel header, the 28px tape row) rather than
  approximating, and a caller that needs a bespoke shape composes `Skeleton`
  directly instead of reaching for the nearest variant.

  THE SHIMMER IS ONE CLASS, defined in index.css, and it stops entirely under
  `prefers-reduced-motion` while the block itself stays — the layout still
  needs holding when the animation does not run.

  NOT ANNOUNCED TO SCREEN READERS. A placeholder has no content, and a reader
  on a screen reader is served by the live region that announces the real
  result. `aria-hidden` keeps forty grey rectangles out of the buffer; the
  container that owns the skeleton carries `aria-busy` instead.
*/

export interface SkeletonProps {
  /** Tailwind width class or any CSS width. Defaults to full. */
  w?: string;
  /** Height in px, or a Tailwind class via `className`. */
  h?: number;
  /** Corner treatment — `full` for pills and dots. */
  round?: 'sm' | 'md' | 'full';
  className?: string;
  style?: CSSProperties;
}

const ROUND = { sm: 'rounded-[3px]', md: 'rounded-md', full: 'rounded-full' } as const;

/** One placeholder block. Everything below is composed from this. */
export const Skeleton = ({ w, h = 10, round = 'sm', className = '', style }: SkeletonProps) => (
  <span
    aria-hidden
    className={`block bg-white/[0.04] animate-skeleton ${ROUND[round]} ${w ?? 'w-full'} ${className}`}
    style={{ height: h, ...style }}
  />
);

/* ---- variants ---------------------------------------------------------- */

/** One table row. `cols` takes the same relative widths the real table uses,
    so the columns line up under the header while the body is still empty. */
export const SkeletonRow = ({
  cols = [3, 2, 2, 1, 1],
  h = 28,
}: {
  cols?: number[];
  h?: number;
}) => (
  <span className="flex items-center gap-3 px-1.5" style={{ height: h }}>
    {cols.map((flex, i) => (
      <span key={i} style={{ flex }} className="min-w-0">
        <Skeleton h={9} w={i === 0 ? 'w-3/4' : 'w-1/2'} />
      </span>
    ))}
  </span>
);

/** A body of rows. The count should be what the panel usually shows, not what
    it can hold — a skeleton promising forty rows that fills with three is a
    small lie about the shape of the answer.

    NO CALLER YET, and that is deliberate rather than an oversight: the desk
    derives its tables synchronously, so none of them has a first-paint gap
    today. It stays because a table is the shape most of the remaining data
    surfaces take. A ladder and a heat-grid variant were written alongside it
    and deleted instead — those are two specific widgets, not a shape, and a
    primitive nobody calls for a widget nobody is changing is just code to
    maintain. Delete this one too if the surfaces land some other way. */
export const SkeletonTable = ({
  rows = 8,
  cols,
  rowH = 28,
}: {
  rows?: number;
  cols?: number[];
  rowH?: number;
}) => (
  <span className="block" aria-busy="true">
    {Array.from({ length: rows }, (_, i) => (
      <SkeletonRow key={i} cols={cols} h={rowH} />
    ))}
  </span>
);

/**
 * A chart frame with its axis gutters reserved. `gutter` is the price-scale
 * width and `axis` the time-axis height — the desk's measured constants are
 * 74 and 26 (see the sweep's "the measured constants still measure"), so a
 * chart skeleton that uses them cannot shift the plot when the real chart
 * mounts.
 *
 * THE PLOT AREA IS ONE BLOCK, NOT A SKYLINE. The first version drew fifteen
 * bars of varying height, and rendered it looked like a bar chart with data
 * in it — the reader's eye went to the tall one. That is the exact failure
 * the header warns about: a placeholder that claims a shape the content may
 * not have. Only the gutters are universal to every chart on the desk, so
 * only the gutters are drawn in detail, and the plot is left as scaffolding.
 */
export const SkeletonChart = ({
  h = 220,
  gutter = 74,
  axis = 26,
}: {
  h?: number;
  gutter?: number;
  axis?: number;
}) => (
  <span className="block w-full" style={{ height: h }} aria-busy="true">
    <span className="flex h-full w-full">
      <span className="flex-1 min-w-0 flex flex-col">
        <span className="flex-1 min-h-0 p-2 flex">
          <Skeleton h={0} round="md" className="flex-1 self-stretch opacity-60" style={{ height: 'auto' }} />
        </span>
        <span className="flex items-center gap-4 px-2" style={{ height: axis }}>
          {[0, 1, 2, 3].map(i => (
            <Skeleton key={i} h={7} w="w-10" />
          ))}
        </span>
      </span>
      <span className="flex flex-col justify-between py-2 pl-2" style={{ width: gutter }}>
        {[0, 1, 2, 3, 4].map(i => (
          <Skeleton key={i} h={7} w="w-12" />
        ))}
      </span>
    </span>
  </span>
);

/** A stat card's interior — label, value, sub. Matches StatCard's rhythm so a
    MetricGrid does not resize when the numbers land. */
export const SkeletonStat = () => (
  <span className="block" aria-busy="true">
    <Skeleton h={8} w="w-2/5" />
    <span className="block mt-2.5">
      <Skeleton h={17} w="w-3/5" />
    </span>
    <span className="block mt-2.5">
      <Skeleton h={8} w="w-4/5" />
    </span>
  </span>
);

/** A whole panel: the 40px header bar and a body, inside the same
    `rounded-lg` border the real Panel draws. Pass the body you expect —
    `<SkeletonPanel><SkeletonTable rows={6} /></SkeletonPanel>` — or leave it
    empty for a plain block of the right height. */
export const SkeletonPanel = ({
  h,
  children,
}: {
  h?: number;
  children?: ReactNode;
}) => (
  <div
    className="border border-borderSubtle bg-panel rounded-lg flex flex-col min-w-0 overflow-hidden"
    style={h ? { height: h } : undefined}
    aria-busy="true"
  >
    <div className="flex items-center gap-3 px-4 h-10 border-b border-borderSubtle shrink-0">
      <Skeleton h={8} w="w-28" />
      <span className="ml-auto flex items-center gap-2">
        <Skeleton h={8} w="w-16" />
      </span>
    </div>
    <div className="flex-1 min-h-0 p-3">{children}</div>
  </div>
);

/* ---- timing ------------------------------------------------------------ */

/**
 * HOLDS A PLACEHOLDER BACK so a fast arrival never flashes one.
 *
 * The problem this solves is specific. A route chunk on a warm cache resolves
 * in a frame or two, and a skeleton that appears and vanishes inside 100ms is
 * strictly worse than nothing — the reader sees a flicker and reads it as a
 * fault, not as progress. But the same fallback on a cold cache over a slow
 * link is a blank screen for two seconds, which reads as broken.
 *
 * Both are fixed by waiting. Under `after` the reader sees the old screen
 * hold for an imperceptible beat; over it, they see the shape of what is
 * coming. 140ms is chosen because it is under the ~200ms at which a delay
 * starts to feel like a delay, so the skeleton only ever appears when
 * something slower than instant is genuinely happening.
 */
export const Delayed = ({
  after = 140,
  children,
}: {
  after?: number;
  children: ReactNode;
}) => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), after);
    return () => window.clearTimeout(t);
  }, [after]);
  return show ? <>{children}</> : null;
};

/**
 * THE ROUTE FALLBACK — deliberately generic.
 *
 * Forty-seven lazy pages arrive through one Suspense boundary and they do not
 * share a shape: Pulse is a stat grid, the tape is a table, Terrain is a
 * chart. A placeholder that guessed would be right once and wrong forty-six
 * times, and a wrong skeleton costs more than none because the content lands
 * somewhere other than where the eye was sent.
 *
 * So this claims only what every page does have: a title, and panels below
 * it. It is wrapped in `Delayed` at the call site, not here, so a caller can
 * decide the beat.
 */
export const PageSkeleton = () => (
  <div className="flex flex-col gap-4 animate-soft-in" aria-busy="true">
    <div>
      <Skeleton h={9} w="w-32" />
      <span className="block mt-2">
        <Skeleton h={16} w="w-56" />
      </span>
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="border border-borderSubtle bg-panel rounded-lg p-3">
          <SkeletonStat />
        </div>
      ))}
    </div>
    {/* A plain body, not a chart. This one fallback serves all forty-seven
        and most of them are not charts; the panel frame is the most any of
        them share. Height comes from the body rather than a fixed number, so the
        axis row of whatever lands here is never clipped by the placeholder. */}
    <SkeletonPanel>
      <span className="block h-[300px]">
        <Skeleton h={0} round="md" className="h-full opacity-60" style={{ height: '100%' }} />
      </span>
    </SkeletonPanel>
  </div>
);

export default Skeleton;
