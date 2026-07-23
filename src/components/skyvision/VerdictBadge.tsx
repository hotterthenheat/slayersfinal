import SignalBadge from '../ui/SignalBadge';
import type { Verdict } from '../../types/skyvision';
import { VERDICT_LABEL, VERDICT_TONE } from './verdict';

interface VerdictBadgeProps {
  verdict: Verdict;
  dot?: boolean;
  className?: string;
}

const VerdictBadge = ({ verdict, dot = false, className = '' }: VerdictBadgeProps) => (
  <SignalBadge tone={VERDICT_TONE[verdict]} dot={dot} className={className}>
    {VERDICT_LABEL[verdict]}
  </SignalBadge>
);

export default VerdictBadge;
