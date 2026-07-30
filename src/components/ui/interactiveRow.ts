import type React from 'react';

/**
 * The contract for a clickable table row.
 *
 * `DataTable` already got this right, and five hand-rolled tables that duplicate
 * it did not: they carried `onClick` and `cursor-pointer` and nothing else, so
 * the row looked interactive, responded to a mouse, and was invisible to the
 * keyboard. Anything that renders its own rows spreads these instead of
 * re-deriving them.
 */
export const ROW_INTERACTIVE =
  'cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60';

/** Enter (and Space, which browsers do not fire click for on a `tr`) activates. */
export const rowKeyDown =
  (activate: () => void) =>
  (e: React.KeyboardEvent): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    // A Term explainer or a nested button inside the row handles its own keys
    // and stops propagation, so reaching here means the row itself is the target.
    e.preventDefault();
    activate();
  };

/** Props every clickable row needs. Spread onto the `<tr>` (or row div). */
export const interactiveRowProps = (
  activate: () => void,
  selected?: boolean
): {
  tabIndex: number;
  role: 'button';
  'aria-selected': boolean | undefined;
  onKeyDown: (e: React.KeyboardEvent) => void;
} => ({
  tabIndex: 0,
  role: 'button',
  'aria-selected': selected,
  onKeyDown: rowKeyDown(activate),
});
