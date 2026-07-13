import { useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import Panel from '../ui/Panel';
import SegmentedControl from '../ui/SegmentedControl';
import DataTable, { type Column } from '../ui/DataTable';
import type { ImpactMetric, ImpactRow } from '../../types/skyvision';

interface ImpactLeaderboardProps {
  rows: ImpactRow[];
}

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
    header: 'Open Int',
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
    align: 'right',
    sortValue: r => r.deltaNotional,
    render: r => <span className="text-textPrimary">${r.deltaNotional.toFixed(2)}B</span>,
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

  const ranked = useMemo(
    () =>
      [...rows]
        .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
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
