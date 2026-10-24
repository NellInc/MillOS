import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { waterBodyTint } from '../FactoryExterior';
import { sampleAtmosphere, sampleCelestial } from '../../simulation/atmosphere';

describe('water body light at dawn', () => {
  const at = (hour: number, horizon: string) => {
    const celestial = sampleCelestial(sampleAtmosphere(0, hour, 'clear'));
    return waterBodyTint(new THREE.Color(), new THREE.Color(horizon), celestial.goldenHour);
  };

  it('is exactly white at noon and after dark', () => {
    expect(at(12, '#a3cce2').equals(new THREE.Color(1, 1, 1))).toBe(true);
    expect(at(22, '#384a64').equals(new THREE.Color(1, 1, 1))).toBe(true);
  });

  it('warms the water body with the dawn horizon instead of staying noon cyan', () => {
    // base-med-06: the pond stayed the same cyan hue as noon under an orange sky.
    const tint = at(6, '#e8a66d');
    expect(tint.r).toBeGreaterThan(1.2);
    expect(tint.b).toBeLessThan(0.7);
    for (const channel of [tint.r, tint.g, tint.b]) {
      expect(channel).toBeGreaterThan(0.3);
      expect(channel).toBeLessThan(1.7);
    }
  });
});
