import { describe, it, expect } from 'vitest';
import { computeClock, lottoGateArmed } from './mocClock';

/*
  The Lotto acceptance gate, pinned to the five market states it was measured in.

  Before this, with the page clock faked to each of them, the gate fired in all
  five and the board was unreachable in every one — including after the close
  and on a Saturday, where it asked for consent to a total loss on a session
  that had already settled. Two states the audit could not reach at all
  (`NO CLEAN AUCTION EDGE` among them) turned out to be reachable the moment the
  wall came down: it was the gate hiding them, not the model failing to produce
  them.

  ET is UTC-4 in August, so each timestamp below is the ET wall clock plus four
  hours. Fixed instants, not offsets from now, so this cannot pass by running at
  a lucky time of day.
*/

const at = (iso: string) => computeClock(Date.parse(iso));

const STATES = [
  { name: 'pre-market 09:00 ET', iso: '2026-08-03T13:00:00Z', open: false, moc: false, label: 'pre-market' },
  { name: 'mid-session 13:00 ET', iso: '2026-08-03T17:00:00Z', open: true, moc: false, label: 'market open' },
  { name: 'MOC window 15:50 ET', iso: '2026-08-03T19:50:00Z', open: true, moc: true, label: 'MOC window open' },
  { name: 'after close 17:30 ET', iso: '2026-08-03T21:30:00Z', open: false, moc: false, label: 'after hours, closed' },
  { name: 'weekend Sat 12:00 ET', iso: '2026-08-01T16:00:00Z', open: false, moc: false, label: 'weekend, closed' },
];

describe('the ET clock the Lotto desk runs on', () => {
  for (const s of STATES) {
    it(`reads ${s.name} as ${s.label}`, () => {
      const c = at(s.iso);
      expect(c.marketOpen).toBe(s.open);
      expect(c.mocOpen).toBe(s.moc);
      expect(c.label).toBe(s.label);
    });
  }

  it('opens the MOC window at 15:45 and shuts it at the cross', () => {
    expect(at('2026-08-03T19:44:59Z').mocOpen).toBe(false);
    expect(at('2026-08-03T19:45:00Z').mocOpen).toBe(true);
    expect(at('2026-08-03T19:59:59Z').mocOpen).toBe(true);
    // 16:00:00 ET is the cross itself — the window is shut and so is the market.
    expect(at('2026-08-03T20:00:00Z').mocOpen).toBe(false);
    expect(at('2026-08-03T20:00:00Z').marketOpen).toBe(false);
  });

  it('never calls a Saturday afternoon an auction window', () => {
    expect(at('2026-08-01T19:50:00Z').mocOpen).toBe(false);
    expect(at('2026-08-02T19:50:00Z').mocOpen).toBe(false);
  });

  /*
    The two cases a weekday test cannot see. This clock was weekday-only for one
    commit, which meant Thanksgiving read as a normal session and armed the gate
    at 15:45 for a market that never opened, and the half-days missed their real
    pre-cross window entirely — arming instead nearly three hours after the
    13:00 bell. core/calendar already knew both; the fix was to stop having a
    second opinion.
  */
  it('knows a market holiday is not a session', () => {
    // Thanksgiving 2026 is Thursday 11/26. ET is UTC-5 in November.
    const noon = at('2026-11-26T17:00:00Z');
    expect(noon.marketOpen).toBe(false);
    expect(noon.label).toBe('market holiday');
    expect(at('2026-11-26T20:50:00Z').mocOpen).toBe(false);
  });

  it('puts the auction window before the bell on a half day', () => {
    // The Friday after Thanksgiving closes at 13:00 ET.
    expect(at('2026-11-27T17:30:00Z').mocOpen).toBe(false); // 12:30 ET, still trading
    expect(at('2026-11-27T17:45:00Z').mocOpen).toBe(true); // 12:45 ET, the window
    expect(at('2026-11-27T17:59:00Z').mocOpen).toBe(true); // 12:59 ET
    expect(at('2026-11-27T18:00:00Z').marketOpen).toBe(false); // 13:00 ET, shut
    // And the old rule's window is dead on that day: 15:50 ET is after the bell.
    expect(at('2026-11-27T20:50:00Z').mocOpen).toBe(false);
    expect(at('2026-11-27T17:30:00Z').label).toBe('market open, early close');
  });
});

describe('the acceptance gate is proportional to what it acknowledges', () => {
  it('withholds the board only inside the closing-auction window', () => {
    const armed = STATES.filter(s => lottoGateArmed(at(s.iso))).map(s => s.name);
    expect(armed).toEqual(['MOC window 15:50 ET']);
  });

  it('does not ask for consent when there is nothing to trade', () => {
    for (const s of STATES.filter(x => !x.open)) {
      expect(lottoGateArmed(at(s.iso))).toBe(false);
    }
  });

  it('leaves the board reachable through the whole session bar the last fifteen minutes', () => {
    /*
      Walk the Monday session in five-minute steps and collect every slot that
      arms. Five minutes rather than thirty on purpose: a coarser walk steps
      straight over the window, and an empty result would then prove nothing —
      it would look identical to a gate that never fires at all.
    */
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const armed: string[] = [];
    for (let m = 9 * 60 + 30; m < 16 * 60; m += 5) {
      const iso = `2026-08-03T${String(Math.floor(m / 60) + 4).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00Z`;
      if (lottoGateArmed(at(iso))) armed.push(hhmm(m));
    }
    expect(armed).toEqual(['15:45', '15:50', '15:55']);
    // Three slots out of 78: the board is its own page for the other 75.
    expect(armed.length / 78).toBeLessThan(0.05);
  });
});
