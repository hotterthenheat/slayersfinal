import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { X } from 'lucide-react';
import Simulator from '../../core/simulator';
import { fmtUsd } from '../../data/gex';
import { sessionVolumeProfile, type VolumeProfile } from '../../data/volumeProfile';
import { heatMagnitude, heatRgb } from './heatmap';
import type { PriceProjection } from './StrikeChart';
import type { GexLevel } from '../../types/market';
import type { KeyLevels } from '../../types/gex';

/*
==================================================
  SLAYER TERMINAL - PANE LADDER (components/gex/PaneLadder.tsx)

  The column that runs down the right edge of a
  Terrain pane: every strike as a row, the exposure
  parked there as a bar, and each row sitting at the
  height the chart beside it puts that price.
==================================================

  WHY IT IS A LADDER AND NOT A DEPTH BOOK.

  The reference this was built against shows a book beside the tape — resting
  size at each price. This product has no resting size: it holds an options
  chain, not a limit book, and inventing one would mean inventing the numbers.
  So the column shows the size this desk CAN see, which is the exposure sitting
  at each strike — the same book the chart's own lines are drawn from.

  That sourcing is the whole design. `buildLadderFor` hands back the rows of
  the very snapshot `buildLevelsFor` reduces to four prices, and the named
  levels arrive as a prop from the pane that already holds them. So the KING
  bar in this column is at the KING line on the chart beside it, always, and
  not because two generators happened to agree.

  IT IS PLACED BY PRICE, NOT BY INDEX — and that is a correctness fix.

  Evenly spaced rows made this column a second, contradicting price axis. At
  1600x1000 the chart's own gutter read 522.00 at the exact screen height where
  this rail read 533: two columns of numbers 54px apart disagreeing by $11.
  Worse, the rail's spot chip and the chart's price card printed the SAME
  number 200px apart. Nothing about a wall or a flip can be read off a column
  that does not line up with the tape it annotates.

  So the chart publishes where it puts a price (`PriceProjection`) and this
  column asks, every frame that matters. It cannot re-derive that mapping
  itself — autoscale, a price-scale drag and percent mode all move it.

  The two windows are NOT the same size, and never will be: a $16.88 plot span
  against a $20 chain, a $29.06 span against the same $20, a $5.10 span against
  $10. So the chain is read wide and the rows that fall outside the plot are
  hidden and counted, rather than the window being stretched to fit.

  THE BAR IS DOUBLE-ENCODED, on purpose and for a reason the heatmap already
  wrote down: length AND colour carry the same number, off the same curve.
  Brightness is what the eye catches scanning the column; length is what it
  reads once it stops. Sizing linearly while colouring on the ramp's curve
  produces rows that are visibly hot and visibly empty, which reads as a
  rendering fault rather than as a light strike — hence `heatMagnitude`.

  Steel is call-dominant (dealers absorb), gold is put-dominant (dealers
  amplify). Same inks as the matrix, the pressure ladder and the chart's
  trails, because a reader should not have to learn this column separately.
*/

interface PaneLadderProps {
  ticker: string;
  rows: GexLevel[];
  maxAbs: number;
  /** The chain's own strike spacing, used to work out what one strike is worth
      in pixels and therefore how crowded the column is. */
  step: number;
  /** The pane's own named levels — never re-derived here, see the note above */
  levels: KeyLevels;
  /** Currently flashed on the chart, so the column can show which row it is */
  focusPrice?: number | null;
  /** Click a strike to flash it on the chart beside this rail */
  onSelect?: (price: number) => void;
  /*
    Where the chart beside this rail puts a price. Held as a ref and polled in
    this component's own frame loop rather than passed as a value: the mapping
    moves on autoscale, on a price-scale drag, on a resize and on every re-fit,
    none of which are React renders.

    Without it the column falls back to nothing — it stays hidden rather than
    drawing a set of prices at heights it cannot vouch for.
  */
  projection?: MutableRefObject<PriceProjection | null>;
  /** Close this rail. Given one, the header carries an × — a panel you can
      turn on from a toolbar and not off from itself is a panel that feels
      stuck to the page. */
  onClose?: () => void;
  /** What the close button's tooltip says — the host knows the key. */
  closeHint?: string;
  /** Extra classes from the host — used to hold the rail back at narrow
      widths, where it would take a third of the screen. */
  className?: string;
}

/*
  The bars are TRANSLUCENT (Noah, 2026-08-25: "everything is transparency
  there i need mines to be like that not all out there like this").

  Full-strength ramp values are right for a heatmap CELL, where the colour is
  the entire content of the cell and it is read against its neighbours. A rail
  beside a chart is not that: it sits in the reader's periphery while they
  watch the tape, and at full strength a column of solid gold and platinum
  blocks pulls the eye off the thing it is there to annotate. At 0.5 the ramp
  keeps its whole ordering — both poles, the gamma curve, the neutral floor —
  and stops competing with the candles.

  Nothing about contrast rides on this: the price and the tags sit in their
  own lanes on the bare surface, never over the bar.
*/
const BAR_ALPHA = 0.5;

/** The rail's width, in px. Exported because a host that floats controls over
    the top-right of a pane has to clear it, and two places guessing the same
    number is how they end up disagreeing after one of them is edited. */
export const LADDER_WIDTH_PX = 132;

/** The shortest a row can be and still be a readable row — the 10px strike
    needs about this much line box. Below it, rows get culled by stride rather
    than squeezed into illegibility. */
const MIN_PITCH = 13;
/** And the tallest, so a wide-open scale gives thick bars rather than a few
    enormous ones with nothing between them. */
const MAX_PITCH = 22;

/** The band at the top of the track the floating header owns: the 20px caption
    row (SIZE / STRIKE and the close ×) plus the 12px line the ▲ stub now sits
    on, just under it. A row placed inside it prints its price UNDER the words —
    measured 20px of overlap, the whole caption row, on three of four rails at
    1440x900. So the band is reserved, and the rows that fall in it are culled
    and COUNTED by the ▲ stub like any other row the plot is not showing, rather
    than being drawn where they cannot be read. Keep in step with the header's
    own height and with the stub's `top-5`. */
const HEAD_BAND = 32;

/* HOW CLOSE THE SPOT AND FLIP RULES CAN BE BEFORE THEIR BADGES TOUCH.

   A badge is 10px of line box (`leading-[10px]`) inside a 14px rule band, and
   the two are placed independently by price. Measured collisions at 4.3, 6.2,
   6.9 and 9.2px of vertical overlap, so anything under a full band is a hit;
   14 is that band, and it is the number the rules are already sized to rather
   than a second one invented here. */
const BADGE_CLEAR_PX = 14;

/* HOW FAR LEFT OF A ROW'S STRIKE A RULE BADGE HAS TO START.

   Both live in the same right-hand lane and neither knew it. A rule's badge is
   `ml-auto mr-1`, so its right edge is 4px in from the track; a row's strike is
   `text-right` inside `px-1.5`, so its right edge is 6px in. The badge is wider
   than any strike it meets — 38px against 20-29.5px measured — so it did not
   graze the number, it covered ALL of it, and the rules are rendered after
   every row with no z-index, so the opaque chip won.

   Measured on the shipped build at 1024x768 layout 4: 72 covers over 24
   rail-samples, worst 10.0px, which is the badge's whole line box over the
   whole glyph band of a 10px label. Seen: "476.03" over 476, "182.58" over
   182.50, "117.43" over a strike carrying the K tag — the heaviest in the
   book. At 1440x900 layout 1 the pitch is wide enough that the badge lands
   between rows and there were none, which is why this went unnoticed.

   So the badges are homed OUT of the strike lane rather than stepped out of it
   when they happen to clash: a threshold measured against a spot price that
   moves every tick would put the chip in one lane or the other depending on
   the last print. 5px is the 2px between the two right edges plus 3px of air.

   What they land on instead is the magnitude bar, which is `aria-hidden`
   decoration whose value is its LENGTH — and they cover its tip, not its
   origin, so a short bar stays whole and a long one still reads as long. The
   file's own order of precedence: "the price is the one thing in this column
   that must be readable". */
const BADGE_STEP_PX = 5;

/* THE LANE THE ▼ STUB SITS IN, reserved the way HEAD_BAND is reserved at the
   top — and it is the same fix the ▲ stub already got.

   That stub was moved to `top-5` because at `top-0` it printed over the
   caption AND took the close x's hit target; the note on it says its lane is
   "the lower half of HEAD_BAND, which no row is placed in". The ▼ stub sits
   at `bottom-0`, and nothing reserved a lane for it: `fits` floored rows at
   HEAD_BAND on top but ran them all the way to H at the bottom, so the last
   row was placed underneath it. Measured: the stub covered the strike label
   "106" by 25x7.9px and document.elementFromPoint at that label's own centre
   returned THE STUB — the bottom strike could not be clicked.

   14px is the stub's own line box (`leading-[12px]` plus its 1px of padding),
   which is what has to be kept clear.

   Reserving it costs nothing that is not accounted for: if a row would have
   landed in the band it is now culled, which makes `down` non-zero, which is
   exactly when the stub appears and says so — and clicking it goes to that
   strike. If no row would have landed there the stub stays hidden and no row
   was lost. */
const FOOT_BAND = 14;

/** Strikes print whole when they are whole — the rule every strike list uses. */
const fmtStrike = (v: number): string => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));

/*
  The named levels that land ON a strike get a tag; the flip lands BETWEEN them
  far more often than not, so it is drawn as a rule instead.

  A ROW IS REGULARLY MORE THAN ONE THING, and returning only the first is a
  quiet lie. `buildLevelsFor` takes king as the heaviest strike anywhere and
  putWall as the heaviest below spot, so whenever the book's weight sits under
  the market they are THE SAME STRIKE by construction — not a coincidence, and
  not rare: measured across the watchlist just now it was 6 names out of 6.
  A single-tag version would have printed K on every one of those rows and
  dropped the wall, on the surface whose entire justification is that it agrees
  with the chart beside it.
*/
const tagsFor = (strike: number, levels: KeyLevels): { text: string; ink: string }[] => {
  const at = (v: number) => Math.abs(strike - v) < 1e-9;
  const out: { text: string; ink: string }[] = [];
  if (at(levels.king)) out.push({ text: 'K', ink: 'text-king' });
  if (at(levels.callWall)) out.push({ text: 'CW', ink: 'text-bull' });
  if (at(levels.putWall)) out.push({ text: 'PW', ink: 'text-bear' });
  return out;
};

const PaneLadder = ({
  ticker,
  rows,
  maxAbs,
  step,
  levels,
  focusPrice = null,
  onSelect,
  projection,
  onClose,
  closeHint = 'Hide this strike rail',
  className = '',
}: PaneLadderProps) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  /** Which strike each off-plot stub would bring back — written by the frame
      loop, read by the click handler, so the handler never goes stale. */
  const stubTargets = useRef<{ up: number | null; down: number | null }>({ up: null, down: null });
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  /*
    T-10 — THE VOLUME PROFILE, overlaid on the same axis.

    The rail's bars say where the BOOK is heavy; the profile says where the
    TAPE has traded. The directive's point is reading the two against each
    other, so the profile is an OVERLAY at reduced opacity rather than a
    second mode — same projection, same rows, one axis that cannot disagree
    with itself. Off by default; the VOL chip in the header turns it on.

    Recomputed when the rows do (the host hands new rows every tick, so the
    session's newest minute is always folded in) — one session cut plus one
    O(bars×bins) spread, well under a millisecond.
  */
  const [showVol, setShowVol] = useState(false);
  const vp = useMemo<VolumeProfile | null>(
    () => (showVol ? sessionVolumeProfile(Simulator.getCandles(ticker) ?? []) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showVol, ticker, rows]
  );
  const vpRef = useRef<VolumeProfile | null>(null);
  vpRef.current = vp;
  const vpCanvasRef = useRef<HTMLCanvasElement | null>(null);

  /* Painted from BOTH triggers that can move it: the frame loop (the mapping
     moved) and this effect (the data moved). Reads refs, so the two callers
     share one painter. */
  const paintProfile = () => {
    const canvas = vpCanvasRef.current;
    const p = projection?.current;
    if (!canvas) return;
    const prof = vpRef.current;
    const H = p?.plotHeight() ?? 0;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.max(1, Math.round(H * dpr));
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!prof || !p || H <= 0 || prof.totalVolume <= 0) return;
    const maxV = Math.max(...prof.bins.map(b => b.volume));
    if (!(maxV > 0)) return;
    /* Neutral steel — traded volume carries no dealer meaning, so it takes
       none of the palette's inks. Bars grow from the size edge like the
       exposure bars they underlay, at an alpha that stays texture. */
    const barMax = (W - 30) * dpr;
    for (const b of prof.bins) {
      const y = p.yFor(b.price);
      const y2 = p.yFor(b.price + prof.binSize);
      if (y == null || y2 == null) continue;
      const top = Math.min(y, y2) * dpr;
      const h = Math.max(1, Math.abs(y - y2) * dpr - 1);
      const isPoc = prof.vpoc !== null && Math.abs(b.price - prof.vpoc) < prof.binSize / 2;
      ctx.fillStyle = `rgba(226,234,244,${isPoc ? 0.2 : 0.09})`;
      ctx.fillRect(0, top, (b.volume / maxV) * barMax, h);
    }
    /* The value area's edges and the VPOC, as hairlines on the same axis. */
    const line = (price: number | null, alpha: number, dash: number[]) => {
      if (price === null) return;
      const y = p.yFor(price);
      if (y == null) return;
      ctx.strokeStyle = `rgba(226,234,244,${alpha})`;
      ctx.lineWidth = dpr;
      ctx.setLineDash(dash.map(d => d * dpr));
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y * dpr) + 0.5);
      ctx.lineTo(canvas.width, Math.round(y * dpr) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    line(prof.vah, 0.28, [3, 3]);
    line(prof.val, 0.28, [3, 3]);
    line(prof.vpoc, 0.4, []);
    if (prof.vpoc !== null) {
      const y = p.yFor(prof.vpoc);
      if (y != null) {
        ctx.font = `${7 * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.fillStyle = 'rgba(226,234,244,0.55)';
        ctx.fillText('VPOC', 2 * dpr, y * dpr - 2 * dpr);
      }
    }
  };
  useEffect(() => {
    paintProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp, showVol]);

  /*
    THE FRAME LOOP.

    Same shape as the chart's own price card: rAF, read everything, then write
    only what changed. It has to be a frame loop rather than an effect, because
    the thing it follows — where the chart puts a price — moves without any
    React render at all. Autoscale re-fits on a tick; a price-scale drag is a
    pointer gesture inside a canvas; a resize is neither.

    The fingerprint is what keeps it cheap. The tape moves every 1.5s, so on
    the overwhelming majority of frames the mapping is unchanged and this
    returns after three arithmetic calls without touching the DOM.
  */
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    let fpY = NaN, fpPitch = NaN, fpH = -1, fpFocus = NaN;

    const hide = () => {
      if (track.style.opacity !== '0') track.style.opacity = '0';
      fpY = NaN;
      fpH = -1;
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = projection?.current;
      if (!p) return hide();

      /* Two probes and a height are the whole fingerprint: an anchor price and
         one strike above it give both the offset and the scale. */
      const anchor = rows.length ? rows[rows.length - 1].strike : levels.spot;
      const y0 = p.yFor(anchor);
      const y1 = p.yFor(anchor + step);
      const H = p.plotHeight();
      if (y0 == null || y1 == null || H <= 0) return hide();

      const pitch = Math.abs(y0 - y1);
      /* An empty price scale maps EVERY price to 0. Without this the whole
         column stacks on the top edge during the boot splash and during the
         reload after any symbol or timeframe change. */
      if (!Number.isFinite(pitch) || pitch < 1e-6) return hide();

      const fq = focusPrice ?? NaN;
      if (
        Math.round(y0 * 4) === fpY && Math.round(pitch * 4) === fpPitch &&
        H === fpH && (Number.isNaN(fq) ? Number.isNaN(fpFocus) : fq === fpFocus)
      ) return;
      fpY = Math.round(y0 * 4);
      fpPitch = Math.round(pitch * 4);
      fpH = H;
      fpFocus = fq;

      /* Clip to the PLOT, not to the container. They differ by the time axis
         normally, and by far more than that whenever a pane-mode compare adds
         a second pane below — measured 227px out. Taking the plot's own height
         is the only version that survives both. */
      track.style.height = `${H}px`;
      /* The profile follows the same mapping the rows do — repainted here on
         exactly the frames the rows move, and from its own effect when the
         DATA moves with the mapping still. */
      paintProfile();
      track.style.opacity = '1';

      const rowH = Math.max(MIN_PITCH, Math.min(MAX_PITCH, Math.round(pitch) - 2));
      track.style.setProperty('--row-h', `${rowH}px`);

      /* Crowding is answered by STRIDE, never by scrolling: any scroll offset
         breaks the y contract outright, and a column that has to be scrolled
         to be compared with the chart beside it is not aligned at all.

         Anchored on the strike VALUE rather than the array index. The chain
         recentres on spot every tick, so an index-anchored stride would
         reshuffle which strikes survive from frame to frame. */
      const stride = Math.max(1, Math.ceil(MIN_PITCH / pitch));

      const els = track.querySelectorAll<HTMLElement>('[data-strike]');
      const place = (el: HTMLElement, y: number) => {
        const t = `translateY(${(y - rowH / 2).toFixed(1)}px)`;
        if (el.style.transform !== t) el.style.transform = t;
        if (el.style.display === 'none') el.style.display = '';
      };
      const drop = (el: HTMLElement) => {
        if (el.style.display !== 'none') el.style.display = 'none';
      };

      /* Two passes. Tagged rows — king, the walls, whatever the reader has
         flashed — are kept whatever the stride says, and then claim their
         space: a strided neighbour landing within a row's height of one is
         dropped so the named strike stays readable. */
      const ys: (number | null)[] = [];
      const anchors: number[] = [];
      let up = 0, down = 0;
      let upNear: { d: number; k: number } | null = null;
      let downNear: { d: number; k: number } | null = null;

      /* A row is off-plot when its BOX does not fit, not when its centre does
         not. The track clips at the plot floor, so a row centred two pixels
         above it is drawn sliced in half — which reads as a rendering fault,
         and is worse than the row simply being one of the ones the stub is
         holding. Same at the top, and now symmetric at the bottom: each end
         keeps its stub's lane clear (HEAD_BAND / FOOT_BAND) so neither stub is
         ever drawn on top of a row it would then steal the click from. */
      const half = rowH / 2;
      const fits = (y: number) => y - half >= HEAD_BAND && y + half <= H - FOOT_BAND;

      els.forEach((el, i) => {
        const k = Number(el.dataset.strike);
        const y = p.yFor(k);
        ys[i] = y;
        if (y == null) return;
        if (fits(y)) {
          if (el.dataset.tag === '1') anchors.push(y);
          return;
        }
        if (y < H / 2) {
          up++;
          if (!upNear || half - y < upNear.d) upNear = { d: half - y, k };
        } else {
          down++;
          if (!downNear || y + half - H < downNear.d) downNear = { d: y + half - H, k };
        }
      });

      els.forEach((el, i) => {
        const y = ys[i];
        if (y == null || !fits(y)) return drop(el);
        if (el.dataset.tag === '1') return place(el, y);
        if (Math.round(Number(el.dataset.strike) / step) % stride !== 0) return drop(el);
        for (const a of anchors) if (Math.abs(a - y) < rowH) return drop(el);
        place(el, y);
      });

      /* Spot and the flip are PRICES, not strikes — they almost never equal
         one. Placed by their own price, hidden when the plot is not showing
         them, rather than being slotted between rows. */
      const ruleY = new Map<string, number>();
      track.querySelectorAll<HTMLElement>('[data-rule]').forEach(el => {
        const y = p.yFor(Number(el.dataset.price));
        if (y == null || y - 7 < 0 || y + 7 > H) return drop(el);
        const t = `translateY(${(y - 7).toFixed(1)}px)`;
        if (el.style.transform !== t) el.style.transform = t;
        if (el.style.display === 'none') el.style.display = '';
        ruleY.set(el.dataset.rule ?? '', y);
      });

      /* WHERE THE TWO RULE BADGES GO. Two separate collisions, one pass.

         FIRST, NEITHER OF THEM SITS ON A STRIKE. Both are `ml-auto` in the
         same right-hand lane the strikes are right-aligned in, and both are
         wider than any strike they meet, so a rule crossing a row erased that
         row's number outright — see BADGE_STEP_PX for the measurements. They
         are homed left of the lane, always, rather than stepped out of it on a
         threshold: spot moves every tick, and a chip that changes lanes on the
         last print is its own kind of unreadable.

         The lane is measured off a real strike rather than derived from
         `priceLen` and a guessed character width — the labels are `Nch` of a
         10px font and the badges an 8px one, so a `ch` computed here would be
         the wrong unit. First row with a width: they all carry the same
         `priceLen`, and a culled row measures 0.

         SECOND, THE FLIP STILL STEPS PAST SPOT. It spends most of its life
         near spot — that is what a flip IS — and at any distance under a badge
         height they print on top of each other: measured 37.6x9.2px of a 38x10
         badge, spot "513.45" underneath flip "513.50". Two DIFFERENT prices in
         the same 38 pixels is not a near miss, it is an unreadable number. The
         FLIP is the one that moves, because spot is the reference a reader
         looks for, and it steps by SPOT's measured width — the thing it has to
         clear — rather than by its own, which is only the same number while
         the two prices have the same digit count.

         WHAT THE STACK COSTS, stated rather than discovered. Two badges plus
         their gaps want ~79px, and the room between the tag lane and the
         strike lane is ~72px. So while the two rules are on each other the
         stepped-aside flip reaches 9.1px into an ~18px tag column — measured
         over 48 badge-samples at 1024x768 layout 4 — and since the tag glyphs
         are left-aligned in that column, a tagged row there loses its first
         characters. That is the trade: a tag is a 1-3 character marker on a
         minority of rows and the row's `title` still carries its full text,
         while a covered strike was a price with nothing behind it. The rail
         was ALREADY in this state whenever the two rules met; it just used to
         cost the number as well.

         THE CLAMP is the same arithmetic at a longer price. An index quotes
         seven characters (6100.00), which widens both badges and the lane they
         start from, and unclamped the pair walks off the left edge of a track
         that is `overflow-hidden` — the flip cut in half rather than merely
         crowded. Clamped it stops 1px inside the edge, and because spot only
         steps by the strike lane the two still land apart. */
      const ySpot = ruleY.get('spot');
      const yFlip = ruleY.get('flip');
      const spotBadge = track.querySelector<HTMLElement>('[data-rule="spot"] [data-badge]');
      const flipBadge = track.querySelector<HTMLElement>('[data-rule="flip"] [data-badge]');

      let lane = 0;
      for (const el of track.querySelectorAll<HTMLElement>('[data-strike-label]')) {
        const w = el.offsetWidth;
        if (w > 0) {
          lane = w + BADGE_STEP_PX;
          break;
        }
      }

      /* No lane means every row is culled, and a badge cannot cover a number
         that is not drawn — so leave it where the markup puts it. */
      const park = (el: HTMLElement | null, extra: number) => {
        if (!el) return;
        const want = lane + extra;
        /* `mr-1` is the 4px the badge already sits in from the right edge, and
           1px keeps its left edge inside an `overflow-hidden` track. */
        const cap = Math.max(0, track.clientWidth - 5 - el.offsetWidth);
        const px = Math.min(want, cap);
        const t = px > 0 ? `translateX(${-px}px)` : '';
        if (el.style.transform !== t) el.style.transform = t;
      };
      park(spotBadge, 0);
      const clash = ySpot != null && yFlip != null && Math.abs(ySpot - yFlip) < BADGE_CLEAR_PX;
      park(flipBadge, clash ? (spotBadge?.offsetWidth ?? 0) + 3 : 0);

      /* Culled strikes must not vanish silently: a hidden row cannot be
         clicked, and clicking is exactly what brings it back — a click sets
         focus, focus joins the chart's autoscale extras and forces a re-fit.
         So each end says how many it is holding, and takes you to the nearest
         one. */
      stubTargets.current = {
        up: upNear ? (upNear as { d: number; k: number }).k : null,
        down: downNear ? (downNear as { d: number; k: number }).k : null,
      };
      const stub = (sel: string, n: number) => {
        const el = track.querySelector<HTMLElement>(sel);
        if (!el) return;
        if (n === 0) { drop(el); return; }
        if (el.style.display === 'none') el.style.display = '';
        const label = String(n);
        const slot = el.querySelector('[data-count]');
        if (slot && slot.textContent !== label) slot.textContent = label;
      };
      stub('[data-stub="up"]', up);
      stub('[data-stub="down"]', down);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [projection, rows, levels, step, focusPrice]);

  /*
    EVERY BAR LANE THE SAME WIDTH, and this is a correctness fix rather than a
    tidiness one.

    Letting the tag and the strike take their natural widths made the lane
    between them a different size on every row, so a bar's PIXEL length no
    longer tracked its value. Measured on the built page: the KING row — the
    heaviest strike in the book, and the one wearing two tags — drew a bar at
    55% of its row while a lighter neighbour with no tag drew 56%. Scanning
    the column for the longest bar found the wrong strike. That is the one
    thing this column exists to get right.

    So both outer lanes are reserved on every row, sized in `ch` off the widest
    content actually present. `ch` is exact in a monospace face, which is what
    this column is set in, so nothing is guessed and nothing truncates: a
    7-character index strike widens the lane for the whole rail instead of
    being clipped on its own row.
  */
  const tagLen = rows.length
    ? Math.max(0, ...rows.map(r => tagsFor(r.strike, levels).map(t => t.text).join('·').length))
    : 0;
  const priceLen = rows.length ? Math.max(...rows.map(r => fmtStrike(r.strike).length)) : 0;

  if (rows.length === 0) return null;

  return (
    <div
      style={{ width: LADDER_WIDTH_PX }}
      className={`shrink-0 relative min-h-0 border-l border-borderSubtle/70 ${className}`}
      aria-label={`${ticker} exposure by strike`}
    >
      {/*
        THE HEADER FLOATS, because y=0 is now the top of the plot and anything
        in flow above it would push the whole column off the price it is
        supposed to be sitting on. No bottom rule for the same reason — a line
        at y=21 reads as a false plot ceiling.

        The words stay: with the column aligned they do real work, telling the
        reader this is a discrete strike axis and not a second copy of the
        chart's continuous price ticks.

        Pointer events are split rather than granted wholesale — a full-width
        interactive strip across the top 21px would swallow clicks on the
        highest rows, which are exactly the ones a reader reaches for.
      */}
      <div className="absolute top-0 inset-x-0 z-10 pointer-events-none flex items-center gap-1 pl-2 pr-1 py-0.5 select-none bg-gradient-to-b from-canvas/70 to-transparent">
        <span className="font-mono text-[8px] font-semibold uppercase tracking-widest text-textMuted">Size</span>
        <span className="ml-auto font-mono text-[8px] font-semibold uppercase tracking-widest text-textMuted">Strike</span>
        <button
          onClick={() => setShowVol(v => !v)}
          aria-pressed={showVol}
          title="Volume profile — the session's traded volume by price, VPOC and value area, under the exposure bars"
          className={`pointer-events-auto shrink-0 rounded px-1 font-mono text-[8px] font-bold uppercase tracking-widest transition-colors ${
            showVol ? 'bg-white/[0.14] text-textPrimary' : 'text-textMuted hover:text-textPrimary hover:bg-white/[0.08]'
          }`}
        >
          Vol
        </button>
        {onClose && (
          <button
            onClick={onClose}
            aria-label={`Hide the ${ticker} strike rail`}
            title={closeHint}
            className="pointer-events-auto shrink-0 inline-flex items-center justify-center w-4 h-4 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        )}
      </div>

      {/* Height, opacity and every child's position are written by the frame
          loop, and NOTHING here writes `display` or `transform` from React —
          a property set in both places is one React silently reverts the
          moment an unrelated prop changes. The opacity gate is what hides the
          unplaced state: until the first successful pass the column is blank
          rather than showing every strike stacked on the top edge. */}
      <div ref={trackRef} className="absolute top-0 inset-x-0 overflow-hidden opacity-0" style={{ height: 0 }}>
        {/* T-10's layer — behind the rows in DOM order, so the exposure bars
            read OVER the traded-volume texture, which is the comparison the
            overlay exists to offer. */}
        <canvas ref={vpCanvasRef} aria-hidden className="absolute inset-0 w-full h-full pointer-events-none" />
        {rows.map(row => {
          const rgb = heatRgb(row.value, maxAbs);
          const pct = heatMagnitude(row.value, maxAbs) * 100;
          const tags = tagsFor(row.strike, levels);
          const active = focusPrice != null && Math.abs(focusPrice - row.strike) < 1e-9;
          const named = tags.map(t => t.text).join('·');
          const label = `${fmtStrike(row.strike)}, ${fmtUsd(row.value)}${named ? ` — ${named}` : ''}`;

          const body = (
            <>
              <span
                className="shrink-0 flex items-center font-mono text-[7px] font-bold leading-none"
                style={{ width: `${tagLen}ch` }}
              >
                {tags.map((t, ti) => (
                  <span key={t.text} className={t.ink}>
                    {ti > 0 && <span className="text-textMuted">·</span>}
                    {t.text}
                  </span>
                ))}
              </span>
              {/* THE BAR HAS ITS OWN LANE, and that is a contrast fix, not a
                  layout preference. Drawn across the full row it ran under the
                  price, and the price is the one thing in this column that must
                  be readable: measured over the platinum pole the strike text
                  came out at 1.27:1, which is not text, it is texture. The
                  price and the tags now sit on the bare surface at 7.85:1 and
                  the bar takes whatever width is left — no fixed lane widths,
                  so a 7-character index strike shortens the bar instead of
                  truncating the number.

                  It grows from the chart's side, so it reads as size reaching
                  out of the tape rather than as a bar chart pinned to an axis.
                  The transition is on width ALONE — animating the colour too
                  made quiet rows strobe on every tick, and animating POSITION
                  would make the whole column swim behind the candles on every
                  autoscale re-fit. The chart tweens level prices; this is the
                  coordinate side and it has to be exact and instant. */}
              <span className="relative flex-1 min-w-0 self-stretch my-px">
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-[2px] transition-[width] duration-700"
                  style={{ width: `${pct.toFixed(1)}%`, backgroundColor: `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${BAR_ALPHA})` }}
                />
              </span>
              {/* `data-strike-label` so the placement pass can measure the lane
                  the rule badges have to clear. A hook rather than a class
                  selector, for the same reason `data-badge` is one: a restyle
                  must not silently move a badge back onto a number. */}
              <span
                data-strike-label=""
                className={`shrink-0 text-right font-mono text-[10px] font-semibold tnum ${
                  active ? 'text-select' : 'text-textSecondary'
                }`}
                style={{ width: `${priceLen}ch` }}
              >
                {fmtStrike(row.strike)}
              </span>
            </>
          );

          /* Positioned entirely by the frame loop — no `top`, no inline
             transform from React, so a re-render on the next tick cannot
             clobber a coordinate React does not know about. Height rides a
             CSS var for the same reason. */
          const cls =
            'absolute inset-x-0 h-[var(--row-h,13px)] flex items-center gap-1 px-1.5 overflow-hidden ' +
            (active ? 'bg-select/10' : '');

          /*
            BORN HIDDEN, revealed by the frame loop that places it.

            A row's y lives in an inline transform the loop writes — React
            never knows it. So when the chain recentres and a NEW strike
            enters the set, React commits its element with NO transform, and
            for the gap between that commit and the restarted loop's first
            rAF tick the row is painted at the track's TOP, hundreds of px
            from its price. One frame, invisible to a 60ms poll — which is
            why a minute of polling for it found nothing — and caught twice
            by the sweep's alignment check at its natural rate (~1 in 8
            runs: "a row sits 211.9px from its price").

            `place` clears the display; `drop` sets it. The loop owns
            visibility completely, so the one state React can create — a row
            that exists but has not been placed — no longer paints.
          */
          const born = { display: 'none' as const };

          /* A row is only a control when clicking it does something. Rendering
             a button either way would put a tab stop on every row of a column
             that cannot be actioned. */
          return onSelect ? (
            <button
              key={row.strike}
              type="button"
              data-strike={row.strike}
              data-tag={tags.length ? '1' : '0'}
              onClick={() => onSelect(row.strike)}
              aria-pressed={active}
              aria-label={`Flash ${label} on the chart`}
              title={label}
              className={`${cls} text-left hover:bg-white/[0.05] transition-colors`}
              style={born}
            >
              {body}
            </button>
          ) : (
            <div
              key={row.strike}
              data-strike={row.strike}
              data-tag={tags.length ? '1' : '0'}
              className={cls}
              title={label}
              style={born}
            >
              {body}
            </div>
          );
        })}

        <Rule ticker={ticker} price={levels.spot} tone="spot" />
        <Rule ticker={ticker} price={levels.flip} tone="flip" />

        <Stub dir="up" onGo={() => {
          const k = stubTargets.current.up;
          if (k != null) onSelectRef.current?.(k);
        }} />
        <Stub dir="down" onGo={() => {
          const k = stubTargets.current.down;
          if (k != null) onSelectRef.current?.(k);
        }} />
      </div>
    </div>
  );
};

/** Spot and the flip cut ACROSS the column — they are prices, not strikes. */
const Rule = ({ ticker, price, tone }: { ticker: string; price: number; tone: 'spot' | 'flip' }) => {
  const spot = tone === 'spot';
  return (
    <div
      data-rule={tone}
      data-price={price}
      className="absolute inset-x-0 h-[14px] flex items-center select-none pointer-events-none"
      aria-label={`${ticker} ${spot ? 'spot' : 'gamma flip'} ${price.toFixed(2)}`}
    >
      <span
        aria-hidden
        className={`absolute inset-x-0 top-1/2 h-px ${spot ? 'bg-textPrimary/60' : 'bg-flip/60'}`}
        style={spot ? undefined : { backgroundImage: 'repeating-linear-gradient(to right,#7DD3FC 0 3px,transparent 3px 6px)' }}
      />
      {/* `data-badge` so the placement pass can step this aside when the two
          rules land on top of each other — a stable hook rather than a class
          selector that a restyle would silently break. */}
      <span
        data-badge=""
        className={`relative ml-auto mr-1 rounded-[2px] px-1 font-mono text-[8px] font-bold tnum leading-[10px] ${
          spot ? 'bg-textPrimary text-[#0a0a0a]' : 'bg-flip text-[#0a0a0a]'
        }`}
      >
        {price.toFixed(2)}
      </span>
    </div>
  );
};

/** How many strikes are sitting off the top or the bottom of the plot, and a
    way back to the nearest of them. A count that cannot be acted on would just
    be an apology.

    The ▲ badge sits BELOW the caption row (`top-5`), not on it. At `top-0` it
    printed over the word STRIKE and over the close × — and, being a later
    sibling at the same z, it took the ×'s hit target with it: a real click at
    the ×'s own centre flashed strike 514 instead of hiding the rail. Its lane
    is the lower half of HEAD_BAND, which no row is placed in. */
const Stub = ({ dir, onGo }: { dir: 'up' | 'down'; onGo: () => void }) => (
  <button
    type="button"
    data-stub={dir}
    onClick={onGo}
    aria-label={`${dir === 'up' ? 'Above' : 'Below'} the chart — flash the nearest of them`}
    title={`Strikes ${dir === 'up' ? 'above' : 'below'} what the chart is showing — click for the nearest`}
    className={`absolute right-1 z-10 inline-flex items-center gap-0.5 rounded px-1 font-mono text-[8px] font-bold leading-[12px] text-textMuted bg-canvas/70 hover:text-textPrimary transition-colors ${
      dir === 'up' ? 'top-5' : 'bottom-0'
    }`}
  >
    <span aria-hidden>{dir === 'up' ? '▲' : '▼'}</span>
    <span data-count>0</span>
  </button>
);

export default PaneLadder;
