import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  FIXTURE_GRID_X,
  FIXTURE_GRID_Z,
  REDUCED_ZONE_LIGHT_POSITIONS,
  ZONE_LIGHT_DISTANCE,
  ZONE_LIGHT_DECAY,
  FULL_BANK_GAIN,
  ZONE_LIGHT_HEIGHT,
  ZONE_LIGHT_INTENSITY,
  ZONE_LIGHT_POSITIONS,
  createLightPoolTexture,
  floorPoolPositions,
  zoneLightPositions,
  zoneWorkLightIntensity,
} from './InteriorLightRig';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { sampleAtmosphere, sampleCelestial } from '../../simulation/atmosphere';
import { buildSpoutRoutes, SPOUT_PIPE_RADIUS } from '../flow/spoutRoutes';
import { type MachineData, MachineType } from '../../types';
import { COMMUNITY_ROSTER } from '../../simulation/communityLife';
import { MILL_CONTROL_FACE } from '../machines/machineFinishGeometry';

/** Three's actual distance window, parameterised by the shipped bank profile. */
function pointLightIrradiance(
  intensity: number,
  distance: number,
  cutoff: number,
  decay = ZONE_LIGHT_DECAY
): number {
  const falloff = intensity / Math.max(distance ** decay, 0.01);
  const window = Math.pow(Math.max(0, Math.min(1, 1 - Math.pow(distance / cutoff, 4))), 2);
  return falloff * window;
}

describe('zone lights', () => {
  it('adds bounded warm night power without changing noon or introducing a switch', () => {
    expect(zoneWorkLightIntensity(1)).toBe(ZONE_LIGHT_INTENSITY);
    expect(zoneWorkLightIntensity(0)).toBeCloseTo(ZONE_LIGHT_INTENSITY * 1.65, 10);
    expect(zoneWorkLightIntensity(NaN)).toBe(ZONE_LIGHT_INTENSITY);
    expect(zoneWorkLightIntensity(-1)).toBe(zoneWorkLightIntensity(0));
    expect(zoneWorkLightIntensity(2)).toBe(ZONE_LIGHT_INTENSITY);
    let previous = zoneWorkLightIntensity(0);
    for (let i = 1; i <= 100; i++) {
      const intensity = zoneWorkLightIntensity(i / 100);
      expect(intensity).toBeLessThanOrEqual(previous);
      expect(previous - intensity).toBeLessThan(ZONE_LIGHT_INTENSITY * 0.011);
      previous = intensity;
    }
    expect(zoneWorkLightIntensity(sampleAtmosphere(0, 12, 'clear').daylight)).toBe(
      ZONE_LIGHT_INTENSITY
    );
    expect(zoneWorkLightIntensity(sampleAtmosphere(0, 22, 'clear').daylight)).toBeCloseTo(
      ZONE_LIGHT_INTENSITY * 1.65
    );
  });

  it('places four lights below real ceiling fixtures and no more', () => {
    // Four is a hard ceiling, not a starting point: three's forward renderer
    // puts every point light in every lit material's uniform block with no
    // per-object culling, so each one is fragment cost on the exterior cameras
    // too, where they contribute nothing.
    expect(ZONE_LIGHT_POSITIONS).toHaveLength(4);
    expect(ZONE_LIGHT_HEIGHT).toBeLessThan(SITE_LAYOUT.factory.bounds.maxY - 3.8);
    for (const position of ZONE_LIGHT_POSITIONS) {
      expect(FIXTURE_GRID_X).toContain(position[0]);
      expect(FIXTURE_GRID_Z).toContain(position[2]);
      expect(position[1]).toBe(ZONE_LIGHT_HEIGHT);
    }
  });

  it('lights the real milling duty fronts and all four sloping control faces', () => {
    const people = COMMUNITY_ROSTER.filter((person) =>
      ['mill-operator-west', 'mill-operator-east', 'mill-engineer'].includes(person.id)
    );
    expect(people).toHaveLength(3);
    const faceNormal = new THREE.Vector3(0, 0, 1);
    const direction = new THREE.Vector3();
    const direct = (
      lights: readonly (readonly [number, number, number])[],
      point: THREE.Vector3,
      normal: THREE.Vector3
    ) =>
      lights.reduce((sum, light) => {
        direction.set(...light).sub(point);
        const distance = direction.length();
        return (
          sum +
          pointLightIrradiance(
            ZONE_LIGHT_INTENSITY * (lights === ZONE_LIGHT_POSITIONS ? FULL_BANK_GAIN : 1),
            distance,
            ZONE_LIGHT_DISTANCE
          ) *
            Math.max(0, direction.normalize().dot(normal))
        );
      }, 0);
    for (const lights of [ZONE_LIGHT_POSITIONS, REDUCED_ZONE_LIGHT_POSITIONS]) {
      for (const person of people) {
        const duty = person.stops[0];
        faceNormal.set(Math.sin(duty.rotation), 0, Math.cos(duty.rotation));
        const face = new THREE.Vector3(...duty.position).add(new THREE.Vector3(0, 1.6, 0));
        // The old z38 row was behind every forward-facing duty station.
        expect(direct(lights, face, faceNormal), person.id).toBeGreaterThan(0.02);
      }
      for (const mill of SITE_LAYOUT.machines.rollerMills) {
        const panel = new THREE.Vector3(...mill.position).add(
          new THREE.Vector3(...MILL_CONTROL_FACE.position)
        );
        const panelNormal = new THREE.Vector3(0, 0, 1).applyAxisAngle(
          new THREE.Vector3(1, 0, 0),
          MILL_CONTROL_FACE.rotationX
        );
        expect(direct(lights, panel, panelNormal), mill.id).toBeGreaterThan(0.05);
      }
    }
    expect(FIXTURE_GRID_Z[2]).toBe(SITE_LAYOUT.factory.zones.milling);
  });

  it('lights the actual maintenance-route briefing and packing duty fronts', () => {
    const direct = (point: THREE.Vector3, rotation: number, quality: 'medium' | 'high') => {
      const normal = new THREE.Vector3(Math.sin(rotation), 0, Math.cos(rotation));
      return zoneLightPositions(quality).reduce((sum, position) => {
        const delta = new THREE.Vector3(...position).sub(point);
        return (
          sum +
          pointLightIrradiance(
            zoneWorkLightIntensity(1, quality),
            delta.length(),
            ZONE_LIGHT_DISTANCE
          ) *
            Math.max(0, delta.normalize().dot(normal))
        );
      }, 0);
    };
    for (const quality of ['medium', 'high'] as const) {
      // Actual retained CE night view, ordinary safe-route root and heading.
      expect(
        direct(new THREE.Vector3(-32.25, 1.6, 29.255603277777357), Math.PI, quality)
      ).toBeGreaterThan(0.06);
      for (const id of ['mill-packer', 'mill-quality']) {
        const duty = COMMUNITY_ROSTER.find((person) => person.id === id)!.stops[0];
        expect(
          direct(
            new THREE.Vector3(...duty.position).add(new THREE.Vector3(0, 1.6, 0)),
            duty.rotation,
            quality
          ),
          id
        ).toBeGreaterThan(0.3);
      }
    }
  });

  it('bounds light energy on every actual process pipe', () => {
    const sun = sampleCelestial(sampleAtmosphere(0, 12, 'clear')).sunLightIntensity;
    const groups = [
      [SITE_LAYOUT.machines.silos, MachineType.SILO, SITE_LAYOUT.machineDimensions.silo],
      [
        SITE_LAYOUT.machines.rollerMills,
        MachineType.ROLLER_MILL,
        SITE_LAYOUT.machineDimensions.rollerMill,
      ],
      [SITE_LAYOUT.machines.sifters, MachineType.PLANSIFTER, SITE_LAYOUT.machineDimensions.sifter],
      [SITE_LAYOUT.machines.packers, MachineType.PACKER, SITE_LAYOUT.machineDimensions.packer],
    ] as const;
    const machines = groups.flatMap(([anchors, type, size]) =>
      anchors.map((anchor) => ({ ...anchor, type, size: [...size] }))
    ) as unknown as MachineData[];
    const routes = buildSpoutRoutes(machines);
    expect(routes).toHaveLength(11);
    let peak = { irradiance: 0, family: '', point: [] as number[], light: [] as readonly number[] };
    for (const route of routes) {
      for (const point of route.curve.getSpacedPoints(1600)) {
        for (const light of [...ZONE_LIGHT_POSITIONS, ...REDUCED_ZONE_LIGHT_POSITIONS]) {
          const distance = point.distanceTo(new THREE.Vector3(...light)) - SPOUT_PIPE_RADIUS;
          const irradiance = pointLightIrradiance(
            ZONE_LIGHT_INTENSITY,
            distance,
            ZONE_LIGHT_DISTANCE
          );
          if (irradiance > peak.irradiance)
            peak = { irradiance, family: route.family, point: point.toArray(), light };
        }
      }
    }
    expect(peak.irradiance, JSON.stringify(peak)).toBeLessThan(sun * 2);
  });

  it('lands a readable pool on the floor without a hotspot', () => {
    const floorDrop = ZONE_LIGHT_HEIGHT - SITE_LAYOUT.datum.interiorFloor;
    const irradiance = pointLightIrradiance(ZONE_LIGHT_INTENSITY, floorDrop, ZONE_LIGHT_DISTANCE);
    const ambient = sampleCelestial(sampleAtmosphere(0, 12, 'clear')).ambientLightIntensity;

    expect(irradiance).toBeGreaterThan(ambient * 3);
    expect(irradiance).toBeLessThan(ambient * 6);
    // Below the direct sun, so an interior lit only by fixtures never reads
    // brighter than the yard outside the door.
    expect(irradiance).toBeLessThan(
      sampleCelestial(sampleAtmosphere(0, 12, 'clear')).sunLightIntensity
    );
  });

  it('reaches zero at the cutoff instead of clipping to a visible edge', () => {
    expect(
      pointLightIrradiance(ZONE_LIGHT_INTENSITY, ZONE_LIGHT_DISTANCE, ZONE_LIGHT_DISTANCE)
    ).toBe(0);
    const nearCutoff = pointLightIrradiance(
      ZONE_LIGHT_INTENSITY,
      ZONE_LIGHT_DISTANCE * 0.95,
      ZONE_LIGHT_DISTANCE
    );
    expect(nearCutoff).toBeGreaterThan(0);
    expect(nearCutoff).toBeLessThan(0.05);
  });
});

/** Floor irradiance at a world point from a set of zone lights. */
function floorIrradiance(
  lights: readonly (readonly [number, number, number])[],
  z: number,
  x = 0,
  gain = lights === ZONE_LIGHT_POSITIONS ? FULL_BANK_GAIN : 1
): number {
  return lights.reduce(
    (total, light) =>
      total +
      pointLightIrradiance(
        ZONE_LIGHT_INTENSITY * gain,
        Math.hypot(x - light[0], ZONE_LIGHT_HEIGHT, z - light[2]),
        ZONE_LIGHT_DISTANCE
      ),
    0
  );
}

describe('zone light count by quality tier', () => {
  it('gives every emitted light a unique identity across quality changes', () => {
    const source = readFileSync('src/components/environment/InteriorLightRig.tsx', 'utf8');
    // Read the actual JSX key, not a parallel table that cannot see the
    // reconciler. A repeated row-only key left extra lights alive after Low.
    const key = source.match(/key=\{`(zone-light-[^`]+)`\}/)?.[1];
    expect(key).toBeDefined();
    for (const quality of ['low', 'medium', 'high', 'ultra'] as const) {
      const names = zoneLightPositions(quality).map((position) =>
        key!.replace('${index}', String(zoneLightPositions(quality).indexOf(position)))
      );
      expect(new Set(names).size, `${quality}: ${names.join(', ')}`).toBe(names.length);
    }
  });

  it('keeps all four above medium and halves them at or below', () => {
    // The count is a program define (`NUM_POINT_LIGHTS`), so it can only move
    // when something that already rebuilds programs moves. The tier is that
    // thing; a per-frame or per-camera toggle is not.
    expect(zoneLightPositions('ultra')).toBe(ZONE_LIGHT_POSITIONS);
    expect(zoneLightPositions('high')).toBe(ZONE_LIGHT_POSITIONS);
    expect(zoneLightPositions('medium')).toBe(REDUCED_ZONE_LIGHT_POSITIONS);
    expect(zoneLightPositions('low')).toBe(REDUCED_ZONE_LIGHT_POSITIONS);
    expect(REDUCED_ZONE_LIGHT_POSITIONS).toHaveLength(2);
  });

  it('puts each surviving light at the centre of its paired bank', () => {
    expect(REDUCED_ZONE_LIGHT_POSITIONS.map((position) => position[2])).toEqual([
      (ZONE_LIGHT_POSITIONS[0][2] + ZONE_LIGHT_POSITIONS[1][2]) / 2,
      (ZONE_LIGHT_POSITIONS[2][2] + ZONE_LIGHT_POSITIONS[3][2]) / 2,
    ]);
    for (const position of REDUCED_ZONE_LIGHT_POSITIONS) {
      expect(position[0]).toBe(0);
      expect(position[1]).toBe(ZONE_LIGHT_HEIGHT);
    }
  });

  it('retains the old under-fixture radiance with bounded broad banks', () => {
    expect(ZONE_LIGHT_DECAY).toBe(0);
    expect(ZONE_LIGHT_DISTANCE).toBe(44);
    const old = pointLightIrradiance(380, ZONE_LIGHT_HEIGHT, 44, 2);
    expect(pointLightIrradiance(ZONE_LIGHT_INTENSITY, ZONE_LIGHT_HEIGHT, 44)).toBeCloseTo(old, 10);
    expect(floorIrradiance(REDUCED_ZONE_LIGHT_POSITIONS, -14)).toBeGreaterThan(old * 0.8);
  });

  it('keeps the illumination reference exact and the same source counts on every tier', () => {
    for (const quality of ['low', 'medium', 'high', 'ultra'] as const) {
      const reference = zoneLightPositions(quality, true);
      expect(reference).toHaveLength(zoneLightPositions(quality).length);
      expect([...new Set(reference.map((position) => position[2]))]).toEqual([-8, 30]);
      expect(zoneWorkLightIntensity(1, quality, true)).toBe(380);
      expect(zoneWorkLightIntensity(0, quality, true)).toBeCloseTo(627);
      expect(zoneWorkLightIntensity(1, quality)).toBeCloseTo(
        ZONE_LIGHT_INTENSITY * (quality === 'high' || quality === 'ultra' ? FULL_BANK_GAIN : 1)
      );
    }
  });

  it('preserves centre-line coverage while reducing outer-bay illumination', () => {
    const { milling, sifting, packing } = SITE_LAYOUT.factory.zones;
    const zones = [milling, sifting, packing];
    for (const z of zones) {
      const ratio =
        floorIrradiance(REDUCED_ZONE_LIGHT_POSITIONS, z) / floorIrradiance(ZONE_LIGHT_POSITIONS, z);
      expect(ratio).toBeGreaterThan(0.75);
      expect(ratio).toBeLessThan(1);
    }

    // The middle aisle must retain useful artificial illumination too.
    const midpoint = (REDUCED_ZONE_LIGHT_POSITIONS[0][2] + REDUCED_ZONE_LIGHT_POSITIONS[1][2]) / 2;

    // Still well clear of the ambient term everywhere the machinery is, which
    // is what stops the reduced tier reading as an unlit shed.
    const ambient = sampleCelestial(sampleAtmosphere(0, 12, 'clear')).ambientLightIntensity;
    expect(floorIrradiance(REDUCED_ZONE_LIGHT_POSITIONS, midpoint)).toBeGreaterThan(ambient * 2);
    for (const z of zones) {
      expect(floorIrradiance(REDUCED_ZONE_LIGHT_POSITIONS, z)).toBeGreaterThan(ambient * 2);
    }
  });
});

it('keeps every near silo wall outside the indoor fixture cutoff', () => {
  for (const {
    position: [x, , z],
  } of SITE_LAYOUT.machines.silos)
    for (const lights of [ZONE_LIGHT_POSITIONS, REDUCED_ZONE_LIGHT_POSITIONS]) {
      expect(floorIrradiance(lights, z, x)).toBe(0);
      for (const light of lights)
        expect(Math.hypot(x - 6 - light[0], z - light[2])).toBeGreaterThan(ZONE_LIGHT_DISTANCE);
    }
});

describe('floor pools', () => {
  it('covers every ceiling fixture, including the dimmer outer rows', () => {
    const positions = floorPoolPositions();
    expect(positions).toHaveLength(FIXTURE_GRID_X.length * FIXTURE_GRID_Z.length);
    expect(positions).toHaveLength(15);

    // Real point lights cover more of the hall width now. Every outer fixture
    // still has its pool, including the rear row outside the main light banks.
    const outer = positions.filter(([x]) => Math.abs(x) === Math.max(...FIXTURE_GRID_X));
    expect(outer.length).toBeGreaterThan(0);
    for (const lights of [ZONE_LIGHT_POSITIONS, REDUCED_ZONE_LIGHT_POSITIONS]) {
      for (const [x, z] of outer) {
        const nearest = Math.min(
          ...lights.map((light) => Math.hypot(x - light[0], ZONE_LIGHT_HEIGHT, z - light[2]))
        );
        const atOuter = pointLightIrradiance(ZONE_LIGHT_INTENSITY, nearest, ZONE_LIGHT_DISTANCE);
        const beneathFixture = pointLightIrradiance(
          ZONE_LIGHT_INTENSITY,
          ZONE_LIGHT_HEIGHT,
          ZONE_LIGHT_DISTANCE
        );
        expect(atOuter).toBeLessThan(beneathFixture);
      }
    }
  });

  it('keeps every pool inside the building footprint', () => {
    const bounds = SITE_LAYOUT.factory.bounds;
    for (const [x, z] of floorPoolPositions()) {
      expect(x).toBeGreaterThan(bounds.minX);
      expect(x).toBeLessThan(bounds.maxX);
      expect(z).toBeGreaterThan(bounds.minZ);
      expect(z).toBeLessThan(bounds.maxZ);
    }
  });
});

describe('createLightPoolTexture', () => {
  it('falls off to nothing at the edge so the quad has no visible border', () => {
    const texture = createLightPoolTexture();
    const width = texture.image.width;
    const height = texture.image.height;
    const data = texture.image.data as Uint8Array;
    const alphaAt = (x: number, y: number): number => data[(y * width + x) * 4 + 3];

    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(width - 1, height - 1)).toBe(0);
    expect(alphaAt(width >> 1, height >> 1)).toBeGreaterThan(200);
    texture.dispose();
  });

  it('reaches further along the fixture than across it', () => {
    const texture = createLightPoolTexture();
    const width = texture.image.width;
    const height = texture.image.height;
    const data = texture.image.data as Uint8Array;
    const alphaAt = (x: number, y: number): number => data[(y * width + x) * 4 + 3];

    // Same fractional distance from centre: 30% along U versus 30% along V.
    const along = alphaAt(Math.round(width * 0.8), height >> 1);
    const across = alphaAt(width >> 1, Math.round(height * 0.8));
    expect(along).toBeGreaterThan(across);
    texture.dispose();
  });

  it('is an opaque white tint carrying its shape in alpha, for additive blending', () => {
    const texture = createLightPoolTexture();
    const data = texture.image.data as Uint8Array;
    for (let index = 0; index < data.length; index += 4) {
      expect(data[index]).toBe(255);
      expect(data[index + 1]).toBe(255);
      expect(data[index + 2]).toBe(255);
    }
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(texture.generateMipmaps).toBe(false);
    texture.dispose();
  });
});
