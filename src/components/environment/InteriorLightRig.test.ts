import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  FIXTURE_GRID_X,
  FIXTURE_GRID_Z,
  REDUCED_ZONE_LIGHT_POSITIONS,
  ZONE_LIGHT_DISTANCE,
  ZONE_LIGHT_DECAY,
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
import { bankLineIrradiance } from '../../shaders/interiorLighting';

/** Three's point-light distance window, kept for the reference arm and pools. */
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

/** What the shipped shader gives a surface: every bank is a row of fittings. */
function direct(
  lights: readonly (readonly [number, number, number])[],
  point: THREE.Vector3,
  normal: THREE.Vector3,
  intensity = ZONE_LIGHT_INTENSITY
): number {
  return lights.reduce(
    (sum, light) =>
      sum +
      bankLineIrradiance(
        new THREE.Vector3(...light),
        intensity,
        point,
        normal,
        ZONE_LIGHT_DISTANCE
      ),
    0
  );
}

const UP = new THREE.Vector3(0, 1, 0);

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

  it('places one source under each working row of real fittings and no more', () => {
    // three's forward renderer puts every point light in every lit material's
    // uniform block with no per-object culling, so each one is fragment cost on
    // the exterior cameras too, where they contribute nothing.
    expect(ZONE_LIGHT_POSITIONS).toHaveLength(2);
    expect(ZONE_LIGHT_HEIGHT).toBeLessThan(SITE_LAYOUT.factory.bounds.maxY - 3.8);
    for (const position of ZONE_LIGHT_POSITIONS) {
      // The row centre: the shader spans the line across the whole fixture grid.
      expect(position[0]).toBe((FIXTURE_GRID_X[0] + FIXTURE_GRID_X[FIXTURE_GRID_X.length - 1]) / 2);
      expect(FIXTURE_GRID_Z).toContain(position[2]);
      expect(position[1]).toBe(ZONE_LIGHT_HEIGHT);
    }
    // decay 0 is the marker the line shader keys on; the reference arm is not.
    expect(ZONE_LIGHT_DECAY).toBe(0);
  });

  it('lights the real milling duty fronts and all four sloping control faces', () => {
    const people = COMMUNITY_ROSTER.filter((person) =>
      ['mill-operator-west', 'mill-operator-east', 'mill-engineer'].includes(person.id)
    );
    expect(people).toHaveLength(3);
    const faceNormal = new THREE.Vector3(0, 0, 1);
    for (const person of people) {
      const duty = person.stops[0];
      faceNormal.set(Math.sin(duty.rotation), 0, Math.cos(duty.rotation));
      const face = new THREE.Vector3(...duty.position).add(new THREE.Vector3(0, 1.6, 0));
      // The old z38 row was behind every forward-facing duty station.
      expect(direct(ZONE_LIGHT_POSITIONS, face, faceNormal), person.id).toBeGreaterThan(0.02);
    }
    for (const mill of SITE_LAYOUT.machines.rollerMills) {
      const panel = new THREE.Vector3(...mill.position).add(
        new THREE.Vector3(...MILL_CONTROL_FACE.position)
      );
      const panelNormal = new THREE.Vector3(0, 0, 1).applyAxisAngle(
        new THREE.Vector3(1, 0, 0),
        MILL_CONTROL_FACE.rotationX
      );
      expect(direct(ZONE_LIGHT_POSITIONS, panel, panelNormal), mill.id).toBeGreaterThan(0.05);
    }
    expect(FIXTURE_GRID_Z[2]).toBe(SITE_LAYOUT.factory.zones.milling);
  });

  it('lights the actual maintenance-route briefing and packing duty fronts', () => {
    const at = (point: THREE.Vector3, rotation: number) =>
      direct(
        zoneLightPositions('medium'),
        point,
        new THREE.Vector3(Math.sin(rotation), 0, Math.cos(rotation)),
        zoneWorkLightIntensity(1)
      );
    // Actual retained CE night view, ordinary safe-route root and heading.
    expect(at(new THREE.Vector3(-32.25, 1.6, 29.255603277777357), Math.PI)).toBeGreaterThan(0.06);
    for (const id of ['mill-packer', 'mill-quality']) {
      const duty = COMMUNITY_ROSTER.find((person) => person.id === id)!.stops[0];
      expect(
        at(new THREE.Vector3(...duty.position).add(new THREE.Vector3(0, 1.6, 0)), duty.rotation),
        id
      ).toBeGreaterThan(0.3);
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
    const normals = [
      UP,
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
    ];
    let peak = { irradiance: 0, family: '', point: [] as number[] };
    for (const route of routes) {
      for (const point of route.curve.getSpacedPoints(400)) {
        for (const normal of normals) {
          // The pipe surface nearest the row, one radius out from its axis.
          const surface = point.clone().addScaledVector(normal, SPOUT_PIPE_RADIUS);
          const irradiance = direct(ZONE_LIGHT_POSITIONS, surface, normal);
          if (irradiance > peak.irradiance)
            peak = { irradiance, family: route.family, point: point.toArray() };
        }
      }
    }
    expect(peak.irradiance, JSON.stringify(peak)).toBeLessThan(sun * 2);
  });

  it('lands a readable pool on the floor without a hotspot', () => {
    const [x, , z] = ZONE_LIGHT_POSITIONS[0];
    const irradiance = direct(
      ZONE_LIGHT_POSITIONS,
      new THREE.Vector3(x, SITE_LAYOUT.datum.interiorFloor, z),
      UP
    );
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
    const light = new THREE.Vector3(...ZONE_LIGHT_POSITIONS[0]);
    // Below the row, facing it, at and just inside the perpendicular cutoff.
    const facing = (offset: number) =>
      bankLineIrradiance(
        light,
        ZONE_LIGHT_INTENSITY,
        new THREE.Vector3(light.x, light.y - offset, light.z),
        UP,
        ZONE_LIGHT_DISTANCE
      );
    expect(facing(ZONE_LIGHT_DISTANCE)).toBe(0);
    const nearCutoff = facing(ZONE_LIGHT_DISTANCE * 0.95);
    expect(nearCutoff).toBeGreaterThan(0);
    expect(nearCutoff).toBeLessThan(0.05);
  });
});

/** Floor irradiance at a world point from the shipped rows. */
function floorIrradiance(z: number, x = 0): number {
  return direct(ZONE_LIGHT_POSITIONS, new THREE.Vector3(x, 0, z), UP);
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

  it('draws the same two rows on every tier', () => {
    // A row is already a line of fittings, so High needs no extra sources; a
    // count that moved with the tier would also move `NUM_POINT_LIGHTS`.
    for (const quality of ['low', 'medium', 'high', 'ultra'] as const) {
      expect(zoneLightPositions(quality)).toBe(ZONE_LIGHT_POSITIONS);
    }
    expect(REDUCED_ZONE_LIGHT_POSITIONS).toBe(ZONE_LIGHT_POSITIONS);
  });

  it('keeps the illumination reference exact and the same source counts on every tier', () => {
    for (const quality of ['low', 'medium', 'high', 'ultra'] as const) {
      const reference = zoneLightPositions(quality, true);
      expect(reference).toHaveLength(zoneLightPositions(quality).length);
      expect([...new Set(reference.map((position) => position[2]))]).toEqual([-8, 30]);
      expect(zoneWorkLightIntensity(1, quality, true)).toBe(380);
      expect(zoneWorkLightIntensity(0, quality, true)).toBeCloseTo(627);
      expect(zoneWorkLightIntensity(1, quality)).toBeCloseTo(ZONE_LIGHT_INTENSITY);
    }
  });

  it('retains the old under-fixture radiance with broad rows', () => {
    const old = pointLightIrradiance(380, ZONE_LIGHT_HEIGHT, 44, 2);
    const [, , z] = ZONE_LIGHT_POSITIONS[0];
    expect(
      bankLineIrradiance(
        new THREE.Vector3(...ZONE_LIGHT_POSITIONS[0]),
        ZONE_LIGHT_INTENSITY,
        new THREE.Vector3(0, 0, z),
        UP,
        ZONE_LIGHT_DISTANCE
      )
    ).toBeCloseTo(old, 10);
  });

  it('keeps every working zone well clear of the ambient term', () => {
    const { milling, sifting, packing } = SITE_LAYOUT.factory.zones;
    const ambient = sampleCelestial(sampleAtmosphere(0, 12, 'clear')).ambientLightIntensity;
    const midpoint = (ZONE_LIGHT_POSITIONS[0][2] + ZONE_LIGHT_POSITIONS[1][2]) / 2;
    for (const z of [milling, sifting, packing, midpoint]) {
      expect(floorIrradiance(z)).toBeGreaterThan(ambient * 2);
      // The row now reaches the west and east workfronts as well.
      expect(floorIrradiance(z, -30)).toBeGreaterThan(floorIrradiance(z) * 0.4);
      expect(floorIrradiance(z, 30)).toBeGreaterThan(floorIrradiance(z) * 0.4);
    }
  });
});

it('keeps every near silo wall outside the indoor rows', () => {
  for (const {
    position: [x, , z],
  } of SITE_LAYOUT.machines.silos) {
    expect(floorIrradiance(z, x)).toBe(0);
    for (let y = 0; y <= 32; y += 4) {
      expect(
        direct(ZONE_LIGHT_POSITIONS, new THREE.Vector3(x - 6, y, z), new THREE.Vector3(-1, 0, 0))
      ).toBe(0);
    }
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
