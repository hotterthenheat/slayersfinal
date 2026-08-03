import { useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import Panel from '../ui/Panel';
import SegmentedControl from '../ui/SegmentedControl';
import DataTable, { type Column } from '../ui/DataTable';
import { fmtUsd } from '../../data/gex';
import type { ImpactMetric, ImpactRow } from '../../types/compass';

interface ImpactLeaderboardProps {
  rows: ImpactRow[];
}

/** How deep the leaderboard goes, once the selected metric has ranked the field. */
const ROWS_SHOWN = 8;

const METRIC_OPTIONS = [
  { value: 'gamma', label: 'Gamma' },
  { value: 'volume', label: 'Volume' },
  { value: 'notional', label: 'Notional' },
  { value: 'oi', label: 'Open Int' },
] as const;

const metricValue = (row: ImpactRow, metric: ImpactMetric): number => {
  switch (metric) {
    case 'gamma':
      return row.gamma;
    case 'volume':
      return row.volume;
    case 'notional':
      return row.deltaNotional;
    case 'oi':
      return row.openInterest;
  }
};

const COLUMNS: Column<ImpactRow>[] = [
  {
    key: 'rank',
    header: 'Rank',
    width: '56px',
    render: r => <span className="text-textMuted">#{r.rank}</span>,
  },
  {
    key: 'contract',
    header: 'Contract',
    render: r => <span className="font-semibold text-textPrimary">{r.contract}</span>,
  },
  { key: 'exp', header: 'Exp', render: r => <span className="text-textSecondary">{r.expiry}</span> },
  {
    key: 'oi',
    header: 'OI',
    help: 'OI',
    align: 'right',
    sortValue: r => r.openInterest,
    render: r => <span className="text-textSecondary">{r.openInterest.toLocaleString()}</span>,
  },
  {
    key: 'volume',
    header: 'Volume',
    align: 'right',
    sortValue: r => r.volume,
    render: r => <span className="text-textSecondary">{r.volume.toLocaleString()}</span>,
  },
  {
    key: 'notional',
    header: 'Delta Notional',
    help: 'DEX',
    align: 'right',
    sortValue: r => r.deltaNotional,
    render: r => <span className="text-textPrimary">{fmtUsd(r.deltaNotional * 1e9)}</span>,
  },
  {
    key: 'gamma',
    header: 'Gamma',
    align: 'right',
    sortValue: r => r.gamma,
    render: r => <span className="text-textPrimary">{r.gamma.toFixed(1)}%</span>,
  },
];

const ImpactLeaderboard = ({ rows }: ImpactLeaderboardProps) => {
  const [metric, setMetric] = useState<ImpactMetric>('gamma');

  /*
    Rank the FIELD, then take the top eight — in that order.

    It used to be handed eight rows the engine had already chosen by gamma, and
    re-sorting those eight is not what "rank by volume" claims: three of the four
    metrics returned the largest-by-gamma contracts in a different order. The
    engine now hands over every contract in the chain and the slice happens here,
    after the sort, so each metric selects its own eight.
  */
  const ranked = useMemo(
    () =>
      [...rows]
        .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
        .slice(0, ROWS_SHOWN)
        .map((r, i) => ({ ...r, rank: i + 1 })),
    [rows, metric]
  );

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" /> Largest Impact Contracts
        </span>
      }
      flush
      className="w-full"
      actions={
        <SegmentedControl ariaLabel="Rank by" options={METRIC_OPTIONS} value={metric} onChange={setMetric} />
      }
    >
      <DataTable columns={COLUMNS} rows={ranked} rowKey={r => `${r.contract}-${r.rank}`} maxHeight="320px" />
    </Panel>
  );
};

export default ImpactLeaderboard;
