import SignalBadge from '../ui/SignalBadge';
import type { Verdict } from '../../types/skyvision';

const VERDICT_TONE = {
  ENTER: 'bull',
  EXIT: 'bear',
  WATCH: 'warn',
} as const;

// Displayed labels describe the setup's quality — they never command an action.
// The internal Verdict type stays ENTER/EXIT/WATCH; only the wording is observational.
const VERDICT_LABEL: Record<Verdict, string> = {
  ENTER: 'QUALIFIED',
  EXIT: 'FADED',
  WATCH: 'WATCH',
};

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
