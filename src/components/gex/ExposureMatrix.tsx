import { Fragment } from 'react';
import { fmtUsd } from '../../data/gex';
import SpotRule from '../ui/SpotRule';
import type { ExposureProfileData, GreekSplit } from '../../types/gex';

interface ExposureMatrixProps {
  data: ExposureProfileData;
  /** Strike currently hovered in either panel (synced highlight) */
  hoverStrike?: number | null;
  /** Strike pinned by click — cyan selection language */
  selectedStrike?: number | null;
  onHoverStrike?: (strike: number | null) => void;
  onSelectStrike?: (strike: number) => void;
}

type Leg = 'put' | 'call' | 'net';

// Puts/calls carry side tints; NET wears its own magenta identity so the
// column the eye should land on is unmistakable at speed.
const NET_BAR = 'rgba(234,0,255,0.8)';

const legBar = (leg: Leg): string => {
  if (leg === 'put') return 'rgba(255,59,48,0.7)';
  if (leg === 'call') return 'rgba(48,209,88,0.85)';
  return NET_BAR;
};

const Cell = ({ split, leg, maxAbs }: { split: GreekSplit; leg: Leg; maxAbs: number }) => {
  const value = split[leg];
  const pct = Math.min(100, (Math.abs(value) / (maxAbs || 1)) * 100);
  return (
    <td className="px-2 py-1 text-right align-middle">
      <span className={`block font-mono text-label tnum ${leg === 'net' ? 'text-textPrimary font-semibold' : 'text-textPrimary'}`}>
        {fmtUsd(value)}
      </span>
      <span className="mt-0.5 ml-auto block h-[3px] w-full max-w-[52px] rounded-full bg-white/[0.04]">
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct}%`, background: legBar(leg) }}
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
    <div tabIndex={0} role="region" aria-label="Exposure matrix — scrollable" className="overflow-auto h-full min-h-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/50">
      {/* min-width so the 10-column greek matrix scrolls on a phone instead of
          squeezing every value until the DEX column clips. */}
      <table className="w-full min-w-[560px] border-collapse">
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
            <th className="border-b border-borderSubtle" />
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
                className={`border-b border-borderSubtle/30 transition-colors ${row.pin ? 'bg-white/[0.03]' : ''} ${
                  onSelectStrike ? 'cursor-pointer' : ''
                } ${
                  selectedStrike === row.strike
                    ? 'bg-select/[0.05] rail-silver'
                    : hoverStrike === row.strike
                      ? 'bg-white/[0.04]'
                      : ''
                }`}
              >
                <td className="px-2 py-1 bg-inset border-r border-borderSubtle/40 font-mono text-micro font-semibold tnum text-textSecondary whitespace-nowrap">
                  {row.strike % 1 === 0 ? row.strike.toFixed(0) : row.strike.toFixed(2)}
                  {row.pin && (
                    <span className="ml-1.5 font-mono text-micro font-bold uppercase tracking-wider text-textPrimary">
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
