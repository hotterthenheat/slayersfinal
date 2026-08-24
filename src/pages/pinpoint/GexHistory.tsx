import Panel from '../../components/ui/Panel';

const PLANNED = [
  { title: 'Level Migration Timeline', code: 'HIST_01', detail: 'Call wall, put wall, flip & king moving through the session' },
  { title: 'Strike × Time Heatmap', code: 'HIST_02', detail: 'Watch exposure walls build and decay intraday' },
  { title: 'Session Snapshots + Replay', code: 'HIST_03', detail: 'Scrubbable snapshot table with a replay slider' },
];

const GexHistory = () => {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {PLANNED.map(mod => (
        <Panel key={mod.code} title={mod.title} subtitle={mod.code} className="w-full">
          <div className="h-32 flex flex-col items-center justify-center gap-2 border border-dashed border-borderSubtle rounded-md px-4 text-center">
            <span className="font-mono text-[10px] text-textMuted uppercase tracking-widest">
              Module scheduled — next build
            </span>
            <span className="text-[11px] text-textSecondary leading-snug">{mod.detail}</span>
          </div>
        </Panel>
      ))}
    </div>
  );
};

export default GexHistory;
