import { Fragment } from 'react';
import HeatPill from './HeatPill';
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
const Cell = ({ split, leg, maxAbs }: { split: GreekSplit; leg: Leg; maxAbs: number }) => {
  const value = split[leg];
  return (
    <td className="px-[3px] py-[2px]">
      <HeatPill
        value={value}
        maxAbs={maxAbs}
        className={`h-[19px] ${leg === 'net' ? 'font-bold' : ''}`}
        title={`${leg} · ${fmtUsd(value)}`}
      >
        {fmtUsd(value)}
      </HeatPill>
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
const ExposureMatrix = ({ data, hoverStrike, selectedStrike, onHoverStrike, onSelectStrike }: ExposureMatrixProps) => {
  const { ticker, strikes, maxAbs, spotAfterIndex, levels } = data;

  const GROUPS: { key: 'gex' | 'dex' | 'vex'; label: string; unit: string }[] = [
    { key: 'gex', label: 'GEX', unit: '1% move' },
    { key: 'dex', label: 'DEX', unit: '1σ move' },
    { key: 'vex', label: 'VEX', unit: '1% vol' },
  ];

  return (
    <div className="overflow-auto h-full min-h-0">
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
  );
};

export default ExposureMatrix;
