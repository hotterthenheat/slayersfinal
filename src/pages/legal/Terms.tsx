import { Link } from 'react-router-dom';
import LegalLayout from './LegalLayout';

/** Standard terms-of-service boilerplate, honest to the current app. */
const Terms = () => (
  <LegalLayout
    title="Terms of Service"
    intro="These Terms govern your access to and use of Slayer Terminal (the “Service”). By using the Service you agree to these Terms. If you do not agree, do not use the Service."
    sections={[
      {
        heading: 'The service',
        body: (
          <p>
            Slayer Terminal provides options analytics, order-flow readings, and research tooling. Features may change,
            be added, or be removed at any time. We may modify or discontinue the Service, in whole or in part, without
            notice.
          </p>
        ),
      },
      {
        heading: 'Not financial advice',
        body: (
          <p>
            The Service is informational and educational and does not provide investment advice. See our{' '}
            <Link to="/legal/disclaimer" className="text-textPrimary underline underline-offset-2 decoration-white/40 hover:decoration-white/80">
              Disclaimer
            </Link>{' '}
            for the full terms, which are incorporated here by reference.
          </p>
        ),
      },
      {
        heading: 'Acceptable use',
        body: (
          <p>
            You agree not to misuse the Service — including attempting to disrupt it, scrape it at scale, reverse
            engineer it, resell access, or use it for any unlawful purpose. You are responsible for any content you
            submit through community features and must not post anything unlawful, infringing, or abusive.
          </p>
        ),
      },
      {
        heading: 'Intellectual property',
        body: (
          <p>
            The Service, including its design, code, text, and branding, is owned by Slayer Terminal and protected by
            intellectual-property laws. You may not copy, modify, or create derivative works from it except as expressly
            permitted.
          </p>
        ),
      },
      {
        heading: 'No warranty',
        body: (
          <p>
            The Service is provided “as is” and “as available,” without warranties of any kind, express or implied,
            including merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that
            the Service will be uninterrupted, error-free, or that any data shown is accurate or complete.
          </p>
        ),
      },
      {
        heading: 'Limitation of liability',
        body: (
          <p>
            To the fullest extent permitted by law, Slayer Terminal and its operators will not be liable for any
            indirect, incidental, special, consequential, or punitive damages, or for any trading or investment losses,
            arising out of or relating to your use of the Service.
          </p>
        ),
      },
      {
        heading: 'Third-party data & content',
        body: (
          <p>
            The Service may display data or content sourced from third parties. We are not responsible for third-party
            data, and its use may be subject to the terms of the originating provider.
          </p>
        ),
      },
      {
        heading: 'Changes to these terms',
        body: (
          <p>
            We may update these Terms from time to time. Continued use of the Service after changes take effect
            constitutes acceptance of the revised Terms.
          </p>
        ),
      },
      {
        heading: 'Governing law',
        body: (
          <p>
            These Terms are governed by the laws of the jurisdiction in which Slayer Terminal operates, without regard
            to conflict-of-laws principles. The specific governing jurisdiction will be identified here prior to any
            paid or commercial launch.
          </p>
        ),
      },
    ]}
  />
);

export default Terms;
