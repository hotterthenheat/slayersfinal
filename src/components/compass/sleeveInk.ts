import type { SleeveKey } from '../../types/compass';

/*
  One colour per horizon, and no new ones.

  The desk was very close to monochrome: five tabs, six styles and 240 rows in
  the same grey, so nothing on the page told you where you were without reading
  it. Every value below is an existing token from tailwind.config.ts — the
  palette does not grow, it just gets used.

  The assignment is the clock, hot to cool: orange for the session that is
  burning down, gold for the week, teal for six weeks, sky for a year.
  Structures is magenta because it is the one tab that is not a point on that
  line — it is a different instrument, not a longer one.

  These may not be borrowed for anything directional. Green and red stay the
  market's own language (a call, a put, a price that moved), and a horizon is
  not a direction. See setupState.ts for the rule stated once for the whole desk.
*/

export interface SleeveInk {
  /** Text colour for the active tab and the sleeve's own labels. */
  text: string;
  /** Background of the active tab. */
  activeBg: string;
  /** Hairline under the active tab. */
  rule: string;
  /** Faint wash for a surface that belongs to this sleeve. */
  wash: string;
  /** Raw hex, for SVG strokes that cannot reach a Tailwind class. */
  hex: string;
}

export const SLEEVE_INK: Record<SleeveKey, SleeveInk> = {
  odte: {
    text: 'text-warn',
    activeBg: 'bg-warn/[0.14]',
    rule: 'bg-warn',
    wash: 'bg-warn/[0.04]',
    hex: '#FF9500',
  },
  weekly: {
    text: 'text-shortGamma',
    activeBg: 'bg-shortGamma/[0.14]',
    rule: 'bg-shortGamma',
    wash: 'bg-shortGamma/[0.04]',
    hex: '#E0B84E',
  },
  swing: {
    text: 'text-darkpool',
    activeBg: 'bg-darkpool/[0.14]',
    rule: 'bg-darkpool',
    wash: 'bg-darkpool/[0.04]',
    hex: '#2dd4bf',
  },
  leaps: {
    text: 'text-flip',
    activeBg: 'bg-flip/[0.14]',
    rule: 'bg-flip',
    wash: 'bg-flip/[0.04]',
    hex: '#7DD3FC',
  },
  structures: {
    text: 'text-king',
    activeBg: 'bg-king/[0.14]',
    rule: 'bg-king',
    wash: 'bg-king/[0.04]',
    hex: '#EA00FF',
  },
};
