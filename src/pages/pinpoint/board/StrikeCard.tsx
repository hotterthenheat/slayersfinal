import { memo, useEffect, useState, type RefObject } from 'react';
import Simulator from '../../../core/simulator';
import { fmtUsd } from '../../../data/gex';
import type { Expiry } from '../../../data/expiry';
import type { LadderMetric } from '../../../data/gex';
import { CALL_INK, PUT_INK, SHOCK, cellMoney, metricName, netInk, type MatrixRow } from '../../../data/pinpoint/matrix';
import { fmtStrike } from '../../../components/pinpoint/ink';
import HoverReadout from '../../../components/ui/HoverReadout';
import TrendLine from '../../../components/gex/TrendLine';

/*
==================================================
  SLAYER TERMINAL - THE STRIKE CARD (pages/pinpoint/board/StrikeCard.tsx)
  The landing's dealer-map read-out, floating over the board's lane.
==================================================

  ══ THE OVERLAY NOAH MEANT ═══════════════════════════════════════════════

  The dealer positioning map on the landing page answers a hover with one
  card: the strike and which side it is heavy on, the net figure and what
  it means for dealers, whether the exposure is building or draining, the
  two legs and the other greeks, the cumulative from spot, and fifteen
  minutes of the reading as a line. Noah, with that card in a screenshot:
  "this is the overlay i mean for the gex page." So this is that card,
  fed from the board's own book — the same row the table draws, the same
  history the time strip draws — and drawn in the board's own ink.

  ══ THE BOARD'S INK, NOT THE LANDING'S ═══════════════════════════════════

  The landing colours gamma green and red. This section's rule is that hue
  is the SIDE — violet where a level is put-dominant, amber where it is
  call-dominant — and green and red are for price alone. A card in the
  landing's colours beside a row in the board's would be two colour
  languages on one strike. The words the landing prints are kept; the ink
  is the section's.
*/

export interface StrikeCardData {
  strike: number;
  pin: boolean;
  metric: LadderMetric;
  net: number;
  put: number;
  call: number;
  dex: number | null;
  vex: number | null;
  /** The lead family from spot to this strike, inclusive. */
  cum: number;
  /** The last quarter-hour of the lead net at this strike, on the row's
      own scale — empty for a family with no history. */
  series: number[];
  spot: number;
}

const gammaWords = (net: number) => (net > 0 ? 'moves amplified' : 'dips absorbed');

/** A hex ink at an alpha, for a badge ground that must sit on near-black. */
const rgba = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(3)})`;
};

/**
 * The lead family summed from spot out to a strike, the strike included.
 * Rows come in strike order, either direction; spot is between two of them.
 */
export function cumFromSpot(rows: readonly MatrixRow[], spot: number, strike: number, metric: LadderMetric): number {
  let run = 0;
  const above = strike >= spot;
  for (const r of rows) {
    const inside = above ? r.strike >= spot && r.strike <= strike : r.strike < spot && r.strike >= strike;
    if (inside) run += r.cells[metric]?.net ?? 0;
  }
  return run;
}

/** How many readings the card's line carries — a quarter-hour, one a minute. */
export const CARD_MINUTES = 16;

/**
 * The strike's recent readings, rescaled so the last one IS the figure the
 * row prints. The history is whole-book and the row is that value after the
 * expiry's decay, so read raw the line would end at a number the card
 * contradicts one line above — the landing's own note, second caller.
 */
export function seriesFor(ticker: string, expiry: Expiry, strike: number, net: number): number[] {
  const snaps = Simulator.getExpiryHistory(ticker, expiry, CARD_MINUTES);
  const out: number[] = [];
  for (const s of snaps) {
    const lvl = s.levels.find(l => l.strike === strike);
    if (lvl && Number.isFinite(lvl.value)) out.push(lvl.value);
  }
  const rawNow = out[out.length - 1];
  if (!rawNow) return out;
  const k = net / rawNow;
  return out.map(v => v * k);
}

export const StrikeCard = memo(function StrikeCard({ d }: { d: StrikeCardData }) {
  const callHeavy = Math.abs(d.call) >= Math.abs(d.put);
  const side = callHeavy ? CALL_INK : PUT_INK;
  const recent = d.series;
  /* Building or draining follows the MAGNITUDE — a put wall deepening from
     −$400M to −$800M is building, not draining. */
  const rising = recent.length > 1 && Math.abs(recent[recent.length - 1]) >= Math.abs(recent[0]);
  const gamma = d.metric === 'gex';
  const short = d.net > 0;
  /* "Net gamma", as the landing says it — the family's name without its
     "exposure", which the figure already is. */
  const name = metricName(d.metric).toLowerCase().replace(/ exposure$/, '');
  return (
    <div data-pp-hover={d.strike} data-pp-hover-side={callHeavy ? 'call' : 'put'} className="w-[264px]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-bold tnum text-textPrimary">
          Strike {fmtStrike(d.strike)}
          {d.pin && <span className="ml-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-textSecondary">pin</span>}
        </span>
        <span
          className="inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: side, borderColor: rgba(side, 0.35), background: rgba(side, 0.1) }}
        >
          {callHeavy ? 'call-heavy' : 'put-heavy'}
        </span>
      </div>

      <div className="mt-2">
        <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Net {name}</div>
        <div className="font-mono text-[16px] font-bold leading-6 tnum" style={{ color: netInk(d.net) }}>
          {d.net >= 0 ? '+' : ''}
          {fmtUsd(d.net)}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-textSecondary">
          {gamma ? `dealer ${short ? 'short' : 'long'} gamma · ${gammaWords(d.net)}` : `${callHeavy ? 'call' : 'put'}-dominant · per ${SHOCK[d.metric]}`}
        </div>
        {recent.length > 1 && (
          <div className="font-mono text-[10px] uppercase tracking-wider text-textSecondary">{rising ? '↗ exposure building' : '↘ exposure draining'}</div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-textMuted tnum">
        <span>
          C <span style={{ color: CALL_INK }}>{cellMoney(d.call)}</span>
        </span>
        <span>
          P <span style={{ color: PUT_INK }}>{cellMoney(d.put)}</span>
        </span>
        {d.dex !== null && d.metric !== 'dex' && (
          <span>
            DEX <span className="text-textSecondary">{cellMoney(d.dex)}</span>
          </span>
        )}
        {d.vex !== null && d.metric !== 'vex' && (
          <span>
            VEX <span className="text-textSecondary">{cellMoney(d.vex)}</span>
          </span>
        )}
      </div>

      <div className="mt-2 border-t border-borderSubtle/60 pt-2 font-mono text-[10px] uppercase tracking-wider text-textMuted tnum">
        From spot to {fmtStrike(d.strike)} · <span style={{ color: netInk(d.cum) }}>{fmtUsd(d.cum)}</span>
        {gamma && <> · {gammaWords(d.cum)}</>}
      </div>

      {recent.length > 1 && (
        <div className="mt-2 border-t border-borderSubtle/60 pt-2">
          <TrendLine points={recent} ink="rgba(255,255,255,0.6)" />
          <div className="flex justify-between font-mono text-[10px] text-textMuted">
            <span>15m ago</span>
            <span>latest</span>
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * Where the card floats.
 *
 * The pointer, while it is over the body — the card rides just off it and
 * the house read-out keeps it on screen. From the keyboard there is no
 * pointer, so the card sits at the row it is about, off the strike column.
 * Over the pane there is no card: the pointer went there to read the pane,
 * and with the pane out the keyboard's card stands down too — the pane is
 * already the strike's read-out.
 *
 * Only this component re-renders on pointer movement; the panel behind it,
 * with its sixty-one memoised rows, does not hear about it.
 */
export function CursorCard({ bodyRef, data, keysOn, paneOpen, tableW }: { bodyRef: RefObject<HTMLDivElement | null>; data: StrikeCardData | null; keysOn: boolean; paneOpen: boolean; tableW: number }) {
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const move = (e: MouseEvent) => setPt({ x: e.clientX, y: e.clientY });
    const leave = () => setPt(null);
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', leave);
    return () => {
      el.removeEventListener('mousemove', move);
      el.removeEventListener('mouseleave', leave);
    };
  }, [bodyRef]);
  if (!data) return null;
  /* The row the card is about: the card sits under it (or over it), never
     on it — a card on the row hides the figure it is explaining. */
  const row = bodyRef.current?.querySelector<HTMLElement>(`[data-matrix-row="${data.strike}"]`);
  const r = row?.getBoundingClientRect();
  let at = pt;
  if (!at) {
    /* From the keyboard, at the row — unless the pane is out, which is
       already describing the strike and may be where the pointer is. */
    if (!keysOn || paneOpen || !r) return null;
    at = { x: r.left + tableW, y: r.top + r.height / 2 };
  }
  /* The room: this panel's body, less the pane when it is out beside the
     table — the card flips left of the pointer rather than run onto it. */
  const body = bodyRef.current?.getBoundingClientRect();
  /* Read only while the pane is out: on the render that closes it the
     pane is still in the DOM, and a card placed against it would flip. */
  const pane = paneOpen ? bodyRef.current?.parentElement?.querySelector<HTMLElement>('[data-pp-pane-w]')?.getBoundingClientRect() : undefined;
  const within = body ? { left: body.left, right: pane && pane.left > body.left + 320 ? pane.left : body.right } : undefined;
  return (
    <HoverReadout x={at.x} y={at.y} avoid={r ? { top: r.top, bottom: r.bottom } : undefined} within={within}>
      <div data-pp-hover-by={pt ? 'pointer' : 'keys'}>
        <StrikeCard d={data} />
      </div>
    </HoverReadout>
  );
}
