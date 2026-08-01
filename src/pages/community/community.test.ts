import { describe, it, expect, beforeEach } from 'vitest';
import {
  communityMarkdown,
  isShippedId,
  loadCommunity,
  ROADMAP,
  saveCommunity,
  type CommunityState,
} from '../../data/community';
import { firstNumber, isThrough, pctFromSpot, zoneOf } from './book';
import type { KeyLevels } from '../../types/gex';

/** The suite runs in the node environment, so the storage is installed here. */
const install = (impl: Pick<Storage, 'getItem' | 'setItem'>) => {
  Object.defineProperty(globalThis, 'localStorage', { value: impl, configurable: true, writable: true });
};

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
};

const idea = (id: string) => ({
  id,
  author: 'you',
  ticker: 'SPY',
  direction: 'BULLISH' as const,
  thesis: 'holding the flip',
  votes: 0,
  createdAt: new Date().toISOString(),
});

describe('community storage', () => {
  beforeEach(() => install(memoryStorage()));

  it('starts empty rather than pre-filled with the shipped examples', () => {
    expect(loadCommunity()).toEqual({ ideas: [], requests: [], feedback: [], voted: [] });
  });

  it('drops shipped ids an older build copied into the saved state', () => {
    // The pre-migration shape: seeds were loaded into state and written back on
    // the first vote, which is why an emptied board used to refill itself.
    localStorage.setItem(
      'slayer_community_v1',
      JSON.stringify({
        ideas: [idea('seed-i1'), idea('you-1')],
        requests: [{ ...ROADMAP[0] }],
        feedback: [],
        voted: ['seed-r1'],
      })
    );
    const state = loadCommunity();
    expect(state.ideas.map(i => i.id)).toEqual(['you-1']);
    expect(state.requests).toEqual([]);
    // Backing survives: the roadmap ids are still what the board renders.
    expect(state.voted).toEqual(['seed-r1']);
  });

  it('round-trips what the browser wrote', () => {
    const state: CommunityState = { ideas: [idea('you-9')], requests: [], feedback: [], voted: [] };
    saveCommunity(state);
    expect(loadCommunity().ideas.map(i => i.id)).toEqual(['you-9']);
  });

  it('survives unreadable or disabled storage', () => {
    install({
      getItem: () => 'not json',
      setItem: () => {
        throw new Error('storage disabled');
      },
    });
    expect(loadCommunity().ideas).toEqual([]);
    expect(() => saveCommunity({ ideas: [], requests: [], feedback: [], voted: [] })).not.toThrow();
  });

  it('exports the record, including which roadmap items were backed', () => {
    const md = communityMarkdown(
      { ideas: [idea('you-1')], requests: [], feedback: [], voted: [ROADMAP[0].id] },
      raw => raw
    );
    expect(md).toContain('SPY');
    expect(md).toContain(ROADMAP[0].title);
  });

  it('every shipped roadmap row is recognisable as shipped', () => {
    expect(ROADMAP.every(r => isShippedId(r.id))).toBe(true);
    expect(isShippedId('you-1')).toBe(false);
  });
});

describe('placing a thesis in the book', () => {
  const levels: KeyLevels = { spot: 500, putWall: 495, flip: 500, callWall: 510, king: 505 };

  it('reads the first number out of a free-text level', () => {
    expect(firstNumber('below 498')).toBe(498);
    expect(firstNumber('505, 508')).toBe(505);
    expect(firstNumber('1R / 0.5% acct')).toBe(1);
    expect(firstNumber('no number here')).toBeNull();
  });

  it('names the band a price sits in', () => {
    expect(zoneOf(490, levels)).toBe('below the put wall');
    expect(zoneOf(497, levels)).toBe('between the put wall and the flip');
    expect(zoneOf(505, levels)).toBe('between the flip and the call wall');
    expect(zoneOf(515, levels)).toBe('above the call wall');
  });

  it('sorts the ladder rather than assuming it', () => {
    // A book where the flip prints above the call wall must still describe
    // itself truthfully instead of printing an impossible sentence.
    const inverted: KeyLevels = { spot: 500, putWall: 495, flip: 515, callWall: 505, king: 505 };
    expect(zoneOf(510, inverted)).toBe('between the call wall and the flip');
    expect(zoneOf(520, inverted)).toBe('above the flip');
  });

  it('knows which side of an invalidation spot has to be on', () => {
    expect(isThrough('BULLISH', 497, 498)).toBe(true);
    expect(isThrough('BULLISH', 499, 498)).toBe(false);
    expect(isThrough('BEARISH', 505, 504)).toBe(true);
    expect(isThrough('BEARISH', 503, 504)).toBe(false);
  });

  it('measures distance from spot', () => {
    expect(pctFromSpot(505, 500)).toBeCloseTo(1);
    expect(pctFromSpot(495, 500)).toBeCloseTo(-1);
    expect(pctFromSpot(505, 0)).toBe(0);
  });
});
