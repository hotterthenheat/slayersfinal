import SignalBadge from './SignalBadge';
import type { OpenInterest } from '../../types/market';

/*
  Which clock the OPEN INTEREST is on (P4.6).

  Open interest is not a live figure. It publishes once a day at ~06:30 ET for
  the PRIOR session's close, so every OI number on the desk — the exposure that
  drives GEX, the scanner's positioning, the leaderboard — is a settled snapshot
  that can be a day and a half old, sitting beside prices that move every tick.
  This badge says so, in the chrome language freshness always uses: grey for a
  settled figure, amber for an estimate, never green or red (those are the
  market's, and freshness is not a direction). Mirrors components/compass/
  Freshness.tsx, which does the same job for the scanner's sweep clock.
*/

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' → 'Mon D', parsed by parts so no timezone can shift the day. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  const mi = Number(m) - 1;
  if (mi < 0 || mi > 11 || !d) return iso;
  return `${MONTHS[mi]} ${Number(d)}`;
}

interface OiFreshnessProps {
  oi: OpenInterest;
  className?: string;
}

const OiFreshness = ({ oi, className = '' }: OiFreshnessProps) => {
  if (oi.freshness === 'ESTIMATED') {
    return (
      <SignalBadge tone="warn" dot className={className}>
        <span title="Intraday open-interest estimate — the settled figure has not published yet.">OI est.</span>
      </SignalBadge>
    );
  }
  if (oi.freshness === 'UNAVAILABLE') {
    return (
      <SignalBadge tone="neutral" className={className}>
        <span title="Open interest is not published for this instrument.">OI n/a</span>
      </SignalBadge>
    );
  }
  return (
    <SignalBadge tone="neutral" className={className}>
      <span title={`Open interest publishes once a day at ~06:30 ET for the prior session's close. This is the ${oi.asOf} settled figure — not a live count, and up to a day and a half old against the tape.`}>
        OI settled {shortDate(oi.asOf)}
      </span>
    </SignalBadge>
  );
};

export default OiFreshness;
