import { useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import {
  MAX_ALERTS, alertLabel, armFlow, armGexFlip, armIndicator, armLevel, armNewKing,
  armPrice, armWallMove, clearAlerts, rearmAlert, removeAlert, useAlerts,
  type Alert, type IndicatorSource, type LevelName,
} from './alertStore';
import { ALERT } from './palette';

/*
==================================================
  SLAYER TERMINAL - ALERTS MENU (gex/AlertsMenu.tsx)

  Arm the things this pane can watch, see what is
  armed, and take them off.
==================================================

  THE MARKS ON THE PANE ARE THE ALERT. This menu is only where you put one
  down and take it away — the state a reader actually watches lives on the
  pane (the price kind's dashed line, and the armed rail for everything
  else), because the whole toolbar this menu hangs off is hidden until the
  cursor is over its pane. A badge here would be invisible almost all of the
  time, and an alert you cannot see fire is not an alert.

  EVERY KIND IS A CHIP, NOT A FORM (T-22). The four levels, the pane's own
  indicators, the book's three state changes and the tape's premium floors
  are all finite sets — chips arm in one click and cannot be typed wrong.
  The one thing that is genuinely a number the reader owns, a price, keeps
  the one input. An armed chip lights and says so; arming it again is
  refused, not doubled.

  The last line is the most important one in the file. This fires while the
  tab is open and not otherwise, and saying so is the difference between a
  modest feature and a promise that quietly is not kept.
*/

interface AlertsMenuProps {
  ticker: string;
  /** Where the market is — fixes which way a new price alert has to be
      crossed, and seeds the box so the reader types near the price. */
  spot: number;
  /** The pane's timeframe — an indicator alert is stamped with it, because
      an EMA on 1m and on 15m are different lines. */
  tf: string;
}

const LEVEL_CHIPS: { level: LevelName; label: string }[] = [
  { level: 'callWall', label: 'Call wall' },
  { level: 'putWall', label: 'Put wall' },
  { level: 'flip', label: 'Flip' },
  { level: 'king', label: 'King' },
];

const INDICATOR_CHIPS: { source: IndicatorSource; threshold: number; label: string }[] = [
  { source: 'vwap', threshold: 0, label: 'VWAP' },
  { source: 'ema9', threshold: 0, label: 'EMA 9' },
  { source: 'ema21', threshold: 0, label: 'EMA 21' },
  { source: 'ema50', threshold: 0, label: 'EMA 50' },
  { source: 'rsi', threshold: 70, label: 'RSI 70' },
  { source: 'rsi', threshold: 30, label: 'RSI 30' },
];

const FLOW_CHIPS = [
  { floor: 250_000, label: '$250K' },
  { floor: 1_000_000, label: '$1M' },
  { floor: 5_000_000, label: '$5M' },
];

const WALL_CHIPS = [2, 4];

const AlertsMenu = ({ ticker, spot, tf }: AlertsMenuProps) => {
  const alerts = useAlerts(ticker);
  const [draft, setDraft] = useState('');
  const [refused, setRefused] = useState('');

  const full = alerts.length >= MAX_ALERTS;
  const capMsg = `${MAX_ALERTS} is the most one pane carries`;

  /** One gate for every chip: arm it, or say exactly why not. */
  const tryArm = (fn: () => Alert | null, already: boolean) => {
    if (already) {
      setRefused('Already watching that');
      return;
    }
    if (full) {
      setRefused(capMsg);
      return;
    }
    if (!fn()) {
      setRefused('Already watching that');
      return;
    }
    setRefused('');
  };

  const submit = () => {
    const price = Number(draft.trim());
    if (!Number.isFinite(price) || price <= 0) {
      setRefused('That is not a price');
      return;
    }
    if (full) {
      setRefused(capMsg);
      return;
    }
    if (!armPrice(ticker, price, spot)) {
      setRefused('There is already an alert there');
      return;
    }
    setDraft('');
    setRefused('');
  };

  const chipClass = (active: boolean) =>
    `px-1.5 py-[3px] rounded border font-mono text-[9px] leading-[12px] transition-colors ${
      active
        ? 'cursor-default'
        : 'border-borderSubtle text-textSecondary hover:text-textPrimary hover:border-borderMuted'
    }`;
  const chipStyle = (active: boolean) =>
    active ? { color: ALERT, borderColor: `${ALERT}99` } : undefined;

  const section = (label: string) => (
    <div className="px-2.5 pt-1.5 pb-1 font-mono text-[8px] uppercase tracking-[0.14em] text-textMuted">
      {label}
    </div>
  );

  return (
    <div className="w-[248px] py-1">
      <div className="flex items-center gap-1.5 px-2.5 pb-1.5">
        <input
          value={draft}
          onChange={e => {
            setDraft(e.target.value);
            setRefused('');
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
            /* The desk listens for Escape too — the innermost open thing
               takes the key and nothing else sees it. */
            if (e.key === 'Escape') e.stopPropagation();
          }}
          inputMode="decimal"
          placeholder={spot > 0 ? spot.toFixed(2) : 'Price'}
          aria-label={`Alert price for ${ticker}`}
          className="w-full min-w-0 bg-inset border border-borderSubtle rounded px-1.5 py-1 font-mono text-[11px] tnum text-textPrimary placeholder:text-textMuted focus:outline-none focus:border-borderMuted"
        />
        <button
          onClick={submit}
          disabled={full}
          title={full ? capMsg : `Alert me at this price`}
          className="shrink-0 px-2 py-1 rounded border border-borderSubtle bg-inset font-mono text-[10px] text-textSecondary hover:text-textPrimary hover:border-borderMuted disabled:opacity-40 disabled:hover:text-textSecondary transition-colors"
        >
          Set
        </button>
      </div>

      {refused && (
        <div role="status" className="px-2.5 pb-1 font-mono text-[9px] text-bear">
          {refused}
        </div>
      )}

      {section('Level crossed — follows the level')}
      <div className="flex flex-wrap gap-1 px-2.5">
        {LEVEL_CHIPS.map(c => {
          const on = alerts.some(a => a.kind === 'level' && a.level === c.level);
          return (
            <button key={c.level} onClick={() => tryArm(() => armLevel(ticker, c.level), on)} aria-pressed={on} className={chipClass(on)} style={chipStyle(on)}>
              {c.label}
            </button>
          );
        })}
      </div>

      {section(`Indicator crossed — on ${tf}`)}
      <div className="flex flex-wrap gap-1 px-2.5">
        {INDICATOR_CHIPS.map(c => {
          const on = alerts.some(
            a => a.kind === 'indicator' && a.source === c.source && a.tf === tf && Math.abs(a.threshold - c.threshold) < 1e-9
          );
          return (
            <button key={c.label} onClick={() => tryArm(() => armIndicator(ticker, c.source, tf, c.threshold), on)} aria-pressed={on} className={chipClass(on)} style={chipStyle(on)}>
              {c.label}
            </button>
          );
        })}
      </div>

      {section('Exposure changes')}
      <div className="flex flex-wrap gap-1 px-2.5">
        {(() => {
          const gexOn = alerts.some(a => a.kind === 'gexflip');
          const kingOn = alerts.some(a => a.kind === 'newking');
          return (
            <>
              <button onClick={() => tryArm(() => armGexFlip(ticker), gexOn)} aria-pressed={gexOn} className={chipClass(gexOn)} style={chipStyle(gexOn)}>
                GEX flips sign
              </button>
              <button onClick={() => tryArm(() => armNewKing(ticker), kingOn)} aria-pressed={kingOn} className={chipClass(kingOn)} style={chipStyle(kingOn)}>
                New king
              </button>
              {WALL_CHIPS.map(n => {
                const on = alerts.some(a => a.kind === 'wallmove' && a.strikes === n);
                return (
                  <button key={n} onClick={() => tryArm(() => armWallMove(ticker, n), on)} aria-pressed={on} className={chipClass(on)} style={chipStyle(on)}>
                    Wall ±{n}
                  </button>
                );
              })}
            </>
          );
        })()}
      </div>

      {section('Flow — a print over')}
      <div className="flex flex-wrap gap-1 px-2.5 pb-1">
        {FLOW_CHIPS.map(c => {
          const on = alerts.some(a => a.kind === 'flow' && Math.abs(a.floor - c.floor) < 1e-9);
          return (
            <button key={c.floor} onClick={() => tryArm(() => armFlow(ticker, c.floor, Date.now()), on)} aria-pressed={on} className={chipClass(on)} style={chipStyle(on)}>
              {c.label}
            </button>
          );
        })}
      </div>

      {alerts.length === 0 ? (
        <div className="border-t border-borderSubtle/60 mt-1 px-2.5 py-2 text-center font-mono text-[10px] text-textMuted">
          Nothing armed on {ticker}
        </div>
      ) : (
        <div className="border-t border-borderSubtle/60 mt-1 pt-1">
          {alerts.map(a => (
            <div key={a.id} className="flex items-center gap-1.5 px-2.5 py-1">
              <span
                className="w-1.5 h-1.5 shrink-0 rounded-full"
                style={{ background: a.firedAt ? ALERT : 'transparent', border: a.firedAt ? 'none' : '1px solid currentColor' }}
                aria-hidden
              />
              <span className={`font-mono text-[10px] tnum ${a.firedAt ? 'font-semibold' : 'text-textPrimary'}`} style={a.firedAt ? { color: ALERT } : undefined}>
                {alertLabel(a)}
              </span>
              {a.firedAt > 0 && (
                <span className="font-mono text-[9px] text-textMuted">fired</span>
              )}
              {a.firedAt > 0 && (
                <button
                  onClick={() => rearmAlert(ticker, a.id, spot, Date.now())}
                  aria-label={`Arm the ${alertLabel(a)} alert again`}
                  title="Arm it again"
                  className="ml-auto shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.06] transition-colors"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                </button>
              )}
              <button
                onClick={() => removeAlert(ticker, a.id)}
                aria-label={`Remove the ${alertLabel(a)} alert`}
                title="Remove"
                className={`${a.firedAt > 0 ? '' : 'ml-auto'} shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.06] transition-colors`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {alerts.length > 1 && (
            <button
              onClick={() => clearAlerts(ticker)}
              className="w-full px-2.5 py-1 text-left font-mono text-[9px] uppercase tracking-wider text-textMuted hover:text-textPrimary transition-colors"
            >
              Remove all
            </button>
          )}
        </div>
      )}

      <div className="border-t border-borderSubtle/60 mt-1 px-2.5 pt-1.5 font-mono text-[9px] leading-[12px] text-textMuted">
        Marks the pane while this tab is open. Nothing is sent anywhere.
      </div>
    </div>
  );
};

export default AlertsMenu;
