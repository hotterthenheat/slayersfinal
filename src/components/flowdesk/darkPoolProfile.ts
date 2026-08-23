/*
==================================================
  SLAYER TERMINAL - DARK-POOL PRICE PROFILE
  (flowdesk/darkPoolProfile.ts)

  Off-exchange dollars, binned by the price they crossed
  at. This is the desk's picture, and it is drawn from the
  two fields the consolidated tape genuinely reports for an
  off-exchange trade: PRICE and SIZE.

  WHY THAT SENTENCE MATTERS. `data/darkpool.ts` also
  publishes an inferred read per print — accumulation,
  distribution, hedge, rotation — and the tape says none of
  that. The repo already keeps that line clean in the table
  (Kind, Venue and Clips sit under **Read**, not under a
  heading that means "what the tape carried"). The profile
  keeps it too: BAR LENGTH IS MEASURED DOLLARS AND NOTHING
  ELSE. No inference sets a length here, so a long bar is
  always a fact about how much crossed at that price.

  The tracked shelves ride ON the profile rather than
  replacing it, because a shelf is a judgement about which
  peaks matter and the peaks themselves are not.

  PRESENTATION ARITHMETIC, NOT A MODEL. Binning is the
  histogram's own bookkeeping — sum dollars into equal price
  buckets and find the tallest. It reads DarkPoolView and
  invents nothing, so a real print feed replaces the input
  and this file is untouched. Uniform bins are load-bearing:
  equal price width per bin is what lets the renderer use
  equal row heights and still be proportional on the price
  axis. Bins of unequal width would make a taller row mean
  "wider price range", which is the one thing a profile must
  never say.
==================================================
*/

import type { DarkPoolLevel, DarkPoolPrint } from '../../types/darkpool';

export interface ProfileBin {
  /** Inclusive low edge, exclusive high edge (the top bin includes its high). */
  lo: number;
  hi: number;
  /** Bin centre — what a label prints. */
  mid: number;
  /** Off-exchange dollars that crossed inside this price band. MEASURED. */
  notional: number;
  prints: number;
  /**
   * The tracked shelf falling inside this band, if any. At most one: shelves are
   * far enough apart relative to the bin width that two sharing a bin means the
   * bin count is wrong, and `nearest` below resolves the tie rather than dropping
   * one silently.
   */
  shelf: DarkPoolLevel | null;
}

export interface DarkPoolProfile {
  bins: ProfileBin[];
  /** Largest bin notional — the scale every bar is drawn against. */
  max: number;
  lo: number;
  hi: number;
  /** The price width of one bin. Published so a caller can label the axis at the
      same precision the bins were cut at rather than guessing a decimal count. */
  step: number;
  /** Where spot sits as a 0-1 fraction from the TOP of the plot. Never null:
      the range is built to contain spot (see below). */
  spotFrac: number;
  /** Total dollars the profile accounts for. Equals the session total when every
      print is in range, and is the number a caller should show rather than
      re-summing prints, so the picture and its caption cannot disagree. */
  total: number;
}

/**
 * A round number near `raw`, from the 1 / 2 / 2.5 / 5 / 10 family.
 *
 * WHY THE AXIS IS SNAPPED. Dividing the printed range into exactly N parts gives
 * bin centres like 500.97, 500.80, 500.63 — arbitrary numbers at which nobody
 * traded and against which no shelf price can be matched by eye. The gutter is
 * the desk's PRICE AXIS, and an axis whose labels are artefacts of the bin count
 * is unreadable however correct it is. Snapping the WIDTH to a round step makes
 * every edge a round price, which is also where shelves actually sit.
 */
function niceStep(raw: number): number {
  if (!(raw > 0)) return 0.01;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5]) {
    if (raw <= m * mag) return m * mag;
  }
  return 10 * mag;
}

/**
 * Bin off-exchange prints by price.
 *
 * `binCount` is a TARGET, not a promise. The range is padded to contain spot,
 * then snapped outward to round step boundaries, so the count that comes back is
 * near the request rather than equal to it. That is the correct trade: a clean
 * axis is worth a bin or two either way, and nothing downstream indexes bins by
 * position.
 */
export function buildDarkPoolProfile(
  prints: DarkPoolPrint[],
  levels: DarkPoolLevel[],
  spot: number,
  binCount = 30
): DarkPoolProfile {
  const n = Math.max(1, Math.floor(binCount));

  if (prints.length === 0) {
    return { bins: [], max: 0, lo: spot, hi: spot, step: 0, spotFrac: 0.5, total: 0 };
  }

  let lo = Infinity;
  let hi = -Infinity;
  for (const p of prints) {
    if (p.price < lo) lo = p.price;
    if (p.price > hi) hi = p.price;
  }

  /*
    SPOT IS INSIDE THE RANGE BY CONSTRUCTION.

    The rule marking current price used to be drawn only when spot happened to
    fall between the extreme prints, and the caller had to handle a null. Both
    were wrong for the same reason: on this desk spot is the reference EVERY bar
    is read against, so a picture that can omit it is a picture that can quietly
    stop answering the question. Widening the range costs a few empty bands and
    those bands are themselves information — "nothing crossed up here".

    Shelves join the range for the same reason. A tracked shelf outside the
    printed extremes is exactly the shelf a reader is looking for.
  */
  for (const l of levels) {
    if (l.price < lo) lo = l.price;
    if (l.price > hi) hi = l.price;
  }
  lo = Math.min(lo, spot);
  hi = Math.max(hi, spot);

  if (hi - lo < 0.02) {
    const mid = (hi + lo) / 2;
    lo = mid - 0.01;
    hi = mid + 0.01;
  }

  const step = niceStep((hi - lo) / n);
  const k0 = Math.floor(lo / step);
  const k1 = Math.ceil(hi / step);
  const count = Math.max(1, k1 - k0);
  const edge = (k: number) => (k0 + k) * step;

  const bins: ProfileBin[] = Array.from({ length: count }, (_, i) => ({
    lo: edge(i),
    hi: edge(i + 1),
    mid: edge(i) + step / 2,
    notional: 0,
    prints: 0,
    shelf: null,
  }));

  /** Which bin a price lands in. The top edge belongs to the last bin, not to a
      bin past the end — `Math.floor` on an exact `hi` returns `count`. */
  const indexOf = (price: number): number =>
    Math.min(count - 1, Math.max(0, Math.floor(price / step) - k0));

  for (const p of prints) {
    const b = bins[indexOf(p.price)];
    b.notional += p.notional;
    b.prints += 1;
  }

  /*
    Shelves are attached by NEAREST BIN CENTRE within the bin the price falls in.
    Two shelves inside one band means the band is too wide to separate them, and
    the closer one to the band's centre is the better single label for it —
    silently keeping whichever was iterated last would make the picture depend on
    the order data/darkpool.ts happens to emit levels in.
  */
  for (const level of levels) {
    const i = indexOf(level.price);
    const current = bins[i].shelf;
    if (!current || Math.abs(level.price - bins[i].mid) < Math.abs(current.price - bins[i].mid)) {
      bins[i].shelf = level;
    }
  }

  let max = 0;
  let total = 0;
  for (const b of bins) {
    if (b.notional > max) max = b.notional;
    total += b.notional;
  }

  const rlo = edge(0);
  const rhi = edge(count);

  return {
    bins: bins.slice().reverse(), // high price first, so the plot reads as a price axis
    max,
    lo: rlo,
    hi: rhi,
    step,
    spotFrac: (rhi - spot) / (rhi - rlo),
    total,
  };
}
