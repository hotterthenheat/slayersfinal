import SignalBadge from '../ui/SignalBadge';
import { sweepClock } from './sweepClock';

/*
  Which clock a number is on.

  Compass runs two update rates on purpose — the contract chain and the monitor
  price breathe with every tick, while the ranked board only moves when the
  scanner sweeps — and the page had no way to say which was which. The sweep
  time was one muted line in a metadata row, the live tier was unmarked
  entirely, and the only labelled state was HELD. So a chain refreshing under a
  board that had not moved for eight seconds read as the page being inconsistent
  rather than as the design working.

  All three states speak the chrome language: silver for a live process, grey for
  a settled one, amber for a caveat. Green and red belong to the market (a call,
  a put, a price that moved) and freshness is not a direction, so it may not
  borrow them. See setupState.ts for the rule stated once.
*/

export type FreshnessKind = 'live' | 'sweep' | 'held';

interface FreshnessProps {
  kind: FreshnessKind;
  /** Epoch ms of the sweep. Required for `sweep` and `held`. */
  at?: number;
  className?: string;
}

const Freshness = ({ kind, at, className = '' }: FreshnessProps) => {
  if (kind === 'live') {
    return (
      <SignalBadge tone="select" dot pulse className={className}>
        <span title="Repriced on every market tick">Live</span>
      </SignalBadge>
    );
  }
  if (kind === 'held') {
    return (
      <SignalBadge tone="warn" dot className={className}>
        <span title="Carried from an earlier sweep — the latest one does not rank this contract">
          Held {at ? sweepClock(at) : ''}
        </span>
      </SignalBadge>
    );
  }
  return (
    <SignalBadge tone="neutral" className={className}>
      <span title="Scanner result. The board re-ranks on its own 10 second clock, not on the price tick.">
        Sweep {at ? sweepClock(at) : '—'}
      </span>
    </SignalBadge>
  );
};

export default Freshness;
