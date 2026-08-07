import { describe, expect, it } from 'vitest';
import { PULSE_PRESETS } from './presets';
import { pulsePanelByKey } from './pulseRegistry';

/*
==================================================
  SLAYER TERMINAL - PRESET INTEGRITY (pulse/presets.test.ts)
  A Pulse preset is two parallel lists — the panels and their cells — joined by
  id, hand-written, and never checked against each other. That is exactly the
  shape that rots: retiring a widget meant deleting its entry from `panels`, and
  three presets kept the matching `layout` cell.

  A cell with no panel is not inert. The grid lays the real panels out AROUND
  it, so "Flow Command" reserved the five columns its centre was supposed to
  fill and rendered a three-column deck with a hole in the middle.

  These are the invariants that make a preset a desk rather than two lists.
==================================================
*/

describe('Pulse presets', () => {
  it.each(PULSE_PRESETS.map(p => [p.name, p] as const))('%s: every panel has a cell', (_name, preset) => {
    for (const panel of preset.panels) {
      expect(preset.layout.some(g => g.i === panel.id), `panel ${panel.id} has no cell`).toBe(true);
    }
  });

  it.each(PULSE_PRESETS.map(p => [p.name, p] as const))('%s: every cell has a panel', (_name, preset) => {
    // The failure this exists for: a widget is retired, its `panels` entry is
    // deleted, and its cell is left holding floor space for a panel that will
    // never render.
    for (const cell of preset.layout) {
      expect(preset.panels.some(p => p.id === cell.i), `cell ${cell.i} has no panel`).toBe(true);
    }
  });

  it.each(PULSE_PRESETS.map(p => [p.name, p] as const))('%s: every panel key resolves', (_name, preset) => {
    for (const panel of preset.panels) {
      expect(pulsePanelByKey(panel.key), `${panel.id} wants a widget "${panel.key}" that does not exist`).toBeDefined();
    }
  });

  it.each(PULSE_PRESETS.map(p => [p.name, p] as const))('%s: no two cells overlap', (_name, preset) => {
    const cells = preset.layout;
    for (let a = 0; a < cells.length; a++) {
      for (let b = a + 1; b < cells.length; b++) {
        const A = cells[a];
        const B = cells[b];
        const hit = A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h;
        expect(hit, `${A.i} overlaps ${B.i}`).toBe(false);
      }
    }
  });

  it.each(PULSE_PRESETS.map(p => [p.name, p] as const))('%s: every cell fits the 12-column grid', (_name, preset) => {
    for (const g of preset.layout) {
      expect(g.x, `${g.i} starts left of the grid`).toBeGreaterThanOrEqual(0);
      expect(g.x + g.w, `${g.i} runs past column 12`).toBeLessThanOrEqual(12);
      expect(g.w, `${g.i} has no width`).toBeGreaterThan(0);
      expect(g.h, `${g.i} has no height`).toBeGreaterThan(0);
    }
  });

  it('ids are unique within a preset and layout ids are unique too', () => {
    for (const preset of PULSE_PRESETS) {
      const panelIds = preset.panels.map(p => p.id);
      const cellIds = preset.layout.map(g => g.i);
      expect(new Set(panelIds).size, `${preset.name} has duplicate panel ids`).toBe(panelIds.length);
      expect(new Set(cellIds).size, `${preset.name} has duplicate cell ids`).toBe(cellIds.length);
    }
  });

  it('preset ids are unique across the set', () => {
    const ids = PULSE_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names are distinct, so the view switcher never lists the same label twice', () => {
    const names = PULSE_PRESETS.map(p => p.name.toLowerCase());
    expect(new Set(names).size, `duplicate preset names: ${names.join(', ')}`).toBe(names.length);
  });
});
