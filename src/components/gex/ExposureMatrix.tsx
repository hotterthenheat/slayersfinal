import { Fragment, useState, type MouseEvent, type ReactNode } from 'react';
import { ROW_INTERACTIVE, interactiveRowProps } from '../ui/interactiveRow';
import { fmtUsd } from '../../data/gex';
import HoverReadout from '../ui/HoverReadout';
import SignalBadge from '../ui/SignalBadge';
import SpotRule from '../ui/SpotRule';
import { BEAR, BULL, KING } from './palette';
import type { ExposureLevels, ExposureProfileData, GreekSplit, StrikeExposure } from '../../types/gex';
import type { Tone } from '../ui/tones';
import Term from '../ui/Term';

interface ExposureMatrixProps {
  data: ExposureProfileData;
  /** Strike currently hovered in either panel (synced highlight) */
  hoverStrike?: number | null;
  /** Strike pinned by click — silver selection language */
  selectedStrike?: number | null;
  onHoverStrike?: (strike: number | null) => void;
  onSelectStrike?: (strike: number) => void;
}

type Leg = 'put' | 'call' | 'net';
type GreekKey = 'gex' | 'dex' | 'vex';

// Puts/calls carry the directional inks; NET rides the standout magenta so the
// column the eye should land on is unmistakable at speed. Same ink as KING but a
// different quantity — sourced from the palette so the value cannot fork here.
const LEG_INK: Record<Leg, { color: string; opacity: number }> = {
  put: { color: BEAR, opacity: 0.7 },
  call: { color: BULL, opacity: 0.85 },
  net: { color: KING, opacity: 0.8 },
};

const GROUPS: { key: GreekKey; label: ReactNode; unit: string }[] = [
  { key: 'gex', label: <Term k="GEX">GEX</Term>, unit: '1% move' },
  { key: 'dex', label: <Term k="DEX">DEX</Term>, unit: 'Δ notional' },
  { key: 'vex', label: <Term k="VEX">VEX</Term>, unit: '1% vol' },
];

const fmtStrike = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));

const Cell = ({
  split,
  leg,
  maxAbs,
  onCursor,
}: {
  split: GreekSplit;
  leg: Leg;
  maxAbs: number;
  onCursor: (e: MouseEvent) => void;
}) => {
  const value = split[leg];
  const pct = Math.min(100, (Math.abs(value) / (maxAbs || 1)) * 100);
  const ink = LEG_INK[leg];
  return (
    <td className="px-2 py-1 text-right align-middle" onMouseMove={onCursor}>
      <span className={`block font-mono text-label tnum ${leg === 'net' ? 'text-textPrimary font-semibold' : 'text-textPrimary'}`}>
        {fmtUsd(value)}
      </span>
      <span className="mt-0.5 ml-auto block h-[3px] w-full max-w-[52px] rounded-full bg-white/[0.04]">
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct}%`, background: ink.color, opacity: ink.opacity }}
        />
      </span>
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
 * The strike's role, read off `levels` rather than recomputed. Deliberately the
 * same order and lexicon as the positioning map's own read-out, so hovering one
 * strike in the two panels of this desk can never return two different answers.
 */
const roleOf = (row: StrikeExposure, key: GreekKey, levels: ExposureLevels): { tone: Tone; label: string } => {
  if (row.strike === levels.king) return { tone: 'magenta', label: 'KING' };
  if (row.strike === levels.callWall) return { tone: 'bull', label: 'CALL WALL' };
  if (row.strike === levels.putWall) return { tone: 'bear', label: 'PUT WALL' };
  const callHeavy = Math.abs(row[key].call) >= Math.abs(row[key].put);
  return { tone: callHeavy ? 'bull' : 'bear', label: callHeavy ? 'CALL-HEAVY' : 'PUT-HEAVY' };
};

/**
 * What the strike's net implies for the dealer book. Gamma gets the strong read
 * because the engine itself makes it (exposure.ts writes these participles into
 * the bias note); delta and vanna get the mechanical statement out of TERMS, and
 * no hedge direction is claimed that the model does not carry.
 */
const implicationOf = (key: GreekKey, net: number): string => {
  if (key === 'gex') return `dealer ${net < 0 ? 'short' : 'long'} gamma · ${net < 0 ? 'moves amplified' : 'dips absorbed'}`;
  if (key === 'dex') return `dealer ${net < 0 ? 'short' : 'long'} delta notional here`;
  return `1% vol ${net < 0 ? 'removes' : 'adds'} ${fmtUsd(Math.abs(net))} of dealer delta`;
};

/**
 * Ten numbers in a row read as ten numbers unless something names them, and a
 * screen reader announcing cell-by-cell has already lost which greek and which
 * leg it is inside. Signs are spelled out: fmtUsd formats with U+2212, which is
 * not reliably announced as minus.
 */
const rowLabel = (row: StrikeExposure, levels: ExposureLevels): string => {
  const tags: string[] = [];
  if (row.pin) tags.push('pin');
  if (row.strike === levels.callWall) tags.push('call wall');
  if (row.strike === levels.putWall) tags.push('put wall');
  if (row.strike === levels.king) tags.push('largest exposure');
  const nets = GROUPS.map(
    g => `net ${g.key} ${row[g.key].net < 0 ? 'negative' : 'positive'} ${fmtUsd(Math.abs(row[g.key].net))}`
  ).join(', ');
  return `Strike ${fmtStrike(row.strike)}, ${nets}${tags.length ? `, ${tags.join(', ')}` : ''}`;
};

/** The floating per-cell read-out: which strike, which greek, which leg, and
    what the strike's net does to the book. Every figure is the cell's own. */
const CellReadout = ({
  row,
  group,
  leg,
  levels,
  maxAbs,
}: {
  row: StrikeExposure;
  group: (typeof GROUPS)[number];
  leg: Leg;
  levels: ExposureLevels;
  maxAbs: number;
}) => {
  const split = row[group.key];
  const value = split[leg];
  const bps = Math.round(((row.strike - levels.spot) / levels.spot) * 10000);
  const share = Math.round((Math.abs(value) / (maxAbs || 1)) * 100);
  const role = roleOf(row, group.key, levels);
  const greek = group.key.toUpperCase();

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-label font-bold text-textPrimary tnum">
          Strike {fmtStrike(row.strike)}
          {row.pin && (
            <span className="ml-1.5 font-mono text-micro font-bold uppercase tracking-wider text-textSecondary">pin</span>
          )}
        </span>
        <SignalBadge tone={role.tone}>{role.label}</SignalBadge>
      </div>
      <div className="mt-0.5 font-mono text-micro uppercase tracking-wider text-textMuted tnum">
        {bps >= 0 ? '+' : ''}
        {bps} bps vs spot {fmtStrike(levels.spot)}
      </div>

      <div className="mt-2">
        <div className="font-mono text-micro uppercase tracking-widest text-textMuted">
          {greek} {leg} · {group.unit}
        </div>
        <div className="font-mono text-base font-bold tnum text-textPrimary">{fmtUsd(value)}</div>
        <div className="font-mono text-micro uppercase tracking-wider text-textSecondary tnum">
          {share}% of the largest {greek} value in this window
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-borderSubtle/60 flex items-center gap-3 font-mono text-micro uppercase tracking-wider text-textMuted tnum">
        <span>
          P <span className="text-bear">{fmtUsd(split.put)}</span>
        </span>
        <span>
          C <span className="text-bull">{fmtUsd(split.call)}</span>
        </span>
        <span>
          Net <span className="text-textPrimary">{fmtUsd(split.net)}</span>
        </span>
      </div>
      <div className="mt-1 font-mono text-micro uppercase tracking-wider text-textSecondary">
        {implicationOf(group.key, split.net)}
      </div>
    </>
  );
};

/**
 * Strike × greek exposure table: GEX / DEX / VEX, each split put · call · net,
 * with magnitude bars per cell. Spot marker embeds between strikes; the pin
 * strike is flagged in the rail.
 *
 * The cursor read-out is local state, not a callback, because the Pulse tile
 * mounts this with no handlers at all — and it goes through HoverReadout, which
 * portals to <body>, so the card clears both this panel's scroll clip and the
 * workspace's CSS-transformed tiles.
 */
const ExposureMatrix = ({ data, hoverStrike, selectedStrike, onHoverStrike, onSelectStrike }: ExposureMatrixProps) => {
  const { ticker, strikes, maxAbs, spotAfterIndex, levels } = data;
  const [hover, setHover] = useState<{
    row: StrikeExposure;
    group: (typeof GROUPS)[number];
    leg: Leg;
    x: number;
    y: number;
  } | null>(null);

  return (
    <div
      tabIndex={0}
      role="group"
      aria-label="Exposure matrix, scrollable"
      onMouseLeave={() => setHover(null)}
      className="overflow-auto h-full min-h-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"
    >
      {/* min-width so the 10-column greek matrix scrolls on a phone instead of
          squeezing every value until the DEX column clips.

          The capture-phase clear runs before any cell's own handler, so crossing
          the sticky header or a spot rule drops the read-out instead of leaving
          the last cell's numbers floating over a row they do not belong to. */}
      <table className="w-full min-w-[560px] border-collapse" onMouseMoveCapture={() => setHover(null)}>
        <thead className="sticky top-0 z-10">
          <tr className="bg-panelRaised">
            <th className="px-2 py-1.5 text-left font-mono text-micro font-semibold uppercase tracking-widest text-textSecondary border-b border-borderSubtle">
              Strike
            </th>
            {GROUPS.map(g => (
              <th
                key={g.key}
                colSpan={3}
                className="px-2 py-1.5 text-center font-mono text-micro font-bold uppercase tracking-widest text-textPrimary border-b border-l border-borderSubtle"
              >
                {g.label} <span className="text-textSecondary font-medium normal-case">· {g.unit}</span>
              </th>
            ))}
          </tr>
          <tr className="bg-panelRaised">
            {/* The strike column's second header cell. It reads empty on
                screen because "Strike" is already spanned above it, but a
                header with no name at all is a column with no name. */}
            <th className="border-b border-borderSubtle">
              <span className="sr-only">Strike</span>
            </th>
            {GROUPS.map(g =>
              (['put', 'call', 'net'] as Leg[]).map(leg => (
                <th
                  key={`${g.key}-${leg}`}
                  className={`px-2 py-1 text-right font-mono text-micro font-semibold uppercase tracking-widest text-textSecondary border-b border-borderSubtle ${
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
                {...(onSelectStrike
                  ? {
                      ...interactiveRowProps(() => onSelectStrike(row.strike), selectedStrike === row.strike, 'native'),
                      'aria-label': rowLabel(row, levels),
                    }
                  : {})}
                className={`border-b border-borderSubtle/30 transition-colors ${row.pin ? 'bg-white/[0.03]' : ''} ${
                  onSelectStrike ? ROW_INTERACTIVE : ''
                } ${
                  selectedStrike === row.strike
                    ? 'inst-selected'
                    : hoverStrike === row.strike
                      ? 'bg-white/[0.04]'
                      : ''
                }`}
              >
                <td className="px-2 py-1 bg-inset border-r border-borderSubtle/40 font-mono text-micro font-semibold tnum text-textSecondary whitespace-nowrap">
                  {fmtStrike(row.strike)}
                  {row.pin && (
                    <span
                      title="Pin: max open-interest strike"
                      className="ml-1.5 font-mono text-micro font-bold uppercase tracking-wider text-textPrimary"
                    >
                      pin
                    </span>
                  )}
                </td>
                {GROUPS.map(g =>
                  (['put', 'call', 'net'] as Leg[]).map(leg => (
                    <Cell
                      key={`${g.key}-${leg}`}
                      split={row[g.key]}
                      leg={leg}
                      maxAbs={maxAbs[g.key]}
                      onCursor={e => setHover({ row, group: g, leg, x: e.clientX, y: e.clientY })}
                    />
                  ))
                )}
              </tr>
              {i === spotAfterIndex && <SpotRow ticker={ticker} spot={levels.spot} />}
            </Fragment>
          ))}
        </tbody>
      </table>

      {hover && (
        <HoverReadout x={hover.x} y={hover.y}>
          <CellReadout
            row={hover.row}
            group={hover.group}
            leg={hover.leg}
            levels={levels}
            maxAbs={maxAbs[hover.group.key]}
          />
        </HoverReadout>
      )}
    </div>
  );
};

export default ExposureMatrix;
