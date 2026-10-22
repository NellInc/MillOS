import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  HALL_DUST_MATERIAL,
  HALL_DUST_RENDER_ORDER,
  buildHallSackMatrices,
  createDustMask,
} from './HallDressing';
import { RENDER_ORDER } from '../../constants/renderLayers';
import { HALL_PALLET_PILES, HALL_SACK_STACKS, hallDressingSolids } from './hallDressingLayout';
import { LOADED_PALLET_HEIGHT, LOADING_PROP_FOOTPRINT } from '../props/LoadingProps';
import { getFlourSackGeometry } from '../../utils/flourSacks';

describe('hall dressing render', () => {
  it('declares footprints that cover the shared load props', () => {
    const pallet = hallDressingSolids().find((s) => s.id === HALL_SACK_STACKS[0].id)!;
    expect(pallet.maxX - pallet.minX).toBeGreaterThanOrEqual(
      2 * LOADING_PROP_FOOTPRINT.pallet[0] - 1e-9
    );
    expect(pallet.maxZ - pallet.minZ).toBeGreaterThanOrEqual(
      2 * LOADING_PROP_FOOTPRINT.pallet[1] - 1e-9
    );
    expect(pallet.maxY - pallet.minY).toBeGreaterThanOrEqual(LOADED_PALLET_HEIGHT);
  });

  it('puts every sack of every stack inside its declared box', () => {
    const { pallets, sacks } = buildHallSackMatrices();
    expect(pallets.length).toBe(
      HALL_SACK_STACKS.length + HALL_PALLET_PILES.reduce((n, p) => n + p.count, 0)
    );
    expect(sacks.length).toBe(HALL_SACK_STACKS.reduce((n, s) => n + s.courses * 2, 0));
    const geometry = getFlourSackGeometry();
    geometry.computeBoundingBox();
    const solids = hallDressingSolids();
    for (const matrix of sacks) {
      const box = geometry.boundingBox!.clone().applyMatrix4(matrix);
      const owner = solids.find(
        (s) =>
          box.min.x >= s.minX - 1e-3 &&
          box.max.x <= s.maxX + 1e-3 &&
          box.min.z >= s.minZ - 1e-3 &&
          box.max.z <= s.maxZ + 1e-3 &&
          box.min.y >= s.minY - 1e-3 &&
          box.max.y <= s.maxY + 1e-3
      );
      expect(owner, `sack at ${box.min.toArray().map((v) => v.toFixed(2))}`).toBeDefined();
    }
  });

  it('draws a lit dust decal whose mask reaches three through the green channel', () => {
    expect(HALL_DUST_MATERIAL).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(HALL_DUST_MATERIAL.depthWrite).toBe(false);
    expect(HALL_DUST_MATERIAL.polygonOffset).toBe(true);
    const mask = createDustMask(32);
    let green = 0;
    let centre = 0;
    for (let i = 0; i < mask.length; i += 4) {
      expect(mask[i + 1]).toBe(mask[i]);
      green += mask[i + 1];
    }
    centre = mask[(16 * 32 + 16) * 4 + 1];
    expect(green).toBeGreaterThan(0);
    expect(centre).toBeGreaterThan(mask[1]); // thicker in the middle than at the corner
    // No straight quad edge: the whole border ring is empty.
    for (let k = 0; k < 32; k += 1)
      for (const [x, y] of [
        [k, 0],
        [k, 31],
        [0, k],
        [31, k],
      ])
        expect(mask[(y * 32 + x) * 4 + 1], `${x},${y}`).toBeLessThan(40);
  });

  it('breaks the dust edge into drift and streaks, not an oval falloff', () => {
    const size = 128;
    const mask = createDustMask(size);
    // Walk the band where an oval falloff would be a smooth grey ring.
    const ring: number[] = [];
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1) {
        const r = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
        if (r > 0.55 && r < 0.8) ring.push(mask[(y * size + x) * 4 + 1]);
      }
    const bare = ring.filter((v) => v < 10).length / ring.length;
    const dense = ring.filter((v) => v > 140).length / ring.length;
    // Both bare floor and dense drift in the same band: ragged, not graded.
    expect(bare).toBeGreaterThan(0.2);
    expect(dense).toBeGreaterThan(0.12);
    // And the transition is short: few pixels sit in the soft middle.
    const soft = ring.filter((v) => v >= 40 && v <= 110).length / ring.length;
    expect(soft).toBeLessThan(0.3);
  });

  it('shades the dust as matter under the hall lights, never as light', () => {
    const material = HALL_DUST_MATERIAL;
    expect(material.emissive.getHex()).toBe(0);
    expect(material.toneMapped).toBe(true);
    expect(material.blending).toBe(THREE.NormalBlending);
    expect(material.map).toBeNull();
    // Flour on concrete: at full cover it may lift the slab's albedo, never
    // approach white (linear luminance of the blend at full coverage).
    const c = material.color;
    const luminance = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    expect(luminance).toBeLessThan(0.5);
    expect(luminance * material.opacity).toBeLessThan(0.33);
    // Drawn before the additive floor light pools, so a pool lights dust and
    // slab alike instead of being hidden under one and stacked on the other.
    expect(HALL_DUST_RENDER_ORDER).toBeLessThan(RENDER_ORDER.floorEffects);
  });
});
