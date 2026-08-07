import { describe, it, expect } from 'vitest';
import { enrichPrint } from './flowtape';
import { buildGammaTape, dealerSignOf } from './gammatape';
import { settledOI } from '../core/openInterest';
import type { FlowPrint } from '../types/flowdesk';
import type { TapeOrder } from '../types/market';

/*
  P4.3 — the Gamma Tape turns each print's trade_greeks + aggressor into a
  dealer-inventory change. The sign convention is the whole product, so it is
  pinned here on hand-built prints, and the aggregate invariants are checked on a
  generated session tape.
*/

function mkPrint(o: Partial<FlowPrint>): FlowPrint {
  return {
    id: 1,
    time: '10:00:00',
    ticker: 'SPY',
    legs: 1,
    strike: 500,
    right: 'C',
    otmPct: 0,
    expiry: '01/01/2027',
    dte: 7,
    fill: 2,
    bid: 1.95,
    ask: 2.05,
    fillPos: 0.9,
    side: 'ASK',
    flowScore: 60,
    ratioLabel: 'ASK 60%',
    ratioBidPct: 40,
    size: 100,
    premium: 20000,
    volume: 400,
    oi: settledOI(1000),
    deltaOI: settledOI(0),
    spot: 500,
    iv: 15,
    volOverOI: 0.4,
    strat: '—',
    sweep: false,
    greeks: { delta: 0.5, gamma: 0.02, theta: -0.1, vega: 0.3, rho: 0.1 },
    ...o,
  };
}

describe('P4.3 — dealer sign convention', () => {
  it('maps the exchange aggressor to the dealer position', () => {
    expect(dealerSignOf(mkPrint({ side: 'ASK' }))).toBe(-1); // customer bought -> dealer short
    expect(dealerSignOf(mkPrint({ side: 'BID' }))).toBe(1); // customer sold -> dealer long
    expect(dealerSignOf(mkPrint({ side: 'MID' }))).toBe(0); // no initiator
  });

  it('a customer buying (any right) sheds dealer gamma; selling adds it', () => {
    const callBuy = buildGammaTape([mkPrint({ side: 'ASK', right: 'C' })], 'SPY').prints[0];
    const putBuy = buildGammaTape([mkPrint({ side: 'ASK', right: 'P', greeks: { delta: -0.5, gamma: 0.02, theta: -0.1, vega: 0.3, rho: -0.1 } })], 'SPY').prints[0];
    const callSell = buildGammaTape([mkPrint({ side: 'BID', right: 'C' })], 'SPY').prints[0];
    // Gamma is long-option-positive for both rights, so the aggressor alone sets
    // the sign: a buy (either right) makes the dealer shorter gamma.
    expect(callBuy.dGamma).toBeLessThan(0);
    expect(putBuy.dGamma).toBeLessThan(0);
    expect(callSell.dGamma).toBeGreaterThan(0);
  });

  it('routes the hedge the right way: sold call -> dealer buys, sold put -> dealer sells', () => {
    // Customer buys a call: dealer short a call -> short delta -> must BUY stock.
    const callBuy = buildGammaTape([mkPrint({ side: 'ASK', right: 'C' })], 'SPY').prints[0];
    expect(callBuy.dDelta).toBeLessThan(0); // dealer short delta
    // Customer buys a put (delta < 0): dealer short a put -> long delta -> SELLS stock.
    const putBuy = buildGammaTape([mkPrint({ side: 'ASK', right: 'P', greeks: { delta: -0.5, gamma: 0.02, theta: -0.1, vega: 0.3, rho: -0.1 } })], 'SPY').prints[0];
    expect(putBuy.dDelta).toBeGreaterThan(0); // dealer long delta
  });

  it('a midpoint print moves no dealer inventory', () => {
    const mid = buildGammaTape([mkPrint({ side: 'MID' })], 'SPY').prints[0];
    expect(mid.dGamma).toBe(0);
    expect(mid.dDelta).toBe(0);
  });
});

function sampleTape(ticker: string): FlowPrint[] {
  const prints: FlowPrint[] = [];
  for (let i = 0; i < 300; i++) {
    const order: TapeOrder = {
      time: `${String(9 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00`,
      ticker,
      strike: (495 + (i % 20)).toFixed(2),
      type: i % 2 === 0 ? 'C' : 'P',
      size: 10 + (i % 200),
      orderType: i % 3 === 0 ? 'SWEEP' : 'BLOCK',
      side: i % 2 === 0 ? 'ASK' : 'BID',
    };
    prints.push(enrichPrint(order, i));
  }
  return prints;
}

describe('P4.3 — the running dealer book', () => {
  const tape = sampleTape('SPY');
  const view = buildGammaTape(tape, 'SPY');

  it('cumulative closes on the net, and long+short reconcile it', () => {
    // Newest-first for display, so the FIRST chronological row is the last one.
    const chronoFirst = view.prints[view.prints.length - 1];
    expect(chronoFirst.cumGamma).toBeCloseTo(chronoFirst.dGamma, 6);
    // The final running total is the net, and net = addedLong − addedShort.
    expect(view.netGamma).toBeCloseTo(view.addedLong - view.addedShort, 4);
    expect(view.longGamma).toBe(view.netGamma >= 0);
  });

  it('counts only directed prints and finds the true biggest mover', () => {
    const byHand = tape.filter(p => p.side !== 'MID').length;
    expect(view.directed).toBe(byHand);
    const maxAbs = Math.max(...view.prints.map(r => Math.abs(r.dGamma)));
    expect(view.biggest).not.toBeNull();
    expect(Math.abs(view.biggest!.dGamma)).toBeCloseTo(maxAbs, 6);
  });

  it('scopes to one underlying — a foreign name never enters the book', () => {
    const mixed = [...sampleTape('SPY'), ...sampleTape('QQQ')];
    const spyOnly = buildGammaTape(mixed, 'SPY');
    for (const r of spyOnly.prints) expect(r.print.ticker).toBe('SPY');
    // And the SPY book is identical whether or not QQQ prints are in the array.
    expect(spyOnly.netGamma).toBeCloseTo(buildGammaTape(sampleTape('SPY'), 'SPY').netGamma, 6);
  });

  it('trough sits at or below zero and at or below the peak', () => {
    expect(view.troughGamma).toBeLessThanOrEqual(0);
    expect(view.troughGamma).toBeLessThanOrEqual(view.peakGamma);
  });

  it('orders by id, not by the clock string — a tape spanning midnight stays in order', () => {
    // `time` is a bare HH:MM:SS with no date on it. Sorting on it lexically is
    // only accidentally chronological: across midnight it inverts. The tape's
    // ids are monotonic in time by construction, so they are the real order.
    //
    // Two prints that cancel: a customer SELL (dealer buys, gamma up) at 23:59,
    // then a customer BUY (dealer sells, gamma down) five minutes later. The net
    // is zero either way — order only shows up in the PATH.
    const late = mkPrint({ id: 1, time: '23:59:00', side: 'BID', size: 500 });
    const early = mkPrint({ id: 2, time: '00:04:00', side: 'ASK', size: 500 });

    const v = buildGammaTape([early, late], 'SPY'); // deliberately array-unordered

    // True order: the book goes LONG first, then back to flat. So the session
    // has a positive peak and never goes short.
    expect(v.peakGamma).toBeGreaterThan(0);
    expect(v.troughGamma).toBe(0);
    expect(v.netGamma).toBeCloseTo(0, 6);

    // Display is newest-first, so the 00:04 print (the later one) leads.
    expect(v.prints[0].print.id).toBe(2);
    expect(v.prints[1].print.id).toBe(1);

    // A lexical `time` sort would have put 00:04 first and produced the mirror
    // image: a negative trough and a zero peak. Pin that it did not.
    expect(v.troughGamma).not.toBeLessThan(0);
  });
});
