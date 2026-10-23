import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APARTMENT_GALLERY,
  APARTMENT_SHELL,
  APARTMENT_STAIR_TOWER,
  APARTMENT_WINDOW_BANDS,
  apartmentFacadeLayout,
} from './apartmentFacadeLayout';

describe('apartment street-face massing', () => {
  it('hangs each gallery off the facade between one storey of windows and the next', () => {
    const g = APARTMENT_GALLERY;
    expect(g.tops).toHaveLength(3);
    g.tops.forEach((top, index) => {
      const [sill] = APARTMENT_WINDOW_BANDS[index + 1];
      const [, headBelow] = APARTMENT_WINDOW_BANDS[index];
      // The rail top meets the sill of the windows it serves (within 5 cm)...
      expect(Math.abs(top + g.railHeight - sill)).toBeLessThanOrEqual(0.05);
      // ...and the slab clears the heads of the windows below it.
      expect(top - g.thickness).toBeGreaterThan(headBelow + 0.3);
    });
    // Sunk into the shell, never lying on its face.
    expect(g.embed).toBeGreaterThan(0);
    expect(g.maxZ).toBeLessThan(APARTMENT_SHELL.maxZ);
  });

  it('stands the stair tower against the facade and joins every gallery to it', () => {
    const t = APARTMENT_STAIR_TOWER;
    expect(t.minX).toBeLessThan(APARTMENT_SHELL.halfX);
    expect(t.maxX).toBeGreaterThan(APARTMENT_SHELL.halfX + APARTMENT_GALLERY.depth);
    expect(t.minZ).toBeGreaterThanOrEqual(APARTMENT_SHELL.minZ);
    expect(t.top).toBeGreaterThan(APARTMENT_SHELL.height);
    // Galleries start inside the tower's side wall: no gap to step over.
    expect(APARTMENT_GALLERY.minZ).toBeLessThan(t.maxZ);
    expect(APARTMENT_GALLERY.minZ).toBeGreaterThan(t.minZ);
  });
});

/**
 * final-med-12 shipping (0,280)-(320,600): the four-storey block still read
 * as stacked boxes with the galleries on it - three unbroken horizontal bands -
 * and the three-storey block had no street-face form at all.
 */
describe.each([3, 4] as const)('the %s-storey block', (floors) => {
  const layout = apartmentFacadeLayout(floors);

  it('has a gallery for every upper storey, rail top at its sill', () => {
    expect(layout.windowBands).toHaveLength(floors);
    expect(layout.gallery.tops).toHaveLength(floors - 1);
    layout.gallery.tops.forEach((top, index) => {
      const [sill] = layout.windowBands[index + 1];
      const [, headBelow] = layout.windowBands[index];
      expect(Math.abs(top + layout.gallery.railHeight - sill)).toBeLessThanOrEqual(0.05);
      expect(top - layout.gallery.thickness).toBeGreaterThan(headBelow + 0.3);
    });
    expect(layout.stairTower.top).toBeGreaterThan(layout.shell.height);
    expect(layout.windowBands.at(-1)![1]).toBeLessThan(layout.shell.height);
  });

  it('carries the galleries on columns from the ground to the top rail, clear of the panes', () => {
    const { columns, gallery, shell, panes } = layout;
    expect(columns.length).toBeGreaterThanOrEqual(3);
    const outer = shell.halfX + gallery.depth;
    const topRail = gallery.tops.at(-1)! + gallery.railHeight;
    for (const column of columns) {
      expect(column.bottom).toBe(0);
      expect(column.top).toBeCloseTo(topRail, 6);
      // Under the slabs, inside the balustrade (which starts 0.13 m in).
      expect(column.x - column.size / 2).toBeGreaterThan(shell.halfX);
      expect(column.x + column.size / 2).toBeLessThan(outer - 0.13);
      expect(column.z - column.size / 2).toBeGreaterThan(gallery.minZ);
      expect(column.z + column.size / 2).toBeLessThan(gallery.maxZ);
      for (const centre of panes.centres)
        expect(Math.abs(column.z - centre)).toBeGreaterThanOrEqual((panes.width + column.size) / 2);
    }
  });
});

describe('apartment mounting', () => {
  it('dresses both apartment blocks, not only the four-storey one', () => {
    const source = readFileSync(path.resolve(__dirname, '../FactoryExterior.tsx'), 'utf8');
    expect(source).toMatch(/<ApartmentFacade floors=\{floors\} \/>/);
    expect(source).not.toMatch(/floors === 4 && <ApartmentFacade/);
  });
});
