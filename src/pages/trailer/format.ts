/*
  Number formatting for the trailer.

  Split out of `parts.tsx` so that file exports components only — otherwise every
  scene that imports a formatter drags the whole component module through
  fast-refresh's component-only rule and the boundary stops working during
  development.
*/

export const usd = (v: number): string => {
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}K`;
  return `${sign}$${a.toFixed(0)}`;
};

export const pct = (v: number, dp = 1): string => `${v >= 0 ? '+' : ''}${v.toFixed(dp)}%`;

export const prob = (v: number): string => `${Math.round(v * 100)}%`;

export const px = (v: number): string => v.toFixed(2);

/**
 * The session clock, rendered as the wall clock it was built as.
 *
 * Deliberately NO `timeZone` option. `sessionDate()` constructs a Date whose
 * LOCAL fields are the session's ET wall clock — New York's calendar day at
 * 10:42 — so formatting it locally prints 10:42 for every viewer, which is what
 * the " ET" beside it claims. Adding a timeZone here would convert that wall
 * clock a second time and shift the whole film off its own session.
 */
export const clock = (ts: number): string =>
  new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
