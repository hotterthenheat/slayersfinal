import LegalLayout from './LegalLayout';

/**
 * Privacy policy that is accurate to the current app: no accounts, no server,
 * preferences persisted only in the browser's local storage.
 */
const Privacy = () => (
  <LegalLayout
    title="Privacy Policy"
    intro="Slayer Terminal is built privacy-first. It currently has no user accounts and no application server that stores your personal data — the settings and notes you create stay in your own browser."
    sections={[
      {
        heading: 'What we store',
        body: (
          <>
            <p>
              Your workspace layout, watchlists, tracker and journal entries, saved views, and any community drafts are
              saved in your browser's local storage on your device. This data is not transmitted to us and never leaves
              your browser unless you explicitly share it.
            </p>
            <p>
              You can clear all of it at any time from the in-app Settings panel, or by clearing your browser's site
              data — doing so permanently removes it.
            </p>
          </>
        ),
      },
      {
        heading: 'What we do not collect',
        body: (
          <p>
            We do not require an account, and we do not collect, sell, or rent your personal information. We do not run
            third-party advertising trackers or behavioral-ad networks.
          </p>
        ),
      },
      {
        heading: 'Cookies & local storage',
        body: (
          <p>
            We use your browser's local storage to remember your preferences between visits. This is not used for
            cross-site tracking. If your browser blocks local storage, the app still runs but will not remember your
            settings.
          </p>
        ),
      },
      {
        heading: 'Third-party services',
        body: (
          <p>
            Loading the site involves standard third-party infrastructure — our hosting provider and a web-font
            provider — which may receive routine request metadata such as your IP address and browser type in order to
            deliver the page. These providers act as processors for delivery and are not used by us to build a profile
            of you.
          </p>
        ),
      },
      {
        heading: 'Data security',
        body: (
          <p>
            Because your data lives in your browser, its security depends on the security of your device and browser.
            Use a trusted device and keep your browser up to date. We cannot recover data stored only in your browser if
            it is lost or cleared.
          </p>
        ),
      },
      {
        heading: 'Children',
        body: (
          <p>
            The Service is intended for adults and is not directed to children. We do not knowingly collect information
            from children.
          </p>
        ),
      },
      {
        heading: 'Changes & future features',
        body: (
          <p>
            If we introduce accounts, payments, or server-side features in the future, we will update this policy to
            describe what is collected and why, before those features launch. Continued use after an update constitutes
            acceptance of the revised policy.
          </p>
        ),
      },
    ]}
  />
);

export default Privacy;
