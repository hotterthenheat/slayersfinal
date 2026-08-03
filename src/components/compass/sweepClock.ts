/**
 * One format wherever a sweep time is printed on this desk.
 *
 * Value-only module (no component export) so importing it never trips
 * react-refresh — same split as ./verdict.ts and ./setupState.ts.
 */
export const sweepClock = (ms: number): string => new Date(ms).toLocaleTimeString('en-GB');
