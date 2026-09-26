/**
 * Invariants for the machine surface set.
 *
 * These are the checks a screenshot would otherwise have to catch. The rules
 * encoded here are the exact ones the previous material set broke:
 *
 *   - metalness in the physically invalid 0.05-0.5 band
 *   - a roughnessMap whose green channel is not roughness
 *   - a metalnessMap that multiplies by a constant and does nothing
 *   - a normalScale so low the map is inert
 *   - a non-deterministic `customProgramCacheKey`
 *   - decals facing into the object they are stuck to
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SITE_LAYOUT, SILO_ACCESS_LAYOUT } from '../../constants/siteLayout';
import { generateGalvanizedORM, generateGalvanizedNormal } from '../../textures/brushedMetal';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  MACHINE_MATERIALS,
  MACHINE_ORM_MEAN_ROUGHNESS,
  MACHINE_ORM_ROUGHNESS_RANGE,
  MACHINE_WEAR_CACHE_KEY,
  SIFTER_DECK_Y,
  machineHash01,
  machineInstanceTint,
  setMachineScreenGlow,
  getMachineScreenTexture,
} from './machineSurfaces';
import {
  DECAL_ATLAS_SIZE,
  DECAL_CELL,
  getMachineDecalAtlas,
  planMachineDecals,
  writeDecalUvRects,
  writeDecalDialReadings,
  MACHINE_DECAL_GEOMETRY,
  MACHINE_DECAL_MATERIAL,
} from './machineDecals';
import { useProductionStore } from '../../stores/productionStore';
import { MachineData, MachineType } from '../../types';
import { generateMachineORM, generateMachinePanelNormal } from '../../textures';
import { generateEnamelORM } from '../../textures/paintedMetal';

const standardMaterials = Object.entries(MACHINE_MATERIALS).filter(
  (entry): entry is [string, THREE.MeshStandardMaterial] =>
    (entry[1] as THREE.Material).type === 'MeshStandardMaterial'
);

describe('machine material physics', () => {
  it('authors metalness as a hard binary - never the invalid half-metal band', () => {
    for (const [name, material] of standardMaterials) {
      expect([0, 1], `${name} metalness ${material.metalness}`).toContain(material.metalness);
    }
  });

  it('only assigns metalness 1 to hexes bright enough to be a real conductor F0', () => {
    // A metal's albedo IS its specular reflectance. Below ~0.3 linear nothing
    // in nature reflects that way, and the surface renders as a dim mirror.
    // `Color` already stores the working (linear) value - `set('#c2c9c7')` runs
    // the sRGB transfer function on assignment - so do NOT convert again here.
    for (const [name, material] of standardMaterials) {
      if (material.metalness !== 1) continue;
      const { r, g, b } = material.color;
      expect((r + g + b) / 3, `${name} F0`).toBeGreaterThan(0.3);
    }
  });

  it('never pairs an albedo map with a tint - the double-hue trap', () => {
    for (const [name, material] of standardMaterials) {
      if (!material.map) continue;
      expect(material.color.getHexString(), `${name} tint over a map`).toBe('ffffff');
    }
  });
});

describe('machine ORM channel wiring', () => {
  it('shares authored cavity data, while enamel avoids the brushed-stock AO grid', () => {
    for (const [name, material] of standardMaterials) {
      if (!material.roughnessMap) continue;
      if (['mill', 'sifter', 'packer'].includes(name)) {
        expect(material.aoMap, `${name} has no baked cavities`).toBeNull();
        expect(material.roughnessMap.source).toBe(generateEnamelORM().source);
        continue;
      }
      expect(material.aoMap, `${name} aoMap`).toBe(material.roughnessMap);
      expect(material.aoMapIntensity, `${name} aoMapIntensity`).toBeGreaterThan(0);
    }
  });

  it('never assigns a metalnessMap', () => {
    // generateMachineORM writes a constant 1 into B, so a metalnessMap is a
    // no-op on conductors (1 x 1) AND dielectrics (0 x 1) while still costing a
    // fetch and a shader permutation.
    for (const [name, material] of standardMaterials) {
      expect(material.metalnessMap, `${name} metalnessMap`).toBeNull();
    }
  });

  it('keeps final roughness inside a plausible band once the map multiplies', () => {
    for (const [name, material] of standardMaterials) {
      if (!material.roughnessMap) continue;
      // Measure the bound map. Brushed stock and coated castings now have
      // different distributions, so one copied range cannot verify both.
      const data = (material.roughnessMap.image as THREE.DataTextureImageData).data as Uint8Array;
      let minimum = 255;
      let maximum = 0;
      let sum = 0;
      for (let i = 1; i < data.length; i += 4) {
        minimum = Math.min(minimum, data[i]);
        maximum = Math.max(maximum, data[i]);
        sum += data[i];
      }
      const low = (material.roughness * minimum) / 255;
      const high = (material.roughness * maximum) / 255;
      const mean = (material.roughness * sum) / (255 * (data.length / 4));
      expect(low, `${name} min roughness`).toBeGreaterThan(0.1);
      expect(high, `${name} max roughness`).toBeLessThanOrEqual(1);
      expect(mean, `${name} mean roughness`).toBeGreaterThan(0.15);
    }
  });

  it('bands every detail map off a clone, never off the shared generator output', () => {
    // `getTexture` hands the SAME instance to every caller with the same
    // parameters - two of these keys are also used by the factory shell - so
    // setting `repeat` on the source would re-tile the whole site.
    const sharedSources = new Set<THREE.Texture>([
      generateMachineORM(512, 'vertical', 96),
      generateMachineORM(512, 'horizontal', 128),
      generateMachinePanelNormal(512, 4, 7),
      generateEnamelORM(),
    ]);
    for (const source of sharedSources) {
      expect(source.repeat.x, 'shared source repeat').toBe(1);
      expect(source.repeat.y, 'shared source repeat').toBe(1);
    }
    for (const [name, material] of standardMaterials) {
      for (const [label, map] of [
        ['roughnessMap', material.roughnessMap],
        ['normalMap', material.normalMap],
      ] as const) {
        if (!map) continue;
        expect(sharedSources.has(map), `${name} ${label} uses the shared source`).toBe(false);
        expect(map.wrapS, `${name} ${label} wrapS`).toBe(THREE.RepeatWrapping);
        expect(map.colorSpace, `${name} ${label} colorSpace`).toBe(THREE.NoColorSpace);
        expect(map.repeat.x, `${name} ${label} repeatX`).toBeGreaterThan(0);
        expect(map.repeat.y, `${name} ${label} repeatY`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps enamel isotropic, seamless and confined to a satin roughness band', () => {
    const map = generateEnamelORM();
    expect(map).toBe(generateEnamelORM());
    expect(map.colorSpace).toBe(THREE.NoColorSpace);
    const { data, width, height } = map.image as {
      data: Uint8Array;
      width: number;
      height: number;
    };
    let minimum = 255;
    let maximum = 0;
    let dx = 0;
    let dy = 0;
    let invalidPacking = 0;
    const green = (x: number, y: number) => data[(y * width + x) * 4 + 1];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i] !== 255 || data[i + 2] !== 0 || data[i + 3] !== 255) invalidPacking++;
        const value = green(x, y);
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
        dx += Math.abs(value - green((x + 1) % width, y));
        dy += Math.abs(value - green(x, (y + 1) % height));
      }
      expect(Math.abs(green(0, y) - green(width - 1, y))).toBeLessThanOrEqual(2);
    }
    expect(invalidPacking).toBe(0);
    expect(minimum / 255).toBeGreaterThanOrEqual(0.49);
    expect(maximum / 255).toBeLessThanOrEqual(0.67);
    expect(maximum - minimum).toBeGreaterThan(20);
    expect(dx / dy).toBeGreaterThan(0.7);
    expect(dx / dy).toBeLessThan(1.4);
    expect(MACHINE_MATERIALS.silo.roughnessMap!.source).not.toBe(map.source);
    expect(MACHINE_MATERIALS.roller.roughnessMap!.source).not.toBe(map.source);
  });

  it('keeps the authored normal-map contribution enabled', () => {
    for (const [name, material] of standardMaterials) {
      if (!material.normalMap) continue;
      expect(material.normalScale.x, `${name} normalScale`).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('uses fine enamel relief rather than an embossed cladding grid on the cast mill', () => {
    const map = MACHINE_MATERIALS.mill.normalMap!;
    const cladding = generateMachinePanelNormal(512, 4, 7);
    expect(map.image).not.toBe(cladding.image);
    const data = (map.image as THREE.DataTextureImageData).data as Uint8Array;
    let maximumSlope = 0;
    const redValues = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      const x = data[i] / 127.5 - 1;
      const y = data[i + 1] / 127.5 - 1;
      const z = data[i + 2] / 127.5 - 1;
      maximumSlope = Math.max(maximumSlope, Math.hypot(x, y) / z);
      redValues.add(data[i]);
    }
    expect(maximumSlope).toBeGreaterThan(0.01);
    expect(maximumSlope).toBeLessThan(0.16);
    expect(redValues.size).toBeGreaterThan(3);
  });
});

describe('ORM generator, measured rather than assumed', () => {
  it('binds the silo-specific finish without changing shared cladding textures', () => {
    const silo = MACHINE_MATERIALS.silo,
      trim = MACHINE_MATERIALS.siloRoof;
    expect(silo.roughnessMap!.image).toBe(generateGalvanizedORM().image);
    expect(trim.roughnessMap!.image).toBe(generateGalvanizedORM().image);
    expect(silo.roughnessMap!.repeat.toArray()).toEqual([25, 16]);
    expect(silo.normalMap!.repeat.toArray()).toEqual([25, 8]);
    expect(silo.normalMap!.image).toBe(generateGalvanizedNormal(true).image);
    expect(trim.normalMap!.image).toBe(generateGalvanizedNormal(false).image);
    expect(silo.metalness).toBe(1);
    expect(trim.metalness).toBe(1);
    expect(silo.roughness).toBe(1);
    expect(trim.roughness).toBe(1);
  });

  it('gives galvanized stock isotropic spangle without invented AO joints', () => {
    const map = generateGalvanizedORM();
    expect(map).toBe(generateGalvanizedORM());
    expect(map.colorSpace).toBe(THREE.NoColorSpace);
    const { data, width, height } = map.image as {
      data: Uint8Array;
      width: number;
      height: number;
    };
    let lo = 255,
      hi = 0,
      dx = 0,
      dy = 0,
      invalid = 0;
    const green = (x: number, y: number) => data[(y * width + x) * 4 + 1];
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4,
          value = green(x, y);
        if (data[i] !== 255 || data[i + 2] !== 255 || data[i + 3] !== 255) invalid++;
        lo = Math.min(lo, value);
        hi = Math.max(hi, value);
        dx += Math.abs(value - green((x + 1) % width, y));
        dy += Math.abs(value - green(x, (y + 1) % height));
      }
    expect(invalid).toBe(0);
    expect(lo / 255).toBeGreaterThan(0.55);
    expect(hi / 255).toBeLessThan(0.67);
    expect(hi - lo).toBeGreaterThan(20);
    expect(dx / dy).toBeGreaterThan(0.8);
    expect(dx / dy).toBeLessThan(1.25);
  });

  it('keeps fine corrugation signed and separate from plain roof grain', () => {
    const corrugated = generateGalvanizedNormal(true),
      trim = generateGalvanizedNormal(false);
    expect(corrugated).toBe(generateGalvanizedNormal(true));
    expect(trim).not.toBe(corrugated);
    for (const map of [corrugated, trim]) {
      expect(map.colorSpace).toBe(THREE.NoColorSpace);
      const data = map.image.data as Uint8Array;
      let sy = 0,
        maximum = 0,
        minimumY = 1,
        maximumY = -1;
      for (let i = 0; i < data.length; i += 4) {
        const x = data[i] / 127.5 - 1,
          y = data[i + 1] / 127.5 - 1,
          z = data[i + 2] / 127.5 - 1;
        sy += y;
        maximum = Math.max(maximum, Math.hypot(x, y) / z);
        minimumY = Math.min(minimumY, y);
        maximumY = Math.max(maximumY, y);
      }
      expect(Math.abs(sy / (data.length / 4))).toBeLessThan(0.001);
      expect(minimumY).toBeLessThan(0);
      expect(maximumY).toBeGreaterThan(0);
      if (map === corrugated) {
        expect(maximum).toBeGreaterThan(0.13);
        expect(maximum).toBeLessThan(0.17);
      } else expect(maximum).toBeLessThan(0.025);
    }
  });

  it('matches the declared mean and range of the roughness (green) channel', () => {
    // Twelve materials are authored against MACHINE_ORM_MEAN_ROUGHNESS. If the
    // generator ever changes, that constant must move with it - so measure it
    // instead of trusting a hand-copied number.
    const orm = generateMachineORM(512, 'horizontal', 128);
    const data = orm.image.data as Uint8Array;
    let total = 0;
    let min = 255;
    let max = 0;
    let count = 0;
    for (let i = 1; i < data.length; i += 4) {
      const g = data[i];
      total += g;
      if (g < min) min = g;
      if (g > max) max = g;
      count += 1;
    }
    const mean = total / count / 255;
    expect(Math.abs(mean - MACHINE_ORM_MEAN_ROUGHNESS)).toBeLessThan(0.03);
    expect(min / 255).toBeGreaterThanOrEqual(MACHINE_ORM_ROUGHNESS_RANGE.min - 0.01);
    expect(max / 255).toBeLessThanOrEqual(MACHINE_ORM_ROUGHNESS_RANGE.max + 0.01);
    // The failure this whole file exists to prevent: a channel that is a
    // near-constant, so the "map" multiplies by a fixed number and does nothing.
    expect(max / 255 - min / 255).toBeGreaterThan(0.2);
  });
});

describe('grime datum', () => {
  it('measures dirt from the deck the parts stand on, not from world zero', () => {
    // The plansifters live on the elevated deck at y = 9. Measuring from zero
    // saturates the smoothstep and silently zeroes the grime term on the three
    // largest sifter surfaces.
    for (const name of ['sifter', 'sifterTray', 'platform'] as const) {
      expect(MACHINE_MATERIALS[name].userData.machineWear.deck, `${name} deck`).toBe(SIFTER_DECK_Y);
    }
    for (const name of ['mill', 'packer', 'silo', 'siloLeg'] as const) {
      expect(MACHINE_MATERIALS[name].userData.machineWear.deck, `${name} deck`).toBe(0);
    }
    // Every worn material must resolve a datum, or the uniform is undefined.
    for (const [name, material] of standardMaterials) {
      if (material.customProgramCacheKey() !== MACHINE_WEAR_CACHE_KEY) continue;
      const wear = material.userData.machineWear as { deck: number; grimeHeight: number };
      expect(Number.isFinite(wear.deck), `${name} deck`).toBe(true);
      expect(wear.grimeHeight, `${name} grimeHeight`).toBeGreaterThan(0);
    }
  });
});

describe('thin-plate geometry', () => {
  it('builds a valid single-segment rounded box with per-face 0-1 UVs', () => {
    // CompactMachines swaps 14 plate-shaped parts onto
    // `RoundedBoxGeometry(1, 1, 1, 1, 0.02)`. Every texel-density band assumes
    // UVs still run 0-1 per face, and this repo has a documented history of NaN
    // geometry from off-by-one constructor arguments.
    const plate = new RoundedBoxGeometry(1, 1, 1, 1, 0.02);
    const position = plate.getAttribute('position');
    const uv = plate.getAttribute('uv');
    expect(position.count).toBeGreaterThan(0);
    expect(uv.count).toBe(position.count);
    for (let i = 0; i < position.count; i += 1) {
      expect(Number.isFinite(position.getX(i))).toBe(true);
      expect(Number.isFinite(position.getY(i))).toBe(true);
      expect(Number.isFinite(position.getZ(i))).toBe(true);
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(i)).toBeLessThanOrEqual(1);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(i)).toBeLessThanOrEqual(1);
    }
    plate.computeBoundingSphere();
    expect(Number.isFinite(plate.boundingSphere!.radius)).toBe(true);
    expect(plate.boundingSphere!.radius).toBeGreaterThan(0);
    plate.dispose();
  });
});

describe('shader cache keys', () => {
  it('returns a constant program cache key', () => {
    // CLAUDE.md: a key containing Date.now() recompiles the shader 60x a second.
    let worn = 0;
    for (const [name, material] of standardMaterials) {
      const first = material.customProgramCacheKey();
      const second = material.customProgramCacheKey();
      expect(second, `${name} cache key`).toBe(first);
      if (first === MACHINE_WEAR_CACHE_KEY) worn += 1;
    }
    expect(worn, 'materials carrying the wear shader').toBeGreaterThan(5);
  });

  it('injects byte-identical GLSL into every worn material', () => {
    const compile = (material: THREE.MeshStandardMaterial): string => {
      const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <project_vertex>',
        fragmentShader: '#include <common>\n#include <normal_fragment_maps>',
      };
      material.onBeforeCompile(
        shader as unknown as THREE.WebGLProgramParametersWithUniforms,
        null as unknown as THREE.WebGLRenderer
      );
      return `${shader.vertexShader}|${shader.fragmentShader}`;
    };
    const worn = standardMaterials.filter(
      ([, m]) => m.customProgramCacheKey?.() === MACHINE_WEAR_CACHE_KEY
    );
    expect(worn.length).toBeGreaterThan(5);
    const reference = compile(worn[0][1]);
    for (const [name, material] of worn) {
      expect(compile(material), `${name} injected source`).toBe(reference);
    }
    // The worldPosition it computes must not depend on three's guarded chunk.
    expect(reference).toContain('vMachineWorldPos = ( modelMatrix * machineWorld ).xyz;');
    expect(reference).not.toContain('worldPosition');
  });
});

describe('screen emissive gating', () => {
  it('shares a dark sRGB display map with sparse backlit instrument marks', () => {
    const screen = MACHINE_MATERIALS.screen;
    const map = getMachineScreenTexture();
    expect(screen.map).toBe(map);
    expect(screen.emissiveMap).toBe(map);
    expect(map).toBe(getMachineScreenTexture());
    expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(screen.emissive.getHexString()).toBe('ffffff');
    const data = map.image.data as Uint8Array;
    let dark = 0;
    let marked = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.max(data[i], data[i + 1], data[i + 2]) < 65) dark++;
      if (Math.max(data[i], data[i + 1], data[i + 2]) > 120) marked++;
    }
    expect(dark / (data.length / 4)).toBeGreaterThan(0.7);
    expect(marked / (data.length / 4)).toBeGreaterThan(0.05);
    expect(marked / (data.length / 4)).toBeLessThan(0.2);
  });

  it('only pushes emissive above 1.0 when the composer is mounted', () => {
    setMachineScreenGlow(false);
    expect(MACHINE_MATERIALS.screen.emissiveIntensity).toBeLessThanOrEqual(1);
    setMachineScreenGlow(true);
    expect(MACHINE_MATERIALS.screen.emissiveIntensity).toBeGreaterThan(1);
    setMachineScreenGlow(false);
  });

  it('retains a subdued instrument glow rather than a clipped cyan tile', () => {
    const { r, g, b } = MACHINE_MATERIALS.screen.emissive;
    const data = (MACHINE_MATERIALS.screen.emissiveMap!.image as THREE.DataTextureImageData)
      .data as Uint8Array;
    const texel = new THREE.Color();
    let sum = 0;
    let peak = 0;
    // The emitter is now an sRGB image multiplied by the material colour.
    // Measuring the white multiplier alone ignores the entire display face.
    for (let i = 0; i < data.length; i += 4) {
      texel.setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, THREE.SRGBColorSpace);
      const luminance = 0.2126 * r * texel.r + 0.7152 * g * texel.g + 0.0722 * b * texel.b;
      sum += luminance;
      peak = Math.max(peak, luminance);
    }
    setMachineScreenGlow(true);
    const intensity = MACHINE_MATERIALS.screen.emissiveIntensity;
    expect((sum / (data.length / 4)) * intensity).toBeLessThan(0.08);
    expect(peak * intensity).toBeLessThan(1);
    expect(peak).toBeGreaterThan(0.3);
    setMachineScreenGlow(false);
  });
});

describe('per-instance tint', () => {
  it('is deterministic and stays subtle', () => {
    const a = machineInstanceTint(new THREE.Color(), 'SILO-01', 1);
    const b = machineInstanceTint(new THREE.Color(), 'SILO-01', 1);
    expect(a.getHex()).toBe(b.getHex());
    for (const id of ['SILO-01', 'RM-104', 'PLANSIFTER-C', 'PACKER-3']) {
      const tint = machineInstanceTint(new THREE.Color(), id, 1);
      for (const channel of [tint.r, tint.g, tint.b]) {
        expect(Math.abs(channel - 1)).toBeLessThan(0.06);
      }
    }
  });

  it('collapses to white when variation is disabled', () => {
    const tint = machineInstanceTint(new THREE.Color(), 'SILO-01', 0);
    expect(tint.r).toBe(1);
    expect(tint.g).toBe(1);
    expect(tint.b).toBe(1);
  });

  it('spreads ids across the hash range', () => {
    const values = ['a', 'b', 'c', 'SILO-01', 'SILO-02', 'SILO-03'].map((id) =>
      machineHash01(id, 17)
    );
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

const machine = (
  id: string,
  type: MachineType,
  position: [number, number, number]
): MachineData => ({
  id,
  name: id,
  type,
  position,
  size: [1, 1, 1],
  rotation: 0,
  status: 'running',
  metrics: { rpm: 0, temperature: 0, vibration: 0, load: 50, wear: 0, efficiency: 100 },
  lastMaintenance: '',
  nextMaintenance: '',
});

describe('machine decals', () => {
  const subsets = {
    silos: [machine('S1', MachineType.SILO, [0, 0, -22])],
    mills: [machine('M1', MachineType.ROLLER_MILL, [10, 0, -6])],
    sifters: [machine('P1', MachineType.PLANSIFTER, [-10, 9, 6])],
    packers: [machine('K1', MachineType.PACKER, [4, 0, 20])],
  };

  it('seats the silo caution plate on the lower access cover, beside the ladder', () => {
    const silo = {
      ...machine('S1', MachineType.SILO, [65, 0, 59]),
      size: SITE_LAYOUT.machineDimensions.silo,
    };
    const placements = planMachineDecals({ silos: [silo], mills: [], sifters: [], packers: [] });
    const caution = placements.find((placement) => placement.cell === DECAL_CELL.cautionTriangle)!;
    const layout = SILO_ACCESS_LAYOUT,
      radius = layout.hatchRadius + layout.hatchSize[2] / 2 + 0.015;
    expect(caution.position[1]).toBe(2);
    expect(Math.hypot(caution.position[0] - 65, caution.position[2] - 59)).toBeCloseTo(
      (radius * 12) / 4.5,
      5
    );
    expect(caution.rotationY).toBe(layout.hatchAngle);
    expect(caution.position[0] - caution.size[0] / 2).toBeGreaterThan(
      65 + (layout.ladderHalfWidth * 12) / 4.5
    );
  });

  it('assigns distinct engraved identities to the four real mills in the same atlas', () => {
    const mills = [101, 102, 103, 104].map((id, index) =>
      machine(`rm-${id}`, MachineType.ROLLER_MILL, [index * 14, 0, 30])
    );
    const plates = planMachineDecals({ silos: [], mills, sifters: [], packers: [] });
    const sidePlates = plates.filter(
      (plate) => plate.rotationY === -Math.PI / 2 && plate.cell !== DECAL_CELL.motorLoadDial
    );
    expect(sidePlates.map((plate) => plate.cell)).toEqual([
      DECAL_CELL.mill101,
      DECAL_CELL.mill102,
      DECAL_CELL.mill103,
      DECAL_CELL.mill104,
    ]);
    expect(plates).toHaveLength(20);
  });

  it('builds an atlas with a transparent gutter around every cell', () => {
    const atlas = getMachineDecalAtlas();
    expect(atlas.image.width).toBe(DECAL_ATLAS_SIZE.width);
    expect(atlas.image.height).toBe(DECAL_ATLAS_SIZE.height);
    expect(atlas.colorSpace).toBe(THREE.SRGBColorSpace);

    const data = atlas.image.data as Uint8Array;
    const cellPx = DECAL_ATLAS_SIZE.width / 4;
    for (let cell = 0; cell < DECAL_ATLAS_SIZE.cells; cell += 1) {
      const col = cell % 4;
      const row = Math.floor(cell / 4);
      // Gutter texel: must be fully transparent so mips do not bleed.
      const gx = col * cellPx + 1;
      const gy = row * cellPx + 1;
      expect(data[(gy * DECAL_ATLAS_SIZE.width + gx) * 4 + 3], `cell ${cell} gutter`).toBe(0);
      // Centre texel: must carry ink, or the cell painted nothing.
      const cx = col * cellPx + cellPx / 2;
      const cy = row * cellPx + cellPx / 2;
      expect(
        data[(cy * DECAL_ATLAS_SIZE.width + cx) * 4 + 3],
        `cell ${cell} centre`
      ).toBeGreaterThan(0);
    }
  });

  it('places each placard at its host, including the side-mounted load dial', () => {
    const placements = planMachineDecals(subsets);
    expect(placements).toHaveLength(2 + 4 + 3 + 3);
    const hosts = [...subsets.silos, ...subsets.mills, ...subsets.sifters, ...subsets.packers];
    for (const placement of placements) {
      const host = hosts.find(
        (candidate) =>
          Math.abs(candidate.position[0] - placement.position[0]) < 4 &&
          Math.abs(candidate.position[2] - placement.position[2]) < 4
      );
      expect(host, `no host for decal at ${placement.position.join(',')}`).toBeDefined();
      if (placement.rotationY === -Math.PI / 2)
        expect(placement.position[0] - host!.position[0]).toBeLessThan(-2.4);
      else expect(placement.position[2] - host!.position[2]).toBeGreaterThan(0);
      expect(placement.size[0]).toBeGreaterThan(0);
      expect(placement.size[1]).toBeGreaterThan(0);
      expect(Object.values(DECAL_CELL)).toContain(placement.cell);
    }
  });

  it('writes one uv rect per placard and reuses the attribute when the count holds', () => {
    const placements = planMachineDecals(subsets);
    writeDecalUvRects(MACHINE_DECAL_GEOMETRY, placements);
    const first = MACHINE_DECAL_GEOMETRY.getAttribute('aDecalUvRect');
    expect(first.count).toBe(placements.length);
    writeDecalUvRects(MACHINE_DECAL_GEOMETRY, placements);
    expect(MACHINE_DECAL_GEOMETRY.getAttribute('aDecalUvRect')).toBe(first);

    // Every rect must land inside 0-1 and cover exactly one cell.
    for (let i = 0; i < first.count; i += 1) {
      expect(first.getX(i)).toBeGreaterThanOrEqual(0);
      expect(first.getY(i)).toBeGreaterThanOrEqual(0);
      expect(first.getX(i) + first.getZ(i)).toBeLessThanOrEqual(1);
      expect(first.getY(i) + first.getW(i)).toBeLessThanOrEqual(1);
    }
  });

  it('updates the existing attribute from a metric-only production-store change', () => {
    const original = useProductionStore.getState().machines;
    const mill = machine('rm-101', MachineType.ROLLER_MILL, [0, 0, 0]);
    const placements = planMachineDecals({ ...subsets, mills: [mill] });
    const geometry = new THREE.PlaneGeometry();
    writeDecalUvRects(geometry, placements);
    const attribute = geometry.getAttribute('aDecalDialValue') as THREE.InstancedBufferAttribute;
    const dialIndex = placements.findIndex((plate) => plate.cell === DECAL_CELL.motorLoadDial);
    try {
      useProductionStore.setState({ machines: [mill] });
      writeDecalDialReadings(geometry, placements, useProductionStore.getState().machines);
      expect(attribute.getX(dialIndex)).toBe(0.5);
      useProductionStore.getState().updateMachineMetrics(mill.id, { load: 73 });
      const current = useProductionStore.getState().machines;
      expect(current[0].status).toBe(mill.status);
      expect(current[0]).not.toBe(mill);
      writeDecalDialReadings(geometry, placements, current);
      expect(geometry.getAttribute('aDecalDialValue')).toBe(attribute);
      expect(attribute.getX(dialIndex)).toBeCloseTo(0.73, 6);
      for (let i = 0; i < placements.length; i++)
        if (i !== dialIndex) expect(attribute.getX(i)).toBe(-2);
      const version = attribute.version;
      writeDecalDialReadings(geometry, placements, current);
      expect(attribute.version).toBe(version);
    } finally {
      useProductionStore.setState({ machines: original });
      geometry.dispose();
    }
  });

  it('keeps zero and full load valid while missing and invalid readings have no needle', () => {
    const mill = machine('rm-101', MachineType.ROLLER_MILL, [0, 0, 0]);
    const placements = planMachineDecals({ silos: [], mills: [mill], sifters: [], packers: [] });
    const geometry = new THREE.PlaneGeometry();
    writeDecalUvRects(geometry, placements);
    const attribute = geometry.getAttribute('aDecalDialValue');
    const index = placements.findIndex((plate) => plate.cell === DECAL_CELL.motorLoadDial);
    for (const load of [0, 50, 100]) {
      writeDecalDialReadings(geometry, placements, [
        { ...mill, metrics: { ...mill.metrics, load } },
      ]);
      expect(attribute.getX(index)).toBe(load / 100);
    }
    for (const load of [NaN, Infinity, -1, 101]) {
      writeDecalDialReadings(geometry, placements, [
        { ...mill, metrics: { ...mill.metrics, load } },
      ]);
      expect(attribute.getX(index)).toBe(-1);
    }
    writeDecalDialReadings(geometry, placements, []);
    expect(attribute.getX(index)).toBe(-1);
    geometry.dispose();
  });

  it('keeps the atlas dimensions and stamps all 21 scale ticks along the needle arc', () => {
    const atlas = getMachineDecalAtlas();
    expect([atlas.image.width, atlas.image.height]).toEqual([512, 384]);
    const data = atlas.image.data as Uint8Array;
    const cell = DECAL_CELL.motorLoadDial;
    const originX = (cell % 4) * 128;
    const originY = Math.floor(cell / 4) * 128;
    for (let tick = 0; tick <= 20; tick++) {
      const angle = (1.25 - (tick / 20) * 1.5) * Math.PI;
      const x = Math.round(originX + 6 + (0.5 + Math.cos(angle) * 0.38) * 116);
      const y = Math.round(originY + 6 + (0.5 + Math.sin(angle) * 0.38) * 116);
      let darkest = 255;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          darkest = Math.min(darkest, data[((y + dy) * 512 + x + dx) * 4]);
      expect(darkest, `tick ${tick}`).toBeLessThan(90);
    }
  });

  it('injects the live needle in the lit opaque decal pipeline', () => {
    const shader = {
      vertexShader: '#include <common>\n#include <uv_vertex>',
      fragmentShader: '#include <common>\n#include <map_fragment>',
      uniforms: {},
    } as THREE.WebGLProgramParametersWithUniforms;
    MACHINE_DECAL_MATERIAL.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('aDecalDialValue');
    expect(shader.fragmentShader).toContain('vDecalDialValue * 4.712388980');
    expect(shader.fragmentShader).toContain('distanceToDash');
    expect(MACHINE_DECAL_MATERIAL.customProgramCacheKey()).toBe('machineDecal_v2');
    expect(MACHINE_DECAL_MATERIAL.transparent).toBe(false);
    expect(MACHINE_DECAL_MATERIAL.isMeshStandardMaterial).toBe(true);
  });
});
