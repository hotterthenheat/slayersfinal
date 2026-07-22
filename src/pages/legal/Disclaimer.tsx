import LegalLayout from './LegalLayout';

/**
 * Not-financial-advice + options-risk disclaimer. The single most important
 * legal surface for a research product that surfaces directional readings.
 */
const Disclaimer = () => (
  <LegalLayout
    title="Disclaimer"
    intro="Slayer Terminal is a research, analytics and educational tool. It is not a broker-dealer, investment adviser, or financial planner, and nothing on this site is personalized investment advice or a recommendation to buy, sell, or hold any security."
    sections={[
      {
        heading: 'Not investment advice',
        body: (
          <p>
            All content — including scores, verdicts, "setups," levels, probabilities, and any directional
            language — is provided for informational and educational purposes only. It reflects general analytical
            readings, not advice tailored to your objectives, financial situation, or risk tolerance. You are solely
            responsible for your own decisions.
          </p>
        ),
      },
      {
        heading: 'Options carry substantial risk',
        body: (
          <>
            <p>
              Options and other derivatives are complex instruments and carry a high level of risk. You can lose the
              entire amount of your investment in a short period, and certain strategies can expose you to losses
              exceeding your initial outlay. They are not suitable for every investor.
            </p>
            <p>
              Before trading options, read the disclosure document{' '}
              <span className="text-textPrimary">"Characteristics and Risks of Standardized Options"</span> published
              by the Options Clearing Corporation and provided by your broker.
            </p>
          </>
        ),
      },
      {
        heading: 'No recommendation — do your own research',
        body: (
          <p>
            Any label such as QUALIFIED, WATCH, or FADED is an analytical reading of the inputs the tool measures, not a
            solicitation or recommendation. Always conduct your own due diligence and consult a licensed financial
            professional before acting.
          </p>
        ),
      },
      {
        heading: 'Data may be delayed or incomplete',
        body: (
          <p>
            Market data, order-flow readings and analytics may be delayed, incomplete, or provided for illustrative and
            informational purposes, and must not be relied upon as the sole basis for any trading decision. We do not
            guarantee the accuracy, completeness, or timeliness of any figure shown.
          </p>
        ),
      },
      {
        heading: 'No performance guarantee',
        body: (
          <p>
            Past or hypothetical performance is not indicative of future results. No representation is made that any
            account will or is likely to achieve results similar to those shown. Any track-record figures are
            illustrative and do not guarantee future outcomes.
          </p>
        ),
      },
      {
        heading: 'No fiduciary relationship',
        body: (
          <p>
            Your use of Slayer Terminal does not create any advisory, brokerage, or fiduciary relationship between you
            and us. We do not receive, hold, or manage your funds, and we do not execute trades on your behalf.
          </p>
        ),
      },
    ]}
  />
);

export default Disclaimer;
