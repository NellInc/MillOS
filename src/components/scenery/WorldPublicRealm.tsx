import React, { useMemo } from 'react';
import * as THREE from 'three';
import { PlotGeometry } from '../../utils/authoredPlotGeometry';
import { addVillageFlower } from './VillageGardens';
import { CANAL_BOAT_BERTH, SITE_LAYOUT, landmarkLocalToWorld } from '../../constants/siteLayout';
import {
  WORLD_CRAFT_PALETTE as P,
  VILLAGE_REALM_PATHS,
  WORLD_REALM_PATHS,
  WORLD_REALM_PATCHES,
  FARM_REALM_PATHS,
  CANAL_FOOTBRIDGE_ACCESS,
  CANAL_BRIDGE_STEPS,
  type RealmPath,
  type RealmPatch,
} from '../../constants/publicRealmLayout';
import { EXTERIOR_LAYERS, POLYGON_OFFSET } from '../../constants/renderLayers';
import { sampleTerrainGroundHeight } from '../terrain/splatMapGenerator';
import { getTerrainGridSegments } from '../terrain/terrainTypes';
import { useGraphicsStore } from '../../stores/graphicsStore';

type Ground = (x: number, z: number) => number;
const flat: Ground = () => EXTERIOR_LAYERS.ground;
const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 });
export const REALM_PAVING_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.94,
  depthWrite: true,
  polygonOffset: true,
  polygonOffsetFactor: POLYGON_OFFSET.strong.factor,
  polygonOffsetUnits: POLYGON_OFFSET.strong.units,
});

/** Coordinate-seeded tones within the original palettes. Working if adjacent
 * slabs vary gently without a three-row cycle, with no layout or buffer change.
 */
export function realmPavingColour(x: number, z: number, yard = false): string {
  const mix =
    0.38 + 0.28 * (0.5 + 0.5 * Math.sin(x * 1.73 + z * 2.19 + Math.sin(x * 0.17 - z * 0.11)));
  return (
    '#' +
    new THREE.Color(yard ? '#9a8b71' : '#a39e8d')
      .lerp(new THREE.Color(yard ? '#a4967a' : P.paving), mix)
      .getHexString()
  );
}

/** Restrained construction-family ageing in existing vertex colours only.
 * Working if brick/stone/timber/iron vary deterministically, planting is exact,
 * and every collision/shadow position, normal, UV and index buffer stays exact.
 */
export function finishRealmSurface(geometry: THREE.BufferGeometry) {
  if (geometry.userData.realmFinish) return geometry;
  const colours = geometry.getAttribute('color'),
    p = geometry.getAttribute('position'),
    n = geometry.getAttribute('normal');
  const families = [
    [P.oak, 0.07],
    [P.stone, 0.045],
    [P.brick, 0.05],
    [P.iron, 0.035],
  ] as const;
  const palette = families.map(([hex, variation]) => ({ base: new THREE.Color(hex), variation }));
  const shade = new THREE.Color();
  for (let i = 0; i < colours.count; i++) {
    const family = palette.find(
      ({ base }) =>
        Math.abs(colours.getX(i) - base.r) +
          Math.abs(colours.getY(i) - base.g) +
          Math.abs(colours.getZ(i) - base.b) <
        1e-6
    );
    if (!family) continue;
    const patch = Math.sin(p.getX(i) * 0.87 + p.getZ(i) * 0.61 + Math.sin(p.getY(i) * 2.1));
    shade
      .copy(family.base)
      .multiplyScalar(0.97 + patch * family.variation * 0.6 + n.getY(i) * 0.02);
    colours.setXYZ(i, shade.r, shade.g, shade.b);
  }
  geometry.userData.realmFinish = true;
  return geometry;
}

// Finite, metre-sized paving. Each surface is tessellated against the same
// rendered terrain grid, rather than hovering over a hill or cutting through it.
function patch(
  b: PlotGeometry,
  x: number,
  z: number,
  width: number,
  depth: number,
  colour: string,
  ground: Ground = flat
) {
  const g = new THREE.PlaneGeometry(
    width,
    depth,
    Math.max(1, Math.ceil(width / 1.5)),
    Math.max(1, Math.ceil(depth / 1.5))
  );
  g.rotateX(-Math.PI / 2).translate(x, 0, z);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, ground(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  b.add(g, colour);
}
// World paths are axis-aligned. Cut tiles around courts and previously laid
// paths, including partial-width intersections, rather than stacking finishes.
// Working if rays at both quays and path junctions find one paving surface.
function outsideFinishedSurfaces(tile: THREE.PlaneGeometry, courts: readonly RealmPatch[]) {
  if (!courts.length) return [tile];
  tile.computeBoundingBox();
  const bounds = tile.boundingBox!;
  let rectangles = [[bounds.min.x, bounds.max.x, bounds.min.z, bounds.max.z]];
  for (const court of courts) {
    rectangles = rectangles.flatMap(([x0, x1, z0, z1]) => {
      const left = Math.max(x0, court.x - court.halfX),
        right = Math.min(x1, court.x + court.halfX),
        front = Math.max(z0, court.z - court.halfZ),
        back = Math.min(z1, court.z + court.halfZ);
      if (left >= right || front >= back) return [[x0, x1, z0, z1]];
      return [
        [x0, x1, z0, front],
        [x0, x1, back, z1],
        [x0, left, front, back],
        [right, x1, front, back],
      ].filter(([a, b, c, d]) => b - a > 1e-6 && d - c > 1e-6);
    });
  }
  tile.dispose();
  return rectangles.map(([x0, x1, z0, z1]) =>
    new THREE.PlaneGeometry(x1 - x0, z1 - z0)
      .rotateX(-Math.PI / 2)
      .translate((x0 + x1) / 2, 0, (z0 + z1) / 2)
  );
}
function route(
  b: PlotGeometry,
  path: RealmPath,
  ground: Ground = flat,
  yard = false,
  courts: readonly RealmPatch[] = []
) {
  const dx = path.end[0] - path.start[0],
    dz = path.end[1] - path.start[1];
  const length = Math.hypot(dx, dz),
    angle = Math.atan2(dx, dz);
  const n = Math.ceil(length / 1.2),
    pitch = length / n;
  // Colour variation supplies joints with no individual tile meshes or textures.
  for (let i = 0; i < n; i++)
    for (let side = -1; side <= 1; side++) {
      const along = (i + 0.5) * pitch,
        across = (side * path.width) / 3;
      const x = path.start[0] + Math.sin(angle) * along + Math.cos(angle) * across,
        z = path.start[1] + Math.cos(angle) * along - Math.sin(angle) * across;
      const colour = realmPavingColour(x, z, yard);
      const g = new THREE.PlaneGeometry(path.width / 3 - 0.014, pitch - 0.014, 1, 1)
        .rotateX(-Math.PI / 2)
        .rotateY(angle)
        .translate(
          path.start[0] + Math.sin(angle) * along + Math.cos(angle) * across,
          0,
          path.start[1] + Math.cos(angle) * along - Math.sin(angle) * across
        );
      for (const tile of outsideFinishedSurfaces(g, courts)) {
        const p = tile.getAttribute('position');
        for (let j = 0; j < p.count; j++) p.setY(j, ground(p.getX(j), p.getZ(j)));
        tile.computeVertexNormals();
        b.add(tile, colour);
      }
    }
}
function wall(
  b: PlotGeometry,
  a: readonly [number, number],
  c: readonly [number, number],
  height = 0.65,
  ground: Ground = flat
) {
  const dx = c[0] - a[0],
    dz = c[1] - a[1],
    length = Math.hypot(dx, dz),
    yaw = Math.atan2(dx, dz);
  const count = Math.ceil(length / 2);
  const levels = Array.from({ length: count }, (_, i) =>
    ground(a[0] + (dx * (i + 0.5)) / count, a[1] + (dz * (i + 0.5)) / count)
  );
  const level = levels.every((y) => y === levels[0]);
  // Adjacent level brick boxes overlap by 4 mm. Their union is one identical
  // solid; remove those buried ends, retaining every segmented coping gap.
  // Working if exterior rays keep the old outline while detail fits the cap.
  if (level)
    b.box(
      [0.36, height, length + 0.004],
      [(a[0] + c[0]) / 2, levels[0] + height / 2, (a[1] + c[1]) / 2],
      P.brick,
      yaw
    );
  for (let i = 0; i < count; i++) {
    const x = a[0] + (dx * (i + 0.5)) / count,
      z = a[1] + (dz * (i + 0.5)) / count;
    const y = ground(x, z);
    if (!level) b.box([0.36, height, length / count + 0.004], [x, y + height / 2, z], P.brick, yaw);
    b.box([0.48, 0.11, length / count - 0.014], [x, y + height + 0.055, z], P.stone, yaw);
  }
  for (const [x, z] of [a, c]) {
    const y = ground(x, z);
    b.box([0.5, height + 0.18, 0.5], [x, y + (height + 0.18) / 2, z], P.brick);
    b.box([0.61, 0.12, 0.61], [x, y + height + 0.24, z], P.stone);
  }
}
function planter(
  b: PlotGeometry,
  x: number,
  z: number,
  width: number,
  depth: number,
  ground: Ground = flat
) {
  const y = ground(x, z);
  b.box([width, 0.26, depth], [x, y + 0.13, z], P.brick);
  b.box([width - 0.17, 0.035, depth - 0.17], [x, y + 0.282, z], P.soil);
  for (const side of [-1, 1]) {
    b.box([width, 0.06, 0.11], [x, y + 0.29, z + (side * depth) / 2], P.stone);
  }
  // Finish all four sides, keeping the original footprint and soil datum.
  // Working if the end coping closes the bed and real stems rise from its soil.
  for (const side of [-1, 1])
    b.box([0.11, 0.06, depth - 0.11], [x + (side * (width - 0.11)) / 2, y + 0.29, z], P.stone);
  const count = Math.max(2, Math.floor(width / 0.55));
  const blooms = ['#d77589', '#dfae4d', '#b694c7'];
  const palette = Math.abs(Math.floor(x * 3 + z * 7)) % blooms.length;
  for (let i = 0; i < count; i++) {
    const px = x - width / 2 + 0.35 + (i * (width - 0.7)) / (count - 1);
    const pz = z + Math.sin(x + z + i) * Math.min(depth * 0.12, 0.24);
    // Three closed, ridged leaves use 18 faces, replacing the old 20-face mound.
    // Their soil-seated tips stay inside the rim even on the narrow farm beds.
    for (let leaf = 0; leaf < 3; leaf++) {
      const reach = Math.min(depth * 0.23, 0.31) * (0.82 + leaf * 0.08);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [
            0,
            0,
            0,
            -0.09,
            0.14,
            reach * 0.52,
            0,
            0.18,
            reach * 0.52,
            0.09,
            0.14,
            reach * 0.52,
            0,
            0.27,
            reach,
          ],
          3
        )
      );
      geometry.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute([0.5, 0, 0, 0.52, 0.5, 0.52, 1, 0.52, 0.5, 1], 2)
      );
      geometry.setIndex([0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 4, 3, 0, 4, 1, 0, 3, 4]);
      geometry.computeVertexNormals();
      geometry.rotateY((leaf * Math.PI * 2) / 3 + x + z + i).translate(px, y + 0.2995, pz);
      b.add(geometry, P.leaf);
    }
    if (i % 2 === 0) {
      addVillageFlower(b, px, y + 0.2995, pz, blooms[(palette + i / 2) % blooms.length], 0.16);
    }
  }
}
function bench(b: PlotGeometry, x: number, z: number, yaw = 0, ground: Ground = flat) {
  const start = b.parts.length;
  // Open timber slats share the same seat/resting datums and iron supports.
  for (const z of [-0.18, 0, 0.18]) b.box([1.8, 0.1, 0.14], [0, 0.49, z], P.oak);
  for (const y of [0.64, 0.81, 0.98]) b.box([1.8, 0.12, 0.075], [0, y, -0.24], P.oak);
  for (const side of [-1, 1]) {
    b.box([0.075, 0.6, 0.075], [side * 0.66, 0.72, -0.25], P.iron);
    b.box([0.08, 0.075, 0.5], [side * 0.82, 0.73, 0], P.iron);
    b.box([0.075, 0.24, 0.075], [side * 0.82, 0.61, 0.16], P.iron);
  }
  for (const side of [-1, 1]) b.box([0.11, 0.46, 0.44], [side * 0.66, 0.23, 0], P.iron);
  b.parts.slice(start).forEach((g) => g.rotateY(yaw).translate(x, ground(x, z), z));
}
function drain(
  b: PlotGeometry,
  x: number,
  z: number,
  length: number,
  yaw = 0,
  ground: Ground = flat
) {
  const start = b.parts.length;
  b.box([0.22, 0.025, length], [0, 0.004, 0], P.iron);
  for (let i = 0; i < Math.floor(length / 0.45); i++)
    b.box([0.2, 0.016, 0.045], [0, 0.025, -length / 2 + 0.16 + i * 0.45], P.slate);
  b.parts.slice(start).forEach((g) => g.rotateY(yaw).translate(x, ground(x, z), z));
}

function villageRealm() {
  const paving = new PlotGeometry(),
    solid = new PlotGeometry();
  VILLAGE_REALM_PATHS.forEach((p) => route(paving, p));
  // Shop thresholds and square margins bring the frontages into one civic room.
  for (const z of [-10, 5]) patch(paving, 16.2, z, 2.5, 6.3, P.paving);
  patch(paving, -16.2, 30, 2.3, 6.2, P.paving);
  for (const x of [-14.8, 14.8]) {
    patch(paving, x, 4, 0.35, 29, P.brick);
    drain(solid, x, 4, 20);
  }
  patch(paving, 0, -10.65, 29.7, 0.36, P.brick);
  patch(paving, 0, 10.5, 12.8, 1.4, P.paving);
  // A calm central rectangle frames the fountain and markets, with open ends.
  for (const z of [-0.7, 12.6]) patch(paving, 0, z, 23, 0.32, P.stone);
  for (const x of [-11.5, 11.5]) patch(paving, x, 5.95, 0.32, 13, P.stone);
  // Churchyard enclosure. Broad gate aligns with the actual front portal.
  wall(solid, [-9.4, -50.6], [-9.4, -29], 0.68);
  wall(solid, [9.4, -50.6], [9.4, -29], 0.68);
  wall(solid, [-9.4, -50.6], [9.4, -50.6], 0.68);
  wall(solid, [-9.4, -29], [-2.4, -29], 0.68);
  wall(solid, [2.4, -29], [9.4, -29], 0.68);
  for (const x of [-7.65, 7.65]) {
    planter(solid, x, -32.2, 1.8, 2.3);
    bench(solid, x, -38, x < 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  // Pub courtyard at its street-facing side, with a gap to the entrance.
  patch(paving, -18.45, -15, 3, 13.5, P.paving);
  wall(solid, [-32.1, -22.1], [-18, -22.1], 0.52);
  wall(solid, [-32.1, -7.9], [-18, -7.9], 0.52);
  wall(solid, [-32.1, -22.1], [-32.1, -7.9], 0.52);
  for (const z of [-20.5, -9.5]) {
    planter(solid, -19.1, z, 2, 1);
    bench(solid, -18.7, z + (z < -15 ? 1.25 : -1.25), Math.PI / 2);
  }
  // School's front playground and boundary, clear of the adjacent cottage.
  patch(paving, 15.2, 40, 2.1, 10.8, P.paving);
  wall(solid, [14.1, 32.1], [29, 32.1], 0.44);
  wall(solid, [14.1, 47.9], [29, 47.9], 0.44);
  wall(solid, [29, 32.1], [29, 47.9], 0.44);
  planter(solid, 26.5, 33, 2.1, 0.95);
  planter(solid, 26.5, 47, 2.1, 0.95);
  // Cross-fall drains finish the entrances, flush with the existing paving;
  // the centre of each civic approach remains free of raised street furniture.
  drain(solid, 0, -30.0, 4.0, Math.PI / 2);
  drain(solid, -17.75, -15, 2.2);
  drain(solid, 14.4, 40, 2.4);
  // Square planting occupies edges, with no planters in through streets.
  for (const x of [-6.4, 6.4]) planter(solid, x, -9.4, 2.7, 1.1);
  for (const z of [-16, 9.8]) planter(solid, 17.1, z, 1.15, 1.1);
  return { paving: paving.finish(), solid: finishRealmSurface(solid.finish()) };
}
export const VILLAGE_REALM_GEOMETRY = villageRealm();

// One placement datum drives the actual hull and both measured fitting endpoints.
export const CANAL_MOORING_LINES = CANAL_BOAT_BERTH.lines.map((line) => ({
  cleat: [
    CANAL_BOAT_BERTH.position[0] + line.cleat[0],
    CANAL_BOAT_BERTH.position[1] - CANAL_BOAT_BERTH.keelSink + line.cleat[1],
    CANAL_BOAT_BERTH.position[2] + line.cleat[2],
  ] as const,
  ring: line.eye,
}));

export function canalMooringCurve(line: (typeof CANAL_MOORING_LINES)[number]) {
  const start = new THREE.Vector3(...line.cleat),
    end = new THREE.Vector3(...line.ring);
  const middle = start.clone().lerp(end, 0.5);
  middle.y = Math.min(start.y, end.y) - 0.45;
  return new THREE.QuadraticBezierCurve3(start, middle, end);
}

/** A restrained cord lay in the retained tube's albedo, sampled along metres.
 * Working if the seam closes, actual colour varies and every shape/normal/UV/
 * index stays exact. No map, shader, extra draw or animation is introduced.
 */
export function canalMooringGeometry(line: (typeof CANAL_MOORING_LINES)[number]) {
  const curve = canalMooringCurve(line);
  const geometry = new THREE.TubeGeometry(curve, 14, 0.023, 5, false);
  const uv = geometry.getAttribute('uv'),
    base = new THREE.Color('#af9970'),
    values = new Float32Array(uv.count * 3),
    length = curve.getLength();
  for (let i = 0; i < uv.count; i++) {
    const phase = Math.PI * 2 * (uv.getY(i) + (uv.getX(i) * length) / 0.6);
    const tone = 0.96 + Math.cos(phase) * 0.12;
    values[i * 3] = base.r * tone;
    values[i * 3 + 1] = base.g * tone;
    values[i * 3 + 2] = base.b * tone;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return geometry;
}

/**
 * The village's own paths, as world rectangles. Its east paths run out to
 * village-local x 36.8, across the west world path at x -155.3; the world path
 * is cut around them like any court, so each junction has one paving surface
 * instead of two at the same datum and bias.
 */
function villagePathsInWorld(): RealmPatch[] {
  const [ox, , oz] = landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, [0, 0, 0]);
  return VILLAGE_REALM_PATHS.map((p) => {
    const horizontal = p.start[1] === p.end[1];
    return {
      x: ox + (p.start[0] + p.end[0]) / 2,
      z: oz + (p.start[1] + p.end[1]) / 2,
      halfX: Math.abs(p.end[0] - p.start[0]) / 2 + (horizontal ? 0 : p.width / 2),
      halfZ: Math.abs(p.end[1] - p.start[1]) / 2 + (horizontal ? p.width / 2 : 0),
    };
  });
}

export function createWorldRealm(segments: number) {
  const ground: Ground = (x, z) =>
    EXTERIOR_LAYERS.ground + sampleTerrainGroundHeight(x, z, segments);
  const paving = new PlotGeometry(),
    solid = new PlotGeometry();
  const finished: RealmPatch[] = [...WORLD_REALM_PATCHES, ...villagePathsInWorld()];
  for (const p of WORLD_REALM_PATHS) {
    route(paving, p, ground, false, finished);
    const horizontal = p.start[1] === p.end[1];
    finished.push({
      x: (p.start[0] + p.end[0]) / 2,
      z: (p.start[1] + p.end[1]) / 2,
      halfX: Math.abs(p.end[0] - p.start[0]) / 2 + (horizontal ? 0 : p.width / 2),
      halfZ: Math.abs(p.end[1] - p.start[1]) / 2 + (horizontal ? p.width / 2 : 0),
    });
  }
  for (const r of WORLD_REALM_PATCHES)
    patch(paving, r.x, r.z, r.halfX * 2, r.halfZ * 2, P.paving, ground);
  const bridge = CANAL_FOOTBRIDGE_ACCESS;
  // Painted timber joinery follows the delivered GLB's ten post stations,
  // including its 20 mm local offset. The old brown rail becomes a middle rail.
  // Working if real-model rays seat every sleeve and the 2.14 m walking strip stays open.
  const centre = (bridge.minX + bridge.maxX) / 2;
  const posts = [
    bridge.minX + 0.02,
    ...Array.from({ length: 10 }, (_, i) => centre - 6.5 + i * 1.5),
  ];
  const paint = '#dedbc8';
  for (const side of [-1, 1]) {
    const z = bridge.z + side * 1.4;
    for (const x of posts) {
      solid.box([0.13, 1, 0.13], [x, bridge.deckY + 0.5, z], paint);
      solid.box([0.2, 0.05, 0.2], [x, bridge.deckY + 1.025, z], P.oak);
      solid.add(
        new THREE.CylinderGeometry(0, 0.14, 0.07, 4)
          .rotateY(Math.PI / 4)
          .translate(x, bridge.deckY + 1.085, z),
        P.oak
      );
    }
    solid.box(
      [posts.at(-1)! - posts[0] + 0.13, 0.11, 0.13],
      [(posts[0] + posts.at(-1)!) / 2, bridge.deckY + 0.945, z],
      paint
    );
    solid.box(
      [posts.at(-1)! - posts[0], 0.065, 0.08],
      [(posts[0] + posts.at(-1)!) / 2, bridge.deckY + 0.105, z],
      paint
    );
    for (let i = 0; i < posts.length - 1; i++) {
      const a = posts[i] + 0.035,
        b = posts[i + 1] - 0.035;
      solid.beam(
        [a, bridge.deckY + 0.13, z - side * 0.034],
        [b, bridge.deckY + 0.86, z - side * 0.034],
        0.06,
        paint
      );
      solid.beam(
        [a, bridge.deckY + 0.86, z + side * 0.034],
        [b, bridge.deckY + 0.13, z + side * 0.034],
        0.06,
        paint
      );
    }
  }
  for (const step of CANAL_BRIDGE_STEPS) {
    const x = (step.minX + step.maxX) / 2;
    solid.box(
      [step.maxX - step.minX, step.top + 0.02 - 0.06, bridge.halfWidth * 2],
      [x, (step.top - 0.06 - 0.02) / 2, bridge.z],
      P.brick
    );
    solid.box(
      [step.maxX - step.minX, 0.06, bridge.halfWidth * 2],
      [x, step.top - 0.03, bridge.z],
      P.stone
    );
  }
  for (const edge of [bridge.minX, bridge.maxX]) {
    const side = edge === bridge.minX ? -1 : 1;
    const outer = edge + side * bridge.steps * bridge.going;
    for (const z of [bridge.z - 1.39, bridge.z + 1.39]) {
      solid.beam([outer, 0.97, z], [edge, bridge.deckY + 0.9, z], 0.075, P.iron);
      for (const t of [0, 0.5, 1]) {
        const x = outer + (edge - outer) * t;
        const top = 0.97 + (bridge.deckY + 0.9 - 0.97) * t;
        const base =
          CANAL_BRIDGE_STEPS.find((s) => x >= s.minX - 1e-6 && x <= s.maxX + 1e-6)?.top ??
          bridge.deckY;
        solid.box([0.075, top - base, 0.075], [x, (top + base) / 2, z], P.iron);
      }
    }
  }
  // Interrupted towpath edging. Access points and the bridge are deliberately open.
  for (const [a, c] of [
    [-84, -62],
    [-46, 8],
    [24, 54],
    [65, 83],
  ] as const)
    wall(solid, [-156.3, a], [-156.3, c], 0.22, ground);
  for (const z of [14, 23]) planter(solid, -159, z, 2, 1, ground);
  // Low apron borders belong behind the station parking, never across its access.
  for (const [a, c] of [
    [-109, -101],
    [-92.9, -81],
  ] as const)
    wall(solid, [a, 123.75], [c, 123.75], 0.38, ground);
  for (const x of [-103, -91, -57, -33]) planter(solid, x, 123.75, 2.4, 1.3, ground);
  wall(solid, [-53, 118.2], [-47, 118.2], 0.25, ground);
  wall(solid, [-43, 118.2], [-37, 118.2], 0.25, ground);
  drain(solid, -80.2, 132.5, 6, Math.PI / 2, ground);
  // A finished quay uses actual coping-level rings; no decorative floating docks.
  for (const z of [9, 21]) {
    const g = new THREE.TorusGeometry(0.16, 0.045, 5, 10)
      .rotateX(Math.PI / 2)
      .translate(-151.1, 1.07, z);
    solid.add(g, P.iron);
    // Iron eyes are fixed to a stone coping plate, with visible anchor bolts.
    solid.box([0.5, 0.035, 0.48], [-151.1, 1.025, z], P.slate);
    for (const side of [-1, 1])
      solid.round([-151.1 + side * 0.19, 1.049, z], [0.035, 0.018, 0.035], P.iron);
  }
  for (const line of CANAL_MOORING_LINES) {
    solid.parts.push(canalMooringGeometry(line));
  }
  return { paving: paving.finish(), solid: finishRealmSurface(solid.finish()) };
}
/** A cultivated sheet at the existing ground datum, inside the reserved field.
 * Metre-scale drill bands share vertices with the headland, so there are no
 * stacked coplanar strips or raised ridges burying the unchanged cereal roots.
 * Working if the actual 300 planting roots ray-hit soil, rounded corners stay
 * inside the crop reserve, and a single finite merged surface supplies the bed.
 */
export function createFarmCultivationGeometry(): THREE.BufferGeometry {
  const columns = 80,
    rows = 2;
  const geometry = new THREE.PlaneGeometry(33.5, 24, columns, rows);
  geometry.rotateX(-Math.PI / 2).translate(-0.75, EXTERIOR_LAYERS.ground, -42.4);
  const position = geometry.getAttribute('position');
  const colours = new Float32Array(position.count * 3);
  const soil = new THREE.Color('#79634a'),
    dry = new THREE.Color('#968064');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      z = position.getZ(i);
    // Ease only the outer corners. The entire planting envelope remains inside.
    const corner = Math.max(0, Math.abs(z + 42.4) - 10.4) / 1.6;
    const u = (x + 0.75) / 16.75;
    position.setX(i, x - u * Math.pow(Math.abs(u), 7) * corner * corner * 0.85);
    const edge = Math.min(1, Math.max(Math.abs(u), Math.abs(z + 42.4) / 12));
    const drill = 0.5 + 0.5 * Math.cos((x / 1.5) * Math.PI * 2);
    const headland = THREE.MathUtils.smoothstep(edge, 0.82, 1);
    const variation = 0.5 + 0.5 * Math.sin(x * 0.49 + z * 0.57 + Math.sin(z * 0.21));
    const mix = (0.15 + drill * 0.3) * (1 - headland) + headland * 0.51;
    soil
      .clone()
      .lerp(dry, mix)
      .multiplyScalar(0.96 + variation * 0.07)
      .toArray(colours, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
function farmRealm() {
  const paving = new PlotGeometry(),
    solid = new PlotGeometry();
  FARM_REALM_PATHS.forEach((p) => route(paving, p, flat, true));
  paving.parts.push(createFarmCultivationGeometry());
  // A gravel shoulder joins the barn court to the working track and windmill.
  patch(paving, 5.3, -8.4, 8.7, 1.8, '#9a8b71');
  wall(solid, [5.7, -10.5], [5.7, -26.4], 0.28);
  wall(solid, [10.3, -10.5], [10.3, -13.5], 0.28);
  wall(solid, [10.3, -16.5], [10.3, -26.4], 0.28);
  // The farmhouse threshold has a low herb border, outside the animal paddock.
  planter(solid, -19.9, 12, 1.1, 3.6);
  planter(solid, -19.9, 18, 1.1, 3.6);
  drain(solid, 8, -27.3, 3.4, Math.PI / 2);
  return { paving: paving.finish(), solid: finishRealmSurface(solid.finish()) };
}
export const FARM_REALM_GEOMETRY = farmRealm();
function Realm({
  name,
  geometry,
}: {
  name: string;
  geometry: { paving: THREE.BufferGeometry; solid: THREE.BufferGeometry };
}) {
  return (
    <group name={name} dispose={null}>
      <mesh
        name={`${name}-paving`}
        geometry={geometry.paving}
        material={REALM_PAVING_MATERIAL}
        receiveShadow
      />
      <mesh
        name={`${name}-joinery`}
        geometry={geometry.solid}
        material={material}
        castShadow
        receiveShadow
      />
    </group>
  );
}
export const VillagePublicRealm = React.memo(() => (
  <Realm name="village-public-realm" geometry={VILLAGE_REALM_GEOMETRY} />
));
export const FarmPublicRealm = React.memo(() => (
  <Realm name="farm-public-realm" geometry={FARM_REALM_GEOMETRY} />
));
export function WorldPublicRealm() {
  const quality = useGraphicsStore((s) => s.graphics.quality);
  const segments = getTerrainGridSegments(quality);
  const geometry = useMemo(() => createWorldRealm(segments), [segments]);
  React.useEffect(
    () => () => {
      geometry.paving.dispose();
      geometry.solid.dispose();
    },
    [geometry]
  );
  return <Realm name="world-public-realm" geometry={geometry} />;
}
