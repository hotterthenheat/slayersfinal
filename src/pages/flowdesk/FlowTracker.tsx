import Panel from '../../components/ui/Panel';

const PLANNED = [
  {
    title: 'Tracked Flow',
    code: 'TRK_01',
    detail: 'Bookmark prints off the live tape — fill-vs-spread position, flow score, side & ΔOI follow-up',
  },
  {
    title: 'Tracked Contracts',
    code: 'TRK_02',
    detail: 'Watch whole contracts — daily vol/OI history, net premium, sweep & multi-leg share',
  },
  {
    title: 'Contract Drilldown',
    code: 'TRK_03',
    detail: 'Single-contract deep dive — intraday flow chart, cumulative net premium vs price, vol/OI ledger',
  },
];

/** Scaffold — the follow-the-whale workflow lands with the real tape feed. */
const FlowTracker = () => (
  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
    {PLANNED.map(mod => (
      <Panel key={mod.code} title={mod.title} subtitle={mod.code} className="w-full">
        <div className="h-32 flex flex-col items-center justify-center gap-2 border border-dashed border-borderSubtle rounded-md px-4 text-center">
          <span className="font-mono text-[10px] text-textMuted uppercase tracking-widest">
            Module scheduled — needs per-print feed
          </span>
          <span className="text-[11px] text-textSecondary leading-snug">{mod.detail}</span>
        </div>
      </Panel>
    ))}
  </div>
);

export default FlowTracker;
