import { NavLink } from 'react-router-dom';

const links = [
  { to: '/legal/disclaimer', label: 'Disclaimer' },
  { to: '/legal/terms', label: 'Terms' },
  { to: '/legal/privacy', label: 'Privacy' },
];

/**
 * Slim persistent status-bar footer for the terminal shell. Keeps the
 * not-financial-advice line in view on every desk and links the legal pages.
 */
const Footer = () => (
  <footer className="shrink-0 border-t border-borderSubtle bg-canvas px-4 lg:px-6 2xl:px-8 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
    <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">
      Not investment advice · research &amp; education only
    </span>
    <nav className="ml-auto flex items-center gap-x-4 gap-y-1 flex-wrap" aria-label="Legal">
      {links.map(l => (
        <NavLink
          key={l.to}
          to={l.to}
          className="font-mono text-[10px] uppercase tracking-wider text-textMuted hover:text-textPrimary transition-colors"
        >
          {l.label}
        </NavLink>
      ))}
      <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">© 2026 Slayer Terminal</span>
    </nav>
  </footer>
);

export default Footer;
