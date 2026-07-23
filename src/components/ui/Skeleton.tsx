interface SkeletonProps {
  /** Size/shape via utility classes, e.g. "h-4 w-24 rounded-full". */
  className?: string;
}

/**
 * Loading placeholder block. A faint surface with a slow sheen sweep that
 * collapses to a static block under prefers-reduced-motion (see index.css).
 * Decorative — hidden from the accessibility tree.
 */
const Skeleton = ({ className = '' }: SkeletonProps) => (
  <div className={`skeleton ${className}`} aria-hidden="true" />
);

/** A stack of shrinking lines — a text-block placeholder. */
export const SkeletonText = ({ lines = 3, className = '' }: { lines?: number; className?: string }) => (
  <div className={`flex flex-col gap-2 ${className}`} aria-hidden="true">
    {Array.from({ length: lines }).map((_, i) => (
      <div key={i} className="skeleton h-3" style={{ width: `${92 - i * 14}%` }} />
    ))}
  </div>
);

/** Panel-shaped placeholder — a header line over evenly spaced rows. Drops into
 *  a loading Panel body where a table or feed is about to render. */
export const SkeletonRows = ({ rows = 6, className = '' }: { rows?: number; className?: string }) => (
  <div className={`flex flex-col gap-2.5 ${className}`} aria-hidden="true">
    <Skeleton className="h-4 w-1/3" />
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton key={i} className="h-8 w-full rounded-md" />
    ))}
  </div>
);

export default Skeleton;
