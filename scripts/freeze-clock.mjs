/**
 * Pins the wall clock to $SWEEP_DATE for one `vitest run`. Used only by
 * scripts/date-sweep.mjs — it is NOT in vitest.config.ts's setupFiles, and
 * that omission is the point: the ordinary suite runs against the real clock so
 * a date-fragile assertion has somewhere to show itself.
 *
 * Replaces the Date constructor rather than calling vi.useFakeTimers, because
 * fake timers also capture setTimeout/setInterval and this codebase ticks on
 * both. Only the zero-argument constructor and Date.now() are redirected; every
 * explicit `new Date(y, m, d)` in the tests keeps meaning what it says.
 */
const iso = process.env.SWEEP_DATE;
if (iso) {
  const fixed = new Date(iso).getTime();
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }
    static now() {
      return fixed;
    }
  }
  globalThis.Date = FrozenDate;
}
