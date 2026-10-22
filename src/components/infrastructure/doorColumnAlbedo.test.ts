import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as dock from './OpenDockOpening';
import { FACTORY_STRUCTURE_MATERIAL } from './OptimizedFactoryInfrastructure';

const luminance = (color: THREE.Color) => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;

/**
 * final-med-12: the near door columns crushed to black (milling
 * (2350,0)-(2560,1100), forklift (0,0)-(270,800), interior (2050,350)-(2400,1440)).
 * Probe picks put them on the dock frame posts and the hall's structural steel.
 * The dock members' metalness compensation, (1 - m)^0.75 in linear, took
 * '#475569' at m 0.8 to a linear luminance of 0.026 - coal, not painted steel -
 * and with only fill on the hall-side face it rendered at the bottom of the
 * range. Painted steel this dark is still dark grey: ~0.07 or more.
 */
describe('door column albedo', () => {
  it('keeps every painted dock frame member above coal', () => {
    for (const [name, material] of Object.entries(dock.DOCK_FRAME_MATERIALS)) {
      const standard = material as THREE.MeshStandardMaterial;
      if (standard.metalness !== 0 || standard.emissiveIntensity > 0) continue;
      if (name === 'sign') continue;
      expect(luminance(standard.color), name).toBeGreaterThanOrEqual(0.065);
    }
  });

  it('lifts the hall structural steel half a stop without losing its hue', () => {
    const color = (FACTORY_STRUCTURE_MATERIAL as THREE.MeshStandardMaterial).color;
    expect(luminance(color)).toBeGreaterThanOrEqual(0.08);
    expect(luminance(color)).toBeLessThan(0.11);
    expect(color.b).toBeGreaterThan(color.r * 2);
  });
});
