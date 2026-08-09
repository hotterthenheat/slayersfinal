/*
==================================================
  SLAYER TERMINAL - SITE FOOTER
  One footer, two densities. `full` is the marketing
  sitemap the landing page ends on; `compact` is the
  single bar the terminal shell can carry without
  stealing height from a desk. Both close on the same
  legal line, so the disclaimer is never a page the
  visitor has to go looking for.
==================================================
*/

import { Link, useLocation } from 'react-router-dom';
import { useLaunch } from './LaunchTransition';
import { PAGE_CONTAINER } from './container';

const LEGAL_LINKS = [
  { label: 'Disclaimer', to: '/legal/disclaimer' },
  { label: 'Terms', to: '/legal/terms' },
  { label: 'Privacy', to: '/legal/privacy' },
];

const FOOTER_COLS = [
  {
    title: 'Products',
    links: [
      { label: 'Pulse', to: '/pulse' },
      { label: 'Compass', to: '/compass' },
      { label: 'Trace', to: '/trace' },
      { label: 'Pinpoint', to: '/pinpoint' },
      { label: 'Prove It', to: '/prove-it' },
      { label: 'Stocks', to: '/stocks' },
      { label: 'Tracker', to: '/tracker' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Pricing', to: '#pricing' },
      { label: 'FAQ', to: '#faq' },
      { label: 'Community', to: '/community' },
      { label: 'Feedback', to: '/community/feedback' },
      { label: 'Contact', to: 'mailto:info@slayerterminal.com' },
    ],
  },
  {
    title: 'Access',
    links: [
      // "Log in / Sign up" used to sit here pointing at /pulse. There is no
      // auth in the product, so it promised an account flow and silently opened
      // the terminal — the same thing the line above it does, under a label
      // that isn't true. Removed rather than relabelled: two entries doing one
      // job is the other half of the problem.
      { label: 'Launch Terminal', to: '/terminal' },
      { label: 'Guide', to: '/guide' },
    ],
  },
  { title: 'Legal', links: LEGAL_LINKS },
];

/**
 * Anchor / route / mailto — one link component so columns stay declarative.
 * Links into the terminal play the launch gate instead of jumping.
 *
 * A BARE hash is the interesting case. `#pricing` and `#faq` are sections of
 * the landing page, and this footer used to appear only there, so a raw anchor
 * was right. Now that every route carries it, `#pricing` clicked from
 * `/compass` resolves to `/compass#pricing` — a section that does not exist,
 * and measurably nothing happens. Off the landing page the hash has to carry
 * its route with it.
 */
const SmartLink = ({ to, className, children }: { to: string; className: string; children: React.ReactNode }) => {
  const { launch } = useLaunch();
  const { pathname } = useLocation();
  if (to.startsWith('#') && pathname !== '/') {
    return (
      <Link to={{ pathname: '/', hash: to }} className={className}>
        {children}
      </Link>
    );
  }
  if (to === '/terminal') {
    return (
      <a
        href={to}
        className={className}
        onClick={e => {
          e.preventDefault();
          launch(to);
        }}
      >
        {children}
      </a>
    );
  }
  return to.startsWith('/') ? (
    <Link to={to} className={className}>
      {children}
    </Link>
  ) : (
    <a href={to} className={className}>
      {children}
    </a>
  );
};

/** The caret is the site's signature, but a permanent blink inside a working
    desk competes with the data, so the compact bar wears the wordmark still. */
const Wordmark = ({ caret }: { caret: boolean }) => (
  <span className="font-mono text-data font-bold text-textPrimary">
    <span className="text-textMuted">&gt; </span>slayer_terminal
    {caret && (
      <span className="inline-block w-[6px] h-[12px] ml-1 bg-textPrimary align-middle animate-cursor-blink" />
    )}
  </span>
);

const COPYRIGHT = '© 2026 Slayer Terminal · Compass · Pinpoint';
const DISCLAIMER = 'For informational purposes only. Not investment advice.';

/**
 * A 24px-tall hit box for the footer's small-print links.
 *
 * Measured on a phone, these are 15–17px tall — under WCAG 2.2's 24×24 minimum,
 * and close enough to each other that the spacing exception does not save them.
 * The column lists are exempt (they are inline links in a block of text); these
 * are not, because they are flex items, and a flex item is blockified.
 */
const TAP_SAFE = 'inline-flex items-center min-h-6';

interface SiteFooterProps {
  /*
    There used to be a `variant` here, and a `compact` branch below that dropped
    the sitemap for a single 53px bar. The four desks wore it. It is gone with
    the variant it served: every page now ends on the same footer except Pulse,
    which carries none at all because it owns the viewport.
  */
  bleed?: boolean;
}

/** In the app the footer lands on the shell's own column, so its rule and its
    sitemap columns share the content's left and right edges. */
const GUTTER = PAGE_CONTAINER;

const SiteFooter = ({ bleed = false }: SiteFooterProps) => {
  const pad = bleed ? GUTTER : 'px-6 md:px-10 max-w-6xl mx-auto';
  return (
    <footer className="border-t border-borderSubtle">
      <div data-page-container="footer" className={`${pad} py-14 grid grid-cols-2 md:grid-cols-6 gap-10`}>
        <div className="col-span-2">
          <Wordmark caret />
          <p className="mt-3 text-caption text-textSecondary leading-relaxed max-w-[36ch]">
            The options terminal. Compass finds the setup, Pinpoint reads the flow.
          </p>
          <a
            href="https://x.com/JoinSlayer"
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-4 gap-2 font-mono text-label text-textSecondary hover:text-textPrimary transition-colors ${TAP_SAFE}`}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            @JoinSlayer
          </a>
        </div>
        {FOOTER_COLS.map(col => (
          <div key={col.title}>
            <span className="font-mono text-micro font-bold uppercase tracking-widest text-textMuted">
              {col.title}
            </span>
            <ul className="mt-3.5 flex flex-col gap-2.5">
              {col.links.map(l => (
                <li key={l.label}>
                  <SmartLink
                    to={l.to}
                    className="text-caption text-textSecondary hover:text-textPrimary transition-colors"
                  >
                    {l.label}
                  </SmartLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-borderSubtle/60">
        <div className={`${pad} py-5 flex flex-col md:flex-row gap-2 md:items-center`}>
          <span className="font-mono text-micro uppercase tracking-wider text-textMuted">{COPYRIGHT}</span>
          <SmartLink
            to="/legal/disclaimer"
            className={`md:ml-auto font-mono text-micro tracking-wide text-textMuted hover:text-textSecondary transition-colors ${TAP_SAFE}`}
          >
            {DISCLAIMER}
          </SmartLink>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
