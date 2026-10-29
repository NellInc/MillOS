import { describe, it, expect } from 'vitest';
import { waterTransmission, JUNCTION_FROTH_GLSL } from './waterOptics';
describe('water thickness and aeration', () => {
  it('transmits actual shallow bed detail, attenuates with path length and seals foam', () => {
    expect(waterTransmission(0.05, 0.8)).toBeGreaterThan(waterTransmission(2, 0.8));
    expect(waterTransmission(1, 0.2)).toBeLessThan(waterTransmission(1, 0.9));
    expect(waterTransmission(0.05, 0.9, 1)).toBe(0);
    for (const d of [0, 0.05, 0.3, 2, 10])
      for (const v of [0, 0.3, 1]) expect(waterTransmission(d, v)).toBeGreaterThanOrEqual(0);
    expect(waterTransmission(0, 0)).toBeLessThanOrEqual(0.68);
  });
  it('keeps gathered froth within a finite advected and pixel-filtered landing', () => {
    expect(JUNCTION_FROTH_GLSL).toContain('run > impact.w * 2.4');
    expect(JUNCTION_FROTH_GLSL).toContain('world.x - impact.x');
    expect(JUNCTION_FROTH_GLSL).toContain('fwidth(world.x)');
    expect(JUNCTION_FROTH_GLSL).not.toMatch(/sampler|sin\(time\)/);
  });
});
