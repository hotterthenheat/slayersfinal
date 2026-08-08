import { feedSource } from '../../core/feedSource';
import { isSnapshotMath, mathSourceId } from '../../core/mathProvider';

/*
  The one piece of chrome that says what the reader is looking at.

  It sits in the top bar at every width — not behind an `xl:` breakpoint like
  the clock beside it, because a phone-width reader needs this sentence more
  than a desk-width one does, and not in the footer, because Pulse has no
  footer and the footer is below the fold on every other desk.

  TWO facts, deliberately, because they fail independently. The feed can become
  real while the pricing model is still the placeholder set core/mathProvider
  ships, and a house model can land while the tape is still generated. Neither
  one alone makes a number on this screen a measurement, so both are named in
  the hover and the badge reads whichever is the weaker claim.

  Quiet on purpose. This is a standing condition, not an alert — an amber pill
  a reader sees on every route for a month is a pill they stop seeing. It takes
  the muted ink the clock takes, and earns attention from being always true
  rather than from shouting.
*/

const FeedBadge = () => {
  const feed = feedSource();
  const snapshotMath = isSnapshotMath();

  const mathLine = snapshotMath
    ? ' Pricing runs on placeholder Black-Scholes shipped with the app, not a house model.'
    : ` Pricing model: ${mathSourceId()}.`;

  return (
    <span
      className="flex items-center gap-1.5 font-mono text-caption text-textSecondary select-none leading-4"
      title={`${feed.detail}${mathLine}`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full bg-textMuted"
        aria-hidden="true"
      />
      <span className="text-micro font-semibold uppercase tracking-wider text-textMuted">{feed.label}</span>
    </span>
  );
};

export default FeedBadge;
