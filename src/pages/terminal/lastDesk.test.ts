import { describe, it, expect, beforeEach } from 'vitest';
import { LAST_DESK_KEY, readLastDesk, writeLastDesk } from './lastDesk';

/** The suite runs in the node environment, so every case installs its own
    storage — including the one that models Safari private mode. */
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

const throwingStorage = () => ({
  getItem: () => {
    throw new Error('storage disabled');
  },
  setItem: () => {
    throw new Error('storage disabled');
  },
});

describe('lastDesk', () => {
  beforeEach(() => install(memoryStorage()));

  it('round-trips a sectioned desk subpage into desk + tab labels', () => {
    writeLastDesk('/pinpoint/stress');
    expect(readLastDesk()).toEqual({
      path: '/pinpoint/stress',
      deskPath: '/pinpoint',
      deskLabel: 'Pinpoint',
      tabLabel: 'Stress',
    });
  });

  it('leaves tabLabel undefined for a desk with no tab bar', () => {
    writeLastDesk('/pulse');
    const last = readLastDesk();
    expect(last?.deskLabel).toBe('Pulse');
    expect(last?.tabLabel).toBeUndefined();
  });

  it('reads the registry label, not the URL segment', () => {
    writeLastDesk('/trace/live-tape');
    const last = readLastDesk();
    expect(last?.deskLabel).toBe('Trace');
    expect(last?.tabLabel).toBe('Tape');
  });

  it.each(['/guide/overview', '/legal/terms', '/terminal'])('ignores %s and keeps the stored desk', path => {
    writeLastDesk('/compass');
    writeLastDesk(path);
    expect(readLastDesk()?.path).toBe('/compass');
  });

  it('returns null for a stored path that is no longer a desk', () => {
    install({ ...memoryStorage(), getItem: () => '/fracture' });
    expect(readLastDesk()).toBeNull();
  });

  it('returns null instead of throwing when storage is unavailable', () => {
    install(throwingStorage());
    expect(() => writeLastDesk('/pulse')).not.toThrow();
    expect(readLastDesk()).toBeNull();
  });

  it('names the key the settings panel clears', () => {
    expect(LAST_DESK_KEY).toBe('slayer.terminal.last');
  });
});
