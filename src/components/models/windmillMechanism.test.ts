import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createWindmillInteriorGeometry } from './WindmillInterior';
import { angularRatios, gearContacts, sampleGrainPath, grainPhase } from './windmillMechanism';

describe('illustrative windmill transmission', () => {
  it('matches the signed tooth velocities at both contacts and keeps the bed fixed', () => {
    expect(48 * angularRatios.crown + 16 * angularRatios.upright).toBe(0);
    expect(64 * angularRatios.upright + 16 * angularRatios.stoneNut).toBe(0);
    expect(angularRatios.runner).toBe(angularRatios.stoneNut);
    expect(angularRatios.bed).toBe(0);
    expect(0.066 / 0.022).toBeCloseTo(3);
    expect(-0.06 + gearContacts.spur.pitchRadius).toBeCloseTo(
      0.02 - gearContacts.stoneNut.pitchRadius
    );
  });
  it('places the large wheel teeth halfway between small wheel teeth at rest', () => {
    expect(gearContacts.crown.phase * gearContacts.crown.teeth).toBeCloseTo(Math.PI);
    expect(gearContacts.spur.phase * gearContacts.spur.teeth).toBeCloseTo(Math.PI);
    expect(gearContacts.wallower.phase).toBe(0);
    expect(gearContacts.stoneNut.phase).toBe(0);
  });
  it('runs grain from the hopper into the eye, out to the rim and down to the sack', () => {
    const out = new Vector3();
    expect(sampleGrainPath('feed', 0, out).y).toBeCloseTo(-0.085);
    expect(sampleGrainPath('feed', 1, out).toArray()).toEqual([0.02, -0.173, 0.031]);
    const rim = sampleGrainPath('grind', 1, out).clone();
    expect(rim.distanceTo(new Vector3(0.02, -0.195, 0.098))).toBeLessThan(1e-12);
    expect(sampleGrainPath('collect', 0, out).distanceTo(rim)).toBeLessThan(1e-12);
    expect(sampleGrainPath('collect', 1, out).toArray()).toEqual([0.087, -0.365, 0.098]);
  });
  it('moves grain downward with the actual clockwise sail owner and wraps continuously', () => {
    const a = grainPhase(-0.1, 0),
      b = grainPhase(-0.2, 0);
    expect(b).toBeGreaterThan(a);
    expect(sampleGrainPath('feed', b, new Vector3()).y).toBeLessThan(
      sampleGrainPath('feed', a, new Vector3()).y
    );
    expect(grainPhase(-0.2, 4)).toBeCloseTo(grainPhase(-0.2 - Math.PI * 2, 4));
    expect(grainPhase(-0.2, 4)).toBe(grainPhase(-0.2, 4));
  });
  it('reuses the output and has no clock dependency, including stage changes on a held angle', () => {
    const out = new Vector3();
    const first = sampleGrainPath('grind', 0.4, out).clone();
    expect(sampleGrainPath('grind', 0.4, out)).toBe(out);
    expect(out.equals(first)).toBe(true);
    sampleGrainPath('collect', 0.4, out);
    expect(out.equals(first)).toBe(false);
    expect(sampleGrainPath('feed', -1, out).equals(sampleGrainPath('feed', 0, new Vector3()))).toBe(
      true
    );
    expect(sampleGrainPath('feed', 2, out).equals(sampleGrainPath('feed', 1, new Vector3()))).toBe(
      true
    );
  });
});

describe('owned interior geometry budget', () => {
  it('merges every rigid material assembly and stays within the active triangle budget', () => {
    const geometries = createWindmillInteriorGeometry(6.79571);
    const triangles = Object.values(geometries).reduce(
      (sum, geometry) => sum + geometry.getAttribute('position').count / 3,
      0
    );
    // Nine merged meshes plus one instanced grain draw. Kernels add 24 * 20 triangles.
    expect(Object.keys(geometries)).toHaveLength(9);
    expect(triangles + 480).toBeLessThan(9000);
    // The sack stands on the full base floor; bed stone has real cross-bearers.
    geometries.cloth.computeBoundingBox();
    geometries.stone.computeBoundingBox();
    const wood = geometries.wood.getAttribute('position');
    for (const y of [geometries.cloth.boundingBox!.min.y, geometries.stone.boundingBox!.min.y]) {
      expect(
        Array.from({ length: wood.count }, (_, i) => wood.getY(i)).some(
          (value) => Math.abs(value - y) < 1e-6
        )
      ).toBe(true);
    }
    Object.values(geometries).forEach((geometry) => {
      expect(geometry.boundingSphere?.radius).toBeGreaterThan(0);
      expect(Number.isFinite(geometry.boundingSphere?.radius)).toBe(true);
      geometry.dispose();
    });
    process.stdout.write(`Interior: 10 draws, ${triangles + 480} triangles including grain\n`);
  });
});
