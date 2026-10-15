/**
 * Invariants for the shared material library.
 *
 * These encode the exact defects this file used to carry, so they cannot come
 * back silently:
 *
 *   - `brushedMetal` bound as a roughnessMap (its G channel is METALNESS, a
 *     near-flat 0.90-1.00, so the map multiplied by ~0.95 and did nothing)
 *   - `brushedMetal` bound as a normalMap (a packed data map decoded as a
 *     tangent normal is a constant tilt, not relief)
 *   - metalness authored in the physically empty 0.05-0.95 band
 *   - a conductor whose albedo is too dark to be a real F0
 *   - base roughness left where it was when the map multiplied by ~1
 *
 * Scope is deliberate. `INSTANCED_MACHINE_MATERIALS` (consumed only by the
 * unreferenced Instanced* machine components) and the non-metal groups are NOT
 * covered - they are not authored against the ORM and several of them pair a
 * map with a hue-preserving tint on purpose.
 */

import { describe, expect, it } from 'vitest';
import {
  generateCobblestone,
  generateCobblestoneNormal,
  generateCobblestoneRoughness,
} from '../textures/cobblestone';
import * as THREE from 'three';
import {
  MACHINE_MATERIALS,
  METAL_MATERIALS,
  ORM_MEAN_ROUGHNESS,
  PIPE_MATERIALS,
  PROCEDURAL_TEXTURES,
  SAFETY_MATERIALS,
  TUNNEL_MATERIALS,
  WALL_MATERIALS,
  OUTDOOR_MATERIALS,
  TREE_MATERIALS,
  BENCH_MATERIALS,
} from './sharedMaterials';
import {
  MACHINE_ORM_MEAN_ROUGHNESS,
  MACHINE_ORM_ROUGHNESS_RANGE,
} from '../components/machines/machineSurfaces';

/** The groups this file re-authored as a strict conductor/dielectric split. */
const metalGroups = {
  METAL_MATERIALS,
  PIPE_MATERIALS,
  MACHINE_MATERIALS,
  SAFETY_MATERIALS,
  WALL_MATERIALS,
  TUNNEL_MATERIALS,
  BENCH_MATERIALS,
};

const metalFamily: [string, THREE.MeshStandardMaterial][] = Object.entries(metalGroups).flatMap(
  ([group, set]) =>
    Object.entries(set)
      .filter(
        (entry): entry is [string, THREE.MeshStandardMaterial] =>
          (entry[1] as THREE.Material).type === 'MeshStandardMaterial'
      )
      .map(([key, material]): [string, THREE.MeshStandardMaterial] => [`${group}.${key}`, material])
);

/** Every MeshStandardMaterial exported from the module, for the map audits. */
const allStandard: [string, THREE.MeshStandardMaterial][] = Object.entries({
  ...metalGroups,
  OUTDOOR_MATERIALS,
  TREE_MATERIALS,
}).flatMap(([group, set]) =>
  Object.entries(set)
    .filter(
      (entry): entry is [string, THREE.MeshStandardMaterial] =>
        (entry[1] as THREE.Material).type === 'MeshStandardMaterial'
    )
    .map(([key, material]): [string, THREE.MeshStandardMaterial] => [`${group}.${key}`, material])
);

describe('shared material physics', () => {
  it('has at least one material in every audited group', () => {
    // Guards against a rename silently emptying the sets above and turning
    // every other test in this file into a vacuous pass.
    expect(metalFamily.length).toBeGreaterThan(20);
    expect(allStandard.length).toBeGreaterThan(metalFamily.length);
    // Same guard for the ORM-gated tests below, which are all no-ops if the
    // map is ever unbound wholesale.
    const mapped = allStandard.filter(
      ([, material]) => material.roughnessMap === PROCEDURAL_TEXTURES.machineORM
    );
    expect(mapped.length, 'materials bound to the ORM').toBeGreaterThan(15);
  });

  it('authors metalness as a hard binary - never the invalid half-metal band', () => {
    for (const [name, material] of metalFamily) {
      expect([0, 1], `${name} metalness ${material.metalness}`).toContain(material.metalness);
    }
  });

  it('only assigns metalness 1 to an albedo bright enough to be a real F0', () => {
    // A conductor's albedo IS its specular reflectance. Below ~0.3 linear the
    // surface renders as a dim mirror rather than as metal. `Color` already
    // stores the working (linear) value, so do NOT convert again here.
    for (const [name, material] of metalFamily) {
      if (material.metalness !== 1) continue;
      const { r, g, b } = material.color;
      expect((r + g + b) / 3, `${name} F0`).toBeGreaterThan(0.3);
    }
  });
});

describe('shared material map wiring', () => {
  it('never binds the mis-channelled brushedMetal pack as roughness or normal', () => {
    for (const [name, material] of allStandard) {
      expect(material.roughnessMap, `${name} roughnessMap`).not.toBe(
        PROCEDURAL_TEXTURES.brushedMetal
      );
      expect(material.normalMap, `${name} normalMap`).not.toBe(PROCEDURAL_TEXTURES.brushedMetal);
    }
  });

  it('never binds the sub-texel panelNormal, which the mip chain erases', () => {
    for (const [name, material] of allStandard) {
      expect(material.normalMap, `${name} normalMap`).not.toBe(PROCEDURAL_TEXTURES.panelNormal);
    }
  });

  it('drives aoMap from the same ORM texture as roughnessMap', () => {
    for (const [name, material] of allStandard) {
      if (material.roughnessMap !== PROCEDURAL_TEXTURES.machineORM) continue;
      expect(material.aoMap, `${name} aoMap`).toBe(material.roughnessMap);
      expect(material.aoMapIntensity, `${name} aoMapIntensity`).toBeGreaterThan(0);
    }
  });

  it('never assigns a metalnessMap - the ORM blue channel is a constant 1', () => {
    for (const [name, material] of allStandard) {
      expect(material.metalnessMap, `${name} metalnessMap`).toBeNull();
    }
  });

  it('applies the panel normal at a scale that can actually be seen', () => {
    for (const [name, material] of allStandard) {
      if (material.normalMap !== PROCEDURAL_TEXTURES.machinePanelNormal) continue;
      expect(material.normalScale.x, `${name} normalScale`).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('leaves the shared ORM and panel-normal clones at repeat (1,1)', () => {
    // `getTexture` hands the SAME source to `machineSurfaces.ts` and the
    // factory shell. These are clones, so tiling them here would be safe, but
    // (1,1) is the documented contract: per-surface texel density is a
    // call-site decision, not a library one.
    for (const texture of [
      PROCEDURAL_TEXTURES.machineORM,
      PROCEDURAL_TEXTURES.machinePanelNormal,
    ]) {
      expect(texture.repeat.x).toBe(1);
      expect(texture.repeat.y).toBe(1);
      expect(texture.wrapS).toBe(THREE.RepeatWrapping);
      expect(texture.colorSpace).toBe(THREE.NoColorSpace);
      // A clone shares its `Source`, so the pixels must have come with it -
      // an empty clone would render as flat white and look "fine".
      expect(texture.image?.data?.length, 'clone carries the source pixels').toBe(512 * 512 * 4);
      expect(texture.generateMipmaps).toBe(true);
    }
  });
});

describe('roughness re-authored against a map that actually multiplies', () => {
  it('tracks the roughness mean measured in machineSurfaces', () => {
    // Both files author against the same generator. If one moves, both move.
    expect(ORM_MEAN_ROUGHNESS).toBe(MACHINE_ORM_MEAN_ROUGHNESS);
  });

  it('keeps final roughness inside a plausible band once the map multiplies', () => {
    for (const [name, material] of allStandard) {
      if (material.roughnessMap !== PROCEDURAL_TEXTURES.machineORM) continue;
      const low = material.roughness * MACHINE_ORM_ROUGHNESS_RANGE.min;
      const high = material.roughness * MACHINE_ORM_ROUGHNESS_RANGE.max;
      const mean = material.roughness * ORM_MEAN_ROUGHNESS;
      expect(low, `${name} min roughness`).toBeGreaterThan(0.1);
      expect(high, `${name} max roughness`).toBeLessThanOrEqual(1);
      expect(mean, `${name} mean roughness`).toBeGreaterThan(0.15);
    }
  });

  it('no longer leaves a mapped material at the pre-fix mirror roughness', () => {
    // Every base that sits next to the ORM was raised; the old values (0.08-0.4)
    // only made sense when the map multiplied by ~0.95.
    for (const [name, material] of allStandard) {
      if (material.roughnessMap !== PROCEDURAL_TEXTURES.machineORM) continue;
      expect(material.roughness, `${name} base roughness`).toBeGreaterThan(0.4);
    }
  });
});

it('shares a registered fine-scale sett family within the existing map-size budget', () => {
  const maps = [
    PROCEDURAL_TEXTURES.cobblestoneColor,
    PROCEDURAL_TEXTURES.cobblestoneNormal,
    PROCEDURAL_TEXTURES.cobblestoneRoughness,
  ];
  expect(maps[0]).toBe(generateCobblestone(512, { stoneSize: 8 }));
  expect(maps[1]).toBe(generateCobblestoneNormal(512, 8));
  expect(maps[2]).toBe(generateCobblestoneRoughness(256, 4));
  expect(maps.map((t) => t.image.width)).toEqual([512, 512, 256]);
  expect(maps.map((t) => t.colorSpace)).toEqual([
    THREE.SRGBColorSpace,
    THREE.NoColorSpace,
    THREE.NoColorSpace,
  ]);
  expect(
    maps.every((t) => t.wrapS === THREE.RepeatWrapping && t.wrapT === THREE.RepeatWrapping)
  ).toBe(true);
  const clone = maps[2].clone();
  expect(clone.source).toBe(maps[2].source);
  expect(clone.image.data).toBe(maps[2].image.data);
  clone.dispose();
});
