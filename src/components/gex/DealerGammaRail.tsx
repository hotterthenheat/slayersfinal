import type { ExposureProfileData } from '../../types/gex';

/**
 * Dealer gamma by price — a compact vertical profile of net GEX per strike,
 * zero-centred: positive (dealer long gamma / support) extends right in green,
 * negative (short gamma / amplifying) extends left in red. Spot, flip and the
 * walls are marked. Reads straight off the existing exposure profile — no new
 * math. Pairs with the candle chart to form the gamma terminal.
 */
const DealerGammaRail = ({ data }: { data: ExposureProfileData }) => {
  const max = data.maxAbs.gex || 1;
  const { spot, callWall, putWall, flip, pin } = data.levels;
  // nearest strike to a price, for placing the marker chips
  const nearest = (price: number) =>
    data.strikes.reduce((best, s) => (Math.abs(s.strike - price) < Math.abs(best - price) ? s.strike : best), data.strikes[0]?.strike ?? price);
  const spotStrike = nearest(spot);
  const flipStrike = nearest(flip);

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* zero-line legend */}
      <div className="flex items-center justify-between px-2 pb-1.5 shrink-0 font-mono text-[9px] uppercase tracking-wider text-textMuted">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-bear/70" /> short γ</span>
        <span className="inline-flex items-center gap-1">long γ <span className="w-2 h-2 rounded-sm bg-bull/70" /></span>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        {data.strikes.map(s => {
          const net = s.gex.net;
          const pct = Math.min(1, Math.abs(net) / max) * 50; // half-width percentage
          const pos = net >= 0;
          const isSpot = s.strike === spotStrike;
          const isFlip = s.strike === flipStrike;
          const isCall = s.strike === callWall;
          const isPut = s.strike === putWall;
          const isPin = s.strike === pin;
          const tag = isCall ? 'CW' : isPut ? 'PW' : isPin ? 'MP' : isFlip ? 'FLIP' : '';
          return (
            <div
              key={s.strike}
              className={`relative flex items-center gap-1.5 flex-1 min-h-0 ${isSpot ? 'bg-white/[0.04]' : ''}`}
            >
              <span className={`w-11 shrink-0 text-right font-mono text-[9px] tnum ${isSpot ? 'text-textPrimary font-semibold' : 'text-textMuted'}`}>
                {s.strike}
              </span>
              <div className="relative flex-1 h-full">
                {/* centre zero line */}
                <span className="absolute left-1/2 top-0 bottom-0 w-px bg-borderSubtle/70" />
                {/* net-gamma bar */}
                <span
                  className={`absolute top-1/2 -translate-y-1/2 h-[42%] rounded-[1px] ${pos ? 'bg-bull/80' : 'bg-bear/80'}`}
                  style={pos ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }}
                />
                {/* level marker line */}
                {(isSpot || isFlip || isCall || isPut) && (
                  <span
                    className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-px ${
                      isSpot ? 'bg-textPrimary/50' : isFlip ? 'bg-flip/60' : isCall ? 'bg-bull/50' : 'bg-bear/50'
                    }`}
                  />
                )}
              </div>
              {tag && (
                <span
                  className={`w-9 shrink-0 font-mono text-[8px] font-semibold uppercase tracking-wider ${
                    isCall ? 'text-bull' : isPut ? 'text-bear' : isFlip ? 'text-flip' : 'text-textMuted'
                  }`}
                >
                  {tag}
                </span>
              )}
              {!tag && <span className="w-9 shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DealerGammaRail;
