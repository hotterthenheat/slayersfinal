import { useState } from 'react';
import { Bell, RotateCcw, X } from 'lucide-react';
import { MAX_ALERTS, addAlert, clearAlerts, rearmAlert, removeAlert, useAlerts } from './alertStore';

/*
==================================================
  SLAYER TERMINAL - ALERTS MENU (gex/AlertsMenu.tsx)

  Set a price to be told about, see the ones
  already set, and take them off.
==================================================

  THE LINE ON THE CHART IS THE ALERT. This menu is only where you put one
  down and take it away — the state a reader actually watches lives on the
  tape, because the whole toolbar this menu hangs off is hidden until the
  cursor is over its pane. A badge here would be invisible almost all of the
  time, and an alert you cannot see fire is not an alert.

  The last line is the most important one in the file. This fires while the
  tab is open and not otherwise, and saying so is the difference between a
  modest feature and a promise that quietly is not kept.
*/

interface AlertsMenuProps {
  ticker: string;
  /** Where the market is — fixes which way a new alert has to be crossed, and
      seeds the box so the reader is typing near the price, not from zero. */
  spot: number;
}

const AlertsMenu = ({ ticker, spot }: AlertsMenuProps) => {
  const alerts = useAlerts(ticker);
  const [draft, setDraft] = useState('');
  const [refused, setRefused] = useState('');

  const full = alerts.length >= MAX_ALERTS;

  const submit = () => {
    const price = Number(draft.trim());
    if (!Number.isFinite(price) || price <= 0) {
      setRefused('That is not a price');
      return;
    }
    if (full) {
      setRefused(`${MAX_ALERTS} is the most one chart carries`);
      return;
    }
    if (!addAlert(ticker, price, spot)) {
      setRefused('There is already an alert there');
      return;
    }
    setDraft('');
    setRefused('');
  };

  return (
    <div className="w-[228px] py-1">
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
          title={full ? `${MAX_ALERTS} is the most one chart carries` : `Alert me at this price`}
          className="shrink-0 px-2 py-1 rounded border border-borderSubtle bg-inset font-mono text-[10px] text-textSecondary hover:text-textPrimary hover:border-borderMuted disabled:opacity-40 disabled:hover:text-textSecondary transition-colors"
        >
          Set
        </button>
      </div>

      {refused && (
        <div role="status" className="px-2.5 pb-1.5 font-mono text-[9px] text-bear">
          {refused}
        </div>
      )}

      {alerts.length === 0 ? (
        <div className="px-2.5 py-3 text-center font-mono text-[10px] text-textMuted">
          No alerts on {ticker}
        </div>
      ) : (
        <div className="border-t border-borderSubtle/60 pt-1">
          {alerts.map(a => (
            <div key={a.id} className="flex items-center gap-1.5 px-2.5 py-1">
              <Bell
                className={`w-2.5 h-2.5 shrink-0 ${a.firedAt ? 'text-[#FF9500]' : 'text-textMuted'}`}
                aria-hidden
              />
              <span className="font-mono text-[11px] font-semibold tnum text-textPrimary">
                {a.price.toFixed(2)}
              </span>
              <span className="font-mono text-[9px] text-textMuted">
                {a.firedAt ? 'reached' : a.above ? 'above' : 'below'}
              </span>
              {a.firedAt > 0 && (
                <button
                  onClick={() => rearmAlert(ticker, a.id, spot)}
                  aria-label={`Set the ${a.price.toFixed(2)} alert again`}
                  title="Set it again"
                  className="ml-auto shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.06] transition-colors"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                </button>
              )}
              <button
                onClick={() => removeAlert(ticker, a.id)}
                aria-label={`Remove the ${a.price.toFixed(2)} alert`}
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
        Marks the chart while this tab is open. Nothing is sent anywhere.
      </div>
    </div>
  );
};

export default AlertsMenu;
