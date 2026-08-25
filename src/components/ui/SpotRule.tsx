interface SpotRuleProps {
  ticker: string;
  price: number;
}

/**
 * Current-price marker: a rule with an inverted axis pill (white tag, dark
 * text) — the TradingView price-label idiom. Shared by every strike list the
 * live price crosses. White = "where the market is".
 *
 * THE TICKER CARRIES ITS OWN PLATE. The price pill is inverted, so it reads
 * on anything. The ticker beside it is plain textSecondary, and this rule
 * crosses the dealer-pressure fills — measured on /pinpoint/exposure-profile
 * at 390px, "SPY" landed on the gold bar at 1.21:1, which is not "hard to
 * read", it is gone. A near-canvas plate at 85% is invisible against the
 * panel it normally sits on (5 vs 10 in every channel) and takes the worst
 * case — textSecondary over the brightest gold — back to 6.5:1.
 */
const SpotRule = ({ ticker, price }: SpotRuleProps) => (
  <span className="flex items-center gap-1.5 select-none" aria-label={`${ticker} spot ${price.toFixed(2)}`}>
    <span className="h-px flex-grow bg-gradient-to-r from-textPrimary/10 via-textPrimary/40 to-textPrimary/50" />
    <span className="rounded-[2px] bg-canvas/85 px-1 font-mono text-[9px] uppercase tracking-wider text-textSecondary whitespace-nowrap">
      {ticker}
    </span>
    <span className="inline-flex items-center rounded-[3px] bg-textPrimary px-1.5 py-px font-mono text-[10px] font-bold tnum text-[#0a0a0a] whitespace-nowrap">
      {price.toFixed(2)}
    </span>
    <span className="h-px w-3 shrink-0 bg-textPrimary/50" />
  </span>
);

export default SpotRule;
