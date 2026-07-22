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

export const toneBadge: Record<Tone, string> = {
  bull: 'bg-bull/10 text-bull border-bull/20',
  bear: 'bg-bear/10 text-bear border-bear/20',
  warn: 'bg-warn/10 text-warn border-warn/20',
  info: 'bg-flip/10 text-flip border-flip/20',
  select: 'bg-select/10 text-select border-select/20',
  // Borderless by request — magenta rides the tint + ink alone
  magenta: 'bg-king/10 text-king border-transparent',
  neutral: 'bg-white/[0.04] text-textSecondary border-borderSubtle',
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
