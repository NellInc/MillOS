import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import {
  VILLAGE_HOME_PLOTS,
  VILLAGE_HOMES,
  VILLAGE_GARDEN_FOOTPRINTS,
  VILLAGE_ALLOTMENT,
  VILLAGE_ALLOTMENT_GEOMETRY,
  VILLAGE_PLOT_MATERIAL,
  TOWN_HALL_HEDGE_GEOMETRY,
} from './VillageGardens';
import {
  VILLAGE_BUILDING_FOOTPRINTS,
  VILLAGE_PAVED_AREAS,
  VILLAGE_STREET_CORRIDORS,
} from '../VillageArea';
import { SITE_LAYOUT, landmarkLocalToWorld } from '../../constants/siteLayout';
import { COTTAGE_GARDENS, landscapeGrassSpec } from '../exterior/LandscapeDressing';
vi.mock('../../utils/critterAudio', () => ({ playCritterSound: vi.fn() }));
const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const mesh = (geometry: THREE.BufferGeometry) => new THREE.Mesh(geometry, material);
const hit = (
  geometry: THREE.BufferGeometry,
  origin: [number, number, number],
  direction: [number, number, number],
  far = 20
) =>
  new THREE.Raycaster(
    new THREE.Vector3(...origin),
    new THREE.Vector3(...direction),
    0,
    far
  ).intersectObject(mesh(geometry));

describe('authored British/Dutch village plots', () => {
  it('keeps each real home pane in standalone UV space with the expected upward V axis', () => {
    for (const { glass } of VILLAGE_HOMES) {
      const uv = glass.getAttribute('uv'),
        position = glass.getAttribute('position');
      const normal = glass.getAttribute('normal');
      expect(uv.count).toBe(position.count);
      let top = 0,
        bottom = 0,
        topCount = 0,
        bottomCount = 0;
      for (let i = 0; i < uv.count; i++) {
        expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
        expect(uv.getX(i)).toBeLessThanOrEqual(1);
        expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
        expect(uv.getY(i)).toBeLessThanOrEqual(1);
        if (normal.getZ(i) > 0.99) {
          if (uv.getY(i) === 1) {
            top += position.getY(i);
            topCount++;
          }
          if (uv.getY(i) === 0) {
            bottom += position.getY(i);
            bottomCount++;
          }
        }
      }
      expect(topCount).toBeGreaterThan(0);
      expect(bottomCount).toBeGreaterThan(0);
      expect(top / topCount).toBeGreaterThan(bottom / bottomCount);
    }
  });

  it('replaces five repeated bodies with distinct real silhouettes and palettes inside the home footprints', () => {
    expect(VILLAGE_HOMES).toHaveLength(5);
    const signatures = VILLAGE_HOMES.map(({ body }) => {
      const box = body.boundingBox!;
      expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
      expect(
        Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z))
      ).toBeLessThan(3.5);
      return createHash('sha256')
        .update(Buffer.from(body.getAttribute('position').array.buffer))
        .update(Buffer.from(body.getAttribute('color').array.buffer))
        .digest('hex');
    });
    expect(new Set(signatures).size).toBe(5);
    expect(new Set(VILLAGE_HOMES.map((h) => h.body.boundingBox!.max.y.toFixed(2))).size).toBe(5);
  });

  it('keeps every opaque surface batched, finite, correctly coloured and inside a 40k-triangle whole-village detail budget', () => {
    const geometries = [
      ...VILLAGE_HOMES.flatMap((h) => [h.body, h.glass, h.garden]),
      VILLAGE_ALLOTMENT_GEOMETRY,
    ];
    let vertices = 0;
    for (const g of geometries) {
      expect(g.groups).toHaveLength(0);
      const p = g.getAttribute('position'),
        c = g.getAttribute('color');
      vertices += p.count;
      expect([...p.array].every(Number.isFinite)).toBe(true);
      expect(c.count).toBe(p.count);
      expect([...c.array].every((x) => Number.isFinite(x) && x >= 0 && x <= 1)).toBe(true);
      const n = g.getAttribute('normal');
      let maximumNormalError = 0;
      for (let i = 0; i < n.count; i++)
        maximumNormalError = Math.max(
          maximumNormalError,
          Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1)
        );
      expect(maximumNormalError).toBeLessThan(0.00005);
    }
    expect(vertices / 3).toBeLessThan(40000);
    expect(VILLAGE_PLOT_MATERIAL.vertexColors).toBe(true);
    expect(VILLAGE_PLOT_MATERIAL.emissive.getHex()).toBe(0);
    expect(VILLAGE_PLOT_MATERIAL.map).toBeNull();
  });

  it('leaves every gate and door approach physically clear across a 1.64 m walking lane', () => {
    for (const { garden } of VILLAGE_HOMES) {
      for (const x of [-0.82, 0, 0.82])
        for (const y of [0.25, 0.85, 1.65]) {
          expect(hit(garden, [x, y, 7.65], [0, 0, -1], 4.9)).toHaveLength(0);
        }
    }
    for (const x of [-0.82, 0, 0.82])
      expect(hit(VILLAGE_ALLOTMENT_GEOMETRY, [x, 0.6, 6.8], [0, 0, -1], 9.7)).toHaveLength(0);
  });

  it('grounds both side facades and the rear seat with low tended surfaces inside each plot', () => {
    VILLAGE_HOMES.forEach(({ body, garden }) => {
      for (const side of [-1, 1]) {
        const wall = hit(body, [0, 0.4, -0.45], [side, 0, 0])[0].point.x;
        const x = wall + side * 0.48;
        // Read the built geometry, including the gravel between clumps.
        const ground = hit(garden, [x, 0.1, 1.2], [0, -1, 0], 0.2);
        expect(ground.length).toBeGreaterThan(0);
        expect(ground[0].point.y).toBeCloseTo(0.025, 5);
        const foliage = hit(garden, [x, 0.8, -1.25], [0, 0, 1], 2);
        expect(foliage).toHaveLength(0);
        const clump = hit(garden, [x, 0.3, -2], [0, 0, 1], 3.6);
        expect(clump.length).toBeGreaterThan(0);
      }
      const seatPad = hit(garden, [-3.7, 0.2, -1.8], [0, -1, 0], 0.3);
      expect(seatPad[0].point.y).toBeCloseTo(0.025, 5);
    });
  });

  it('retains closed roofs and seats each smoke source at its actual chimney pots', () => {
    for (const { body, chimney } of VILLAGE_HOMES) {
      const roof = hit(body, [-0.7, 9, 0], [0, -1, 0]);
      expect(roof.length).toBeGreaterThan(1);
      expect(roof[0].point.y).toBeGreaterThan(4);
      const pot = hit(body, [chimney[0], chimney[1] + 0.3, chimney[2] + 0.2], [0, -1, 0]);
      expect(pot[0].distance).toBeLessThan(0.36);
      expect(pot[0].distance).toBeGreaterThan(0.3);
    }
  });

  it('keeps real plot extents inside the existing hedges and clear of through streets and neighbouring buildings', () => {
    expect(VILLAGE_HOME_PLOTS.map((p) => [p.position[0], p.position[2]])).toEqual(COTTAGE_GARDENS);
    VILLAGE_HOMES.forEach(({ garden }, index) => {
      const plot = VILLAGE_HOME_PLOTS[index],
        envelope = VILLAGE_GARDEN_FOOTPRINTS[index];
      const bounds = garden
        .boundingBox!.clone()
        .applyMatrix4(
          new THREE.Matrix4().makeRotationY(plot.rotation).setPosition(...plot.position)
        );
      expect(bounds.min.x).toBeGreaterThanOrEqual(envelope.x - envelope.halfX);
      expect(bounds.max.x).toBeLessThanOrEqual(envelope.x + envelope.halfX);
      expect(bounds.min.z).toBeGreaterThanOrEqual(envelope.z - envelope.halfZ);
      expect(bounds.max.z).toBeLessThanOrEqual(envelope.z + envelope.halfZ);
    });
    for (const plot of [...VILLAGE_GARDEN_FOOTPRINTS, VILLAGE_ALLOTMENT]) {
      for (const road of VILLAGE_STREET_CORRIDORS)
        expect(
          Math.max(
            Math.abs(plot.x - road.x) - plot.halfX - road.halfX,
            Math.abs(plot.z - road.z) - plot.halfZ - road.halfZ
          )
        ).toBeGreaterThan(0.5);
      for (const building of VILLAGE_BUILDING_FOOTPRINTS) {
        if (Math.abs(plot.x - building.x) < 2 && plot.z === building.z) continue;
        expect(
          Math.max(
            Math.abs(plot.x - building.x) - plot.halfX - building.halfX,
            Math.abs(plot.z - building.z) - plot.halfZ - building.halfZ
          )
        ).toBeGreaterThan(0.5);
      }
    }
  });

  it('excludes meadow tufts from the actual tended plots and coping on both terrain tiers', () => {
    for (const tier of [64, 128]) {
      const accepts = landscapeGrassSpec(tier, 1).accepts!;
      for (const plot of [...VILLAGE_GARDEN_FOOTPRINTS, VILLAGE_ALLOTMENT]) {
        for (const dx of [-plot.halfX, 0, plot.halfX])
          for (const dz of [-plot.halfZ, 0, plot.halfZ]) {
            const [x, , z] = landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, [
              plot.x + dx,
              0,
              plot.z + dz,
            ]);
            expect(accepts(x, z)).toBe(false);
          }
      }
    }
  });

  it('connects the allotment gate to the existing square without covering the beds in cobble', () => {
    const gate = { x: VILLAGE_ALLOTMENT.x + 6.5, z: VILLAGE_ALLOTMENT.z };
    expect(
      VILLAGE_PAVED_AREAS.some(
        (a) => Math.abs(gate.x - a.x) < a.halfX && Math.abs(gate.z - a.z) < a.halfZ
      )
    ).toBe(true);
    for (const dz of [-2.9, 2.9])
      expect(
        VILLAGE_PAVED_AREAS.some(
          (a) => Math.abs(-25 - a.x) < a.halfX && Math.abs(9 + dz - a.z) < a.halfZ
        )
      ).toBe(false);
  });
});

it('grounds the civic privet while leaving both real stair approaches clear', () => {
  const hedge = mesh(TOWN_HALL_HEDGE_GEOMETRY);
  TOWN_HALL_HEDGE_GEOMETRY.computeBoundingBox();
  const box = TOWN_HALL_HEDGE_GEOMETRY.boundingBox!;
  expect(box.min.y).toBeLessThan(0.04);
  expect(box.max.y).toBeLessThan(1.25);
  for (const z of [-8.2, 8.2]) {
    for (const x of [-3.1, 0, 3.1]) {
      expect(
        new THREE.Raycaster(
          new THREE.Vector3(x, 2, z),
          new THREE.Vector3(0, -1, 0)
        ).intersectObject(hedge)
      ).toHaveLength(0);
    }
    for (const x of [-5.3, 5.3])
      expect(
        new THREE.Raycaster(
          new THREE.Vector3(x, 2, z),
          new THREE.Vector3(0, -1, 0)
        ).intersectObject(hedge).length
      ).toBeGreaterThan(0);
  }
});
