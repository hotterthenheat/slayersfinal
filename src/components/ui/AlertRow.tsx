import { toneDot, type Tone } from './tones';

interface AlertRowProps {
  tone: Tone;
  title: string;
  detail?: string;
  time: string;
}

const AlertRow = ({ tone, title, detail, time }: AlertRowProps) => {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5 border-b border-borderSubtle/60 last:border-0">
      <span className={`mt-[5px] w-1.5 h-1.5 rounded-full shrink-0 ${toneDot[tone]}`} />
      <div className="min-w-0 flex-grow">
        <div className="text-xs font-medium text-textPrimary leading-tight">{title}</div>
        {detail && <div className="text-[11px] text-textSecondary mt-0.5 leading-snug">{detail}</div>}
      </div>
      <span className="font-mono text-[10px] text-textMuted whitespace-nowrap mt-0.5">{time}</span>
    </div>
  );
};

export default AlertRow;
