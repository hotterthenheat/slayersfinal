import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEALER_BOOK, OI_PROXY_NOTE } from './dealerBook';

/*
==================================================
  SLAYER TERMINAL - THE DEALER BOOK IS AN ASSUMPTION (core/dealerBook.test.ts)

  Black-Scholes gamma is identical and positive for a call and a put at the same
  strike, so the call-versus-put sign in any gamma-exposure figure is not a
  property of the greek. It is an assumption about who holds which side, and
  nothing entitled here identifies a holder: OPRA carries no account-type flag
  and open interest is a count with no owner attached.

  Flip the convention and the whole regime inverts — long-gamma/range becomes
  short-gamma/trend, support becomes acceleration — while every magnitude on
  screen looks exactly as correct as before. The reader cannot see the assumption
  in the output. So it lives in one named place, and the surface says so.
==================================================
*/

const SRC = join(process.cwd(), 'src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (t: string) =>
  t.replace(/\/\*(?:[^*]|\*(?!\/))*\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

describe('the dealer-book convention', () => {
  it('is the simulator’s only source for the gamma sign', () => {
    /*
      The two numbers used to be literals inside the pricing loop, which is how
      an assumption becomes invisible. If either is re-inlined, the switch point
      stops being one place and the next reader has nothing to grep for.
    */
    const sim = code(read('core/simulator.ts'));
    expect(sim, 'the simulator must take the call side from DEALER_BOOK').toMatch(
      /dealerCallDirection = DEALER_BOOK\.call/
    );
    expect(sim, 'the simulator must take the put side from DEALER_BOOK').toMatch(
      /dealerPutDirection = DEALER_BOOK\.put/
    );
  });

  it('is a real convention — the two sides oppose', () => {
    // Same-signed legs would not be a book, and the inversion this file exists to
    // warn about would not be expressible.
    expect(Math.sign(DEALER_BOOK.call)).toBe(1);
    expect(Math.sign(DEALER_BOOK.put)).toBe(-1);
  });

  it('names itself in the proxy note', () => {
    // The label has to travel with the numbers. A note that stopped naming the
    // convention would be a disclaimer that discloses nothing.
    expect(OI_PROXY_NOTE.toLowerCase()).toContain('oi-proxy');
    expect(OI_PROXY_NOTE.toLowerCase()).toContain(DEALER_BOOK.label.toLowerCase());
  });

  it('is what the exposure surface claims, instead of an observation', () => {
    const page = code(read('pages/gex/ExposureProfile.tsx'));
    expect(page, 'the positioning panel must wear the proxy note').toMatch(/subtitle=\{OI_PROXY_NOTE\}/);
    expect(
      page,
      'the panel is back to asserting "net dealer pressure" as something measured'
    ).not.toMatch(/subtitle="net dealer pressure by strike"/);
  });
});
