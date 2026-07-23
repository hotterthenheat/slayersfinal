import { Callout } from './parts';

interface Term {
  term: string;
  def: string;
}
interface Group {
  title: string;
  terms: Term[];
}

const GROUPS: Group[] = [
  {
    title: 'Dealer positioning & gamma',
    terms: [
      { term: 'GEX — Gamma Exposure', def: 'Net market-maker gamma per strike. Long gamma (dealers dampen moves) reads green; short gamma (dealers amplify moves) reads red.' },
      { term: 'DEX — Delta Exposure', def: 'Net dealer delta. It sets the direction dealers must hedge in as price moves.' },
      { term: 'VEX — Vanna Exposure', def: "Sensitivity of dealer delta to a change in implied vol — the hedging that fires when IV moves rather than price." },
      { term: 'Call wall / Put wall', def: 'The strikes carrying the heaviest call or put positioning. The call wall often caps as resistance; the put wall often holds as support.' },
      { term: 'Gamma flip', def: 'The price level where net dealer gamma changes sign. Above it dealers tend to dampen moves; below it they tend to accelerate them.' },
      { term: 'King strike', def: 'The single strike carrying the most exposure — the strongest pin on the board.' },
      { term: 'Long / short gamma regime', def: 'In a long-gamma regime moves get sold into and fade; in a short-gamma regime moves get chased and extend.' },
    ],
  },
  {
    title: 'Order flow',
    terms: [
      { term: 'Sweep', def: 'A single order that takes multiple exchanges at once — a signature of urgency.' },
      { term: 'Block', def: 'A large negotiated trade crossed in one clip, often away from the lit market.' },
      { term: 'Ask-lift / bid-hit', def: 'Lifting the ask is buy aggression; hitting the bid is sell aggression. In Trace, ask-lifts read green.' },
      { term: 'Cumulative delta', def: 'The running total of buy minus sell size — a rising line is net pressure building.' },
      { term: 'Dark pool', def: 'An off-exchange venue where large trades cross without showing on the lit tape until printed.' },
      { term: 'Metaorder', def: 'A parent order a desk works over time as many smaller child prints. Reconstruction clusters those children back into the parent.' },
    ],
  },
  {
    title: 'Volatility',
    terms: [
      { term: 'IV — Implied Volatility', def: "The volatility the option market is pricing in — the market's expectation of future movement, not a measure of the past." },
      { term: 'IV Rank / IV Percentile', def: 'Where current IV sits within its own past range (rank) or how often it has been lower (percentile). High = options are relatively expensive.' },
      { term: 'Term structure', def: 'ATM IV plotted across days-to-expiry. Upward-sloping is normal; inverted (near-dated richer) flags event or stress pricing.' },
      { term: 'Skew', def: 'The difference in IV across strikes. A steep put-wing skew means downside protection is being bid.' },
      { term: 'Charm', def: 'How dealer delta drifts purely from the passage of time — the hedging that accrues into the close and into expiry.' },
      { term: 'Vanna', def: 'How dealer delta shifts as implied vol changes — a vol pop can force hedging even if price is flat.' },
      { term: 'Risk-neutral distribution', def: 'The probability density over future price that is implied by option prices — where the market prices the odds.' },
      { term: 'Expected move', def: 'The ± range implied by option prices over a horizon; roughly the one-standard-deviation band.' },
    ],
  },
  {
    title: 'Quant & modeling',
    terms: [
      { term: 'Monte Carlo', def: 'Sampling many price paths to build a distribution of outcomes rather than a single point forecast.' },
      { term: 'Percentile cone', def: 'The band on the fan chart that contains a given share of the sampled paths — the 50% and 90% bands, for example.' },
      { term: 'Calibration', def: 'Whether a stated probability matched reality — on the plot, points on the diagonal are well-calibrated.' },
      { term: 'Edge decay', def: 'How the net edge of a setup changes the longer the trade is held — it tells you where the edge is strongest.' },
    ],
  },
];

const Concepts = () => (
  <div className="flex flex-col gap-6">
    {GROUPS.map(g => (
      <div key={g.title} className="flex flex-col gap-3">
        <h2 className="font-mono text-label font-semibold uppercase tracking-widest text-textMuted">{g.title}</h2>
        <div className="rounded-lg border border-borderSubtle bg-panel divide-y divide-borderSubtle">
          {g.terms.map(t => (
            <div key={t.term} className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[210px_1fr] gap-1 sm:gap-4">
              <span className="font-mono text-caption font-semibold uppercase tracking-wide text-textPrimary">{t.term}</span>
              <span className="text-data text-textSecondary leading-relaxed">{t.def}</span>
            </div>
          ))}
        </div>
      </div>
    ))}

    <Callout>
      These definitions describe how the terms are used inside Slayer. They are educational, not a recommendation — see
      the Disclaimer for how to treat any reading the terminal produces.
    </Callout>
  </div>
);

export default Concepts;
