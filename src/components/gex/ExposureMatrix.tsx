import { Fragment, useEffect, useRef, useState } from 'react';
import HeatPill from './HeatPill';
import { heatMagnitude, heatRgb } from './heatmap';
import { fmtUsd } from '../../data/gex';
import SpotRule from '../ui/SpotRule';
import type { ExposureProfileData, GreekSplit } from '../../types/gex';

interface ExposureMatrixProps {
  data: ExposureProfileData;
  /** Strike currently hovered in either panel (synced highlight) */
  hoverStrike?: number | null;
  /** Strike pinned by click — white "where you are" ink, shared with the map */
  selectedStrike?: number | null;
  onHoverStrike?: (strike: number | null) => void;
  onSelectStrike?: (strike: number) => void;
}

type Leg = 'put' | 'call' | 'net';

// Puts/calls carry side tints; NET wears its own magenta identity so the
// column the eye should land on is unmistakable at speed.
const NET_BAR = 'rgba(234,0,255,0.8)';

/*
  ONE CAPSULE PER CELL, on the house heat ramp.

  Two things changed and both were wrong before.

  THE FORM: a number with a 3px bar beneath it spends two lines saying one
  thing, and the bar was capped at 52px so the widest cells all bottomed out
  together. The capsule carries the value in its fill and prints it inside, so
  a row is read at a glance and still says its exact number.

  THE COLOUR: the legs were painted `rgba(255,59,48)` and `rgba(48,209,88)` —
  red and green, which in this product is PRICE DIRECTION. Put and call
  dominance is dealer side, and dealer side is gold and steel. That collision
  is exactly what `docs/dealer-ink-pass.md` was written about, and the leg's own
  column header already says which leg it is, so the colour was carrying a
  meaning it did not need to and could not have.
*/
/*
==================================================
  THE PILLS CAME OFF THE PUT AND CALL COLUMNS
  (2026-09-05, the Pinpoint redesign)
==================================================

  Noah: "pinpoint it's very ugly rn." This table was the loudest thing on
  the section and the reason is countable: nine value columns — GEX, DEX
  and VEX each split put · call · net — times twenty-two strikes is 198
  filled capsules in one panel. Every cell painted, every cell the same
  shape, every cell the same weight. There is no hierarchy in a quilt, and
  a reader looking for the number that answers the question had nothing to
  land on.

  HeatPill's own argument is sound and is NOT being overturned. It says a
  capsule with air around it is a COUNTABLE object where a tiled row reads
  as one continuous band — and that is true, at the scale it was written
  for: GexMatrix draws one strike across five expiries, five capsules to a
  row, and they do read as five things.

  The argument inverts somewhere between five and nine. Past that the
  capsules stop being objects you count and become texture you look
  through, which is exactly what this panel had become.

  ── WHAT THE HIERARCHY IS ────────────────────────────────────────────────

  PUT AND CALL ARE INPUTS. NET IS THE ANSWER. That is the whole structure
  of this table and nothing on screen said so. So net keeps the capsule —
  it is the figure a reader is actually here for, one per greek per row,
  66 of them rather than 198 — and put and call become plain right-aligned
  figures with a two-pixel heat rule under them.

  NOTHING IS LOST. The underline carries the same colour off the same ramp
  and the same gamma-curved length as the capsule's fill did, so magnitude
  and pole are still both readable at a glance; what goes is the block of
  colour behind the digits, which was costing legibility to say something
  the underline says more quietly.
*/
const Cell = ({ split, leg, maxAbs }: { split: GreekSplit; leg: Leg; maxAbs: number }) => {
  const value = split[leg];

  if (leg === 'net') {
    return (
      <td className="px-[3px] py-[2px]">
        <HeatPill value={value} maxAbs={maxAbs} className="h-[19px] font-bold" title={`net · ${fmtUsd(value)}`}>
          {fmtUsd(value)}
        </HeatPill>
      </td>
    );
  }

  const [r, g, b] = heatRgb(value, maxAbs);
  /* The rule never disappears entirely: a strike carrying almost nothing is
     a fact, and a cell whose underline vanished would read as a cell with no
     data rather than as a quiet one. Floored at a tenth of the lane. */
  const width = Math.max(0.1, heatMagnitude(value, maxAbs));
  return (
    <td className="px-[3px] py-[2px]" title={`${leg} · ${fmtUsd(value)}`}>
      <div className="flex h-[19px] flex-col justify-center gap-[4px]">
        <span className="block text-right font-mono text-[10px] tnum leading-none text-textSecondary">
          {fmtUsd(value)}
        </span>
        {/*
          THE TRACK IS VISIBLE ON PURPOSE, and it is the whole reason this
          does not read as a text underline.

          On this desk an underline already MEANS something: `Term` marks
          every glossary word with one, so a rule under a figure would
          invite a hover that never comes. What separates a meter from an
          underline is that a meter shows the lane it has not filled — plus
          a solid colour where Term's is dotted grey, and 4px of air where
          Term's sits on the baseline.

          Right-anchored, like the digits above it: a bar growing from the
          left under a right-aligned number makes the two disagree about
          where the value is.
        */}
        <span className="block h-[2px] w-full overflow-hidden rounded-full bg-white/[0.07]">
          <span
            className="ml-auto block h-full rounded-full"
            style={{ width: `${(width * 100).toFixed(1)}%`, backgroundColor: `rgb(${r},${g},${b})` }}
          />
        </span>
      </div>
    </td>
  );
};

const SpotRow = ({ ticker, spot }: { ticker: string; spot: number }) => (
  <tr>
    <td colSpan={10} className="px-2 py-1">
      <SpotRule ticker={ticker} price={spot} />
    </td>
  </tr>
);

/**
 * Strike × greek exposure table: GEX / DEX / VEX, each split put · call · net,
 * with magnitude bars per cell. Spot marker embeds between strikes; the pin
 * strike is flagged in the rail.
 */
/*
  THE THREE GREEK GROUPS, and how many of them the box can actually hold.

  Ten columns of currency — the strike, then GEX, DEX and VEX each split
  put · call · net — need about 69px each to print a figure like `-$288.4K`
  without touching its neighbour. That is 691px, and this table lives in the
  5-of-12 slot on the exposure desk:

    viewport 1280  ->  502px  needs 691  VEX entirely off the right edge
    viewport 1440  ->  569px  needs 691  VEX entirely off the right edge
    viewport 1760  ->  fits

  It has always been `overflow-auto`, so nothing was unreachable in principle.
  In practice a desktop scrollbar is invisible until you scroll, so the reader
  saw a table that simply stopped after DEX, with no sign a third of it was
  further right — and the header promised `GEX · DEX · VEX` above a body that
  showed two of them.

  So the table now asks how wide it is and shows the groups that FIT. What does
  not fit is not hidden: the chips above name every group and say which are on,
  so the reader can trade one for another instead of discovering the loss.
*/
const ALL_GROUPS: { key: 'gex' | 'dex' | 'vex'; label: string; unit: string }[] = [
  { key: 'gex', label: 'GEX', unit: '1% move' },
  { key: 'dex', label: 'DEX', unit: '1σ move' },
  { key: 'vex', label: 'VEX', unit: '1% vol' },
];

/** Per-column room a currency figure needs before columns start colliding. */
const COL_PX = 69;
/** How many groups fit in `w`, given the strike column takes one column too. */
const groupsThatFit = (w: number): number => {
  if (w <= 0) return ALL_GROUPS.length; // pre-measurement: assume the desk is wide
  return Math.max(1, Math.min(ALL_GROUPS.length, Math.floor((w / COL_PX - 1) / 3)));
};

const ExposureMatrix = ({ data, hoverStrike, selectedStrike, onHoverStrike, onSelectStrike }: ExposureMatrixProps) => {
  const { ticker, strikes, maxAbs, spotAfterIndex, levels } = data;

  const boxRef = useRef<HTMLDivElement | null>(null);
  const [room, setRoom] = useState(0);
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const read = () => setRoom(box.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const fit = groupsThatFit(room);
  /* Which groups the reader has chosen. Null until they touch it, so the
     default follows the width instead of freezing whatever fitted on mount —
     a desk dragged wider should get VEX back without being asked. */
  const [picked, setPicked] = useState<('gex' | 'dex' | 'vex')[] | null>(null);
  const shown = picked ?? ALL_GROUPS.slice(0, fit).map(g => g.key);
  const GROUPS = ALL_GROUPS.filter(g => shown.includes(g.key));
  const hiding = GROUPS.length < ALL_GROUPS.length;

  const toggle = (key: 'gex' | 'dex' | 'vex') => {
    const on = shown.includes(key);
    if (on && shown.length === 1) return; // never leave the table with no columns
    const next = on ? shown.filter(k => k !== key) : [...shown, key];
    // Keep the reader inside what the box can draw: turning one on turns the
    // oldest one off rather than re-introducing the overflow this exists to fix.
    const capped = next.length > fit ? next.slice(next.length - fit) : next;
    setPicked(ALL_GROUPS.map(g => g.key).filter(k => capped.includes(k)));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {hiding && (
        /* Only when something is being left out. At a width that holds all
           three this row would be three lit chips saying nothing. */
        <div className="flex shrink-0 items-center gap-1 border-b border-borderSubtle px-2 py-1">
          <span className="mr-0.5 font-mono text-[9px] uppercase tracking-widest text-textMuted">Greeks</span>
          {ALL_GROUPS.map(g => {
            const on = shown.includes(g.key);
            return (
              <button
                key={g.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(g.key)}
                title={`${g.label} · ${g.unit}${on ? '' : ` — ${GROUPS.length >= fit ? 'replaces the first shown' : 'show'}`}`}
                className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-widest transition-colors ${
                  on ? 'bg-white/[0.10] text-textPrimary' : 'text-textMuted hover:text-textPrimary hover:bg-white/[0.04]'
                }`}
              >
                {g.label}
              </button>
            );
          })}
          {/* What is missing and why, in the reader's words — the first cut
              printed the raw column width here, which is a measurement the
              DEVELOPER needed once and the reader never does. */}
          <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-textMuted">
            width holds {GROUPS.length} — tap a greek to swap
          </span>
        </div>
      )}
      <div ref={boxRef} className="overflow-auto min-h-0 flex-1">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[#0c0c0c]">
            <th className="px-2 py-1.5 text-left font-mono text-[10px] font-semibold uppercase tracking-widest text-textSecondary border-b border-borderSubtle">
              Strike
            </th>
            {GROUPS.map(g => (
              <th
                key={g.key}
                colSpan={3}
                className="px-2 py-1.5 text-center font-mono text-[10px] font-bold uppercase tracking-widest text-textPrimary border-b border-l border-borderSubtle"
              >
                {g.label} <span className="text-textSecondary font-medium normal-case">· {g.unit}</span>
              </th>
            ))}
          </tr>
          <tr className="bg-[#0c0c0c]">
            <th className="border-b border-borderSubtle" />
            {GROUPS.map(g =>
              (['put', 'call', 'net'] as Leg[]).map(leg => (
                <th
                  key={`${g.key}-${leg}`}
                  className={`px-2 py-1 text-right font-mono text-[9px] font-semibold uppercase tracking-widest text-textSecondary border-b border-borderSubtle ${
                    leg === 'put' ? 'border-l' : ''
                  }`}
                >
                  {leg}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {spotAfterIndex === -0.5 && <SpotRow ticker={ticker} spot={levels.spot} />}
          {strikes.map((row, i) => (
            <Fragment key={row.strike}>
              <tr
                onMouseEnter={onHoverStrike ? () => onHoverStrike(row.strike) : undefined}
                onMouseLeave={onHoverStrike ? () => onHoverStrike(null) : undefined}
                onClick={onSelectStrike ? () => onSelectStrike(row.strike) : undefined}
                className={`border-b border-borderSubtle/30 transition-colors ${row.pin ? 'bg-white/[0.03]' : ''} ${
                  onSelectStrike ? 'cursor-pointer' : ''
                } ${
                  selectedStrike === row.strike
                    ? 'bg-white/[0.05] shadow-[inset_2px_0_0_0_rgba(237,237,237,0.7)]'
                    : hoverStrike === row.strike
                      ? 'bg-white/[0.04]'
                      : ''
                }`}
              >
                <td className="px-2 py-1 bg-inset border-r border-borderSubtle/40 font-mono text-[10px] font-semibold tnum text-textSecondary whitespace-nowrap">
                  {row.strike % 1 === 0 ? row.strike.toFixed(0) : row.strike.toFixed(2)}
                  {row.pin && (
                    <span className="ml-1.5 font-mono text-[8px] font-bold uppercase tracking-wider text-textPrimary">
                      pin
                    </span>
                  )}
                </td>
                {GROUPS.map(g =>
                  (['put', 'call', 'net'] as Leg[]).map(leg => (
                    <Cell key={`${g.key}-${leg}`} split={row[g.key]} leg={leg} maxAbs={maxAbs[g.key]} />
                  ))
                )}
              </tr>
              {i === spotAfterIndex && <SpotRow ticker={ticker} spot={levels.spot} />}
            </Fragment>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
};

export default ExposureMatrix;
