import { useMemo, useState } from 'react';
import EmptyState from '../ui/EmptyState';
import HoverReadout from '../ui/HoverReadout';
import SignalBadge from '../ui/SignalBadge';
import { ROW_INTERACTIVE, interactiveRowProps } from '../ui/interactiveRow';
import { fmtUsd } from '../../data/gex';
import { buildDarkPoolProfile, type ProfileBin } from './darkPoolProfile';
import type { DarkPoolLevel, DarkPoolPrint, LevelRole } from '../../types/darkpool';
import type { Tone } from '../ui/tones';

/*
==================================================
  SLAYER TERMINAL - DARK-POOL LADDER
  (flowdesk/DarkPoolLadder.tsx)

  WHERE THE SIZE CROSSED. Off-exchange dollars against the
  price axis, with the tracked shelves labelled on it and
  spot drawn where it actually sits.

  WHY THIS IS THE HERO AND THE TABLE IS NOT. The desk's
  question is "at what price is the size going through" —
  and that is a shape, not a list. The page used to open on
  240 rows of prints and put the shelf ladder four screens
  down, so the reader had to hold thirty prices in their head
  to see a cluster the eye finds instantly. Same correction
  the Pinpoint gamma desk got, for the same reason.

  BAR LENGTH IS MEASURED, LABELS ARE INFERRED. Length is
  dollars at a price — two fields the consolidated tape
  genuinely reports. SUPPORT / RESISTANCE / PIVOT is the
  engine's judgement about which peaks matter, so it rides
  on the bar as a label rather than setting its length, and
  it is the only thing here wearing a colour that means
  something directional.

  EQUAL ROWS ARE PROPORTIONAL. Every bin spans the same
  price width (see darkPoolProfile.ts), which is what lets
  thirty equal-height rows be a true price axis rather than
  a ranked list wearing one.
==================================================
*/

const roleTone: Record<LevelRole, Tone> = {
  SUPPORT: 'bull',
  RESISTANCE: 'bear',
  PIVOT: 'neutral',
};

/** The shelf rail's colour. Kept beside roleTone so the badge and the rail can
    never drift apart on one shelf. */
const roleRail: Record<LevelRole, string> = {
  SUPPORT: 'bg-bull',
  RESISTANCE: 'bg-bear',
  PIVOT: 'bg-textMuted',
};

interface DarkPoolLadderProps {
  ticker: string;
  spot: number;
  prints: DarkPoolPrint[];
  levels: DarkPoolLevel[];
  /** Shelf pinned by click — drives the read panel beside the ladder. */
  selectedPrice: number | null;
  onSelectShelf: (price: number) => void;
}

/** Thirty bands over the session's printed range. Enough to separate two shelves
    a dollar apart on a $500 name, few enough that a band is 16px tall in the
    panel's natural height rather than a hairline. */
const BINS = 30;

const DarkPoolLadder = ({
  ticker,
  spot,
  prints,
  levels,
  selectedPrice,
  onSelectShelf,
}: DarkPoolLadderProps) => {
  const profile = useMemo(
    () => buildDarkPoolProfile(prints, levels, spot, BINS),
    [prints, levels, spot]
  );
  const [hover, setHover] = useState<{ bin: ProfileBin; x: number; y: number } | null>(null);

  /*
    Label precision follows the axis, not a hardcoded 2dp. A profile cut at $0.50
    steps prints 497.50; one cut at $5 on a four-figure index prints 5,840 rather
    than 5,840.00 and a column of trailing zeroes. `step` is published by the
    model precisely so the axis and its labels cannot disagree about resolution.
  */
  const dp = profile.step >= 1 ? 0 : profile.step >= 0.1 ? 1 : 2;
  const priceLabel = (v: number) =>
    v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

  if (!profile.bins.length) {
    return (
      <EmptyState
        title="Nothing crossed off-exchange"
        body="No block prints this session, so there is no price profile to draw."
      />
    );
  }

  return (
    <div className="relative">
      <div className="flex flex-col">
        {profile.bins.map(bin => {
          const shelf = bin.shelf;
          const pct = profile.max ? (bin.notional / profile.max) * 100 : 0;
          const isSelected = shelf != null && shelf.price === selectedPrice;

          const row = (
            <>
              {/* Price gutter — the band's LOW edge, which is a round price on
                  the snapped axis. Centres were tried and read as noise: 500.97,
                  500.80, 500.63 are artefacts of the bin count, not prices any
                  print or shelf can be matched against by eye. */}
              <span className="w-[52px] sm:w-[68px] shrink-0 font-mono text-label tnum text-textMuted text-right leading-4">
                {priceLabel(bin.lo)}
              </span>

              {/* The bar. `min-w` only when there is anything to draw — a floor on
                  an empty band would paint dollars that did not cross. */}
              <span className="relative flex-1 h-[9px] rounded-sm bg-white/[0.035] overflow-hidden">
                {bin.notional > 0 && (
                  <span
                    className={`absolute inset-y-0 left-0 rounded-sm ${
                      shelf ? 'bg-darkpool/85' : 'bg-darkpool/40'
                    }`}
                    style={{ width: `${Math.max(1.5, pct)}%` }}
                  />
                )}
              </span>

              {/* Shelf rail + label. Only bands the engine tracks carry one, so
                  the column reads as "these are the prices that matter" rather
                  than repeating every band's own price back at it. */}
              <span className="w-[112px] sm:w-[172px] shrink-0 flex items-center gap-2">
                {shelf ? (
                  <>
                    <span className={`h-[9px] w-[3px] rounded-full shrink-0 ${roleRail[shelf.role]}`} />
                    <span className="font-mono text-label font-semibold tnum text-textPrimary leading-4">
                      ${shelf.price.toFixed(2)}
                    </span>
                    {/* The word goes on a phone, the colour stays. RESISTANCE is
                        ten characters of uppercase badge and there is no width
                        for it beside a price in a 112px rail — it overflowed the
                        viewport at 390 rather than truncating, because a badge
                        has no text run to ellipsise. The rail beside the price
                        already carries the role, and the panel below names it in
                        full for whichever shelf is selected. */}
                    <span className="hidden sm:inline-flex">
                      <SignalBadge tone={roleTone[shelf.role]}>{shelf.role}</SignalBadge>
                    </span>
                  </>
                ) : (
                  /* Only the peaks. Printing a figure beside all thirty bands
                     turned the rail into a second, unsorted copy of the chart and
                     drowned the five labels that are the point of it. A band
                     clearing 40% of the session's tallest is worth naming even
                     without a shelf on it; the rest are one hover away. */
                  pct >= 40 && (
                    <span className="font-mono text-micro tnum text-textMuted leading-3">
                      {fmtUsd(bin.notional)}
                    </span>
                  )
                )}
              </span>
            </>
          );

          const common = {
            onMouseEnter: (e: React.MouseEvent) => setHover({ bin, x: e.clientX, y: e.clientY }),
            onMouseMove: (e: React.MouseEvent) => setHover({ bin, x: e.clientX, y: e.clientY }),
            onMouseLeave: () => setHover(h => (h && h.bin.mid === bin.mid ? null : h)),
          };

          /* A band with a shelf is a control; a band without one is a reading.
             Making every band focusable would put thirty tab stops in front of
             the tape for twenty-odd rows that do nothing when activated. */
          /* tabIndex, role, aria-current and Enter/Space all come from the house
             helper. Selection travels as `aria-current`, never `aria-selected`
             or `aria-pressed`: see interactiveRow.ts, which records the 143 axe
             criticals the wrong attribute produced across four desks. */
          return shelf ? (
            <div
              key={bin.mid}
              {...common}
              {...interactiveRowProps(() => onSelectShelf(shelf.price), isSelected)}
              aria-label={`Shelf at $${shelf.price.toFixed(2)}, ${shelf.role.toLowerCase()}, ${fmtUsd(bin.notional)} crossed`}
              onClick={() => onSelectShelf(shelf.price)}
              className={`${ROW_INTERACTIVE} flex items-center gap-3 px-4 py-1 ${
                isSelected ? 'bg-select/[0.05] rail-select' : 'hover:bg-rowHover'
              }`}
            >
              {row}
            </div>
          ) : (
            <div key={bin.mid} {...common} className="flex items-center gap-3 px-4 py-1">
              {row}
            </div>
          );
        })}
      </div>

      {/*
        Spot, drawn at its true height rather than dropped between two rows.

        THE PILL SITS IN THE PRICE GUTTER, on the left, which is where a chart's
        price axis lives and — more practically — is the one column that carries
        no shelf label. It used to sit on the right and landed on top of whatever
        shelf or figure shared its band; on a session whose spot is near an
        extreme, that is guaranteed rather than unlucky.

        `pointer-events-none` matters: the rule spans the full plot, and a band it
        crosses would otherwise stop answering the pointer along that line — the
        one band a reader is most likely to aim at.
      */}
      <div
        className="absolute inset-x-0 flex items-center gap-3 pointer-events-none px-4 -translate-y-1/2"
        style={{ top: `${profile.spotFrac * 100}%` }}
      >
        <span className="w-[52px] sm:w-[68px] shrink-0 flex justify-end">
          <span
            className="inline-flex items-center rounded-[3px] bg-textPrimary px-1.5 py-px font-mono text-micro font-bold tnum text-ink"
            aria-label={`${ticker} spot ${spot.toFixed(2)}`}
          >
            {spot.toFixed(2)}
          </span>
        </span>
        {/* DASHED, not solid. A 1px solid rule at any opacity that clears the
            band tracks it crosses still reads as one of them — the tracks are
            the same weight and the same neutral. A dash reads as an overlay at
            a glance, which is the standard current-price idiom for exactly this
            reason, and it survives landing on a filled bar as well as an empty
            track. */}
        <span
          className="h-px flex-1"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to right, rgba(237,237,237,0.85) 0 5px, rgba(237,237,237,0) 5px 10px)',
          }}
        />
        <span className="w-[112px] sm:w-[172px] shrink-0" />
      </div>

      {hover && (
        <HoverReadout x={hover.x} y={hover.y}>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-caption font-bold tnum text-textPrimary">
              ${hover.bin.lo.toFixed(2)}–${hover.bin.hi.toFixed(2)}
            </span>
            {hover.bin.shelf && (
              <SignalBadge tone={roleTone[hover.bin.shelf.role]}>{hover.bin.shelf.role}</SignalBadge>
            )}
          </div>
          {hover.bin.prints === 0 ? (
            <div className="mt-0.5 font-mono text-micro text-textMuted">Nothing crossed in this band</div>
          ) : (
            <div className="mt-0.5 flex items-baseline gap-3 font-mono text-micro uppercase tracking-wider text-textMuted">
              <span>
                Crossed <span className="text-textPrimary tnum">{fmtUsd(hover.bin.notional)}</span>
              </span>
              <span>
                Prints <span className="text-textPrimary tnum">{hover.bin.prints}</span>
              </span>
              <span>
                Session{' '}
                <span className="text-textPrimary tnum">
                  {((hover.bin.notional / (profile.total || 1)) * 100).toFixed(1)}%
                </span>
              </span>
            </div>
          )}
          {hover.bin.shelf && hover.bin.shelf.defended > 0 && (
            <div className="mt-0.5 font-mono text-micro text-flip">
              {hover.bin.shelf.defended >= 5 ? '5+ retests held' : `${hover.bin.shelf.defended}× retest held`}
            </div>
          )}
        </HoverReadout>
      )}
    </div>
  );
};

export default DarkPoolLadder;
