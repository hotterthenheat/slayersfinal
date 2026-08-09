/*
  Shared tone maps for directional/status color.
  Full class strings kept static so Tailwind JIT picks them up.
  Rule: a tone is never the only signal — always paired with a label or icon.
*/

export type Tone = 'bull' | 'bear' | 'warn' | 'info' | 'select' | 'magenta' | 'neutral';

// Bull direction is GREEN (#30D158, Apple system green — pairs with the
// existing Apple red #FF3B30 / orange #FF9500). Holographic silver stays
// reserved for `select` (interface/brand), never for bullishness.
export const toneText: Record<Tone, string> = {
  bull: 'text-bull',
  bear: 'text-bear',
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
  warn: 'bg-warn/70',
  info: 'bg-flip/80',
  select: 'bg-select/70',
  magenta: 'bg-king/70',
  neutral: 'bg-white/20',
};
