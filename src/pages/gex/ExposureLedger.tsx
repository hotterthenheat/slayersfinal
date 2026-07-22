import { Fragment, useState } from 'react';
import { Download } from 'lucide-react';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import SpotRule from '../../components/ui/SpotRule';
import type { ExposureProfileData } from '../../types/gex';

interface ExposureLedgerProps {
  data: ExposureProfileData;
  /** Strike hovered in either panel (synced highlight) */
  hoverStrike?: number | null;
  /** Strike pinned by click — drives the detail bar + view-on-chart */
  selectedStrike?: number | null;
  onHoverStrike?: (strike: number | null) => void;
  onSelectStrike?: (strike: number) => void;
}

type Leg = 'call' | 'put' | 'net';

const LEG_OPTIONS = [
  { value: 'call', label: 'Calls' },
  { value: 'put', label: 'Puts' },
  { value: 'net', label: 'Net' },
] as const;

const SCALE_OPTIONS = [
  { value: 'usd', label: '$' },
  { value: 'pct', label: '% max' },
] as const;

// Leg identity colors mirror the Exposure Matrix so the two tables read as one
// system: puts red, calls green, net magenta (the "land here" column).
const LEG_BAR: Record<Leg, string> = {
  put: 'rgba(255,59,48,0.7)',
  call: 'rgba(48,209,88,0.85)',
  net: 'rgba(234,0,255,0.8)',
};

const LEG_NAME: Record<Leg, string> = { call: 'CALLS', put: 'PUTS', net: 'NET' };

const GREEKS: { key: 'gex' | 'dex' | 'vex'; label: string; unit: string }[] = [
  { key: 'gex', label: 'GEX', unit: '1% move' },
  { key: 'dex', label: 'DEX', unit: '1σ move' },
  { key: 'vex', label: 'VEX', unit: '1% vol' },
];

const strikeLabel = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));

/**
 * Single-leg drill-down over the same strike rows the matrix builds. Filter to
 * calls / puts / net, optionally normalize each greek against its window max,
 * and export exactly what's on screen. Row clicks reuse the page's selection —
 * so "view on chart" still fires from the detail bar. No values are derived
 * here; every number is read straight from data.strikes / data.maxAbs.
 */
const ExposureLedger = ({
  data,
  hoverStrike,
  selectedStrike,
  onHoverStrike,
  onSelectStrike,
}: ExposureLedgerProps) => {
  const [leg, setLeg] = useState<Leg>('net');
  const [normalize, setNormalize] = useState(false);

  const { strikes, maxAbs, levels, ticker, spotAfterIndex } = data;

  const cellText = (value: number, max: number): string => {
    if (!normalize) return fmtUsd(value);
    const pct = (value / (max || 1)) * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  };
  const barPct = (value: number, max: number) => Math.min(100, (Math.abs(value) / (max || 1)) * 100);

  const exportCsv = () => {
    const unit = normalize ? '% max' : '$';
    const header = ['Strike', ...GREEKS.map(g => `${g.label} ${LEG_NAME[leg]} (${unit})`)];
    const body = strikes.map(row => [
      strikeLabel(row.strike),
      ...GREEKS.map(g => {
        const value = row[g.key][leg];
        return normalize ? ((value / (maxAbs[g.key] || 1)) * 100).toFixed(2) : value.toFixed(2);
      }),
    ]);
    const csv = [header, ...body].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ticker}-${data.expiry}-${leg}-exposure.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SpotRow = () => (
    <tr>
      <td colSpan={GREEKS.length + 1} className="px-2 py-1">
        <SpotRule ticker={ticker} price={levels.spot} />
      </td>
    </tr>
  );

  const actions = (
    <>
      <SegmentedControl ariaLabel="Leg" options={LEG_OPTIONS} value={leg} onChange={v => setLeg(v as Leg)} />
      <SegmentedControl
        ariaLabel="Scale"
        options={SCALE_OPTIONS}
        value={normalize ? 'pct' : 'usd'}
        onChange={v => setNormalize(v === 'pct')}
      />
      <button
        onClick={exportCsv}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-borderSubtle bg-white/[0.03] hover:bg-white/[0.06] font-mono text-[11px] font-semibold uppercase tracking-wider text-textPrimary transition-colors"
      >
        <Download className="w-3.5 h-3.5" /> Export CSV
      </button>
    </>
  );

  return (
    <Panel
      title="Exposure Ledger"
      subtitle="single-leg drill-down · export"
      actions={actions}
      flush
      className="min-w-0"
      bodyClassName="flex flex-col max-h-[560px]"
    >
      <div className="overflow-auto h-full min-h-0">
        {/* Sticky legend — stays pinned while the rows scroll */}
        <div className="sticky top-0 z-20 flex items-center gap-3 h-9 px-2.5 bg-panelRaised border-b border-borderSubtle overflow-hidden whitespace-nowrap">
          <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-textPrimary">
            <span className="inline-block w-3 h-[3px] rounded-full" style={{ background: LEG_BAR[leg] }} />
            {LEG_NAME[leg]}
          </span>
          <span className="h-3 w-px bg-borderSubtle" />
          {GREEKS.map(g => (
            <span key={g.key} className="font-mono text-[11px] uppercase tracking-wider text-textSecondary">
              {g.label} <span className="text-textMuted normal-case">· {g.unit}</span>
            </span>
          ))}
          <span className="ml-auto font-mono text-[11px] uppercase tracking-wider text-textMuted">
            {normalize ? '% of window max' : 'signed $'}
          </span>
        </div>

        <table className="w-full border-collapse">
          <thead className="sticky top-9 z-10">
            <tr className="bg-panelRaised">
              <th className="px-2.5 py-1.5 text-left font-mono text-[11px] font-semibold uppercase tracking-widest text-textSecondary border-b border-borderSubtle">
                Strike
              </th>
              {GREEKS.map(g => (
                <th
                  key={g.key}
                  className="px-2.5 py-1.5 text-right font-mono text-[11px] font-semibold uppercase tracking-widest text-textSecondary border-b border-l border-borderSubtle"
                >
                  {g.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spotAfterIndex === -0.5 && <SpotRow />}
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
                      ? 'bg-select/[0.05] shadow-[inset_2px_0_0_0_rgba(199,211,232,0.7)]'
                      : hoverStrike === row.strike
                        ? 'bg-white/[0.04]'
                        : ''
                  }`}
                >
                  <td className="px-2.5 py-1.5 bg-inset border-r border-borderSubtle/40 font-mono text-[11px] font-semibold tnum text-textSecondary whitespace-nowrap">
                    {strikeLabel(row.strike)}
                    {row.pin && (
                      <span className="ml-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-textPrimary">
                        pin
                      </span>
                    )}
                  </td>
                  {GREEKS.map(g => {
                    const value = row[g.key][leg];
                    return (
                      <td key={g.key} className="px-2.5 py-1.5 text-right align-middle border-l border-borderSubtle/20">
                        <span
                          className={`block font-mono text-[12px] tnum ${
                            leg === 'net' ? 'text-textPrimary font-semibold' : 'text-textPrimary'
                          }`}
                        >
                          {cellText(value, maxAbs[g.key])}
                        </span>
                        <span className="mt-0.5 ml-auto block h-[3px] w-full max-w-[64px] rounded-full bg-white/[0.04]">
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${barPct(value, maxAbs[g.key])}%`, background: LEG_BAR[leg] }}
                          />
                        </span>
                      </td>
                    );
                  })}
                </tr>
                {i === spotAfterIndex && <SpotRow />}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
};

export default ExposureLedger;
