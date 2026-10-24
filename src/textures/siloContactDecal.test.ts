import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT } from '../constants/siteLayout';
import {
  SILO_CONTACT,
  SILO_CONTACT_DECAL_Y,
  generateSiloContactDecal,
  siloContactAlpha,
} from './siloContactDecal';

/**
 * final7-med-12 verdict item 6 (yard, full-res x 380-900, y 1100-1340): a
 * ragged, notched blue-black fringe round each drum's foot at 2x. It is there
 * only at 12:00 on medium (absent on low-12 and med-06): the roof eave
 * (radius 6.27 m) and the stiffener rings (6.08 m) cast a thin annulus
 * straight down at a zenith sun, and the shadow map draws its 27 cm in
 * notches. A baked radial darkening at each footprint puts that edge inside
 * a smooth gradient, at no runtime cost.
 */
describe('silo contact decal', () => {
  const pad = SITE_LAYOUT.bulkStorage.siloPad;
  const padCentreZ = SITE_LAYOUT.factory.zones.silos;
  const drums = SITE_LAYOUT.machines.silos;

  it('is darkest at the drum foot over the eave shadow and fades smoothly outward', () => {
    const [x, , z] = drums[2].position;
    const at = (r: number) => siloContactAlpha(x + r, z);
    // Full over the eave's annulus, where the notched edge lies.
    for (const r of [6.02, 6.15, 6.27]) expect(at(r)).toBeGreaterThan(SILO_CONTACT.alpha * 0.95);
    // Monotonic, smooth (no step over 3% in 5 cm) and gone by the reach.
    let previous = at(6.0);
    for (let r = 6.05; r <= 6 + SILO_CONTACT.reach + 0.2; r += 0.05) {
      const value = at(r);
      expect(value).toBeLessThanOrEqual(previous + 1e-9);
      expect(previous - value).toBeLessThan(0.03);
      previous = value;
    }
    expect(at(6 + SILO_CONTACT.reach + 0.05)).toBe(0);
    // A contact shadow, not a stain: never opaque.
    expect(SILO_CONTACT.alpha).toBeGreaterThan(0.3);
    expect(SILO_CONTACT.alpha).toBeLessThan(0.65);
  });

  it('takes the nearest drum, so the 1 m valleys never double-darken', () => {
    const [x, , z] = drums[1].position;
    const pitch = drums[0].position[2] - drums[1].position[2];
    const valley = siloContactAlpha(x + 6.2, z + pitch / 2);
    expect(valley).toBeLessThanOrEqual(SILO_CONTACT.alpha + 1e-9);
  });

  it('stays on the pad and fades before its edges', () => {
    const halfX = pad.size[0] / 2;
    const halfZ = pad.size[2] / 2;
    expect(siloContactAlpha(pad.position[0] - halfX, padCentreZ)).toBe(0);
    expect(siloContactAlpha(pad.position[0], padCentreZ + halfZ)).toBe(0);
    expect(siloContactAlpha(pad.position[0], padCentreZ - halfZ)).toBe(0);
  });

  it('bakes a black alpha mask over the pad, mipmapped, and is drawn as an unlit decal on the pad top', () => {
    const texture = generateSiloContactDecal();
    expect(texture.colorSpace).toBe(THREE.NoColorSpace);
    const { width, height, data } = texture.image as {
      width: number;
      height: number;
      data: Uint8Array;
    };
    // One texel at most 12.5 cm on the pad either way.
    expect(pad.size[0] / width).toBeLessThanOrEqual(0.125);
    expect(pad.size[2] / height).toBeLessThanOrEqual(0.125);
    let maxAlpha = 0;
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i] + data[i + 1] + data[i + 2]).toBe(0);
      maxAlpha = Math.max(maxAlpha, data[i + 3]);
    }
    expect(maxAlpha).toBeGreaterThan(0);
    expect(texture.generateMipmaps).toBe(true);
    // 1 cm above the pad's 0.16 m top, under CLAUDE.md's floor-decal rules.
    expect(SILO_CONTACT_DECAL_Y).toBeCloseTo(pad.size[1] + 0.01, 6);
    const infra = readFileSync(
      'src/components/infrastructure/OptimizedFactoryInfrastructure.tsx',
      'utf8'
    );
    expect(infra).toContain('<SiloContactDecal />');
    const block = infra.slice(infra.indexOf('function SiloContactDecal'));
    expect(block).toContain('meshBasicMaterial');
    expect(block).toContain('depthWrite={false}');
    expect(block).toContain('POLYGON_OFFSET.standard');
    expect(block).toContain('SILO_CONTACT_DECAL_Y');
  });
});
