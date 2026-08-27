/*
==================================================
  SLAYER TERMINAL - PULSE DESK · KEY LEVELS
  The structural ladder with the INSTRUMENT LENS
  (Noah, 2026-08-18): on index-family names the
  walls, flip, pin and king re-denominate into the
  cash index or the futures — SPY · SPX · ES — so
  the map reads in the instrument you trade.
  Distances recompute against the converted spot
  (the basis shifts absolutes, honesty demands the
  percentages follow). Non-index names never show
  the lens.
==================================================
*/

import { useMemo, useState } from 'react';
import KeyLevelsRail from '../../components/gex/KeyLevelsRail';
import GhostStrip from '../../components/ui/GhostStrip';
import { twinFamilyFor, twinLabel, twinMeasureFor, twinPrice, fmtTwin, type TwinLensKey } from '../../data/indexTwins';
import type { WorkspaceCtx } from './registry';

const KeyLevelsWidget = ({ ctx }: { ctx: WorkspaceCtx }) => {
  const [lens, setLens] = useState<TwinLensKey>('etf');
  const fam = twinFamilyFor(ctx.ticker);
  const active: TwinLensKey = fam ? lens : 'etf';

  const rows = ctx.pulse.keyLevels;
  const maxPressure = rows.reduce((a, l) => Math.max(a, l.pressure), 1);
  const etfSpot = rows.find(r => r.kind === 'spot')?.price ?? ctx.gex.levels.spot;
  /* T-17: the lens stands on a MEASUREMENT of the pair series, refreshed
     with the rows (they move per tick, so the last hour's pairs do too). */
  const tm = useMemo(() => (fam ? twinMeasureFor(fam) : null), [fam, rows]);

  const shown = useMemo(() => {
    if (!fam || !tm || active === 'etf') return rows;
    const spotTwin = twinPrice(fam, active, etfSpot, tm);
    return rows.map(r => {
      const price = twinPrice(fam, active, r.price, tm);
      return {
        ...r,
        price,
        distPct: r.kind === 'spot' ? 0 : ((price - spotTwin) / (spotTwin || 1)) * 100,
      };
    });
  }, [rows, fam, tm, active, etfSpot]);

  return (
    <div className="h-full min-h-0 flex flex-col">
      {fam && (
        <div className="shrink-0 px-2 py-1.5 border-b border-borderSubtle/60 flex items-center gap-2 flex-wrap">
          <GhostStrip
            label="Instrument"
            value={active}
            options={(['etf', 'index', 'futures'] as TwinLensKey[]).map(k => ({ value: k, label: twinLabel(fam, k) }))}
            onChange={setLens}
          />
          {/* The conversion state is itself a read — the carry, spoken. */}
          {tm && (
            <span className="ml-auto font-mono text-[9px] text-textMuted tnum">
              {fam.futures} {fmtTwin(twinPrice(fam, 'futures', etfSpot, tm))} · +{fmtTwin(tm.basis)} over {fam.index}{' '}
              {tm.sampled > 0 ? `· measured ${tm.sampled}m` : '· inferred'}
            </span>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <KeyLevelsRail
          rows={shown}
          maxPressure={maxPressure}
          priceFormat={fam && active !== 'etf' ? fmtTwin : undefined}
        />
      </div>
    </div>
  );
};

export default KeyLevelsWidget;
