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
    expect(stairLightIntensity(1)).toBeGreaterThan(0.5);
    for (let level = 0; level < 1; level += 0.1)
      expect(stairLightIntensity(level + 0.1)).toBeGreaterThanOrEqual(stairLightIntensity(level));
    const { r, g, b } = STAIR_LIGHT_GLAZING.emissive;
    expect(Math.min(r, g, b)).toBeGreaterThan(0.4);
  });

  it('keeps the lit glazing out of the static batch, which clones materials', () => {
    // A merged clone would never see the per-frame intensity.
    const source = readFileSync('src/components/exterior/ApartmentFacade.tsx', 'utf8');
    const lit = source.match(/material=\{STAIR_LIGHT_GLAZING\}/g) ?? [];
    expect(lit.length).toBeGreaterThanOrEqual(1);
    expect(source).toMatch(/noStaticBatch: true/);
  });

  it.each([3, 4] as const)('marks every landing of the %s-storey stair', (floors) => {
    const { stairTower, gallery, stairLandings } = apartmentFacadeLayout(floors);
    expect(stairLandings).toHaveLength(gallery.tops.length);
    for (const y of stairLandings) {
      expect(y).toBeGreaterThan(1.2);
      expect(y).toBeLessThan(stairTower.top - 1.4);
    }
  });
});
