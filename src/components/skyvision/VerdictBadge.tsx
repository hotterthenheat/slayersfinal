import SignalBadge from '../ui/SignalBadge';
import type { Verdict } from '../../types/skyvision';

const VERDICT_TONE = {
  ENTER: 'bull',
  EXIT: 'bear',
  WATCH: 'warn',
} as const;

interface VerdictBadgeProps {
  verdict: Verdict;
  dot?: boolean;
  className?: string;
}

const VerdictBadge = ({ verdict, dot = false, className = '' }: VerdictBadgeProps) => (
  <SignalBadge tone={VERDICT_TONE[verdict]} dot={dot} className={className}>
    {verdict}
  </SignalBadge>
);

export default VerdictBadge;
