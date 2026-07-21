/*
  Shared tone maps for directional/status color.
  Full class strings kept static so Tailwind JIT picks them up.
  Rule: a tone is never the only signal — always paired with a label or icon.
*/

export type Tone = 'bull' | 'bear' | 'warn' | 'select' | 'magenta' | 'neutral';

// Bull direction is GREEN (#30D158, Apple system green — pairs with the
// existing Apple red #FF3B30 / orange #FF9500). Holographic silver stays
// reserved for `select` (interface/brand), never for bullishness.
export const toneText: Record<Tone, string> = {
  bull: 'text-[#30D158]',
  bear: 'text-bear',
  warn: 'text-warn',
  select: 'text-select',
  magenta: 'text-[#EA00FF]',
  neutral: 'text-textPrimary',
};

export const toneDot: Record<Tone, string> = {
  bull: 'bg-[#30D158]',
  bear: 'bg-bear',
  warn: 'bg-warn',
  select: 'bg-select',
  magenta: 'bg-[#EA00FF]',
  neutral: 'bg-textMuted',
};

export const toneBadge: Record<Tone, string> = {
  bull: 'bg-[#30D158]/10 text-[#30D158] border-[#30D158]/20',
  bear: 'bg-bear/10 text-bear border-bear/20',
  warn: 'bg-warn/10 text-warn border-warn/20',
  select: 'bg-select/10 text-select border-select/20',
  // Borderless by request — magenta rides the tint + ink alone
  magenta: 'bg-[#EA00FF]/10 text-[#EA00FF] border-transparent',
  neutral: 'bg-white/[0.04] text-textSecondary border-borderSubtle',
};

export const toneBar: Record<Tone, string> = {
  // Element-level chrome keeps its luminance — never below /70
  bull: 'bg-[#30D158]/90',
  bear: 'bg-bear/80',
  warn: 'bg-warn/70',
  select: 'bg-select/70',
  magenta: 'bg-[#EA00FF]/70',
  neutral: 'bg-white/20',
};
