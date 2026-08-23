import type { Ref } from 'react';

interface SpotRuleProps {
  ticker: string;
  price: number;
  /**
   * Receives the OPAQUE part of the marker — the ticker and the price pill,
   * without the rule that stretches to meet them.
   *
   * A host that draws its own content under this marker needs to know where the
   * solid part starts, and it cannot derive that: the rule is `flex-grow`, so
   * the pill's left edge depends on the ticker's glyph count and the container's
   * width, not on anything the host declares. The gamma map clamps a bar's value
   * label against this so the two never print on top of each other.
   */
  contentRef?: Ref<HTMLSpanElement>;
}

/**
 * Current-price marker: a rule with an inverted axis pill (white tag, dark
 * text) — the TradingView price-label idiom. Shared by every strike list the
 * live price crosses. White = "where the market is".
 */
const SpotRule = ({ ticker, price, contentRef }: SpotRuleProps) => (
  <span className="flex items-center gap-1.5 select-none" aria-label={`${ticker} spot ${price.toFixed(2)}`}>
    <span className="h-px flex-grow bg-gradient-to-r from-textPrimary/10 via-textPrimary/40 to-textPrimary/50" />
    <span ref={contentRef} className="flex items-center gap-1.5">
      <span className="font-mono text-micro uppercase tracking-wider text-textSecondary whitespace-nowrap">
        {ticker}
      </span>
      <span className="inline-flex items-center rounded-[3px] bg-textPrimary px-1.5 py-px font-mono text-micro font-bold tnum text-ink whitespace-nowrap">
        {price.toFixed(2)}
      </span>
    </span>
    <span className="h-px w-3 shrink-0 bg-textPrimary/50" />
  </span>
);

export default SpotRule;
