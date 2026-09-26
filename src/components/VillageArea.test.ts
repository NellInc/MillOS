import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  VILLAGE_GROUND_MATERIAL,
  VILLAGE_GROUND_GEOMETRY,
  VILLAGE_COBBLE_TILE_METRES,
  VILLAGE_BUILDING_FOOTPRINTS,
  VILLAGE_STREET_CORRIDORS,
  VILLAGE_PAVED_AREAS,
} from './VillageArea';
import { SITE_LAYOUT, landmarkLocalToWorld } from '../constants/siteLayout';

vi.mock('../utils/critterAudio', () => ({ playCritterSound: vi.fn() }));

describe('village square edge feather', () => {
  it('injects the real material with the inverse authored landmark transform', () => {
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    } as THREE.WebGLProgramParametersWithUniforms;
    VILLAGE_GROUND_MATERIAL.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    const inverse = shader.uniforms.uVillageWorldToLocal.value as THREE.Matrix4;
    for (const local of [
      [0, 0, 0],
      [-35, 0, -65],
      [35, 0, 65],
    ] as const) {
      const world = landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, local);
      expect(
        new THREE.Vector3(...world).applyMatrix4(inverse).distanceTo(new THREE.Vector3(...local))
      ).toBeLessThan(1e-9);
    }
    expect(shader.vertexShader).toContain('uniform mat4 uVillageWorldToLocal;');
    expect(shader.vertexShader).toContain('(uVillageWorldToLocal * millosVillageWorldPosition).xz');
    expect(shader.vertexShader).not.toContain('vec2(190.0, 0.0)');
    expect(shader.fragmentShader).toContain('vec2 q = abs(vLocalPos) - vec2(23.0, 53.0)');
    expect(
      shader.uniforms.uVillagePavingRegions.value.map((v: THREE.Vector4) => v.toArray())
    ).toEqual(VILLAGE_PAVED_AREAS.map(({ x, z, halfX, halfZ }) => [x, z, halfX, halfZ]));
    expect(shader.fragmentShader).toContain(
      `uniform vec4 uVillagePavingRegions[${VILLAGE_PAVED_AREAS.length}]`
    );
    expect(shader.fragmentShader).toContain('abs(vLocalPos - region.xy) - region.zw');
    expect(VILLAGE_GROUND_MATERIAL.customProgramCacheKey()).toBe('villageCobble_feather_v3');
  });

  it('uses metre-scaled cobbles on the actual ground geometry', () => {
    const position = VILLAGE_GROUND_GEOMETRY.getAttribute('position');
    const uv = VILLAGE_GROUND_GEOMETRY.getAttribute('uv');
    expect(VILLAGE_COBBLE_TILE_METRES).toBe(6);
    for (let i = 0; i < position.count; i++) {
      expect(uv.getX(i) * VILLAGE_COBBLE_TILE_METRES - 35).toBeCloseTo(position.getX(i), 4);
      expect(uv.getY(i) * VILLAGE_COBBLE_TILE_METRES - 65).toBeCloseTo(position.getY(i), 4);
    }
  });

  it('keeps through streets outside the buildings, well and pond', () => {
    const obstacles = [
      ...VILLAGE_BUILDING_FOOTPRINTS,
      { x: -10, z: -5, halfX: 2.2, halfZ: 2.2 },
      { x: 20, z: 25, halfX: 6, halfZ: 6 },
    ];
    for (const road of VILLAGE_STREET_CORRIDORS) {
      for (const obstacle of obstacles) {
        expect(
          Math.max(
            Math.abs(road.x - obstacle.x) - road.halfX - obstacle.halfX,
            Math.abs(road.z - obstacle.z) - road.halfZ - obstacle.halfZ
          )
        ).toBeGreaterThanOrEqual(0.5);
      }
    }
  });

  it('connects every paved area and leaves at least half the village in grass', () => {
    const areas = VILLAGE_PAVED_AREAS;
    const reached = new Set([0]);
    for (let pass = 0; pass < areas.length; pass++) {
      areas.forEach((a, i) => {
        if (
          [...reached].some((j) => {
            const b = areas[j];
            return (
              Math.abs(a.x - b.x) <= a.halfX + b.halfX && Math.abs(a.z - b.z) <= a.halfZ + b.halfZ
            );
          })
        )
          reached.add(i);
      });
    }
    expect(reached.size).toBe(areas.length);
    let paved = 0;
    for (let x = -34.5; x < 35; x++) {
      for (let z = -64.5; z < 65; z++) {
        if (areas.some((a) => Math.abs(x - a.x) <= a.halfX && Math.abs(z - a.z) <= a.halfZ))
          paved++;
      }
    }
    expect(paved / (70 * 130)).toBeLessThan(0.5);
    expect(paved / (70 * 130)).toBeGreaterThan(0.2);
    for (const b of VILLAGE_BUILDING_FOOTPRINTS.filter((b) => Math.abs(b.x) > 10)) {
      const entranceX = b.x - Math.sign(b.x) * b.halfX;
      expect(
        areas.some((a) => Math.abs(entranceX - a.x) <= a.halfX && Math.abs(b.z - a.z) <= a.halfZ)
      ).toBe(true);
    }
  });
});
