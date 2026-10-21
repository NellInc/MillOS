import { describe, expect, it } from 'vitest';
import {
  APARTMENT_GALLERY,
  APARTMENT_SHELL,
  APARTMENT_STAIR_TOWER,
  APARTMENT_WINDOW_BANDS,
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
