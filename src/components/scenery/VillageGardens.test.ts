import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  addVillageFlower,
  addVillageShutter,
  addAllotmentCabbage,
  addAllotmentLeafCrop,
  addAllotmentBeanLeaves,
  addAllotmentClimber,
  addVillageClay,
  addVillageFoliage,
  addCivicPrivet,
  removeEnclosedVillageFaces,
  CIVIC_PRIVET_TEXTURE_URL,
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
import { PlotGeometry } from '../../utils/authoredPlotGeometry';
import { WORLD_CRAFT_PALETTE } from '../../constants/publicRealmLayout';
import { ALLOTMENT_TILES } from './allotmentSurface';
import {
  HOME_ENTRY_SCALE,
  HOME_ENTRY_SOURCE,
  CIVIC_ENTRY_LANTERN_GEOMETRY,
} from './VillageSignage';
import { readFileSync } from 'node:fs';
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

it('reclaims strictly enclosed opaque faces with exact retained attributes and conservative solids', () => {
  const plot = new PlotGeometry();
  plot.add(new THREE.BoxGeometry(2, 2, 2), '#ffffff');
  plot.add(new THREE.BoxGeometry(0.5, 0.5, 0.5), '#808080');
  plot.add(new THREE.BoxGeometry(1, 1, 1).translate(1.2, 0, 0), '#808080');
  const original = plot.parts.map((g) => ({
    attributes: Object.fromEntries(Object.entries(g.attributes).map(([k, v]) => [k, [...v.array]])),
    indices: [...g.index!.array],
  }));
  expect(removeEnclosedVillageFaces(plot)).toBe(14);
  expect(plot.parts[0].index!.count).toBe(36);
  expect(plot.parts[1].index!.count).toBe(0);
  expect(plot.parts[2].index!.count).toBe(30);
  plot.parts.forEach((g, i) => {
    for (const [key, values] of Object.entries(original[i].attributes))
      expect([...g.attributes[key].array]).toEqual(values);
    const ids = new Set(original[i].indices);
    expect([...g.index!.array].every((id) => ids.has(id))).toBe(true);
  });
  for (const occluder of [
    new THREE.BoxGeometry(2, 0.2, 0.2).rotateY(Math.PI / 4),
    new THREE.SphereGeometry(2, 8, 4),
    new THREE.BoxGeometry(0.05, 0.05, 0.05).translate(0.65, 0, 0.65),
  ]) {
    const conservative = new PlotGeometry();
    conservative.add(occluder, '#ffffff');
    conservative.add(new THREE.BoxGeometry(0.05, 0.05, 0.05).translate(0.65, 0, 0.65), '#ffffff');
    expect(removeEnclosedVillageFaces(conservative)).toBe(0);
    conservative.parts.forEach((g) => g.dispose());
  }
  plot.parts.forEach((g) => g.dispose());
});

describe('authored British/Dutch village plots', () => {
  it('seats all compact porch fittings on real walls with clear downward source rays', () => {
    for (const { body, entry, glass } of VILLAGE_HOMES) {
      const wall = hit(
        body,
        [entry[0], entry[1] + 0.07 * HOME_ENTRY_SCALE[1], entry[2] + 1],
        [0, 0, -1]
      )[0];
      expect(wall).toBeDefined();
      const plateBack = entry[2] - 0.0175 * HOME_ENTRY_SCALE[2];
      expect(plateBack - wall.point.z).toBeCloseTo(-0.001, 5);
      const fixture = CIVIC_ENTRY_LANTERN_GEOMETRY.clone()
        .scale(...HOME_ENTRY_SCALE)
        .translate(...entry);
      fixture.computeBoundingBox();
      expect(fixture.boundingBox!.min.x).toBeGreaterThan(-0.073);
      expect(fixture.boundingBox!.max.x).toBeLessThan(0.073);
      expect(fixture.boundingBox!.min.y).toBeGreaterThan(2.48);
      expect(fixture.boundingBox!.max.y).toBeLessThan(2.79);
      const fixtureTriangles = CIVIC_ENTRY_LANTERN_GEOMETRY.getIndex()!.count / 3 + 12;
      expect(fixtureTriangles * VILLAGE_HOMES.length).toBeLessThanOrEqual(600);
      expect(hit(glass, [entry[0], entry[1], entry[2] + 1], [0, 0, -1], 1.2)).toHaveLength(0);
      const source = entry.map((v, axis) => v + HOME_ENTRY_SOURCE[axis]) as [
        number,
        number,
        number,
      ];
      expect(hit(body, source, [0, -1, 0], source[1] - 0.1)).toHaveLength(0);
      expect(hit(fixture, source, [0, -1, 0], 0.4)).toHaveLength(0);
      fixture.dispose();
    }
    const source = readFileSync('src/components/scenery/VillageSignage.tsx', 'utf8');
    const fitting = source.slice(source.indexOf('export function VillageHomeEntryLighting'));
    expect(fitting).toContain("s.graphics.quality !== 'low'");
    expect(fitting).toContain('intensity={16}');
    expect(fitting).toContain('distance={3.6}');
    expect(fitting).toContain('EXTERIOR_LAMP_LENS_MATERIAL');
    expect(fitting).not.toContain('useFrame');
  });

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

  it('gives the slate cottage a glazed side dormer and keeps both entrance hoods above head height', () => {
    const cottage = VILLAGE_HOMES[4];
    const pane = hit(cottage.glass, [3.4, 4.4, 0.7], [-1, 0, 0]);
    expect(pane[0]?.point.x).toBeGreaterThan(2);
    const dormerRoof = hit(cottage.body, [1.65, 8, 0.7], [0, -1, 0]);
    expect(dormerRoof[0]?.point.y).toBeGreaterThan(5.2);
    for (const [index, front] of [
      [0, 2.2],
      [2, 2.1],
    ]) {
      const hood = hit(VILLAGE_HOMES[index].body, [0, 8, front + 0.7], [0, -1, 0]);
      expect(hood[0]?.point.y).toBeGreaterThan(2.6);
      expect(hit(VILLAGE_HOMES[index].body, [0, 2.1, front + 1], [0, 0, -1], 0.7)).toHaveLength(0);
    }
  });

  it('retains closed roofs and seats each smoke source at its actual chimney pots', () => {
    for (const { body, chimney } of VILLAGE_HOMES) {
      const roof = hit(body, [-0.7, 9, 0], [0, -1, 0]);
      expect(roof.length).toBeGreaterThan(1);
      expect(roof[0].point.y).toBeGreaterThan(4);
      // Measure the retained rim datum; the centre is now the actual open throat.
      const pot = hit(body, [chimney[0] + 0.105, chimney[1] + 0.3, chimney[2] + 0.2], [0, -1, 0]);
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
  expect(TOWN_HALL_HEDGE_GEOMETRY.getAttribute('position').count / 3).toBeLessThan(14152);
  const positions = TOWN_HALL_HEDGE_GEOMETRY.getAttribute('position');
  for (let triangle = 0; triangle < positions.count; triangle += 3) {
    const xs = [0, 1, 2].map((k) => positions.getX(triangle + k));
    const zs = [0, 1, 2].map((k) => positions.getZ(triangle + k));
    for (const end of [-1, 1]) {
      const near = Math.min(...zs.map((z) => z * end)),
        far = Math.max(...zs.map((z) => z * end));
      expect(Math.min(...xs) < 3.6 && Math.max(...xs) > -3.6 && near < 9.5 && far > 6.8).toBe(
        false
      );
    }
  }
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

it('builds closed outward privet components with rooted relief and continuous clipped cores', () => {
  for (const [x, z, length, side] of [
    [-8, 0, 12, true],
    [8, 0, 12, true],
    [-5.9, -8.2, 3.4, false],
    [-5.9, 8.2, 3.4, false],
    [5.9, -8.2, 3.4, false],
    [5.9, 8.2, 3.4, false],
  ] as const) {
    const plot = new PlotGeometry();
    addCivicPrivet(plot, x, z, length, side);
    const core = plot.parts[0];
    for (const g of plot.parts) {
      const p = g.getAttribute('position'),
        n = g.getAttribute('normal'),
        index = g.getIndex() ?? { count: p.count, getX: (i: number) => i };
      g.computeBoundingBox();
      const centre = g.boundingBox!.getCenter(new THREE.Vector3());
      const edgeUses = new Map<string, number[]>();
      const keys = Array.from({ length: p.count }, (_, i) =>
        [p.getX(i), p.getY(i), p.getZ(i)].join(':')
      );
      let volume = 0;
      for (let i = 0; i < p.count; i++) {
        expect([p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite)).toBe(true);
        expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
      }
      for (let i = 0; i < index.count; i += 3) {
        const ids = [0, 1, 2].map((k) => index.getX(i + k));
        const v = ids.map((id) => new THREE.Vector3().fromBufferAttribute(p, id).sub(centre));
        expect(v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).length()).toBeGreaterThan(1e-8);
        volume += v[0].dot(v[1].clone().cross(v[2])) / 6;
        for (let k = 0; k < 3; k++) {
          const a = keys[ids[k]],
            b = keys[ids[(k + 1) % 3]],
            key = a < b ? `${a}|${b}` : `${b}|${a}`;
          const uses = edgeUses.get(key) ?? [];
          uses.push(a < b ? 1 : -1);
          edgeUses.set(key, uses);
        }
      }
      expect(volume).toBeGreaterThan(1e-10);
      for (const uses of edgeUses.values()) expect(uses).toEqual(expect.arrayContaining([-1, 1]));
      expect([...edgeUses.values()].every((uses) => uses.length === 2)).toBe(true);
      expect(g.getAttribute('uv').count).toBe(p.count);
      expect(g.getAttribute('color').count).toBe(p.count);
      if (g !== core) {
        const root = new THREE.Vector3().fromBufferAttribute(p, 0);
        const direction = new THREE.Vector3(
          side ? root.x - x : 0,
          root.y - 0.48,
          side ? 0 : root.z - z
        ).normalize();
        const exit = new THREE.Raycaster(root, direction, 0, 0.08).intersectObject(mesh(core))[0];
        expect(exit, 'Every leaf base must penetrate its actual core').toBeDefined();
        expect(exit.distance).toBeGreaterThan(0);
      }
    }
    for (let along = -length / 2; along <= length / 2; along += 0.17) {
      expect(
        hit(
          core,
          side ? [x + 2, 0.5, z + along] : [x + along, 0.5, z - 2],
          side ? [-1, 0, 0] : [0, 0, 1]
        ).length
      ).toBeGreaterThan(0);
      expect(
        hit(core, side ? [x, 2, z + along] : [x + along, 2, z], [0, -1, 0]).length
      ).toBeGreaterThan(0);
    }
    plot.parts.forEach((g) => g.dispose());
  }
});

it('contains every clipped run within its original crown envelope with deterministic detail', () => {
  for (const [x, z, length, side] of [
    [-8, 0, 12, true],
    [8, 0, 12, true],
    [-5.9, -8.2, 3.4, false],
    [-5.9, 8.2, 3.4, false],
    [5.9, -8.2, 3.4, false],
    [5.9, 8.2, 3.4, false],
  ] as const) {
    const a = new PlotGeometry(),
      b = new PlotGeometry();
    addCivicPrivet(a, x, z, length, side);
    addCivicPrivet(b, x, z, length, side);
    const first = a.finish(),
      repeat = b.finish(),
      box = first.boundingBox!;
    expect(first.getAttribute('position').array).toEqual(repeat.getAttribute('position').array);
    expect(first.getAttribute('color').array).toEqual(repeat.getAttribute('color').array);
    expect(box.min.x).toBeGreaterThanOrEqual(x - (side ? 0.52 : length / 2 + 0.52));
    expect(box.max.x).toBeLessThanOrEqual(x + (side ? 0.52 : length / 2 + 0.52));
    expect(box.min.z).toBeGreaterThanOrEqual(z - (side ? length / 2 + 0.52 : 0.52));
    expect(box.max.z).toBeLessThanOrEqual(z + (side ? length / 2 + 0.52 : 0.52));
    expect(box.min.y).toBeCloseTo(0.025, 6);
    expect(box.max.y).toBeLessThan(1.1);
    first.dispose();
    repeat.dispose();
  }
});

it('pins actual civic hedge positions in the matched lamp bake', () => {
  const a = TOWN_HALL_HEDGE_GEOMETRY.getAttribute('position').array;
  const bake = JSON.parse(readFileSync('public/textures/civic-square-lamp-depth.json', 'utf8'));
  expect(bake.casterPins?.townHallHedgePositions).toBe(
    createHash('sha256')
      .update(Buffer.from(a.buffer, a.byteOffset, a.byteLength))
      .digest('hex')
  );
});

it('versions the leaf raster and preserves neutral soil albedo through its known texel', async () => {
  const png = readFileSync('public/textures/civic-privet-leaves.png');
  expect(CIVIC_PRIVET_TEXTURE_URL).toContain(createHash('sha256').update(png).digest('hex'));
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  expect([info.width, info.height, info.channels]).toEqual([512, 512, 4]);
  expect(data.every((value, i) => i % 4 !== 3 || value === 255)).toBe(true);
  expect([...data.subarray((128 * 512 + 128) * 4, (128 * 512 + 128) * 4 + 3)]).toEqual([
    128, 154, 89,
  ]);
  const uv = TOWN_HALL_HEDGE_GEOMETRY.getAttribute('uv'),
    colours = TOWN_HALL_HEDGE_GEOMETRY.getAttribute('color');
  const texel = new THREE.Color('#809a59'),
    soil = new THREE.Color(WORLD_CRAFT_PALETTE.soil);
  let soilVertices = 0;
  for (let i = 0; i < uv.count; i++) {
    if (uv.getX(i) !== 0.25 || uv.getY(i) !== 0.75) continue;
    soilVertices++;
    expect(colours.getX(i) * texel.r).toBeCloseTo(soil.r, 6);
    expect(colours.getY(i) * texel.g).toBeCloseTo(soil.g, 6);
    expect(colours.getZ(i) * texel.b).toBeCloseTo(soil.b, 6);
  }
  expect(soilVertices).toBe(6 * 36);
});

it('builds closed stemmed five-petal blooms with repeatable, location-specific height and lean', () => {
  const bloom = (x: number) => {
    const b = new PlotGeometry();
    addVillageFlower(b, x, 0.5, 0.2, '#d586ab', 0.12);
    expect(b.parts).toHaveLength(9); // stem, two leaves, five petals, centre
    const g = b.finish();
    expect([...g.getAttribute('position').array].every(Number.isFinite)).toBe(true);
    expect(g.getAttribute('position').count / 3).toBe(60);
    expect(g.boundingBox!.min.y).toBeGreaterThanOrEqual(0.49);
    expect(g.boundingBox!.max.y).toBeLessThan(0.9);
    return g;
  };
  const first = bloom(0),
    repeated = bloom(0),
    neighbour = bloom(0.19);
  expect(first.getAttribute('position').array).toEqual(repeated.getAttribute('position').array);
  expect(first.boundingBox!.max.y).not.toBe(neighbour.boundingBox!.max.y);
  [first, repeated, neighbour].forEach((g) => g.dispose());
});

it('gives both smoke-aligned pots on every live home a recessed throat and front-facing inner walls', () => {
  const front = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
  try {
    for (const { body, chimney } of VILLAGE_HOMES) {
      const building = new THREE.Mesh(body, front);
      for (const offset of [-0.2, 0.2]) {
        const centre = new THREE.Vector3(chimney[0], chimney[1] - 0.12, chimney[2] + offset);
        const floor = new THREE.Raycaster(
          centre.clone().setY(chimney[1] + 0.1),
          new THREE.Vector3(0, -1, 0)
        ).intersectObject(building)[0];
        expect(floor).toBeDefined();
        expect(floor.point.y).toBeLessThan(chimney[1] - 0.15);
        for (const direction of [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 0, 1],
          [0, 0, -1],
        ]) {
          const wall = new THREE.Raycaster(
            centre,
            new THREE.Vector3(...direction),
            0,
            0.2
          ).intersectObject(building)[0];
          expect(wall).toBeDefined();
          // The closed casting narrows towards its bed; this samples the inward wall.
          expect(wall.distance).toBeGreaterThan(0.04);
          expect(wall.distance).toBeLessThan(0.13);
        }
      }
    }
  } finally {
    front.dispose();
  }
});

it('softens foliage normals and leaf-age tones while retaining exact civic-baked clusters', () => {
  for (const detail of [0, 1] as const) {
    const at = [3.95, 0.54, 5.55] as const,
      scale = [0.58, 0.6, 0.52] as const;
    const original = new PlotGeometry();
    original.add(
      new THREE.IcosahedronGeometry(1, detail).scale(...scale).translate(...at),
      '#607b43'
    );
    const a = new PlotGeometry(),
      b = new PlotGeometry();
    addVillageFoliage(a, at, scale, '#607b43', detail);
    addVillageFoliage(b, at, scale, '#607b43', detail);
    for (const attribute of ['position', 'uv'])
      expect(a.parts[0].getAttribute(attribute).array).toEqual(
        original.parts[0].getAttribute(attribute).array
      );
    expect(a.parts[0].index).toEqual(original.parts[0].index);
    const normals = a.parts[0].getAttribute('normal'),
      positions = a.parts[0].getAttribute('position');
    expect(normals.array).toEqual(b.parts[0].getAttribute('normal').array);
    if (detail === 0)
      expect(normals.array).not.toEqual(original.parts[0].getAttribute('normal').array);
    for (let i = 0; i < normals.count; i++) {
      const expected = new THREE.Vector3(
        (positions.getX(i) - at[0]) / (scale[0] * scale[0]),
        (positions.getY(i) - at[1]) / (scale[1] * scale[1]),
        (positions.getZ(i) - at[2]) / (scale[2] * scale[2])
      ).normalize();
      expect(new THREE.Vector3().fromBufferAttribute(normals, i).distanceTo(expected)).toBeLessThan(
        0.000002
      );
    }
    const colours = a.parts[0].getAttribute('color');
    expect(colours.array).toEqual(b.parts[0].getAttribute('color').array);
    expect(colours.array).not.toEqual(original.parts[0].getAttribute('color').array);
    const green = Array.from({ length: colours.count }, (_, i) => colours.getY(i));
    expect(Math.max(...green) - Math.min(...green)).toBeGreaterThan(0.02);
    expect([...colours.array].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
    for (const plot of [original, a, b]) for (const geometry of plot.parts) geometry.dispose();
  }
});

it('pins current shutters, recessed pots and unchanged glazing to the exact civic rebake', () => {
  const expected = [
    [
      'cfce6fd22b6eb0248051372e02a1f36610a96bb82d10a0d7e309f217685bc115',
      '38f6da3556680fd820739e004e9674fae9cdb0ae700272c20621704aa9fc911d',
    ],
    [
      '58878f3dbe581bc21eefe9f8176f21b6352b7abcb3d35fde50c083fc48c318f6',
      'd46b61cfe0e50a2d4039e9c7f9b2bd75def0a0955e52a758f8a95d137545d9cf',
    ],
    [
      '42dda835e1fb6db156bb81a79f2974b27e42796b03cc85f480d5325758914266',
      '2687f9f045afcbbcafb2c512c7c2d5694c2083e6cac34677dcf6d1bf016bba53',
    ],
    [
      '897093d75cdb3d3c97fc505e89826e0d77d8f1722a3db90c35702bb5b4c672ea',
      '5d39fb5a8ce415ae9608349aeea78d39c2717141e1ad87c26e586e1106af02af',
    ],
    [
      '32c990fd18097bb1d80eb7c4306ae2e14aaf7f387c8178fe686298adcf132870',
      '6455719f5952f307a0a0d7a1692d99413267045e76e00bfe6aa5dd8375379d67',
    ],
    [
      'a63ecfa88e4cf44238456736edaba66338b4553b9936780f61f98f704d092148',
      '43c5a68ddf448ae4a4c4c781d68c6472f0b2d1d6a7270b4ca212764a5d5166d6',
    ],
    [
      '58a078423f0bdd1a765ace6c7f9906875c1a658b6f2842dd18e147b22372e212',
      '70bff328c3c1f20b8238823a1089f5cd0f77e85d52c74aff685228d85b08e8e7',
    ],
    [
      '0e3b36611bb21694e2937379c8e732e2e66e39e141ab598c3c38a966b7f95464',
      'd46b61cfe0e50a2d4039e9c7f9b2bd75def0a0955e52a758f8a95d137545d9cf',
    ],
    [
      'c7f96e8bd0261bf67d06cd3a25585e0b44d6da28a54d3d9c5383f6019f453343',
      '5b1675ba6fa5d829f3317a9a2b74434118fd9744bf2b04167eb2030cc1bd0f2a',
    ],
    [
      '4589064b24e052faa99bd27e6a80486b8480f2add488caf122862cc5cca42c50',
      '2771c68c22077d2a330f8d91272cea33ca3f2341d860c7810ae27d70404391ed',
    ],
    [
      '3a3cda642438e77b89ba59ef0987d54b2a38addcd790cedeaea68540459954c7',
      '6455719f5952f307a0a0d7a1692d99413267045e76e00bfe6aa5dd8375379d67',
    ],
    [
      'e0f42fa5c157bdba273fbbb5478ae9440931bc02b66000b061384b26277026d4',
      '3fcd9f04d3411bf8a9c91bdb889de78189d9ac65ad579b63712e38325f31c545',
    ],
    [
      '5c042acb730bd16d1889d3cd0cd5d542640fdabe1edc2cba16b956db0c466a51',
      '55611897fa0e013db6c254a6489f44b5937c6acb8fcb1c9d650866ce796830e6',
    ],
    [
      '5ade559333214fe102d81f90fe82dfef11824c3545aea0765960062ff1911664',
      'fd07c976a3b0b02d8768c6fba203cf1c2f4d1eb3e350eac0a5043b7e3116ebb6',
    ],
    [
      'b9fa42f2a8140de5880fcb9b75def343402d72202a75857bd0da3ae738268612',
      '0f7b9b8f929d9c330ea450dac00d18fbc58fea041daf90337995978a0d0ff700',
    ],
    [
      'e4e6adc351b460e2bb37f89e0b52cace9dbff25e3afcc1cf7fe019d74e409904',
      '8439007ff747331542835af32a4d7b0966ce65cf177c8534730699b8c1d31fa3',
    ],
  ];
  const actual = [
    ...VILLAGE_HOMES.flatMap((home) => [home.body, home.glass, home.garden]),
    VILLAGE_ALLOTMENT_GEOMETRY,
  ].map((geometry) =>
    ['position', 'uv'].map((name) => {
      const data = geometry.getAttribute(name).array;
      return createHash('sha256')
        .update(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
        .digest('hex');
    })
  );
  expect(actual).toEqual(expected);
  // These casters feed the civic lamp shadow bake; moving them without a rebake stales it.
  const bake = JSON.parse(readFileSync('public/textures/civic-square-lamp-depth.json', 'utf8'));
  expect(bake.casterPins?.villageGardenPositions).toEqual(actual.map(([position]) => position));
});

it('softens petal normals and varies tone while retaining the closed sixty-triangle flower', () => {
  const plot = new PlotGeometry();
  addVillageFlower(plot, 0.19, 0.16, 0.4, '#d77589');
  for (const petal of plot.parts.slice(3, 8)) {
    const normals = petal.getAttribute('normal'),
      colours = petal.getAttribute('color');
    const tones = new Set(
      Array.from({ length: colours.count }, (_, i) => colours.getX(i).toFixed(5))
    );
    expect(tones.size).toBeGreaterThan(1);
    for (let i = 0; i < normals.count; i++)
      expect(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))).toBeCloseTo(1, 5);
  }
  const geometry = plot.finish();
  expect(geometry.getAttribute('position').count / 3).toBe(60);
  geometry.dispose();
});

it('recesses all 21 flowerpots behind annular lips, with inner walls, closed bases and soil-seated roots', () => {
  const pots: [THREE.BufferGeometry, number, number, number][] = VILLAGE_HOMES.flatMap(
    ({ garden }, index) =>
      [
        [garden, -1.2, [4.4, 4.5, 4.2, 4.6, 4.4][index] / 2 + 0.95, 0.82],
        [garden, 1.2, [4.4, 4.5, 4.2, 4.6, 4.4][index] / 2 + 0.95, 0.82],
        [garden, 3.9, -2.5, 1.15],
      ] as [THREE.BufferGeometry, number, number, number][]
  );
  for (const x of [-4.3, 4.3])
    for (const z of [3.4, 5.9]) pots.push([VILLAGE_HOMES[1].garden, x, z, 0.9]);
  for (const x of [-4.8, 4.8]) pots.push([VILLAGE_ALLOTMENT_GEOMETRY, x, 5.75, 1.05]);
  expect(pots).toHaveLength(21);
  for (const [geometry, x, z, scale] of pots) {
    const radius = 0.36 * scale,
      h = 0.51 * scale,
      soilY = h * 0.86;
    const soil = hit(geometry, [x, h + 0.001, z], [0, -1, 0], h)[0];
    expect(soil?.point.y, `recessed soil at ${x},${z}`).toBeCloseTo(soilY, 5);
    const lip = hit(geometry, [x, h + 0.1, z + radius * 0.96], [0, -1, 0], 0.2)[0];
    expect(lip?.point.y).toBeGreaterThan(h * 0.98);
    expect(lip?.point.y).toBeLessThanOrEqual(h + 0.00001);
    // Use front-facing rays here: DoubleSide would let an outside wall fake an inner throat.
    const front = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    const inner = new THREE.Raycaster(
      new THREE.Vector3(x, h * 0.94, z),
      new THREE.Vector3(0, 0, 1),
      0,
      radius
    ).intersectObject(front)[0];
    expect(inner?.point.z).toBeCloseTo(z + radius * 0.87, 5);
    expect(inner?.face?.normal.z).toBeLessThan(-0.9);
    front.material.dispose();
    expect(hit(geometry, [x, 0.08 * scale, z], [0, -1, 0], 0.1 * scale)[0]?.point.y).toBeCloseTo(
      0,
      5
    );
    const position = geometry.getAttribute('position');
    const colours = geometry.getAttribute('color');
    const clay = ['#b97859', '#ce9470'].map((c) => new THREE.Color(c));
    const bounds = new THREE.Box3();
    for (let i = 0; i < position.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(position, i);
      if (Math.hypot(point.x - x, point.z - z) > radius * 1.121) continue;
      if (clay.some((c) => Math.abs(colours.getX(i) / colours.getY(i) - c.r / c.g) < 0.00001))
        bounds.expandByPoint(point);
    }
    // The original ten-sided projecting ring and the old body-top datum bound the clay.
    expect(bounds.min.y).toBeCloseTo(0, 5);
    expect(bounds.max.y).toBeCloseTo(h, 5);
    expect(bounds.min.x).toBeCloseTo(x - radius * 1.12 * Math.sin(Math.PI * 0.4), 5);
    expect(bounds.max.x).toBeCloseTo(x + radius * 1.12 * Math.sin(Math.PI * 0.4), 5);
    expect(bounds.min.z).toBeCloseTo(z - radius * 1.12, 5);
    expect(bounds.max.z).toBeCloseTo(z + radius * 1.12, 5);
    for (let flower = 0; flower < 5; flower++) {
      const angle = (flower * Math.PI * 2) / 5;
      const root = new THREE.Vector3(
        x + Math.cos(angle) * radius * 0.55,
        soilY,
        z + Math.sin(angle) * radius * 0.55
      );
      let closest = Infinity;
      for (let i = 0; i < position.count; i++)
        closest = Math.min(
          closest,
          root.distanceTo(new THREE.Vector3().fromBufferAttribute(position, i))
        );
      expect(closest, 'stem starts on the actual soil surface').toBeLessThan(0.00001);
    }
  }
});

it('gives clay only deterministic kiln tones, retaining exact cylinder geometry and palette', () => {
  const original = new THREE.CylinderGeometry(0.36, 0.36 * 0.68, 0.51, 10).translate(2, 0.255, -4);
  const b = new PlotGeometry(),
    c = new PlotGeometry();
  addVillageClay(b, original.clone(), '#b97859', 1.3);
  addVillageClay(c, original.clone(), '#b97859', 1.3);
  const finished = b.parts[0];
  for (const attribute of ['position', 'normal', 'uv'])
    expect(finished.getAttribute(attribute).array).toEqual(original.getAttribute(attribute).array);
  expect(finished.index!.array).toEqual(original.index!.array);
  expect(finished.getAttribute('color').array).toEqual(c.parts[0].getAttribute('color').array);
  const colour = finished.getAttribute('color'),
    base = new THREE.Color('#b97859');
  const tones = [];
  for (let i = 0; i < colour.count; i++) {
    const tone = colour.getX(i) / base.r;
    tones.push(tone);
    expect(tone).toBeGreaterThan(0.86);
    expect(tone).toBeLessThan(1.07);
    expect(colour.getY(i) / base.g).toBeCloseTo(tone, 6);
    expect(colour.getZ(i) / base.b).toBeCloseTo(tone, 6);
  }
  expect(Math.max(...tones) - Math.min(...tones)).toBeGreaterThan(0.12);
  const other = new PlotGeometry();
  addVillageClay(other, original.clone(), '#b97859', 2.3);
  expect(other.parts[0].getAttribute('color').array).not.toEqual(colour.array);
  for (const geometry of [original, ...b.parts, ...c.parts, ...other.parts]) geometry.dispose();
});

it('gives allotment crops closed cupped leaves, actual roots and distinct low-cost silhouettes', () => {
  const crops = [
    [addAllotmentCabbage, 64, 0.39, 0.63],
    [addAllotmentLeafCrop, 24, 0.22, 0.69],
    [addAllotmentBeanLeaves, 24, 0.23, 0.31],
  ] as const;
  for (const [add, triangles, radius, height] of crops) {
    const plot = new PlotGeometry();
    add(plot, [0, 0.2, 0], 0.41);
    for (const leaf of plot.parts.filter((part) => part.userData.allotmentSurface === 'leaf')) {
      const p = leaf.attributes.position;
      const corners = p.count / 2 - 1;
      expect(leaf.index!.count / 3).toBe(corners * 2);
      // The two skins meet at all boundary points and enclose a real midrib.
      for (let i = 0; i < corners; i++)
        for (let axis = 0; axis < 3; axis++)
          expect(p.getComponent(i, axis)).toBe(p.getComponent(i + corners + 1, axis));
      expect(
        new THREE.Vector3()
          .fromBufferAttribute(p, corners)
          .distanceTo(new THREE.Vector3().fromBufferAttribute(p, corners * 2 + 1))
      ).toBeCloseTo(0.0024, 6);
      const edges = new Map<string, number>();
      const key = (i: number) =>
        [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(7)).join(',');
      for (let i = 0; i < leaf.index!.count; i += 3)
        for (const [a, b] of [
          [0, 1],
          [1, 2],
          [2, 0],
        ]) {
          const edge = [key(leaf.index!.getX(i + a)), key(leaf.index!.getX(i + b))]
            .sort()
            .join('/');
          edges.set(edge, (edges.get(edge) ?? 0) + 1);
        }
      expect([...edges.values()].every((n) => n === 2)).toBe(true);
    }
    if (add === addAllotmentCabbage) {
      const heart = plot.parts[2];
      expect(heart.index!.count / 3).toBe(48);
      heart.computeBoundingBox();
      expect(heart.boundingBox!.min.y).toBeLessThan(0.26);
      expect(heart.boundingBox!.max.y).toBeLessThan(0.61);
      const p = heart.attributes.position,
        n = heart.attributes.normal,
        centre = heart.boundingBox!.getCenter(new THREE.Vector3());
      for (let i = 0; i < p.count; i++)
        expect(
          new THREE.Vector3()
            .fromBufferAttribute(p, i)
            .sub(centre)
            .dot(new THREE.Vector3().fromBufferAttribute(n, i))
        ).toBeGreaterThan(0);
    }
    const g = plot.finish(),
      p = g.attributes.position;
    expect(p.count / 3).toBe(triangles);
    expect(g.boundingBox!.min.y).toBeCloseTo(0.2, 6);
    expect(g.boundingBox!.max.y).toBeLessThanOrEqual(height);
    for (let i = 0; i < p.count; i++) expect(Math.hypot(p.getX(i), p.getZ(i))).toBeLessThan(radius);
    for (const attr of Object.values(g.attributes))
      expect([...attr.array].every(Number.isFinite)).toBe(true);
    for (let i = 0; i < p.count; i++)
      expect(
        Math.hypot(
          g.attributes.normal.getX(i),
          g.attributes.normal.getY(i),
          g.attributes.normal.getZ(i)
        )
      ).toBeCloseTo(1, 5);
    g.dispose();
  }
});

it('varies allotment crops deterministically without spending more village geometry or moving access', () => {
  const signatures = (seed: number) =>
    [addAllotmentCabbage, addAllotmentLeafCrop, addAllotmentBeanLeaves].map((add) => {
      const plot = new PlotGeometry();
      add(plot, [0, 0.2, 0], seed);
      const geometry = plot.finish();
      const signature = createHash('sha256')
        .update(Buffer.from(geometry.attributes.position.array.buffer))
        .update(Buffer.from(geometry.attributes.color.array.buffer))
        .digest('hex');
      geometry.dispose();
      return signature;
    });
  expect(signatures(0.41)).toEqual(signatures(0.41));
  expect(signatures(1.7).every((x, i) => x !== signatures(0.41)[i])).toBe(true);
  const triangles = [
    ...VILLAGE_HOMES.flatMap((h) => [h.body, h.glass, h.garden]),
    VILLAGE_ALLOTMENT_GEOMETRY,
  ].reduce((n, g) => n + g.attributes.position.count / 3, 0);
  expect(triangles).toBeLessThanOrEqual(39994);
  const uv = VILLAGE_ALLOTMENT_GEOMETRY.attributes.uv,
    [left, bottom, right, top] = ALLOTMENT_TILES.crown;
  let crownVertices = 0;
  for (let i = 0; i < uv.count; i++) {
    const x = uv.getX(i) * 256 - 0.5,
      y = uv.getY(i) * 256 - 0.5;
    if (x >= left && x <= right && y >= bottom && y <= top) crownVertices++;
  }
  expect(crownVertices, `Full planted centres, actual whole-village triangles: ${triangles}`).toBe(
    32 * 48 * 3
  );
});

it('plants every centre and edge cell in both four-by-four cabbage beds', () => {
  for (const bedZ of [-0.35, 3.65])
    for (let row = 0; row < 4; row++)
      for (let column = 0; column < 4; column++) {
        const x = -3.875 + column * 0.675,
          z = bedZ - 1.02 + row * 0.68;
        const crown = hit(VILLAGE_ALLOTMENT_GEOMETRY, [x, 1, z], [0, -1, 0], 1)[0];
        expect(crown?.point.y).toBeGreaterThan(0.3);
        expect(crown?.point.y).toBeLessThan(0.63);
      }
});

it('attaches every runner-bean node and both end caps to its actual climbing stem', () => {
  const plot = new PlotGeometry();
  addAllotmentClimber(plot, 3.1);
  expect(plot.parts).toHaveLength(19);
  const stem = plot.parts[0].attributes.position;
  const centres = Array.from({ length: 6 }, (_, row) => {
    const centre = new THREE.Vector3();
    for (let corner = 0; corner < 3; corner++)
      centre.add(new THREE.Vector3().fromBufferAttribute(stem, row * 4 + corner));
    return centre.multiplyScalar(1 / 3);
  });
  expect(centres[0].y).toBeCloseTo(0, 6);
  expect(centres[5].y).toBeCloseTo(1.65, 6);
  let maximumGap = 0;
  for (let i = 3; i < 18; i += 3) {
    const root = new THREE.Vector3().fromBufferAttribute(plot.parts[i].attributes.position, 0);
    const span = (i - 3) / 3;
    const closest = new THREE.Line3(centres[span], centres[span + 1]).closestPointToPoint(
      root,
      true,
      new THREE.Vector3()
    );
    maximumGap = Math.max(maximumGap, closest.distanceTo(root));
  }
  expect(maximumGap).toBeLessThan(0.000001);
  for (const end of [0, 1])
    for (let corner = 0; corner < 3; corner++)
      for (let axis = 0; axis < 3; axis++)
        expect(plot.parts[1 + end].attributes.position.getComponent(corner + 1, axis)).toBe(
          stem.getComponent(end * 5 * 4 + corner, axis)
        );
  const string = plot.parts[18];
  string.computeBoundingBox();
  expect(string.boundingBox!.min.y).toBeCloseTo(0, 6);
  expect(string.boundingBox!.max.y).toBeCloseTo(1.85, 6);
  for (const centre of centres)
    expect(Math.hypot(centre.x - 3.1, centre.z + 4.3)).toBeLessThan(0.01);
  const g = plot.finish();
  expect(g.attributes.position.count / 3).toBe(168);
  g.dispose();
});

it('fielded shutters have closed recessed joinery inside the old 36-triangle allocation', () => {
  for (const side of [-1, 1]) {
    const b = new PlotGeometry();
    addVillageShutter(b, [0, 0, 0], 1.31, '#567363', side);
    const geometry = b.finish();
    expect(geometry.getAttribute('position').count / 3).toBe(36);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    const hit = (x: number, y: number) =>
      new THREE.Raycaster(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1)).intersectObject(
        mesh
      )[0];
    expect(hit(0, 0).point.z).toBeCloseTo(0.0095, 6);
    expect(hit(0.14, 0).point.z).toBeGreaterThan(0.03);
    expect(hit(-side * 0.109, 1.31 * 0.3).point.z).toBeCloseTo(0.061, 6);
    // Every closed shell has consistently outward winding, including each iron pintle.
    const positions = geometry.getAttribute('position');
    for (const [start, end] of [
      [0, 60],
      [60, 84],
      [84, 108],
    ]) {
      let volume = 0;
      const a = new THREE.Vector3(),
        c = new THREE.Vector3(),
        d = new THREE.Vector3();
      for (let i = start; i < end; i += 3) {
        a.fromBufferAttribute(positions, i);
        c.fromBufferAttribute(positions, i + 1);
        d.fromBufferAttribute(positions, i + 2);
        volume += a.dot(c.cross(d)) / 6;
      }
      expect(volume).toBeGreaterThan(0);
    }
    geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
});
