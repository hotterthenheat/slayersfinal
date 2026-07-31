/*
==================================================
  SLAYER TERMINAL - WORKSPACE LOOP (landing)
  A miniature desk that rearranges itself on a loop —
  demos drag/resize/persist without a video. The tiles
  are the real panels, passed in by LiveSections so
  everything runs off the same live scan context.
==================================================
*/

import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useMediaQuery } from '../../hooks/useMediaQuery';

export type TileKey = 'heat' | 'levels' | 'tape' | 'setup';

export interface WorkspaceTile {
  key: TileKey;
  title: string;
  node: ReactNode;
}

interface Pos {
  c: string;
  r: string;
}

/** Every tile keeps ≥2 of 6 columns and a full 220px row in every preset, so
    each panel stays fully readable while the desk rearranges.
    That holds from `md` up. Below it, six columns of a 342px viewport are 47px
    each — a 2-column tile came out 106px wide, which squeezed the top-setup
    card's thesis to a 72px column and clamped away 15 of its 18 lines. On
    phones the loop drops to one column and only reorders (see `phone` below). */
const PRESETS: Record<TileKey, Pos>[] = [
  {
    heat: { c: '1 / span 4', r: '1 / span 1' },
    setup: { c: '5 / span 2', r: '1 / span 1' },
    tape: { c: '1 / span 3', r: '2 / span 1' },
    levels: { c: '4 / span 3', r: '2 / span 1' },
  },
  {
    setup: { c: '1 / span 2', r: '1 / span 2' },
    heat: { c: '3 / span 4', r: '1 / span 1' },
    tape: { c: '3 / span 2', r: '2 / span 1' },
    levels: { c: '5 / span 2', r: '2 / span 1' },
  },
  {
    tape: { c: '1 / span 3', r: '1 / span 1' },
    levels: { c: '4 / span 3', r: '1 / span 1' },
    heat: { c: '1 / span 4', r: '2 / span 1' },
    setup: { c: '5 / span 2', r: '2 / span 1' },
  },
];

/**
 * Reading order of each preset — row first, then column. Derived from PRESETS so
 * the phone stack cannot drift out of step with the desktop arrangement it
 * stands in for.
 */
const PRESET_ORDER: Record<TileKey, number>[] = PRESETS.map(p => {
  const ranked = (Object.keys(p) as TileKey[])
    .map(k => ({ k, at: Number(p[k].r.split(' / ')[0]) * 100 + Number(p[k].c.split(' / ')[0]) }))
    .sort((a, b) => a.at - b.at);
  return Object.fromEntries(ranked.map((x, i) => [x.k, i])) as Record<TileKey, number>;
});

const WorkspaceLoop = ({ tiles }: { tiles: WorkspaceTile[] }) => {
  const [preset, setPreset] = useState(0);
  // Inline grid placement cannot be scoped to a Tailwind breakpoint, so the
  // one-column decision has to be made in JS.
  const phone = !useMediaQuery('(min-width: 768px)');

  useEffect(() => {
    const id = setInterval(() => setPreset(p => (p + 1) % PRESETS.length), 3600);
    return () => clearInterval(id);
  }, []);

  const layout = PRESETS[preset];
  // Phones keep the loop — the tiles still reshuffle, they just reshuffle down a
  // single column, which is what a real workspace does at that width anyway.
  const order = phone
    ? [...tiles].sort((a, b) => PRESET_ORDER[preset][a.key] - PRESET_ORDER[preset][b.key])
    : tiles;

  return (
    <div className={`grid gap-3 ${phone ? 'grid-cols-1 auto-rows-[200px]' : 'grid-cols-6 auto-rows-[220px]'}`}>
      {order.map(tile => (
        <motion.div
          key={tile.key}
          layout
          transition={{ type: 'spring', stiffness: 150, damping: 26 }}
          style={phone ? undefined : { gridColumn: layout[tile.key].c, gridRow: layout[tile.key].r }}
          className="border border-borderSubtle bg-panel rounded-md overflow-hidden flex flex-col"
        >
          <div className="flex items-center gap-1.5 px-2.5 h-7 border-b border-borderSubtle/60 shrink-0">
            <span className="flex gap-[3px]">
              {[0, 1, 2].map(i => (
                <span key={i} className="w-[3px] h-[3px] rounded-full bg-textMuted/60" />
              ))}
            </span>
            <span className="font-mono text-micro font-semibold uppercase tracking-widest text-textSecondary truncate">
              {tile.title}
            </span>
          </div>
          <div className="flex-grow min-h-0 overflow-hidden pointer-events-none select-none">{tile.node}</div>
        </motion.div>
      ))}
    </div>
  );
};

export default WorkspaceLoop;
