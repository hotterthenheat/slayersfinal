/*
  Shared tone maps for directional/status color.
  Full class strings kept static so Tailwind JIT picks them up.
  Rule: a tone is never the only signal — always paired with a label or icon.
*/

/* `holo` is the brand's silver foil, not a status colour — it means "terminal
   hardware" (counts, chrome, navigation), never market direction. It is a
   filled surface with dark ink, so it reads as a solid chip rather than a
   tinted one; keep it scarce or it stops meaning hardware. */
export type Tone = 'bull' | 'bear' | 'warn' | 'select' | 'magenta' | 'holo' | 'neutral';

export const toneText: Record<Tone, string> = {
  bull: 'text-bull',
  bear: 'text-bear',
  warn: 'text-warn',
  select: 'text-select',
  magenta: 'text-[#EA00FF]',
  holo: 'holo-text',
  neutral: 'text-textPrimary',
};

export const toneDot: Record<Tone, string> = {
  bull: 'bg-bull',
  bear: 'bg-bear',
  warn: 'bg-warn',
  select: 'bg-select',
  magenta: 'bg-[#EA00FF]',
  holo: 'holo-bg',
  neutral: 'bg-textMuted',
};

export const toneBadge: Record<Tone, string> = {
  bull: 'bg-bull/10 text-bull border-bull/20',
  bear: 'bg-bear/10 text-bear border-bear/20',
  warn: 'bg-warn/10 text-warn border-warn/20',
  select: 'bg-select/10 text-select border-select/20',
  // Borderless by request — magenta rides the tint + ink alone
  magenta: 'bg-[#EA00FF]/10 text-[#EA00FF] border-transparent',
  /* TINTED, not filled, and FLAT silver rather than the animated foil.
     A filled .holo-bg chip weighs exactly as much as the section subtabs
     (also .holo-bg) — same material at the same strength reads as the same
     rank, and a group's count is a child of the nav above it. So holo follows
     every other tone's badge grammar: tint + its own ink + faint border.
     #C7D3E8 is the house flat silver (the holo foil family's flat form).
     NB do NOT reach for .holo-text here: it sets background-clip:text, which
     clips the chip's SURFACE to the glyphs too, so the tint silently vanishes.
     Animated foil stays reserved for navigation and CTAs. */
  holo: 'bg-[#C7D3E8]/[0.09] text-[#C7D3E8] border-[#C7D3E8]/25',
  neutral: 'bg-white/[0.04] text-textSecondary border-borderSubtle',
};

export const toneBar: Record<Tone, string> = {
  // Neon needs its luminance — element-level lime never below /90
  bull: 'bg-bull/90',
  bear: 'bg-bear/80',
  warn: 'bg-warn/70',
  select: 'bg-select/70',
  magenta: 'bg-[#EA00FF]/70',
  holo: 'holo-bar',
  neutral: 'bg-white/20',
};
