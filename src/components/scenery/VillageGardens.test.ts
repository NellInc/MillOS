import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import {
  addVillageFlower,
  addVillageFoliage,
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

it('retains the measured pre-finish positions and UVs for every civic-baked plot', () => {
  const expected = [
    [
      '604178057aa960d09ac3d99235742abae3e7f37841f77fef3ce7b7d07bf27759',
      '63c5c2da6ac3bcd00794cb9652f1a8791dd4a5edb9bc27b840e299cc9b618c1c',
    ],
    [
      '58878f3dbe581bc21eefe9f8176f21b6352b7abcb3d35fde50c083fc48c318f6',
      'd46b61cfe0e50a2d4039e9c7f9b2bd75def0a0955e52a758f8a95d137545d9cf',
    ],
    [
      '7f26c10b8ea447596985d6929a27f3d2b288ec84e4fee68b3eb4ef8e3b988452',
      '972555e5069ac18ea49efe1c030111a161058b8bf5d754b7f1bb24b73a9062d2',
    ],
    [
      '4b6c7742e504c977a01b3901332ed1b2e6d3d044d599700024a98ad2f394743c',
      '6c11d8c67c40a491f1a5cd31200399ef9f5ee061f8bd6a6045acfbaf3858c5b2',
    ],
    [
      '32c990fd18097bb1d80eb7c4306ae2e14aaf7f387c8178fe686298adcf132870',
      '6455719f5952f307a0a0d7a1692d99413267045e76e00bfe6aa5dd8375379d67',
    ],
    [
      '75de2857d9a07959e9b13f5703f9896088fb646d8658f39fb04fbb142d5387fe',
      '472e41218a61a6accdecfbf3e85d7b0e9d5e9c73126592557d1697cf54f667ed',
    ],
    [
      '5508c7565b869648c968fc5c0aa398c375d1ac4fbb814ddf3ed0e545e39acae4',
      '1b9f06929a62a34610c3a8ab4ce14c732fcadca86b49054feb887db6352b5784',
    ],
    [
      '0e3b36611bb21694e2937379c8e732e2e66e39e141ab598c3c38a966b7f95464',
      'd46b61cfe0e50a2d4039e9c7f9b2bd75def0a0955e52a758f8a95d137545d9cf',
    ],
    [
      'd4f61a5728db394977dcd372f72c70a575c56a80ef52cc3186d02895908838e3',
      '4e5d08838f809aab4a508e427d54526c6470743040cfb501317711794f35b433',
    ],
    [
      'd9eded83198e2a058aa5f9c35bcc0b3987dc1f37c8c193623b8ed747fbcbf040',
      '48bc407053b849ac99ea1bad4cdce062a2ffb9972314f37025ef58074b4b6453',
    ],
    [
      '3a3cda642438e77b89ba59ef0987d54b2a38addcd790cedeaea68540459954c7',
      '6455719f5952f307a0a0d7a1692d99413267045e76e00bfe6aa5dd8375379d67',
    ],
    [
      'b4722921d446482973fb0bde550045802f64705082997fe7de1d6c7b926dbf96',
      '81ba8a9a1451c7dbf9a154feecad9c377c5b0065f0fe983eeb39191eda28b194',
    ],
    [
      '24ceabf9c095f14616ba17baaecc6be6f34984c24b54b4a7457716627924d842',
      '64320250e380394f1b6af18d08609e9c33b8adc97cb0b225eb226d7a76bec07b',
    ],
    [
      '5ade559333214fe102d81f90fe82dfef11824c3545aea0765960062ff1911664',
      'fd07c976a3b0b02d8768c6fba203cf1c2f4d1eb3e350eac0a5043b7e3116ebb6',
    ],
    [
      '1a3aeca4ea534d9436aef11c753d2ea6040aa3350195f461ae80eb92dec8ea7a',
      'c686f6d3c5e336699244c247c9fdeeeafd1e3e912567a275424229246df61d93',
    ],
    [
      '78f31121990a871fd53d029f92a758864a5499afb6711232eb745a1a896e30d4',
      '67fc67fb9f3c0fb5e0f13c8d6a60daf29cefd731d9549e49696cbe5748f85c96',
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
