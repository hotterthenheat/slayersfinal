import type { Role } from '../../../data/pinpoint/board';

/*
  The board's palette, on the rule this terminal settled on: THE HUE IS THE
  SIDE. Violet is puts wherever it appears and amber is calls, the same two
  the exposure trails draw with. Green and red are price and are spent
  nowhere on this surface.

  The role inks are the terminal-wide level tokens, so a strike that is
  magenta on the tape is magenta here.
*/
export const CALL_INK = '#E8A33D';
export const PUT_INK = '#A855F7';
export const CALL_LEG = '#C9954A';
export const PUT_LEG = '#9F7AEA';

export const ROLE_INK: Record<Exclude<Role, null>, string> = {
  pin: '#EA00FF',
  callWall: CALL_INK,
  putWall: PUT_INK,
  flip: '#4F8CFF',
  magnet: '#D2FF00',
};

/** Grade inks. A grade is about MOVEMENT and size, not about side, so these
    are a heat rather than the two-hue side system — and they are the only
    place on the board where that is true. */
export const GRADE_INK: Record<string, string> = {
  hot: '#FF7A45',
  warm: '#E8A33D',
  building: '#4F8CFF',
  fading: '#7d7d7d',
  quiet: '#5a5a5a',
};

/** Compact money. Nine of these to a row, so the unit letter does the work
    the digits would otherwise. */
export function money(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${a.toFixed(0)}`;
}

/** Money with its sign said out loud, for a change readout where the
    direction is the point. */
export function signed(v: number): string {
  return `${v >= 0 ? '+' : '-'}${money(Math.abs(v)).replace('-', '')}`;
}
