import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STAIR_LIGHT_GLAZING, stairLightIntensity } from './ApartmentFacade';
import { apartmentFacadeLayout } from './apartmentFacadeLayout';

/**
 * shipping med-22: the stair tower beside the apartment block was an unlit
 * black monolith. Its full-height glazing slot was dark glass by day and by
 * night, so the one vertical the block has read as a hole in the sky.
 */
describe('apartment stair core at night', () => {
  it('lights the stair glazing from the exterior lamp level, off by day', () => {
    expect(stairLightIntensity(0)).toBeLessThan(0.02);
    // Lit like the flats' windows, not a strip light: 0.75 read near-white (med-22).
    expect(stairLightIntensity(1)).toBeGreaterThan(0.2);
    expect(stairLightIntensity(1)).toBeLessThanOrEqual(0.4);
    for (let level = 0; level < 1; level += 0.1)
      expect(stairLightIntensity(level + 0.1)).toBeGreaterThanOrEqual(stairLightIntensity(level));
    const { r, g, b } = STAIR_LIGHT_GLAZING.emissive;
    expect(Math.min(r, g, b)).toBeGreaterThan(0.25);
  });

  it('keeps the lit glazing out of the static batch, which clones materials', () => {
    // A merged clone would never see the per-frame intensity.
    const source = readFileSync('src/components/exterior/ApartmentFacade.tsx', 'utf8');
    const lit = source.match(/material=\{STAIR_LIGHT_GLAZING\}/g) ?? [];
    expect(lit.length).toBeGreaterThanOrEqual(1);
    expect(source).toMatch(/noStaticBatch: true/);
  });

  /**
   * final4 med-1830 (farm, shipping): one cream strip the height of the tower
   * beside a block whose flats are lit on alternate storeys.
   */
  it.each([3, 4] as const)(
    'lights the %s-storey stair only on the storeys whose flats are lit',
    (floors) => {
      const { stairStoreys, stairLandings, stairTower } = apartmentFacadeLayout(floors);
      expect(stairStoreys).toHaveLength(floors);
      expect(stairStoreys[0].bottom).toBe(1.2);
      expect(stairStoreys.at(-1)!.top).toBe(stairTower.top - 1.4);
      stairStoreys.slice(1).forEach((s, i) => expect(s.bottom).toBe(stairLandings[i]));
      // The window shader's occupiedFloor: mod(storey, 2) == 1.
      expect(stairStoreys.map((s) => s.lit)).toEqual(
        Array.from({ length: floors }, (_, k) => k % 2 === 1)
      );
      const source = readFileSync('src/components/exterior/ApartmentFacade.tsx', 'utf8');
      expect(source).toMatch(/material=\{lit \? STAIR_LIGHT_GLAZING : STAIR_GLAZING\}/);
      // Glows like a lit pane, not a mirror of the dusk sky.
      expect(STAIR_LIGHT_GLAZING.roughness).toBeGreaterThanOrEqual(0.35);
      expect(STAIR_LIGHT_GLAZING.metalness).toBeLessThanOrEqual(0.1);
      expect(stairLightIntensity(0.5)).toBeCloseTo(stairLightIntensity(1) / 2, 6);
    }
  );

  it.each([3, 4] as const)('marks every landing of the %s-storey stair', (floors) => {
    const { stairTower, gallery, stairLandings } = apartmentFacadeLayout(floors);
    expect(stairLandings).toHaveLength(gallery.tops.length);
    for (const y of stairLandings) {
      expect(y).toBeGreaterThan(1.2);
      expect(y).toBeLessThan(stairTower.top - 1.4);
    }
  });
});
