/*
  Shared tone maps for directional/status color.
  Full class strings kept static so Tailwind JIT picks them up.
  Rule: a tone is never the only signal — always paired with a label or icon.
*/

/*
  `longGamma` / `shortGamma` are the DEALER-REGIME pair, and they are a separate
  axis from bull/bear on purpose. The sign of net dealer gamma says whether
  hedging absorbs moves or amplifies them — it says nothing about which way price
  goes, and a short-gamma tape can rip upward violently. Every surface that draws
  that quantity (the heatmap, the positioning map, the regime badge) speaks this
  pair; anything that draws a DIRECTION still speaks bull/bear.
*/
export type Tone =
  | 'bull'
  | 'bear'
  | 'longGamma'
  | 'shortGamma'
  | 'warn'
  | 'info'
  | 'select'
  | 'magenta'
  | 'neutral';

// Bull direction is GREEN (#30D158, Apple system green — pairs with the
// existing Apple red #FF3B30 / orange #FF9500). Holographic silver stays
// reserved for `select` (interface/brand), never for bullishness.
export const toneText: Record<Tone, string> = {
  bull: 'text-bull',
  bear: 'text-bear',
  longGamma: 'text-longGamma',
  shortGamma: 'text-shortGamma',
  warn: 'text-warn',
  // Informational / in-flight (not directional) — sky-blue flip token
  info: 'text-flip',
  select: 'text-select',
  magenta: 'text-king',
  neutral: 'text-textPrimary',
};

export const toneDot: Record<Tone, string> = {
  bull: 'bg-bull',
  bear: 'bg-bear',
  longGamma: 'bg-longGamma',
  shortGamma: 'bg-shortGamma',
  warn: 'bg-warn',
  info: 'bg-flip',
  select: 'bg-select',
  magenta: 'bg-king',
  neutral: 'bg-textMuted',
};

/*
  A badge is ink, not a pill.

  These carried a tint, a border and a radius, which made every verdict, every
  evidence chip and every status marker a small rounded box — a dozen of them
  on a single card. The label is already uppercase mono at micro size against a
  near-black page; the tone alone separates it from body text, and the optional
  dot carries the state for anyone who cannot use colour.
*/
export const toneBadge: Record<Tone, string> = {
  bull: 'text-bull',
  bear: 'text-bear',
  longGamma: 'text-longGamma',
  shortGamma: 'text-shortGamma',
  warn: 'text-warn',
  info: 'text-flip',
  select: 'text-select',
  magenta: 'text-king',
  neutral: 'text-textSecondary',
};

export const toneBar: Record<Tone, string> = {
  // Element-level chrome keeps its luminance — never below /70
  bull: 'bg-bull/90',
  bear: 'bg-bear/80',
  longGamma: 'bg-longGamma/85',
  shortGamma: 'bg-shortGamma/85',
  warn: 'bg-warn/70',
  info: 'bg-flip/80',
  select: 'bg-select/70',
  magenta: 'bg-king/70',
  neutral: 'bg-white/20',
};

/*
  Score-band ink — the magnitude ramp, kept apart from the direction maps above.

  A sleeve score is a MAGNITUDE. 74 on momentum is not a bullish reading of
  anything, and 31 is not a bearish one; the number says how much, never which
  way. Direction lives on `changePct` and the RS windows, where a sign exists.

  This lived as two identical maps in two files — Stocks.tsx and
  StockDetailModal.tsx — and that is how it came to be half-fixed. The board's
  copy carries a comment saying that dressing a score in bull green "had the
  densest column on the board arguing a direction the number never claimed", and
  the fix was applied to the green end only: `weak` stayed `bg-bear/70` and
  `text-bear`, which is the identical mistake inverted. A low score arguing
  bearishness is exactly as wrong as a high one arguing bullishness.

  Both ends are neutral now, and there is one map, so the next fix cannot land on
  half of it. The ramp still reads — a strong band fills bright, a weak one
  barely fills at all — because on a bar it is the WIDTH that carries the value,
  not the hue.
*/
export type ScoreBandKey = 'strong' | 'mid' | 'weak';

export const scoreBandFill: Record<ScoreBandKey, string> = {
  strong: 'data-bar',
  mid: 'bg-white/30',
  weak: 'bg-white/12',
};

export const scoreBandText: Record<ScoreBandKey, string> = {
  strong: 'text-textPrimary',
  mid: 'text-textSecondary',
  weak: 'text-textMuted',
};
