import type React from 'react';

/**
 * Native title for a line that truncates.
 *
 * The metric primitives clip label, value and sub-line, so a narrow cell can
 * swallow text with no way to read the rest. Where the content is plain text it
 * doubles as the `title`, which costs no layout and makes the clip recoverable.
 * Nodes return undefined — `title` only takes a string, and stringifying an
 * element would print `[object Object]` into a tooltip.
 */
export const titleOf = (v: React.ReactNode): string | undefined => (typeof v === 'string' ? v : undefined);
