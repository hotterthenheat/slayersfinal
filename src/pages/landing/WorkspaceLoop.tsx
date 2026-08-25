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
    each panel stays fully readable while the desk rearranges. */
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

const WorkspaceLoop = ({ tiles }: { tiles: WorkspaceTile[] }) => {
  const [preset, setPreset] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPreset(p => (p + 1) % PRESETS.length), 3600);
    return () => clearInterval(id);
  }, []);

  const layout = PRESETS[preset];

  return (
    <div className="grid grid-cols-6 auto-rows-[220px] gap-3">
      {tiles.map(tile => (
        <motion.div
          key={tile.key}
          layout
          transition={{ type: 'spring', stiffness: 150, damping: 26 }}
          style={{ gridColumn: layout[tile.key].c, gridRow: layout[tile.key].r }}
          className="border border-borderSubtle bg-panel rounded-md overflow-hidden flex flex-col"
        >
          <div className="flex items-center gap-1.5 px-2.5 h-7 border-b border-borderSubtle/60 shrink-0">
            <span className="flex gap-[3px]">
              {[0, 1, 2].map(i => (
                <span key={i} className="w-[3px] h-[3px] rounded-full bg-textMuted/60" />
              ))}
            </span>
            <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-textSecondary truncate">
              {tile.title}
            </span>
          </div>
          {/*
            The tiles are 220px rows holding full panels, so every one of them
            ends mid-content. Measured across the three presets, the hard edge
            was cutting text in half rather than ending it:

                Options tape   a whole row down to a 4px sliver — "09:38:28"
                Key levels     "510" showing 3px of 14, "-0.45%" 9 of 12
                Top setup      the why-paragraph guillotined mid-line

            A fade says "this continues", which is both true and what the real
            desk does — a Pulse widget scrolls when its content outgrows it.
          */}
          <div className="relative flex-grow min-h-0 overflow-hidden pointer-events-none select-none">
            {tile.node}
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-b from-transparent to-panel"
            />
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default WorkspaceLoop;
