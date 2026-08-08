import { describe, expect, it } from 'vitest';
import { nextLayoutId, nextPanelId, slugify } from './ids';
import type { PulseLayout, PulsePanel } from './presets';

const deskOf = (ids: string[]): PulseLayout => ({
  id: 'test',
  name: 'Test',
  panels: ids.map(id => ({ id, key: id.replace(/-\d+$/, '') }) as PulsePanel),
  layout: [],
});

describe('nextPanelId', () => {
  it('starts at 2 on an empty desk, so the first copy reads as the second panel', () => {
    expect(nextPanelId(deskOf([]), 'order-flow')).toBe('order-flow-2');
  });

  it('never returns an id the desk is already using', () => {
    // The exact failure this replaced: a session counter restarts at 1 while
    // the saved desk still holds order-flow-2, and the next add collides.
    const desk = deskOf(['order-flow-2']);
    expect(nextPanelId(desk, 'order-flow')).toBe('order-flow-3');
  });

  it('reads the HIGHEST suffix, not the count', () => {
    // Panels 2 and 4 with 3 closed: counting gives 3, which is taken by nobody
    // now but was — and re-using it would resurrect a closed panel's identity
    // in an undo. Take the high-water mark.
    expect(nextPanelId(deskOf(['order-flow-2', 'order-flow-4']), 'order-flow')).toBe('order-flow-5');
  });

  it('ignores panels of other keys', () => {
    expect(nextPanelId(deskOf(['gex-heatmap-9', 'live-chart-3']), 'order-flow')).toBe('order-flow-2');
  });

  it('ignores preset ids, which do not have the key-N shape', () => {
    const desk: PulseLayout = {
      id: 'slayer-classic',
      name: 'Slayer Classic',
      panels: [
        { id: 'c-chart', key: 'live-chart' },
        { id: 'c-flow', key: 'order-flow' },
      ],
      layout: [],
    };
    expect(nextPanelId(desk, 'order-flow')).toBe('order-flow-2');
  });

  it('ignores a suffix that is not a whole number', () => {
    expect(nextPanelId(deskOf(['order-flow-2x', 'order-flow-1.5', 'order-flow-']), 'order-flow')).toBe('order-flow-2');
  });

  it('is stable: minting twice without adding returns the same id', () => {
    const desk = deskOf(['order-flow-2']);
    expect(nextPanelId(desk, 'order-flow')).toBe(nextPanelId(desk, 'order-flow'));
  });
});

describe('slugify', () => {
  it('makes a readable id out of a layout name', () => {
    expect(slugify('My Morning Desk')).toBe('my-morning-desk');
  });

  it('collapses punctuation and trims the edges', () => {
    expect(slugify('  GEX + Order Flow!  ')).toBe('gex-order-flow');
  });

  it('never returns an empty string, which would make a bare "ws-" id', () => {
    expect(slugify('***')).toBe('layout');
    expect(slugify('')).toBe('layout');
  });
});

describe('nextLayoutId', () => {
  const layouts = (ids: string[]) => ids.map(id => ({ id, name: id, panels: [], layout: [] }) as PulseLayout);

  it('uses the base when it is free', () => {
    expect(nextLayoutId(layouts(['slayer-classic']), 'ws-my-desk')).toBe('ws-my-desk');
  });

  it('suffixes rather than colliding', () => {
    // "Duplicate" twice across two page loads used to mint ws-2-dup both times.
    expect(nextLayoutId(layouts(['ws-my-desk']), 'ws-my-desk')).toBe('ws-my-desk-2');
    expect(nextLayoutId(layouts(['ws-my-desk', 'ws-my-desk-2']), 'ws-my-desk')).toBe('ws-my-desk-3');
  });

  it('fills the first free suffix', () => {
    expect(nextLayoutId(layouts(['ws-a', 'ws-a-3']), 'ws-a')).toBe('ws-a-2');
  });

  it('a run of duplicates never repeats an id', () => {
    let set = layouts(['ws-desk']);
    const minted: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = nextLayoutId(set, 'ws-desk');
      minted.push(id);
      set = [...set, { id, name: id, panels: [], layout: [] }];
    }
    expect(new Set(minted).size).toBe(minted.length);
  });
});
